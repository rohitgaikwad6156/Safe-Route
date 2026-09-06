"""
SafeRoute AI: Calibrated Multi-Objective Routing Engine.

Computes Fastest (beta=0.0), Safest (beta=0.90), and Balanced (beta=0.50) routes
across Pune's 56k-node, 130k-edge road network graph.
Uses non-dimensionalized edge cost function:
  cost(e) = (1 - beta) * (length / d_norm) + beta * (risk / 100.0)
where d_norm = 100m.

Connects directly to the ExplanationEngine for grounded explanations, counterfactual
detours, temporal causation, uncertainty, and safe havens.
"""
import os
import json
import time
import math
import heapq
import pickle
import logging
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass
from typing import Dict, List, Tuple, Any, Optional
import networkx as nx
import numpy as np
from scipy.spatial import cKDTree
from shapely import wkt

logger = logging.getLogger(__name__)

from backend.routing.graph_loader import PuneGraphManager, get_graph_manager
from backend.scoring.accident import calculate_accident_score
from backend.scoring.emergency import calculate_emergency_score
from backend.scoring.lighting import calculate_lighting_score
from backend.scoring.pedestrian import calculate_pedestrian_score
from backend.scoring.traffic import calculate_traffic_score
from backend.scoring.sss import calculate_sss
from backend.scoring.rss import calculate_raw_rss, calculate_rss, RouteSegment
from backend.scoring.temporal import get_weekend_modifier
from backend.explain.engine import ExplanationEngine


DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DEFAULT_D_NORM = 100.0  # Characteristic street normalization denominator (meters)
WALK_SPEED_MPS = 1.3    # Standard pedestrian walking speed (m/s)
DRIVE_SPEED_KMH = 30.0  # Urban Pune reference speed (km/h)


# Reuse canonical Haversine helper from validator.py (no duplication)
from backend.routing.validator import haversine_distance_meters


@dataclass(frozen=True)
class CachedEdge:
    target: str
    length_meters: float
    sss: float
    risk: float
    severity: float
    in_hazard_buffer: bool
    mid_lat: float
    mid_lon: float
    payload: Dict[str, Any]


