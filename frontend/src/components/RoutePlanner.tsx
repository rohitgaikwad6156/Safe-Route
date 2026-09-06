import React, { useState, useRef, useEffect } from 'react';
import { Search, MapPin, ArrowDownUp, Navigation, X, Building2, GraduationCap, Train, Landmark as LandmarkIcon, Database, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Landmark } from '../types';
import landmarksData from '../mocks/landmarks.json';
import { validateBBox, SUPPORTED_AREAS } from '../lib/geocoding';

interface RoutePlannerProps {
  origin: string;
  destination: string;
  onOriginChange: (val: string) => void;
  onDestinationChange: (val: string) => void;
  onSwap: () => void;
  onSelectLandmark?: (landmark: Landmark, target: 'origin' | 'destination') => void;
}

export const RoutePlanner: React.FC<RoutePlannerProps> = ({
  origin,
  destination,
  onOriginChange,
  onDestinationChange,
  onSwap,
  onSelectLandmark,
}) => {
  const [activeField, setActiveField] = useState<'origin' | 'destination' | null>(null);
  const [originQuery, setOriginQuery] = useState(origin);
  const [destQuery, setDestQuery] = useState(destination);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isIdentical = origin.trim().toLowerCase() === destination.trim().toLowerCase() && origin.trim().length > 0;

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

  const getFilteredLandmarks = (query: string) => {
    if (!query || query.trim().length === 0) {
      return (landmarksData as Landmark[]).slice(0, 5);
    }
    const q = query.toLowerCase();
    return (landmarksData as Landmark[]).filter((item) => {
      const matchName = item.name.toLowerCase().includes(q);
      const matchWard = item.ward?.toLowerCase().includes(q);
      const matchAliases = item.aliases?.some((a) => a.toLowerCase().includes(q));
      return matchName || matchWard || matchAliases;
    }).slice(0, 6);
  };

  const currentSuggestions = activeField === 'origin'
    ? getFilteredLandmarks(originQuery)
    : activeField === 'destination'
    ? getFilteredLandmarks(destQuery)
    : [];

  const getCategoryIcon = (category: string) => {
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

  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800/80 p-4 shadow-xl backdrop-blur-md relative z-30">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
          <Navigation className="w-3.5 h-3.5 text-cyan-400" />
          <span>Pune Route Navigation</span>
        </span>
        <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40 flex items-center gap-1">
          <Database className="w-3 h-3 text-cyan-400" />
          <span>Offline Landmark Registry</span>
        </span>
      </div>

      {isIdentical && (
        <div className="mb-3 p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>Origin and destination are identical (0 meters). Zero road travel required.</span>
        </div>
      )}

      {bboxError && (
        <div className="mb-3 p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2 animate-in fade-in duration-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <span>{bboxError}</span>
        </div>
      )}

      <div className="relative flex items-center gap-3">
        {/* Visual Line connector */}
        <div className="flex flex-col items-center justify-between h-20 py-2">
          <div className="w-3 h-3 rounded-full border-2 border-emerald-400 bg-emerald-950 flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          </div>
          <div className="w-0.5 h-8 bg-gradient-to-b from-emerald-500 via-cyan-500 to-rose-500" />
          <div className="w-3 h-3 rounded-full border-2 border-rose-500 bg-rose-950 flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          </div>
        </div>

        {/* Inputs */}
        <div className="flex-1 space-y-2">
          {/* Origin Input */}
          <div className="relative">
            <input
              type="text"
              value={originQuery}
              onFocus={() => setActiveField('origin')}
              onChange={(e) => {
                setOriginQuery(e.target.value);
                onOriginChange(e.target.value);
              }}
              placeholder="Enter starting point (e.g. Shivajinagar Station)..."
              className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors pr-8"
            />
            {originQuery && (
              <button
                type="button"
                onClick={() => {
                  setOriginQuery('');
                  onOriginChange('');
                }}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Destination Input */}
          <div className="relative">
            <input
              type="text"
              value={destQuery}
              onFocus={() => setActiveField('destination')}
              onChange={(e) => {
                setDestQuery(e.target.value);
                onDestinationChange(e.target.value);
              }}
              placeholder="Enter destination (e.g. Katraj Chowk)..."
              className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500 transition-colors pr-8"
            />
            {destQuery && (
              <button
                type="button"
                onClick={() => {
                  setDestQuery('');
                  onDestinationChange('');
                }}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200"
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
          title="Swap Origin & Destination"
          className="p-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 rounded-xl border border-slate-700 transition-all flex items-center justify-center shadow-md hover:text-white"
        >
          <ArrowDownUp className="w-4 h-4" />
        </button>
      </div>

      {/* Autocomplete Dropdown */}
      {activeField && currentSuggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 top-full mt-2 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden z-50 backdrop-blur-xl animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <div className="p-2 bg-slate-950/70 border-b border-slate-800 text-[10px] font-semibold uppercase text-slate-400 tracking-wider flex items-center justify-between">
            <span>Verified Pune Landmarks</span>
            <span>{currentSuggestions.length} found</span>
          </div>
          <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/60">
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
                className="w-full text-left px-3 py-2.5 hover:bg-slate-800/80 transition-colors flex items-center justify-between group"
              >
                <div className="flex items-center space-x-2.5">
                  <div className="p-1.5 rounded-lg bg-slate-800 group-hover:bg-slate-700">
                    {getCategoryIcon(item.category)}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-200 group-hover:text-cyan-300">
                      {item.name}
                    </div>
                    {item.ward && (
                      <div className="text-[10px] text-slate-400">
                        Ward: {item.ward}
                      </div>
                    )}
                  </div>
                </div>
                <span className="text-[10px] font-mono text-slate-500 group-hover:text-slate-300">
                  {item.lat.toFixed(3)}, {item.lon.toFixed(3)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
