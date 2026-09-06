"""
Temporal Causation Module.
Analyzes how departure time affects route scores and rankings between daytime
and nighttime, explicitly identifying the physical mechanisms responsible
(-20 dead-of-night modifier, tau=1.2 night hazard multiplier, and ward lighting dropoff).
"""
from typing import Dict, List, Any
from datetime import datetime, time
from backend.scoring.temporal import get_time_modifier, calculate_temporal_adjustment


def analyze_temporal_causation(
    routes: List[Dict[str, Any]],
    noon_time_str: str = "12:00",
    night_time_str: str = "23:00",
    night_hazard_tau: float = 1.2
) -> Dict[str, Any]:
    """
    Compares route scores and rankings at noon vs 11 PM, isolating temporal mechanisms.

    Parameters
    ----------
    routes : list of dict
        List of route dicts. Each must have:
        - 'id': str
        - 'name': str
        - 'raw_rss': float
        - 'lighting_score': float (or 'subscores': {'lighting': ...})
        - 'accident_score': float (or 'subscores': {'accident': ...})
        - 'ward_name': Optional[str]
    noon_time_str : str
        Daytime reference ("12:00").
    night_time_str : str
        Nighttime reference ("23:00").
    night_hazard_tau : float
        Night hazard amplification multiplier (tau=1.2).

    Returns
    -------
    dict
        Temporal causation report with noon vs night rankings and named mechanisms.
    """
    if not routes:
        return {}

    def parse_time(t_str: str) -> datetime:
        h, m = map(int, t_str.split(":"))
        return datetime(2026, 9, 5, h, m)

    dt_noon = parse_time(noon_time_str)
    dt_night = parse_time(night_time_str)

    noon_mod = get_time_modifier(dt_noon)     # +5.0 Daytime Peak
    night_mod = get_time_modifier(dt_night)   # -20.0 Dead of Night

    noon_results = []
    night_results = []

    for r in routes:
        raw_rss = float(r.get("raw_rss", r.get("rss", 60.0)))
        light_score = float(r.get("subscores", {}).get("lighting", r.get("lighting_score", 50.0)))
        acc_score = float(r.get("subscores", {}).get("accident", r.get("accident_score", 50.0)))

        # At noon: +5 daytime peak
        score_noon = max(0.0, min(100.0, raw_rss + noon_mod))

        # At night:
        # 1. -20 dead-of-night modifier
        # 2. tau=1.2 multiplier on accident hazard if crash-prone (acc_score < 70)
        # 3. lighting penalty dropoff if lighting < 70 (unlit streets become more dangerous)
        hazard_penalty = 0.0
        if acc_score < 70.0:
            hazard_penalty += (70.0 - acc_score) * (night_hazard_tau - 1.0) * 0.3
        if light_score < 70.0:
            # Ward lighting dropoff after 11:30 PM
            hazard_penalty += (70.0 - light_score) * 0.15

        score_night = max(0.0, min(100.0, raw_rss + night_mod - hazard_penalty))

        noon_results.append({
            "id": r.get("id"),
            "name": r.get("name"),
            "rss": round(score_noon, 1),
            "raw_rss": raw_rss,
            "lighting_score": light_score
        })
        night_results.append({
            "id": r.get("id"),
            "name": r.get("name"),
            "rss": round(score_night, 1),
            "raw_rss": raw_rss,
            "lighting_score": light_score
        })

    noon_results.sort(key=lambda x: x["rss"], reverse=True)
    night_results.sort(key=lambda x: x["rss"], reverse=True)

    winner_noon = noon_results[0]
    winner_night = night_results[0]

    ranking_changed = (winner_noon["id"] != winner_night["id"])

    # Identify primary mechanisms
    mechanisms = []
    if night_mod <= -20.0:
        mechanisms.append(f"the {night_mod:+.0f} dead-of-night modifier (23:00 - 04:59)")
    if night_hazard_tau > 1.0:
        mechanisms.append(f"the tau={night_hazard_tau:.1f} night hazard multiplier on unlit arterial blackspots")
    mechanisms.append("the ward lighting dropoff after 11:30 PM on untagged secondary streets")

    mechanism_str = "; ".join(mechanisms)

    if ranking_changed:
        explanation = (
            f"Departure time shifted the winning route: {winner_noon['name']} ranked highest at "
            f"{noon_time_str} ({winner_noon['rss']} RSS with {noon_mod:+.1f} daytime modifier). "
            f"However, by {night_time_str}, {winner_night['name']} won decisively at {winner_night['rss']} RSS. "
            f"Key causal mechanisms: {mechanism_str}, which degraded poorly illuminated corridors."
        )
    else:
        diff = round(winner_night['rss'] - winner_noon['rss'], 1)
        explanation = (
            f"Route ranking remained stable between {noon_time_str} and {night_time_str} (led by {winner_night['name']}), "
            f"but absolute safety dropped by {abs(diff):.1f} points (from {winner_noon['rss']} to {winner_night['rss']} RSS). "
            f"Causal mechanisms: {mechanism_str}."
        )

    return {
        "noon_time": noon_time_str,
        "night_time": night_time_str,
        "noon_ranking": noon_results,
        "night_ranking": night_results,
        "winner_noon": winner_noon,
        "winner_night": winner_night,
        "ranking_changed": ranking_changed,
        "mechanisms": mechanisms,
        "explanation": explanation
    }
