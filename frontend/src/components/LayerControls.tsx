import React from 'react';
import { Flame, Hospital, RotateCcw, AlertTriangle, Layers, Info } from 'lucide-react';

interface LayerControlsProps {
  showHeatmap: boolean;
  onToggleHeatmap: () => void;
  showAmenities: boolean;
  onToggleAmenities: () => void;
  onResetView: () => void;
  isPinningMode: boolean;
  onCancelPinning: () => void;
}

export const LayerControls: React.FC<LayerControlsProps> = ({
  showHeatmap,
  onToggleHeatmap,
  showAmenities,
  onToggleAmenities,
  onResetView,
  isPinningMode,
  onCancelPinning,
}) => {
  return (
    <div className="flex flex-col gap-2 z-20 pointer-events-auto">
      {/* Active Pinning Banner if user clicked Pin on Map */}
      {isPinningMode && (
        <div className="bg-amber-500 text-slate-950 font-bold px-3.5 py-2.5 rounded-xl shadow-xl backdrop-blur-md flex items-center justify-between gap-3 text-xs animate-pulse">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-slate-950" />
            <span>Click anywhere on the map to pin incident location</span>
          </div>
          <button
            type="button"
            onClick={onCancelPinning}
            className="px-2.5 py-1 bg-slate-900 text-white rounded-lg text-[10px] uppercase font-mono tracking-wider hover:bg-black"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Floating Control Pill */}
      <div className="bg-white/95 border border-slate-200/90 rounded-2xl p-1.5 shadow-xl backdrop-blur-md flex items-center gap-1">
        {/* Heatmap Toggle */}
        <button
          type="button"
          onClick={onToggleHeatmap}
          className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
            showHeatmap
              ? 'bg-rose-50 text-rose-700 border border-rose-200 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
          title="Toggle Pune Accident Risk Heatmap (534 WSI Clusters)"
        >
          <Flame className={`w-4 h-4 ${showHeatmap ? 'text-rose-600 fill-rose-500/20' : ''}`} />
          <span>Risk Heatmap</span>
        </button>

        {/* Emergency Amenities Toggle */}
        <button
          type="button"
          onClick={onToggleAmenities}
          className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
            showAmenities
              ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
          title="Toggle Hospitals, Police Chowkis & ECBs"
        >
          <Hospital className={`w-4 h-4 ${showAmenities ? 'text-blue-600' : ''}`} />
          <span>Safety Amenities</span>
        </button>

        <div className="w-[1px] h-5 bg-slate-200 mx-1" />

        {/* Reset Camera Button */}
        <button
          type="button"
          onClick={onResetView}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          title="Reset Camera to Route Extent"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Legend Badge */}
      <div className="bg-white/95 border border-slate-200/90 rounded-xl p-3 shadow-xl backdrop-blur-md text-[11px] space-y-1.5 max-w-[220px]">
        <div className="font-bold text-slate-800 uppercase tracking-wider text-[10px] flex items-center gap-1">
          <Layers className="w-3 h-3 text-slate-500" />
          <span>Route Map Legend</span>
        </div>
        <div className="space-y-1.5 text-slate-600">
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-1.5 bg-[#059669] rounded-full" />
            <span className="text-slate-800 font-medium">Safest Route</span>
            <span className="text-[10px] font-mono font-bold text-emerald-700 ml-auto">RSS 82+</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-1.5 bg-[#1a73e8] rounded-full" />
            <span className="text-slate-800 font-medium">Fastest Route</span>
            <span className="text-[10px] font-mono font-bold text-blue-700 ml-auto">RSS ~52</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-1.5 bg-[#d97706] rounded-full" />
            <span className="text-slate-800 font-medium">Balanced Route</span>
            <span className="text-[10px] font-mono font-bold text-amber-700 ml-auto">RSS ~75</span>
          </div>
          {showHeatmap && (
            <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
              <span className="w-3 h-3 rounded-full bg-gradient-to-r from-yellow-400 via-orange-500 to-red-600" />
              <span className="text-slate-700 font-medium">Crash Blackspots</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
