"""
Pedestrian Infrastructure Sub-score Module.
Rules:
- Dedicated pedestrian paths (footway, pedestrian, steps): 100.0
- Continuous sidewalks on both sides (sidewalk=both/yes): 100.0
- Sidewalk on one side (sidewalk=left/right): 60.0
- sidewalk=no on high-speed / arterial corridors (motorway, trunk, primary): 0.0
- sidewalk=no on lower hierarchy streets: scaled baseline.
"""
from typing import Optional


def calculate_pedestrian_score(
    sidewalk_tag: Optional[str] = None,
    highway_tag: Optional[str] = None
) -> float:
    """
    Calculates the pedestrian infrastructure sub-score based on sidewalk presence
    and road classification.

    Parameters
    ----------
    sidewalk_tag : str, optional
        OSM sidewalk tag ('both', 'yes', 'left', 'right', 'no', 'none').
    highway_tag : str, optional
        OSM highway tag ('trunk', 'primary', 'secondary', 'residential', 'footway', etc.).

    Returns
    -------
    float
        Pedestrian infrastructure score in [0.0, 100.0].
    """
    hw = str(highway_tag).strip().lower() if highway_tag else ""
    sw = str(sidewalk_tag).strip().lower() if sidewalk_tag else ""

    # Dedicated pedestrian infrastructure
    if hw in ("footway", "pedestrian", "path", "steps", "cycleway"):
        return 100.0

    # Explicit sidewalk tags
    if sw in ("both", "yes"):
        return 100.0

    if sw in ("left", "right", "separate"):
        return 60.0

    if sw in ("no", "none"):
        # High speed arterial without sidewalks carries maximum pedestrian fatality risk
        if hw in ("motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link"):
            return 0.0
        if hw in ("secondary", "secondary_link"):
            return 20.0
        if hw in ("tertiary", "tertiary_link"):
            return 35.0
        return 40.0  # Residential / service without formal sidewalk

    # Untagged fallback by highway hierarchy
    if hw in ("living_street", "service"):
        return 60.0
    if hw in ("residential",):
        return 50.0
    if hw in ("tertiary", "tertiary_link"):
        return 35.0
    if hw in ("secondary", "secondary_link"):
        return 20.0
    if hw in ("primary", "primary_link", "trunk", "trunk_link", "motorway"):
        return 0.0

    return 40.0


# ==============================================================================
# Research Document: Pedestrian Safety Score (PSS) 6-Factor Multi-Criteria Model
# ==============================================================================

def calculate_sidewalk_subscore(sidewalk_tag: Optional[str] = None, highway_tag: Optional[str] = None) -> float:
    """
    Sidewalk Availability Score (S_sidewalk) [Weight: 25%]:
    - sidewalk=both or dedicated highway=footway: 1.0 (100)
    - sidewalk=left or right: 0.6 (60)
    - sidewalk=no or missing on major roads: 0.0 (0)
    """
    hw = str(highway_tag).strip().lower() if highway_tag else ""
    sw = str(sidewalk_tag).strip().lower() if sidewalk_tag else ""

    if hw in ("footway", "pedestrian", "path", "steps"):
        return 1.0
    if sw in ("both", "yes"):
        return 1.0
    if sw in ("left", "right", "separate"):
        return 0.6
    if sw in ("no", "none") or hw in ("trunk", "primary", "motorway"):
        return 0.0
    return 0.4


def calculate_crossing_subscore(crossing_tag: Optional[str] = None, has_refuge_island: bool = False) -> float:
    """
    Crossing Protection Score (S_crossing) [Weight: 20%]:
    - crossing=traffic_signals + crossing:island=yes: 1.0
    - crossing=traffic_signals without island: 0.8
    - crossing=uncontrolled (zebra crossing only): 0.5
    - crossing=unmarked or no designated crossings within 200m: 0.0
    """
    cr = str(crossing_tag).strip().lower() if crossing_tag else ""

    if "traffic_signal" in cr or "signal" in cr:
        return 1.0 if has_refuge_island else 0.8
    if "uncontrolled" in cr or "zebra" in cr:
        return 0.5
    if cr in ("unmarked", "no", "none") or not cr:
        return 0.0
    return 0.3


