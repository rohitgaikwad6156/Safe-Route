"""Reproducible sweep through the production scorer and search implementation.
Historical beta selection is retained; this report records current behaviour.
"""
import sys, json, time, hashlib
from pathlib import Path
from datetime import datetime
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.routing.engine import get_routing_engine
from backend.scoring.corroboration import HazardSnapshot

OD_PAIRS = [
        # Major Corridors Crossing Known Blackspots (Swargate, Navale Bridge, Katraj, SPPU, Chandani Chowk)
        {"id": "OD-01", "name": "Shivajinagar Station -> Katraj Chowk", "from": "Shivajinagar Station", "to": "Katraj (Katraj Chowk)", "crosses_blackspot": True},
        {"id": "OD-02", "name": "Aundh -> Hadapsar (Cross-City)", "from": "Aundh (Bremen Chowk)", "to": "Hadapsar (Gadital)", "crosses_blackspot": True},
        {"id": "OD-03", "name": "Kothrud -> Viman Nagar", "from": "Kothrud (Chandani Chowk)", "to": "Viman Nagar (Phoenix Marketcity)", "crosses_blackspot": True},
        {"id": "OD-04", "name": "Navale Bridge -> Deccan Gymkhana", "from": "Navale Bridge, Vadgaon", "to": "Deccan Gymkhana", "crosses_blackspot": True},
        {"id": "OD-05", "name": "Swargate -> Hadapsar", "from": "Swargate Bus Station", "to": "Hadapsar (Gadital)", "crosses_blackspot": True},
        {"id": "OD-06", "name": "Warje -> Katraj Chowk", "from": "Warje Flyover", "to": "Katraj (Katraj Chowk)", "crosses_blackspot": True},
        {"id": "OD-07", "name": "SPPU -> Swargate", "from": "Savitribai Phule Pune University", "to": "Swargate Bus Station", "crosses_blackspot": True},
        {"id": "OD-08", "name": "Chandani Chowk -> Navale Bridge", "from": "Kothrud (Chandani Chowk)", "to": "Navale Bridge, Vadgaon", "crosses_blackspot": True},
        {"id": "OD-09", "name": "Pune Station -> Katraj Chowk", "from": "Pune Junction Railway Station", "to": "Katraj (Katraj Chowk)", "crosses_blackspot": True},
        {"id": "OD-10", "name": "Aundh -> Shivajinagar", "from": "Aundh (Bremen Chowk)", "to": "Shivajinagar Station", "crosses_blackspot": True},

        # Safe Corridors / Local Pairs NOT Crossing Known Blackspots
        {"id": "OD-11", "name": "Deccan -> FC Road", "from": "Deccan Gymkhana", "to": "Fergusson College (FC Road)", "crosses_blackspot": False},
        {"id": "OD-12", "name": "Nal Stop -> Deenanath Hospital", "from": "Nal Stop, Karve Road", "to": "Deenanath Mangeshkar Hospital", "crosses_blackspot": False},
        {"id": "OD-13", "name": "Chandani Chowk -> Paud Phata", "from": "Kothrud (Chandani Chowk)", "to": "Paud Phata Flyover", "crosses_blackspot": False},
        {"id": "OD-14", "name": "Kalyani Nagar -> Viman Nagar", "from": "Kalyani Nagar (Joggers Park)", "to": "Viman Nagar (Phoenix Marketcity)", "crosses_blackspot": False},
        {"id": "OD-15", "name": "Shaniwar Wada -> COEP Tech", "from": "Shaniwar Wada", "to": "COEP Technological University", "crosses_blackspot": False},
        {"id": "OD-16", "name": "Sarasbaug -> Deccan Gymkhana", "from": "Sarasbaug", "to": "Deccan Gymkhana", "crosses_blackspot": False},
        {"id": "OD-17", "name": "Karve Nagar -> Warje Flyover", "from": "Karve Nagar (Cummins College)", "to": "Warje Flyover", "crosses_blackspot": False},
        {"id": "OD-18", "name": "Aundh -> SPPU", "from": "Aundh (Bremen Chowk)", "to": "Savitribai Phule Pune University", "crosses_blackspot": False},
        {"id": "OD-19", "name": "Magarpatta -> Hadapsar", "from": "Magarpatta City", "to": "Hadapsar (Gadital)", "crosses_blackspot": False},
        {"id": "OD-20", "name": "Ruby Hall -> Pune Station", "from": "Ruby Hall Clinic", "to": "Pune Junction Railway Station", "crosses_blackspot": False},
    ]


