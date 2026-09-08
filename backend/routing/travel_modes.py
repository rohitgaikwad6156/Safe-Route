"""Configurable travel-mode policy for the shared SafeRoute graph search."""
from dataclasses import dataclass
import re
from typing import Any, Dict, Mapping


SUPPORTED_TRAVEL_MODES = ("walking", "two_wheeler", "car")

# Planning references only. These are deliberately easy to tune and must not
# be described as measured or live traffic speeds.
REFERENCE_SPEEDS_KMH = {
    "walking": 4.7,
    "two_wheeler": 25.0,
    "car": 30.0,
}


@dataclass(frozen=True)
class TravelModeProfile:
    name: str
    safety_weights: Mapping[str, float]
    community_hazard_multiplier: float
    reference_speed_kmh: float
    road_impedance: Mapping[str, float]

    def __post_init__(self) -> None:
        total = sum(self.safety_weights.values())
        if abs(total - 1.0) > 1e-6:
            raise ValueError(f"{self.name} safety weights must sum to 1.0, got {total}")


_PROFILES = {
    "walking": TravelModeProfile(
        name="walking",
        safety_weights={
            "accident": .20, "emergency": .14, "lighting": .16,
            "pedestrian": .24, "traffic": .04, "road_condition": .04,
            "road_class": .07, "speed": .07, "junction": .04,
        },
        community_hazard_multiplier=1.0,
        reference_speed_kmh=REFERENCE_SPEEDS_KMH["walking"],
        road_impedance={
            "footway": .85, "pedestrian": .85, "living_street": .90,
            "path": .90, "residential": 1.0, "service": 1.05,
            "tertiary": 1.10, "secondary": 1.18, "primary": 1.28,
            "trunk": 1.40, "motorway": 1.60,
        },
    ),
    "two_wheeler": TravelModeProfile(
        name="two_wheeler",
        safety_weights={
            "accident": .30, "emergency": .06, "lighting": .16,
            "pedestrian": .03, "traffic": .08, "road_condition": .14,
            "road_class": .08, "speed": .09, "junction": .06,
        },
        community_hazard_multiplier=1.20,
        reference_speed_kmh=REFERENCE_SPEEDS_KMH["two_wheeler"],
        road_impedance={
            "living_street": 1.10, "residential": 1.0, "service": 1.12,
            "tertiary": .94, "secondary": .92, "primary": .94,
            "trunk": 1.08, "motorway": 1.20,
        },
    ),
    "car": TravelModeProfile(
        name="car",
        safety_weights={
            "accident": .28, "emergency": .04, "lighting": .07,
            "pedestrian": .01, "traffic": .25, "road_condition": .10,
            "road_class": .14, "speed": .07, "junction": .04,
        },
        community_hazard_multiplier=1.0,
        reference_speed_kmh=REFERENCE_SPEEDS_KMH["car"],
        road_impedance={
            "living_street": 1.18, "residential": 1.0, "service": 1.15,
            "tertiary": .94, "secondary": .90, "primary": .87,
            "trunk": .88, "motorway": .90,
        },
    ),
}


def get_travel_mode_profile(travel_mode: str) -> TravelModeProfile:
    try:
        return _PROFILES[travel_mode]
    except (KeyError, TypeError):
        raise ValueError(
            f"Unsupported travel mode {travel_mode!r}; expected one of "
            f"{', '.join(SUPPORTED_TRAVEL_MODES)}"
        ) from None


def estimate_duration_seconds(
    distance_meters: float,
    travel_mode: str,
    congestion_multiplier: float = 1.0,
) -> int:
    """Estimate travel time from a mode reference speed, never a live speed."""
    profile = get_travel_mode_profile(travel_mode)
    distance = max(0.0, float(distance_meters))
    multiplier = max(1.0, float(congestion_multiplier))
    meters_per_second = profile.reference_speed_kmh * 1000.0 / 3600.0
    return int(round(distance / meters_per_second * multiplier))


def _tag(value: Any) -> str:
    if isinstance(value, (list, tuple, set)):
        value = next(iter(value), "")
    return str(value or "").strip().lower()


def _road_class(payload: Mapping[str, Any]) -> str:
    return _tag(payload.get("highway")).removesuffix("_link") or "residential"


