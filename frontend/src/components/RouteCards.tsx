import React, { useState } from 'react';
import { Clock, Navigation2, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Zap, Shield, Scale, MapPin, HeartPulse, Lightbulb, Footprints, AlertTriangle, Info, Hospital } from 'lucide-react';
import { RouteData } from '../types';
import { formatDistance, formatDuration, getScoreColor } from '../lib/utils';
import { WeatherContext } from './TripConditions';

interface RouteCardsProps {
  routes: RouteData[];
  selectedRouteId: string;
  onSelectRoute: (routeId: string) => void;
  departureTime: string;
  isWeekend: boolean;
  weather: WeatherContext;
}

export const RouteCards: React.FC<RouteCardsProps> = ({
  routes,
  selectedRouteId,
  onSelectRoute,
  departureTime,
  isWeekend,
  weather,
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
            <span className="font-mono font-bold text-xs text-emerald-600 tracking-wider">━━━ [GREEN]</span>
            <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              Safest Route
            </span>
          </div>
        );
      case 'balanced':
        return (
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-bold text-xs text-amber-600 tracking-wider">━━━ [YELLOW]</span>
            <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
              <Scale className="w-3 h-3 text-amber-600" />
              Balanced
            </span>
          </div>
        );
      case 'fastest':
        return (
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-bold text-xs text-blue-600 tracking-wider">━━━ [BLUE]</span>
            <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-blue-50 text-blue-800 border border-blue-200 flex items-center gap-1">
              <Zap className="w-3 h-3 text-blue-600" />
              Fastest
            </span>
          </div>
        );
    }
  };

  return (
    <div className="space-y-3">
      {/* Header with count */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Suggested Corridors ({routes.length})
        </span>
        <span className="text-[11px] text-slate-400 font-mono">
          [Tab] / [↑↓] Navigate
        </span>
      </div>

      {/* 3-Route Horizontal Comparison Tab Bar: Immediate at-a-glance visibility */}
      {routes.length > 1 && (
        <div className="grid grid-cols-3 gap-2 bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200 shadow-sm">
          {routes.map((r) => {
            const isSel = r.id === selectedRouteId;
            const scoreTheme = getScoreColor(r.rss);
            const rColor = r.type === 'safest' ? '#059669' : r.type === 'fastest' ? '#1a73e8' : '#d97706';
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onSelectRoute(r.id)}
                className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all text-left active:scale-95 ${
                  isSel
                    ? 'bg-white border-2 shadow-md scale-[1.02]'
                    : 'bg-white/60 border-slate-200 hover:bg-white hover:border-slate-300'
                }`}
                style={{
                  borderColor: isSel ? rColor : undefined,
                }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: rColor }} />
                  <span className="text-xs font-bold text-slate-800 capitalize">{r.type}</span>
                </div>
                <div className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border ${scoreTheme.badge} mb-1`}>
                  {Math.round(r.rss)} RSS
                </div>
                <div className="text-[10px] text-slate-500 font-mono text-center">
                  {formatDistance(r.distance_meters)}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Detailed Route Cards */}
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
          const rColor = route.type === 'safest' ? '#059669' : route.type === 'fastest' ? '#1a73e8' : '#d97706';

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
              className={`rounded-2xl border transition-all duration-200 cursor-pointer overflow-hidden backdrop-blur-md focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
                isSelected
                  ? 'bg-white border-2 shadow-xl scale-[1.01]'
                  : 'bg-white/90 border-slate-200 hover:border-slate-300 hover:bg-white shadow-sm'
              }`}
              style={{
                borderColor: isSelected ? rColor : undefined,
              }}
            >
              <div className="p-4 space-y-3">
                {/* Header Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div
                      className="w-3 h-3 rounded-full shadow-sm"
                      style={{ backgroundColor: rColor }}
                    />
                    {getTypeHeaderBadge(route)}
                  </div>

                  {/* RSS Score Badge */}
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                      RSS:
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-lg font-mono font-bold text-xs border ${scoreTheme.badge}`}
                    >
                      {Math.round(route.rss)} / 100
                    </span>
                  </div>
                </div>

                {/* Route Title */}
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    {getTypeIcon(route.type)}
                    <span>{route.name}</span>
                  </h3>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-medium block">Distance</span>
                    <span className="text-xs font-mono font-bold text-slate-800">
                      {formatDistance(route.distance_meters)}
                    </span>
                  </div>
                  <div className="border-x border-slate-200">
                    <span className="text-[10px] text-slate-500 uppercase font-medium block">Est. time</span>
                    <span className="text-xs font-mono font-bold text-slate-800 flex items-center justify-center gap-1">
                      <Clock className="w-3 h-3 text-blue-600 inline" />
                      {formatDuration(route.duration_seconds)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-medium block">Safety Grade</span>
                    <span className={`text-xs font-semibold ${scoreTheme.text}`}>
                      {route.risk_level}
                    </span>
                  </div>
                </div>

                {!isSelected && (
                  <div className="pt-1 text-center">
                    <span className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition-colors">
                      Click to inspect this route on map →
                    </span>
                  </div>
                )}

                {/* Detailed Breakdown for Selected Route */}
                {isSelected && (
                  <>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 space-y-2">
                      <div className="flex items-center justify-between"><span className="text-xs font-bold text-emerald-900">Human safety summary</span>{route.profile_recommended && <span className="text-[9px] uppercase font-bold bg-emerald-700 text-white px-2 py-1 rounded-full">Profile pick</span>}</div>
                      <p className="text-[11px] leading-relaxed text-emerald-900">{route.profile_explanation || 'Profile explanation has limited data.'}</p>
                      <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                        <span className="bg-white border rounded-lg p-2"><b>Profile fit</b><br/>{route.profile_score == null ? 'Limited data' : `${route.profile_score}/100`}</span>
                        <span className="bg-white border rounded-lg p-2"><b>Travel context</b><br/>{Number(departureTime.split(':')[0]) >= 19 || Number(departureTime.split(':')[0]) < 6 ? 'Night' : 'Day'} · {isWeekend ? 'Weekend' : 'Weekday'}</span>
                        <span className="bg-white border rounded-lg p-2"><b>Nearest care</b><br/>{route.safe_havens?.nearest_hospital?.name || 'Limited data'}</span>
                        <span className="bg-white border rounded-lg p-2"><b>Nearest police</b><br/>{route.safe_havens?.nearest_police?.name || 'Limited data'}</span>
                        <span className="bg-white border rounded-lg p-2"><b>Weather</b><br/>{weather.label}</span>
                        <span className="bg-white border rounded-lg p-2"><b>Known risk zones</b><br/>{route.warnings?.some(w => w.type === 'blackspot') ? 'Encountered — see warning' : 'No higher-WSI cells encountered'}</span>
                      </div>
                      <p className="text-[10px] text-slate-600">Data limit: {route.profile_limitation || 'Coverage varies by street.'}</p>
                    </div>
                    {!!route.warnings?.length && <div className="space-y-1.5" aria-label="Unsafe segment warnings">
                      {route.warnings.map((warning, index) => <div key={`${warning.type}-${index}`} className="flex gap-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-[11px] text-rose-900"><AlertTriangle className="w-4 h-4 shrink-0"/><span>{warning.message}</span></div>)}
                    </div>}
                    {(weather.rainMm || (weather.visibilityKm != null && weather.visibilityKm < 3)) && <p className="text-[11px] bg-amber-50 border border-amber-200 text-amber-900 p-2.5 rounded-lg">Poor-weather caution: {weather.rainMm ? `${weather.rainMm} mm rain forecast` : 'low visibility forecast'}. Weather is advisory and does not alter the RSS.</p>}
                    {route.notice && <p className="p-3 text-sm bg-amber-50 text-amber-900 rounded-lg">{route.notice}</p>}
                    <p className="text-sm text-slate-600">{route.distance_overhead_percentage ?? 0}% additional distance · {route.shared_with_fastest ? 'Shares shortest route' : 'Alternative road path'}. {route.traffic_source}</p>
                    {!!route.community_penalty && <p className="text-sm text-rose-700">Active community hazards: −{route.community_penalty} RSS points.</p>}
                    {/* Counterfactual Detour Callout */}
                    {detour && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1 text-xs">
                        <div className="flex items-center gap-1.5 text-amber-900 font-bold">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          <span>Counterfactual Safe Detour</span>
                        </div>
                        <p className="text-[11px] text-amber-800 leading-relaxed">
                          {detour.explanation}
                        </p>
                      </div>
                    )}
                    {/* Attribution Breakdown */}
                    {attrib && (
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-700 uppercase">
                          <span>Attribution Breakdown ({attrib.raw_rss.toFixed(1)} Raw RSS)</span>
                          <span className="font-mono text-emerald-700 font-bold">Model contributions</span>
                        </div>
                        {/* Compact Stacked Bar */}
                        <div className="w-full h-2.5 rounded-full overflow-hidden flex bg-slate-200 border border-slate-300 p-0.5 gap-0.5">
                          <div style={{ width: `${(attrib.contributions.accident / Math.max(1, attrib.raw_rss)) * 100}%` }} className="bg-rose-500 rounded-l-full" title={`Accident Safety: +${attrib.contributions.accident}`} />
                          <div style={{ width: `${(attrib.contributions.emergency / Math.max(1, attrib.raw_rss)) * 100}%` }} className="bg-pink-500" title={`Emergency Access: +${attrib.contributions.emergency}`} />
                          <div style={{ width: `${(attrib.contributions.lighting / Math.max(1, attrib.raw_rss)) * 100}%` }} className="bg-amber-400" title={`Street Lighting: +${attrib.contributions.lighting}`} />
                          <div style={{ width: `${(attrib.contributions.pedestrian / Math.max(1, attrib.raw_rss)) * 100}%` }} className="bg-emerald-500" title={`Pedestrian Path: +${attrib.contributions.pedestrian}`} />
                          <div style={{ width: `${(attrib.contributions.traffic / Math.max(1, attrib.raw_rss)) * 100}%` }} className="bg-blue-500 rounded-r-full" title={`Traffic Flow: +${attrib.contributions.traffic}`} />
                        </div>
                        {/* Component Value Chips */}
                        <div className="grid grid-cols-5 gap-1 text-center font-mono text-[9px]">
                          <div className="bg-white py-1 rounded border border-slate-200"><span className="text-rose-600 block font-bold">+{attrib.contributions.accident}</span>Crash</div>
                          <div className="bg-white py-1 rounded border border-slate-200"><span className="text-pink-600 block font-bold">+{attrib.contributions.emergency}</span>Emerg</div>
                          <div className="bg-white py-1 rounded border border-slate-200"><span className="text-amber-600 block font-bold">+{attrib.contributions.lighting}</span>Light</div>
                          <div className="bg-white py-1 rounded border border-slate-200"><span className="text-emerald-600 block font-bold">+{attrib.contributions.pedestrian}</span>Ped</div>
                          <div className="bg-white py-1 rounded border border-slate-200"><span className="text-blue-600 block font-bold">+{attrib.contributions.traffic}</span>Traf</div>
                        </div>
                      </div>
                    )}

                    {/* Honest Uncertainty Confidence Pill */}
                    {uncertainty && (
                      <div className="pt-0.5">
                        <button
                          type="button"
                          onClick={(e) => toggleUncertainty(route.id, e)}
                          className="w-full flex items-center justify-between text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors py-1"
                        >
                          <span className="flex items-center gap-1.5">
                            <Info className="w-3.5 h-3.5 text-blue-600" />
                            <span>Data Provenance & Confidence:</span>
                            <span className="px-2 py-0.2 rounded text-[10px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200">
                              {uncertainty.overall_confidence} ({uncertainty.overall_verified_percentage}%)
                            </span>
                          </span>
                          {showUncertainty ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                        {showUncertainty && (
                          <div className="mt-1.5 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 space-y-1">
                            <p className="text-[11px] leading-relaxed text-slate-700">{uncertainty.explanation}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Safe Haven Position-Band Coverage */}
                    {havens && havens.bands.length > 0 && (
                      <div className="pt-0.5 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={(e) => toggleHavens(route.id, e)}
                          className="w-full flex items-center justify-between text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors py-1"
                        >
                          <span className="flex items-center gap-1.5">
                            <Hospital className="w-3.5 h-3.5 text-rose-500" />
                            <span>Safe Haven Checkpoints ({havens.bands.length} Bands)</span>
                          </span>
                          {showHavens ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                        {showHavens && (
                          <div className="mt-2 space-y-1.5">
                            {havens.bands.map((b, idx) => (
                              <div key={idx} className="p-2.5 bg-slate-50 rounded-lg text-xs border border-slate-200 flex items-center justify-between">
                                <span className="text-slate-800 font-medium text-[11px]">{b.band_name}</span>
                                <div className="text-[10px] text-slate-600 font-mono flex items-center gap-2">
                                  <span className="text-rose-700 font-medium">🏥 {b.hospital.name.split(' ')[0]} ({b.hospital.distance_meters}m)</span>
                                  <span className="text-blue-700 font-medium">🚓 {b.police.name.split(' ')[0]} ({b.police.distance_meters}m)</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Grounded Reasons List */}
                    <div className="pt-0.5 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={(e) => toggleReasons(route.id, e)}
                        className="w-full flex items-center justify-between text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors py-1"
                      >
                        <span className="flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-blue-600" />
                          <span>Safety Explanations & Urban Proof</span>
                        </span>
                        {showReasons ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>

                      {showReasons && (
                        <div className="mt-2 space-y-2 pl-2 border-l-2 border-slate-200 text-xs text-slate-700">
                          {route.reasons.map((reason, idx) => (
                            <div key={idx} className="flex items-start gap-1.5">
                              <span
                                className="inline-block w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                                style={{ backgroundColor: rColor }}
                              />
                              <p className="text-[11px] leading-relaxed text-slate-700">{reason}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Turn-by-Turn Steps */}
                    <div className="pt-0.5 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={(e) => toggleSteps(route.id, e)}
                        className="w-full flex items-center justify-between text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors py-1"
                      >
                        <span className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-500" />
                          <span>Road-by-road itinerary ({route.steps.length} steps)</span>
                        </span>
                        {showSteps ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>

                      {showSteps && (
                        <div className="mt-2 space-y-2 max-h-44 overflow-y-auto pr-1">
                          {route.steps.map((step, idx) => (
                            <div key={idx} className="p-2.5 bg-slate-50 rounded-lg text-xs space-y-0.5 border border-slate-200">
                              <div className="text-slate-900 font-medium leading-snug">{step.instruction}</div>
                              <div className="text-[10px] text-slate-500 flex items-center justify-between">
                                <span>{step.street}</span>
                                <span className="font-mono">{step.distance_meters} m</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
