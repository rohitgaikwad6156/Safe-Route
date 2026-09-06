# SafeRoute AI - Routing Engine Specification

## 1. Mathematical Formulation & Edge Cost Function

SafeRoute AI routes pedestrians and two-wheelers through urban road networks by optimizing both travel efficiency and personal safety. The routing problem is formulated as a multi-objective shortest path problem solved via $A^*$ search.

### 1.1 Calibrated Multi-Criteria Edge Cost Function

To prevent dimensional collapse (where physical distance in meters completely overwhelms unitless safety scores) and avoid graph partitioning at natural bottlenecks, edge traversal costs are non-dimensionalized and calibrated as:

$$\text{cost}(e) = (1 - \beta) \cdot \left( \frac{d(e)}{d_{\text{norm}}} \right) + \beta \cdot \left( \frac{100 - SSS(e)}{100} \right)$$

Where:
- $d(e)$: Physical segment length extracted from OpenStreetMap (meters).
- $d_{\text{norm}} = 100\text{ m}$: Characteristic urban street normalization denominator.
- $SSS(e) \in [0.0, 100.0]$: Unified Segment Safety Score combining:
  - Accident Risk ($30\%$): Normalized against MoRTH/IRC Weighted Severity Index ($WSI_{\max} = 35.0$).
  - Street Lighting ($20\%$): Direct OSM `lit` tags and PMC Ward-level pole densities ($41.2 - 72.0\text{ poles/km}$).
  - Emergency Accessibility ($20\%$): Exponential spatial decay to nearest hospital, police chowki, or Smart City ECB ($\lambda = 0.5\text{ km}^{-1}$).
  - Pedestrian Infrastructure ($15\%$): Sidewalk presence and OSM highway functional hierarchy.
  - Traffic Congestion ($15\%$): Free-flow to gridlock telemetry scaling.
- $\beta \in [0.0, 1.0]$: Safety preference tradeoff parameter.
  - $\beta = 0.0$: **Fastest Route** (pure physical distance minimization).
  - $\beta = 0.90 - 0.95$: **Safest Route** (safety-prioritized routing bypassing blackspots and unlit streets).
  - $\beta = 0.50$: **Balanced Route** (modest safety detour with minimal travel time impact).

---

## 2. Empirical Parameter Selection ($\beta$) & Experiment Citation

> [!NOTE]
> **Citation:** The selection of $\beta$ is empirically calibrated by the comprehensive 20-corridor parameter sweep documented in:
> - **Experiment Report:** [`docs/experiments/divergence_results.md`](../experiments/divergence_results.md)
> - **Tradeoff Visualizations:** [`docs/experiments/divergence_tradeoff_curve.png`](../experiments/divergence_tradeoff_curve.png)
> - **Replication Script:** [`scripts/sweep_divergence.py`](../../scripts/sweep_divergence.py)

### 2.1 Empirical Findings Summary

The parameter sweep tested $\beta \in [0.10, 0.95]$ in increments of $0.05$ across 20 representative Pune OD corridors (360 total routing queries on Pune's 56,036-node, 130,343-edge road network):

| Parameter Value | Mean RSS Gain ($\Delta\text{RSS}$) | Mean Distance Overhead | Max Distance Overhead | p95 Query Latency | Mean Jaccard Divergence | Specification Role |
|---|---|---|---|---|---|---|
| **$\beta = 0.00$** | $+0.00$ | $0.00\%$ | $0.00\%$ | $85\text{ ms}$ | $0.000$ | **Fastest Baseline** |
| **$\beta = 0.50$** | $+1.40$ | $2.74\%$ | $13.22\%$ | $208\text{ ms}$ | $0.480$ | **Balanced Alternative** |
| **$\beta = 0.90$** | $+2.00$ | $8.50\%$ | **$25.64\%$** | $337\text{ ms}$ | $0.634$ | **Safest (Strict Worst-Case $\le 30\%$)** |
| **$\beta = 0.95$** | **$+2.08$** | $12.02\%$ | $47.67\%$ | $360\text{ ms}$ | **$0.643$** | **Safest (Peak Mean RSS Gain)** |

### 2.2 Final Specification Recommendation

- **Safest Route:** Standard production default is pinned to **$\beta = 0.90$** ($\alpha = 0.10$). This guarantees that:
  1. Mean safety score gain is near peak ($+2.00\text{ RSS points}$, $96\%$ of global theoretical maximum).
  2. **Every individual OD pair** stays strictly under the $30\%$ distance overhead threshold ($\max = 25.64\% \le 30.0\%$).
  3. Query latency ($p95 = 337.3\text{ ms}$) remains well below the $2,000\text{ ms}$ SLA.
  4. Real topological route divergence is achieved ($J_{\text{dist}} = 0.634$).
- **Balanced Route:** Pinned to **$\beta = 0.50$** ($\alpha = 0.50$), achieving $+1.40$ RSS gain with negligible distance overhead ($2.74\%$ mean, $13.2\%$ max).

---

## 3. Resolution of Architectural Bottlenecks

1. **Bottleneck (a) — Dimensionless Normalization:**  
   In unnormalized additive formulations ($\text{cost} = (1 - \beta) d + \beta R$), physical meters ($50 - 400\text{ m}$) completely overwhelm risk points ($0 - 35$), causing zero route diversion for $\beta < 0.60$. The calibrated denominator $d_{\text{norm}} = 100\text{ m}$ equalizes scale sensitivity across typical Pune block lengths.

2. **Bottleneck (b) — Blackspot Sparsity vs. Continuous Multi-Criteria SSS:**  
   Under the raw blackspot-only model (`risk_grid.json`), **only 4.41% (5,748 / 130,343 edges)** contained non-zero crash data, leaving $95.59\%$ of the graph with identical zero risk. Broadening SSS to include ward lighting densities, pedestrian infrastructure, and emergency facility proximity provides **$99.15\%$ continuous gradient variation**, enabling meaningful diversions even in corridors without historical crash records.

3. **Bottleneck (c) — Network Topology & Admissible Heuristic:**  
   Pune's physical topology accommodates parallel safe diversions (e.g., Karve Road / DP Road bypass vs. Swargate-Satara corridor) without graph partitioning. To guarantee admissibility in $A^*$, the heuristic is strictly scaled by $(1 - \beta)$:
   $$h_{\text{admissible}}(u, t) = (1 - \beta) \cdot \left( \frac{h_{\text{Hav}}(u, t)}{d_{\text{norm}}} \right)$$
   This prevents priority queue distortion and keeps search expansions minimal ($<13,500$ nodes for full cross-city journeys).
