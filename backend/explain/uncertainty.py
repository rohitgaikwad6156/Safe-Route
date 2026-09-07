"""
Honest Uncertainty Module.
Audits data provenance for each road segment across a route.
Differentiates verified ground-truth OSM tags from municipal ward density fallbacks
or heuristic inferences, assigning explicit confidence flags and percentages.
"""
from typing import Dict, List, Any


def evaluate_uncertainty(
    segments: List[Dict[str, Any]],
    ward_name: str = "Dhankawadi - Sahakarnagar"
) -> Dict[str, Any]:
    """
    Computes data confidence and ground-truth verification ratios for a route.

    Parameters
    ----------
    segments : list of dict
        List of road segments. Each segment may contain:
        - 'length_meters': float
        - 'lit': Optional[str] (OSM lit tag)
        - 'sidewalk': Optional[str] (OSM sidewalk tag)
        - 'wsi': Optional[float]
        - 'is_community_report': Optional[bool]
    ward_name : str
        Ward name if known.

    Returns
    -------
    dict
        Structured uncertainty report with confidence ratings, verified distances, and narrative.
    """
    if not segments:
        return {
            "overall_confidence": "unverified",
            "verified_percentage": 0.0,
            "explanation": "No segments to audit."
        }

    total_length_m = sum(s.get("length_meters", 10.0) for s in segments)
    if total_length_m <= 0.0:
        total_length_m = 1.0

    verified_lit_m = 0.0
    fallback_lit_m = 0.0

    verified_sidewalk_m = 0.0
    fallback_sidewalk_m = 0.0

    community_report_m = 0.0

    for s in segments:
        length = s.get("length_meters", 10.0)

        # Lighting check
        lit_val = str(s.get("lit", "")).strip().lower()
        if lit_val in ("yes", "no", "true", "false", "24/7", "dusk-dawn"):
            verified_lit_m += length
        else:
            fallback_lit_m += length

        # Sidewalk check
        sw_val = str(s.get("sidewalk", "")).strip().lower()
        if sw_val in ("yes", "no", "both", "left", "right", "separate", "none"):
            verified_sidewalk_m += length
        else:
            fallback_sidewalk_m += length

        # Community report check
        if s.get("is_community_report", False):
            community_report_m += length

    lit_verified_pct = round((verified_lit_m / total_length_m) * 100.0, 1)
    sw_verified_pct = round((verified_sidewalk_m / total_length_m) * 100.0, 1)

    overall_verified_pct = round(((verified_lit_m + verified_sidewalk_m) / (2.0 * total_length_m)) * 100.0, 1)

    lit_status = "verified" if lit_verified_pct >= 70.0 else "estimated"
    sw_status = "verified" if sw_verified_pct >= 70.0 else "estimated"
    overall_status = "verified" if overall_verified_pct >= 70.0 else "estimated"

    known_accident_pct = round(100 * sum(s.get('length_meters', 0) for s in segments if s.get('wsi') is not None) / total_length_m, 1)
    explanation = (
        f"Data Provenance & Confidence: {overall_status.capitalize()} ({overall_verified_pct}% ground-truth verified). "
        f"Lighting is {lit_status} ({lit_verified_pct}% verified via OSM tags; {100.0 - lit_verified_pct:.1f}% "
        f"[{fallback_lit_m/1000.0:.1f} km] estimated using ward/landmark proxies or a peripheral baseline, not observed illumination). "
        f"Pedestrian infrastructure is {sw_status} ({sw_verified_pct}% verified; {100.0 - sw_verified_pct:.1f}% "
        f"inferred from highway classification)."
    )

    explanation += f" Accident-grid coverage: {known_accident_pct}%; remaining crash data is unknown. Grid values are modelled WSI; individual crash counts and source records are not available for audit. Emergency scores use road-network distance; traffic is simulated."
    if community_report_m > 0:
        explanation += f" Includes {int(community_report_m)} m of unverified community hazard reports."

    return {
        "overall_confidence": overall_status,
        "overall_verified_percentage": overall_verified_pct,
        "lighting": {
            "confidence": lit_status,
            "verified_percentage": lit_verified_pct,
            "verified_km": round(verified_lit_m / 1000.0, 2),
            "estimated_km": round(fallback_lit_m / 1000.0, 2),
            "fallback_source": "PMC Environment Status Report (ESR) Ward Density"
        },
        "pedestrian": {
            "confidence": sw_status,
            "verified_percentage": sw_verified_pct,
            "verified_km": round(verified_sidewalk_m / 1000.0, 2),
            "estimated_km": round(fallback_sidewalk_m / 1000.0, 2),
            "fallback_source": "OSM Highway Hierarchy Classifier"
        },
        "accident": {
            "confidence": "partial" if known_accident_pct < 100 else "modelled",
            "coverage_percentage": known_accident_pct,
            "source": "Committed research risk grid; record-level provenance unverified"
        },
        "community_reported_meters": int(round(community_report_m)),
        "explanation": explanation
    }
