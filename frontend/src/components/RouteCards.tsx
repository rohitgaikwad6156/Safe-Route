import React, { useState } from 'react';
import { Clock, Navigation2, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Zap, Shield, Scale, MapPin, HeartPulse, Lightbulb, Footprints, AlertTriangle, Info, Hospital } from 'lucide-react';
import { RouteData } from '../types';
import { formatDistance, formatDuration, getScoreColor } from '../lib/utils';

interface RouteCardsProps {
  routes: RouteData[];
  selectedRouteId: string;
  onSelectRoute: (routeId: string) => void;
}

export const RouteCards: React.FC<RouteCardsProps> = ({
  routes,
  selectedRouteId,
  onSelectRoute,
}) => {
  const [expandedReasons, setExpandedReasons] = useState<Record<string, boolean>>({
    'route-safest': true,
  });
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  const [expandedHavens, setExpandedHavens] = useState<Record<string, boolean>>({});
  const [expandedUncertainty, setExpandedUncertainty] = useState<Record<string, boolean>>({});

  const toggleReasons = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedReasons((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSteps = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedSteps((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleHavens = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedHavens((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleUncertainty = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedUncertainty((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'safest':
        return <Shield className="w-4 h-4 text-emerald-400" />;
      case 'fastest':
        return <Zap className="w-4 h-4 text-blue-400" />;
      case 'balanced':
        return <Scale className="w-4 h-4 text-amber-400" />;
      default:
        return <Navigation2 className="w-4 h-4 text-slate-400" />;
    }
  };

  const getTypeHeaderBadge = (route: RouteData) => {
    switch (route.type) {
      case 'safest':
        return (
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-bold text-xs text-teal-300 tracking-wider">━━━ [SOLID]</span>
            <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-teal-950 text-teal-300 border border-teal-500/50 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Safest
            </span>
          </div>
        );
      case 'balanced':
        return (
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-bold text-xs text-amber-300 tracking-wider">╍╍╍ [DASH]</span>
            <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-amber-950 text-amber-300 border border-amber-500/50 flex items-center gap-1">
              <Scale className="w-3 h-3" />
              Balanced
            </span>
          </div>
        );
      case 'fastest':
        return (
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-bold text-xs text-sky-300 tracking-wider">┈┈┈ [DOT]</span>
            <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-sky-950 text-sky-300 border border-sky-500/50 flex items-center gap-1">
              <Zap className="w-3 h-3" />
              Fastest
            </span>
          </div>
        );
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-display font-bold uppercase tracking-wider text-slate-300">
          Available Routes ({routes.length})
        </span>
        <span className="text-[11px] text-slate-400 font-mono">
          [Tab] / [↑↓] Navigate
        </span>
      </div>

      <div className="space-y-3">
        {routes.map((route) => {
          const isSelected = route.id === selectedRouteId;
          const scoreTheme = getScoreColor(route.rss);
          const showReasons = !!expandedReasons[route.id];
          const showSteps = !!expandedSteps[route.id];
          const showHavens = !!expandedHavens[route.id];
          const showUncertainty = !!expandedUncertainty[route.id];
          const detour = route.counterfactual_detours?.[0];
          const attrib = route.attribution;
          const uncertainty = route.uncertainty;
          const havens = route.safe_havens;

          return (
            <div
              key={route.id}
              tabIndex={0}
              role="button"
              aria-selected={isSelected}
              aria-label={`${route.name}, safety score ${Math.round(route.rss)} out of 100`}
              onClick={() => onSelectRoute(route.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectRoute(route.id);
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  const idx = routes.findIndex((r) => r.id === route.id);
                  const nextRoute = routes[(idx + 1) % routes.length];
                  onSelectRoute(nextRoute.id);
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  const idx = routes.findIndex((r) => r.id === route.id);
                  const prevRoute = routes[(idx - 1 + routes.length) % routes.length];
                  onSelectRoute(prevRoute.id);
                }
              }}
              className={`rounded-2xl border transition-all duration-200 cursor-pointer overflow-hidden backdrop-blur-md focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:outline-none ${
                isSelected
                  ? 'bg-slate-900/95 border-2 shadow-2xl scale-[1.01]'
                  : 'bg-slate-900/70 border-slate-800 hover:border-slate-700 hover:bg-slate-900/90'
              }`}
              style={{
                borderColor: isSelected ? route.color : undefined,
                boxShadow: isSelected ? `0 0 25px -4px ${route.color}40` : undefined,
              }}
            >
              <div className="p-4 space-y-3">
                {/* Header Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div
                      className="w-3 h-3 rounded-full shadow-sm"
                      style={{ backgroundColor: route.color }}
                    />
                    {getTypeHeaderBadge(route)}
                  </div>

                  {/* RSS Score Badge */}
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      RSS:
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-lg font-mono font-bold text-xs border ${scoreTheme.badge} ${scoreTheme.glow}`}
                    >
                      {Math.round(route.rss)} / 100
                    </span>
                  </div>
                </div>

                {/* Route Title */}
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                    {getTypeIcon(route.type)}
                    <span>{route.name}</span>
                  </h3>
                </div>

                {/* Counterfactual Detour Callout */}
                {detour && (
                  <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-2.5 space-y-1 text-xs">
                    <div className="flex items-center gap-1.5 text-amber-300 font-bold">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      <span>Counterfactual Safe Detour</span>
                    </div>
                    <p className="text-[11px] text-amber-200/90 leading-relaxed">
                      {detour.explanation}
                    </p>
                  </div>
                )}

                {/* Metrics Grid */}
                <div className="grid grid-cols-3 gap-2 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80 text-center">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-medium block">Distance</span>
                    <span className="text-xs font-mono font-bold text-slate-200">
                      {formatDistance(route.distance_meters)}
                    </span>
                  </div>
                  <div className="border-x border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-medium block">Travel Time</span>
                    <span className="text-xs font-mono font-bold text-slate-200 flex items-center justify-center gap-1">
                      <Clock className="w-3 h-3 text-cyan-400 inline" />
                      {formatDuration(route.duration_seconds)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-medium block">Safety Grade</span>
                    <span className={`text-xs font-semibold ${scoreTheme.text}`}>
                      {route.risk_level}
                    </span>
                  </div>
                </div>

                {/* Attribution Math Breakdown Bar (Single Compact Segmented Bar) */}
                {attrib && (
                  <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-display font-bold text-slate-300 uppercase">
                      <span>Attribution Breakdown ({attrib.raw_rss.toFixed(1)} Raw RSS)</span>
                      <span className="font-mono text-teal-300">100% Attributed</span>
                    </div>
                    {/* Compact Stacked Bar */}
                    <div className="w-full h-2.5 rounded-full overflow-hidden flex bg-slate-900 border border-slate-800 p-0.5 gap-0.5">
                      <div style={{ width: `${(attrib.contributions.accident / attrib.raw_rss) * 100}%` }} className="bg-rose-500 rounded-l-full" title={`Accident Safety: +${attrib.contributions.accident}`} />
                      <div style={{ width: `${(attrib.contributions.emergency / attrib.raw_rss) * 100}%` }} className="bg-pink-500" title={`Emergency Access: +${attrib.contributions.emergency}`} />
                      <div style={{ width: `${(attrib.contributions.lighting / attrib.raw_rss) * 100}%` }} className="bg-amber-400" title={`Street Lighting: +${attrib.contributions.lighting}`} />
                      <div style={{ width: `${(attrib.contributions.pedestrian / attrib.raw_rss) * 100}%` }} className="bg-teal-400" title={`Pedestrian Path: +${attrib.contributions.pedestrian}`} />
                      <div style={{ width: `${(attrib.contributions.traffic / attrib.raw_rss) * 100}%` }} className="bg-sky-400 rounded-r-full" title={`Traffic Flow: +${attrib.contributions.traffic}`} />
                    </div>
                    {/* Component Value Chips */}
                    <div className="grid grid-cols-5 gap-1 text-center font-mono text-[9px]">
                      <div className="bg-slate-900/90 py-1 rounded border border-slate-800/80"><span className="text-rose-400 block font-bold">+{attrib.contributions.accident}</span>Crash</div>
                      <div className="bg-slate-900/90 py-1 rounded border border-slate-800/80"><span className="text-pink-400 block font-bold">+{attrib.contributions.emergency}</span>Emerg</div>
                      <div className="bg-slate-900/90 py-1 rounded border border-slate-800/80"><span className="text-amber-400 block font-bold">+{attrib.contributions.lighting}</span>Light</div>
                      <div className="bg-slate-900/90 py-1 rounded border border-slate-800/80"><span className="text-teal-400 block font-bold">+{attrib.contributions.pedestrian}</span>Ped</div>
                      <div className="bg-slate-900/90 py-1 rounded border border-slate-800/80"><span className="text-sky-400 block font-bold">+{attrib.contributions.traffic}</span>Traf</div>
                    </div>
                  </div>
                )}

                {/* Honest Uncertainty Confidence Pill */}
                {uncertainty && (
                  <div className="pt-0.5">
                    <button
                      type="button"
                      onClick={(e) => toggleUncertainty(route.id, e)}
                      className="w-full flex items-center justify-between text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors py-1"
                    >
                      <span className="flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Data Provenance & Confidence:</span>
                        <span className="px-2 py-0.2 rounded text-[10px] font-bold uppercase bg-slate-800 text-cyan-300 border border-cyan-800/40">
                          {uncertainty.overall_confidence} ({uncertainty.overall_verified_percentage}%)
                        </span>
                      </span>
                      {showUncertainty ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    {showUncertainty && (
                      <div className="mt-1.5 p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl text-xs text-slate-300 space-y-1">
                        <p className="text-[11px] leading-relaxed text-slate-300">{uncertainty.explanation}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Safe Haven Position-Band Coverage */}
                {havens && havens.bands.length > 0 && (
                  <div className="pt-0.5 border-t border-slate-800/60">
                    <button
                      type="button"
                      onClick={(e) => toggleHavens(route.id, e)}
                      className="w-full flex items-center justify-between text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors py-1"
                    >
                      <span className="flex items-center gap-1.5">
                        <Hospital className="w-3.5 h-3.5 text-pink-400" />
                        <span>Safe Haven Checkpoints ({havens.bands.length} Bands)</span>
                      </span>
                      {showHavens ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    {showHavens && (
                      <div className="mt-2 space-y-1.5">
                        {havens.bands.map((b, idx) => (
                          <div key={idx} className="p-2 bg-slate-950/60 rounded-lg text-xs border border-slate-800/60 flex items-center justify-between">
                            <span className="text-slate-300 font-medium text-[11px]">{b.band_name}</span>
                            <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2">
                              <span className="text-pink-300">🏥 {b.hospital.name.split(' ')[0]} ({b.hospital.distance_meters}m)</span>
                              <span className="text-cyan-300">🚓 {b.police.name.split(' ')[0]} ({b.police.distance_meters}m)</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Grounded Reasons List */}
                <div className="pt-0.5 border-t border-slate-800/60">
                  <button
                    type="button"
                    onClick={(e) => toggleReasons(route.id, e)}
                    className="w-full flex items-center justify-between text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors py-1"
                  >
                    <span className="flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Grounded Explanations & Urban Proof</span>
                    </span>
                    {showReasons ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {showReasons && (
                    <div className="mt-2 space-y-2 pl-2 border-l-2 border-slate-800 text-xs text-slate-300">
                      {route.reasons.map((reason, idx) => (
                        <div key={idx} className="flex items-start gap-1.5">
                          <span
                            className="inline-block w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                            style={{ backgroundColor: route.color }}
                          />
                          <p className="text-[11px] leading-relaxed text-slate-300">{reason}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Turn-by-Turn Steps */}
                <div className="pt-0.5 border-t border-slate-800/60">
                  <button
                    type="button"
                    onClick={(e) => toggleSteps(route.id, e)}
                    className="w-full flex items-center justify-between text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors py-1"
                  >
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>Turn-by-turn Navigation ({route.steps.length} steps)</span>
                    </span>
                    {showSteps ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {showSteps && (
                    <div className="mt-2 space-y-2 max-h-44 overflow-y-auto pr-1">
                      {route.steps.map((step, idx) => (
                        <div key={idx} className="p-2 bg-slate-950/60 rounded-lg text-xs space-y-0.5 border border-slate-800/60">
                          <div className="text-slate-200 font-medium leading-snug">{step.instruction}</div>
                          <div className="text-[10px] text-slate-400 flex items-center justify-between">
                            <span>{step.street}</span>
                            <span className="font-mono">{step.distance_meters} m</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
