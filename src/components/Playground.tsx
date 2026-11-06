import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Wand2 } from 'lucide-react';
import { CITIES, useAppState, useModel } from '../state';
import { buildFeatures, scale, KT_MAX, type DailyWeather } from '../lib/ml/features';
import { MLP, type MlpJSON } from '../lib/ml/mlp';
import { dayOfYear, extraterrestrialRadiation, hargreavesRadiation } from '../lib/solar';
import { dailyPvEnergy, DEFAULT_SYSTEM } from '../lib/pv';
import { fmt, MJ_TO_KWH } from '../lib/format';
import { Card, CardTitle, LegendItem, SERIES, Slider, TipBox, cx } from './ui';
import NetworkDiagram from './NetworkDiagram';

export interface BrowserModel {
  model: MlpJSON;
  scaler: { mean: number[]; std: number[] };
}

const PRESETS: { name: string; v: Partial<Inputs> }[] = [
  { name: 'Clear winter day', v: { cloudMean: 8, cloudMin: 0, cloudMax: 30, rh: 55, precip: 0, precipHours: 0, tmax: 30, tmin: 20, doy: 15 } },
  { name: 'Hazy summer day', v: { cloudMean: 30, cloudMin: 5, cloudMax: 70, rh: 45, precip: 0, precipHours: 0, tmax: 40, tmin: 28, doy: 135 } },
  { name: 'Monsoon downpour', v: { cloudMean: 97, cloudMin: 80, cloudMax: 100, rh: 92, precip: 45, precipHours: 18, tmax: 28, tmin: 24, doy: 200 } },
  { name: 'Cyclone approaching', v: { cloudMean: 100, cloudMin: 99, cloudMax: 100, rh: 95, precip: 120, precipHours: 24, tmax: 26, tmin: 23, doy: 320 } },
];

interface Inputs {
  cityId: string;
  doy: number;
  cloudMean: number;
  cloudMin: number;
  cloudMax: number;
  rh: number;
  precip: number;
  precipHours: number;
  tmax: number;
  tmin: number;
}

const dateFromDoy = (doy: number) => new Date(Date.UTC(2025, 0, doy)).toISOString().slice(0, 10);

