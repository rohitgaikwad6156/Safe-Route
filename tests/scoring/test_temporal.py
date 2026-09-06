"""
Tests for temporal and weekend modifiers.
Schedule:
7 AM - 11:59 AM: +8
12 PM - 4:59 PM: +5
8 PM - 10:59 PM: -10
11 PM - 5:00 AM: -20
Weekend (Fri night - Sun night): -3
"""
from datetime import datetime, time
import pytest
from backend.scoring.temporal import get_time_modifier, get_weekend_modifier, calculate_temporal_adjustment


def test_morning_peak_modifier():
    assert get_time_modifier(time(8, 30)) == 8.0
    assert get_time_modifier(time(7, 0)) == 8.0
    assert get_time_modifier(time(11, 59)) == 8.0


def test_daytime_peak_modifier():
    assert get_time_modifier(time(14, 0)) == 5.0
    assert get_time_modifier(time(12, 0)) == 5.0
    assert get_time_modifier(time(16, 59)) == 5.0


def test_late_evening_modifier():
    assert get_time_modifier(time(20, 30)) == -10.0
    assert get_time_modifier(time(22, 59)) == -10.0


def test_dead_of_night_modifier():
    assert get_time_modifier(time(23, 0)) == -20.0
    assert get_time_modifier(time(1, 30)) == -20.0
    assert get_time_modifier(time(4, 59)) == -20.0


def test_neutral_hours():
    assert get_time_modifier(time(18, 0)) == 0.0
    assert get_time_modifier(time(6, 0)) == 0.0


def test_weekend_penalty():
    # Friday night (weekday = 4, hour >= 20) -> -3
    fri_night = datetime(2026, 9, 4, 21, 0)
    assert get_weekend_modifier(fri_night) == -3.0

    # Saturday (weekday = 5) -> -3
    sat = datetime(2026, 9, 5, 14, 0)
    assert get_weekend_modifier(sat) == -3.0

    # Sunday (weekday = 6) -> -3
    sun = datetime(2026, 9, 6, 10, 0)
    assert get_weekend_modifier(sun) == -3.0

    # Wednesday afternoon (weekday = 2) -> 0
    wed = datetime(2026, 9, 2, 14, 0)
    assert get_weekend_modifier(wed) == 0.0


def test_combined_11pm_weekend():
    # 11 PM on Saturday: -20 (time) + -3 (weekend) = -23
    sat_night = datetime(2026, 9, 5, 23, 0)
    assert calculate_temporal_adjustment(sat_night) == -23.0
