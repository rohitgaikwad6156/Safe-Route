"""
SafeRoute AI: Geocoder with Guaranteed Offline Landmark Fallback
Attempts online geocoding (Nominatim), but upon network failure, timeout,
or zero-connectivity, gracefully falls back to the committed landmark table.
Never stalls or throws unhandled network errors.
"""
import json
from pathlib import Path
from typing import Dict, Any, Optional
import requests

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
LANDMARKS_FILE = DATA_DIR / "landmarks.json"


def load_committed_landmarks() -> list:
    """Loads the committed landmark registry."""
    if not LANDMARKS_FILE.exists():
        return []
    with open(LANDMARKS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, dict):
        return [{"name": k, **v} for k, v in data.items()]
    return data


def normalize_location_text(text: str) -> str:
    """Normalizes location string by removing punctuation, extra spaces, and casing."""
    import re
    cleaned = re.sub(r"[^a-zA-Z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", cleaned).strip().lower()


def geocode_location(query: str, timeout_seconds: float = 5.0) -> Dict[str, Any]:
    """
    Geocodes a location query.
    1. Tries normalized matching against committed landmarks (instant, 0ms).
    2. Tries online Nominatim for specific unindexed Pune addresses.
    3. On ANY exception or zero-connectivity, gracefully falls back
       to committed landmark table with substring and token matching.

    Returns
    -------
    Dict[str, Any]
        {
            "name": str,
            "lat": float,
            "lon": float,
            "source": "nominatim_online" | "offline_landmark_registry",
            "offline_fallback": bool
        }
    """
    q_clean = query.strip()
    landmarks = load_committed_landmarks()
    amenities_path = DATA_DIR / 'amenities.json'
    if amenities_path.exists():
        amenities = json.loads(amenities_path.read_text(encoding='utf-8'))
        landmarks += [a for group in amenities.values() for a in group if a.get('name')]
    q_lower = q_clean.lower()
    q_norm = normalize_location_text(q_clean)
    q_words = [w for w in q_norm.split() if w not in {"the", "in", "near", "at"}]
    q_stripped = q_lower.replace(", pune", "").replace(" pune", "").replace(", maharashtra", "").replace(", india", "").strip()
    q_stripped_norm = normalize_location_text(q_stripped)

    # 1. Check committed landmark registry first (instant, 0ms, 100% verified ground truth)
    for lm in landmarks:
        lm_name_low = lm["name"].lower()
        lm_name_norm = normalize_location_text(lm["name"])
        if q_lower == lm_name_low or q_norm == lm_name_norm or q_stripped_norm == lm_name_norm:
            return {
                "name": lm["name"],
                "lat": float(lm["lat"]),
                "lon": float(lm["lon"]),
                "ward": lm.get("ward", "Pune Central"),
                "source": "offline_landmark_registry",
                "offline_fallback": True
            }
        for alias in lm.get("aliases", []):
            al_low = alias.lower()
            al_norm = normalize_location_text(alias)
            if q_lower == al_low or q_norm == al_norm or q_stripped_norm == al_norm:
                return {
                    "name": lm["name"],
                    "lat": float(lm["lat"]),
                    "lon": float(lm["lon"]),
                    "ward": lm.get("ward", "Pune Central"),
                    "source": "offline_landmark_registry",
                    "offline_fallback": True
                }

    # 2. Check token/word containment in landmark name or aliases
    if q_words:
        for lm in landmarks:
            lm_name_norm = normalize_location_text(lm["name"])
            if all(w in lm_name_norm for w in q_words):
                return {
                    "name": lm["name"],
                    "lat": float(lm["lat"]),
                    "lon": float(lm["lon"]),
                    "ward": lm.get("ward", "Pune Central"),
                    "source": "offline_landmark_registry",
                    "offline_fallback": True
                }
            for alias in lm.get("aliases", []):
                al_norm = normalize_location_text(alias)
                if all(w in al_norm for w in q_words):
                    return {
                        "name": lm["name"],
                        "lat": float(lm["lat"]),
                        "lon": float(lm["lon"]),
                        "ward": lm.get("ward", "Pune Central"),
                        "source": "offline_landmark_registry",
                        "offline_fallback": True
                    }

    # 3. Try online Nominatim for specific unindexed Pune addresses
    try:
        url = "https://nominatim.openstreetmap.org/search"
        headers = {"User-Agent": "SafeRouteAI-Demo/1.0"}
        params = {"q": f"{q_clean}, Pune, India", "format": "json", "limit": 1,
                  "viewbox": "73.65,18.80,74.10,18.35", "bounded": 1, "countrycodes": "in"}
        resp = requests.get(url, params=params, headers=headers, timeout=timeout_seconds)
        if resp.status_code == 200:
            data = resp.json()
            if data and len(data) > 0:
                return {
                    "name": data[0].get("display_name", q_clean),
                    "lat": float(data[0]["lat"]),
                    "lon": float(data[0]["lon"]),
                    "source": "nominatim_online",
                    "offline_fallback": False
                }
    except Exception:
        # Expected failure mode under conference Wi-Fi / offline testing
        pass

    # 4. Guaranteed Offline Fallback: search committed landmark registry by partial substring
    for lm in landmarks:
        lm_norm = normalize_location_text(lm["name"])
        if q_norm in lm_norm or lm_norm in q_norm:
            return {
                "name": lm["name"],
                "lat": float(lm["lat"]),
                "lon": float(lm["lon"]),
                "ward": lm.get("ward", "Pune Central"),
                "source": "offline_landmark_registry",
                "offline_fallback": True
            }
        for alias in lm.get("aliases", []):
            al_norm = normalize_location_text(alias)
            if q_norm in al_norm or al_norm in q_norm:
                return {
                    "name": lm["name"],
                    "lat": float(lm["lat"]),
                    "lon": float(lm["lon"]),
                    "ward": lm.get("ward", "Pune Central"),
                    "source": "offline_landmark_registry",
                    "offline_fallback": True
                }

    # 5. Match ward or area keyword
    for lm in landmarks:
        w_norm = normalize_location_text(lm.get("ward", ""))
        if w_norm and (w_norm in q_norm or q_norm in w_norm):
            return {
                "name": lm["name"],
                "lat": float(lm["lat"]),
                "lon": float(lm["lon"]),
                "ward": lm.get("ward", "Pune Central"),
                "source": "offline_landmark_registry",
                "offline_fallback": True
            }

    return {
        "name": q_clean, "found": False, "source": "not_found",
        "message": "Location not found. Use a full address, nearby mapped landmark, or latitude, longitude."
    }
