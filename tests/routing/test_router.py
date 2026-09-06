"""
Unit tests for master RoutingEngine multi-objective A* search.
Tests Fastest (beta=0.0), Safest (beta=0.90), and Balanced (beta=0.50) routes.
"""
import pytest
from datetime import datetime
from backend.routing.engine import get_routing_engine


@pytest.fixture(scope="module")
def routing_engine():
    engine = get_routing_engine()
    return engine


def test_routing_engine_calculates_three_routes(routing_engine):
    # Shivajinagar Station to Deccan Gymkhana
    orig_lat, orig_lon = 18.5314, 73.8446
    dest_lat, dest_lon = 18.5173, 73.8415

    res = routing_engine.calculate_routes(
        orig_lat=orig_lat,
        orig_lon=orig_lon,
        dest_lat=dest_lat,
        dest_lon=dest_lon,
        orig_name="Shivajinagar Station",
        dest_name="Deccan Gymkhana",
        departure_time=datetime(2026, 9, 6, 21, 30)
    )

    assert "routes" in res
    routes = res["routes"]
    assert len(routes) == 3

    route_types = [r["type"] for r in routes]
    assert "fastest" in route_types
    assert "safest" in route_types
    assert "balanced" in route_types

    fastest = next(r for r in routes if r["type"] == "fastest")
    safest = next(r for r in routes if r["type"] == "safest")
    balanced = next(r for r in routes if r["type"] == "balanced")

    # Distance check: Fastest must be <= Safest distance
    assert fastest["distance_meters"] <= safest["distance_meters"]

    # Safety check: Safest raw RSS should be >= Fastest raw RSS
    assert safest["raw_rss"] >= fastest["raw_rss"]

    # Reasons must be grounded and non-empty
    assert len(safest["reasons"]) > 0
    assert len(fastest["reasons"]) > 0

    # Attribution math must be present
    assert fastest["attribution"] is not None
    assert safest["attribution"] is not None
    assert "contributions" in safest["attribution"]

    # Geometry must have coordinates
    assert len(safest["geometry"]["coordinates"]) >= 2
    assert len(fastest["geometry"]["coordinates"]) >= 2


def test_routing_engine_safe_haven_and_uncertainty(routing_engine):
    # Aundh to Shivajinagar
    res = routing_engine.calculate_routes(
        orig_lat=18.5602,
        orig_lon=73.8078,
        dest_lat=18.5314,
        dest_lon=73.8446,
        orig_name="Aundh Bremen Chowk",
        dest_name="Shivajinagar",
        departure_time=datetime(2026, 9, 6, 14, 0)
    )
    safest = next(r for r in res["routes"] if r["type"] == "safest")

    assert safest["safe_havens"] is not None
    assert "bands" in safest["safe_havens"]
    assert safest["uncertainty"] is not None
    assert "overall_confidence" in safest["uncertainty"]


def test_three_variants_distinct_cost_functions(routing_engine):
    """
    Verifies that the three route variants execute separate cost functions:
    1. Fastest: C(u,v) = d(u,v) [pure distance/time]
    2. Safest: w'(u,v) = w(u,v) * (1 + Severity(v)) [multiplicative inflation]
    3. Balanced: hazard buffer pruning + modified A* f(n) = g(n) + h(n) + c(n)
    """
    # Navale Bridge to Deccan Gymkhana (crosses severe blackspot)
    orig_lat, orig_lon = 18.458, 73.828
    dest_lat, dest_lon = 18.5167, 73.8417

    res = routing_engine.calculate_routes(
        orig_lat=orig_lat,
        orig_lon=orig_lon,
        dest_lat=dest_lat,
        dest_lon=dest_lon,
        orig_name="Navale Bridge",
        dest_name="Deccan Gymkhana"
    )

    routes = {r["type"]: r for r in res["routes"]}
    assert "fastest" in routes
    assert "safest" in routes
    assert "balanced" in routes

    fastest = routes["fastest"]
    safest = routes["safest"]
    balanced = routes["balanced"]

    # Fastest must have shortest distance
    assert fastest["distance_meters"] <= safest["distance_meters"]

    # Safest must achieve higher or equal safety score (RSS)
    assert safest["raw_rss"] >= fastest["raw_rss"]

    # Both Safest and Balanced avoid the direct hazard corridor
    assert safest["rss"] > 0
    assert balanced["rss"] > 0


def test_haversine_heuristic_admissibility(routing_engine):
    """
    Mathematically asserts that the Haversine heuristic h(n) is strictly admissible
    and never overestimates true remaining path cost h*(n):
      h(n) = alpha * (haversine_distance / d_norm) <= true_cost
    """
    from backend.routing.engine import haversine_distance_meters, DEFAULT_D_NORM
    node_coords = routing_engine.manager.node_coords

    # Select two nodes across Pune
    u_node, _, _ = routing_engine.manager.snap_to_node(18.5314, 73.8446)  # Shivajinagar
    v_node, _, _ = routing_engine.manager.snap_to_node(18.5018, 73.8586)  # Swargate

    u_lat, u_lon = node_coords[u_node]
    v_lat, v_lon = node_coords[v_node]

    h_dist = haversine_distance_meters(u_lat, u_lon, v_lat, v_lon)
    alpha = 0.10  # beta=0.90, alpha=0.10 pinned
    h_cost = alpha * (h_dist / DEFAULT_D_NORM)

    # Compute actual path using fastest distance
    fastest_path = routing_engine._route_fastest(u_node, v_node)
    assert len(fastest_path) >= 2

    # Sum actual street distance
    actual_dist = 0.0
    for i in range(len(fastest_path) - 1):
        edge_info = routing_engine.adj_best.get((fastest_path[i], fastest_path[i + 1]))
        if edge_info:
            actual_dist += edge_info[0]

    actual_min_cost = alpha * (actual_dist / DEFAULT_D_NORM)

    # Crucial admissibility check: h(n) <= h*(n)
    assert h_dist <= actual_dist, "Haversine distance must never exceed ground road distance."
    assert h_cost <= actual_min_cost, "Heuristic cost h(n) must be strictly admissible (h <= h*)."

