import React, { useEffect, useState } from 'react';
import lighting from '../../../backend/data/pmc_streetlights_source.json';

// City-centre forecast: does not send the traveller's GPS or chosen endpoints.
const forecastUrl = 'https://api.open-meteo.com/v1/forecast?latitude=18.5204&longitude=73.8567&hourly=precipitation_probability,precipitation,visibility&timezone=Asia%2FKolkata&forecast_days=7';

export interface WeatherContext { label: string; rainMm: number | null; visibilityKm: number | null; available: boolean; }
export function TripConditions({ date, time, onConditionChange }: { date: string; time: string; onConditionChange?: (value: WeatherContext) => void }) {
  const [forecast, setForecast] = useState<any>(null);
  const [status, setStatus] = useState('Loading Pune forecast…');
  const [ward, setWard] = useState('Aundh');
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    fetch(forecastUrl, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => { setForecast(data.hourly); setStatus(''); })
      .catch(() => setStatus('Forecast unavailable. Check local conditions before departure.'))
      .finally(() => clearTimeout(timeout));
    return () => { controller.abort(); clearTimeout(timeout); };
  }, []);
  const index = forecast?.time?.indexOf(`${date}T${time.slice(0, 2)}:00`) ?? -1;
  const row = lighting.rows.find(r => r[0] === ward)!;
  const rain = index >= 0 ? forecast.precipitation?.[index] : null;
  const visibility = index >= 0 ? forecast.visibility?.[index] : null;
  useEffect(() => {
    onConditionChange?.({
      label: index < 0 ? 'Forecast unavailable' : rain > 0 ? 'Rain forecast' : visibility != null && visibility < 3000 ? 'Low visibility' : 'No rain forecast',
      rainMm: rain ?? null, visibilityKm: visibility == null ? null : visibility / 1000, available: index >= 0,
    });
  }, [index, rain, visibility, onConditionChange]);
  return <section className="rounded-xl border border-blue-100 bg-white p-3 space-y-3 text-xs" aria-label="Trip conditions">
    <div>
      <h2 className="font-bold text-slate-800">Before you leave</h2>
      <p className="mt-1 text-slate-600">{status || (index < 0 ? 'Selected departure is outside the available forecast.' :
        `Pune forecast at ${time.slice(0, 2)}:00 IST: ${rain == null ? 'rain unknown' : `${rain} mm rain`}; ${visibility == null ? 'visibility unknown' : `${(visibility / 1000).toFixed(1)} km visibility`}.`)}</p>
      {rain > 0 && <p className="mt-1 text-amber-800">Rain is forecast. Allow extra time and check for waterlogging along your journey.</p>}
      <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="text-blue-700 underline text-[10px]">Weather data by Open-Meteo</a>
      <p className="text-[10px] text-slate-500">City forecast; street conditions may differ. Weather does not alter RSS.</p>
    </div>
    <details>
      <summary className="cursor-pointer font-semibold">Explore published ward lighting</summary>
      <label className="block mt-2">Municipal ward
        <select value={ward} onChange={e => setWard(e.target.value)} className="block w-full p-2 mt-1 border rounded-lg bg-white">
          {lighting.rows.map(r => <option key={r[0]}>{r[0]}</option>)}
        </select>
      </label>
      <p className="mt-2">{Number(row[1]).toLocaleString()} poles · {row[4]} km roads · {row[5]} reported lights/km</p>
      <p className="text-slate-500 mt-1">Calculated poles/km: {(Number(row[1]) / Number(row[4])).toFixed(1)}. Observation year unavailable. This ward summary does not indicate functioning lamps on your route.</p>
      <a href={lighting.source_url} target="_blank" rel="noreferrer" className="text-blue-700 underline">PMC / OpenCity source · 15 wards</a>
    </details>
  </section>;
}
