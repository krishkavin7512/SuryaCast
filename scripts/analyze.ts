/**
 * Performance & error analysis of the SHIPPED model (public/model/suryacast-mlp.json)
 * on the real held-out data. Writes src/data/performance.json for the website.
 *
 *   npm run analyze
 */
import fs from 'node:fs';
import path from 'node:path';
import { dayOfYear, extraterrestrialRadiation, hargreavesRadiation } from '../src/lib/solar';
import { DEFAULT_SYSTEM, dailyPvEnergy } from '../src/lib/pv';
import { KT_MAX, buildFeatures, scale, type DailyWeather } from '../src/lib/ml/features';
import { SolarModel, type SuryaModelJSON } from '../src/lib/ml/model';
import { predictLinear } from '../src/lib/ml/linear';
import { regressionMetrics } from '../src/lib/ml/metrics';
import { mulberry32 } from '../src/lib/ml/rng';

const ROOT = path.resolve(import.meta.dirname, '..');
const K = 1 / 3.6; // MJ -> kWh
const round = (v: number, d = 3) => Number(v.toFixed(d));

interface City {
  id: string;
  name: string;
  lat: number;
  lon: number;
  zone: string;
  split: 'train' | 'holdout';
}
interface Rec {
  city: number;
  date: string;
  year: number;
  month: number;
  w: DailyWeather;
  ra: number;
  rs: number;
  kt: number;
  x: number[];
  elevation: number;
}

const cities: City[] = JSON.parse(fs.readFileSync(path.join(ROOT, 'ml', 'cities.json'), 'utf8'));
const modelJson: SuryaModelJSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'model', 'suryacast-mlp.json'), 'utf8'));
const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'model-report.json'), 'utf8'));
const model = new SolarModel(modelJson);

// ---------------------------------------------------------------- load real data
const recs: Rec[] = [];
cities.forEach((c, ci) => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'ml', 'data', 'raw', `${c.id}.json`), 'utf8'));
  const d = j.daily;
  for (let i = 0; i < d.time.length; i++) {
    const date: string = d.time[i];
    const w: DailyWeather = {
      date,
      tmax: d.temperature_2m_max[i],
      tmin: d.temperature_2m_min[i],
      cloudMean: d.cloud_cover_mean[i],
      cloudMax: d.cloud_cover_max[i],
      cloudMin: d.cloud_cover_min[i],
      rh: d.relative_humidity_2m_mean[i],
      precip: d.precipitation_sum[i],
      precipHours: d.precipitation_hours[i],
    };
    const rs = d.shortwave_radiation_sum[i];
    if ([rs, ...Object.values(w).slice(1)].some((v) => v === null || v === undefined)) continue;
    const ra = extraterrestrialRadiation(c.lat, dayOfYear(date));
    recs.push({
      city: ci,
      date,
      year: Number(date.slice(0, 4)),
      month: Number(date.slice(5, 7)),
      w,
      ra,
      rs,
      kt: Math.min(KT_MAX, rs / ra),
      x: buildFeatures(w, { lat: c.lat, lon: c.lon, elevation: j.elevation }),
      elevation: j.elevation,
    });
  }
});
const isTrain = (r: Rec) => cities[r.city].split === 'train';
const split = {
  val: recs.filter((r) => isTrain(r) && r.year === 2024),
  testTime: recs.filter((r) => isTrain(r) && r.year === 2025),
  testSpace: recs.filter((r) => !isTrain(r)),
};
const train = recs.filter((r) => isTrain(r) && r.year <= 2023);
const unseen = [...split.testTime, ...split.testSpace];

// ---------------------------------------------------------------- predictors (Rs, MJ/m2/day)
const clampKt = (k: number) => Math.min(KT_MAX, Math.max(0.02, k));
const monthKt = Array.from({ length: 13 }, (_, m) => {
  const rs = train.filter((r) => r.month === m);
  return rs.length ? rs.reduce((s, r) => s + r.kt, 0) / rs.length : 0;
});
type P = (r: Rec) => number;
const predictors: { key: string; name: string; fn: P }[] = [
  { key: 'climatology', name: 'Monthly climatology', fn: (r) => monthKt[r.month] * r.ra },
  { key: 'hargreaves', name: 'Hargreaves–Samani (FAO-56)', fn: (r) => hargreavesRadiation(r.ra, r.w.tmax, r.w.tmin, /coastal|island/i.test(cities[r.city].zone), r.elevation) },
  { key: 'linear', name: 'Ridge linear regression', fn: (r) => clampKt(predictLinear(report.ridge, scale(r.x, model.scaler))) * r.ra },
  { key: 'mlp', name: 'SuryaCast neural network', fn: (r) => model.predictKtFromFeatures(r.x) * r.ra },
];
// Cache predictions.
const pred = new Map<string, Float64Array>();
for (const p of predictors) pred.set(p.key, Float64Array.from(recs.map(p.fn)));
const idx = new Map(recs.map((r, i) => [r, i]));
const P = (key: string, r: Rec) => pred.get(key)![idx.get(r)!];

