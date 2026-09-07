"""
SafeRoute AI: Community Incident Corroboration & Dynamic Hazard Engine.

Implements the research document's incident verification architecture:
1. Two-Stage Peer Corroboration:
   - Same incident_type within 200m spatial radius and 30-minute temporal window.
   - Unverified reports apply 0.2 impact factor; verified reports apply 1.0 impact factor.
2. Exponential Time-Decay:
   - H(grid, t) = sum(Severity_i * ImpactFactor_i * exp(-lambda * delta_t_minutes))
   - lambda = 0.0115 (50% decay after 60 min, near zero after 6 hours, expires after 12 hours).
3. Anti-Flooding Defense & Proximity Gating:
   - Max 5 reports per user per 60 minutes.
   - Reporter coordinate must be within 150m of the incident coordinate.
4. Privacy-Preserving 250m Spatial Aggregation.
"""
import math
import sqlite3
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

# Decay constant from research document (calibrated for 50% decay at 60 mins)
DEFAULT_DECAY_LAMBDA: float = 0.0115
MAX_HOURLY_REPORTS_PER_USER: int = 5
PEER_RADIUS_METERS: float = 200.0
PEER_WINDOW_MINUTES: float = 30.0
PROXIMITY_GATE_METERS: float = 150.0
EXPIRY_HOURS: float = 12.0

DEFAULT_DB_PATH = Path(os.environ.get('SAFEROUTE_INCIDENT_DB', str(Path(__file__).resolve().parent.parent / "data" / "incidents.db")))


# Reuse canonical Haversine helper from validator.py (no duplication)
from backend.routing.validator import haversine_distance_meters
from backend.scoring.context import pune_now


class HazardSnapshot:
    """One read per route request, with indexed nearby hazard queries in memory."""
    def __init__(self, records=(), now=None):
        from scipy.spatial import cKDTree
        self.records = list(records)
        self.now = now or pune_now().replace(tzinfo=None)
        self.tree = cKDTree([(r[0] * 111000, r[1] * 105000) for r in self.records]) if self.records else None

    def score(self, lat, lon):
        if self.tree is None:
            return 0.0
        total = 0.0
        for i in self.tree.query_ball_point((lat * 111000, lon * 105000), 255):
            rlat, rlon, severity, status, timestamp = self.records[i]
            if haversine_distance_meters(lat, lon, rlat, rlon) > 250:
                continue
            elapsed = (self.now - datetime.strptime(timestamp, '%Y-%m-%d %H:%M:%S')).total_seconds() / 60
            if 0 <= elapsed < 720:
                impact = 1.0 if status in ('preliminary_verified', 'verified') else .2
                total += severity * impact * math.exp(-DEFAULT_DECAY_LAMBDA * elapsed)
        return total


def active_hazard_snapshot(db_path=None, now=None):
    now = now or pune_now().replace(tzinfo=None)
    path = db_path or DEFAULT_DB_PATH
    if not path.exists():
        return HazardSnapshot(now=now)
    with sqlite3.connect(str(path)) as conn:
        records = conn.execute('''SELECT latitude, longitude, severity, status, reported_at
            FROM community_incidents WHERE reported_at > ? AND reported_at <= ? AND status != 'expired' ''',
            ((now-timedelta(hours=12)).strftime('%Y-%m-%d %H:%M:%S'), now.strftime('%Y-%m-%d %H:%M:%S'))).fetchall()
    return HazardSnapshot(records, now)