class RoutingEngine:
    """Master routing engine providing cached edge weights, A* pathfinding, and explanation generation."""

    def __init__(
        self,
        manager: Optional[PuneGraphManager] = None,
        risk_grid: Optional[Dict[str, float]] = None,
        amenities: Optional[Dict[str, Any]] = None,
        ward_lighting: Optional[Dict[str, Any]] = None
    ):
        self.manager = manager or get_graph_manager()
        if not self.manager.is_ready:
            self.manager.load()

        # Load data layers
        if risk_grid is None:
            with open(DATA_DIR / "risk_grid.json", "r", encoding="utf-8") as f:
                risk_grid = json.load(f)
        self.risk_grid = risk_grid

        if amenities is None:
            with open(DATA_DIR / "amenities.json", "r", encoding="utf-8") as f:
                amenities = json.load(f)
        self.amenities = amenities

        if ward_lighting is None:
            with open(DATA_DIR / "ward_lighting.json", "r", encoding="utf-8") as f:
                ward_lighting = json.load(f)
        self.ward_lighting = ward_lighting

        self.explanation_engine = ExplanationEngine(amenities=self.amenities, risk_grid=self.risk_grid)

        # Build emergency amenities KDTree
        em_pts = []
        for cat in ["hospitals", "police", "ecbs"]:
            for item in self.amenities.get(cat, []):
                em_pts.append([float(item["lat"]), float(item["lon"])])
        self.em_tree = cKDTree(np.array(em_pts)) if em_pts else None

        # Build severe blackspot KDTree (Severity > 0.5, i.e. WSI > 17.5 out of 35.0)
        severe_pts = []
        for cell_key, wsi_val in self.risk_grid.items():
            if float(wsi_val) / 35.0 > 0.5:
                try:
                    clat, clon = map(float, cell_key.split("_"))
                    severe_pts.append([clat, clon])
                except Exception:
                    pass
        self.severe_tree = cKDTree(np.array(severe_pts)) if severe_pts else None

        # Build edge weight cache and adjacency representation on largest component
        self._build_edge_cache()

    def _build_edge_cache(self) -> None:
        """Precomputes SSS, subscores, severity, and hazard buffer status across all edges or loads from disk."""
        cache_path = DATA_DIR / "precomputed_sss.pkl"
        if cache_path.exists():
            try:
                t0 = time.time()
                with open(cache_path, "rb") as f:
                    self.adj, self.adj_best = pickle.load(f)
                logger.info(f"Loaded precomputed SSS edge cache in {time.time() - t0:.3f}s from {cache_path.name}")
                return
            except Exception as e:
                logger.warning(f"Failed to load precomputed edge cache from {cache_path}: {e}. Recomputing...")

        graph = self.manager.largest_component_graph
        node_coords = self.manager.node_coords

        self.adj: Dict[str, List[CachedEdge]] = {
            n: [] for n in graph.nodes
        }
        self.adj_best: Dict[Tuple[str, str], Tuple[float, float, float, Dict[str, Any]]] = {}

        edge_list = list(graph.edges(keys=True, data=True))
        if not edge_list:
            return

        midpoints = []
        for u, v, k, d in edge_list:
            u_lat, u_lon = node_coords.get(str(u), (18.5204, 73.8567))
            v_lat, v_lon = node_coords.get(str(v), (18.5204, 73.8567))
            midpoints.append([(u_lat + v_lat) / 2.0, (u_lon + v_lon) / 2.0])

        midpoints = np.array(midpoints)
        if self.em_tree:
            em_dists_km = self.em_tree.query(midpoints)[0] * 111.0
        else:
            em_dists_km = np.zeros(len(edge_list))

        for i, (u, v, k, d) in enumerate(edge_list):
            u_str, v_str = str(u), str(v)
            length_m = float(d.get("length", 10.0))
            mid_lat, mid_lon = midpoints[i]
            cell_key = f"{mid_lat:.3f}_{mid_lon:.3f}"
            wsi = float(self.risk_grid.get(cell_key, 0.0))

            s_acc = calculate_accident_score(wsi)
            s_em = calculate_emergency_score(em_dists_km[i])
            s_light = calculate_lighting_score(d.get("lit"))
            s_ped = calculate_pedestrian_score(d.get("sidewalk"), d.get("highway"))
            s_traf = calculate_traffic_score()

            full_sss = calculate_sss(s_acc, s_em, s_light, s_ped, s_traf)
            full_risk = 100.0 - full_sss

            # Severity(v) normalized against MoRTH/IRC WSI_max = 35.0 (per AGENTS.md rule 4)
            severity = min(1.0, wsi / 35.0)

            # Check if within 500m buffer of high-severity blackspot clusters (Severity > 0.5)
            in_hazard_buffer = False
            if self.severe_tree:
                dist_to_severe_m = float(self.severe_tree.query([mid_lat, mid_lon])[0]) * 111000.0
                if dist_to_severe_m <= 500.0:
                    in_hazard_buffer = True

            subscores = {
                "accident": s_acc,
                "emergency": s_em,
                "lighting": s_light,
                "pedestrian": s_ped,
                "traffic": s_traf
            }

            edge_payload = {
                "id": f"{u_str}_{v_str}",
                "u": u_str,
                "v": v_str,
                "name": d.get("name") or "unnamed",
                "highway": d.get("highway") or "residential",
                "length_meters": length_m,
                "wsi": wsi,
                "severity": severity,
                "in_hazard_buffer": in_hazard_buffer,
                "lit": d.get("lit") or "",
                "sidewalk": d.get("sidewalk") or "",
                "subscores": subscores,
                "geometry": d.get("geometry")
            }

            cached_edge = CachedEdge(
                target=v_str,
                length_meters=length_m,
                sss=full_sss,
                risk=full_risk,
                severity=severity,
                in_hazard_buffer=in_hazard_buffer,
                mid_lat=mid_lat,
                mid_lon=mid_lon,
                payload=edge_payload
            )
            self.adj[u_str].append(cached_edge)

            # Store best (shortest) in adj_best
            pair_key = (u_str, v_str)
            if pair_key not in self.adj_best or length_m < self.adj_best[pair_key][0]:
                self.adj_best[pair_key] = (length_m, full_sss, full_risk, edge_payload)

        # Persist precomputed edge scores to disk for instant O(1) restarts
        try:
            with open(cache_path, "wb") as f:
                pickle.dump((self.adj, self.adj_best), f, protocol=pickle.HIGHEST_PROTOCOL)
            logger.info(f"Persisted precomputed SSS edge cache ({len(self.adj_best)} edges) to {cache_path.name}")
        except Exception as e:
            logger.warning(f"Could not persist precomputed edge cache to {cache_path}: {e}")

    def _route_fastest(self, source: str, target: str) -> List[str]:
        """
        Variant 1 - Fastest Route:
        Cost function: C(u, v) = d(u, v) [pure distance/time, ignores risk R(v)].
        Heuristic: Haversine distance in meters / d_norm.
        Admissibility verification: Straight-line Haversine distance <= network road distance,
        so h(u) <= h*(u). Never overestimates true remaining cost.
        """
        node_coords = self.manager.node_coords
        t_lat, t_lon = node_coords[target]

        def h(u: str) -> float:
            u_lat, u_lon = node_coords[u]
            return haversine_distance_meters(u_lat, u_lon, t_lat, t_lon) / DEFAULT_D_NORM

        open_set = [(h(source), 0.0, source)]
        came_from: Dict[str, str] = {}
        g_scores: Dict[str, float] = {source: 0.0}

        while open_set:
            f, g, u = heapq.heappop(open_set)
            if u == target:
                path = [u]
                curr = u
                while curr in came_from:
                    curr = came_from[curr]
                    path.append(curr)
                path.reverse()
                return path

            if g > g_scores.get(u, float("inf")):
                continue

            for edge in self.adj.get(u, []):
                v = edge.target
                cost_uv = edge.length_meters / DEFAULT_D_NORM
                tentative_g = g + cost_uv

                if tentative_g < g_scores.get(v, float("inf")):
                    g_scores[v] = tentative_g
                    came_from[v] = u
                    heapq.heappush(open_set, (tentative_g + h(v), tentative_g, v))

        return []

    def _route_safest(self, source: str, target: str) -> List[str]:
        """
        Variant 2 - Safest Route:
        Cost function: w'(u, v) = w(u, v) * (1 + Severity(v)) [multiplicative penalty inflation].
        Base composite cost: w(u, v) = alpha * (d(u,v) / d_norm) + beta * (R(v) / 100.0).

        # Sourced from docs/experiments/divergence_results.md:
        # Empirical parameter sweep across 20 Pune OD pairs confirmed beta=0.90 (alpha=0.10)
        # achieves optimal divergence while guaranteeing distance overhead <= 30%.
        #
        # NOTE: The research document's beta=0.70 / alpha=0.30 figure was explicitly
        # superseded by the empirical sweep in docs/experiments/divergence_results.md.
        # Do NOT 'fix' or revert this back to 0.70/0.30.
        """
        beta = 0.90
        alpha = 0.10

        node_coords = self.manager.node_coords
        t_lat, t_lon = node_coords[target]

        def h(u: str) -> float:
            u_lat, u_lon = node_coords[u]
            # Admissibility verification:
            # Since w'(u, v) >= w(u, v) >= alpha * (d(u,v) / d_norm),
            # h(u) = alpha * (haversine / d_norm) <= true remaining cost h*(u).
            return alpha * (haversine_distance_meters(u_lat, u_lon, t_lat, t_lon) / DEFAULT_D_NORM)

        open_set = [(h(source), 0.0, source)]
        came_from: Dict[str, str] = {}
        g_scores: Dict[str, float] = {source: 0.0}

        while open_set:
            f, g, u = heapq.heappop(open_set)
            if u == target:
                path = [u]
                curr = u
                while curr in came_from:
                    curr = came_from[curr]
                    path.append(curr)
                path.reverse()
                return path

            if g > g_scores.get(u, float("inf")):
                continue

            for edge in self.adj.get(u, []):
                v = edge.target
                base_w = alpha * (edge.length_meters / DEFAULT_D_NORM) + beta * (edge.risk / 100.0)
                cost_uv = base_w * (1.0 + edge.severity)
                tentative_g = g + cost_uv

                if tentative_g < g_scores.get(v, float("inf")):
                    g_scores[v] = tentative_g
                    came_from[v] = u
                    heapq.heappush(open_set, (tentative_g + h(v), tentative_g, v))

        return []

    def _route_balanced(self, source: str, target: str) -> List[str]:
        """
        Variant 3 - Balanced Route:
        Prunes nodes/edges where Severity(v) > 0.5 within a 500m buffer.
        Then runs modified A* with f(n) = g(n) + h(n) + c(n) on the pruned graph,
        where h(n) is the Haversine heuristic.

        # Sourced from docs/experiments/divergence_results.md:
        # Empirical parameter sweep across 20 Pune OD pairs confirmed beta=0.90 (alpha=0.10)
        # achieves optimal divergence while guaranteeing distance overhead <= 30%.
        #
        # NOTE: The research document's beta=0.70 / alpha=0.30 figure was explicitly
        # superseded by the empirical sweep in docs/experiments/divergence_results.md.
        # Do NOT 'fix' or revert this back to 0.70/0.30.
        """
        # Balanced route: beta=0.50 (alpha=0.50) balances distance efficiency with safety weighting
        beta = 0.50
        alpha = 0.50

        node_coords = self.manager.node_coords
        s_lat, s_lon = node_coords[source]
        t_lat, t_lon = node_coords[target]

        def h(u: str) -> float:
            u_lat, u_lon = node_coords[u]
            # Admissibility verification:
            # For any edge (u, v), edge_cost >= alpha * (d(u,v) / d_norm) because risk >= 0.
            # Road network distance >= Haversine distance, so alpha * (haversine / d_norm)
            # is strictly <= true remaining cost h*(n) on the road network.
            # Therefore h(n) is mathematically guaranteed to be admissible and never overestimates.
            return alpha * (haversine_distance_meters(u_lat, u_lon, t_lat, t_lon) / DEFAULT_D_NORM)

        def is_pruned(edge: CachedEdge) -> bool:
            # Prune if inside 500m hazard buffer and Severity > 0.5
            if not edge.in_hazard_buffer and edge.severity <= 0.5:
                return False
            # Protect source and target connectivity:
            # Do not prune edges within 500m of source or target to ensure trips originating
            # or ending near blackspots (e.g. Navale Bridge, Katraj Chowk) can depart and arrive.
            dist_to_src = haversine_distance_meters(edge.mid_lat, edge.mid_lon, s_lat, s_lon)
            dist_to_tgt = haversine_distance_meters(edge.mid_lat, edge.mid_lon, t_lat, t_lon)
            if dist_to_src <= 500.0 or dist_to_tgt <= 500.0:
                return False
            return True

        def run_search(prune: bool) -> List[str]:
            # Priority queue holds (f_score, g_score, u)
            # f(n) = g(n) + h(n) + c(n)
            open_set = [(h(source), 0.0, source)]
            came_from: Dict[str, str] = {}
            g_scores: Dict[str, float] = {source: 0.0}

            while open_set:
                f, g, u = heapq.heappop(open_set)
                if u == target:
                    path = [u]
                    curr = u
                    while curr in came_from:
                        curr = came_from[curr]
                        path.append(curr)
                    path.reverse()
                    return path

                if g > g_scores.get(u, float("inf")):
                    continue

                for edge in self.adj.get(u, []):
                    if prune and is_pruned(edge):
                        continue

                    v = edge.target
                    edge_cost = alpha * (edge.length_meters / DEFAULT_D_NORM) + beta * (edge.risk / 100.0)
                    tentative_g = g + edge_cost

                    if tentative_g < g_scores.get(v, float("inf")):
                        g_scores[v] = tentative_g
                        came_from[v] = u
                        # Contextual penalty c(n) = beta * (edge.risk / 100.0)
                        # Modified A*: f(n) = g(n) + h(n) + c(n)
                        c_n = beta * (edge.risk / 100.0)
                        f_n = tentative_g + h(v) + c_n
                        heapq.heappush(open_set, (f_n, tentative_g, v))

            return []

        # Attempt A* search on pruned graph first
        path = run_search(prune=True)
        if not path:
            # Fallback to unpruned search if pruning partitioned the network
            path = run_search(prune=False)

        return path

    def _astar(
        self,
        source: str,
        target: str,
        beta: float,
        d_norm: float = DEFAULT_D_NORM
    ) -> List[str]:
        """
        Executes calibrated A* search with arbitrary beta.
        Maintained for backwards compatibility.
        """
        node_coords = self.manager.node_coords
        t_lat, t_lon = node_coords[target]
        alpha = 1.0 - beta

        def h(u: str) -> float:
            u_lat, u_lon = node_coords[u]
            return alpha * (haversine_distance_meters(u_lat, u_lon, t_lat, t_lon) / d_norm)

        open_set = [(h(source), 0.0, source)]
        came_from: Dict[str, str] = {}
        g_scores: Dict[str, float] = {source: 0.0}

        while open_set:
            f, g, u = heapq.heappop(open_set)

            if u == target:
                path = [u]
                curr = u
                while curr in came_from:
                    curr = came_from[curr]
                    path.append(curr)
                path.reverse()
                return path

            if g > g_scores.get(u, float("inf")):
                continue

            for edge in self.adj.get(u, []):
                v = edge.target
                cost_e = alpha * (edge.length_meters / d_norm) + beta * (edge.risk / 100.0)
                tentative_g = g + cost_e

                if tentative_g < g_scores.get(v, float("inf")):
                    g_scores[v] = tentative_g
                    came_from[v] = u
                    heapq.heappush(open_set, (tentative_g + h(v), tentative_g, v))

        return []


    def _build_route_data(
        self,
        path: List[str],
        route_id: str,
        name: str,
        route_type: str,
        color: str,
        departure_time: Optional[datetime] = None,
        orig_pin: Optional[Tuple[float, float]] = None,
        dest_pin: Optional[Tuple[float, float]] = None,
        corridor_prefix: Optional[List[List[float]]] = None,
        corridor_suffix: Optional[List[List[float]]] = None,
        extra_distance_m: float = 0.0,
        extra_duration_s: int = 0,
        corridor_steps_prefix: Optional[List[Dict[str, Any]]] = None,
        corridor_steps_suffix: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Assembles complete RouteData structure from a node path."""
        node_coords = self.manager.node_coords
        segments: List[Dict[str, Any]] = []
        route_segments_rss: List[RouteSegment] = []
        coordinates: List[List[float]] = []

        total_distance = 0.0
        weighted_subscores = {"accident": 0.0, "emergency": 0.0, "lighting": 0.0, "pedestrian": 0.0, "traffic": 0.0}

        for i in range(len(path) - 1):
            u, v = path[i], path[i + 1]
            edge_info = self.adj_best.get((u, v))
            if edge_info:
                length_m, sss, risk, payload = edge_info
            else:
                length_m, sss, risk = 10.0, 50.0, 50.0
                payload = {"name": "unnamed", "highway": "residential", "subscores": {k: 50.0 for k in weighted_subscores}}

            total_distance += length_m
            route_segments_rss.append(RouteSegment(length_meters=length_m, sss=sss))

            sub_dict = payload.get("subscores", {})
            for k in weighted_subscores:
                weighted_subscores[k] += length_m * float(sub_dict.get(k, 50.0))

            segments.append({
                "id": f"{u}_{v}",
                "u": u,
                "v": v,
                "length_meters": length_m,
                "street_name": payload.get("name") or "Unnamed Road",
                "name": payload.get("name") or "Unnamed Road",
                "highway": payload.get("highway") or "residential",
                "lit": payload.get("lit") or "",
                "sidewalk": payload.get("sidewalk") or "",
                "wsi": payload.get("wsi", 0.0),
                "subscores": sub_dict
            })

            # Extract full road-following coordinates [lon, lat]
            u_lat, u_lon = node_coords[u]
            v_lat, v_lon = node_coords[v]
            geom_wkt = payload.get("geometry")
            edge_pts = None

            if geom_wkt is not None:
                try:
                    # Case A: Shapely LineString object with coords attribute (standard OSMnx edge geometry)
                    if hasattr(geom_wkt, "coords"):
                        raw_pts = [[round(pt[0], 6), round(pt[1], 6)] for pt in geom_wkt.coords]
                    # Case B: Serialized WKT string (e.g. from GraphML export)
                    elif isinstance(geom_wkt, str):
                        ls = wkt.loads(geom_wkt)
                        raw_pts = [[round(pt[0], 6), round(pt[1], 6)] for pt in ls.coords]
                    else:
                        raw_pts = None

                    if raw_pts:
                        # Ensure orientation flows correctly from u to v
                        d_u = (raw_pts[0][0] - u_lon)**2 + (raw_pts[0][1] - u_lat)**2
                        d_v = (raw_pts[0][0] - v_lon)**2 + (raw_pts[0][1] - v_lat)**2
                        if d_v < d_u:
                            raw_pts.reverse()
                        edge_pts = raw_pts
                except Exception as _geom_err:
                    logger.debug(
                        "Geometry decode failed for edge (%s->%s), falling back to straight line: %s",
                        u, v, _geom_err
                    )

            if edge_pts:
                if not coordinates:
                    coordinates.extend(edge_pts)
                else:
                    # Avoid duplicate overlapping junction point
                    if coordinates[-1] == edge_pts[0]:
                        coordinates.extend(edge_pts[1:])
                    else:
                        coordinates.extend(edge_pts)
            else:
                if not coordinates:
                    coordinates.append([round(u_lon, 6), round(u_lat, 6)])
                coordinates.append([round(v_lon, 6), round(v_lat, 6)])

        # Prepend arterial corridor prefix or pin coordinate
        if corridor_prefix:
            coordinates = [list(pt) for pt in corridor_prefix] + coordinates
        elif orig_pin:
            p_lon, p_lat = round(orig_pin[1], 6), round(orig_pin[0], 6)
            if not coordinates or coordinates[0] != [p_lon, p_lat]:
                coordinates.insert(0, [p_lon, p_lat])

        # Append arterial corridor suffix or pin coordinate
        if corridor_suffix:
            coordinates = coordinates + [list(pt) for pt in corridor_suffix]
        elif dest_pin:
            d_lon, d_lat = round(dest_pin[1], 6), round(dest_pin[0], 6)
            if not coordinates or coordinates[-1] != [d_lon, d_lat]:
                coordinates.append([d_lon, d_lat])

        total_distance += extra_distance_m

        # Calculate mean subscores
        mean_subscores = {}
        for k, w_sum in weighted_subscores.items():
            mean_subscores[k] = round(w_sum / max(1.0, total_distance), 1)

        raw_rss = calculate_raw_rss(route_segments_rss)
        final_rss = calculate_rss(raw_rss, departure_time)

        # Duration estimate (mix of pedestrian and urban vehicle speed)
        duration_seconds = int(round(total_distance / (DRIVE_SPEED_KMH * 1000.0 / 3600.0))) + extra_duration_s

        # Risk level classification
        if final_rss >= 75.0:
            risk_level = "Safe Corridor"
        elif final_rss >= 60.0:
            risk_level = "Moderate Safety"
        elif final_rss >= 40.0:
            risk_level = "Elevated Risk"
        else:
            risk_level = "High Risk"

        # Generate turn steps
        steps = self._generate_steps(segments)
        if corridor_steps_prefix:
            steps = corridor_steps_prefix + steps
        if corridor_steps_suffix:
            steps = steps + corridor_steps_suffix

        return {
            "id": route_id,
            "name": name,
            "type": route_type,
            "color": color,
            "distance_meters": int(round(total_distance)),
            "duration_seconds": duration_seconds,
            "raw_rss": round(raw_rss, 1),
            "rss": round(final_rss, 1),
            "risk_level": risk_level,
            "reasons": [],
            "subscores": mean_subscores,
            "geometry": {
                "type": "LineString",
                "coordinates": coordinates
            },
            "steps": steps,
            "segments": segments
        }

    def _generate_steps(self, segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Generates simple consolidated navigation steps."""
        steps = []
        if not segments:
            return steps

        curr_street = segments[0].get("street_name") or "Unnamed Road"
        curr_dist = 0.0

        for seg in segments:
            st = seg.get("street_name") or "Unnamed Road"
            l = seg.get("length_meters", 10.0)
            if st == curr_street:
                curr_dist += l
            else:
                steps.append({
                    "instruction": f"Follow {curr_street}",
                    "street": curr_street,
                    "distance_meters": int(round(curr_dist))
                })
                curr_street = st
                curr_dist = l

        if curr_dist > 0:
            steps.append({
                "instruction": f"Follow {curr_street} to destination",
                "street": curr_street,
                "distance_meters": int(round(curr_dist))
            })

        return steps

    def calculate_routes(
        self,
        orig_lat: float,
        orig_lon: float,
        dest_lat: float,
        dest_lon: float,
        orig_name: str = "Origin",
        dest_name: str = "Destination",
        departure_time: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Calculates Fastest (beta=0.0), Safest (beta=0.90), and Balanced (beta=0.50) routes
        for any OD pair within the loaded graph.

        Both endpoints are always snapped via KDTree to the nearest node in the largest
        strongly-connected component, guaranteeing A* has a valid source and target and
        a path always exists between them. No location-specific special-casing is used.
        """
        t_dep = departure_time or datetime.now()
        is_weekend = get_weekend_modifier(t_dep) < 0.0
        time_str = t_dep.strftime("%H:%M")

        # --- Snap both endpoints to the largest strongly-connected component (KDTree) ---
        # snap_to_node() guarantees reachability: all nodes in largest_component_graph are
        # mutually reachable, so A* always finds a path between any two snapped nodes.
        u_node, u_snap_lat, u_snap_lon = self.manager.snap_to_node(orig_lat, orig_lon)
        v_node, v_snap_lat, v_snap_lon = self.manager.snap_to_node(dest_lat, dest_lon)

        logger.info(
            "Routing %s -> %s | snapped: (%s,%s)->node %s@(%.5f,%.5f), (%s,%s)->node %s@(%.5f,%.5f)",
            orig_name, dest_name,
            orig_lat, orig_lon, u_node, u_snap_lat, u_snap_lon,
            dest_lat, dest_lon, v_node, v_snap_lat, v_snap_lon
        )

        # --- Compute the three route variants ---
        fastest_path = self._route_fastest(u_node, v_node)
        safest_path  = self._route_safest(u_node, v_node)
        balanced_path = self._route_balanced(u_node, v_node)

        # Diagnostic: log path lengths and terminus coordinates to catch truncation
        for label, path in [("fastest", fastest_path), ("safest", safest_path), ("balanced", balanced_path)]:
            if path:
                last_lat, last_lon = self.manager.node_coords.get(path[-1], (None, None))
                logger.info(
                    "%-8s path: %d nodes | last node %s @ (%.5f, %.5f) | dest snap @ (%.5f, %.5f)",
                    label, len(path), path[-1], last_lat or 0.0, last_lon or 0.0,
                    v_snap_lat, v_snap_lon
                )
            else:
                logger.warning("%s A* returned empty path for %s -> %s", label, u_node, v_node)

        # --- Build route data payloads ---
        fastest_route = self._build_route_data(
            fastest_path,
            route_id="route-fastest",
            name="Fastest Route",
            route_type="fastest",
            color="#3b82f6",
            departure_time=t_dep,
            orig_pin=(orig_lat, orig_lon),
            dest_pin=(dest_lat, dest_lon),
        )

        safest_route = self._build_route_data(
            safest_path,
            route_id="route-safest",
            name="Safest Route",
            route_type="safest",
            color="#10b981",
            departure_time=t_dep,
            orig_pin=(orig_lat, orig_lon),
            dest_pin=(dest_lat, dest_lon),
        )

        balanced_route = self._build_route_data(
            balanced_path,
            route_id="route-balanced",
            name="Balanced Route",
            route_type="balanced",
            color="#f59e0b",
            departure_time=t_dep,
            orig_pin=(orig_lat, orig_lon),
            dest_pin=(dest_lat, dest_lon),
        )

        all_routes = [fastest_route, safest_route, balanced_route]

        # Generate grounded explanations via ExplanationEngine
        for route in all_routes:
            bundle = self.explanation_engine.generate_route_explanations(
                route=route,
                all_routes=all_routes,
                departure_time=t_dep,
                departure_time_str=time_str
            )
            route["reasons"] = bundle.get("reasons", [])
            route["attribution"] = bundle.get("attribution")
            route["counterfactual_detours"] = bundle.get("counterfactual_detours", [])
            route["uncertainty"] = bundle.get("uncertainty")
            route["safe_havens"] = bundle.get("safe_havens")

            # Clean internal segments from final API payload
            if "segments" in route:
                del route["segments"]

        return {
            "origin": {"name": orig_name, "lat": orig_lat, "lon": orig_lon},
            "destination": {"name": dest_name, "lat": dest_lat, "lon": dest_lon},
            "departure_time": time_str,
            "is_weekend": is_weekend,
            "routes": all_routes
        }


_GLOBAL_ROUTING_ENGINE: Optional[RoutingEngine] = None


def get_routing_engine() -> RoutingEngine:
    """Singleton getter for RoutingEngine."""
    global _GLOBAL_ROUTING_ENGINE
    if _GLOBAL_ROUTING_ENGINE is None:
        _GLOBAL_ROUTING_ENGINE = RoutingEngine()
    return _GLOBAL_ROUTING_ENGINE

