"""
Tests for emergency accessibility sub-score.
Required case: hospital at 0.5 km -> emergency sub-score ≈ 78
"""
import pytest
from backend.scoring.emergency import calculate_emergency_score


def test_hospital_at_half_kilometer():
    """
    Spec worked example:
    Distance d = 0.5 km, lambda = 0.5:
    S_emergency = 100 * exp(-0.5 * 0.5) = 100 * exp(-0.25) = 77.880... ≈ 78
    """
    score = calculate_emergency_score(distance_km=0.5, decay_lambda=0.5)
    assert round(score) == 78
    assert score == pytest.approx(77.88, abs=0.1)


def test_zero_distance_is_perfect_score():
    score = calculate_emergency_score(distance_km=0.0)
    assert score == 100.0


def test_far_distance_decays():
    # 5 km away: 100 * exp(-0.5 * 5) = 100 * exp(-2.5) = 8.208... ≈ 8
    score = calculate_emergency_score(distance_km=5.0)
    assert round(score) == 8


def test_find_nearest_emergency_service(mock_amenities):
    from backend.scoring.emergency import get_nearest_emergency_distance
    # Point near Sancheti Hospital (lat: 18.5285, lon: 73.8520)
    dist = get_nearest_emergency_distance(18.5285, 73.8520, mock_amenities)
    assert dist == pytest.approx(0.0, abs=0.01)
