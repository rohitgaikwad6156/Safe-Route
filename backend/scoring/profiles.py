"""Human-centred profile scoring built only from existing route subscores.

Profiles rank the already-computed custom OSM route candidates. They deliberately do
not modify beta or edge costs: the calibrated route search remains unchanged.
"""
from typing import Any, Dict, List


PROFILE_WEIGHTS: Dict[str, Dict[str, Any]] = {
    "student": {
        "label": "Student",
        "weights": {"pedestrian": .30, "lighting": .25, "accident": .20, "emergency": .15, "traffic": .10},
        "focus": "crossings, lighting and nearby help",
        "limitation": "School-zone, footfall and campus-security data are not available.",
    },
    "woman_alone": {
        "label": "Woman traveling alone",
        "weights": {"lighting": .35, "emergency": .25, "pedestrian": .20, "accident": .15, "traffic": .05},
        "focus": "lighting, visible pedestrian infrastructure and emergency access",
        "limitation": "Harassment prevalence and real-time street activity are not available; community reports are unverified unless corroborated.",
    },
    "elderly": {
        "label": "Elderly person",
        "weights": {"pedestrian": .35, "emergency": .25, "accident": .20, "traffic": .10, "lighting": .10},
        "focus": "crossings, calmer road context and access to medical help",
        "limitation": "Kerb height, gradient, bench and pavement-condition coverage is limited.",
    },
    "night_commuter": {
        "label": "Night commuter",
        "weights": {"lighting": .40, "accident": .20, "emergency": .15, "traffic": .15, "pedestrian": .10},
        "focus": "lighting and night-time access to help",
        "limitation": "Lamp locations and ward-level lighting do not confirm that a lamp is currently working.",
    },
    "disability": {
        "label": "Person with disability",
        "weights": {"pedestrian": .35, "emergency": .30, "traffic": .15, "lighting": .10, "accident": .10},
        "focus": "pedestrian access, crossings and emergency proximity",
        "limitation": "Wheelchair-accessible kerbs, surface quality, gradients and lift availability have limited data.",
    },
    "emergency_helper": {
        "label": "Emergency helper",
        "weights": {"emergency": .45, "traffic": .25, "accident": .15, "lighting": .10, "pedestrian": .05},
        "focus": "hospital, police and fire access with traffic-aware travel",
        "limitation": "Facility opening hours, live dispatch status and vehicle access restrictions are not available.",
    },
}


def normalize_profile(profile_id: str) -> str:
    return profile_id if profile_id in PROFILE_WEIGHTS else "student"


def apply_profile(route: Dict[str, Any], profile_id: str) -> Dict[str, Any]:
    """Add an honest profile-fit score and plain-language explanation to a route."""
    profile_id = normalize_profile(profile_id)
    config = PROFILE_WEIGHTS[profile_id]
    subscores = route.get("subscores", {})
    weighted = 0.0
    available_weight = 0.0
    missing: List[str] = []
    for signal, weight in config["weights"].items():
        value = subscores.get(signal)
        if value is None:
            missing.append(signal)
            continue
        weighted += float(value) * weight
        available_weight += weight
    score = round(weighted / available_weight, 1) if available_weight else None
    strongest = max(
        ((name, float(value)) for name, value in subscores.items() if value is not None),
        key=lambda item: item[1], default=("available safety", 0.0)
    )
    route["profile"] = {"id": profile_id, "label": config["label"]}
    route["profile_score"] = score
    route["profile_explanation"] = (
        f"For {config['label']}, this route scores {score:.1f}/100 using {config['focus']}. "
        f"Its strongest available signal is {strongest[0]} at {strongest[1]:.1f}/100."
        if score is not None else f"Limited data: no supported signals were available for {config['label']}."
    )
    if missing:
        route["profile_explanation"] += f" Limited data for: {', '.join(missing)}."
    route["profile_limitation"] = config["limitation"]
    return route


def profile_catalog() -> List[Dict[str, str]]:
    return [{"id": key, "label": value["label"], "focus": value["focus"], "limitation": value["limitation"]}
            for key, value in PROFILE_WEIGHTS.items()]
