# Data readiness for a real-world SafeRoute deployment

SafeRoute is a decision-support prototype. Its routes are not a guarantee that a road is safe and it must not be presented as an emergency service or a crime-prediction system.

## What the hackathon demo can honestly show

- A preloaded OpenStreetMap graph, with custom edge scoring and no commercial Directions API.
- Safety infrastructure and road attributes from an offline OSM snapshot.
- A clearly labelled, modelled historical crash-risk layer.
- Privacy-preserving, short-lived community hazard reports with corroboration, rate limits, and proximity checks.

## Before a public pilot

1. Obtain an auditable, dated crash-record extract with an agreed aggregation method; keep raw records access-controlled and publish only aggregates.
2. Establish a data-sharing agreement for municipal street-light maintenance and planned closures. Do not infer lamp operation from a ward average.
3. Refresh the OSM snapshot on a documented schedule and preserve the extract date, query, licence notice, and checksums.
4. Add an on-route safety disclaimer, a one-tap emergency contact handoff, and a clear “report to authorities” option. Community reports must never replace emergency services.
5. Run field validation with local partners and publish error rates by neighbourhood and travel mode before claiming effectiveness.

## Non-negotiable routing controls

- The graph stays loaded in process at startup; requests never download OSM data.
- Routing remains custom A* over that graph, so segment-level safety costs are inspectable.
- Do not change beta or scoring constants without the project’s documented divergence sweep.
- Live status must distinguish `observed`, `modelled`, `community-reported`, and `unknown` data.
