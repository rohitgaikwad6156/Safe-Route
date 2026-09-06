"""
Downloads and constructs the multimodal (walk + drive) road network graph for Pune
covering Shivajinagar, Kothrud, Katraj, Aundh, and Hadapsar.
Saves the result as backend/data/pune_graph.graphml.
Schema strictly conforms to docs/contracts/data.md.
"""
import os
import sys
from pathlib import Path
import networkx as nx
import osmnx as ox

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
OUTPUT_FILE = DATA_DIR / "pune_graph.graphml"

# Geographic bounding box covering Shivajinagar, Kothrud, Katraj, Aundh, Hadapsar
# OSMnx 2.x bbox format: (left, bottom, right, top) = (min_lon, min_lat, max_lon, max_lat)
BBOX_WEST = 73.785   # West: Kothrud / Baner / Chandani Chowk
BBOX_SOUTH = 18.445  # South: Katraj / Navale Bridge
BBOX_EAST = 73.945   # East: Hadapsar / Magarpatta
BBOX_NORTH = 18.575  # North: Aundh / Sangvi / Khadki


def generate():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    
    print(f"[fetch_graph.py] Configuring OSMnx download parameters...")
    ox.settings.timeout = 300
    ox.settings.memory = 1073741824  # 1 GB
    ox.settings.log_console = True
    
    bbox = (BBOX_WEST, BBOX_SOUTH, BBOX_EAST, BBOX_NORTH)
    print(f"[fetch_graph.py] Requesting road network for Bbox: W={BBOX_WEST}, S={BBOX_SOUTH}, E={BBOX_EAST}, N={BBOX_NORTH}...")
    print(f"[fetch_graph.py] Network Type: 'all' (walkable + drivable physical infrastructure)")
    
    # Download multimodal network
    G = ox.graph_from_bbox(
        bbox=bbox,
        network_type="all",
        simplify=True,
        retain_all=False,
        truncate_by_edge=False
    )
    
    print(f"[fetch_graph.py] Graph created successfully. Adding length attributes & validating...")
    
    # Ensure all required attributes exist on nodes and edges
    for u, data in G.nodes(data=True):
        if "y" not in data or "x" not in data:
            raise ValueError(f"Node {u} missing coordinates")
            
    for u, v, k, data in G.edges(keys=True, data=True):
        if "length" not in data:
            data["length"] = 50.0  # default fallback
        if "highway" not in data:
            data["highway"] = "residential"
        if "oneway" not in data:
            data["oneway"] = False
            
    # Serialize to GraphML
    print(f"[fetch_graph.py] Saving graph to {OUTPUT_FILE}...")
    ox.save_graphml(G, filepath=OUTPUT_FILE)
    
    size_bytes = os.path.getsize(OUTPUT_FILE)
    node_lats = [data["y"] for _, data in G.nodes(data=True)]
    node_lons = [data["x"] for _, data in G.nodes(data=True)]
    
    print(f"[pune_graph.graphml] Total Nodes: {len(G.nodes)}")
    print(f"[pune_graph.graphml] Total Edges: {len(G.edges)}")
    print(f"[pune_graph.graphml] File Size: {size_bytes / (1024 * 1024):.2f} MB ({size_bytes} bytes)")
    print(f"[pune_graph.graphml] Geographic Bounds: Lat [{min(node_lats):.4f}, {max(node_lats):.4f}], Lon [{min(node_lons):.4f}, {max(node_lons):.4f}]")
    
    return OUTPUT_FILE


if __name__ == "__main__":
    generate()
