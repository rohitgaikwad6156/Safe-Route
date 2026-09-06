"""
Master Phase 0 Pipeline Runner for SafeRoute AI.
Executes all data generators in sequence, validates artifacts against docs/contracts/data.md,
and prints row counts, file sizes, and geographic bounds.
"""
import json
import os
import sys
from pathlib import Path
import networkx as nx

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
PIPELINE_DIR = BASE_DIR / "pipeline"

sys.path.insert(0, str(PIPELINE_DIR))

import generate_landmarks
import generate_ward_lighting
import generate_risk_grid
import fetch_amenities
import fetch_graph


def validate_json_file(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data


def run_pipeline():
    print("=" * 80)
    print("STARTING SAFEROUTE AI - PHASE 0 DATA PIPELINE EXECUTION")
    print("=" * 80)

    # 1. Generate Landmarks
    print("\n--- [Step 1/5] Generating Landmarks Index (landmarks.json) ---")
    landmarks_path = generate_landmarks.generate()
    landmarks_data = validate_json_file(landmarks_path)
    assert len(landmarks_data) >= 20, "Landmarks count too low"
    for name, item in landmarks_data.items():
        assert "lat" in item and "lon" in item and "category" in item

    # 2. Generate Ward Lighting
    print("\n--- [Step 2/5] Generating Ward Lighting Dataset (ward_lighting.json) ---")
    ward_path = generate_ward_lighting.generate()
    ward_data = validate_json_file(ward_path)
    assert len(ward_data) == 15, "Ward lighting count must match 15 PMC wards"
    for name, item in ward_data.items():
        assert "poles_per_km" in item and "total_poles" in item and "road_km" in item

    # 3. Generate Risk Grid
    print("\n--- [Step 3/5] Generating Spatial Risk Grid (risk_grid.json) ---")
    risk_path = generate_risk_grid.generate()
    risk_data = validate_json_file(risk_path)
    assert len(risk_data) > 100, "Risk grid cell count too low"
    for k, v in risk_data.items():
        assert "_" in k and isinstance(v, (int, float)) and v >= 0

    # 4. Fetch Amenities
    print("\n--- [Step 4/5] Fetching & Compiling Amenities (amenities.json) ---")
    amenities_path = fetch_amenities.generate()
    amenities_data = validate_json_file(amenities_path)
    for cat in ["hospitals", "police", "ecbs", "traffic_signals", "crossings", "street_lamps"]:
        assert cat in amenities_data and len(amenities_data[cat]) > 0

    # 5. Fetch Road Network Graph
    print("\n--- [Step 5/5] Downloading & Building Pune Road Graph (pune_graph.graphml) ---")
    graph_path = fetch_graph.generate()
    G = nx.read_graphml(graph_path)
    assert len(G.nodes) > 1000, "Graph nodes count too low"
    assert len(G.edges) > 1000, "Graph edges count too low"

    print("\n" + "=" * 80)
    print("PHASE 0 DATA PIPELINE ARTIFACT SUMMARY & AUDIT REPORT")
    print("=" * 80)
    
    summary_table = []
    
    # pune_graph.graphml metrics
    graph_size = os.path.getsize(graph_path)
    node_lats = [float(d["y"]) for _, d in G.nodes(data=True)]
    node_lons = [float(d["x"]) for _, d in G.nodes(data=True)]
    summary_table.append({
        "artifact": "pune_graph.graphml",
        "rows": f"{len(G.nodes)} nodes, {len(G.edges)} edges",
        "size": f"{graph_size / (1024 * 1024):.2f} MB ({graph_size} B)",
        "extent": f"Lat [{min(node_lats):.4f}, {max(node_lats):.4f}], Lon [{min(node_lons):.4f}, {max(node_lons):.4f}]",
        "sparsity_flag": "OSM coverage is dense for physical road centerline topology across all 5 focus areas."
    })

    # risk_grid.json metrics
    risk_size = os.path.getsize(risk_path)
    r_lats = [float(k.split("_")[0]) for k in risk_data.keys()]
    r_lons = [float(k.split("_")[1]) for k in risk_data.keys()]
    summary_table.append({
        "artifact": "risk_grid.json",
        "rows": f"{len(risk_data)} grid cells",
        "size": f"{risk_size / 1024:.2f} KB ({risk_size} B)",
        "extent": f"Lat [{min(r_lats):.3f}, {max(r_lats):.3f}], Lon [{min(r_lons):.3f}, {max(r_lons):.3f}]",
        "sparsity_flag": "Historical accident records are not on OSM. Substituted & derived from MoRTH iRAD Pune, SPPU IJCRT, and NHAI blackspot studies."
    })

    # amenities.json metrics
    amenities_size = os.path.getsize(amenities_path)
    all_lats = [item["lat"] for cat in amenities_data.values() for item in cat]
    all_lons = [item["lon"] for cat in amenities_data.values() for item in cat]
    total_amenities = sum(len(cat) for cat in amenities_data.values())
    summary_table.append({
        "artifact": "amenities.json",
        "rows": f"{total_amenities} POIs ({len(amenities_data['hospitals'])} hospitals, {len(amenities_data['police'])} police, {len(amenities_data['ecbs'])} ECBs, {len(amenities_data['traffic_signals'])} signals, {len(amenities_data['crossings'])} crossings, {len(amenities_data['street_lamps'])} lamps)",
        "size": f"{amenities_size / 1024:.2f} KB ({amenities_size} B)",
        "extent": f"Lat [{min(all_lats):.4f}, {max(all_lats):.4f}], Lon [{min(all_lons):.4f}, {max(all_lons):.4f}]",
        "sparsity_flag": "FLAG: ECBs (<5 OSM nodes) and Street Lamps (<3% OSM nodes) are extremely sparse in OSM Pune. Substituted with PSCDCL Smart City Emergency Call Box network and PMC Ward Lighting Master Plan clusters."
    })

    # ward_lighting.json metrics
    ward_size = os.path.getsize(ward_path)
    summary_table.append({
        "artifact": "ward_lighting.json",
        "rows": f"{len(ward_data)} municipal wards",
        "size": f"{ward_size / 1024:.2f} KB ({ward_size} B)",
        "extent": "City-wide PMC administrative boundary coverage (15 wards)",
        "sparsity_flag": "Individual street lamp tags on OSM ways in Pune are absent on >90% of residential roads. Substituted with official PMC Environment Status Report (ESR) ward pole densities."
    })

    # landmarks.json metrics
    lm_size = os.path.getsize(landmarks_path)
    lm_lats = [v["lat"] for v in landmarks_data.values()]
    lm_lons = [v["lon"] for v in landmarks_data.values()]
    summary_table.append({
        "artifact": "landmarks.json",
        "rows": f"{len(landmarks_data)} canonical landmarks",
        "size": f"{lm_size / 1024:.2f} KB ({lm_size} B)",
        "extent": f"Lat [{min(lm_lats):.4f}, {max(lm_lats):.4f}], Lon [{min(lm_lons):.4f}, {max(lm_lons):.4f}]",
        "sparsity_flag": "Hand-curated canonical transit, education, and commercial hubs for keyless, offline geocoding."
    })

    # Print formatted report
    for row in summary_table:
        print(f"\nArtifact: {row['artifact']}")
        print(f"  Count:          {row['rows']}")
        print(f"  File Size:      {row['size']}")
        print(f"  Extent:         {row['extent']}")
        print(f"  Sparsity Notes: {row['sparsity_flag']}")

    print("\n" + "=" * 80)
    print("ALL PHASE 0 ARTIFACTS SUCCESSFULLY GENERATED AND VALIDATED AGAINST CONTRACT")
    print("=" * 80)


if __name__ == "__main__":
    run_pipeline()
