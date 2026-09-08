from datetime import datetime

from backend.explain.engine import ExplanationEngine
from backend.scoring.corroboration import calculate_dynamic_hazard, get_privacy_aggregated_incidents, submit_incident
from backend.scoring.profiles import apply_profile, profile_catalog


def test_all_six_profiles_score_from_existing_signals():
    base = {"subscores": {"accident": 70, "emergency": 90, "lighting": 40, "pedestrian": 80, "traffic": 60}}
    scores = {}
    for profile in profile_catalog():
        route = apply_profile({**base, "subscores": dict(base["subscores"])}, profile["id"])
        scores[profile["id"]] = route["profile_score"]
        assert profile["label"] in route["profile_explanation"]
        assert route["profile_limitation"]
    assert len(scores) == 6
    assert scores["night_commuter"] != scores["emergency_helper"]


def test_explanation_emits_grounded_unsafe_segment_warnings():
    amenities = {
        "hospitals": [{"name": "Test Hospital", "lat": 18.51, "lon": 73.85}],
        "police": [{"name": "Test Police", "lat": 18.51, "lon": 73.85}],
        "fire_stations": [{"name": "Test Fire", "lat": 18.51, "lon": 73.85}],
    }
    segment = {"id": "s1", "length_meters": 1000, "wsi": 20, "community_hazard": 1,
               "lit": "no", "sidewalk": "no", "subscores": {"accident": 40, "emergency": 30, "lighting": 35, "pedestrian": 30, "traffic": 60}}
    route = {"id": "route-safest", "type": "safest", "segments": [segment],
             "geometry": {"coordinates": [[73.85, 18.50], [73.86, 18.52]]}}
    bundle = ExplanationEngine(amenities=amenities).generate_route_explanations(route, [route], datetime(2026, 9, 8, 21, 0), "21:00")
    assert {warning["type"] for warning in bundle["warnings"]} == {"blackspot", "lighting", "emergency", "community"}
    assert bundle["safe_havens"]["nearest_fire"]["name"] == "Test Fire"


def test_helpful_safe_place_is_visible_but_not_a_hazard(tmp_path):
    db = tmp_path / "reports.db"
    now = datetime(2026, 9, 8, 12, 0)
    result = submit_incident(18.52, 73.85, "helpful_safe_place", 3, "demo-user-123", "Staffed shop", 18.52, 73.85, now, db)
    assert result["status"] == "success"
    cells = get_privacy_aggregated_incidents(db, now)
    assert cells and cells[0]["incident_types"] == ["helpful_safe_place"]
    assert calculate_dynamic_hazard(18.52, 73.85, now, db_path=db)["hazard_score"] == 0
