"""
Unit tests for community incident reporting, two-stage peer corroboration,
anti-flooding defense, proximity gating, and exponential hazard decay.
"""
import pytest
import tempfile
from pathlib import Path
from datetime import datetime, timedelta
from backend.scoring.corroboration import (
    submit_incident,
    calculate_dynamic_hazard,
    get_incident,
    get_privacy_aggregated_incidents,
    haversine_distance_meters,
    DEFAULT_DECAY_LAMBDA
)
from backend.api.server import app


@pytest.fixture
def temp_db(tmp_path):
    return tmp_path / "test_incidents.db"



def test_submit_incident_unverified_initially(temp_db):
    res = submit_incident(
        latitude=18.5204,
        longitude=73.8567,
        incident_type="broken_light",
        severity=3,
        reported_by="user_1",
        description="Dark street",
        db_path=temp_db
    )
    assert res["status"] == "success"
    assert res["verification_state"] == "unverified"
    assert res["is_corroborated"] is False
    assert res["corroboration_count"] == 1


def test_two_stage_peer_corroboration_within_200m_and_30min(temp_db):
    t0 = datetime(2026, 9, 6, 21, 0, 0)
    
    # User 1 reports at t0
    res1 = submit_incident(
        latitude=18.5204,
        longitude=73.8567,
        incident_type="broken_light",
        severity=3,
        reported_by="user_1",
        reported_at=t0,
        db_path=temp_db
    )
    assert res1["verification_state"] == "unverified"

    # User 2 reports same type 50 meters away 10 minutes later -> Corroborated!
    t1 = t0 + timedelta(minutes=10)
    res2 = submit_incident(
        latitude=18.5208,  # ~45m north
        longitude=73.8567,
        incident_type="broken_light",
        severity=4,
        reported_by="user_2",
        reported_at=t1,
        db_path=temp_db
    )
    assert res2["status"] == "success"
    assert res2["verification_state"] == "preliminary_verified"
    assert res2["is_corroborated"] is True
    assert res2["corroboration_count"] == 2


def test_peer_corroboration_fails_outside_30_min_window(temp_db):
    t0 = datetime(2026, 9, 6, 20, 0, 0)
    submit_incident(
        latitude=18.5204,
        longitude=73.8567,
        incident_type="pothole",
        severity=3,
        reported_by="user_1",
        reported_at=t0,
        db_path=temp_db
    )

    # 45 minutes later (exceeds 30 min window) -> remains unverified
    t1 = t0 + timedelta(minutes=45)
    res2 = submit_incident(
        latitude=18.5204,
        longitude=73.8567,
        incident_type="pothole",
        severity=3,
        reported_by="user_2",
        reported_at=t1,
        db_path=temp_db
    )
    assert res2["verification_state"] == "unverified"
    assert res2["is_corroborated"] is False


def test_flooding_defense_rate_limiting(temp_db):
    t0 = datetime(2026, 9, 6, 21, 0, 0)
    for i in range(5):
        res = submit_incident(
            latitude=18.5204 + i * 0.001,
            longitude=73.8567,
            incident_type="broken_light",
            severity=3,
            reported_by="spammer",
            reported_at=t0,
            db_path=temp_db
        )
        assert res["status"] == "success"

    # 6th attempt within the hour is rejected
    res6 = submit_incident(
        latitude=18.5250,
        longitude=73.8567,
        incident_type="broken_light",
        severity=3,
        reported_by="spammer",
        reported_at=t0 + timedelta(minutes=5),
        db_path=temp_db
    )
    assert res6["status"] == "rejected"
    assert res6["reason"] == "rate_limit_exceeded"


def test_proximity_gating(temp_db):
    # Incident at (18.5204, 73.8567), reporter GPS at (18.5300, 73.8567) (~1.0 km away -> fails > 150m)
    res = submit_incident(
        latitude=18.5204,
        longitude=73.8567,
        incident_type="broken_light",
        severity=3,
        reported_by="user_remote",
        reporter_lat=18.5300,
        reporter_lon=73.8567,
        db_path=temp_db
    )
    assert res["status"] == "rejected"
    assert res["reason"] == "proximity_gating_failed"


def test_exponential_time_decay_formula(temp_db):
    t0 = datetime(2026, 9, 6, 20, 0, 0)
    # Verified incident with severity 4
    submit_incident(
        latitude=18.5204,
        longitude=73.8567,
        incident_type="accident_prone",
        severity=4,
        reported_by="user_1",
        reported_at=t0,
        db_path=temp_db
    )
    # Corroborate it
    submit_incident(
        latitude=18.5205,
        longitude=73.8567,
        incident_type="accident_prone",
        severity=4,
        reported_by="user_2",
        reported_at=t0 + timedelta(minutes=2),
        db_path=temp_db
    )

    # At t0 (immediate): hazard should be ~4.0 for verified report
    h0 = calculate_dynamic_hazard(18.5204, 73.8567, current_time=t0 + timedelta(minutes=2), db_path=temp_db)
    assert h0["hazard_score"] > 3.5

    # At t0 + 60 mins: calibrated lambda = 0.0115 gives exp(-0.0115*60) = exp(-0.69) ~ 0.501 (approx 50% decay)
    h60 = calculate_dynamic_hazard(18.5204, 73.8567, current_time=t0 + timedelta(minutes=60), db_path=temp_db)
    # Check that hazard decayed by approximately half
    decay_ratio = h60["hazard_score"] / h0["hazard_score"]
    assert pytest.approx(decay_ratio, abs=0.08) == 0.50