def init_incident_db(db_path: Optional[Path] = None) -> None:
    """Initializes the SQLite schema for community incidents."""
    path = db_path or DEFAULT_DB_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(str(path)) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS community_incidents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                incident_type TEXT NOT NULL,
                severity INTEGER NOT NULL,
                description TEXT,
                reported_by TEXT NOT NULL,
                reported_at DATETIME NOT NULL,
                status TEXT DEFAULT 'unverified',
                corroboration_count INTEGER DEFAULT 1,
                last_corroborated_at DATETIME
            );
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_spatial_temporal 
            ON community_incidents (latitude, longitude, reported_at, status);
        """)
        conn.commit()


def submit_incident(
    latitude: float,
    longitude: float,
    incident_type: str,
    severity: int,
    reported_by: str,
    description: str = "",
    reporter_lat: Optional[float] = None,
    reporter_lon: Optional[float] = None,
    reported_at: Optional[datetime] = None,
    db_path: Optional[Path] = None
) -> Dict[str, Any]:
    """
    Submits a community incident with:
    1. Token-based rate limiting (max 5 per hour).
    2. Proximity gating (reporter within 150m of incident).
    3. Two-stage peer corroboration (within 200m and 30 minutes).
    """
    path = db_path or DEFAULT_DB_PATH
    init_incident_db(path)

    if not all(math.isfinite(v) for v in (latitude, longitude)) or not (1 <= severity <= 5):
        return {'status': 'rejected', 'reason': 'invalid_input', 'message': 'Valid coordinates and severity 1â€“5 are required.'}

    now = reported_at or pune_now().replace(tzinfo=None)
    now_str = now.strftime("%Y-%m-%d %H:%M:%S")

    # 1. Proximity gating: Reporter must be within 150m of reported incident coordinate
    if reporter_lat is not None and reporter_lon is not None:
        user_dist = haversine_distance_meters(latitude, longitude, reporter_lat, reporter_lon)
        if user_dist > PROXIMITY_GATE_METERS:
            return {
                "status": "rejected",
                "reason": "proximity_gating_failed",
                "message": f"Report location is {user_dist:.1f}m away from your GPS location. Max allowed distance is {PROXIMITY_GATE_METERS}m."
            }

    with sqlite3.connect(str(path)) as conn:
        conn.execute('BEGIN IMMEDIATE')
        cursor = conn.cursor()

        # 2. Flooding Defense: Max 5 reports per user per 60 minutes
        one_hour_ago = (now - timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute(
            "SELECT COUNT(*) FROM community_incidents WHERE reported_by = ? AND reported_at > ?",
            (reported_by, one_hour_ago)
        )
        recent_count = cursor.fetchone()[0]
        if recent_count >= MAX_HOURLY_REPORTS_PER_USER:
            return {
                "status": "rejected",
                "reason": "rate_limit_exceeded",
                "message": f"Rate limit exceeded: Maximum {MAX_HOURLY_REPORTS_PER_USER} reports allowed per hour."
            }

        # 3. Two-Stage Peer Corroboration Query
        thirty_mins_ago = (now - timedelta(minutes=PEER_WINDOW_MINUTES)).strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute("""
            SELECT id, latitude, longitude, status, corroboration_count
            FROM community_incidents
            WHERE incident_type = ? 
              AND reported_at >= ?
              AND reported_at <= ?
              AND reported_by != ?
              AND status != 'expired'
        """, (incident_type, thirty_mins_ago, now_str, reported_by))
        candidates = cursor.fetchall()

        is_corroborated = False
        target_peer_id = None

        for peer_id, p_lat, p_lon, p_status, p_count in candidates:
            dist = haversine_distance_meters(latitude, longitude, p_lat, p_lon)
            if dist <= PEER_RADIUS_METERS:
                is_corroborated = True
                target_peer_id = peer_id
                break

        if is_corroborated:
            status = "preliminary_verified"
            corrob_count = 2
            cursor.execute("""
                INSERT INTO community_incidents 
                (latitude, longitude, incident_type, severity, description, reported_by, reported_at, status, corroboration_count, last_corroborated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (latitude, longitude, incident_type, severity, description, reported_by, now_str, status, corrob_count, now_str))
            new_id = cursor.lastrowid

            # Upgrade peer report as well
            cursor.execute("""
                UPDATE community_incidents
                SET status = 'preliminary_verified', corroboration_count = corroboration_count + 1, last_corroborated_at = ?
                WHERE id = ?
            """, (now_str, target_peer_id))
        else:
            status = "unverified"
            corrob_count = 1
            cursor.execute("""
                INSERT INTO community_incidents 
                (latitude, longitude, incident_type, severity, description, reported_by, reported_at, status, corroboration_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (latitude, longitude, incident_type, severity, description, reported_by, now_str, status, corrob_count))
            new_id = cursor.lastrowid

        conn.commit()

    return {
        "status": "success",
        "id": new_id,
        "verification_state": status,
        "is_corroborated": is_corroborated,
        "corroboration_count": corrob_count,
        "message": f"Incident logged successfully as {status}."
    }


def calculate_dynamic_hazard(
    latitude: float,
    longitude: float,
    current_time: Optional[datetime] = None,
    decay_lambda: float = DEFAULT_DECAY_LAMBDA,
    search_radius_meters: float = 250.0,
    db_path: Optional[Path] = None
) -> Dict[str, Any]:
    """
    Calculates dynamic decayed hazard score H(grid, t) for a coordinate:
    H(grid, t) = sum(Severity_i * ImpactFactor_i * exp(-lambda * delta_t_min))
    Where:
    - ImpactFactor = 1.0 (verified) or 0.2 (unverified)
    - delta_t_min = minutes elapsed since reported_at
    - Reports older than 12 hours (720 min) are ignored
    """
    path = db_path or DEFAULT_DB_PATH
    if not path.exists():
        return {"hazard_score": 0.0, "active_incidents": 0, "incidents": []}

    now = current_time or pune_now().replace(tzinfo=None)
    twelve_hours_ago = (now - timedelta(hours=EXPIRY_HOURS)).strftime("%Y-%m-%d %H:%M:%S")

    total_hazard = 0.0
    active_incidents = []

    with sqlite3.connect(str(path)) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, latitude, longitude, incident_type, severity, status, reported_at
            FROM community_incidents
            WHERE reported_at >= ? AND reported_at <= ? AND status != 'expired'
        """, (twelve_hours_ago, now.strftime('%Y-%m-%d %H:%M:%S')))
        records = cursor.fetchall()

    for inc_id, lat, lon, inc_type, severity, status, rep_str in records:
        dist = haversine_distance_meters(latitude, longitude, lat, lon)
        if dist <= search_radius_meters:
            rep_dt = datetime.strptime(rep_str, "%Y-%m-%d %H:%M:%S")
            delta_min = max(0.0, (now - rep_dt).total_seconds() / 60.0)
            
            # Graded routing impact
            impact_factor = 1.0 if status in ("preliminary_verified", "verified") else 0.2
            decay = math.exp(-decay_lambda * delta_min)
            hazard_contribution = severity * impact_factor * decay
            total_hazard += hazard_contribution

            active_incidents.append({
                "id": inc_id,
                "distance_meters": round(dist, 1),
                "incident_type": inc_type,
                "severity": severity,
                "status": status,
                "elapsed_minutes": round(delta_min, 1),
                "decay_factor": round(decay, 3),
                "hazard_contribution": round(hazard_contribution, 3)
            })

    return {
        "hazard_score": round(total_hazard, 3),
        "active_incidents": len(active_incidents),
        "incidents": active_incidents
    }


