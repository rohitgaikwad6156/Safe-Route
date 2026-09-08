import React, { useState } from 'react';
import { X, AlertTriangle, LightbulbOff, EyeOff, Construction, ShieldAlert, Check, MapPin } from 'lucide-react';
import { IncidentReport } from '../types';

interface IncidentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (report: IncidentReport) => Promise<void>;
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
  const [category, setCategory] = useState<IncidentReport['category']>('broken_light');
  const [severity, setSeverity] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('Katraj - Swargate Junction, Pune');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [demoMode, setDemoMode] = useState(true);

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
      id: 'broken_light',
      label: 'Broken / Poor Lighting',
      icon: <LightbulbOff className="w-4 h-4 text-amber-400" />,
      desc: 'Dark road stretches, non-functioning street lamps',
    },
    {
      id: 'unsafe_location',
      label: 'Harassment / Isolated Safety Risk',
      icon: <ShieldAlert className="w-4 h-4 text-rose-400" />,
      desc: 'Unsafe gathering, eve-teasing, deserted area',
    },
    {
      id: 'accident',
      label: 'Accident-prone Zone',
      icon: <AlertTriangle className="w-4 h-4 text-red-500" />,
      desc: 'A hazardous turn or modelled high-risk cell; no crash count is claimed',
    },
    {
      id: 'road_damage',
      label: 'Severe Road Hazard',
      icon: <Construction className="w-4 h-4 text-orange-400" />,
      desc: 'Deep potholes, unpaved road, open manhole',
    },
    {
      id: 'traffic_problem',
      label: 'Traffic Problem',
      icon: <EyeOff className="w-4 h-4 text-purple-400" />,
      desc: 'Gridlock, dangerous merging or blocked traffic',
    },
    {
      id: 'helpful_safe_place',
      label: 'Helpful Safe Place',
      icon: <Check className="w-4 h-4 text-emerald-500" />,
      desc: 'A staffed or visible place where someone could seek help',
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!pinnedLocation) { setRateLimitError('Pin the incident on the map first. Your live GPS must be within 150 m.'); return; }
    setRateLimitError(null);
    setIsSubmitting(true);
    const newReport: IncidentReport = {
      id: `incident-${Date.now()}`,
      category,
      severity,
      description: description || `Reported ${category.replace('_', ' ')} incident near ${address}`,
      lat: pinnedLocation ? pinnedLocation.lat : 18.458,
      lon: pinnedLocation ? pinnedLocation.lon : 73.828,
      address,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      demo_mode: demoMode,
    };

    try {
      await onSubmit(newReport);
      setIsSuccess(true);
    setTimeout(() => {
      setIsSuccess(false);
      onClose();
    }, 1800);
    } catch (error) {
      setRateLimitError(error instanceof Error ? error.message : 'Report failed. Please retry.');
    } finally { setIsSubmitting(false); }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 pt-[env(safe-area-inset-top)] backdrop-blur-sm sm:items-center sm:p-4"
    >
      <div className="relative max-h-[calc(100dvh-env(safe-area-inset-top))] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl">
        {/* Modal Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-slate-50/95 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-rose-50 border border-rose-200">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <h2 id="modal-title" className="text-base font-bold text-slate-900">Report Urban Safety Hazard</h2>
              <p className="text-xs text-slate-500">Crowdsource Pune road condition & lighting alerts</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {rateLimitError && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2 animate-in fade-in duration-200">
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
            <span>{rateLimitError}</span>
          </div>
        )}

        {isSuccess ? (
          <div className="p-12 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-md">
              <Check className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Hazard Reported Successfully</h3>
            <p className="text-xs text-slate-500 max-w-xs">
              Report accepted. The public map shows an approximate 250 m cell. Routes have been recalculated with its decaying hazard impact.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 p-4 text-sm sm:p-6">
            {/* Category Select */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
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
                          ? 'bg-blue-50/70 border-blue-500 text-slate-900 shadow-sm ring-1 ring-blue-500/50'
                          : 'bg-slate-50/80 border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <div className="mt-0.5">{c.icon}</div>
                      <div>
                        <div className="text-xs font-semibold">{c.label}</div>
                        <div className="text-[10px] text-slate-500 leading-tight mt-0.5">{c.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Severity Rating */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Severity Level (1 to 5)
                </label>
                <span className="text-xs font-mono font-bold text-amber-600">
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
                          ? 'bg-rose-600 text-white border-rose-600 shadow-md'
                          : lvl >= 3
                          ? 'bg-amber-500 text-white border-amber-500 shadow-md'
                          : 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300 hover:text-slate-900'
                    }`}
                  >
                    Level {lvl}
                  </button>
                ))}
              </div>
            </div>

            {/* Location Indicator & Pinning trigger */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Incident Location
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Enter landmark or intersection..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <button
                  type="button"
                  onClick={onStartPinning}
                  className="flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                >
                  <MapPin className="w-3.5 h-3.5 text-rose-500" />
                  <span>{pinnedLocation ? 'Pin Updated' : 'Pin On Map'}</span>
                </button>
              </div>
              {pinnedLocation ? (
                <span className="text-[10px] font-mono text-emerald-600 mt-1 block">
                  ✓ Geotag: {pinnedLocation.lat.toFixed(4)}, {pinnedLocation.lon.toFixed(4)} (Direct Street Coordinate)
                </span>
              ) : (
                <span className="text-[10px] font-mono text-slate-400 mt-1 block">
                  Tip: Click &apos;Pin On Map&apos; to drop marker directly onto any road segment or junction.
                </span>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Observations / Details (Optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="E.g. Street lamps out for 300 meters near Katraj bridge underpass; poor visibility for two-wheelers..."
                rows={2}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors resize-none"
              />
            </div>

            <label className="flex items-start gap-2 p-3 rounded-xl bg-violet-50 border border-violet-200 text-xs text-violet-900">
              <input type="checkbox" checked={demoMode} onChange={e => setDemoMode(e.target.checked)} className="mt-0.5" />
              <span><b>Hackathon demo report</b><br/><span className="text-[10px] text-violet-700">Stores a clearly labelled local, unverified report without requesting live GPS. Turn off for proximity-gated community reporting.</span></span>
            </label>

            {/* Actions */}
            <div className="flex items-center justify-end space-x-2 border-t border-slate-100 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 rounded-xl px-4 text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit" disabled={isSubmitting}
                className="min-h-11 rounded-xl bg-rose-600 px-5 text-sm font-bold text-white shadow-md hover:bg-rose-700 active:scale-95"
              >
                {isSubmitting ? 'Checking location and submitting…' : 'Submit Hazard Report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
