import math
import pytest
from datetime import datetime

from backend.routing.engine import get_routing_engine, haversine_distance_meters


OD_PAIRS = [
    (18.5314, 73.8446, "Shivajinagar Station", 18.4529, 73.8553, "Katraj Chowk"),
    (18.5090, 73.8076, "Kothrud Depot",          18.4580, 73.8280, "Katraj Chowk"),
    (18.5602, 73.8078, "Aundh",                18.5018, 73.8586, "Swargate"),
    (18.5559, 73.7856, "Baner Road",             18.5089, 73.9259, "Hadapsar"),
    (18.5590, 73.8078, "Aundh Bremen Chowk",     18.5667, 73.9167, "Viman Nagar"),
]

DEPARTURE = datetime(2026, 9, 6, 21, 30)
DEST_TOLERANCE_M = 500.0
DISTINCT_FRACTION = 0.60


@pytest.fixture(scope="module")
def engine():
    return get_routing_engine()


def _haversine_coords(c1, lat2, lon2):
    lon1, lat1 = c1
    return haversine_distance_meters(lat1, lon1, lat2, lon2)


def _compute_all(engine, orig_lat, orig_lon, orig_name, dest_lat, dest_lon, dest_name):
    return engine.calculate_routes(
        orig_lat=orig_lat, orig_lon=orig_lon,
        dest_lat=dest_lat, dest_lon=dest_lon,
        orig_name=orig_name, dest_name=dest_name,
        departure_time=DEPARTURE,
    )


@pytest.mark.parametrize("orig_lat,orig_lon,orig_name,dest_lat,dest_lon,dest_name", OD_PAIRS)
def test_non_empty_routes(engine, orig_lat, orig_lon, orig_name, dest_lat, dest_lon, dest_name):
    res = _compute_all(engine, orig_lat, orig_lon, orig_name, dest_lat, dest_lon, dest_name)
    routes = {r["type"]: r for r in res["routes"]}
    for variant in ("fastest", "safest", "balanced"):
        coords = routes[variant]["geometry"]["coordinates"]
        assert len(coords) >= 2


@pytest.mark.parametrize("orig_lat,orig_lon,orig_name,dest_lat,dest_lon,dest_name", OD_PAIRS)
def test_route_reaches_destination(engine, orig_lat, orig_lon, orig_name, dest_lat, dest_lon, dest_name):
    res = _compute_all(engine, orig_lat, orig_lon, orig_name, dest_lat, dest_lon, dest_name)
    routes = {r["type"]: r for r in res["routes"]}
    for variant in ("fastest", "safest", "balanced"):
        coords = routes[variant]["geometry"]["coordinates"]
        if not coords:
            pytest.fail(f"{variant} has empty coordinates for {orig_name} -> {dest_name}")
        last_coord = coords[-1]
        dist_m = _haversine_coords(last_coord, dest_lat, dest_lon)
        assert dist_m <= DEST_TOLERANCE_M, (
            f"{variant} route for {orig_name} -> {dest_name}: last coord is {dist_m:.0f}m from destination"
        )


def test_route_variants_are_distinct(engine):
    distinct_count = 0
    for orig_lat, orig_lon, orig_name, dest_lat, dest_lon, dest_name in OD_PAIRS:
        res = _compute_all(engine, orig_lat, orig_lon, orig_name, dest_lat, dest_lon, dest_name)
        routes = {r["type"]: r for r in res["routes"]}
        if routes["fastest"]["geometry"]["coordinates"] != routes["safest"]["geometry"]["coordinates"]:
            distinct_count += 1
    required = math.ceil(len(OD_PAIRS) * DISTINCT_FRACTION)
    assert distinct_count >= required, (
        f"Only {distinct_count}/{len(OD_PAIRS)} pairs had distinct Fastest vs Safest paths (need {required})"
    )


@pytest.mark.parametrize("orig_lat,orig_lon,orig_name,dest_lat,dest_lon,dest_name", OD_PAIRS)
def test_fastest_distance_leq_safest(engine, orig_lat, orig_lon, orig_name, dest_lat, dest_lon, dest_name):
    res = _compute_all(engine, orig_lat, orig_lon, orig_name, dest_lat, dest_lon, dest_name)
    routes = {r["type"]: r for r in res["routes"]}
    fastest_d = routes["fastest"]["distance_meters"]
    safest_d  = routes["safest"]["distance_meters"]
    assert fastest_d <= safest_d * 1.05, (
        f"Fastest ({fastest_d}m) > Safest ({safest_d}m) for {orig_name} -> {dest_name}"
    )


@pytest.mark.parametrize("orig_lat,orig_lon,orig_name,dest_lat,dest_lon,dest_name", OD_PAIRS)
def test_safest_rss_geq_fastest(engine, orig_lat, orig_lon, orig_name, dest_lat, dest_lon, dest_name):
    res = _compute_all(engine, orig_lat, orig_lon, orig_name, dest_lat, dest_lon, dest_name)
    routes = {r["type"]: r for r in res["routes"]}
    fastest_rss = routes["fastest"]["raw_rss"]
    safest_rss  = routes["safest"]["raw_rss"]
    assert safest_rss >= fastest_rss - 2.0, (
        f"Safest RSS ({safest_rss}) < Fastest RSS ({fastest_rss}) for {orig_name} -> {dest_name}"
    )


def test_expanded_graph_connects_outer_pune_destinations(engine):
    """PCCOE and Hinjawadi are now first-class graph locations, not connectors."""
    pccoe = _compute_all(engine, 18.5314, 73.8446, 'Shivajinagar', 18.6520, 73.7615, 'PCCOE Akurdi')
    hinjawadi = _compute_all(engine, 18.5923, 73.7387, 'Hinjawadi Phase 1', 18.5018, 73.8586, 'Swargate')
    assert len(pccoe["routes"]) == 3
    assert len(hinjawadi["routes"]) == 3