def metrics(engine, path):
    distance = sum(e.length_meters for e in path.edges)
    score = sum(e.length_meters * engine.edge_values(e, path.context)[0] for e in path.edges) / max(1, distance)
    return distance, score, {e.payload['id'] for e in path.edges}


def run_experiment():
    engine = get_routing_engine()
    landmarks = json.loads((ROOT / 'backend/data/landmarks.json').read_text())
    rows = []
    for beta in np.arange(.10, 1.0, .05):
        for pair in OD_PAIRS:
            origin, destination = landmarks[pair['from']], landmarks[pair['to']]
            source = engine.manager.snap_to_node(origin['lat'], origin['lon'])[0]
            target = engine.manager.snap_to_node(destination['lat'], destination['lon'])[0]
            context = engine.query_context(datetime(2026, 9, 7, 14), HazardSnapshot())
            fastest = engine._route_fastest(source, target, context)
            started = time.perf_counter()
            candidate = engine._search(source, target, float(beta), context, inflate=True)
            elapsed = 1000*(time.perf_counter()-started)
            fd, fs, fe = metrics(engine, fastest)
            sd, ss, se = metrics(engine, candidate)
            rows.append(dict(beta=round(float(beta),2), id=pair['id'], name=pair['name'],
                rss_delta=ss-fs, overhead_pct=100*(sd/fd-1),
                jaccard=1-len(fe&se)/max(1,len(fe|se)), latency_ms=elapsed,
                exceeds_cap=sd > fd*1.30))
        print(f'Finished beta={beta:.2f}', flush=True)
    out=ROOT/'docs/experiments'
    routing_sources = [
        ROOT / 'backend/routing/engine.py',
        ROOT / 'backend/routing/travel_modes.py',
    ]
    output = {'departure':'2026-09-07 14:00 Asia/Kolkata', 'incidents':'empty snapshot for reproducibility',
        'source_sha256': {
            str(path.relative_to(ROOT)).replace('\\', '/'): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in routing_sources
        }, 'rows':rows}
    (out/'research_alignment_sweep.json').write_text(json.dumps(output,indent=2))
    lines=['# Research alignment: production cost sweep', '',
        'Raw candidates before the 30% guard. Signed RSS changes are retained. All scores are conservative model estimates, not observed safety outcomes.', '',
        '| Beta | Mean RSS delta | Mean divergence | Mean overhead | Max overhead | p95 search ms | Over cap |',
        '|---|---|---|---|---|---|---|']
    for beta in sorted({r['beta'] for r in rows}):
        rs=[r for r in rows if r['beta']==beta]
        lines.append(f"| {beta:.2f} | {np.mean([r['rss_delta'] for r in rs]):+.2f} | {np.mean([r['jaccard'] for r in rs]):.3f} | {np.mean([r['overhead_pct'] for r in rs]):.2f}% | {max(r['overhead_pct'] for r in rs):.2f}% | {np.percentile([r['latency_ms'] for r in rs],95):.1f} | {sum(r['exceeds_cap'] for r in rs)}/20 |")
    (out/'research_alignment_sweep.md').write_text('\n'.join(lines)+'\n')
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    betas=sorted({r['beta'] for r in rows})
    plt.plot(betas,[np.mean([r['rss_delta'] for r in rows if r['beta']==b]) for b in betas],marker='o')
    plt.xlabel('Safety weight beta'); plt.ylabel('Mean signed lower-bound RSS gain')
    plt.grid(alpha=.3); plt.tight_layout(); plt.savefig(out/'research_alignment_sweep.png',dpi=150); plt.close()

if __name__=='__main__':
    run_experiment()
