"""
Traffic Congestion Sub-score Module.
Rules:
- Free-flow (Green): 100.0
- Moderate Congestion (Amber): 60.0
- Severe Gridlock / High Conflict Merging (Red): 20.0
- Continuous Jam Factor J in [0.0, 10.0]: S_traffic = max(0.0, 100.0 - 8.0 * J)
"""
from typing import Optional


def calculate_traffic_score(
    congestion_level: Optional[str] = None,
    jam_factor: Optional[float] = None
) -> float:
    """
    Calculates the traffic conditions sub-score.

    Parameters
    ----------
    congestion_level : str, optional
        Categorical traffic condition ('free_flow', 'green', 'moderate', 'amber', 'severe', 'red').
    jam_factor : float, optional
        Continuous congestion index from 0.0 (empty) to 10.0 (standstill).

    Returns
    -------
    float
        Traffic score in [0.0, 100.0].
    """
    if jam_factor is not None:
        jf = max(0.0, min(10.0, float(jam_factor)))
        return max(0.0, min(100.0, 100.0 - 8.0 * jf))

    if congestion_level is not None:
        lvl = str(congestion_level).strip().lower()
        if lvl in ("free_flow", "green", "light", "clear", "low"):
            return 100.0
        if lvl in ("moderate", "amber", "medium", "yellow"):
            return 60.0
        if lvl in ("severe", "red", "heavy", "gridlock", "standstill", "high"):
            return 20.0

    return 80.0  # Baseline normal traffic
