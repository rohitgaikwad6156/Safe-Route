"""
Tests for traffic congestion sub-score.
Formula: Free-flow = 100, Moderate = 60, Severe gridlock = 20.
"""
import pytest
from backend.scoring.traffic import calculate_traffic_score


def test_free_flow_green():
    assert calculate_traffic_score(congestion_level="free_flow") == 100.0
    assert calculate_traffic_score(congestion_level="green") == 100.0


def test_moderate_congestion_amber():
    assert calculate_traffic_score(congestion_level="moderate") == 60.0
    assert calculate_traffic_score(congestion_level="amber") == 60.0


def test_severe_gridlock_red():
    assert calculate_traffic_score(congestion_level="severe") == 20.0
    assert calculate_traffic_score(congestion_level="red") == 20.0


def test_continuous_jam_factor():
    # Jam factor 0.0 -> 100, 5.0 -> 60, 10.0 -> 20
    assert calculate_traffic_score(jam_factor=0.0) == 100.0
    assert calculate_traffic_score(jam_factor=5.0) == 60.0
    assert calculate_traffic_score(jam_factor=10.0) == 20.0
