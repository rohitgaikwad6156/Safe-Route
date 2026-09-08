"""
SafeRoute AI: Production-Hardened HTTP API Server
Survives flaky conference Wi-Fi, offline mode, zero-distance queries,
out-of-bounds coordinates, cold-start latency, and form spam.
Runs on Flask (built-in, zero external dependencies).
"""
import os
import sys
import time
import threading
import json
import math
from werkzeug.exceptions import HTTPException
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Any

# Ensure project root is in sys.path
_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from flask import Flask, request, jsonify
from backend.scoring.context import pune_now, PUNE_TZ

from backend.routing.validator import validate_coordinates, is_identical_location, build_zero_distance_route, PUNE_BBOX
from backend.routing.graph_loader import get_graph_manager
from backend.routing.engine import get_routing_engine
from backend.scoring.corroboration import submit_incident, get_privacy_aggregated_incidents
from backend.scoring.profiles import profile_catalog, normalize_profile
from backend.api.geocoder import geocode_location

app = Flask(__name__)

# Preload graph into module-level memory at startup (per AGENTS.md Rule 2)
_graph_mgr = get_graph_manager()
_graph_mgr.load()
_routing_engine = get_routing_engine()

# Global rate limiter state: { ip: list_of_timestamps }
_RATE_LIMITS: Dict[str, List[float]] = {}
_RATE_LIMIT_LOCK = threading.Lock()
MAX_INCIDENTS_PER_MINUTE = 5
RATE_WINDOW_SECONDS = 60.0


def check_rate_limit(client_id: str) -> Tuple[bool, int]:
    """
    Sliding-window rate limiter.
    Returns (is_allowed, retry_after_seconds).
    """
    now = time.time()
    with _RATE_LIMIT_LOCK:
        history = _RATE_LIMITS.get(client_id, [])
        valid_history = [t for t in history if now - t < RATE_WINDOW_SECONDS]
        if len(valid_history) >= MAX_INCIDENTS_PER_MINUTE:
            oldest = valid_history[0]
            retry_after = int(RATE_WINDOW_SECONDS - (now - oldest)) + 1
            _RATE_LIMITS[client_id] = valid_history
            return False, max(1, retry_after)

        valid_history.append(now)
        _RATE_LIMITS[client_id] = valid_history
        return True, 0


@app.after_request
def add_cors_headers(response):
    """Zero-dependency CORS support for web frontend integration."""
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response


@app.errorhandler(ValueError)
@app.errorhandler(TypeError)
@app.errorhandler(KeyError)
@app.errorhandler(AttributeError)
def invalid_input(error):
    message = str(error) if 'graph coverage' in str(error) else 'Check coordinates, departure date/time and incident fields.'
    return jsonify(error="invalid_request", message=message), 400


@app.errorhandler(HTTPException)
def http_error(error):
    return jsonify(error=error.name, message=error.description), error.code


@app.route('/api/map-data')
def map_data():
    data_dir = _ROOT / 'backend' / 'data'
    with open(data_dir / 'risk_grid.json', encoding='utf-8') as f:
        risk = json.load(f)
    with open(data_dir / 'amenities.json', encoding='utf-8') as f:
        amenities = json.load(f)
    return jsonify(heatmap={'type': 'FeatureCollection', 'features': [
        {'type': 'Feature', 'properties': {'wsi': value, 'intensity': min(1, value/35)},
         'geometry': {'type': 'Point', 'coordinates': [float(key.split('_')[1]), float(key.split('_')[0])]}}
        for key, value in risk.items()]}, amenities=amenities,
        provenance='Committed research risk grid; spatially modelled WSI, not individual crash counts')


@app.route('/api/datasets', methods=['GET'])
def dataset_registry():
    """Returns the data card shown in the UI; no raw incident records are exposed."""
    registry_path = _ROOT / 'backend' / 'data' / 'dataset_registry.json'
    with open(registry_path, encoding='utf-8') as registry_file:
        registry = json.load(registry_file)
    return jsonify(registry)


