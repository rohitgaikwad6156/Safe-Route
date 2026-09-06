"""
Master Explanation Engine.
Synthesizes all five explanation capabilities:
1. Counterfactual Detours
2. Attribution Math
3. Temporal Causation
4. Honest Uncertainty
5. Safe Haven Context

Produces a structured ExplanationBundle and a grounded 'reasons' array where every
item contains real numbers traceable to the underlying road network and data files.
"""
from typing import Dict, List, Any, Optional
from datetime import datetime
from .attribution import compute_attribution
from .counterfactual import find_divergence_segments
from .temporal import analyze_temporal_causation
from .uncertainty import evaluate_uncertainty
from .safe_havens import evaluate_safe_havens


class ExplanationEngine:
    def __init__(self, amenities: Optional[Dict[str, Any]] = None, risk_grid: Optional[Dict[str, Any]] = None):
        self.amenities = amenities or {}
        self.risk_grid = risk_grid or {}

    def generate_route_explanations(
        self,
        route: Dict[str, Any],
        all_routes: Optional[List[Dict[str, Any]]] = None,
        departure_time: Optional[datetime] = None,
        departure_time_str: str = "21:30",
        ward_name: str = "Dhankawadi - Sahakarnagar"
    ) -> Dict[str, Any]:
        """
        Generates full explanation bundle and grounded reasons array for a specific route.
        """
        segments = route.get("segments", [])
        coords = route.get("geometry", {}).get("coordinates", [])
        # Convert GeoJSON [lon, lat] to [lat, lon] for spatial math
        lat_lon_coords = [(pt[1], pt[0]) for pt in coords] if coords else []

        # 1. Attribution Math
        attrib = compute_attribution(segments, departure_time=departure_time)

        # 2. Counterfactual Detours (Safest vs Fastest)
        detours = []
        is_safest = route.get("type") == "safest" or "safest" in route.get("id", "").lower()
        if is_safest and all_routes:
            fastest_route = next(
                (r for r in all_routes if r.get("type") == "fastest" or "fastest" in r.get("id", "").lower()),
                None
            )
            if fastest_route:
                fastest_segs = fastest_route.get("segments", [])
                detours = find_divergence_segments(fastest_segs, segments)

        # 3. Temporal Causation
        temporal_analysis = {}
        if all_routes:
            temporal_analysis = analyze_temporal_causation(
                all_routes,
                noon_time_str="12:00",
                night_time_str=departure_time_str if departure_time_str else "23:00"
            )

        # 4. Honest Uncertainty
        uncertainty = evaluate_uncertainty(segments, ward_name=ward_name)

        # 5. Safe Haven Context
        safe_havens = evaluate_safe_havens(lat_lon_coords, self.amenities, num_bands=4)

        # 6. Assemble Grounded Reasons Array
        reasons = []

        # Reason 1: Counterfactual Detour (if applicable) or Safety Highlight
        if detours:
            for d in detours[:2]:
                reasons.append(d["explanation"])
        else:
            # For fastest or non-divergent routes, cite specific infrastructure metrics
            sub_m = attrib["subscore_means"]
            dist_km = sum(s.get("length_meters", 10.0) for s in segments) / 1000.0
            reasons.append(
                f"Direct arterial corridor spanning {dist_km:.1f} km with composite safety score of {attrib['final_rss']:.1f} RSS. "
                f"Accident score: {sub_m['accident']:.1f}/100, Lighting score: {sub_m['lighting']:.1f}/100."
            )

        # Reason 2: Attribution Math Statement
        reasons.append(attrib["explanation"])

        # Reason 3: Temporal Causation Statement
        if temporal_analysis and "explanation" in temporal_analysis:
            reasons.append(temporal_analysis["explanation"])

        # Reason 4: Honest Uncertainty Statement
        reasons.append(uncertainty["explanation"])

        # Reason 5: Safe Haven Coverage Statement
        reasons.append(safe_havens["explanation"])

        return {
            "route_id": route.get("id"),
            "name": route.get("name"),
            "reasons": reasons,
            "attribution": attrib,
            "counterfactual_detours": detours,
            "temporal_causation": temporal_analysis,
            "uncertainty": uncertainty,
            "safe_havens": safe_havens
        }
