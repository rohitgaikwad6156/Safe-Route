"""
Tests for Unified Route Safety Score (RSS).
Required cases:
1. a 2 km route with one 200 m severe segment must score materially worse than a
   naive mean would suggest — prove the length-weighting works
2. 11 PM weekend departure applies -20 and -3 and clips to [0,100]
"""
from datetime import datetime
import pytest
from backend.scoring.rss import calculate_raw_rss, calculate_rss, compute_rss, RouteSegment


def test_length_weighting_vs_naive_mean():
    """
    Spec worked example:
    A 2 km (2000m) route consisting of:
    - 18 safe segments of 100m each (total 1800m), each with SSS = 90.0
    - 1 severe hazard segment of 200m (total 200m), with SSS = 10.0

    Naive segment mean (arithmetic mean across the 19 segments):
      (18 * 90.0 + 1 * 10.0) / 19 = 1630 / 19 ≈ 85.79 (falsely presents route as very safe)

    Length-weighted spatial average (SafetiPin methodology):
      (1800m * 90.0 + 200m * 10.0) / 2000m = (162000 + 2000) / 2000 = 82.0

    Prove that length-weighting gives a materially worse score (82.0 < 85.79)
    because the severe 200m segment accounts for 10% of total travel distance,
    rather than being drowned out as 1 of 19 equal votes.
    """
    segments = [
        RouteSegment(length_meters=100.0, sss=90.0) for _ in range(18)
    ] + [
        RouteSegment(length_meters=200.0, sss=10.0)
    ]

    total_length = sum(s.length_meters for s in segments)
    assert total_length == 2000.0

    naive_mean = sum(s.sss for s in segments) / len(segments)
    length_weighted_score = calculate_raw_rss(segments)

    # Prove length-weighted score is 82.0
    assert length_weighted_score == pytest.approx(82.0, abs=0.01)
    
    # Prove naive mean is ~85.79
    assert naive_mean == pytest.approx(85.79, abs=0.01)

    # Prove length weighting scores materially worse than naive mean
    assert length_weighted_score < naive_mean
    assert (naive_mean - length_weighted_score) >= 3.5  # Material difference


def test_11pm_weekend_departure_applies_modifiers_and_clips():
    """
    Required case:
    11 PM weekend departure applies -20 and -3 and clips to [0,100].
    """
    # Saturday at 23:00 (11 PM)
    departure_time = datetime(2026, 9, 5, 23, 0)

    # Case A: Standard safe route (Raw RSS = 80.0)
    # 80.0 - 20 (night) - 3 (weekend) = 57.0
    rss_standard = calculate_rss(raw_rss=80.0, departure_time=departure_time)
    assert rss_standard == 57.0

    # Case B: Low-scoring route that drops below 0:
    # Raw RSS = 15.0: 15.0 - 20 - 3 = -8.0 -> clips to 0.0
    rss_clipped_low = calculate_rss(raw_rss=15.0, departure_time=departure_time)
    assert rss_clipped_low == 0.0

    # Case C: Daytime route that exceeds 100:
    # Monday at 08:30 (Morning peak: +8)
    monday_morning = datetime(2026, 9, 7, 8, 30)
    rss_clipped_high = calculate_rss(raw_rss=96.0, departure_time=monday_morning)
    assert rss_clipped_high == 100.0  # 96 + 8 = 104 -> clipped to 100.0


def test_empty_route_returns_zero():
    assert calculate_raw_rss([]) == 0.0
    assert compute_rss([]) == 0.0


# ==============================================================================
# Research Formulation: compute_rss and Hidden Corridor Tests
# ==============================================================================

