"""
Emergency Accessibility Sub-score Module.
Formula:
S_emergency = 100.0 * exp(-lambda * distance_km)
Where distance_km is distance to nearest hospital, police station, or Smart City ECB.
Default decay parameter lambda = 0.5 km^-1.
"""
import math
from typing import Any, Dict, List, Optional


DEFAULT_DECAY_LAMBDA: float = 0.5


def calculate_emergency_score(distance_km: float, decay_lambda: float = DEFAULT_DECAY_LAMBDA) -> float:
    """
    Calculates the emergency accessibility sub-score from distance in kilometers.

    Parameters
    ----------
    distance_km : float
        Distance to the nearest emergency facility in kilometers (>= 0).
    decay_lambda : float, optional
        Spatial decay parameter (defaults to 0.5).

    Returns
    -------
    float
        Emergency accessibility score in [0.0, 100.0].
    """
    if distance_km <= 0.0:
        return 100.0

    score = 100.0 * math.exp(-decay_lambda * float(distance_km))
    return max(0.0, min(100.0, score))


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates great-circle distance between two points on earth in kilometers."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


def get_nearest_emergency_distance(
    lat: float,
    lon: float,
    amenities: Dict[str, List[Dict[str, Any]]]
) -> float:
    """
    Finds the shortest distance in kilometers from (lat, lon) to any hospital,
    police station, or emergency call box (ECB).
    """
    min_dist = float("inf")
    categories = ["hospitals", "police", "ecbs"]
    
    for cat in categories:
        for item in amenities.get(cat, []):
            d = haversine_km(lat, lon, float(item["lat"]), float(item["lon"]))
            if d < min_dist:
                min_dist = d

    return 0.0 if min_dist == float("inf") else min_dist
