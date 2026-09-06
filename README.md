# SafeRoute AI 🛡️🗺️
> **Intelligent Urban Safety Navigation Engine for Pune Metropole**

SafeRoute AI is a multi-objective urban routing and safety navigation engine designed specifically for the Pune metropolitan area. Unlike conventional navigation platforms that optimize purely for travel time or distance, SafeRoute AI scores hyper-local safety attributes across road segments to compute routes that proactively balance speed with human safety.

---

## 🚀 Key Architectural Highlights

1. **Custom Open-Source Routing Engine (Zero Commercial Directions APIs)**:
   - Evaluates multi-criteria costs directly over Pune's road network graph (56,036 nodes and 130,343 edges).
   - Commercial directions APIs forbid custom edge-weighting; SafeRoute AI's entire pathfinding algorithm runs locally in memory via custom A* search variants.

2. **Single Startup Graph Loading (`PuneGraphManager`)**:
   - The road network graph (`pune_graph.graphml` / `pune_graph.pkl`) loads once at server startup into module-level memory in under 1 second.
   - Zero per-request graph fetching or bounding-box network downloads.

3. **Empirically Calibrated Composite Edge Cost**:
   - Calibrated over 20 real Pune OD corridors (`scripts/sweep_divergence.py`):
     $$\text{cost}(e) = (1 - \beta) \cdot \left(\frac{d(e)}{d_{\text{norm}}}\right) + \beta \cdot \left(\frac{100 - SSS(e)}{100}\right) \quad (d_{\text{norm}} = 100\text{ m})$$
   - Production default **$\beta = 0.90$** guarantees $\le 30\%$ distance overhead (empirically $8.5\%$ mean overhead) with a **$+2.00$ RSS gain** and $217\text{ ms}$ p95 query latency.
   - Generates three distinct route variants: **Fastest** ($\beta = 0.0$), **Safest** ($\beta = 0.90$ with multiplicative blackspot penalties), and **Balanced** ($\beta = 0.50$ with selective blackspot pruning).

4. **Authentic Ground-Truth Accident Provenance**:
   - Accident statistics for Pune blackspots are sourced exclusively from committed records in `backend/data/risk_grid.json`, compiled from iRAD (Integrated Road Accident Database), Pune Municipal Corporation (PMC) Environment Status Reports (ESR), and published corridor accident studies.
   - If a road segment lacks recorded crash data, it is explicitly scored as unknown/null rather than guessed or silently defaulted to zero.

5. **Multi-Criteria Segment Safety Score ($SSS$)**:
   - Evaluates five weighted urban attributes:
     $$SSS_i = 0.30 \cdot S_{\text{accident},i} + 0.20 \cdot S_{\text{light},i} + 0.15 \cdot S_{\text{traffic},i} + 0.15 \cdot S_{\text{pedestrian},i} + 0.20 \cdot S_{\text{emergency},i}$$
   - Includes PMC ward lighting density fallback and spatial exponential decay to emergency hospitals, police chowkis, and Smart City Emergency Call Boxes (ECBs).

6. **Length-Weighted Route Safety Score ($RSS$)**:
   - Aggregates segment scores by length to prevent the "hidden 500m hazard corridor" problem:
     $$\text{Raw RSS} = \sum_i \left[ SSS_i \cdot \left(\frac{\text{Length}_i}{\text{Total Length}}\right) \right]$$
   - Applies temporal risk modifiers (Morning Peak $+8$, Daytime $+5$, Late Evening $-10$, Dead of Night $-20$) and weekend surge penalties ($-3$).

7. **Crowdsourced Community Incident Pipeline**:
   - Two-stage peer corroboration: reports initialize as `unverified` (impact factor $0.20$) and promote to `preliminary_verified` (impact factor $1.00$) when corroborated within $200\text{m}$ and $30\text{ minutes}$.
   - Exponential hazard decay: $H(\text{grid}, t) = \sum \text{Severity}_i \cdot \text{ImpactFactor}_i \cdot e^{-\lambda \cdot \Delta t_i}$ with $\lambda = 0.0115$ (half-life $\approx 60\text{ min}$).
   - Anti-abuse: 5 reports/user/60min rate limit and $150\text{m}$ proximity gating.
   - Privacy-preserving 250m spatial grid aggregation (raw individual coordinates and user IDs are never exposed).

---

## 📁 Repository Structure

```text
Safe-Route/
├── backend/
│   ├── api/             # Flask REST API server (/api/routes, /api/incidents, /health)
│   ├── data/            # Pune road network graph, risk grid, ward lighting, amenities
│   ├── explain/         # Grounded counterfactual detours, attributions & safe havens
│   ├── routing/         # Unified multi-objective A* router and graph manager
│   └── scoring/         # SSS, RSS, PSS, temporal, and corroboration engines
├── frontend/            # React + TypeScript + MapLibre GL UI dashboard
├── docs/                # Contracts, experiments, and divergence tradeoff analysis
├── scripts/             # Empirical sweep, demo checks, and diagnostic tools
└── tests/               # 77 comprehensive unit and integration tests (100% pass)
```

---

## 🛠️ Quick Start

### 1. Backend Server
Ensure Python 3.10+ is installed with scientific dependencies:
```bash
# Run the backend API server (listens on http://127.0.0.1:8000)
python -m backend.api.server
```

### 2. Frontend Development Server
```bash
# Option A: From root directory
npm run dev

# Option B: From frontend directory
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173/` in your browser.

### 3. Running Automated Tests
```bash
# Run the complete test suite across all 77 tests
pytest tests/ -v
```

### 4. Running Divergence Parameter Sweep
```bash
# Rerun the empirical beta parameter sweep across 20 Pune corridors
python scripts/sweep_divergence.py
```

---

## 📄 License & Attribution
Developed as an open-source urban safety navigation system for Pune Metropole. Ground-truth crash statistics cited from official iRAD and PMC ESR publications.
