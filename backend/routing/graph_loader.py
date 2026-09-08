"""
SafeRoute AI: Graph Loader & Disconnected Component Manager
Loads the 163k-node, 381k-edge Pune metropolitan road network graph, measures cold-start time,
detects disconnected components, and isolates the largest component for guaranteed reachability.
"""
import os
import time
import pickle
from pathlib import Path
from typing import Tuple, Dict, Any, List, Optional
import networkx as nx
from scipy.spatial import cKDTree
import numpy as np

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
GRAPHML_PATH = DATA_DIR / "pune_graph.graphml"
PKL_PATH = DATA_DIR / "pune_graph.pkl"


class PuneGraphManager:
    """Manages graph loading, readiness metadata, component isolation, and KDTree snapping."""
    
    def __init__(self):
        self.graph: Optional[nx.MultiDiGraph] = None
        self.largest_component_graph: Optional[nx.MultiDiGraph] = None
        self.load_time_seconds: float = 0.0
        self.total_nodes: int = 0
        self.total_edges: int = 0
        self.components_count: int = 0
        self.largest_component_nodes: int = 0
        self.is_ready: bool = False
        self.kd_tree: Optional[cKDTree] = None
        self.node_ids: List[str] = []
        self.node_coords: Dict[str, Tuple[float, float]] = {}

    def load(self, force_graphml: bool = False) -> Dict[str, Any]:
        """
        Loads the graph. If force_graphml is True or pkl does not exist,
        loads from raw GraphML and benchmarks cold-start duration.
        Otherwise loads fast binary pickle (<1s).
        """
        t0 = time.perf_counter()
        
        if not force_graphml and PKL_PATH.exists():
            with open(PKL_PATH, "rb") as f:
                self.graph = pickle.load(f)
            source_type = "binary_cache_pkl"
        else:
            if not GRAPHML_PATH.exists():
                raise FileNotFoundError(f"GraphML file not found at {GRAPHML_PATH}")
            self.graph = nx.read_graphml(GRAPHML_PATH)
            source_type = "raw_graphml_cold_start"
            # Cache for warm restarts
            try:
                with open(PKL_PATH, "wb") as f:
                    pickle.dump(self.graph, f, protocol=pickle.HIGHEST_PROTOCOL)
            except Exception as e:
                print(f"[Warning] Failed to save graph pickle cache: {e}")

        t1 = time.perf_counter()
        self.load_time_seconds = round(t1 - t0, 3)
        self.total_nodes = len(self.graph.nodes)
        self.total_edges = len(self.graph.edges)

        # A pickle can contain either a raw graph or an already pruned graph.
        # Inspect it in both cases so route reachability and health metadata remain accurate.
        components = list(nx.strongly_connected_components(self.graph))
        self.components_count = len(components)
        largest_comp_nodes = max(components, key=len)
        self.largest_component_nodes = len(largest_comp_nodes)
        disconnected = set(self.graph.nodes) - largest_comp_nodes
        if disconnected:
            self.graph.remove_nodes_from(disconnected)

        self.largest_component_graph = self.graph

        # Build KDTree on largest component nodes for guaranteed routing reachability
        self.node_ids = []
        coords_list = []
        self.node_coords = {}

        for n, data in self.largest_component_graph.nodes(data=True):
            lat = float(data.get("y", 0.0))
            lon = float(data.get("x", 0.0))
            if lat != 0.0 and lon != 0.0:
                self.node_ids.append(str(n))
                coords_list.append([lat, lon])
                self.node_coords[str(n)] = (lat, lon)

        if coords_list:
            self.kd_tree = cKDTree(np.array(coords_list))

        self.is_ready = True
        return self.get_metadata()

    def get_metadata(self) -> Dict[str, Any]:
        """Returns readiness and diagnostics metadata for the /health endpoint."""
        return {
            "status": "ready" if self.is_ready else "loading",
            "is_ready": self.is_ready,
            "load_time_seconds": self.load_time_seconds,
            "cold_start_exceeds_15s": self.load_time_seconds > 15.0,
            "total_nodes": self.total_nodes,
            "total_edges": self.total_edges,
            "components_count": self.components_count,
            "largest_component_nodes": self.largest_component_nodes,
            "coverage_percentage": round((self.largest_component_nodes / max(1, self.total_nodes)) * 100, 2)
        }

    def snap_to_node(self, lat: float, lon: float) -> Tuple[str, float, float]:
        """
        Snaps (lat, lon) to nearest node strictly within the largest connected component.
        Guarantees that a path exists between any two snapped nodes.
        """
        if not self.kd_tree or not self.node_ids:
            raise RuntimeError("Graph not loaded. Call load() first.")

        _, idx = self.kd_tree.query([lat, lon])
        node_id = self.node_ids[idx]
        snapped_lat, snapped_lon = self.node_coords[node_id]
        return node_id, snapped_lat, snapped_lon


_GLOBAL_GRAPH_MANAGER: Optional[PuneGraphManager] = None


def get_graph_manager() -> PuneGraphManager:
    """Singleton getter for PuneGraphManager."""
    global _GLOBAL_GRAPH_MANAGER
    if _GLOBAL_GRAPH_MANAGER is None:
        _GLOBAL_GRAPH_MANAGER = PuneGraphManager()
    return _GLOBAL_GRAPH_MANAGER
