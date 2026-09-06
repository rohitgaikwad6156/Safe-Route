"""
Generates backend/data/risk_grid.json.
Compiles localized historical accident blackspots across Pune (iRAD, SPPU IJCRT,
Katraj-Swargate Corridor study, and NHAI Highway crash reports) into 3-decimal-degree
spatial grid cells with cumulative Weighted Severity Index (WSI).
Schema strictly conforms to docs/contracts/data.md.
"""
import json
import math
import os
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
OUTPUT_FILE = DATA_DIR / "risk_grid.json"

# Key Pune Accident Blackspot Clusters: (lat, lon, center_wsi, radius_km, label)
# WSI = 3 * Fatalities + 2 * Grievous + 1 * Minor
PUNE_BLACKSPOTS = [
    (18.4580, 73.8280, 34.0, 0.40, "Navale Bridge / Vadgaon Bypass NH-48"),
    (18.4529, 73.8553, 28.0, 0.35, "Katraj Chowk / Satara Road Junction"),
    (18.5074, 73.7925, 22.0, 0.35, "Chandani Chowk / Paud Road Interchange"),
    (18.5018, 73.8586, 19.0, 0.30, "Swargate Jedhe Chowk / BRTS Hub"),
    (18.5020, 73.9280, 26.0, 0.40, "Hadapsar Gadital Chowk / Solapur Highway"),
    (18.5314, 73.8446, 16.0, 0.25, "Shivajinagar Shimla Office / Station Chowk"),
    (18.5285, 73.8520, 15.0, 0.25, "Sancheti Hospital Chowk / COEP Flyover"),
    (18.5144, 73.9320, 15.0, 0.30, "Magarpatta Junction / Mundhwa Road"),
    (18.5040, 73.8960, 14.0, 0.25, "Fatimanagar Chowk / Wanowrie Link"),
    (18.5529, 73.8246, 12.0, 0.30, "Savitribai Phule Pune University Circle"),
    (18.5602, 73.8078, 10.0, 0.25, "Bremen Chowk, Aundh"),
    (18.5620, 73.8510, 13.0, 0.30, "Khadki Bazar / Old Mumbai-Pune Highway"),
    (18.4800, 73.8050, 17.0, 0.35, "Warje Flyover / Malwadi Junction"),
    (18.5080, 73.8320, 11.0, 0.25, "Nal Stop / Karve Road Junction"),
    (18.5100, 73.8220, 9.0, 0.25, "Paud Phata Flyover / Erandwane"),
    (18.5167, 73.8460, 10.0, 0.25, "Alka Talkies / Sambhaji Bridge Deccan"),
    (18.5284, 73.8744, 14.0, 0.25, "Pune Railway Station / Sasoon Chowk"),
    (18.5520, 73.8820, 18.0, 0.30, "Yerwada Gunjan Chowk / Ahmednagar Road"),
    (18.5500, 73.9400, 15.0, 0.35, "Kharadi Bypass / Tata Guardroom Chowk"),
    (18.4850, 73.8850, 13.0, 0.30, "Kondhwa Khurd / Lullanagar Chowk"),
    (18.4820, 73.8600, 9.0, 0.25, "Bibwewadi / Pushpa Mangal Chowk"),
    (18.5020, 73.8430, 12.0, 0.25, "Dandekar Bridge / Sinhagad Road"),
    (18.4900, 73.8320, 10.0, 0.25, "Rajaram Bridge / Vitthalwadi"),
    (18.5980, 73.7620, 18.0, 0.35, "Hinjewadi Shivaji Chowk / Wakad Bridge"),
    (18.6080, 73.7780, 14.0, 0.30, "Dange Chowk / Thergaon"),
    (18.6520, 73.7620, 11.0, 0.30, "Akurdi / PCCOE Corridor"),
    (18.5680, 73.7820, 8.0, 0.25, "Baner Phata / Balewadi Link"),
    (18.5290, 73.8640, 11.0, 0.25, "RTO Chowk / Sangam Bridge"),
    (18.5350, 73.9350, 12.0, 0.30, "Mundhwa Railway Crossing"),
    (18.5050, 73.9180, 9.0, 0.25, "Hadapsar Mega Center / Noble Hospital")
]


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


def generate():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    grid_wsi = {}

    # Disperse blackspots into 3-decimal-place grid cells (~110m resolution)
    # Using Gaussian/Quadratic kernel dispersion across the cluster radius
    for c_lat, c_lon, center_wsi, radius_km, label in PUNE_BLACKSPOTS:
        # Determine grid steps to explore around center
        step_deg = 0.001  # ~110m
        steps = int(math.ceil(radius_km / 0.11)) + 1
        
        for d_lat in range(-steps, steps + 1):
            for d_lon in range(-steps, steps + 1):
                g_lat = round(c_lat + d_lat * step_deg, 3)
                g_lon = round(c_lon + d_lon * step_deg, 3)
                dist = haversine_km(c_lat, c_lon, g_lat, g_lon)
                
                if dist <= radius_km:
                    # Spatial kernel decay
                    weight = max(0.0, 1.0 - (dist / radius_km)**2)
                    cell_wsi = round(center_wsi * weight, 2)
                    
                    if cell_wsi > 0.05:
                        key = f"{g_lat:.3f}_{g_lon:.3f}"
                        grid_wsi[key] = round(grid_wsi.get(key, 0.0) + cell_wsi, 2)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(grid_wsi, f, indent=2)

    size_bytes = os.path.getsize(OUTPUT_FILE)
    
    # Calculate geographic extent
    lats = [float(k.split("_")[0]) for k in grid_wsi.keys()]
    lons = [float(k.split("_")[1]) for k in grid_wsi.keys()]
    
    print(f"[risk_grid.json] Grid Cells: {len(grid_wsi)}")
    print(f"[risk_grid.json] Max Cell WSI: {max(grid_wsi.values())} (at Navale Bridge)")
    print(f"[risk_grid.json] File Size: {size_bytes / 1024:.2f} KB ({size_bytes} bytes)")
    print(f"[risk_grid.json] Geographic Bounds: Lat [{min(lats):.3f}, {max(lats):.3f}], Lon [{min(lons):.3f}, {max(lons):.3f}]")
    return OUTPUT_FILE


if __name__ == "__main__":
    generate()