function pearson(a: number[], b: number[]) {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  return sab / Math.sqrt(saa * sbb);
}

// ---------------------------------------------------------------- full metrics table
const metrics: Record<string, Record<string, Record<string, number>>> = {};
for (const p of predictors) {
  metrics[p.key] = {};
  for (const [sk, rs] of Object.entries(split)) {
    const a = rs.map((r) => r.rs);
    const f = rs.map((r) => P(p.key, r));
    const m = regressionMetrics(a, f);
    const clim = regressionMetrics(a, rs.map((r) => P('climatology', r)));
    const within = (tol: number) => (100 * rs.filter((_, i) => Math.abs(f[i] - a[i]) * K <= tol).length) / rs.length;
    metrics[p.key][sk] = {
      n: m.n,
      mae: round(m.mae * K, 3),
      rmse: round(m.rmse * K, 3),
      mbe: round(m.mbe * K, 3),
      r2: round(m.r2, 4),
      r: round(pearson(a, f), 4),
      nrmse: round(m.nrmse, 2),
      skill: round(1 - (m.rmse * m.rmse) / (clim.rmse * clim.rmse), 4),
      within05: round(within(0.5), 1),
      within10: round(within(1.0), 1),
    };
  }
}
// Consistency check against the training report.
const rep = report.models.find((m: { key: string }) => m.key === 'mlp').metrics;
for (const sk of ['testTime', 'testSpace'] as const) {
  const diff = Math.abs(metrics.mlp[sk].r2 - rep[sk].r2);
  if (diff > 0.002) throw new Error(`Shipped model R2 on ${sk} (${metrics.mlp[sk].r2}) differs from report (${rep[sk].r2})`);
}

// ---------------------------------------------------------------- bootstrap 95% CIs (unseen cities)
const rand = mulberry32(11);
const B = 1000;
function bootstrap(key: string, rs: Rec[]) {
  const n = rs.length;
  const a = rs.map((r) => r.rs);
  const f = rs.map((r) => P(key, r));
  const maes: number[] = [];
  const r2s: number[] = [];
  const ia = new Float64Array(n);
  const ib = new Float64Array(n);
  for (let b = 0; b < B; b++) {
    for (let i = 0; i < n; i++) {
      const k = (rand() * n) | 0;
      ia[i] = a[k];
      ib[i] = f[k];
    }
    const m = regressionMetrics(ia, ib);
    maes.push(m.mae * K);
    r2s.push(m.r2);
  }
  maes.sort((x, y) => x - y);
  r2s.sort((x, y) => x - y);
  const q = (arr: number[], p: number) => arr[Math.floor(p * (arr.length - 1))];
  return { mae: [round(q(maes, 0.025)), round(q(maes, 0.975))], r2: [round(q(r2s, 0.025), 4), round(q(r2s, 0.975), 4)] };
}
const ci = { mlp: bootstrap('mlp', split.testSpace), hargreaves: bootstrap('hargreaves', split.testSpace), linear: bootstrap('linear', split.testSpace) };

// ---------------------------------------------------------------- error by sky condition (all unseen data)
const skyBins = [
  { label: 'Clear', range: '0–20% cloud', lo: 0, hi: 20 },
  { label: 'Partly cloudy', range: '20–50%', lo: 20, hi: 50 },
  { label: 'Mostly cloudy', range: '50–80%', lo: 50, hi: 80 },
  { label: 'Overcast', range: '80–100%', lo: 80, hi: 101 },
];
const bySky = skyBins.map((b) => {
  const rs = unseen.filter((r) => r.w.cloudMean >= b.lo && r.w.cloudMean < b.hi);
  const mae = (key: string) => round(regressionMetrics(rs.map((r) => r.rs), rs.map((r) => P(key, r))).mae * K);
  return { ...b, n: rs.length, share: round((100 * rs.length) / unseen.length, 1), mlp: mae('mlp'), hargreaves: mae('hargreaves'), linear: mae('linear'), meanGhi: round((rs.reduce((s, r) => s + r.rs, 0) / rs.length) * K, 2) };
});

// ---------------------------------------------------------------- residual distribution (unseen cities)
const edges = Array.from({ length: 25 }, (_, i) => -3 + i * 0.25);
function histogram(key: string) {
  const counts = new Array(edges.length - 1).fill(0);
  for (const r of split.testSpace) {
    const e = Math.max(-2.999, Math.min(2.999, (P(key, r) - r.rs) * K));
    counts[Math.min(counts.length - 1, Math.floor((e + 3) / 0.25))]++;
  }
  return counts.map((c) => round((100 * c) / split.testSpace.length, 2));
}
const hm = histogram('mlp');
const hh = histogram('hargreaves');
const residuals = edges.slice(0, -1).map((e, i) => ({ bin: round(e + 0.125, 3), mlp: hm[i], hargreaves: hh[i] }));

