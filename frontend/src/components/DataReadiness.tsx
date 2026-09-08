import React from 'react';
import { Database, ExternalLink, Info } from 'lucide-react';

export interface DatasetCard {
  id: string;
  name: string;
  status: 'included_snapshot' | 'included_aggregate_context' | 'modelled_aggregate' | 'runtime_generated' | 'not_yet_integrated';
  limitations: string;
  source_url: string;
}

const statusLabel: Record<DatasetCard['status'], string> = {
  included_snapshot: 'Offline snapshot',
  included_aggregate_context: 'Aggregate context',
  modelled_aggregate: 'Modelled aggregate',
  runtime_generated: 'Runtime data',
  not_yet_integrated: 'Planned - not live',
};

export const DataReadiness: React.FC<{ datasets: DatasetCard[] }> = ({ datasets }) => (
  <details className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs">
    <summary className="flex cursor-pointer list-none items-center gap-2 font-bold text-slate-800">
      <Database className="h-4 w-4 text-emerald-600" />
      Data basis & real-world readiness
    </summary>
    <p className="mt-2 flex gap-1.5 text-[11px] leading-relaxed text-slate-600">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
      Route scores are decision-support estimates, not a guarantee of personal safety or an emergency service.
    </p>
    <div className="mt-3 space-y-2">
      {datasets.map((dataset) => (
        <div key={dataset.id} className="rounded-lg border border-slate-200 bg-white p-2.5">
          <div className="flex items-start justify-between gap-2">
            <span className="font-semibold text-slate-800">{dataset.name}</span>
            <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] text-slate-600">{statusLabel[dataset.status]}</span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{dataset.limitations}</p>
          {dataset.source_url.startsWith('http') && <a className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 hover:underline" href={dataset.source_url} target="_blank" rel="noreferrer">Source <ExternalLink className="h-3 w-3" /></a>}
        </div>
      ))}
    </div>
  </details>
);
