import React from 'react';
import { ShieldCheck, ShieldAlert, AlertTriangle, Lightbulb, HeartPulse, Footprints, Car, AlertOctagon } from 'lucide-react';
import { RouteSubscores } from '../types';

interface RadialGaugeProps {
  score: number;
  label?: string;
  riskLevel: string;
  subscores: RouteSubscores;
  timeModifier?: number;
  weekendModifier?: number;
}

export const RadialGauge: React.FC<RadialGaugeProps> = ({
  score,
  label = 'Route Safety Score',
  riskLevel,
  subscores,
  timeModifier = 0,
  weekendModifier = 0,
}) => {
  // SVG gauge calculations for 3-meter projection visibility
  const radius = 78;
  const strokeWidth = 14;
  const circumference = 2 * Math.PI * radius;
  // 270-degree arc (3/4 of circle)
  const arcLength = circumference * 0.75;
  const strokeDashoffset = arcLength - (arcLength * Math.min(100, Math.max(0, score))) / 100;

  // Accessible color themes
  const getScoreTheme = (val: number) => {
    if (val >= 80) {
      return {
        color: '#059669', // Emerald
        bgTrack: '#e2e8f0',
        textClass: 'text-emerald-700',
        badgeBg: 'bg-emerald-50 text-emerald-800 border-emerald-200 shadow-sm',
        icon: <ShieldCheck className="w-5 h-5 text-emerald-600" />,
      };
    }
    if (val >= 65) {
      return {
        color: '#d97706', // Warm Amber
        bgTrack: '#e2e8f0',
        textClass: 'text-amber-700',
        badgeBg: 'bg-amber-50 text-amber-800 border-amber-200 shadow-sm',
        icon: <ShieldAlert className="w-5 h-5 text-amber-600" />,
      };
    }
    return {
      color: '#e11d48', // Rose
      bgTrack: '#e2e8f0',
      textClass: 'text-rose-700',
      badgeBg: 'bg-rose-50 text-rose-800 border-rose-200 shadow-sm',
      icon: <AlertTriangle className="w-5 h-5 text-rose-600" />,
    };
  };

  const theme = getScoreTheme(score);

  // Weighted contributions for single compact attribution bar
  const contribAccident = (subscores.accident ?? 0) * 0.30;
  const contribEmergency = (subscores.emergency ?? 0) * 0.20;
  const contribLighting = (subscores.lighting ?? 0) * 0.20;
  const contribPedestrian = (subscores.pedestrian ?? 0) * 0.15;
  const contribTraffic = (subscores.traffic ?? 0) * 0.15;
  const totalContrib = contribAccident + contribEmergency + contribLighting + contribPedestrian + contribTraffic || 1;

  const pctAccident = (contribAccident / totalContrib) * 100;
  const pctEmergency = (contribEmergency / totalContrib) * 100;
  const pctLighting = (contribLighting / totalContrib) * 100;
  const pctPedestrian = (contribPedestrian / totalContrib) * 100;
  const pctTraffic = (contribTraffic / totalContrib) * 100;

  return (
    <div className="bg-white/95 rounded-2xl border border-slate-200/90 p-5 shadow-xl backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          {theme.icon}
          <span className="text-xs font-bold uppercase tracking-wider text-slate-800">{label}</span>
        </div>
        <span className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-lg border ${theme.badgeBg}`}>
          {riskLevel}
        </span>
      </div>

      {/* Main Radial Display - Sized & Tuned for 3-Meter Legibility */}
      <div className="flex flex-col sm:flex-row items-center justify-around gap-6 pb-4 border-b border-slate-100">
        <div className="relative flex items-center justify-center">
          <svg className="w-48 h-48 sm:w-52 sm:h-52 transform -rotate-135" viewBox="0 0 200 200">
            {/* Background Track Arc */}
            <circle
              cx="100"
              cy="100"
              r={radius}
              fill="none"
              stroke="#e2e8f0"
              strokeWidth={strokeWidth}
              strokeDasharray={`${arcLength} ${circumference}`}
              strokeLinecap="round"
            />
            {/* Dynamic Value Arc */}
            <circle
              cx="100"
              cy="100"
              r={radius}
              fill="none"
              stroke={theme.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${arcLength} ${circumference}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              style={{
                filter: `drop-shadow(0 0 6px ${theme.color}40)`,
              }}
            />
          </svg>

          {/* Centered Score Readout (Hero Tabular Digits) */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pt-2 pointer-events-none">
            <span className={`text-6xl sm:text-7xl font-extrabold tracking-tighter tabular-nums ${theme.textClass}`}>
              {Math.round(score)}
            </span>
            <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mt-1">
              / 100 RSS
            </span>
          </div>
        </div>

        {/* Temporal Modifiers Breakdown */}
        <div className="flex flex-col gap-2 min-w-[150px] text-xs">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider">Temporal Modifiers</span>
            <div className="mt-1.5 flex items-center justify-between font-mono">
              <span className="text-slate-600">Departure Time:</span>
              <span className={`font-bold ${timeModifier > 0 ? 'text-emerald-600' : timeModifier < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                {timeModifier > 0 ? `+${timeModifier}` : timeModifier}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between font-mono">
              <span className="text-slate-600">Weekend Surge:</span>
              <span className={`font-bold ${weekendModifier < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                {weekendModifier < 0 ? `${weekendModifier}` : '0.0'}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 leading-tight">
            Multi-criteria SSS weighted by road geometry and research estimates.
          </p>
        </div>
      </div>

      {/* Subscores Breakdown: Single Compact Horizontal Visual */}
      <div className="mt-4 space-y-2.5">
        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-700">
          <span>Safety Criteria Composition</span>
          <span className="text-[10px] font-mono text-slate-500 font-normal">5 Weighted Factors</span>
        </div>

        {/* Single Segmented Bar */}
        <div className="w-full h-3 rounded-full overflow-hidden flex bg-slate-100 border border-slate-200 p-0.5 gap-0.5">
          <div
            style={{ width: `${pctAccident}%` }}
            className="h-full bg-rose-500 rounded-l-full"
            title={`Accident Risk (30%): ${subscores.accident == null ? 'Unknown' : Math.round(subscores.accident)}`}
          />
          <div
            style={{ width: `${pctEmergency}%` }}
            className="h-full bg-pink-500"
            title={`Emergency Access (20%): ${Math.round(subscores.emergency)}`}
          />
          <div
            style={{ width: `${pctLighting}%` }}
            className="h-full bg-amber-400"
            title={`Street Lighting (20%): ${Math.round(subscores.lighting)}`}
          />
          <div
            style={{ width: `${pctPedestrian}%` }}
            className="h-full bg-emerald-500"
            title={`Pedestrian Infrastructure (15%): ${Math.round(subscores.pedestrian)}`}
          />
          <div
            style={{ width: `${pctTraffic}%` }}
            className="h-full bg-blue-500 rounded-r-full"
            title={`Simulated Traffic (15%): ${Math.round(subscores.traffic)}`}
          />
        </div>

        {/* Compact Horizontal Legend Chips */}
        <div className="grid grid-cols-5 gap-1.5 text-center text-[10px]">
          <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200">
            <span className="text-rose-600 block font-mono font-bold text-xs">{subscores.accident == null ? 'Unknown' : Math.round(subscores.accident)}</span>
            <span className="text-slate-600 font-medium block truncate">Crash (30%)</span>
          </div>
          <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200">
            <span className="text-pink-600 block font-mono font-bold text-xs">{Math.round(subscores.emergency)}</span>
            <span className="text-slate-600 font-medium block truncate">Emerg (20%)</span>
          </div>
          <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200">
            <span className="text-amber-600 block font-mono font-bold text-xs">{Math.round(subscores.lighting)}</span>
            <span className="text-slate-600 font-medium block truncate">Light (20%)</span>
          </div>
          <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200">
            <span className="text-emerald-600 block font-mono font-bold text-xs">{Math.round(subscores.pedestrian)}</span>
            <span className="text-slate-600 font-medium block truncate">Ped (15%)</span>
          </div>
          <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200">
            <span className="text-blue-600 block font-mono font-bold text-xs">{Math.round(subscores.traffic)}</span>
            <span className="text-slate-600 font-medium block truncate">Traf (15%)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
