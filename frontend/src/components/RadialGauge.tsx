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
        color: '#2dd4bf', // Teal (high contrast for colorblindness)
        bgTrack: 'rgba(45, 212, 191, 0.12)',
        textClass: 'text-teal-300',
        badgeBg: 'bg-teal-950/90 text-teal-300 border-teal-500/50 shadow-md',
        icon: <ShieldCheck className="w-5 h-5 text-teal-400" />,
      };
    }
    if (val >= 65) {
      return {
        color: '#f59e0b', // Warm Amber/Gold
        bgTrack: 'rgba(245, 158, 11, 0.12)',
        textClass: 'text-amber-300',
        badgeBg: 'bg-amber-950/90 text-amber-300 border-amber-500/50 shadow-md',
        icon: <ShieldAlert className="w-5 h-5 text-amber-400" />,
      };
    }
    return {
      color: '#f43f5e', // Rose/Crimson
      bgTrack: 'rgba(244, 63, 94, 0.12)',
      textClass: 'text-rose-400',
      badgeBg: 'bg-rose-950/90 text-rose-300 border-rose-500/50 shadow-md',
      icon: <AlertTriangle className="w-5 h-5 text-rose-400" />,
    };
  };

  const theme = getScoreTheme(score);

  // Weighted contributions for single compact attribution bar
  const contribAccident = (subscores.accident || 50) * 0.30;
  const contribEmergency = (subscores.emergency || 50) * 0.20;
  const contribLighting = (subscores.lighting || 50) * 0.20;
  const contribPedestrian = (subscores.pedestrian || 50) * 0.15;
  const contribTraffic = (subscores.traffic || 50) * 0.15;
  const totalContrib = contribAccident + contribEmergency + contribLighting + contribPedestrian + contribTraffic || 1;

  const pctAccident = (contribAccident / totalContrib) * 100;
  const pctEmergency = (contribEmergency / totalContrib) * 100;
  const pctLighting = (contribLighting / totalContrib) * 100;
  const pctPedestrian = (contribPedestrian / totalContrib) * 100;
  const pctTraffic = (contribTraffic / totalContrib) * 100;

  return (
    <div className="bg-slate-900/95 rounded-2xl border border-slate-800 p-5 shadow-2xl backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          {theme.icon}
          <span className="text-xs font-display font-bold uppercase tracking-wider text-slate-200">{label}</span>
        </div>
        <span className={`px-3 py-1 text-xs font-display font-bold uppercase tracking-wider rounded-lg border ${theme.badgeBg}`}>
          {riskLevel}
        </span>
      </div>

      {/* Main Radial Display - Sized & Tuned for 3-Meter Legibility */}
      <div className="flex flex-col sm:flex-row items-center justify-around gap-6 pb-4 border-b border-slate-800/80">
        <div className="relative flex items-center justify-center">
          <svg className="w-48 h-48 sm:w-52 sm:h-52 transform -rotate-135" viewBox="0 0 200 200">
            {/* Background Track Arc */}
            <circle
              cx="100"
              cy="100"
              r={radius}
              fill="none"
              stroke="#172033"
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
                filter: `drop-shadow(0 0 8px ${theme.color}60)`,
              }}
            />
          </svg>

          {/* Centered Score Readout (Hero Tabular Digits) */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pt-2 pointer-events-none">
            <span className={`text-6xl sm:text-7xl font-display font-extrabold tracking-tighter tabular-nums ${theme.textClass}`}>
              {Math.round(score)}
            </span>
            <span className="text-xs font-mono font-bold text-slate-300 uppercase tracking-widest mt-1">
              / 100 RSS
            </span>
          </div>
        </div>

        {/* Temporal Modifiers Breakdown */}
        <div className="flex flex-col gap-2 min-w-[150px] text-xs">
          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Temporal Modifiers</span>
            <div className="mt-1.5 flex items-center justify-between font-mono">
              <span className="text-slate-300">Departure Time:</span>
              <span className={`font-bold ${timeModifier > 0 ? 'text-teal-300' : timeModifier < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                {timeModifier > 0 ? `+${timeModifier}` : timeModifier}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between font-mono">
              <span className="text-slate-300">Weekend Surge:</span>
              <span className={`font-bold ${weekendModifier < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                {weekendModifier < 0 ? `${weekendModifier}` : '0.0'}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 leading-tight">
            Multi-criteria SSS weighted by segment length and environmental modifiers.
          </p>
        </div>
      </div>

      {/* Subscores Breakdown: Single Compact Horizontal Visual */}
      <div className="mt-4 space-y-2.5">
        <div className="flex items-center justify-between text-xs font-display font-bold uppercase tracking-wider text-slate-300">
          <span>Safety Criteria Composition</span>
          <span className="text-[10px] font-mono text-slate-400 font-normal">5 Weighted Factors</span>
        </div>

        {/* Single Segmented Bar */}
        <div className="w-full h-3 rounded-full overflow-hidden flex bg-slate-950 border border-slate-800 p-0.5 gap-0.5">
          <div
            style={{ width: `${pctAccident}%` }}
            className="h-full bg-rose-500 rounded-l-full"
            title={`Accident Risk (30%): ${Math.round(subscores.accident)}`}
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
            className="h-full bg-teal-400"
            title={`Pedestrian Infrastructure (15%): ${Math.round(subscores.pedestrian)}`}
          />
          <div
            style={{ width: `${pctTraffic}%` }}
            className="h-full bg-sky-400 rounded-r-full"
            title={`Traffic Telemetry (15%): ${Math.round(subscores.traffic)}`}
          />
        </div>

        {/* Compact Horizontal Legend Chips */}
        <div className="grid grid-cols-5 gap-1.5 text-center text-[10px]">
          <div className="bg-slate-950/80 p-1.5 rounded-lg border border-slate-800">
            <span className="text-rose-400 block font-mono font-bold text-xs">{Math.round(subscores.accident)}</span>
            <span className="text-slate-400 font-medium block truncate">Crash (30%)</span>
          </div>
          <div className="bg-slate-950/80 p-1.5 rounded-lg border border-slate-800">
            <span className="text-pink-400 block font-mono font-bold text-xs">{Math.round(subscores.emergency)}</span>
            <span className="text-slate-400 font-medium block truncate">Emerg (20%)</span>
          </div>
          <div className="bg-slate-950/80 p-1.5 rounded-lg border border-slate-800">
            <span className="text-amber-400 block font-mono font-bold text-xs">{Math.round(subscores.lighting)}</span>
            <span className="text-slate-400 font-medium block truncate">Light (20%)</span>
          </div>
          <div className="bg-slate-950/80 p-1.5 rounded-lg border border-slate-800">
            <span className="text-teal-400 block font-mono font-bold text-xs">{Math.round(subscores.pedestrian)}</span>
            <span className="text-slate-400 font-medium block truncate">Ped (15%)</span>
          </div>
          <div className="bg-slate-950/80 p-1.5 rounded-lg border border-slate-800">
            <span className="text-sky-400 block font-mono font-bold text-xs">{Math.round(subscores.traffic)}</span>
            <span className="text-slate-400 font-medium block truncate">Traf (15%)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
