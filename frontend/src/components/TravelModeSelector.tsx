import { Check } from 'lucide-react';
import { TravelMode } from '../types';

interface TravelModeSelectorProps {
  value: TravelMode;
  onChange: (mode: TravelMode) => void;
}

const MODES = [
  { id: 'walking' as const, label: 'Walking', emoji: '🚶' },
  { id: 'two_wheeler' as const, label: 'Two-Wheeler', emoji: '🛵' },
  { id: 'car' as const, label: 'Car', emoji: '🚗' },
];

export function TravelModeSelector({ value, onChange }: TravelModeSelectorProps) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-slate-800">Travel mode</legend>
      <div className="grid grid-cols-3 gap-2" aria-label="Travel mode">
        {MODES.map(({ id, label, emoji }) => (
          <button
            key={id}
            type="button"
            aria-pressed={value === id}
            onClick={() => onChange(id)}
            className={`relative flex min-h-12 items-center justify-center gap-1.5 rounded-xl border px-2 text-sm font-semibold transition-colors ${
              value === id
                ? 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-600/20'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <span aria-hidden="true" className="text-lg leading-none">{emoji}</span>
            <span>{label}</span>
            {value === id ? <Check className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-emerald-700" /> : null}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
