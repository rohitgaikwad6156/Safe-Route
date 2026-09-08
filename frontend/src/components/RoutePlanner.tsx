import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  MapPin,
  ArrowDownUp,
  Navigation,
  X,
  Building2,
  GraduationCap,
  Train,
  Landmark as LandmarkIcon,
  Database,
  AlertTriangle,
  CheckCircle2,
  Compass,
  Sparkles,
  Loader2
} from 'lucide-react';
import { Landmark } from '../types';
import landmarksData from '../mocks/landmarks.json';
import { validateBBox, searchPuneLandmarks } from '../lib/geocoding';

interface RoutePlannerProps {
  origin: string;
  destination: string;
  onOriginChange: (val: string) => void;
  onDestinationChange: (val: string) => void;
  onSwap: () => void;
  onSelectLandmark?: (landmark: Landmark, target: 'origin' | 'destination') => void;
  onCalculateRoute?: (originText: string, destText: string) => void;
  onUseMyLocation?: () => void;
  isLocatingOrigin?: boolean;
  locationError?: string | null;
  isLoading?: boolean;
  originCoords?: [number, number];
  destCoords?: [number, number];
  compact?: boolean;
}

const POPULAR_HUBS = [
  { name: 'Kothrud', label: 'Kothrud' },
  { name: 'Hinjawadi', label: 'Hinjawadi' },
  { name: 'Shivajinagar Station, Pune', label: 'Shivajinagar' },
  { name: 'Katraj (Katraj Chowk), Pune', label: 'Katraj' },
  { name: 'Viman Nagar', label: 'Viman Nagar' },
  { name: 'Baner', label: 'Baner' },
  { name: 'Hadapsar', label: 'Hadapsar' },
  { name: 'Swargate', label: 'Swargate' },
  { name: 'Aundh', label: 'Aundh' },
];

