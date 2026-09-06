# Data Contracts: Phase 0 SafeRoute AI Data Pipeline

This document defines the strict, unchangeable data contracts for all data artifacts produced by the Phase 0 pipeline in `backend/data/`. All downstream modules (scoring engine, routing engine, graph loaders, API endpoints) code against these schemas.

---

## 1. `pune_graph.graphml` (Road Network Graph)

- **Format:** GraphML (XML-based directed multigraph).
- **Generator:** `backend/pipeline/fetch_graph.py` (via OSMnx / NetworkX).
- **Coverage Mode:** `all` (walkable + drivable physical street infrastructure).
- **Spatial Extent:** Pune Metropolitan Bounding Box:
  - North: `18.580` (Aundh / Sangvi / Khadki)
  - South: `18.440` (Katraj / Navale Bridge / Jambhulwadi)
  - West: `73.780` (Kothrud / Bavdhan / Baner)
  - East: `73.950` (Hadapsar / Magarpatta / Malwadi)
- **Coordinate Reference System (CRS):** EPSG:4326 (WGS84).

### Node Attributes (Schema)
| Attribute | Type | Description |
|---|---|---|
| `id` | string / integer | OpenStreetMap Node ID |
| `y` | float | Latitude in decimal degrees (e.g. `18.5204`) |
| `x` | float | Longitude in decimal degrees (e.g. `73.8567`) |
| `street_count` | integer | Number of intersecting street segments |

### Edge Attributes (Schema)
| Attribute | Type | Required | Description |
|---|---|---|---|
| `u` | string / integer | Yes | Source Node ID |
| `v` | string / integer | Yes | Target Node ID |
| `key` | integer | Yes | Multigraph edge key (usually `0`) |
| `osmid` | string / integer / list | Yes | OpenStreetMap Way ID |
| `length` | float | Yes | Segment physical length in **meters** |
| `highway` | string / list | Yes | Road hierarchy tag (`motorway`, `trunk`, `primary`, `secondary`, `tertiary`, `residential`, `living_street`, `footway`, `service`, `path`) |
| `oneway` | boolean | Yes | Whether vehicular traffic is one-way |
| `name` | string | No | Street name if available |
| `maxspeed` | string / float | No | Speed limit in km/h if available |
| `geometry` | string (WKT) | No | LineString geometry if curved |

---

## 2. `risk_grid.json` (Spatial Risk Grid)

- **Format:** JSON Object.
- **Generator:** `backend/pipeline/generate_risk_grid.py`.
- **Key Format:** `"{lat:.3f}_{lon:.3f}"` (Coordinates rounded to 3 decimal places $\approx 110\text{m} \times 110\text{m}$ spatial grid cells).
- **Value:** `number` (Non-negative float representing cumulative Weighted Severity Index: $3\cdot\text{Fatal} + 2\cdot\text{Grievous} + 1\cdot\text{Minor}$).

### JSON Schema
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "PuneRiskGrid",
  "type": "object",
  "additionalProperties": {
    "type": "number",
    "minimum": 0.0,
    "description": "Summed Weighted Severity Index (WSI) for the 0.001-degree grid cell"
  }
}
```

### Example
```json
{
  "18.458_73.828": 34.0,
  "18.453_73.854": 28.0,
  "18.508_73.792": 19.0,
  "18.531_73.844": 14.0
}
```

---

## 3. `amenities.json` (Urban Safety & Infrastructure Amenities)

- **Format:** JSON Object containing categorized arrays of geo-referenced urban points of interest.
- **Generator:** `backend/pipeline/fetch_amenities.py`.
- **Categories:**
  - `hospitals`: Emergency medical facilities and trauma centers.
  - `police`: Police stations, chowkis, and control booths.
  - `ecbs`: Emergency Call Boxes / Smart City emergency kiosks.
  - `street_lamps`: Illuminated street light points.
  - `crossings`: Pedestrian crossings, zebra crossings, and grade-separated crossings.
  - `traffic_signals`: Junctions controlled by traffic lights.

### JSON Schema
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "PuneAmenities",
  "type": "object",
  "required": ["hospitals", "police", "ecbs", "street_lamps", "crossings", "traffic_signals"],
  "properties": {
    "hospitals": { "$ref": "#/definitions/amenity_list" },
    "police": { "$ref": "#/definitions/amenity_list" },
    "ecbs": { "$ref": "#/definitions/amenity_list" },
    "street_lamps": { "$ref": "#/definitions/amenity_list" },
    "crossings": { "$ref": "#/definitions/amenity_list" },
    "traffic_signals": { "$ref": "#/definitions/amenity_list" }
  },
  "definitions": {
    "amenity_list": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "lat", "lon", "name"],
        "properties": {
          "id": { "type": "string" },
          "lat": { "type": "number", "minimum": 18.0, "maximum": 19.0 },
          "lon": { "type": "number", "minimum": 73.0, "maximum": 74.5 },
          "name": { "type": "string" },
          "type": { "type": "string" },
          "subtype": { "type": "string" }
        }
      }
    }
  }
}
```