@app.route('/api/profiles', methods=['GET'])
def safety_profiles():
    return jsonify({"profiles": profile_catalog()})


@app.route("/health", methods=["GET"])
def health_check():
    """
    Health and readiness endpoint.
    Reports whether the 130k-edge graph is loaded, the actual load duration,
    and disconnected component diagnostics.
    """
    manager = get_graph_manager()
    meta = manager.get_metadata()
    status_code = 200 if meta["is_ready"] else 503
    return jsonify(meta), status_code


@app.route("/api/geocode", methods=["GET"])
def geocode_endpoint():
    """Geocodes location query with guaranteed offline landmark fallback."""
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify({"error": "Missing query parameter 'q'"}), 400
    res = geocode_location(q)
    return jsonify(res)


@app.route("/api/routes", methods=["POST"])
def get_routes_endpoint():
    """
    Computes Fastest (beta=0.0), Safest (beta=0.90), and Balanced (beta=0.50) routes
    with spatial bounds validation, identical node handling, and full grounded explanations.
    """
    data = request.get_json() or {}
    orig = data.get("origin", {})
    dest = data.get("destination", {})

    orig_lat = float(orig.get("lat", 0.0))
    orig_lon = float(orig.get("lon", 0.0))
    dest_lat = float(dest.get("lat", 0.0))
    dest_lon = float(dest.get("lon", 0.0))

    # 1. Bounding box validation
    valid_o, msg_o = validate_coordinates(orig_lat, orig_lon, "Origin")
    if not valid_o:
        return jsonify({
            "error": "out_of_bounds",
            "message": msg_o,
            "supported_bounds": PUNE_BBOX
        }), 400

    valid_d, msg_d = validate_coordinates(dest_lat, dest_lon, "Destination")
    if not valid_d:
        return jsonify({
            "error": "out_of_bounds",
            "message": msg_d,
            "supported_bounds": PUNE_BBOX
        }), 400

    # 2. Identical origin and destination: return 0-meter route gracefully
    if is_identical_location(orig_lat, orig_lon, dest_lat, dest_lon):
        zero_route = build_zero_distance_route(
            orig.get("name", "Current Location"),
            dest.get("name", "Destination"),
            orig_lat,
            orig_lon
        )
        return jsonify({
            "routes": [zero_route],
            "origin": orig,
            "destination": dest,
            "is_identical": True,
            "message": "Origin and destination are identical. Zero travel required."
        })

    # Use Pune calendar dates consistently on servers in any timezone.
    dep_time_str = data.get('departure_time') or pune_now().strftime('%H:%M')
    dep_date = data.get('departure_date') or pune_now().date().isoformat()
    dep_dt = datetime.strptime(f'{dep_date} {dep_time_str}', '%Y-%m-%d %H:%M').replace(tzinfo=PUNE_TZ)
    profile = normalize_profile(str(data.get('profile') or 'student'))

    # 4. Execute multi-objective A* search via RoutingEngine
    routing_engine = get_routing_engine()
    routes_payload = routing_engine.calculate_routes(
        orig_lat=orig_lat,
        orig_lon=orig_lon,
        dest_lat=dest_lat,
        dest_lon=dest_lon,
        orig_name=orig.get("name", "Origin"),
        dest_name=dest.get("name", "Destination"),
        departure_time=dep_dt,
        profile_id=profile
    )

    return jsonify(routes_payload)