export const RoutePlanner: React.FC<RoutePlannerProps> = ({
  origin,
  destination,
  onOriginChange,
  onDestinationChange,
  onSwap,
  onSelectLandmark,
  onCalculateRoute,
  onUseMyLocation,
  isLocatingOrigin = false,
  locationError,
  isLoading = false,
  originCoords,
  destCoords,
  compact = false,
}) => {
  const [activeField, setActiveField] = useState<'origin' | 'destination' | null>(null);
  const [originQuery, setOriginQuery] = useState(origin);
  const [destQuery, setDestQuery] = useState(destination);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isIdentical =
    origin.trim().toLowerCase() === destination.trim().toLowerCase() && origin.trim().length > 0;

  // Check if inputs contain coordinates outside bbox
  const parseCoord = (str: string): [number, number] | null => {
    const parts = str.split(',').map((p) => parseFloat(p.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return [parts[0], parts[1]];
    }
    return null;
  };

  const origCoord = parseCoord(originQuery);
  const destCoord = parseCoord(destQuery);
  const origBBox = origCoord ? validateBBox(origCoord[0], origCoord[1]) : { isValid: true };
  const destBBox = destCoord ? validateBBox(destCoord[0], destCoord[1]) : { isValid: true };
  const bboxError = !origBBox.isValid ? origBBox.message : !destBBox.isValid ? destBBox.message : null;

  useEffect(() => {
    setOriginQuery(origin);
  }, [origin]);

  useEffect(() => {
    setDestQuery(destination);
  }, [destination]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveField(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentSuggestions =
    activeField === 'origin'
      ? searchPuneLandmarks(originQuery, 6)
      : activeField === 'destination'
      ? searchPuneLandmarks(destQuery, 6)
      : [];

  const getCategoryIcon = (category?: string) => {
    switch (category) {
      case 'education':
        return <GraduationCap className="w-3.5 h-3.5 text-indigo-400" />;
      case 'tech_park':
        return <Building2 className="w-3.5 h-3.5 text-cyan-400" />;
      case 'transit':
        return <Train className="w-3.5 h-3.5 text-emerald-400" />;
      default:
        return <LandmarkIcon className="w-3.5 h-3.5 text-amber-400" />;
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setActiveField(null);
    if (onCalculateRoute) {
      onCalculateRoute(originQuery, destQuery);
    }
  };

  const handleQuickHubClick = (hubName: string) => {
    if (activeField === 'origin') {
      setOriginQuery(hubName);
      onOriginChange(hubName);
      onCalculateRoute?.(hubName, destQuery);
      setActiveField(null);
    } else if (activeField === 'destination') {
      setDestQuery(hubName);
      onDestinationChange(hubName);
      onCalculateRoute?.(originQuery, hubName);
      setActiveField(null);
    } else {
      // If neither is focused, set destination if origin already exists, otherwise origin
      if (!originQuery || originQuery === 'Shivajinagar Station, Pune') {
        setOriginQuery(hubName);
        onOriginChange(hubName);
        onCalculateRoute?.(hubName, destQuery);
      } else {
        setDestQuery(hubName);
        onDestinationChange(hubName);
        onCalculateRoute?.(originQuery, hubName);
      }
    }
  };

  return (
    <div className="bg-white/95 rounded-2xl border border-slate-200/90 p-4 shadow-xl backdrop-blur-md relative z-30">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
          <Navigation className="w-3.5 h-3.5 text-blue-600" />
          <span>Pune Route Navigation</span>
        </span>
        <span className="text-[11px] font-medium text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200 flex items-center gap-1">
          <Database className="w-3 h-3 text-blue-600" />
          <span>Universal Pune Search</span>
        </span>
      </div>

      {isIdentical && (
        <div className="mb-3 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>Origin and destination are identical (0 meters). Zero road travel required.</span>
        </div>
      )}

      {bboxError && (
        <div className="mb-3 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2 animate-in fade-in duration-200">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <span>{bboxError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="relative flex items-center gap-3">
          {/* Visual Line connector with Map Pin Symbols */}
          <div className="flex flex-col items-center justify-between h-20 py-1">
            <div className="w-5 h-5 rounded-full border-2 border-emerald-500 bg-emerald-50 shadow-sm flex items-center justify-center text-emerald-600" title="Source / Origin">
              <MapPin className="w-3 h-3 text-emerald-600" />
            </div>
            <div className="w-0.5 h-6 bg-gradient-to-b from-emerald-500 via-teal-400 to-rose-500" />
            <div className="w-5 h-5 rounded-full border-2 border-rose-500 bg-rose-50 shadow-sm flex items-center justify-center text-rose-600" title="Destination">
              <MapPin className="w-3 h-3 text-rose-600" />
            </div>
          </div>

          {/* Inputs */}
          <div className="flex-1 space-y-2">
            {/* Origin (Source) Input */}
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="relative flex items-center">
                <span className="absolute left-3 text-emerald-600 pointer-events-none flex items-center">
                  <MapPin className="w-3.5 h-3.5" />
                </span>
                <input
                  type="text"
                  value={originQuery}
                  onFocus={() => setActiveField('origin')}
                  onChange={(e) => {
                    setOriginQuery(e.target.value);
                    onOriginChange(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSubmit();
                    }
                  }}
                  placeholder="Starting point (e.g. PCCOE, Kothrud, Baner)..."
                  aria-label="Source"
                  className="min-h-11 w-full bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl pl-8 pr-10 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-inner focus:shadow-none"
                />
                {originQuery && (
                  <button
                    type="button"
                    aria-label="Clear source"
                    onClick={() => {
                      setOriginQuery('');
                      onOriginChange('');
                    }}
                    className="absolute right-0 top-0 flex h-11 w-10 items-center justify-center text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {onUseMyLocation ? (
                <button
                  type="button"
                  onClick={onUseMyLocation}
                  disabled={isLocatingOrigin}
                  aria-busy={isLocatingOrigin}
                  className="flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-70"
                >
                  {isLocatingOrigin ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                  <span>{isLocatingOrigin ? 'Locating…' : 'Use My Location'}</span>
                </button>
              ) : null}
            </div>

            {locationError ? (
              <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-900">
                {locationError}
              </p>
            ) : null}

            {/* Destination Input */}
            <div className="relative flex items-center">
              <span className="absolute left-3 text-rose-600 pointer-events-none flex items-center">
                <MapPin className="w-3.5 h-3.5" />
              </span>
              <input
                type="text"
                value={destQuery}
                onFocus={() => setActiveField('destination')}
                onChange={(e) => {
                  setDestQuery(e.target.value);
                  onDestinationChange(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSubmit();
                  }
                }}
                placeholder="Destination (e.g. Shivajinagar, Hinjawadi)..."
                aria-label="Destination"
                className="min-h-11 w-full bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 focus:border-rose-500 rounded-xl pl-8 pr-10 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-rose-500/20 transition-all shadow-inner focus:shadow-none"
              />
              {destQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setDestQuery('');
                    onDestinationChange('');
                  }}
                  aria-label="Clear destination"
                  className="absolute right-0 top-0 flex h-11 w-10 items-center justify-center text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Swap Button */}
          <button
            type="button"
            onClick={onSwap}
            title="Swap Starting Point & Destination"
            className="p-2.5 bg-slate-50 hover:bg-slate-100 active:scale-95 text-slate-600 hover:text-slate-900 rounded-xl border border-slate-200 transition-all flex items-center justify-center shadow-sm"
          >
            <ArrowDownUp className="w-4 h-4" />
          </button>
        </div>

        {/* Action Button: Find Safe Routes */}
        <div className="pt-1 flex items-center gap-2">
          <button
            type="submit"
            disabled={isLoading || !originQuery.trim() || !destQuery.trim()}
            className="flex-1 py-2.5 px-4 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white shadow-md shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                <span>Computing Safest Corridors...</span>
              </>
            ) : (
              <>
                <Compass className="w-3.5 h-3.5 text-white" />
                <span>Calculate Safe Routes</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Quick Select Popular Pune Hubs */}
      {!compact ? <div className="mt-3 pt-2.5 border-t border-slate-100">
        <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-amber-500" />
          <span>Popular Pune Corridors</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {POPULAR_HUBS.map((hub) => (
            <button
              key={hub.name}
              type="button"
              onClick={() => handleQuickHubClick(hub.name)}
              className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-100 hover:bg-slate-200/80 text-slate-700 hover:text-slate-900 border border-slate-200/80 transition-all active:scale-95"
            >
              {hub.label}
            </button>
          ))}
        </div>
      </div> : null}

      {/* Coordinates feedback */}
      {!compact && (originCoords || destCoords) && (
        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] font-mono text-slate-500">
          {originCoords && (
            <div className="flex items-center gap-1 text-emerald-700 font-medium">
              <MapPin className="w-3 h-3 text-emerald-600" />
              <span>Source (A): {originCoords[1].toFixed(3)}°, {originCoords[0].toFixed(3)}°</span>
            </div>
          )}
          {destCoords && (
            <div className="flex items-center gap-1 text-rose-700 font-medium">
              <MapPin className="w-3 h-3 text-rose-600" />
              <span>Dest (B): {destCoords[1].toFixed(3)}°, {destCoords[0].toFixed(3)}°</span>
            </div>
          )}
        </div>
      )}

      {/* Autocomplete Dropdown */}
      {activeField && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <div className="p-2.5 bg-slate-50/80 border-b border-slate-100 text-[10px] font-semibold uppercase text-slate-500 tracking-wider flex items-center justify-between">
            <span>Verified Pune Landmarks & Areas</span>
            <span>{currentSuggestions.length} suggestions</span>
          </div>
          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
            {currentSuggestions.map((item) => (
              <button
                key={item.name}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (activeField === 'origin') {
                    setOriginQuery(item.name);
                    onOriginChange(item.name);
                    onSelectLandmark?.(item, 'origin');
                  } else {
                    setDestQuery(item.name);
                    onDestinationChange(item.name);
                    onSelectLandmark?.(item, 'destination');
                  }
                  setActiveField(null);
                }}
                className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50/90 transition-colors flex items-center justify-between group"
              >
                <div className="flex items-center space-x-2.5">
                  <div className="p-1.5 rounded-lg bg-slate-100 group-hover:bg-slate-200">
                    {getCategoryIcon(item.category)}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-800 group-hover:text-blue-600">
                      {item.name}
                    </div>
                    {item.ward && (
                      <div className="text-[10px] text-slate-400">
                        Ward: {item.ward}
                      </div>
                    )}
                  </div>
                </div>
                <span className="text-[10px] font-mono text-slate-400 group-hover:text-slate-600">
                  {item.lat.toFixed(3)}, {item.lon.toFixed(3)}
                </span>
              </button>
            ))}

            {/* Free-text Search Item */}
            {((activeField === 'origin' && originQuery.trim()) || (activeField === 'destination' && destQuery.trim())) && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSubmit();
                }}
                className="w-full text-left px-3.5 py-2.5 bg-blue-50/70 hover:bg-blue-100/70 text-blue-700 transition-colors flex items-center gap-2 text-xs font-medium"
              >
                <Search className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                <span>
                  Search location: "{activeField === 'origin' ? originQuery : destQuery}"
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
