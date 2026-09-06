"""
SafeRoute AI Scoring Package.
Pure, typed scoring functions for accident, emergency, lighting, pedestrian, traffic,
Segment Safety Score (SSS), Route Safety Score (RSS), and temporal modifiers.
"""

from .accident import calculate_accident_score
from .emergency import calculate_emergency_score, get_nearest_emergency_distance
from .lighting import calculate_lighting_score
from .pedestrian import (
    calculate_pedestrian_score,
    calculate_pss,
    calculate_sidewalk_subscore,
    calculate_crossing_subscore,
    calculate_road_class_subscore,
    calculate_speed_regulation_subscore,
    calculate_width_exposure_subscore,
    calculate_pedestrian_signal_requirement
)
from .traffic import calculate_traffic_score
from .sss import calculate_sss, SSSWeights, compute_sss, compute_sss_detailed, UnloggedAccidentDataError
from .temporal import get_time_modifier, get_weekend_modifier, calculate_temporal_adjustment
from .rss import calculate_raw_rss, calculate_rss, compute_rss, RouteSegment
from .corroboration import submit_incident, calculate_dynamic_hazard, get_incident, get_privacy_aggregated_incidents

__all__ = [
    "calculate_accident_score",
    "calculate_emergency_score",
    "get_nearest_emergency_distance",
    "calculate_lighting_score",
    "calculate_pedestrian_score",
    "calculate_pss",
    "calculate_sidewalk_subscore",
    "calculate_crossing_subscore",
    "calculate_road_class_subscore",
    "calculate_speed_regulation_subscore",
    "calculate_width_exposure_subscore",
    "calculate_pedestrian_signal_requirement",
    "calculate_traffic_score",
    "calculate_sss",
    "compute_sss",
    "compute_sss_detailed",
    "UnloggedAccidentDataError",
    "SSSWeights",
    "get_time_modifier",
    "get_weekend_modifier",
    "calculate_temporal_adjustment",
    "calculate_raw_rss",
    "calculate_rss",
    "compute_rss",
    "RouteSegment",
    "submit_incident",
    "calculate_dynamic_hazard",
    "get_incident",
    "get_privacy_aggregated_incidents"
]