---

## 4. `ward_lighting.json` (Municipal Ward Street Lighting Densities)

- **Format:** JSON Object mapping Pune Municipal Corporation (PMC) ward names to lighting statistics.
- **Generator:** `backend/pipeline/generate_ward_lighting.py`.
- **Source:** PMC Environment Status Report (ESR) & Electrical Department Lighting Master Plan.

### JSON Schema
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "PuneWardLighting",
  "type": "object",
  "additionalProperties": {
    "type": "object",
    "required": ["poles_per_km", "total_poles", "road_km", "rating"],
    "properties": {
      "poles_per_km": { "type": "number", "minimum": 0.0 },
      "total_poles": { "type": "integer", "minimum": 0 },
      "road_km": { "type": "number", "minimum": 0.0 },
      "rating": { "type": "string", "enum": ["Poor", "Moderate", "Good", "Excellent"] }
    }
  }
}
```

### Example
```json
{
  "Aundh - Baner": {
    "poles_per_km": 62.4,
    "total_poles": 9850,
    "road_km": 157.8,
    "rating": "Good"
  },
  "Kothrud - Bavdhan": {
    "poles_per_km": 58.1,
    "total_poles": 11200,
    "road_km": 192.7,
    "rating": "Moderate"
  },
  "Dhankawadi - Sahakarnagar": {
    "poles_per_km": 41.2,
    "total_poles": 6800,
    "road_km": 165.0,
    "rating": "Poor"
  }
}
```

---

## 5. `landmarks.json` (Keyless Geocoding Index)

- **Format:** JSON Object mapping canonical Pune landmark names to geographic coordinates, ward, and search aliases.
- **Generator:** `backend/pipeline/generate_landmarks.py`.
- **Usage:** Enables fast, keyless, offline lookup for origins and destinations (e.g. `PCCOE`, `Hinjewadi Phase 1`, `Shivajinagar Station`, `Katraj Snake Park`).

### JSON Schema
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "PuneLandmarks",
  "type": "object",
  "additionalProperties": {
    "type": "object",
    "required": ["lat", "lon", "category"],
    "properties": {
      "lat": { "type": "number", "minimum": 18.0, "maximum": 19.0 },
      "lon": { "type": "number", "minimum": 73.0, "maximum": 74.5 },
      "category": { "type": "string", "enum": ["transit", "education", "tech_park", "commercial", "civic", "hospital", "landmark"] },
      "ward": { "type": "string" },
      "aliases": {
        "type": "array",
        "items": { "type": "string" }
      }
    }
  }
}
```

### Example
```json
{
  "PCCOE, Pune": {
    "lat": 18.6517,
    "lon": 73.7615,
    "category": "education",
    "ward": "Pimpri Chinchwad",
    "aliases": ["PCCOE", "Pimpri Chinchwad College of Engineering", "Akurdi College"]
  },
  "Hinjewadi Phase 1": {
    "lat": 18.5913,
    "lon": 73.7389,
    "category": "tech_park",
    "ward": "Hinjewadi",
    "aliases": ["Hinjawadi Ph 1", "Rajiv Gandhi Infotech Park Phase 1", "Wipro Circle"]
  },
  "Shivajinagar Station": {
    "lat": 18.5314,
    "lon": 73.8446,
    "category": "transit",
    "ward": "Shivajinagar - Ghole Road",
    "aliases": ["Shivajinagar", "Shivaji Nagar Railway Station", "Shimla Office Chowk"]
  }
}
```
