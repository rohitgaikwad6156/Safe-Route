# SafeRoute AI - Durable Project Rules & Constraints

These are durable project facts and behavioral constraints for SafeRoute AI. Adhere to these across every task in this repository:

1. **Custom Routing Architecture (No Commercial Directions APIs):**
   - Routing must NEVER call a commercial Directions API (e.g. Google Maps Directions, Mapbox Directions, HERE, TomTom).
   - The entire core premise of SafeRoute AI is custom edge-weighting based on hyper-local urban safety scoring ($SSS$), which closed APIs strictly forbid. Reaching for Google or HERE routing violates project architecture.

2. **Module-Level Graph State (No Per-Request OSMnx Calls):**
   - The road network graph (`pune_graph.graphml` / `pune_graph.pkl`) loads ONCE at server startup into module-level memory (via `PuneGraphManager`).
   - Any code path that calls `ox.graph_from_place` or `ox.graph_from_bbox` during an HTTP request is an architectural bug.

3. **Empirically Pinned Beta ($\beta$):**
   - $\beta$ is currently **0.90** (production default guaranteeing $\le 30\%$ distance overhead) / **0.95** (peak mean RSS gain), chosen by rigorous empirical parameter sweep across 20 Pune OD corridors in `docs/experiments/divergence_results.md`.
   - Do NOT adjust $\beta$ or edge cost constants by intuition. Any change requires rerunning `scripts/sweep_divergence.py`.

4. **Authentic Ground-Truth Accident Statistics:**
   - Accident statistics for Pune blackspots come exclusively from committed data sourced from iRAD, PMC Environment Status Reports (ESR), and published local studies (in `backend/data/risk_grid.json`).
   - NEVER invent an accident count, fatality number, or coordinate. If a data point is missing or unverified, state the uncertainty explicitly.

5. **Intellectual Honesty & Third-Party Research Attribution:**
   - Published accuracy figures in the research doc (92.08% accuracy, 100% recall) belong strictly to a third-party SPPU academic paper.
   - They are NEVER to appear in our README, UI, or pitch as our project's results.

6. **Definition of "Complete":**
   - "Complete" means observed working end-to-end in a real browser session with an artifact screenshot or recording, NOT merely compiling cleanly or passing a mock unit test.

7. **Route Divergence is the Primary Demo Risk:**
   - Topological divergence between the Fastest and Safest routes is the primary demo risk.
   - Any change to scoring, weighting, or cost functions requires rerunning `scripts/sweep_divergence.py` before being called done.
