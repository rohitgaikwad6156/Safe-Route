"""
Tests for Segment Safety Score (SSS).
Weights: Accident 0.30, Emergency 0.20, Lighting 0.20, Pedestrian 0.15, Traffic 0.15.
"""
import pytest
from backend.scoring.sss import calculate_sss, SSSWeights


def test_perfect_subscores_yield_100():
    sss = calculate_sss(
        accident_score=100.0,
        emergency_score=100.0,
        lighting_score=100.0,
        pedestrian_score=100.0,
        traffic_score=100.0
    )
    assert sss == 100.0


def test_zero_subscores_yield_zero():
    sss = calculate_sss(
        accident_score=0.0,
        emergency_score=0.0,
        lighting_score=0.0,
        pedestrian_score=0.0,
        traffic_score=0.0
    )
    assert sss == 0.0


def test_weighted_calculation():
    # 0.30*80 + 0.20*70 + 0.20*60 + 0.15*50 + 0.15*40
    # = 24.0 + 14.0 + 12.0 + 7.5 + 6.0 = 63.5
    sss = calculate_sss(
        accident_score=80.0,
        emergency_score=70.0,
        lighting_score=60.0,
        pedestrian_score=50.0,
        traffic_score=40.0
    )
    assert sss == pytest.approx(63.5, abs=0.01)


def test_custom_weights():
    custom = SSSWeights(accident=0.5, emergency=0.1, lighting=0.2, pedestrian=0.1, traffic=0.1)
    sss = calculate_sss(100.0, 0.0, 0.0, 0.0, 0.0, weights=custom)
    assert sss == 50.0


# ==============================================================================
# Research Document compute_sss(segment) Unit Tests
# ==============================================================================

from backend.scoring.sss import compute_sss, compute_sss_detailed, UnloggedAccidentDataError


def test_compute_sss_fully_lit_sidewalked_segment_returns_high_score():
    """
    Case 1: Fully-lit sidewalked segment (e.g. Complete Street like Aundh ITI Road).
    Expects very high safety score (>= 90.0).
    """
    segment = {
        "name": "Aundh ITI Smart Street",
        "wsi": 0.0,  # Zero recorded crash severity in risk_grid
        "lit": "yes",  # S_light = 100
        "sidewalk": "both",  # S_pedestrian = 100
        "highway": "secondary",
        "traffic": "free_flow",  # S_traffic = 100
        "emergency_distance_km": 0.2  # S_emergency = 100 * exp(-0.5 * 0.2) = 90.48
    }

    sss = compute_sss(segment)
    assert sss is not None
    assert sss >= 90.0

    detail = compute_sss_detailed(segment)
    assert detail.is_unknown is False
    assert detail.accident_score == 100.0
    assert detail.lighting_score == 100.0
    assert detail.traffic_score == 100.0
    assert detail.pedestrian_score == 100.0
    assert detail.emergency_score == pytest.approx(90.48, abs=0.1)
    # 0.30*100 + 0.20*100 + 0.15*100 + 0.15*100 + 0.20*90.48 = 80 + 18.1 = 98.1
    assert detail.sss == pytest.approx(98.1, abs=0.2)


def test_compute_sss_katraj_chowk_high_wsi_segment_returns_low_score():
    """
    Case 2: Katraj Chowk-style high-WSI arterial blackspot.
    High crash frequency (WSI 34.0), unlit, no sidewalk on trunk, severe gridlock,
    and distant emergency facilities.
    Expects low safety score (<= 25.0).
    """
    segment = {
        "name": "Katraj Chowk Bypass",
        "wsi": 34.0,  # Critical WSI (34 out of WSI_max 35) -> S_accident = max(0, 100 - (34/35)*100) = 2.86
        "lit": "no",  # S_light = 0
        "sidewalk": "no",  # S_pedestrian on trunk = 0
        "highway": "trunk",
        "traffic": "severe",  # S_traffic = 20
        "emergency_distance_km": 2.5  # S_emergency = 100 * exp(-0.5 * 2.5) = 28.65
    }

    sss = compute_sss(segment)
    assert sss is not None
    assert sss <= 25.0

    detail = compute_sss_detailed(segment)
    assert detail.is_unknown is False
    assert detail.accident_score == pytest.approx(2.86, abs=0.1)
    assert detail.lighting_score == 0.0
    assert detail.pedestrian_score == 0.0
    assert detail.traffic_score == 20.0
    assert detail.emergency_score == pytest.approx(28.65, abs=0.1)
    # 0.30*(2.86) + 0.20*(0) + 0.15*(20) + 0.15*(0) + 0.20*(28.65) = 0.86 + 3.0 + 5.73 = 9.59
    assert detail.sss == pytest.approx(9.59, abs=0.2)


def test_compute_sss_missing_unlogged_accident_data_explicit_unknown():
    """
    Case 3: Segment with missing/unlogged accident data.
    Per AGENTS.md Rule 4: Never invent an accident count, fatality number, or coordinate.
    If a segment has no logged crash data in risk_grid.json, it MUST be scored as unknown/null,
    NOT defaulted to a guessed number or silent zero.
    """
    segment_unlogged = {
        "name": "Unlogged Suburban Street",
        "lat": 18.590,
        "lon": 73.700,  # Coordinate not present in backend/data/risk_grid.json
        "lit": "yes",
        "sidewalk": "both",
        "traffic": "free_flow",
        "emergency_distance_km": 0.5
    }

    # 1. Non-strict call explicitly returns None (null score)
    result = compute_sss(segment_unlogged, strict=False)
    assert result is None, "Expected None (null/unknown score) for unlogged accident data, not a guessed number."

    # 2. Strict call raises UnloggedAccidentDataError
    with pytest.raises(UnloggedAccidentDataError, match="no logged accident crash data"):
        compute_sss(segment_unlogged, strict=True)

    # 3. Detailed breakdown explicitly flags unknown status
    detail = compute_sss_detailed(segment_unlogged)
    assert detail.is_unknown is True
    assert detail.sss is None
    assert detail.accident_score is None
    assert detail.status == "unknown_accident_data"
    assert "Rule 4" in detail.message


def test_compute_sss_sources_accident_from_risk_grid():
    """
    Verifies that compute_sss correctly looks up real Pune blackspots from risk_grid.json
    using coordinate rounding without manual WSI injection.
    """
    # Navale Bridge coordinate from docs/contracts/data.md (18.458, 73.828) -> WSI 34.0
    segment = {
        "name": "Navale Bridge Stretch",
        "lat": 18.458,
        "lon": 73.828,
        "lit": "yes",
        "sidewalk": "no",
        "highway": "trunk",
        "traffic": "moderate",
        "emergency_distance_km": 1.0
    }

    detail = compute_sss_detailed(segment)
    assert detail.is_unknown is False
    assert detail.accident_score == pytest.approx(2.86, abs=0.1)


def test_compute_sss_ward_lighting_density_fallback():
    """
    Verifies that when lit tag is missing, S_light falls back to PMC ward pole density
    from backend/data/ward_lighting.json.
    """
    # Aundh ward density is 62.4 poles/km
    segment = {
        "name": "Aundh Local Street",
        "wsi": 0.0,
        "lit": None,  # Untagged lighting
        "ward": "Aundh - Baner",
        "sidewalk": "both",
        "highway": "residential",
        "traffic": "free_flow",
        "emergency_distance_km": 0.5
    }

    detail = compute_sss_detailed(segment)
    assert detail.lighting_score == 62.4

