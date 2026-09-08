"""
Unit tests verifying conference Wi-Fi survivability, edge-case input handling,
offline landmark fallback, disconnected graph component isolation, cold-start diagnostics,
and anti-spam rate limiting.
"""
import pytest
import time
from backend.routing.validator import validate_coordinates, is_identical_location, build_zero_distance_route, PUNE_BBOX
from backend.routing.graph_loader import PuneGraphManager
from backend.api.geocoder import geocode_location
from backend.api.server import check_rate_limit, app, MAX_INCIDENTS_PER_MINUTE


def test_offline_landmark_geocoder_fallback():
    """
    Test 1: Nominatim unreachable / zero internet.
    Asserts geocoder falls back to committed landmark table and returns real coordinates.
    """
    # Test known landmark query (e.g. "Katraj") with simulated 0.001s timeout to force network bypass
    res = geocode_location("Katraj Chowk", timeout_seconds=0.0001)
    assert res is not None
    assert "Katraj" in res["name"]
    assert abs(res["lat"] - 18.4529) < 0.05
    assert abs(res["lon"] - 73.8553) < 0.05
    assert res["offline_fallback"] is True
    assert res["source"] == "offline_landmark_registry"

    # Test alias matching (e.g. "COEP" for College of Engineering Pune)
    res_alias = geocode_location("COEP", timeout_seconds=0.0001)
    assert res_alias["offline_fallback"] is True
    assert "Shivajinagar" in res_alias["ward"] or "COEP" in res_alias["name"]


def test_out_of_bounds_bbox_validation():
    """
    Test 2: Origin or destination outside loaded graph bbox.
    Asserts clear error message naming supported area, NOT a 500 error.
    """
    # Coordinates in Mumbai (outside Pune BBox)
    mumbai_lat, mumbai_lon = 19.0760, 72.8777
    valid, msg = validate_coordinates(mumbai_lat, mumbai_lon, "Origin")
    assert valid is False
    assert "outside the calibrated Pune service area" in msg
    assert f"{PUNE_BBOX['min_lat']:.3f}" in msg
    assert f"{PUNE_BBOX['max_lat']:.3f}" in msg
    assert "Shivajinagar" in msg or "Katraj" in msg

    # Valid Pune coordinate
    pune_lat, pune_lon = 18.5314, 73.8446
    valid_pune, msg_pune = validate_coordinates(pune_lat, pune_lon, "Origin")
    assert valid_pune is True
    assert msg_pune is None


def test_identical_origin_dest_graceful_handling():
    """
    Test 3: Origin and destination snap to the same node or are identical.
    Asserts 0-meter route with 100 RSS and zero exposure is returned gracefully.
    """
    lat, lon = 18.4529, 73.8553
    is_same = is_identical_location(lat, lon, lat + 0.00005, lon + 0.00005, threshold_meters=25.0)
    assert is_same is True

    route = build_zero_distance_route("Katraj Chowk", "Katraj Chowk", lat, lon)
    assert route["distance_meters"] == 0.0
    assert route["duration_seconds"] == 0.0
    assert route["rss"] == 100.0
    assert route["raw_rss"] == 100.0
    assert "identical" in route["reasons"][0]
    assert len(route["steps"]) == 1


def test_disconnected_components_isolation():
    """
    Test 4: Detect disconnected components at startup, report count, and route within largest.
    """
    mgr = PuneGraphManager()
    meta = mgr.load(force_graphml=False)  # Uses binary cache for fast unit test
    assert meta["is_ready"] is True
    assert meta["components_count"] >= 1
    assert meta["largest_component_nodes"] > 50000
    assert meta["coverage_percentage"] > 95.0

    # Snapping guaranteed to return node in largest component
    node_id, s_lat, s_lon = mgr.snap_to_node(18.5204, 73.8567)
    assert node_id in mgr.largest_component_graph


def test_backend_cold_start_and_health_endpoint():
    """
    Test 5: /health endpoint reports readiness and graph load duration diagnostics.
    """
    from backend.routing.graph_loader import get_graph_manager
    mgr = get_graph_manager()
    mgr.load(force_graphml=False)

    with app.test_client() as client:
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["status"] == "ready"
        assert "load_time_seconds" in data
        assert data["total_nodes"] > 50000
        assert data["total_edges"] > 100000
        assert data["components_count"] >= 1
        assert data["largest_component_nodes"] > 50000


def test_incident_rate_limiting_spammed_50_times():
    """
    Test 6: Someone spams incident form 50 times.
    Confirm rate limiting holds and UI / API shows the rejection reason.
    """
    client_ip = f"test_spammer_{time.time()}"
    allowed_count = 0
    rejected_count = 0

    for i in range(50):
        is_allowed, retry_after = check_rate_limit(client_ip)
        if is_allowed:
            allowed_count += 1
        else:
            rejected_count += 1
            assert retry_after >= 1

    # Exactly MAX_INCIDENTS_PER_MINUTE should be allowed; the remaining 45 must be rejected
    assert allowed_count == MAX_INCIDENTS_PER_MINUTE
    assert rejected_count == 50 - MAX_INCIDENTS_PER_MINUTE

    # Test via Flask test client: verify HTTP 429 response payload
    with app.test_client() as client:
        # Spam 10 requests from client
        spam_ip = f"192.168.1.{int(time.time() % 250)}"
        responses = []
        for _ in range(10):
            res = client.post(
                "/api/incidents",
                json={"category": "road_damage", "lat": 18.5, "lon": 73.8, "user_id_hash": spam_ip, "reporter_lat": 18.5, "reporter_lon": 73.8},
                environ_overrides={"REMOTE_ADDR": spam_ip}
            )
            responses.append(res)

        status_codes = [r.status_code for r in responses]
        assert 201 in status_codes
        assert 429 in status_codes
        # Verify 429 payload contains clear rejection reason
        rejected_res = [r for r in responses if r.status_code == 429][0]
        rej_json = rejected_res.get_json()
        assert rej_json["error"] == "rate_limit_exceeded"
        assert "Rate limit exceeded" in rej_json["message"]
