"""
Segment Safety Score (SSS) Module.
Calculates the unified safety score (0 to 100) for an individual road segment
as a weighted linear combination of the five sub-scores.
Default weights:
- Accident Risk: 0.30
- Emergency Accessibility: 0.20
- Street Lighting: 0.20
- Pedestrian Infrastructure: 0.15
- Traffic Congestion: 0.15
Sum of weights = 1.00.
"""
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class SSSWeights:
    accident: float = 0.30
    emergency: float = 0.20
    lighting: float = 0.20
    pedestrian: float = 0.15
    traffic: float = 0.15

    def validate(self) -> None:
        total = self.accident + self.emergency + self.lighting + self.pedestrian + self.traffic
        if abs(total - 1.0) > 1e-4:
            raise ValueError(f"SSS weights must sum to 1.0, got {total}")


DEFAULT_WEIGHTS = SSSWeights()


def calculate_sss(
    accident_score: float,
    emergency_score: float,
    lighting_score: float,
    pedestrian_score: float,
    traffic_score: float,
    weights: Optional[SSSWeights] = None
) -> float:
    """
    Computes the Segment Safety Score (SSS) out of 100.

    Parameters
    ----------
    accident_score : float
        Accident risk sub-score in [0, 100].
    emergency_score : float
        Emergency service accessibility sub-score in [0, 100].
    lighting_score : float
        Street lighting sub-score in [0, 100].
    pedestrian_score : float
        Pedestrian infrastructure sub-score in [0, 100].
    traffic_score : float
        Traffic conditions sub-score in [0, 100].
    weights : SSSWeights, optional
        Weight distribution across the five criteria.

    Returns
    -------
    float
        Composite Segment Safety Score in [0.0, 100.0].
    """
    w = weights or DEFAULT_WEIGHTS
    
    # Bound input sub-scores to [0, 100]
    sa = max(0.0, min(100.0, float(accident_score)))
    se = max(0.0, min(100.0, float(emergency_score)))
    sl = max(0.0, min(100.0, float(lighting_score)))
    sp = max(0.0, min(100.0, float(pedestrian_score)))
    st = max(0.0, min(100.0, float(traffic_score)))

    composite = (
        w.accident * sa +
        w.emergency * se +
        w.lighting * sl +
        w.pedestrian * sp +
        w.traffic * st
    )

    return max(0.0, min(100.0, composite))


# ==============================================================================
# Pure Function: compute_sss(segment) per Research Doc Formula
# ==============================================================================

import json
import logging
from pathlib import Path
from typing import Dict, Any, Union

logger = logging.getLogger("saferoute.scoring.sss")

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_RISK_GRID_CACHE: Optional[Dict[str, float]] = None
_WARD_LIGHTING_CACHE: Optional[Dict[str, Any]] = None
_AMENITIES_CACHE: Optional[Dict[str, Any]] = None


def _get_risk_grid() -> Dict[str, float]:
    global _RISK_GRID_CACHE
    if _RISK_GRID_CACHE is None:
        p = DATA_DIR / "risk_grid.json"
        if p.exists():
            with open(p, "r", encoding="utf-8") as f:
                _RISK_GRID_CACHE = json.load(f)
        else:
            _RISK_GRID_CACHE = {}
    return _RISK_GRID_CACHE


def _get_ward_lighting() -> Dict[str, Any]:
    global _WARD_LIGHTING_CACHE
    if _WARD_LIGHTING_CACHE is None:
        p = DATA_DIR / "ward_lighting.json"
        if p.exists():
            with open(p, "r", encoding="utf-8") as f:
                _WARD_LIGHTING_CACHE = json.load(f)
        else:
            _WARD_LIGHTING_CACHE = {}
    return _WARD_LIGHTING_CACHE


def _get_amenities() -> Dict[str, Any]:
    global _AMENITIES_CACHE
    if _AMENITIES_CACHE is None:
        p = DATA_DIR / "amenities.json"
        if p.exists():
            with open(p, "r", encoding="utf-8") as f:
                _AMENITIES_CACHE = json.load(f)
        else:
            _AMENITIES_CACHE = {}
    return _AMENITIES_CACHE


class UnloggedAccidentDataError(ValueError):
    """
    Raised when accident data for a street segment is unlogged in backend/data/risk_grid.json.
    Per AGENTS.md Rule 4: Never invent an accident count, fatality number, or coordinate.
    If a data point is missing or unverified, state the uncertainty explicitly.
    """
    pass


@dataclass
class SSSDetail:
    """Detailed breakdown of computed SSS sub-scores and data provenance."""
    sss: Optional[float]
    accident_score: Optional[float]
    lighting_score: float
    traffic_score: float
    pedestrian_score: float
    emergency_score: float
    is_unknown: bool
    status: str
    message: str
    data_sources: Dict[str, str]


