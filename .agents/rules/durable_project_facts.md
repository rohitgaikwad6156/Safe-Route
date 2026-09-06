# Durable Project Rules & Facts: SafeRoute AI

- **Custom Routing:** Routing must never call a commercial Directions API. The entire premise is custom edge weights, which closed APIs forbid. If you ever find yourself reaching for Google or HERE routing, you have misunderstood the project.
- **Graph In-Memory State:** The graph loads once at server startup into module-level state. Any code path that calls `ox.graph_from_place` or `ox.graph_from_bbox` during a request is a bug.
- **Beta Parameter ($\beta$):** $\beta$ is currently 0.90 (production default for $\le 30\%$ distance overhead) / 0.95 (peak mean RSS gain), chosen by experiment in `docs/experiments/divergence_results.md`. Do not change it without rerunning the sweep.
- **Accident Statistics:** Accident statistics for Pune blackspots come from committed CSVs and JSON sourced from iRAD, PMC ESR, and published local studies. Never invent an accident count or a coordinate. If a number is missing, say so explicitly.
- **Attribution Integrity:** Published accuracy figures in the research doc (92.08% accuracy, 100% recall) belong to a third-party SPPU paper. They are never to appear in our README, UI, or pitch as our results.
- **Definition of Done:** "Complete" means observed working in a browser with a screenshot/recording, not compiling.
- **Demo Risk:** Route divergence between fastest and safest is the primary demo risk. Any change to scoring or cost functions requires rerunning `scripts/sweep_divergence.py` before being called done.