export default function Playground({ browserModel }: { browserModel?: BrowserModel | null }) {
  const { model } = useModel();
  const { place } = useAppState();
  const [inp, setInp] = useState<Inputs>({
    cityId: place.cityId ?? 'chennai',
    doy: dayOfYear(new Date()),
    cloudMean: 45,
    cloudMin: 10,
    cloudMax: 85,
    rh: 70,
    precip: 0,
    precipHours: 0,
    tmax: 33,
    tmin: 25,
  });
  const set = (p: Partial<Inputs>) =>
    setInp((prev) => {
      const n = { ...prev, ...p };
      // Keep the cloud statistics consistent: min <= mean <= max.
      if (p.cloudMean !== undefined) {
        n.cloudMin = Math.min(n.cloudMin, n.cloudMean);
        n.cloudMax = Math.max(n.cloudMax, n.cloudMean);
      }
      if (p.cloudMin !== undefined) n.cloudMean = Math.max(n.cloudMean, n.cloudMin);
      if (p.cloudMax !== undefined) n.cloudMean = Math.min(n.cloudMean, n.cloudMax);
      if (p.tmax !== undefined) n.tmin = Math.min(n.tmin, n.tmax - 1);
      if (p.tmin !== undefined) n.tmax = Math.max(n.tmax, n.tmin + 1);
      if (p.precip !== undefined && p.precip === 0) n.precipHours = 0;
      if (p.precipHours !== undefined && p.precipHours > 0 && n.precip === 0) n.precip = 1;
      return n;
    });

  const city = CITIES.find((c) => c.id === inp.cityId) ?? CITIES[0];
  const site = { lat: city.lat, lon: city.lon, elevation: city.elevation };
  const browserNet = useMemo(() => (browserModel ? MLP.fromJSON(browserModel.model) : null), [browserModel]);

  const weather = (cloudMean = inp.cloudMean): DailyWeather => ({
    date: dateFromDoy(inp.doy),
    tmax: inp.tmax,
    tmin: inp.tmin,
    cloudMean,
    cloudMin: Math.min(inp.cloudMin, cloudMean),
    cloudMax: Math.max(inp.cloudMax, cloudMean),
    rh: inp.rh,
    precip: inp.precip,
    precipHours: inp.precipHours,
  });

  const clamp = (k: number) => Math.min(KT_MAX, Math.max(0.02, k));
  const ra = extraterrestrialRadiation(city.lat, inp.doy);
  const predictEnsemble = (w: DailyWeather) => (model ? model.predictKtFromFeatures(buildFeatures(w, site)) : NaN);
  const predictBrowser = (w: DailyWeather) => (browserNet && browserModel ? clamp(browserNet.predict(scale(buildFeatures(w, site), browserModel.scaler))) : NaN);

  const w = weather();
  const kt = predictEnsemble(w);
  const ktB = predictBrowser(w);
  const ghi = kt * ra;
  const hs = hargreavesRadiation(ra, inp.tmax, inp.tmin, /coastal|island/i.test(city.zone), city.elevation);
  const kwh = Number.isFinite(ghi) ? dailyPvEnergy({ ghi, tmax: inp.tmax, tmin: inp.tmin, lat: city.lat, doy: inp.doy }, { ...DEFAULT_SYSTEM, capacityKw: 1, tiltDeg: Math.round(city.lat) }).kwh : NaN;

  const trace = useMemo(() => {
    if (!model) return null;
    return model.nets[0].trace(scale(buildFeatures(w, site), model.scaler));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, JSON.stringify(inp)]);

  const sweep = useMemo(() => {
    if (!model) return [];
    return Array.from({ length: 21 }, (_, i) => {
      const c = i * 5;
      const ww = weather(c);
      return {
        cloud: c,
        ensemble: predictEnsemble(ww) * ra * MJ_TO_KWH,
        browser: browserNet ? predictBrowser(ww) * ra * MJ_TO_KWH : undefined,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, browserNet, JSON.stringify(inp)]);

  return (
    <Card>
      <CardTitle
        sub="Move the sliders and the neural network re-runs instantly in your browser. Try the presets to see how monsoon cloud cuts solar energy."
        right={
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button key={p.name} onClick={() => set(p.v)} className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink-2 hover:border-acc/40 hover:text-acc">
                <Wand2 className="h-3 w-3" aria-hidden /> {p.name}
              </button>
            ))}
          </div>
        }
      >
        What-if playground
      </CardTitle>
      <div className="grid gap-8 xl:grid-cols-[1fr_1.1fr]">
        <div className="space-y-5">
          <div>
            <label htmlFor="pg-city" className="mb-1.5 block text-sm font-medium text-ink-2">
              Location
            </label>
            <select id="pg-city" value={inp.cityId} onChange={(e) => set({ cityId: e.target.value })} className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm font-medium outline-none focus:border-acc/60">
              {CITIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}, {c.state} {c.split === 'holdout' ? '(unseen city)' : ''}
                </option>
              ))}
            </select>
          </div>
          <Slider label="Day of year" value={inp.doy} min={1} max={365} onChange={(v) => set({ doy: v })} display={new Date(`${dateFromDoy(inp.doy)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })} />
          <div className="grid gap-5 sm:grid-cols-3">
            <Slider label="Mean cloud" value={inp.cloudMean} min={0} max={100} onChange={(v) => set({ cloudMean: v })} display={`${inp.cloudMean}%`} />
            <Slider label="Min cloud" value={inp.cloudMin} min={0} max={100} onChange={(v) => set({ cloudMin: v })} display={`${inp.cloudMin}%`} />
            <Slider label="Max cloud" value={inp.cloudMax} min={0} max={100} onChange={(v) => set({ cloudMax: v })} display={`${inp.cloudMax}%`} />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Slider label="Max temperature" value={inp.tmax} min={-5} max={48} step={0.5} onChange={(v) => set({ tmax: v })} display={`${inp.tmax} °C`} />
            <Slider label="Min temperature" value={inp.tmin} min={-15} max={35} step={0.5} onChange={(v) => set({ tmin: v })} display={`${inp.tmin} °C`} />
            <Slider label="Relative humidity" value={inp.rh} min={10} max={100} onChange={(v) => set({ rh: v })} display={`${inp.rh}%`} />
            <Slider label="Rainfall" value={inp.precip} min={0} max={150} onChange={(v) => set({ precip: v })} display={`${inp.precip} mm`} />
            <Slider label="Hours of rain" value={inp.precipHours} min={0} max={24} onChange={(v) => set({ precipHours: v })} display={`${inp.precipHours} h`} />
          </div>
        </div>

        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 p-4 text-white shadow-lg shadow-orange-500/20">
              <div className="text-xs font-medium text-white/85">Network's sky clearness</div>
              <div className="font-display text-3xl font-bold">{fmt(kt, 2)}</div>
              <div className="text-xs text-white/85">{fmt(kt * 100, 0)}% of sunlight gets through</div>
            </div>
            <div className="rounded-2xl bg-surface-2 p-4">
              <div className="text-xs font-medium text-ink-2">Solar energy (GHI)</div>
              <div className="font-display text-3xl font-bold">{fmt(ghi * MJ_TO_KWH, 2)}</div>
              <div className="text-xs text-muted">kWh/m² · Hargreaves says {fmt(hs * MJ_TO_KWH, 2)}</div>
            </div>
            <div className="rounded-2xl bg-surface-2 p-4">
              <div className="text-xs font-medium text-ink-2">From 1 kWp of panels</div>
              <div className="font-display text-3xl font-bold">{fmt(kwh, 2)}</div>
              <div className="text-xs text-muted">kWh that day</div>
            </div>
          </div>
          {browserNet && (
            <div className="rounded-xl border border-violet-400/30 bg-violet-400/10 px-4 py-2.5 text-sm text-violet-200">
              Your browser-trained network predicts <strong>Kt = {fmt(ktB, 2)}</strong> ({fmt(ktB * ra * MJ_TO_KWH, 2)} kWh/m²) for the same inputs.
            </div>
          )}
          <div>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-ink">Sensitivity: sunlight vs. mean cloud cover</div>
              <div className="flex gap-3">
                <LegendItem color={SERIES.ml} label="Shipped ensemble" />
                {browserNet && <LegendItem color={SERIES.violet} label="Your network" dashed />}
              </div>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sweep} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="cloud" type="number" domain={[0, 100]} unit="%" tickLine={false} axisLine={{ stroke: SERIES.axis }} ticks={[0, 25, 50, 75, 100]} />
                  <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => fmt(v, 1)} />
                  <Tooltip content={({ active, payload }) => (active && payload?.length ? <TipBox title={`${(payload[0].payload as { cloud: number }).cloud}% cloud`} rows={payload.map((p) => ({ label: p.name === 'browser' ? 'Your network' : 'Ensemble', value: `${fmt(Number(p.value), 2)} kWh/m²`, color: p.color }))} /> : null)} />
                  <Line dataKey="ensemble" stroke={SERIES.ml} strokeWidth={2} dot={false} isAnimationActive={false} />
                  {browserNet && <Line dataKey="browser" stroke={SERIES.violet} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />}
                  {Number.isFinite(ghi) && <ReferenceDot x={inp.cloudMean} y={ghi * MJ_TO_KWH} r={6} fill={SERIES.ml} stroke="#fff" strokeWidth={2} />}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted">A partial-dependence curve: every other input is held fixed while cloud cover sweeps from 0 to 100%.</p>
          </div>
        </div>
      </div>
      <div className={cx('mt-8 rounded-2xl border border-line bg-paper p-4')}>
        <div className="mb-2 text-sm font-semibold text-ink">Inside network #1 for these inputs: brighter neurons are more active</div>
        <NetworkDiagram trace={trace} output={`Kt ≈ ${fmt(trace ? trace[3][0] : NaN, 2)}`} />
      </div>
    </Card>
  );
}