// ---------------------------------------------------------------- energy forecast accuracy by horizon (3 kWp)
// Daily errors partly cancel when summed, so weekly and monthly totals are more accurate.
const sys = (lat: number) => ({ ...DEFAULT_SYSTEM, capacityKw: 3, tiltDeg: Math.round(lat) });
const energy = (r: Rec, ghi: number) => dailyPvEnergy({ ghi, tmax: r.w.tmax, tmin: r.w.tmin, lat: cities[r.city].lat, doy: dayOfYear(r.date) }, sys(cities[r.city].lat)).kwh;
function horizon(key: string) {
  const rows = split.testSpace.map((r) => ({ r, act: energy(r, r.rs), pr: energy(r, P(key, r)) }));
  const agg = (groupKey: (r: Rec) => string) => {
    const g = new Map<string, { a: number; p: number }>();
    for (const x of rows) {
      const k = groupKey(x.r);
      const v = g.get(k) ?? { a: 0, p: 0 };
      v.a += x.act;
      v.p += x.pr;
      g.set(k, v);
    }
    const vals = [...g.values()];
    return round((100 * vals.reduce((s, v) => s + Math.abs(v.p - v.a), 0)) / vals.reduce((s, v) => s + v.a, 0), 1);
  };
  const weekOf = (r: Rec) => Math.floor((Date.parse(`${r.date}T00:00:00Z`) - Date.UTC(2021, 0, 4)) / (7 * 86_400_000));
  return {
    daily: agg((r) => `${r.city}-${r.date}`),
    weekly: agg((r) => `${r.city}-${weekOf(r)}`),
    monthly: agg((r) => `${r.city}-${r.date.slice(0, 7)}`),
    yearly: agg((r) => `${r.city}-${r.year}`),
    dailyKwhMae: round(rows.reduce((s, x) => s + Math.abs(x.pr - x.act), 0) / rows.length, 2),
    meanDailyKwh: round(rows.reduce((s, x) => s + x.act, 0) / rows.length, 2),
  };
}
const horizons = { mlp: horizon('mlp'), hargreaves: horizon('hargreaves'), linear: horizon('linear') };

// ---------------------------------------------------------------- by climate zone (all unseen data)
const zones = [...new Set(cities.map((c) => c.zone))];
const byZone = zones
  .map((z) => {
    const rs = unseen.filter((r) => cities[r.city].zone === z);
    const m = (key: string) => regressionMetrics(rs.map((r) => r.rs), rs.map((r) => P(key, r)));
    return { zone: z, n: rs.length, cities: cities.filter((c) => c.zone === z).map((c) => c.name), mlpMae: round(m('mlp').mae * K), mlpR2: round(m('mlp').r2, 3), hsMae: round(m('hargreaves').mae * K) };
  })
  .sort((a, b) => a.mlpMae - b.mlpMae);

// ---------------------------------------------------------------- monsoon vs dry season
const season = (months: number[], label: string) => {
  const rs = unseen.filter((r) => months.includes(r.month));
  const m = (key: string) => regressionMetrics(rs.map((r) => r.rs), rs.map((r) => P(key, r)));
  return { label, n: rs.length, mlpMae: round(m('mlp').mae * K), mlpR2: round(m('mlp').r2, 3), hsMae: round(m('hargreaves').mae * K), hsR2: round(m('hargreaves').r2, 3) };
};
const seasons = [season([12, 1, 2], 'Winter (Dec–Feb)'), season([3, 4, 5], 'Pre-monsoon (Mar–May)'), season([6, 7, 8, 9], 'SW monsoon (Jun–Sep)'), season([10, 11], 'Post-monsoon (Oct–Nov)')];

// ---------------------------------------------------------------- inference cost
const t0 = performance.now();
let sink = 0;
for (let i = 0; i < 20000; i++) sink += model.predictKtFromFeatures(recs[i % recs.length].x);
const usPerPrediction = round(((performance.now() - t0) * 1000) / 20000, 2);

const out = {
  generatedAt: new Date().toISOString(),
  note: 'Computed from the shipped model file on cached ERA5 data. Units: kWh/m2/day unless stated.',
  models: predictors.map((p) => ({ key: p.key, name: p.name, metrics: metrics[p.key] })),
  ci,
  bySky,
  residuals,
  horizons,
  byZone,
  seasons,
  inference: { usPerPrediction, weightsPerNetwork: model.nets[0].parameterCount, networks: model.nets.length, modelKb: round(fs.statSync(path.join(ROOT, 'public', 'model', 'suryacast-mlp.json')).size / 1024, 0) },
  sink: sink > 0,
};
fs.writeFileSync(path.join(ROOT, 'src', 'data', 'performance.json'), JSON.stringify(out));
console.table(predictors.map((p) => ({ model: p.name, 'R2 2025': metrics[p.key].testTime.r2, 'R2 new': metrics[p.key].testSpace.r2, skill: metrics[p.key].testSpace.skill, '±0.5': metrics[p.key].testSpace.within05 })));
console.log('CI', JSON.stringify(ci));
console.table(bySky);
console.log('horizons', JSON.stringify(horizons));
console.table(seasons);
console.log('inference us/pred', usPerPrediction);
