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
        <div className="bg-amber-500/90 text-slate-950 font-bold px-3 py-2 rounded-xl shadow-xl backdrop-blur-md flex items-center justify-between gap-3 text-xs animate-pulse">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-slate-950" />
            <span>Click anywhere on the map to pin incident location</span>
          </div>
          <button
            type="button"
            onClick={onCancelPinning}
            className="px-2 py-0.5 bg-slate-900 text-white rounded-md text-[10px] uppercase font-mono tracking-wider hover:bg-black"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Floating Control Pill */}
      <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-1.5 shadow-2xl backdrop-blur-md flex items-center gap-1">
        {/* Heatmap Toggle */}
        <button
          type="button"
          onClick={onToggleHeatmap}
          className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
            showHeatmap
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-[0_0_12px_rgba(244,63,94,0.3)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
          title="Toggle Pune Accident Risk Heatmap (534 WSI Clusters)"
        >
          <Flame className={`w-4 h-4 ${showHeatmap ? 'text-rose-400 fill-rose-400/20' : ''}`} />
          <span>Risk Heatmap</span>
        </button>

        {/* Emergency Amenities Toggle */}
        <button
          type="button"
          onClick={onToggleAmenities}
          className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
            showAmenities
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
          title="Toggle Hospitals, Police Chowkis & ECBs"
        >
          <Hospital className={`w-4 h-4 ${showAmenities ? 'text-cyan-400' : ''}`} />
          <span>Safety Amenities</span>
        </button>

        <div className="w-[1px] h-5 bg-slate-800 mx-1" />

        {/* Reset Camera Button */}
        <button
          type="button"
          onClick={onResetView}
          className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          title="Reset Camera to Route Extent"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Legend Badge */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-2.5 shadow-xl backdrop-blur-md text-[11px] space-y-1.5 max-w-[210px]">
        <div className="font-bold text-slate-300 uppercase tracking-wider text-[10px] flex items-center gap-1">
          <Layers className="w-3 h-3 text-slate-400" />
          <span>Route Map Legend</span>
        </div>
        <div className="space-y-1 text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-3 h-1 bg-[#10b981] rounded-full" />
            <span className="text-slate-200 font-medium">Safest Route</span>
            <span className="text-[9px] font-mono text-emerald-400 ml-auto">RSS 82+</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-1 bg-[#3b82f6] rounded-full" />
            <span className="text-slate-200 font-medium">Fastest Route</span>
            <span className="text-[9px] font-mono text-blue-400 ml-auto">RSS ~52</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-1 bg-[#f59e0b] rounded-full" />
            <span className="text-slate-200 font-medium">Balanced Route</span>
            <span className="text-[9px] font-mono text-amber-400 ml-auto">RSS ~75</span>
          </div>
          {showHeatmap && (
            <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
              <span className="w-3 h-3 rounded-full bg-gradient-to-r from-yellow-400 via-orange-500 to-red-600" />
              <span className="text-slate-200">Crash Blackspots</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
