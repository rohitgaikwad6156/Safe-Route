"""
Unit tests for research document Pedestrian Safety Score (PSS) 6-factor model.
"""
import pytest
from backend.scoring.pedestrian import (
    calculate_pss,
    calculate_sidewalk_subscore,
    calculate_crossing_subscore,
    calculate_road_class_subscore,
    calculate_speed_regulation_subscore,
    calculate_width_exposure_subscore,
    calculate_pedestrian_signal_requirement,
)


def test_calculate_sidewalk_subscore():
    assert calculate_sidewalk_subscore("both", "primary") == 1.0
    assert calculate_sidewalk_subscore("yes", "secondary") == 1.0
    assert calculate_sidewalk_subscore(None, "footway") == 1.0
    assert calculate_sidewalk_subscore("left", "secondary") == 0.6
    assert calculate_sidewalk_subscore("right", "tertiary") == 0.6
    assert calculate_sidewalk_subscore("no", "primary") == 0.0


def test_calculate_crossing_subscore():
    assert calculate_crossing_subscore("traffic_signals", has_refuge_island=True) == 1.0
    assert calculate_crossing_subscore("traffic_signals", has_refuge_island=False) == 0.8
    assert calculate_crossing_subscore("uncontrolled") == 0.5
    assert calculate_crossing_subscore("zebra") == 0.5
    assert calculate_crossing_subscore("unmarked") == 0.0
    assert calculate_crossing_subscore(None) == 0.0


def test_calculate_road_class_subscore():
    assert calculate_road_class_subscore("pedestrian") == 1.0
    assert calculate_road_class_subscore("living_street") == 1.0
    assert calculate_road_class_subscore("residential") == 0.9
    assert calculate_road_class_subscore("secondary") == 0.6
    assert calculate_road_class_subscore("tertiary") == 0.6
    assert calculate_road_class_subscore("primary") == 0.3
    assert calculate_road_class_subscore("trunk") == 0.0
    assert calculate_road_class_subscore("motorway") == 0.0


def test_calculate_speed_regulation_subscore():
    assert calculate_speed_regulation_subscore(maxspeed_kmph=20.0) == 1.0
    assert calculate_speed_regulation_subscore(maxspeed_kmph=30.0) == 1.0
    assert calculate_speed_regulation_subscore(traffic_calming=True) == 1.0
    assert calculate_speed_regulation_subscore(maxspeed_kmph=80.0) == 0.0
    assert calculate_speed_regulation_subscore(maxspeed_kmph=90.0) == 0.0
    # 55 km/h is midway between 30 and 80 -> 0.5
    assert pytest.approx(calculate_speed_regulation_subscore(maxspeed_kmph=55.0), rel=1e-2) == 0.5


def test_calculate_width_exposure_subscore():
    assert calculate_width_exposure_subscore(width_meters=10.0) == 1.0
    assert calculate_width_exposure_subscore(width_meters=12.0) == 1.0
    assert calculate_width_exposure_subscore(width_meters=20.0) == 0.0
    assert calculate_width_exposure_subscore(width_meters=25.0) == 0.0
    # 16m is midway between 12 and 20 -> 0.5
    assert pytest.approx(calculate_width_exposure_subscore(width_meters=16.0), rel=1e-2) == 0.5


def test_calculate_pedestrian_signal_requirement():
    # PMC formula: crossing_length + 7 seconds reaction buffer
    assert calculate_pedestrian_signal_requirement(crossing_length_meters=15.0) == 22.0
    assert calculate_pedestrian_signal_requirement(crossing_length_meters=10.0) == 17.0
    assert calculate_pedestrian_signal_requirement(crossing_length_meters=0.0) == 7.0


def test_calculate_pss_composite():
    # Perfect infrastructure, zero crash penalty
    pss_perfect = calculate_pss(
        sidewalk_score=1.0,
        crossing_score=1.0,
        road_score=1.0,
        lighting_score=1.0,
        speed_score=1.0,
        width_score=1.0,
        crash_risk_penalty=1.0
    )
    assert pss_perfect == 100.0

    # 50% crash penalty reduces PSS by half
    pss_penalized = calculate_pss(
        sidewalk_score=1.0,
        crossing_score=1.0,
        road_score=1.0,
        lighting_score=1.0,
        speed_score=1.0,
        width_score=1.0,
        crash_risk_penalty=0.5
    )
    assert pss_penalized == 50.0

    # Worked example: ITI Complete Street vs unimproved secondary
    # Baner / Aundh ITI road profile: wide sidewalks (1.0), signalized crossings (1.0), secondary road (0.6),
    # lit (1.0), 30 km/h (1.0), 12m RoW (1.0) -> PSS ~ 94
    pss_iti = calculate_pss(
        sidewalk_score=1.0,
        crossing_score=1.0,
        road_score=0.6,
        lighting_score=1.0,
        speed_score=1.0,
        width_score=1.0,
        crash_risk_penalty=1.0
    )
    assert pss_iti >= 90.0
