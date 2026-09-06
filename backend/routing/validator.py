"""
SafeRoute AI: Spatial Bounds & Routing Input Validator
Ensures coordinates fall within the calibrated Pune Metropolitan road network bbox.
Handles out-of-bounds inputs and identical origin/destination snapping gracefully.
"""
from typing import Tuple, Optional, Dict, Any
import math

# Pune Metropolitan Calibrated Bounding Box (docs/contracts/data.md)
PUNE_BBOX = {
    "min_lat": 18.380,  # Katraj / Kondhwa / Jambhulwadi / Saswad road
    "max_lat": 18.680,  # PCMC / Akurdi / Bhosari / Pune Airport
    "min_lon": 73.700,  # Hinjewadi / Wakad / Bavdhan / Pirangut
    "max_lon": 74.020,  # Hadapsar / Wagholi / Kharadi / Manjari
}

SUPPORTED_AREAS_TEXT = "Shivajinagar, Katraj, Kothrud, Aundh, Swargate, Hadapsar, Baner, Hinjawadi, and Viman Nagar"


def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates great-circle distance between two coordinates in meters."""
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2.0)**2
    return R * 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def validate_coordinates(lat: float, lon: float, role: str = "Location") -> Tuple[bool, Optional[str]]:
    """
    Validates whether coordinates fall inside the calibrated Pune Metropolitan bounding box.

    Returns
    -------
    Tuple[bool, Optional[str]]
        (is_valid, error_message)
    """
    if not (PUNE_BBOX["min_lat"] <= lat <= PUNE_BBOX["max_lat"]):
        return False, (
            f"{role} latitude {lat:.4f}° is outside the calibrated Pune service area "
            f"({PUNE_BBOX['min_lat']:.3f}° to {PUNE_BBOX['max_lat']:.3f}°N). "
            f"Supported corridors include {SUPPORTED_AREAS_TEXT}."
        )
    if not (PUNE_BBOX["min_lon"] <= lon <= PUNE_BBOX["max_lon"]):
        return False, (
            f"{role} longitude {lon:.4f}° is outside the calibrated Pune service area "
            f"({PUNE_BBOX['min_lon']:.3f}° to {PUNE_BBOX['max_lon']:.3f}°E). "
            f"Supported corridors include {SUPPORTED_AREAS_TEXT}."
        )
    return True, None


def is_identical_location(
    lat1: float, lon1: float, lat2: float, lon2: float, threshold_meters: float = 25.0
) -> bool:
    """Checks if two locations are practically identical (within threshold meters)."""
    return haversine_distance_meters(lat1, lon1, lat2, lon2) <= threshold_meters


def build_zero_distance_route(
    origin_name: str,
    destination_name: str,
    lat: float,
    lon: float
) -> Dict[str, Any]:
    """
    Constructs a valid, gracefully degraded route object when origin and destination
    are identical or snap to the same graph node. Never throws a 500 or divides by zero.
    """
    return {
        "id": "route-identical",
        "name": "Immediate Destination (0 m)",
        "type": "safest",
        "color": "#10b981",
        "distance_meters": 0.0,
        "duration_seconds": 0.0,
        "raw_rss": 100.0,
        "rss": 100.0,
        "risk_level": "Safe Corridor (Zero Road Exposure)",
        "reasons": [
            f"Origin and destination are identical ({origin_name}).",
            "Zero physical travel required with 0.0 meters road exposure.",
            "Maximum safety score (100.0 RSS) due to absent vehicular and nocturnal hazard conflict."
        ],
        "subscores": {
            "accident": 100.0,
            "emergency": 100.0,
            "lighting": 100.0,
            "pedestrian": 100.0,
            "traffic": 100.0
        },
        "attribution": {
            "contributions": {
                "accident": 30.0,
                "emergency": 20.0,
                "lighting": 20.0,
                "pedestrian": 15.0,
                "traffic": 15.0
            },
            "subscore_means": {
                "accident": 100.0,
                "emergency": 100.0,
                "lighting": 100.0,
                "pedestrian": 100.0,
                "traffic": 100.0
            },
            "raw_rss": 100.0,
            "temporal_adjustment": 0.0,
            "final_rss": 100.0,
            "explanation": "Zero travel exposure yields perfect 100.0 RSS base attribution."
        },
        "geometry": {
            "type": "LineString",
            "coordinates": [[lon, lat], [lon, lat]]
        },
        "steps": [
            {
                "instruction": f"You are already at your destination: {destination_name}.",
                "distance_meters": 0,
                "street": destination_name
            }
        ]
    }
