"""
Route Safety Score (RSS) Module.
Aggregates Segment Safety Scores across a multi-segment route using
SafetiPin-style length-weighted spatial averaging, then applies dynamic
temporal and calendar modifiers, finally clipping to [0.0, 100.0].
"""
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional
from .temporal import calculate_temporal_adjustment, get_time_modifier, get_weekend_modifier


@dataclass(frozen=True)
class RouteSegment:
    """Represents a discrete road segment traversed in a route."""
    length_meters: float
    sss: float


def calculate_raw_rss(segments: List[RouteSegment]) -> float:
    """
    Computes the raw Route Safety Score via length-weighted spatial averaging.
    Prevents a long route from hiding a highly dangerous short corridor.

    Formula:
    Raw_RSS = sum(length_i * sss_i) / sum(length_i)

    Parameters
    ----------
    segments : list of RouteSegment
        List of segments comprising the path.

    Returns
    -------
    float
        Length-weighted route safety score in [0.0, 100.0].
    """
    if not segments:
        return 0.0

    total_length = sum(s.length_meters for s in segments)
    if total_length <= 0.0:
        return 0.0

    weighted_sum = sum(s.length_meters * s.sss for s in segments)
    raw_score = weighted_sum / total_length
    return max(0.0, min(100.0, raw_score))


def calculate_rss(
    raw_rss: float,
    departure_time: Optional[datetime] = None
) -> float:
    """
    Calculates the final Unified Route Safety Score (RSS) adjusted for
    departure time and day, strictly clipped to [0.0, 100.0].

    Formula:
    RSS = min(100.0, max(0.0, Raw_RSS + Time_Modifier + Weekend_Modifier))

    Parameters
    ----------
    raw_rss : float
        Unadjusted length-weighted Route Safety Score in [0.0, 100.0].
    departure_time : datetime, optional
        Trip departure datetime. If None, no temporal adjustments are made.

    Returns
    -------
    float
        Final bounded Route Safety Score in [0.0, 100.0].
    """
    score = float(raw_rss)

    if departure_time is not None:
        adjustment = calculate_temporal_adjustment(departure_time)
        score += adjustment

    return max(0.0, min(100.0, score))


# ==============================================================================
# Research Formulation: compute_rss(path_segments, trip_start_datetime)
# ==============================================================================

from typing import Dict, Any, Union


def compute_rss(
    path_segments: List[Union[Dict[str, Any], RouteSegment]],
    trip_start_datetime: Optional[datetime] = None
) -> float:
    """
    Computes the Unified Route Safety Score (RSS) via length-weighted spatial averaging:

    Raw Route Score = sum(SSS_i * (Length_i / Total_Route_Length))
    RSS = Raw Route Score + Time Modifier + Weekend Modifier, clipped to [0.0, 100.0].

    Parameters
    ----------
    path_segments : list of RouteSegment or dict
        Segments comprising the route. Each segment can be:
        - RouteSegment(length_meters=..., sss=...)
        - dict with 'length_meters' (or 'length') and 'sss', OR raw segment features
          ('wsi', 'lit', 'sidewalk', etc.) evaluated dynamically via compute_sss(segment).
    trip_start_datetime : datetime, optional
        Trip departure datetime used to compute time and weekend modifiers:
        - 07:00 - 11:59: +8.0
        - 12:00 - 16:59: +5.0
        - 20:00 - 22:59: -10.0
        - 23:00 - 04:59: -20.0
        - Weekend penalty (Fri 20:00 to Sun 23:59): -3.0

    Returns
    -------
    float
        Bounded Route Safety Score in [0.0, 100.0].
    """
    if not path_segments:
        return 0.0

    weighted_sum = 0.0
    total_length = 0.0

    for item in path_segments:
        if isinstance(item, RouteSegment):
            length = float(item.length_meters)
            sss = float(item.sss)
        elif isinstance(item, dict):
            length = float(item.get("length_meters", item.get("length", 0.0)))
            if "sss" in item and item["sss"] is not None:
                sss = float(item["sss"])
            else:
                from .sss import compute_sss
                computed = compute_sss(item)
                if computed is not None:
                    sss = float(computed)
                else:
                    sss = float(item.get("default_sss", 50.0))
        else:
            length = float(getattr(item, "length_meters", getattr(item, "length", 0.0)))
            sss = float(getattr(item, "sss", 50.0))

        if length < 0.0:
            length = 0.0

        total_length += length
        weighted_sum += length * sss

    if total_length <= 0.0:
        return 0.0

    raw_route_score = weighted_sum / total_length

    # Apply temporal modifiers
    score = raw_route_score
    if trip_start_datetime is not None:
        t_mod = get_time_modifier(trip_start_datetime)
        w_mod = get_weekend_modifier(trip_start_datetime)
        score += (t_mod + w_mod)

    return max(0.0, min(100.0, round(score, 2)))