def test_compute_rss_hidden_500m_corridor_problem():
    """
    Research Spec:
    Assert a route through a single high-WSI segment scores worse than an equal-length
    route through low-risk segments even when the dangerous segment is short
    (the "hidden 500m corridor" problem that length-weighting is designed to prevent).

    Setup:
    Two routes of equal total length = 5,000 meters (5 km).

    1. Route A (Safe Route - Low Risk Baseline):
       - 10 segments of 500m each (or 4500m + 500m), all with high safety (SSS = 85.0).
       - Total length = 5,000m.
       - Raw RSS = 85.0.

    2. Route B (Dangerous Route with Hidden 500m Blackspot Corridor):
       - 9 safe segments of 500m each (total 4,500m), SSS = 85.0.
       - 1 severe blackspot segment of 500m (total 500m, only 10% of route distance!),
         passing through a critical high-WSI corridor (SSS = 10.0).
       - Total length = 5,000m.
       - Length-weighted Raw RSS = (4500 * 85.0 + 500 * 10.0) / 5000 = (382500 + 5000) / 5000 = 77.5.

    Assertions:
    1. Route with the dangerous 500m corridor scores materially worse than the all-safe route:
       compute_rss(route_b) < compute_rss(route_a).
    2. The 500m hazard drops the score by exactly 7.5 points (77.5 vs 85.0), proving it cannot
       hide behind the 4,500m of safe road.
    3. If a naive unweighted average were used with fragmented safe blocks (e.g. forty-five 100m
       safe segments + one 500m danger segment), the naive average would be (45*85 + 10)/46 = 83.37,
       which would dangerously dilute and mask the hazard. Length-weighted compute_rss avoids this.
    """
    # Route A: All safe segments (5,000 m total)
    route_safe = [
        RouteSegment(length_meters=500.0, sss=85.0) for _ in range(10)
    ]

    # Route B: 4,500 m safe + 500 m dangerous corridor (5,000 m total)
    route_with_danger = [
        RouteSegment(length_meters=500.0, sss=85.0) for _ in range(9)
    ] + [
        RouteSegment(length_meters=500.0, sss=10.0)  # High-WSI corridor
    ]

    rss_safe = compute_rss(route_safe)
    rss_danger = compute_rss(route_with_danger)

    # 1. Assert route with single high-WSI segment scores worse
    assert rss_danger < rss_safe

    # 2. Assert exact scores and clear penalty
    assert rss_safe == 85.0
    assert rss_danger == 77.5
    assert (rss_safe - rss_danger) == 7.5

    # 3. Prove naive segment counting masks the 500m hazard if fragmented
    fragmented_safe = [RouteSegment(length_meters=100.0, sss=85.0) for _ in range(45)]
    one_danger_seg = [RouteSegment(length_meters=500.0, sss=10.0)]
    fragmented_route = fragmented_safe + one_danger_seg
    naive_unweighted_average = sum(s.sss for s in fragmented_route) / len(fragmented_route)
    length_weighted_score = compute_rss(fragmented_route)

    # Naive average falsely reports 83.37 (drowning out the danger)
    assert naive_unweighted_average == pytest.approx(83.37, abs=0.01)
    # Length-weighted compute_rss correctly preserves the true 77.50 score
    assert length_weighted_score == pytest.approx(77.50, abs=0.01)
    assert length_weighted_score < naive_unweighted_average


def test_compute_rss_temporal_modifiers():
    """
    Tests compute_rss with all specified time and weekend modifiers:
    - 7-11:59am: +8
    - 12-4:59pm: +5
    - 8-10:59pm: -10
    - 11pm-5am: -20
    - Weekend (Fri night - Sun night): -3
    - Clipped to [0, 100]
    """
    base_route = [
        RouteSegment(length_meters=1000.0, sss=70.0),
        RouteSegment(length_meters=1000.0, sss=70.0)
    ]  # Raw score = 70.0

    # 1. Weekday Morning (Tuesday 08:30): +8 -> 78.0
    tuesday_morning = datetime(2026, 9, 8, 8, 30)
    assert compute_rss(base_route, tuesday_morning) == 78.0

    # 2. Weekday Daytime (Tuesday 14:00): +5 -> 75.0
    tuesday_afternoon = datetime(2026, 9, 8, 14, 0)
    assert compute_rss(base_route, tuesday_afternoon) == 75.0

    # 3. Weekday Late Evening (Tuesday 21:00): -10 -> 60.0
    tuesday_evening = datetime(2026, 9, 8, 21, 0)
    assert compute_rss(base_route, tuesday_evening) == 60.0

    # 4. Weekday Dead of Night (Tuesday 23:30): -20 -> 50.0
    tuesday_night = datetime(2026, 9, 8, 23, 30)
    assert compute_rss(base_route, tuesday_night) == 50.0

    # 5. Weekend Modifier: Friday Night (Friday 21:00): -10 (time) - 3 (weekend) = -13 -> 57.0
    friday_night = datetime(2026, 9, 4, 21, 0)
    assert compute_rss(base_route, friday_night) == 57.0

    # 6. Combined 11 PM Weekend Departure (Saturday 23:15): -20 (night) - 3 (weekend) = -23 -> 47.0
    saturday_late = datetime(2026, 9, 5, 23, 15)
    assert compute_rss(base_route, saturday_late) == 47.0

    # 7. Clipping bounds:
    # High clip: raw 95 + 8 = 103 -> 100.0
    high_route = [RouteSegment(length_meters=1000.0, sss=95.0)]
    assert compute_rss(high_route, tuesday_morning) == 100.0

    # Low clip: raw 10 - 23 = -13 -> 0.0
    low_route = [RouteSegment(length_meters=1000.0, sss=10.0)]
    assert compute_rss(low_route, saturday_late) == 0.0


def test_compute_rss_with_raw_segment_dicts_evaluating_sss():
    """
    Tests compute_rss accepting raw segment dictionaries with features
    evaluated dynamically via compute_sss.
    """
    safe_dict = {
        "length_meters": 1000.0,
        "wsi": 0.0,
        "lit": "yes",
        "sidewalk": "both",
        "highway": "residential",
        "traffic": "free_flow",
        "emergency_distance_km": 0.2
    }
    danger_dict = {
        "length_meters": 500.0,
        "wsi": 34.0,  # Katraj-style blackspot
        "lit": "no",
        "sidewalk": "no",
        "highway": "trunk",
        "traffic": "severe",
        "emergency_distance_km": 2.5
    }

    # Combined 1500m route: 1000m safe (~98.1) + 500m danger (~9.59)
    # Expected weighted score: (1000 * 98.1 + 500 * 9.59) / 1500 = (98100 + 4795) / 1500 ≈ 68.60
    rss = compute_rss([safe_dict, danger_dict])
    assert 65.0 <= rss <= 72.0

