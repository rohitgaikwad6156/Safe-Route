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
import hashlib
import threading
import re
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
from backend.scoring.context import pune_now, traffic_context, night_risk_multiplier
from backend.scoring.pedestrian import (calculate_pss, calculate_sidewalk_subscore,
    calculate_crossing_subscore, calculate_road_class_subscore,
    calculate_speed_regulation_subscore, calculate_width_exposure_subscore)
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


class RoutePath(list):
    """Node sequence retaining the actual multigraph edges chosen by search."""
    def __init__(self, nodes=(), edges=(), context=None, notice=None):
        super().__init__(nodes)
        self.edges = list(edges)
        self.context = context
        self.notice = notice


class RoutingEngine:
    """Master routing engine providing cached edge weights, A* pathfinding, and explanation generation."""

    def __init__(
        self,
        manager: Optional[PuneGraphManager] = None,
        risk_grid: Optional[Dict[str, float]] = None,
        amenities: Optional[Dict[str, Any]] = None,
        ward_lighting: Optional[Dict[str, Any]] = None
    ):
        self.use_disk_cache = manager is None and risk_grid is None and amenities is None and ward_lighting is None
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
        digest = hashlib.sha256()
        for file in [Path(__file__), *sorted((DATA_DIR.parent / 'scoring').glob('*.py')),
                     DATA_DIR / 'pune_graph.pkl', DATA_DIR / 'risk_grid.json',
                     DATA_DIR / 'amenities.json', DATA_DIR / 'ward_lighting.json', DATA_DIR / 'landmarks.json']:
            if file.exists():
                digest.update(file.read_bytes())
        fingerprint = digest.hexdigest()
        if self.use_disk_cache and cache_path.exists():
            try:
                t0 = time.time()
                with open(cache_path, "rb") as f:
                    cached = pickle.load(f)
                if not isinstance(cached, dict) or cached.get('fingerprint') != fingerprint:
                    raise ValueError('Graph/data/scoring changed; rebuild cache')
                self.adj, self.adj_best = cached['adj'], cached['adj_best']
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

        # Network distance toward help, respecting road direction (PDF p40).
        help_nodes = {self.manager.snap_to_node(float(a['lat']), float(a['lon']))[0]
                      for cat in ('hospitals', 'police', 'ecbs') for a in self.amenities.get(cat, [])}
        help_distances = nx.multi_source_dijkstra_path_length(
            graph.reverse(copy=False), help_nodes, weight=lambda u, v, ds: min(float(d.get('length', 10)) for d in ds.values())
        ) if help_nodes else {}
        with open(DATA_DIR / 'landmarks.json', encoding='utf-8') as f:
            ward_points = [a for a in json.load(f).values() if a.get('ward')]
        ward_tree = cKDTree([[a['lat'], a['lon']] for a in ward_points]) if ward_points else None
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
            wsi_value = self.risk_grid.get(cell_key)
            wsi = float(wsi_value) if wsi_value is not None else None
            # Unknown accident data is retained as null. Routing uses the lower
            # endpoint of the SSS interval: zero credited accident-safety points.
            s_acc = calculate_accident_score(wsi) if wsi is not None else None
            distance_km = (length_m / 2 + help_distances.get(v, float('inf'))) / 1000
            s_em = calculate_emergency_score(distance_km)
            ward = d.get('ward')
            ward_source = 'OSM ward tag' if ward else 'unavailable'
            if not ward and ward_tree:
                dist, wi = ward_tree.query([mid_lat, mid_lon])
                if dist * 111000 <= 3000:
                    ward = ward_points[wi]['ward']
                    ward_source = 'estimated from nearest committed landmark; no ward polygons'
            s_light = calculate_lighting_score(d.get('lit'), ward_name=ward, ward_lighting_map=self.ward_lighting)
            def number(value):
                match = re.search(r'\d+(?:\.\d+)?', str(value)) if value is not None else None
                return float(match.group()) if match else None
            crossing = d.get('crossing') or graph.nodes[v].get('crossing')
            island = str(d.get('crossing:island', graph.nodes[v].get('crossing:island', 'no'))) == 'yes'
            s_ped = calculate_pss(
                calculate_sidewalk_subscore(d.get('sidewalk'), d.get('highway')),
                calculate_crossing_subscore(crossing, island),
                calculate_road_class_subscore(d.get('highway')), s_light / 100,
                calculate_speed_regulation_subscore(number(d.get('maxspeed')), bool(d.get('traffic_calming'))),
                calculate_width_exposure_subscore(number(d.get('width')), number(d.get('lanes'))),
            )
            s_traf = calculate_traffic_score()
            full_sss = calculate_sss(s_acc if s_acc is not None else 0, s_em, s_light, s_ped, s_traf)
            full_risk = 100.0 - full_sss
            severity = min(1.0, wsi / 35.0) if wsi is not None else 0.0

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
                "id": f"{u_str}_{v_str}_{k}",
                "key": str(k),
                "accident_known": wsi is not None,
                "ward": ward,
                "ward_source": ward_source,
                "emergency_distance_km": distance_km,
                "cell_key": cell_key,
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
            if self.use_disk_cache:
                temp_path = cache_path.with_suffix('.tmp')
                with open(temp_path, "wb") as f:
                    pickle.dump(dict(fingerprint=fingerprint, adj=self.adj, adj_best=self.adj_best), f, protocol=pickle.HIGHEST_PROTOCOL)
                temp_path.replace(cache_path)
            logger.info(f"Persisted precomputed SSS edge cache ({len(self.adj_best)} edges) to {cache_path.name}")
        except Exception as e:
            logger.warning(f"Could not persist precomputed edge cache to {cache_path}: {e}")

    def query_context(self, departure=None, snapshot=None):
        from backend.scoring.corroboration import active_hazard_snapshot
        departure = departure or pune_now()
        return dict(departure=departure, traffic=traffic_context(departure),
                    tau=night_risk_multiplier(departure),
                    hazards=active_hazard_snapshot() if snapshot is None else snapshot, values={})

    def edge_values(self, edge, context):
        key = edge.payload['id']
        if key not in context['values']:
            hazard = context['hazards'].score(edge.mid_lat, edge.mid_lon)
            base = edge.sss + .15 * (context['traffic'][0] - 80.0)
            lower = max(0.0, base - hazard)
            upper = max(0.0, min(100.0, base + (30.0 if edge.payload['wsi'] is None else 0.0)) - hazard)
            context['values'][key] = (lower, upper, hazard)
        return context['values'][key]

    def _search(self, source, target, beta, context=None, inflate=False, prune=False):
        context = context or self.query_context()
        alpha = 1.0 - beta
        target_lat, target_lon = self.manager.node_coords[target]
        def heuristic(node):
            lat, lon = self.manager.node_coords[node]
            return alpha * haversine_distance_meters(lat, lon, target_lat, target_lon) / DEFAULT_D_NORM
        pending = [(heuristic(source), 0.0, source)]
        best = {source: 0.0}
        previous = {}
        while pending:
            _, cost, u = heapq.heappop(pending)
            if cost > best.get(u, math.inf):
                continue
            if u == target:
                nodes, edges = [u], []
                while u in previous:
                    parent, edge = previous[u]
                    edges.append(edge)
                    nodes.append(parent)
                    u = parent
                return RoutePath(reversed(nodes), reversed(edges), context)
            for edge in self.adj.get(u, []):
                if prune and edge.in_hazard_buffer:
                    continue
                lower, _, _ = self.edge_values(edge, context) if beta else (0, 0, 0)
                weight = alpha * edge.length_meters / DEFAULT_D_NORM + beta * context['tau'] * (100-lower)/100
                if inflate:
                    weight *= 1 + edge.severity
                candidate = cost + weight
                if candidate < best.get(edge.target, math.inf):
                    best[edge.target] = candidate
                    previous[edge.target] = (u, edge)
                    heapq.heappush(pending, (candidate + heuristic(edge.target), candidate, edge.target))
        return RoutePath(context=context, notice='No route satisfies the hazard exclusion.')

    def _route_fastest(self, source, target, context=None):
        return self._search(source, target, 0.0, context)

    def _route_safest(self, source, target, context=None):
        return self._search(source, target, 0.90, context, inflate=True)

    def _route_balanced(self, source, target, context=None):
        path = self._search(source, target, 0.50, context, prune=True)
        if not path:
            path = self._search(source, target, 0.50, context)
            path.notice = 'Strict 500 m hazard exclusion disconnects this trip. Showing an unpruned alternative.'
        return path

    def _astar(self, source, target, beta, d_norm=DEFAULT_D_NORM):
        return self._search(source, target, beta)

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
            if isinstance(path, RoutePath):
                edge = path.edges[i]
            else:
                edge = min((e for e in self.adj[u] if e.target == v), key=lambda e: e.length_meters)
            length_m, payload = edge.length_meters, edge.payload
            context = getattr(path, 'context', None) or self.query_context(departure_time)
            sss, upper_sss, hazard = self.edge_values(edge, context)
            payload = dict(payload, subscores=dict(payload['subscores'], traffic=context['traffic'][0]))
            total_distance += length_m
            route_segments_rss.append(RouteSegment(length_meters=length_m, sss=sss))

            sub_dict = payload.get("subscores", {})
            for k in weighted_subscores:
                weighted_subscores[k] += length_m * float(sub_dict.get(k) or 0.0)

            segments.append({
                "id": payload["id"],
                "u": u,
                "v": v,
                "length_meters": length_m,
                "street_name": payload.get("name") or "Unnamed Road",
                "name": payload.get("name") or "Unnamed Road",
                "highway": payload.get("highway") or "residential",
                "lit": payload.get("lit") or "",
                "sidewalk": payload.get("sidewalk") or "",
                "wsi": payload.get("wsi"),
                "cell_key": payload.get("cell_key"),
                "sss": sss,
                "upper_sss": upper_sss,
                "community_hazard": hazard,
                "ward_source": payload.get("ward_source"),
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

        if not coordinates and path:
            lat, lon = node_coords[path[0]]
            coordinates = [[lon, lat], [lon, lat]]
        total_distance += extra_distance_m

        # Calculate mean subscores
        mean_subscores = {}
        for k, w_sum in weighted_subscores.items():
            mean_subscores[k] = round(w_sum / max(1.0, total_distance), 1)

        raw_rss = calculate_raw_rss(route_segments_rss)
        final_rss = calculate_rss(raw_rss, departure_time)
        upper_raw = sum(seg['upper_sss'] * seg['length_meters'] for seg in segments) / max(1, total_distance)
        unknown_pct = 100 * sum(seg['length_meters'] for seg in segments if seg['wsi'] is None) / max(1, total_distance)
        if unknown_pct:
            mean_subscores['accident'] = None

        # Duration estimate (mix of pedestrian and urban vehicle speed)
        duration_seconds = int(round(total_distance / (DRIVE_SPEED_KMH * 1000.0 / 3600.0) * traffic_context(departure_time or pune_now())[1])) + extra_duration_s

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
            "rss_upper": round(calculate_rss(upper_raw, departure_time), 1),
            "unknown_accident_percentage": round(unknown_pct, 1),
            "score_status": "lower_bound" if unknown_pct else "estimated",
            "notice": getattr(path, 'notice', None),
            "traffic_source": "Simulated hourly congestion (research p26); ETA uses 30 km/h reference speed",
            "community_penalty": round(sum(seg['community_hazard'] * seg['length_meters'] for seg in segments) / max(1, total_distance), 2),
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
        t_dep = departure_time or pune_now()
        is_weekend = get_weekend_modifier(t_dep) < 0.0
        time_str = t_dep.strftime("%H:%M")

        # --- Snap both endpoints to the largest strongly-connected component (KDTree) ---
        # snap_to_node() guarantees reachability: all nodes in largest_component_graph are
        # mutually reachable, so A* always finds a path between any two snapped nodes.
        u_node, u_snap_lat, u_snap_lon = self.manager.snap_to_node(orig_lat, orig_lon)
        v_node, v_snap_lat, v_snap_lon = self.manager.snap_to_node(dest_lat, dest_lon)
        for label, lat, lon, snap_lat, snap_lon in (
            ('Origin', orig_lat, orig_lon, u_snap_lat, u_snap_lon),
            ('Destination', dest_lat, dest_lon, v_snap_lat, v_snap_lon)):
            if haversine_distance_meters(lat, lon, snap_lat, snap_lon) > 500:
                raise ValueError(f'{label} is more than 500 m from the available connected road graph. Choose a location within current Pune graph coverage.')

        logger.info(
            "Routing %s -> %s | snapped: (%s,%s)->node %s@(%.5f,%.5f), (%s,%s)->node %s@(%.5f,%.5f)",
            orig_name, dest_name,
            orig_lat, orig_lon, u_node, u_snap_lat, u_snap_lon,
            dest_lat, dest_lon, v_node, v_snap_lat, v_snap_lon
        )

        # --- Compute the three route variants ---
        context = self.query_context(t_dep)
        fastest_path = self._route_fastest(u_node, v_node, context)
        safest_path = self._route_safest(u_node, v_node, context)
        balanced_path = self._route_balanced(u_node, v_node, context)
        if not fastest_path:
            raise ValueError('No road route found between these locations')
        base_distance = sum(e.length_meters for e in fastest_path.edges)
        def mean_score(path):
            return sum(e.length_meters * self.edge_values(e, context)[0] for e in path.edges) / max(1, sum(e.length_meters for e in path.edges))
        if mean_score(safest_path) < mean_score(fastest_path):
            safest_path = RoutePath(fastest_path, fastest_path.edges, context,
                'The safety-weighted candidate did not improve the estimated RSS. Sharing the shortest road route.')
        for path in (safest_path, balanced_path):
            if not path or sum(e.length_meters for e in path.edges) > 1.30 * base_distance:
                path[:] = fastest_path
                path.edges = fastest_path.edges
                path.context = context
                path.notice = 'No candidate within the 30% distance allowance; shares the shortest road route.' 

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
            orig_pin=None,
            dest_pin=None,
        )

        safest_route = self._build_route_data(
            safest_path,
            route_id="route-safest",
            name="Safest Route",
            route_type="safest",
            color="#10b981",
            departure_time=t_dep,
            orig_pin=None,
            dest_pin=None,
        )

        balanced_route = self._build_route_data(
            balanced_path,
            route_id="route-balanced",
            name="Balanced Route",
            route_type="balanced",
            color="#f59e0b",
            departure_time=t_dep,
            orig_pin=None,
            dest_pin=None,
        )

        all_routes = [fastest_route, safest_route, balanced_route]

        for route, path in zip(all_routes, (fastest_path, safest_path, balanced_path)):
            route['distance_overhead_percentage'] = round(100 * (route['distance_meters'] / max(1, fastest_route['distance_meters']) - 1), 2)
            route['shared_with_fastest'] = [e.payload['id'] for e in path.edges] == [e.payload['id'] for e in fastest_path.edges]
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

        # All explanations must see all route segments before internal data is removed.
        for route in all_routes:
            route.pop('segments', None)

        return {
            "origin": {"name": orig_name, "lat": orig_lat, "lon": orig_lon},
            "destination": {"name": dest_name, "lat": dest_lat, "lon": dest_lon},
            "departure_time": time_str,
            "departure_date": t_dep.date().isoformat(),
            "snap_distances_meters": {
                "origin": round(haversine_distance_meters(orig_lat, orig_lon, u_snap_lat, u_snap_lon)),
                "destination": round(haversine_distance_meters(dest_lat, dest_lon, v_snap_lat, v_snap_lon))},
            "model": "Research heuristic; no trained ML model or live traffic feed",
            "is_weekend": is_weekend,
            "routes": all_routes
        }


_GLOBAL_ROUTING_ENGINE: Optional[RoutingEngine] = None
_ENGINE_LOCK = threading.Lock()


def get_routing_engine() -> RoutingEngine:
    """Singleton getter for RoutingEngine."""
    global _GLOBAL_ROUTING_ENGINE
    with _ENGINE_LOCK:
        if _GLOBAL_ROUTING_ENGINE is None:
            _GLOBAL_ROUTING_ENGINE = RoutingEngine()
    return _GLOBAL_ROUTING_ENGINE

