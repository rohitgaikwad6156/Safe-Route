"""
SafeRoute AI: Production-Hardened HTTP API Server
Survives flaky conference Wi-Fi, offline mode, zero-distance queries,
out-of-bounds coordinates, cold-start latency, and form spam.
Runs on Flask (built-in, zero external dependencies).
"""
import os
import time
import threading
from datetime import datetime
from typing import Dict, List, Tuple, Any
from flask import Flask, request, jsonify

from backend.routing.validator import validate_coordinates, is_identical_location, build_zero_distance_route, PUNE_BBOX
from backend.routing.graph_loader import get_graph_manager
from backend.routing.engine import get_routing_engine
from backend.scoring.corroboration import submit_incident, get_privacy_aggregated_incidents
from backend.api.geocoder import geocode_location

app = Flask(__name__)

# Preload graph into module-level memory at startup (per AGENTS.md Rule 2)
_graph_mgr = get_graph_manager()
_graph_mgr.load()

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

    # 3. Parse optional departure time
    dep_time_str = data.get("departure_time")
    dep_dt = None
    if dep_time_str:
        try:
            # Handle "HH:MM" format
            parts = dep_time_str.split(":")
            now = datetime.now()
            dep_dt = now.replace(hour=int(parts[0]), minute=int(parts[1]), second=0, microsecond=0)
        except Exception:
            dep_dt = datetime.now()

    # 4. Execute multi-objective A* search via RoutingEngine
    routing_engine = get_routing_engine()
    routes_payload = routing_engine.calculate_routes(
        orig_lat=orig_lat,
        orig_lon=orig_lon,
        dest_lat=dest_lat,
        dest_lon=dest_lon,
        orig_name=orig.get("name", "Origin"),
        dest_name=dest.get("name", "Destination"),
        departure_time=dep_dt
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
    client_id = data.get("reported_by") or data.get("user_id") or request.remote_addr or "unknown_client"
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
    reporter_lat = float(data["reporter_lat"]) if "reporter_lat" in data else None
    reporter_lon = float(data["reporter_lon"]) if "reporter_lon" in data else None

    # Optional explicit timestamp parsing
    reported_at = None
    if "reported_at" in data and data["reported_at"]:
        try:
            reported_at = datetime.fromisoformat(str(data["reported_at"]))
        except Exception:
            try:
                reported_at = datetime.strptime(str(data["reported_at"]), "%Y-%m-%d %H:%M:%S")
            except Exception:
                reported_at = None

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
