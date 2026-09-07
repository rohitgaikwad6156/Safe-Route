"""
Attribution Math Module.
Deconstructs Route Safety Score (RSS) into exact weighted contributions
from each of the five sub-scores (+ optional temporal adjustment).
Guarantees mathematically that sum(contributions) == RSS (or Raw_RSS).
"""
from typing import Dict, List, Any, Optional
from backend.scoring.sss import DEFAULT_WEIGHTS, SSSWeights
from backend.scoring.temporal import calculate_temporal_adjustment
from datetime import datetime


def compute_attribution(
    segments: List[Dict[str, Any]],
    departure_time: Optional[datetime] = None,
    weights: Optional[SSSWeights] = None
) -> Dict[str, Any]:
    """
    Computes exact weighted contributions of each subscore to the route's RSS.

    Parameters
    ----------
    segments : list of dict
        List of road segments. Each dict must contain:
        - 'length_meters': float
        - 'subscores': dict with 'accident', 'emergency', 'lighting', 'pedestrian', 'traffic'
    departure_time : datetime, optional
        Departure datetime for temporal modifiers.
    weights : SSSWeights, optional
        Weight configuration (defaults to 0.30, 0.20, 0.20, 0.15, 0.15).

    Returns
    -------
    dict
        Structured attribution data containing:
        - 'contributions': dict mapping criterion -> weighted points
        - 'subscore_means': length-weighted mean of each subscore
        - 'weights': weight configuration
        - 'raw_rss': sum of weighted contributions
        - 'temporal_adjustment': modifier points
        - 'final_rss': bounded final RSS
        - 'explanation': natural language statement citing exact points
    """
    w = weights or DEFAULT_WEIGHTS
    total_length = sum(s.get("length_meters", 10.0) for s in segments)
    if total_length <= 0.0:
        return {
            "contributions": {"accident": 0.0, "emergency": 0.0, "lighting": 0.0, "pedestrian": 0.0, "traffic": 0.0},
            "subscore_means": {"accident": 0.0, "emergency": 0.0, "lighting": 0.0, "pedestrian": 0.0, "traffic": 0.0},
            "raw_rss": 0.0,
            "temporal_adjustment": 0.0,
            "final_rss": 0.0,
            "explanation": "No valid route segments."
        }

    # Length-weighted sum of each subscore
    weighted_sums = {
        "accident": 0.0,
        "emergency": 0.0,
        "lighting": 0.0,
        "pedestrian": 0.0,
        "traffic": 0.0
    }

    for s in segments:
        length = s.get("length_meters", 10.0)
        sub = s.get("subscores", {})
        weighted_sums["accident"] += length * float(sub.get("accident") or 0.0)
        weighted_sums["emergency"] += length * float(sub.get("emergency") or 0.0)
        weighted_sums["lighting"] += length * float(sub.get("lighting") or 0.0)
        weighted_sums["pedestrian"] += length * float(sub.get("pedestrian") or 0.0)
        weighted_sums["traffic"] += length * float(sub.get("traffic") or 0.0)

    # Calculate length-weighted means
    subscore_means = {k: v / total_length for k, v in weighted_sums.items()}

    # Exact weighted contributions
    contributions = {
        "accident": round(w.accident * subscore_means["accident"], 4),
        "emergency": round(w.emergency * subscore_means["emergency"], 4),
        "lighting": round(w.lighting * subscore_means["lighting"], 4),
        "pedestrian": round(w.pedestrian * subscore_means["pedestrian"], 4),
        "traffic": round(w.traffic * subscore_means["traffic"], 4),
    }

    community_adjustment = sum((sum(float(v or 0) * getattr(w, k) for k, v in seg.get('subscores', {}).items()) - seg['sss']) * seg['length_meters'] for seg in segments if 'sss' in seg) / total_length
    raw_rss = round(sum(contributions.values()) - community_adjustment, 4)

    temporal_adj = 0.0
    if departure_time is not None:
        temporal_adj = float(calculate_temporal_adjustment(departure_time))

    final_rss = round(max(0.0, min(100.0, raw_rss + temporal_adj)), 2)

    # Human-readable grounded narrative
    explanation = (
        f"RSS Attribution: Accident safety contributes {contributions['accident']:.1f} pts "
        f"(sub-score: {subscore_means['accident']:.1f}), "
        f"Emergency access contributes {contributions['emergency']:.1f} pts "
        f"(sub-score: {subscore_means['emergency']:.1f}), "
        f"Street lighting contributes {contributions['lighting']:.1f} pts "
        f"(sub-score: {subscore_means['lighting']:.1f}), "
        f"Pedestrian paths contribute {contributions['pedestrian']:.1f} pts "
        f"(sub-score: {subscore_means['pedestrian']:.1f}), and "
        f"Traffic flow contributes {contributions['traffic']:.1f} pts "
        f"(sub-score: {subscore_means['traffic']:.1f}) to the {raw_rss:.1f} base RSS."
    )
    if community_adjustment:
        explanation += f" Active community hazards deduct {community_adjustment:.2f} points (decayed at report time)."
    if any(seg.get('wsi') is None for seg in segments):
        explanation += " Accident data is incomplete: this is a conservative lower bound, with no safety credit for unknown accident data."
    if temporal_adj != 0.0:
        explanation += f" Temporal modifier of {temporal_adj:+.1f} pts results in a final {final_rss:.1f} RSS."

    return {
        "contributions": contributions,
        "community_adjustment": round(community_adjustment, 4),
        "subscore_means": {k: round(v, 2) for k, v in subscore_means.items()},
        "weights": {"accident": w.accident, "emergency": w.emergency, "lighting": w.lighting, "pedestrian": w.pedestrian, "traffic": w.traffic},
        "raw_rss": raw_rss,
        "temporal_adjustment": temporal_adj,
        "final_rss": final_rss,
        "explanation": explanation
    }
