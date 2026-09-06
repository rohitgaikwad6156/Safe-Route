"""
Fixtures and mock data matching docs/contracts/data.md contracts.
Small hand-written fixtures without dependency on disk data files.
"""
import pytest

@pytest.fixture
def mock_ward_lighting():
    return {
        "Aundh - Baner": {"poles_per_km": 62.4, "total_poles": 9850, "road_km": 157.8, "rating": "Good"},
        "Aundh": {"poles_per_km": 62.4, "total_poles": 9850, "road_km": 157.8, "rating": "Good"},
        "Shivajinagar - Ghole Road": {"poles_per_km": 68.5, "total_poles": 10480, "road_km": 153.0, "rating": "Good"},
        "Kothrud - Bavdhan": {"poles_per_km": 58.1, "total_poles": 11200, "road_km": 192.7, "rating": "Moderate"},
        "Dhankawadi - Sahakarnagar": {"poles_per_km": 41.2, "total_poles": 6800, "road_km": 165.0, "rating": "Poor"},
        "Sinhagad Road": {"poles_per_km": 38.5, "total_poles": 6930, "road_km": 180.0, "rating": "Poor"},
        "Hadapsar - Mundhwa": {"poles_per_km": 44.5, "total_poles": 9345, "road_km": 210.0, "rating": "Poor"}
    }

@pytest.fixture
def mock_amenities():
    return {
        "hospitals": [
            {"id": "h_1", "lat": 18.5285, "lon": 73.8520, "name": "Sancheti Hospital", "type": "hospital", "subtype": "trauma"},
            {"id": "h_2", "lat": 18.5030, "lon": 73.8320, "name": "Deenanath Mangeshkar Hospital", "type": "hospital", "subtype": "multispeciality"}
        ],
        "police": [
            {"id": "p_1", "lat": 18.5314, "lon": 73.8446, "name": "Shivajinagar Police Station", "type": "police", "subtype": "police_station"}
        ],
        "ecbs": [
            {"id": "e_1", "lat": 18.5236, "lon": 73.8415, "name": "Smart City ECB - FC Road", "type": "ecb", "subtype": "panic_button"}
        ],
        "traffic_signals": [],
        "crossings": [],
        "street_lamps": []
    }
