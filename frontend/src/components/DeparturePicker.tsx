import React from 'react';
import { Clock, Calendar, Sun, Moon, Sunrise, Sunset } from 'lucide-react';
import { computeTemporalModifier } from '../lib/temporal';

interface DeparturePickerProps {
  departureTime: string;
  isWeekend: boolean;
  onTimeChange: (time: string) => void;
  onWeekendChange: (isWeekend: boolean) => void;
}

export const DeparturePicker: React.FC<DeparturePickerProps> = ({
  departureTime,
  isWeekend,
  onTimeChange,
  onWeekendChange,
}) => {
  const temporal = computeTemporalModifier(departureTime, isWeekend);

  const presets = [
    { label: 'Morning', time: '08:30', icon: <Sunrise className="w-3.5 h-3.5 text-amber-400" /> },
    { label: 'Daytime', time: '14:00', icon: <Sun className="w-3.5 h-3.5 text-yellow-400" /> },
    { label: 'Evening', time: '18:30', icon: <Sunset className="w-3.5 h-3.5 text-orange-400" /> },
    { label: 'Late Night', time: '21:30', icon: <Moon className="w-3.5 h-3.5 text-indigo-400" /> },
    { label: 'Dead of Night', time: '01:30', icon: <Moon className="w-3.5 h-3.5 text-purple-400" /> },
  ];

  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800/80 p-4 shadow-xl backdrop-blur-md space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 text-slate-200">
          <Clock className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-bold uppercase tracking-wider">Departure Time & Risk Modifiers</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="text-[11px] text-slate-400">Weekend:</span>
          <button
            type="button"
            onClick={() => onWeekendChange(!isWeekend)}
            className={`px-2.5 py-0.5 rounded-full text-xs font-semibold transition-colors border ${
              isWeekend
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
          >
            {isWeekend ? 'Active (-3)' : 'Weekday (0)'}
          </button>
        </div>
      </div>

      {/* Time input & Preset buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[120px]">
          <input
            type="time"
            value={departureTime}
            onChange={(e) => onTimeChange(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-cyan-500 transition-colors"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {presets.map((p) => {
            const isSelected = departureTime === p.time;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => onTimeChange(p.time)}
                className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isSelected
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700/80 hover:text-slate-200 border border-slate-700/40'
                }`}
              >
                {p.icon}
                <span>{p.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Dynamic Adjustment Badge */}
      <div className="flex items-center justify-between text-xs px-3 py-2 bg-slate-950/60 rounded-lg border border-slate-800/80">
        <span className="text-slate-400 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span>{temporal.timeWindowLabel}</span>
        </span>
        <div className="flex items-center gap-2 font-mono">
          <span className="text-slate-400 text-[11px]">Cumulative Modifier:</span>
          <span
            className={`font-bold px-2 py-0.5 rounded text-xs ${
              temporal.totalAdjustment > 0
                ? 'bg-emerald-500/20 text-emerald-300'
                : temporal.totalAdjustment < 0
                ? 'bg-rose-500/20 text-rose-300'
                : 'bg-slate-800 text-slate-300'
            }`}
          >
            {temporal.totalAdjustment > 0 ? `+${temporal.totalAdjustment}` : temporal.totalAdjustment} RSS
          </span>
        </div>
      </div>
    </div>
  );
};
