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
    <div className="bg-white/95 rounded-2xl border border-slate-200/90 p-4 shadow-xl backdrop-blur-md space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 text-slate-800">
          <Clock className="w-4 h-4 text-blue-600" />
          <span className="text-xs font-bold uppercase tracking-wider">Departure Time & Risk Modifiers</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="text-[11px] text-slate-500">Weekend:</span>
          <button
            type="button"
            onClick={() => onWeekendChange(!isWeekend)}
            className={`px-2.5 py-0.5 rounded-full text-xs font-semibold transition-colors border ${
              isWeekend
                ? 'bg-rose-50 text-rose-700 border-rose-300'
                : 'bg-slate-100 text-slate-600 border-slate-200 hover:text-slate-900'
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
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-800 font-mono focus:outline-none focus:border-blue-500 transition-colors"
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
                    ? 'bg-blue-50 text-blue-700 border border-blue-300 shadow-sm'
                    : 'bg-slate-100/90 text-slate-600 hover:bg-slate-200 hover:text-slate-800 border border-slate-200/80'
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
      <div className="flex items-center justify-between text-xs px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
        <span className="text-slate-600 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-slate-500" />
          <span>{temporal.timeWindowLabel}</span>
        </span>
        <div className="flex items-center gap-2 font-mono">
          <span className="text-slate-500 text-[11px]">Cumulative Modifier:</span>
          <span
            className={`font-bold px-2 py-0.5 rounded text-xs border ${
              temporal.totalAdjustment > 0
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : temporal.totalAdjustment < 0
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            {temporal.totalAdjustment > 0 ? `+${temporal.totalAdjustment}` : temporal.totalAdjustment} RSS
          </span>
        </div>
      </div>
    </div>
  );
};