def test_submits_two_reports_150m_apart_within_10_minutes_both_flip_to_preliminary_verified(temp_db):
    """
    Research Spec:
    Submits two same-type reports 150m apart within 10 minutes and asserts
    BOTH flip to preliminary_verified.
    """
    t0 = datetime(2026, 9, 6, 22, 0, 0)
    lat1, lon1 = 18.52000, 73.85000

    # 150m north: 150 / 111000 = ~0.001351 degrees
    lat2, lon2 = 18.52135, 73.85000
    actual_dist = haversine_distance_meters(lat1, lon1, lat2, lon2)
    assert 145.0 <= actual_dist <= 155.0  # Verify exactly ~150m separation

    # Step 1: User 1 submits report 1 at t0
    res1 = submit_incident(
        latitude=lat1,
        longitude=lon1,
        incident_type="poor_lighting",
        severity=3,
        reported_by="citizen_alpha",
        reported_at=t0,
        reporter_lat=lat1,  # Reporter is at the scene (passes proximity gating <= 150m)
        reporter_lon=lon1,
        db_path=temp_db
    )
    assert res1["status"] == "success"
    assert res1["verification_state"] == "unverified"
    id1 = res1["id"]

    # Verify Report 1 in DB is initially unverified
    rec1_initial = get_incident(id1, db_path=temp_db)
    assert rec1_initial["status"] == "unverified"
    assert rec1_initial["corroboration_count"] == 1

    # Step 2: User 2 submits same incident type 150m apart at t0 + 10 minutes
    t1 = t0 + timedelta(minutes=10)
    res2 = submit_incident(
        latitude=lat2,
        longitude=lon2,
        incident_type="poor_lighting",
        severity=4,
        reported_by="citizen_beta",
        reported_at=t1,
        reporter_lat=lat2,
        reporter_lon=lon2,
        db_path=temp_db
    )
    assert res2["status"] == "success"
    assert res2["verification_state"] == "preliminary_verified"
    assert res2["is_corroborated"] is True
    assert res2["corroboration_count"] == 2
    id2 = res2["id"]

    # Step 3: Crucial assertion — BOTH reports must now be preliminary_verified in the DB!
    rec1_updated = get_incident(id1, db_path=temp_db)
    rec2_updated = get_incident(id2, db_path=temp_db)

    assert rec1_updated["status"] == "preliminary_verified", "Report 1 did not flip to preliminary_verified!"
    assert rec2_updated["status"] == "preliminary_verified", "Report 2 is not preliminary_verified!"
    assert rec1_updated["corroboration_count"] == 2
    assert rec2_updated["corroboration_count"] == 2


def test_post_incident_api_endpoint_and_peer_corroboration():
    """
    Tests the POST /api/post-incident endpoint end-to-end via Flask test client.
    Submits two same-type reports 150m apart within 10 minutes and asserts both flip.
    """
    import time
    client = app.test_client()
    t0 = datetime.now()
    lat1, lon1 = 18.52000, 73.85000
    lat2, lon2 = 18.52135, 73.85000  # ~150m apart
    unique_suffix = time.time_ns()
    unique_type = f"waterlogging_{unique_suffix}"
    user_1 = f"mobile_user_1_{unique_suffix}"
    user_2 = f"mobile_user_2_{unique_suffix}"

    # 1. Post first incident
    payload1 = {
        "latitude": lat1,
        "longitude": lon1,
        "incident_type": unique_type,
        "severity": 4,
        "reported_by": user_1,
        "reporter_lat": lat1,
        "reporter_lon": lon1,
        "reported_at": t0.strftime("%Y-%m-%d %H:%M:%S")
    }
    r1 = client.post("/api/post-incident", json=payload1)
    assert r1.status_code == 201
    json1 = r1.get_json()
    assert json1["verification_state"] == "unverified"
    id1 = json1["id"]

    # 2. Post second incident 150m away, 8 minutes later
    t1 = t0 + timedelta(minutes=8)
    payload2 = {
        "latitude": lat2,
        "longitude": lon2,
        "incident_type": unique_type,
        "severity": 4,
        "reported_by": user_2,
        "reporter_lat": lat2,
        "reporter_lon": lon2,
        "reported_at": t1.strftime("%Y-%m-%d %H:%M:%S")
    }
    r2 = client.post("/api/post-incident", json=payload2)
    assert r2.status_code == 201
    json2 = r2.get_json()
    assert json2["verification_state"] == "preliminary_verified"
    id2 = json2["id"]

    # 3. Assert both flipped to preliminary_verified
    rec1 = get_incident(id1)
    rec2 = get_incident(id2)
    assert rec1["status"] == "preliminary_verified"
    assert rec2["status"] == "preliminary_verified"


def test_privacy_preservation_250m_aggregation_and_get_endpoint():
    """
    Verifies that GET /api/incidents strictly aggregates to 250m grid cells
    and never exposes raw individual coordinates or user IDs.
    """
    client = app.test_client()
    resp = client.get("/api/incidents")
    assert resp.status_code == 200
    data = resp.get_json()

    assert "cells" in data
    assert data["cell_resolution_meters"] == 250

    for cell in data["cells"]:
        # Verify privacy constraints
        assert "reported_by" not in cell, "Raw user ID must never be exposed publicly!"
        assert "user_id" not in cell
        assert "latitude" not in cell, "Raw individual GPS coordinates must be quantized into center_lat"
        assert "center_lat" in cell
        assert "center_lon" in cell
        assert "cell_id" in cell
        assert "incident_count" in cell
        assert "status" in cell
        assert "hazard_score" in cell

