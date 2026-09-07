"""
Safe Haven Context Module.
Samples emergency service coverage (hospitals, police chowkis, Smart City ECBs)
at evenly spaced position bands along a route path, preventing endpoint clustering.
"""
from typing import Dict, List, Any, Tuple
import math
from scipy.spatial import cKDTree
import numpy as np


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance in meters."""
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2.0)**2
    return R * 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def sample_route_coordinates(coords: List[Tuple[float, float]], num_samples: int = 4) -> List[Tuple[float, float, str]]:
    """
    Samples coordinates at evenly spaced position bands along cumulative distance.
    Returns list of (lat, lon, band_label).
    """
    if not coords or len(coords) < 2:
        return []

    # Calculate cumulative distance along coords
    dists = [0.0]
    for i in range(len(coords) - 1):
        p1 = coords[i]
        p2 = coords[i + 1]
        d = haversine_m(p1[0], p1[1], p2[0], p2[1])
        dists.append(dists[-1] + d)

    total_dist = dists[-1]
    if total_dist <= 0.0:
        return [(coords[0][0], coords[0][1], "Start")]

    samples = []
    band_pcts = [0.15, 0.40, 0.65, 0.90]
    band_names = [
        "Band 1 (0% - 25% Corridor Start)",
        "Band 2 (25% - 50% Mid-Route North)",
        "Band 3 (50% - 75% Mid-Route South)",
        "Band 4 (75% - 100% Approach Terminus)"
    ]

    for pct, b_name in zip(band_pcts, band_names):
        target_d = total_dist * pct
        # Find segment in dists
        idx = 0
        while idx < len(dists) - 1 and dists[idx + 1] < target_d:
            idx += 1

        seg_len = dists[idx + 1] - dists[idx]
        if seg_len > 0:
            frac = (target_d - dists[idx]) / seg_len
            lat = coords[idx][0] + frac * (coords[idx + 1][0] - coords[idx][0])
            lon = coords[idx][1] + frac * (coords[idx + 1][1] - coords[idx][1])
        else:
            lat, lon = coords[idx]

        samples.append((lat, lon, b_name))

    return samples


def evaluate_safe_havens(
    route_coords: List[Tuple[float, float]],
    amenities: Dict[str, List[Dict[str, Any]]],
    num_bands: int = 4
) -> Dict[str, Any]:
    """
    Samples route along position bands and identifies nearest hospital, police, and ECB.

    Parameters
    ----------
    route_coords : list of (lat, lon)
        List of coordinates along the route.
    amenities : dict
        Amenities dictionary matching docs/contracts/data.md.
    num_bands : int
        Number of position bands to sample.

    Returns
    -------
    dict
        Safe haven report with band samples and narrative explanation.
    """
    samples = sample_route_coordinates(route_coords, num_samples=num_bands)
    if not samples:
        return {
            "bands": [],
            "max_hospital_distance_meters": 0,
            "max_police_distance_meters": 0,
            "explanation": "No coordinates to sample."
        }

    hospitals = amenities.get("hospitals", [])
    police = amenities.get("police", [])
    ecbs = amenities.get("ecbs", [])

    band_results = []
    max_hosp_dist = 0.0
    max_police_dist = 0.0

    for lat, lon, b_name in samples:
        # Nearest hospital
        nearest_hosp = min(
            hospitals,
            key=lambda h: haversine_m(lat, lon, float(h["lat"]), float(h["lon"])),
            default={"name": "Unknown Trauma Center", "lat": lat, "lon": lon}
        )
        hosp_dist = int(round(haversine_m(lat, lon, float(nearest_hosp["lat"]), float(nearest_hosp["lon"]))))
        max_hosp_dist = max(max_hosp_dist, hosp_dist)

        # Nearest police
        nearest_pol = min(
            police,
            key=lambda p: haversine_m(lat, lon, float(p["lat"]), float(p["lon"])),
            default={"name": "Police Chowki", "lat": lat, "lon": lon}
        )
        pol_dist = int(round(haversine_m(lat, lon, float(nearest_pol["lat"]), float(nearest_pol["lon"]))))
        max_police_dist = max(max_police_dist, pol_dist)

        # Nearest ECB
        nearest_ecb = min(
            ecbs,
            key=lambda e: haversine_m(lat, lon, float(e["lat"]), float(e["lon"])),
            default={"name": "Smart City ECB", "lat": lat, "lon": lon}
        )
        ecb_dist = int(round(haversine_m(lat, lon, float(nearest_ecb["lat"]), float(nearest_ecb["lon"]))))

        band_results.append({
            "band_name": b_name,
            "sample_coordinates": [round(lat, 5), round(lon, 5)],
            "hospital": {"name": nearest_hosp.get("name", "Hospital"), "distance_meters": hosp_dist},
            "police": {"name": nearest_pol.get("name", "Police Chowki"), "distance_meters": pol_dist},
            "ecb": {"name": nearest_ecb.get("name", "Smart City ECB"), "distance_meters": ecb_dist}
        })

    # Grounded narrative citing real facilities
    sample1 = band_results[0]
    sample_mid = band_results[len(band_results) // 2]
    sample_end = band_results[-1]

    explanation = (
        f"Safe Haven Position-Band Coverage: Nearby facilities sampled across {len(band_results)} journey bands. "
        f"Largest sampled straight-line hospital distance is {int(round(max_hosp_dist))} m "
        f"(accessible: {sample1['hospital']['name']} at {sample1['hospital']['distance_meters']} m; "
        f"{sample_mid['hospital']['name']} at {sample_mid['hospital']['distance_meters']} m; "
        f"{sample_end['hospital']['name']} at {sample_end['hospital']['distance_meters']} m). "
        f"Largest sampled straight-line police distance is {int(round(max_police_dist))} m. These are sampled straight-line distances, not response times or continuous coverage guarantees."
    )

    return {
        "bands": band_results,
        "max_hospital_distance_meters": int(round(max_hosp_dist)),
        "max_police_distance_meters": int(round(max_police_dist)),
        "explanation": explanation
    }
