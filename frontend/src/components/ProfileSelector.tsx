import React from 'react';
import { Accessibility, GraduationCap, HeartHandshake, Moon, PersonStanding, ShieldCheck } from 'lucide-react';
import { SafetyProfileId } from '../types';

const profiles: { id: SafetyProfileId; label: string; short: string; icon: React.ElementType }[] = [
  { id: 'student', label: 'Student', short: 'Crossings + light', icon: GraduationCap },
  { id: 'woman_alone', label: 'Woman traveling alone', short: 'Light + help', icon: ShieldCheck },
  { id: 'elderly', label: 'Elderly person', short: 'Walking + care', icon: PersonStanding },
  { id: 'night_commuter', label: 'Night commuter', short: 'Night visibility', icon: Moon },
  { id: 'disability', label: 'Person with disability', short: 'Access + help', icon: Accessibility },
  { id: 'emergency_helper', label: 'Emergency helper', short: 'Response access', icon: HeartHandshake },
];

export function ProfileSelector({ value, onChange }: { value: SafetyProfileId; onChange: (id: SafetyProfileId) => void }) {
  return <section className="rounded-xl border border-violet-200 bg-violet-50/60 p-3" aria-label="Personal safety profile">
    <div className="flex items-center justify-between mb-2">
      <div><h2 className="text-xs font-bold text-slate-900">Who is this trip for?</h2><p className="text-[10px] text-slate-500">Re-ranks routes using available safety signals</p></div>
      <span className="text-[9px] font-bold uppercase text-violet-700 bg-white border border-violet-200 rounded-full px-2 py-1">Personalised</span>
    </div>
    <div className="grid grid-cols-2 gap-1.5">
      {profiles.map(({ id, label, short, icon: Icon }) => <button key={id} type="button" onClick={() => onChange(id)}
        aria-pressed={value === id}
        className={`p-2 rounded-lg border text-left flex items-center gap-2 transition ${value === id ? 'bg-violet-700 text-white border-violet-700 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:border-violet-300'}`}>
        <Icon className="w-4 h-4 shrink-0"/><span><span className="block text-[11px] font-semibold leading-tight">{label}</span><span className={`block text-[9px] ${value === id ? 'text-violet-100' : 'text-slate-400'}`}>{short}</span></span>
      </button>)}
    </div>
    <p className="mt-2 text-[10px] text-slate-500">Profiles do not change the calibrated beta. They compare the same custom OSM route candidates.</p>
  </section>;
}