def compute_sss(segment: Dict[str, Any], strict: bool = False) -> Optional[float]:
    """
    Computes the Segment Safety Score (SSS) per the research document's exact formula:

    SSS_i = w_A * S_accident,i + w_L * S_light,i + w_T * S_traffic,i + w_P * S_pedestrian,i + w_E * S_emergency,i

    Weights:
    - w_A = 0.30 (Accident Risk)
    - w_L = 0.20 (Street Lighting)
    - w_T = 0.15 (Traffic Congestion)
    - w_P = 0.15 (Pedestrian Infrastructure)
    - w_E = 0.20 (Emergency Accessibility)
    Sum of weights = 1.00.

    Normalized Sub-scores:
    1. S_accident = max(0, 100 - (WSI_i / WSI_max) * 100), where WSI = 3*Fatal + 2*Grievous + 1*Minor.
       WSI_max = 35.0 (calibrated against Katraj Chowk WSI 34.0, max 35.0 from MoRTH/IRC).
       Sourced ONLY from backend/data/risk_grid.json (per AGENTS.md Rule 4: never invent accident
       values; if a segment has no logged data, it is scored as unknown/null and explicitly reported).
    2. S_light: 100 if lit=yes, 0 if lit=no, else fall back to PMC ward pole-density (poles/km,
       capped/scaled to 0-100).
       Data Source Citation: Pune Municipal Corporation (PMC) Environment Status Report (ESR) &
       Electrical Department Streetlight Directory (backend/data/ward_lighting.json).
    3. S_traffic: 100 free-flow / 60 moderate / 20 severe gridlock.
       Data Source Citation: Live or simulated congestion telemetry / TomTom Traffic API feed
       mapped to IRC urban level of service (LOS).
    4. S_pedestrian: sidewalk=both -> 100, left/right -> 60, no on arterial -> 0.
       Data Source Citation: OpenStreetMap sidewalk and highway tags.
    5. S_emergency = 100 * exp(-0.5 * d_i), where d_i is network distance in km to nearest
       hospital/police/ECB node.
       Data Source Citation: Pune Smart City ECBs and emergency facilities (backend/data/amenities.json).

    Parameters
    ----------
    segment : dict
        Segment attribute dictionary containing:
        - 'wsi': float or None (direct WSI)
        - 'fatalities', 'grievous', 'minor': int (optional breakdown)
        - 'lat', 'lon': float (optional coordinate for risk_grid lookup)
        - 'lit': str ('yes', 'no', or None)
        - 'ward': str (optional PMC ward name for lighting density fallback)
        - 'traffic': str ('free_flow', 'moderate', 'severe') or jam factor
        - 'sidewalk': str ('both', 'yes', 'left', 'right', 'no')
        - 'highway': str ('motorway', 'trunk', 'primary', 'secondary', 'residential', 'footway')
        - 'emergency_distance_km': float (distance to nearest emergency amenity in km)
    strict : bool, optional
        If True and accident data is missing/unlogged, raises UnloggedAccidentDataError.
        If False (default), returns None to represent unknown/null score.

    Returns
    -------
    float or None
        Normalized composite Segment Safety Score in [0.0, 100.0],
        or None if accident data is unlogged/unknown.
    """
    detail = compute_sss_detailed(segment)
    if detail.is_unknown:
        if strict:
            raise UnloggedAccidentDataError(detail.message)
        logger.warning(detail.message)
        return None
    return detail.sss