def calculate_road_class_subscore(highway_tag: Optional[str] = None) -> float:
    """
    Road Class Safety Score (S_road) [Weight: 15%]:
    - highway=pedestrian / living_street: 1.0
    - highway=residential: 0.9
    - highway=secondary / tertiary: 0.6
    - highway=primary: 0.3
    - highway=trunk / motorway: 0.0
    """
    hw = str(highway_tag).strip().lower() if highway_tag else ""
    if hw in ("pedestrian", "living_street", "footway", "path"):
        return 1.0
    if hw == "residential":
        return 0.9
    if hw in ("secondary", "secondary_link", "tertiary", "tertiary_link"):
        return 0.6
    if hw in ("primary", "primary_link"):
        return 0.3
    if hw in ("trunk", "trunk_link", "motorway", "motorway_link"):
        return 0.0
    return 0.5


def calculate_speed_regulation_subscore(maxspeed_kmph: Optional[float] = None, traffic_calming: bool = False) -> float:
    """
    Speed Regulation Score (S_speed) [Weight: 15%]:
    - maxspeed <= 30 kmph or presence of active speed bumps/rumble strips: 1.0
    - maxspeed >= 80 kmph: 0.0
    - Scaled linearly between 30 and 80 kmph.
    """
    if traffic_calming:
        return 1.0
    if maxspeed_kmph is None:
        return 0.6  # Standard urban default
    spd = float(maxspeed_kmph)
    if spd <= 30.0:
        return 1.0
    if spd >= 80.0:
        return 0.0
    # Linear scale: 30 km/h -> 1.0, 80 km/h -> 0.0
    return max(0.0, min(1.0, 1.0 - (spd - 30.0) / 50.0))


def calculate_width_exposure_subscore(width_meters: Optional[float] = None, lanes: Optional[int] = None) -> float:
    """
    Width Exposure Score (S_width) [Weight: 10%]:
    - Narrow streets (Right of Way <= 12m) where vehicle speeds are naturally restricted: 1.0
    - Wide roads (> 20m) without median buffers: 0.0
    - Scaled linearly between 12m and 20m.
    """
    if width_meters is None:
        if lanes is not None:
            width_meters = lanes * 3.5
        else:
            return 0.7  # Default urban street width

    w = float(width_meters)
    if w <= 12.0:
        return 1.0
    if w >= 20.0:
        return 0.0
    return max(0.0, min(1.0, 1.0 - (w - 12.0) / 8.0))


def calculate_pedestrian_signal_requirement(crossing_length_meters: float) -> float:
    """
    PMC Pedestrian Policy Formula:
    Required Pedestrian Phase (seconds) = Crossing Length (meters) + 7 seconds reaction buffer
    Assuming average walking speed of 1.0 m/s.
    """
    return max(7.0, float(crossing_length_meters) + 7.0)


def calculate_pss(
    sidewalk_score: float,
    crossing_score: float,
    road_score: float,
    lighting_score: float,
    speed_score: float,
    width_score: float,
    crash_risk_penalty: float = 1.0
) -> float:
    """
    Formulates the segment-level Pedestrian Safety Score (PSS) in [0.0, 100.0]
    from the research document:

    PSS = [0.25 * S_sw + 0.20 * S_cross + 0.15 * S_road + 0.15 * S_light + 0.15 * S_speed + 0.10 * S_width] * 100 * Crash_Risk_Penalty
    """
    # Normalize inputs to [0.0, 1.0] if passed as [0, 100]
    s_sw = sidewalk_score / 100.0 if sidewalk_score > 1.0 else max(0.0, min(1.0, sidewalk_score))
    s_cr = crossing_score / 100.0 if crossing_score > 1.0 else max(0.0, min(1.0, crossing_score))
    s_rd = road_score / 100.0 if road_score > 1.0 else max(0.0, min(1.0, road_score))
    s_lt = lighting_score / 100.0 if lighting_score > 1.0 else max(0.0, min(1.0, lighting_score))
    s_sp = speed_score / 100.0 if speed_score > 1.0 else max(0.0, min(1.0, speed_score))
    s_wd = width_score / 100.0 if width_score > 1.0 else max(0.0, min(1.0, width_score))

    weighted_infrastructure = (
        0.25 * s_sw +
        0.20 * s_cr +
        0.15 * s_rd +
        0.15 * s_lt +
        0.15 * s_sp +
        0.10 * s_wd
    )

    penalty = max(0.0, min(1.0, float(crash_risk_penalty)))
    pss = weighted_infrastructure * 100.0 * penalty
    return max(0.0, min(100.0, pss))