def edge_is_allowed(payload: Mapping[str, Any], travel_mode: str) -> bool:
    """Apply only explicit OSM access restrictions and mode-incompatible ways."""
    get_travel_mode_profile(travel_mode)
    access = _tag(payload.get("access"))
    highway = _road_class(payload)
    denied = {"no", "private"}
    if travel_mode == "walking":
        return (
            _tag(payload.get("foot")) not in denied
            and access not in denied
            and highway != "motorway"
            and _tag(payload.get("motorroad")) != "yes"
        )

    mode_access = _tag(payload.get("motorcycle" if travel_mode == "two_wheeler" else "motorcar"))
    if mode_access in denied or _tag(payload.get("motor_vehicle")) in denied or access in denied:
        return False
    return highway not in {"footway", "path", "pedestrian", "steps", "cycleway", "bridleway"}


def _number(value: Any) -> float | None:
    match = re.search(r"\d+(?:\.\d+)?", _tag(value))
    return float(match.group()) if match else None


def road_condition_score(payload: Mapping[str, Any]) -> float:
    smoothness = _tag(payload.get("smoothness"))
    surface = _tag(payload.get("surface"))
    if smoothness in {"very_bad", "horrible", "very_horrible", "impassable"}:
        return 10.0
    if smoothness in {"bad"} or surface in {"mud", "sand", "ground"}:
        return 35.0
    if smoothness in {"intermediate"} or surface in {"gravel", "unpaved", "dirt"}:
        return 60.0
    if smoothness in {"good", "excellent"} or surface in {"asphalt", "concrete", "paved"}:
        return 100.0
    return 70.0  # neutral uncertainty baseline, not an asserted road condition


def speed_safety_score(payload: Mapping[str, Any]) -> float:
    speed = _number(payload.get("maxspeed"))
    if speed is not None:
        if speed <= 30:
            return 100.0
        if speed >= 80:
            return 0.0
        return 100.0 * (80.0 - speed) / 50.0
    highway = _road_class(payload)
    return {
        "motorway": 10.0, "trunk": 20.0, "primary": 40.0,
        "secondary": 55.0, "tertiary": 70.0, "residential": 90.0,
        "service": 90.0, "living_street": 100.0, "pedestrian": 100.0,
        "footway": 100.0, "path": 95.0,
    }.get(highway, 70.0)


def road_class_score(payload: Mapping[str, Any], travel_mode: str) -> float:
    highway = _road_class(payload)
    if travel_mode == "walking":
        return {
            "footway": 100, "pedestrian": 100, "path": 95, "living_street": 95,
            "residential": 85, "service": 75, "tertiary": 60, "secondary": 45,
            "primary": 25, "trunk": 10, "motorway": 0,
        }.get(highway, 60.0)
    if travel_mode == "two_wheeler":
        return {
            "residential": 85, "tertiary": 90, "secondary": 85, "primary": 70,
            "trunk": 45, "motorway": 30, "service": 65, "living_street": 60,
        }.get(highway, 65.0)
    return {
        "motorway": 85, "trunk": 85, "primary": 90, "secondary": 90,
        "tertiary": 85, "residential": 75, "service": 55, "living_street": 45,
    }.get(highway, 65.0)


def junction_safety_score(payload: Mapping[str, Any]) -> float:
    degree = int(payload.get("junction_degree") or 0)
    controlled = _tag(payload.get("crossing")) in {"traffic_signals", "signals"} or _tag(payload.get("node_highway")) == "traffic_signals"
    if degree < 3:
        return 100.0
    return 82.0 if controlled else max(45.0, 82.0 - 7.0 * (degree - 2))


def mode_safety_score(payload: Mapping[str, Any], travel_mode: str, traffic_score: float) -> float:
    profile = get_travel_mode_profile(travel_mode)
    subscores: Dict[str, float] = dict(payload.get("subscores") or {})
    factors = {
        "accident": float(subscores.get("accident") or 0.0),
        "emergency": float(subscores.get("emergency") or 0.0),
        "lighting": float(subscores.get("lighting") or 0.0),
        "pedestrian": float(subscores.get("pedestrian") or 0.0),
        "traffic": float(traffic_score),
        "road_condition": road_condition_score(payload),
        "road_class": road_class_score(payload, travel_mode),
        "speed": speed_safety_score(payload),
        "junction": junction_safety_score(payload),
    }
    return max(0.0, min(100.0, sum(profile.safety_weights[k] * value for k, value in factors.items())))


def traversal_impedance(payload: Mapping[str, Any], travel_mode: str) -> float:
    profile = get_travel_mode_profile(travel_mode)
    factor = profile.road_impedance.get(_road_class(payload), 1.0)
    if travel_mode == "walking" and _tag(payload.get("sidewalk")) in {"both", "yes"}:
        factor *= .94
    if travel_mode == "two_wheeler":
        factor *= 1.0 + (100.0 - road_condition_score(payload)) / 250.0
    return max(.75, float(factor))
