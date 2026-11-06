import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Leaf, Zap } from 'lucide-react';
import { useAppState, useModel } from '../state';
import { fetchForecast, loadSnapshot, type ForecastResult } from '../lib/openmeteo';
import { runPipeline } from '../lib/pipeline';
import { DEFAULT_SYSTEM } from '../lib/pv';
import { fmt, weekday } from '../lib/format';
import WeatherIcon from './WeatherIcon';
import { CountUp, Scramble } from './motion';

/** Live card: runs the real model on the live forecast for the chosen place. */
export default function HeroLive() {
  const { place, settings, tilt } = useAppState();
  const { model } = useModel();
  const [fc, setFc] = useState<ForecastResult | null>(null);
  useEffect(() => {
    let alive = true;
    fetchForecast(place.lat, place.lon, 0, 7)
      .then((r) => alive && setFc(r))
      .catch(() =>
        loadSnapshot()
          .then((r) => alive && setFc(r))
          .catch(() => undefined),
      );
    return () => {
      alive = false;
    };
  }, [place.lat, place.lon]);

  const rows = useMemo(() => {
    if (!model || !fc) return [];
    const sys = { ...DEFAULT_SYSTEM, capacityKw: settings.capacityKw, tiltDeg: tilt, bosEfficiency: settings.bosEfficiency, tempCoeff: settings.tempCoeff };
    return fc.days
      .filter((d) => !d.isPast)
      .slice(0, 7)
      .map((d) => ({ ...runPipeline(model, d, { lat: fc.lat, lon: fc.lon, elevation: fc.elevation }, sys, settings.tariffRs), code: d.weatherCode, isToday: d.isToday }));
  }, [model, fc, settings, tilt]);

  const max = Math.max(1, ...rows.map((r) => r.kwhHi));
  const total = rows.reduce((s, r) => s + r.kwh, 0);
  const co2 = rows.reduce((s, r) => s + r.co2Kg, 0);

  return (
    <div className="card p-6" data-tilt="4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            {fc?.source === 'snapshot' ? 'Offline snapshot' : 'Live model output'}
          </div>
          <div className="mt-1 font-display text-2xl font-semibold text-ink">
            <Scramble text={place.name} />
          </div>
        </div>
        <div className="text-right font-mono text-[11px] uppercase tracking-widest text-muted">
          {fmt(settings.capacityKw, 1)} kWp
          <br />
          next 7 days
        </div>
      </div>
      <div className="mt-6 flex h-44 items-end gap-2" aria-label="Seven-day solar forecast bars">
        {rows.length
          ? rows.map((r, i) => (
              <div key={r.date} className="group relative flex flex-1 flex-col items-center gap-1.5">
                <span className="font-mono text-[11px] font-semibold text-ink opacity-0 transition group-hover:opacity-100">{fmt(r.kwh, 1)}</span>
                <div className="relative w-full" style={{ height: `${(r.kwhHi / max) * 112}px` }}>
                  <div className="absolute inset-x-0 bottom-0 h-full rounded-md border border-dashed border-line-2" />
                  <div
                    className="absolute inset-x-0 bottom-0 origin-bottom rounded-md bg-gradient-to-t from-[#e0621f] to-[#ffc53d]"
                    style={{ height: `${(r.kwh / r.kwhHi) * 100}%`, animation: `bar-grow 1s cubic-bezier(.16,1,.3,1) ${i * 70}ms both` }}
                  />
                </div>
                <WeatherIcon code={r.code} className="h-4 w-4" />
                <span className="font-mono text-[10px] uppercase text-muted">{r.isToday ? 'Today' : weekday(r.date)}</span>
              </div>
            ))
          : Array.from({ length: 7 }, (_, i) => <div key={i} className="skeleton flex-1" style={{ height: `${50 + ((i * 37) % 60)}px` }} />)}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line">
        <div className="bg-bg/90 p-4">
          <div className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-widest text-muted">
            <Zap className="h-3.5 w-3.5 text-acc" aria-hidden /> Electricity
          </div>
          <div className="stat__v mt-2">
            {rows.length ? <CountUp value={total} decimals={1} /> : '—'}
            <small>kWh</small>
          </div>
        </div>
        <div className="bg-bg/90 p-4">
          <div className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-widest text-muted">
            <Leaf className="h-3.5 w-3.5 text-emerald-400" aria-hidden /> CO₂ avoided
          </div>
          <div className="stat__v mt-2">
            {rows.length ? <CountUp value={co2} decimals={1} /> : '—'}
            <small>kg</small>
          </div>
        </div>
      </div>
      <Link to="/forecast" className="btn btn--primary mt-4 w-full" data-cursor="open">
        Open the full forecast <span className="arrow">→</span>
      </Link>
    </div>
  );
}
