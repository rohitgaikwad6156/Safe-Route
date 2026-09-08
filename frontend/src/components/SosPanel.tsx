import React, { useMemo, useState } from 'react';
import { Check, Copy, Flame, Hospital, MessageSquareShare, ShieldAlert, Siren, X } from 'lucide-react';
import { RouteData } from '../types';
import { formatDistance, formatDuration } from '../lib/utils';

export function SosPanel({ open, onClose, origin, destination, route }: { open: boolean; onClose: () => void; origin: string; destination: string; route?: RouteData }) {
  const [copied, setCopied] = useState(false);
  const help = route?.safe_havens;
  const message = useMemo(() => route ? `SafeRoute trip (prototype): ${origin} to ${destination}. Selected ${route.name}, ${formatDistance(route.distance_meters)}, about ${formatDuration(route.duration_seconds)}, safety score ${Math.round(route.rss)}/100. Nearest mapped hospital/clinic along route: ${help?.nearest_hospital?.name || 'limited data'}; police: ${help?.nearest_police?.name || 'limited data'}; fire: ${help?.nearest_fire?.name || 'limited data'}. Please check in with me.` : '', [origin, destination, route, help]);
  if (!open) return null;
  const copy = async () => { await navigator.clipboard.writeText(message); setCopied(true); setTimeout(() => setCopied(false), 1600); };
  const row = (Icon: React.ElementType, label: string, value?: string, distance?: number | null) => <div className="flex gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200"><Icon className="w-4 h-4 text-rose-600 mt-0.5"/><div><p className="text-[10px] uppercase font-bold text-slate-500">{label}</p><p className="text-xs font-semibold text-slate-800">{value || 'Limited data'} {distance != null && <span className="font-normal text-slate-500">· {distance} m straight-line</span>}</p></div></div>;
  return <div role="dialog" aria-modal="true" aria-label="Emergency and share safe trip" className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 pt-[env(safe-area-inset-top)] backdrop-blur-sm sm:items-center sm:p-4">
    <div className="max-h-[calc(100dvh-env(safe-area-inset-top))] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl">
      <div className="sticky top-0 z-10 flex justify-between border-b border-rose-200 bg-rose-50/95 p-4 backdrop-blur-md"><div className="flex gap-2"><Siren className="w-5 h-5 text-rose-600"/><div><h2 className="font-bold text-slate-900">Emergency / Share Safe Trip</h2><p className="text-sm text-slate-600">A demo check-in, not an emergency dispatch service</p></div></div><button onClick={onClose} aria-label="Close share panel" className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"><X className="w-5 h-5"/></button></div>
      <div className="space-y-3 p-4 text-sm">
        <div className="p-3 rounded-xl bg-slate-900 text-white text-xs"><p><b>From:</b> {origin}</p><p><b>To:</b> {destination}</p>{route && <p className="mt-1 text-emerald-300"><b>{route.name}</b> · {Math.round(route.rss)}/100 · {formatDistance(route.distance_meters)}</p>}</div>
        {row(Hospital, 'Nearest mapped hospital / clinic', help?.nearest_hospital?.name, help?.nearest_hospital?.distance_meters)}
        {row(ShieldAlert, 'Nearest mapped police station', help?.nearest_police?.name, help?.nearest_police?.distance_meters)}
        {row(Flame, 'Nearest mapped fire station', help?.nearest_fire?.name, help?.nearest_fire?.distance_meters)}
        <label className="block text-[10px] uppercase font-bold text-slate-500">Shareable check-in message<textarea readOnly value={message} rows={5} className="mt-1 w-full text-xs normal-case font-normal p-3 border border-slate-200 rounded-xl bg-slate-50 resize-none"/></label>
        <button disabled={!route} onClick={copy} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white disabled:opacity-50">{copied ? <Check className="w-4 h-4"/> : <Copy className="w-4 h-4"/>}{copied ? 'Copied' : 'Copy trip message'}</button>
        <p className="text-[11px] text-rose-800 bg-rose-50 border border-rose-200 p-3 rounded-xl"><MessageSquareShare className="w-4 h-4 inline mr-1"/>Prototype only. It does not contact responders or trusted contacts. Call official emergency services when help is needed.</p>
      </div>
    </div>
  </div>;
}