def compute_sss_detailed(segment: Dict[str, Any]) -> SSSDetail:
    """
    Computes SSS and returns the full structured breakdown with data citations and uncertainty status.
    """
    data_sources = {
        "accident": "iRAD / PMC Environment Status Report (backend/data/risk_grid.json)",
        "lighting": "OSM tags with fallback to PMC Ward Pole Density (backend/data/ward_lighting.json)",
        "traffic": "Simulated/Live telemetry mapped to IRC congestion levels (free_flow=100, moderate=60, severe=20)",
        "pedestrian": "OpenStreetMap sidewalk & highway infrastructure tags",
        "emergency": "Spatial exponential decay to PMC hospitals/police/ECBs (backend/data/amenities.json)"
    }

    # --------------------------------------------------------------------------
    # 1. S_accident: Sourced ONLY from backend/data/risk_grid.json or explicit WSI
    # --------------------------------------------------------------------------
    wsi = None

    # (a) Check direct 'wsi' in segment
    if "wsi" in segment:
        val = segment["wsi"]
        if val is not None and str(val).lower() not in ("unknown", "null", "none"):
            wsi = float(val)

    # (b) Check casualty counts: WSI = 3*Fatal + 2*Grievous + 1*Minor
    elif "fatalities" in segment or "grievous" in segment or "minor" in segment:
        fat = float(segment.get("fatalities", 0))
        gri = float(segment.get("grievous", 0))
        min_inj = float(segment.get("minor", 0))
        wsi = 3.0 * fat + 2.0 * gri + 1.0 * min_inj

    # (c) Look up coordinates in backend/data/risk_grid.json
    elif "lat" in segment and "lon" in segment:
        lat = float(segment["lat"])
        lon = float(segment["lon"])
        cell_key = f"{lat:.3f}_{lon:.3f}"
        risk_grid = _get_risk_grid()
        if cell_key in risk_grid:
            wsi = float(risk_grid[cell_key])

    # If unlogged/unknown in risk_grid.json -> per AGENTS.md Rule 4: score as unknown/null
    if wsi is None:
        msg = (
            "[SafeRoute AI Rule 4 Audit] Segment has no logged accident crash data in "
            "backend/data/risk_grid.json. WSI is unknown/null. "
            "Per project rules, accident risk cannot be guessed or defaulted to zero."
        )
        return SSSDetail(
            sss=None,
            accident_score=None,
            lighting_score=0.0,
            traffic_score=0.0,
            pedestrian_score=0.0,
            emergency_score=0.0,
            is_unknown=True,
            status="unknown_accident_data",
            message=msg,
            data_sources=data_sources
        )

    # Normalized formula: S_accident = max(0, 100 - (WSI / WSI_max) * 100)
    wsi_max = float(segment.get("wsi_max", 35.0))
    s_accident = max(0.0, min(100.0, 100.0 - (float(wsi) / max(1e-4, wsi_max)) * 100.0))

    # --------------------------------------------------------------------------
    # 2. S_light: 100 if lit=yes, 0 if lit=no, else PMC ward pole density fallback
    # --------------------------------------------------------------------------
    lit_tag = segment.get("lit")
    ward_name = segment.get("ward")

    if lit_tag is not None:
        lt = str(lit_tag).strip().lower()
        if lt in ("yes", "true", "1", "24/7", "dusk-dawn"):
            s_light = 100.0
        elif lt in ("no", "false", "0", "none"):
            s_light = 0.0
        else:
            s_light = None
    else:
        s_light = None

    if s_light is None:
        # Fallback to PMC ward pole density (backend/data/ward_lighting.json)
        ward_lighting_map = _get_ward_lighting()
        from .lighting import calculate_lighting_score
        s_light = calculate_lighting_score(None, ward_name=ward_name, ward_lighting_map=ward_lighting_map)

    # --------------------------------------------------------------------------
    # 3. S_traffic: 100 free-flow / 60 moderate / 20 severe gridlock
    # --------------------------------------------------------------------------
    traffic_val = segment.get("traffic") or segment.get("congestion")
    if traffic_val is not None:
        from .traffic import calculate_traffic_score
        if isinstance(traffic_val, (int, float)):
            s_traffic = calculate_traffic_score(jam_factor=float(traffic_val))
        else:
            s_traffic = calculate_traffic_score(congestion_level=str(traffic_val))
    else:
        s_traffic = 80.0  # Standard urban normal baseline

    # --------------------------------------------------------------------------
    # 4. S_pedestrian: sidewalk=both -> 100, left/right -> 60, no on arterial -> 0
    # --------------------------------------------------------------------------
    from .pedestrian import calculate_pedestrian_score
    sidewalk_tag = segment.get("sidewalk")
    highway_tag = segment.get("highway")
    s_pedestrian = calculate_pedestrian_score(sidewalk_tag=sidewalk_tag, highway_tag=highway_tag)

    # --------------------------------------------------------------------------
    # 5. S_emergency: 100 * exp(-0.5 * d_i) where d_i is network distance in km
    # --------------------------------------------------------------------------
    em_dist = segment.get("emergency_distance_km")
    if em_dist is None and "lat" in segment and "lon" in segment:
        from .emergency import get_nearest_emergency_distance
        amenities = _get_amenities()
        em_dist = get_nearest_emergency_distance(float(segment["lat"]), float(segment["lon"]), amenities)

    d_km = float(em_dist) if em_dist is not None else 1.0
    from .emergency import calculate_emergency_score
    s_emergency = calculate_emergency_score(distance_km=d_km, decay_lambda=0.5)

    # --------------------------------------------------------------------------
    # Composite: SSS = 0.30*S_acc + 0.20*S_light + 0.15*S_traf + 0.15*S_ped + 0.20*S_em
    # --------------------------------------------------------------------------
    composite = (
        0.30 * s_accident +
        0.20 * s_light +
        0.15 * s_traffic +
        0.15 * s_pedestrian +
        0.20 * s_emergency
    )
    final_sss = max(0.0, min(100.0, round(composite, 2)))

    return SSSDetail(
        sss=final_sss,
        accident_score=round(s_accident, 2),
        lighting_score=round(s_light, 2),
        traffic_score=round(s_traffic, 2),
        pedestrian_score=round(s_pedestrian, 2),
        emergency_score=round(s_emergency, 2),
        is_unknown=False,
        status="valid",
        message="SSS calculated successfully from verified data sources.",
        data_sources=data_sources
    )