@app.route("/api/post-incident", methods=["POST"])
@app.route("/api/incidents", methods=["POST"])
def submit_incident_endpoint():
    """
    Incident reporting endpoint protected by rate limiting, proximity gating,
    and two-stage peer corroboration.
    """
    data = request.get_json() or {}
    client_id = data.get('user_id_hash') or data.get('reported_by') or data.get('user_id')
    if not isinstance(client_id, str) or not 8 <= len(client_id) <= 128:
        return jsonify(error='invalid_session', message='A valid anonymous session ID is required.'), 400
    is_allowed, retry_after = check_rate_limit(client_id)

    if not is_allowed:
        return jsonify({
            "error": "rate_limit_exceeded",
            "message": f"Rate limit exceeded: Maximum {MAX_INCIDENTS_PER_MINUTE} hazard reports allowed per user per window.",
            "retry_after_seconds": retry_after
        }), 429

    lat = float(data.get("lat") or data.get("latitude", 0.0))
    lon = float(data.get("lon") or data.get("longitude", 0.0))
    category = data.get("category") or data.get("incident_type", "road_hazard")
    severity = int(data.get("severity", 3))
    description = data.get("description", "")
    reporter_id = client_id

    # Optional reporter GPS coordinate for proximity gating (within 150m)
    demo_mode = data.get('demo_mode') is True
    reporter_lat = float(data["reporter_lat"]) if "reporter_lat" in data else (lat if demo_mode else None)
    reporter_lon = float(data["reporter_lon"]) if "reporter_lon" in data else (lon if demo_mode else None)

    if reporter_lat is None or reporter_lon is None:
        return jsonify(error='gps_required', message='Allow browser location access to report a nearby hazard.'), 400
    if not all(math.isfinite(v) for v in (lat, lon, reporter_lat, reporter_lon)):
        raise ValueError('Non-finite coordinates')
    valid, message = validate_coordinates(lat, lon)
    if not valid:
        return jsonify(error='out_of_bounds', message=message), 400
    aliases = {'poor_lighting': 'broken_light', 'harassment_risk': 'unsafe_location',
               'isolated_stretch': 'unsafe_location', 'accident_prone': 'accident',
               'pothole_hazard': 'road_damage', 'road_hazard': 'road_damage',
               'road_blocked': 'traffic_problem'}
    category = aliases.get(category, category)
    if category not in {'accident', 'broken_light', 'road_damage', 'unsafe_location', 'traffic_problem', 'helpful_safe_place'} or not 1 <= severity <= 5:
        return jsonify(error='invalid_incident', message='Choose a supported category and severity from 1 to 5.'), 400
    if not isinstance(description, str) or len(description) > 2000:
        raise ValueError('Description too long')
    # Receipt time is authoritative; user timestamps cannot bypass expiry/rate limits.
    reported_at = pune_now().replace(tzinfo=None)

    if demo_mode:
        description = f"[DEMO community report] {description}".strip()
    result = submit_incident(
        latitude=lat,
        longitude=lon,
        incident_type=category,
        severity=severity,
        reported_by=reporter_id,
        description=description,
        reporter_lat=reporter_lat,
        reporter_lon=reporter_lon,
        reported_at=reported_at
    )

    if result.get("status") == "rejected":
        status_code = 403 if result.get("reason") == "proximity_gating_failed" else 429
        return jsonify(result), status_code

    result['demo_mode'] = demo_mode
    return jsonify(result), 201


@app.route("/api/incidents", methods=["GET"])
def get_incidents_endpoint():
    """
    Public incidents API.
    Per Privacy Requirements: Aggregates active incidents into 250m grid cells.
    NEVER serves raw individual coordinates or reporter IDs.
    """
    aggregated_cells = get_privacy_aggregated_incidents()
    return jsonify({
        "cells": aggregated_cells,
        "total_active_cells": len(aggregated_cells),
        "cell_resolution_meters": 250,
        "privacy_notice": "Individual incident coordinates are strictly aggregated into 250m spatial clusters to preserve reporter privacy."
    }), 200




def start_background_server(port: int = 8000):
    """Starts server in a background thread."""
    t = threading.Thread(target=lambda: app.run(host="127.0.0.1", port=port, debug=False, use_reloader=False), daemon=True)
    t.start()
    return t


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"[SafeRoute AI] Graph ready in {_graph_mgr.load_time_seconds}s. Starting API server on port {port}...")
    app.run(host="0.0.0.0", port=port, debug=False)