def get_incident(incident_id: int, db_path: Optional[Path] = None) -> Optional[Dict[str, Any]]:
    """Retrieves an incident record by ID."""
    path = db_path or DEFAULT_DB_PATH
    if not path.exists():
        return None
    with sqlite3.connect(str(path)) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM community_incidents WHERE id = ?", (incident_id,))
        row = cursor.fetchone()
        if row:
            return dict(row)
    return None


def get_privacy_aggregated_incidents(
    db_path: Optional[Path] = None,
    current_time: Optional[datetime] = None,
    expiry_hours: float = EXPIRY_HOURS
) -> List[Dict[str, Any]]:
    """
    Aggregates active community incidents to 250m spatial grid cells before public exposure.
    Per privacy requirements: NEVER serves raw individual coordinates or user IDs.

    Returns a list of 250m spatial cell summaries.
    """
    path = db_path or DEFAULT_DB_PATH
    if not path.exists():
        return []

    now = current_time or pune_now().replace(tzinfo=None)
    twelve_hours_ago = (now - timedelta(hours=expiry_hours)).strftime("%Y-%m-%d %H:%M:%S")

    with sqlite3.connect(str(path)) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, latitude, longitude, incident_type, severity, status, reported_at
            FROM community_incidents
            WHERE reported_at >= ? AND reported_at <= ? AND status != 'expired'
        """, (twelve_hours_ago, now.strftime('%Y-%m-%d %H:%M:%S')))
        records = cursor.fetchall()

    if not records:
        return []

    # 250m grid resolution in degrees for Pune (~18.5N)
    # 1 deg lat ~ 111,000m -> 250m ~ 0.00225 deg
    # 1 deg lon ~ 105,000m -> 250m ~ 0.00238 deg
    delta_lat = 250.0 / 111000.0
    delta_lon = 250.0 / (111000.0 * math.cos(math.radians(18.52)))

    cells: Dict[Tuple[float, float], List[Tuple[Any, ...]]] = {}
    for r in records:
        lat, lon = r[1], r[2]
        # Quantize to 250m cell center
        cell_lat = round(round(lat / delta_lat) * delta_lat, 5)
        cell_lon = round(round(lon / delta_lon) * delta_lon, 5)
        key = (cell_lat, cell_lon)
        if key not in cells:
            cells[key] = []
        cells[key].append(r)

    aggregated_cells = []
    for (c_lat, c_lon), inc_list in cells.items():
        types = list(set(r[3] for r in inc_list))
        max_sev = max(r[4] for r in inc_list)
        any_verified = any(r[5] in ("preliminary_verified", "verified") for r in inc_list)
        status_label = "preliminary_verified" if any_verified else "unverified"
        hazard_info = calculate_dynamic_hazard(c_lat, c_lon, current_time=now, search_radius_meters=250.0, db_path=path)

        aggregated_cells.append({
            "cell_id": f"cell_250m_{c_lat:.4f}_{c_lon:.4f}",
            "center_lat": c_lat,
            "center_lon": c_lon,
            "incident_count": len(inc_list),
            "incident_types": types,
            "max_severity": max_sev,
            "status": status_label,
            "hazard_score": hazard_info["hazard_score"],
            "resolution_meters": 250
        })

    return aggregated_cells
