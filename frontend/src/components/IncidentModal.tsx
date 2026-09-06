import React, { useState } from 'react';
import { X, AlertTriangle, LightbulbOff, EyeOff, Construction, ShieldAlert, Check, MapPin } from 'lucide-react';
import { IncidentReport } from '../types';

interface IncidentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (report: IncidentReport) => void;
  pinnedLocation: { lat: number; lon: number } | null;
  onStartPinning: () => void;
}

export const IncidentModal: React.FC<IncidentModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  pinnedLocation,
  onStartPinning,
}) => {
  const [category, setCategory] = useState<IncidentReport['category']>('poor_lighting');
  const [severity, setSeverity] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('Katraj - Swargate Junction, Pune');
  const [isSuccess, setIsSuccess] = useState(false);

  const [rateLimitError, setRateLimitError] = useState<string | null>(null);
  const recentSubmissionsRef = React.useRef<number[]>([]);

  // Keyboard accessibility: Escape to close modal
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const categories = [
    {
      id: 'poor_lighting',
      label: 'Broken / Poor Lighting',
      icon: <LightbulbOff className="w-4 h-4 text-amber-400" />,
      desc: 'Dark road stretches, non-functioning street lamps',
    },
    {
      id: 'harassment_risk',
      label: 'Harassment / Safety Risk',
      icon: <ShieldAlert className="w-4 h-4 text-rose-400" />,
      desc: 'Unsafe gathering, eve-teasing, deserted area',
    },
    {
      id: 'accident_prone',
      label: 'Accident Blackspot',
      icon: <AlertTriangle className="w-4 h-4 text-red-500" />,
      desc: 'Dangerous blind turns, frequent vehicle collisions',
    },
    {
      id: 'pothole_hazard',
      label: 'Severe Road Hazard',
      icon: <Construction className="w-4 h-4 text-orange-400" />,
      desc: 'Deep potholes, unpaved road, open manhole',
    },
    {
      id: 'isolated_stretch',
      label: 'Isolated Stretch',
      icon: <EyeOff className="w-4 h-4 text-purple-400" />,
      desc: 'Zero pedestrian footfall, no surveillance',
    },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const now = Date.now();
    const windowMs = 30000;
    const maxSubmissions = 3;

    // Sliding window: filter submissions to the last 30s
    recentSubmissionsRef.current = recentSubmissionsRef.current.filter((t) => now - t < windowMs);

    if (recentSubmissionsRef.current.length >= maxSubmissions) {
      const oldest = recentSubmissionsRef.current[0];
      const waitSeconds = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
      setRateLimitError(
        `Rate Limit Exceeded: Maximum ${maxSubmissions} hazard reports allowed per 30 seconds to prevent crowdsourced spam. Please wait ${waitSeconds}s before submitting another report.`
      );
      return;
    }

    recentSubmissionsRef.current.push(now);
    setRateLimitError(null);

    const newReport: IncidentReport = {
      id: `incident-${Date.now()}`,
      category,
      severity,
      description: description || `Reported ${category.replace('_', ' ')} incident near ${address}`,
      lat: pinnedLocation ? pinnedLocation.lat : 18.458,
      lon: pinnedLocation ? pinnedLocation.lon : 73.828,
      address,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    onSubmit(newReport);
    setIsSuccess(true);
    setTimeout(() => {
      setIsSuccess(false);
      onClose();
    }, 1200);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl relative">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-rose-500/15 border border-rose-500/30">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <h2 id="modal-title" className="text-base font-display font-bold text-slate-100">Report Urban Safety Hazard</h2>
              <p className="text-xs text-slate-400">Crowdsource Pune road condition & lighting alerts</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {rateLimitError && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2 animate-in fade-in duration-200">
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <span>{rateLimitError}</span>
          </div>
        )}

        {isSuccess ? (
          <div className="p-12 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-300 shadow-lg">
              <Check className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-display font-bold text-slate-100">Hazard Reported Successfully</h3>
            <p className="text-xs text-slate-400 max-w-xs">
              Incident pinned to live Pune safety map. RSS scores will recalculate for this corridor.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Category Select */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                Hazard Category
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {categories.map((c) => {
                  const isSelected = category === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategory(c.id as IncidentReport['category'])}
                      className={`p-2.5 rounded-xl border text-left transition-all flex items-start space-x-2.5 ${
                        isSelected
                          ? 'bg-cyan-950/50 border-cyan-500 text-slate-100 shadow-md ring-1 ring-cyan-500/50'
                          : 'bg-slate-950/40 border-slate-800 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <div className="mt-0.5">{c.icon}</div>
                      <div>
                        <div className="text-xs font-semibold">{c.label}</div>
                        <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{c.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Severity Rating */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Severity Level (1 to 5)
                </label>
                <span className="text-xs font-mono font-bold text-amber-400">
                  {severity === 5 ? '5 - Critical Hazard' : severity >= 3 ? `${severity} - Moderate Threat` : `${severity} - Minor Inconvenience`}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {([1, 2, 3, 4, 5] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setSeverity(lvl)}
                    className={`py-2 rounded-xl text-xs font-bold font-mono transition-all border ${
                      severity === lvl
                        ? lvl >= 4
                          ? 'bg-rose-600 text-white border-rose-500 shadow-lg'
                          : lvl >= 3
                          ? 'bg-amber-600 text-white border-amber-500 shadow-lg'
                          : 'bg-emerald-600 text-white border-emerald-500 shadow-lg'
                        : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    Level {lvl}
                  </button>
                ))}
              </div>
            </div>

            {/* Location Indicator & Pinning trigger */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Incident Location
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Enter landmark or intersection..."
                    className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>
                <button
                  type="button"
                  onClick={onStartPinning}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-400 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{pinnedLocation ? 'Pin Updated' : 'Pin On Map'}</span>
                </button>
              </div>
              {pinnedLocation ? (
                <span className="text-[10px] font-mono text-emerald-400 mt-1 block">
                  ✓ Geotag: {pinnedLocation.lat.toFixed(4)}, {pinnedLocation.lon.toFixed(4)} (Direct Street Coordinate)
                </span>
              ) : (
                <span className="text-[10px] font-mono text-slate-500 mt-1 block">
                  Tip: Click &apos;Pin On Map&apos; to drop marker directly onto any road segment or junction.
                </span>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Observations / Details (Optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="E.g. Street lamps out for 300 meters near Katraj bridge underpass; poor visibility for two-wheelers..."
                rows={2}
                className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white shadow-lg transition-all active:scale-95"
              >
                Submit Hazard Report
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
