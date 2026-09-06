"""
Street Lighting Sub-score Module.
Rules:
- OSM tag `lit=yes`: 100.0
- OSM tag `lit=no`: 0.0
- Untagged / unknown: Scaled proportionally with PMC ward-level lighting density (poles/km).
  e.g., Aundh ward baseline density of 62.4 poles/km yields a score of ~62, whereas
  unlit peripheral zones drop to a conservative baseline.
"""
from typing import Any, Dict, Optional

# Default fallback densities (poles/km) based on PMC ESR records
DEFAULT_WARD_DENSITIES: Dict[str, float] = {
    "Aundh": 62.4,
    "Aundh - Baner": 62.4,
    "Shivajinagar": 68.5,
    "Shivajinagar - Ghole Road": 68.5,
    "Kasba - Vishrambaugwada": 72.0,
    "Kothrud": 58.1,
    "Kothrud - Bavdhan": 58.1,
    "Bhavani Peth": 64.2,
    "Dhankawadi - Sahakarnagar": 41.2,
    "Sinhagad Road": 38.5,
    "Warje - Karvenagar": 48.0,
    "Hadapsar - Mundhwa": 44.5,
    "Bibwewadi": 49.0,
    "Wanowrie - Ramtekdi": 52.3,
    "Kondhwa - Yewalewadi": 36.8,
    "Yerwada - Kalas - Dhanori": 46.2,
    "Nagar Road - Vadgaonsheri": 61.0,
    "Pimpri Chinchwad": 59.5
}

PERIPHERAL_DEFAULT_SCORE: float = 20.0


def calculate_lighting_score(
    osm_lit_tag: Optional[str] = None,
    ward_name: Optional[str] = None,
    ward_lighting_map: Optional[Dict[str, Any]] = None
) -> float:
    """
    Calculates the street lighting safety sub-score.

    Parameters
    ----------
    osm_lit_tag : str, optional
        OSM street lighting tag ('yes', 'no', '24/7', etc.).
    ward_name : str, optional
        PMC Administrative ward name (used as fallback when lit tag is missing).
    ward_lighting_map : dict, optional
        Dictionary mapping ward name to lighting info matching docs/contracts/data.md.

    Returns
    -------
    float
        Lighting score in [0.0, 100.0].
    """
    if osm_lit_tag is not None:
        tag_clean = str(osm_lit_tag).strip().lower()
        if tag_clean in ("yes", "true", "1", "24/7", "dusk-dawn"):
            return 100.0
        if tag_clean in ("no", "false", "0", "none"):
            return 0.0

    # Fallback to municipal ward pole density
    if ward_name:
        # Check passed map first
        if ward_lighting_map:
            # Direct match
            if ward_name in ward_lighting_map:
                val = ward_lighting_map[ward_name]
                density = val.get("poles_per_km", val) if isinstance(val, dict) else float(val)
                return max(0.0, min(100.0, float(density)))
            # Substring match (e.g. "Aundh" in "Aundh - Baner")
            for w_key, val in ward_lighting_map.items():
                if ward_name.lower() in w_key.lower() or w_key.lower() in ward_name.lower():
                    density = val.get("poles_per_km", val) if isinstance(val, dict) else float(val)
                    return max(0.0, min(100.0, float(density)))

        # Check default built-in densities
        if ward_name in DEFAULT_WARD_DENSITIES:
            return DEFAULT_WARD_DENSITIES[ward_name]
        for w_key, density in DEFAULT_WARD_DENSITIES.items():
            if ward_name.lower() in w_key.lower() or w_key.lower() in ward_name.lower():
                return density

    return PERIPHERAL_DEFAULT_SCORE
