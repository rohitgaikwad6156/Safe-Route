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


def geocode_location(query: str, timeout_seconds: float = 1.0) -> Dict[str, Any]:
    """
    Geocodes a location query.
    1. Tries online Nominatim with a tight timeout.
    2. On ANY exception (ConnectionError, Timeout, HTTPError, offline), falls back
       to committed landmark table in backend/data/landmarks.json.

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

    # Try online Nominatim first if query is provided
    try:
        url = "https://nominatim.openstreetmap.org/search"
        headers = {"User-Agent": "SafeRouteAI-Demo/1.0"}
        params = {"q": f"{q_clean}, Pune, India", "format": "json", "limit": 1}
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

    # Guaranteed Offline Fallback: search committed landmark registry
    q_lower = q_clean.lower()
    
    # 1. Exact or substring match in name or aliases
    for lm in landmarks:
        if q_lower in lm["name"].lower():
            return {
                "name": lm["name"],
                "lat": float(lm["lat"]),
                "lon": float(lm["lon"]),
                "ward": lm.get("ward", "Pune Central"),
                "source": "offline_landmark_registry",
                "offline_fallback": True
            }
        for alias in lm.get("aliases", []):
            if q_lower in alias.lower():
                return {
                    "name": lm["name"],
                    "lat": float(lm["lat"]),
                    "lon": float(lm["lon"]),
                    "ward": lm.get("ward", "Pune Central"),
                    "source": "offline_landmark_registry",
                    "offline_fallback": True
                }

    # 2. Match ward or area keyword
    for lm in landmarks:
        if lm.get("ward", "").lower() in q_lower or q_lower in lm.get("ward", "").lower():
            return {
                "name": lm["name"],
                "lat": float(lm["lat"]),
                "lon": float(lm["lon"]),
                "ward": lm.get("ward", "Pune Central"),
                "source": "offline_landmark_registry",
                "offline_fallback": True
            }

    # 3. Default safe centroid (Shivajinagar Station) if unrecognized
    default_lm = landmarks[0] if landmarks else {
        "name": "Shivajinagar Station, Pune",
        "lat": 18.5314,
        "lon": 73.8446,
        "ward": "Shivajinagar"
    }
    return {
        "name": default_lm["name"],
        "lat": float(default_lm["lat"]),
        "lon": float(default_lm["lon"]),
        "ward": default_lm.get("ward", "Shivajinagar"),
        "source": "offline_landmark_registry_default",
        "offline_fallback": True,
        "unrecognized_query": q_clean
    }
