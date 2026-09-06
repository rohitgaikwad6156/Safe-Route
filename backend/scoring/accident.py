"""
Accident Risk Sub-score Module.
Formula:
S_accident = max(0.0, 100.0 - (WSI / WSI_max * 100.0))
Higher is safer (100 = safe, 0 = severe danger).
"""

DEFAULT_WSI_MAX: float = 35.0


def calculate_accident_score(wsi: float, wsi_max: float = DEFAULT_WSI_MAX) -> float:
    """
    Calculates the accident safety sub-score from the Weighted Severity Index (WSI).

    Parameters
    ----------
    wsi : float
        Weighted Severity Index for the street segment or grid cell (>= 0).
    wsi_max : float, optional
        Maximum reference WSI for normalization, defaults to 35.0.

    Returns
    -------
    float
        Normalized safety score in [0.0, 100.0], where 100 is safe and 0 is dangerous.
    """
    if wsi <= 0.0:
        return 100.0
    if wsi_max <= 0.0:
        return 0.0

    raw_penalty = (float(wsi) / float(wsi_max)) * 100.0
    score = 100.0 - raw_penalty
    return max(0.0, min(100.0, score))
