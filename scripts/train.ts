/**
 * SuryaCast training & evaluation pipeline.
 *
 *   npm run train
 *
 * Reads the cached Open-Meteo (ERA5) daily data in ml/data/raw, builds features,
 * trains baselines and the from-scratch neural network, evaluates everything on
 * held-out data, and writes the model + report files used by the website.
 */
import fs from 'node:fs';
import path from 'node:path';
import { extraterrestrialRadiation, dayOfYear, hargreavesRadiation } from '../src/lib/solar';
import { DEFAULT_SYSTEM, dailyPvEnergy } from '../src/lib/pv';
import {
  FEATURE_KEYS,
  FEATURE_NAMES,
  KT_MAX,
  N_FEATURES,
  buildFeatures,
  fitScaler,
  scale,
  toMatrix,
  type DailyWeather,
  type Site,
} from '../src/lib/ml/features';
import { MLP, type Activation } from '../src/lib/ml/mlp';
import { fitRidge, predictLinear } from '../src/lib/ml/linear';
import { quantile, regressionMetrics, type Metrics } from '../src/lib/ml/metrics';
import { mulberry32, shuffle } from '../src/lib/ml/rng';
import type { IntervalTable, SuryaModelJSON } from '../src/lib/ml/model';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, 'ml', 'data', 'raw');
const OUT_MODEL = path.join(ROOT, 'public', 'model');
const OUT_DATA = path.join(ROOT, 'public', 'data');
const OUT_SRC = path.join(ROOT, 'src', 'data');
for (const d of [OUT_MODEL, OUT_DATA, path.join(OUT_DATA, 'cities'), OUT_SRC]) fs.mkdirSync(d, { recursive: true });

interface CityMeta {
  id: string;
  name: string;
  state: string;
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
  site: Site;
  ra: number;
  rs: number;
  kt: number;
  x: number[];
}

const cities: CityMeta[] = JSON.parse(fs.readFileSync(path.join(ROOT, 'ml', 'cities.json'), 'utf8'));
const elevations: number[] = [];
const recs: Rec[] = [];
let dropped = 0;

cities.forEach((c, ci) => {
  const j = JSON.parse(fs.readFileSync(path.join(RAW, `${c.id}.json`), 'utf8'));
  const d = j.daily;
  const elevation: number = j.elevation;
  elevations[ci] = elevation;
  const site: Site = { lat: c.lat, lon: c.lon, elevation };
  for (let i = 0; i < d.time.length; i++) {
    const vals = [
      d.shortwave_radiation_sum[i],
      d.temperature_2m_max[i],
      d.temperature_2m_min[i],
      d.cloud_cover_mean[i],
      d.cloud_cover_max[i],
      d.cloud_cover_min[i],
      d.relative_humidity_2m_mean[i],
      d.precipitation_sum[i],
      d.precipitation_hours[i],
    ];
    if (vals.some((v) => v === null || v === undefined || Number.isNaN(v))) {
      dropped++;
      continue;
    }
    const date: string = d.time[i];
    const w: DailyWeather = {
      date,
      tmax: vals[1],
      tmin: vals[2],
      cloudMean: vals[3],
      cloudMax: vals[4],
      cloudMin: vals[5],
      rh: vals[6],
      precip: vals[7],
      precipHours: vals[8],
    };
    const ra = extraterrestrialRadiation(c.lat, dayOfYear(date));
    const rs = vals[0];
    recs.push({
      city: ci,
      date,
      year: Number(date.slice(0, 4)),
      month: Number(date.slice(5, 7)),
      w,
      site,
      ra,
      rs,
      kt: Math.min(KT_MAX, rs / ra),
      x: buildFeatures(w, site),
    });
  }
});

const isTrainCity = (r: Rec) => cities[r.city].split === 'train';
const split = {
  train: recs.filter((r) => isTrainCity(r) && r.year <= 2023),
  val: recs.filter((r) => isTrainCity(r) && r.year === 2024),
  testTime: recs.filter((r) => isTrainCity(r) && r.year === 2025),
  testSpace: recs.filter((r) => !isTrainCity(r)),
};
console.log(
  `records=${recs.length} dropped=${dropped} train=${split.train.length} val=${split.val.length} ` +
    `testTime=${split.testTime.length} testSpace=${split.testSpace.length}`,
);

const scaler = fitScaler(split.train.map((r) => r.x));
const Xof = (rs: Rec[]) => toMatrix(rs.map((r) => r.x), scaler);
const yKt = (rs: Rec[]) => Float64Array.from(rs.map((r) => r.kt));
const clampKt = (k: number) => Math.min(KT_MAX, Math.max(0.02, k));

// ---------------------------------------------------------------- baselines
type Predictor = (r: Rec) => number; // returns Rs in MJ/m2/day

const monthKt = new Array(13).fill(0);
const monthN = new Array(13).fill(0);
for (const r of split.train) {
  monthKt[r.month] += r.kt;
  monthN[r.month]++;
}
for (let m = 1; m <= 12; m++) monthKt[m] /= monthN[m];
const climatology: Predictor = (r) => monthKt[r.month] * r.ra;

const isCoastal = (ci: number) => /coastal|island/i.test(cities[ci].zone);
const hargreaves: Predictor = (r) =>
  hargreavesRadiation(r.ra, r.w.tmax, r.w.tmin, isCoastal(r.city), r.site.elevation);

const ridge = fitRidge(
  split.train.map((r) => scale(r.x, scaler)),
  split.train.map((r) => r.kt),
  1e-4,
);
const linear: Predictor = (r) => clampKt(predictLinear(ridge, scale(r.x, scaler))) * r.ra;

// ---------------------------------------------------------------- neural network
interface Candidate {
  hidden: number[];
  activation: Activation;
}
const ENV = process.env;
const L2 = Number(ENV.L2 ?? 1e-5);
const MAX_EPOCHS = Number(ENV.EPOCHS ?? 150);
const PATIENCE = Number(ENV.PATIENCE ?? 20);
const DRY = ENV.DRY === '1';
const RUN_CV = ENV.CV !== '0';
const candidates: Candidate[] = ENV.ONLY
  ? [{ hidden: ENV.ONLY.split(':')[0].split(',').map(Number), activation: ENV.ONLY.split(':')[1] as Activation }]
  : [
      { hidden: [16], activation: 'tanh' },
      { hidden: [32, 16], activation: 'tanh' },
      { hidden: [64, 32], activation: 'tanh' },
      { hidden: [64, 32], activation: 'relu' },
    ];

const Xtr = Xof(split.train);
const ytr = yKt(split.train);
const Xva = Xof(split.val);
const yva = yKt(split.val);

interface TrainResult {
  net: MLP;
  history: { epoch: number; trainRmse: number; valRmse: number }[];
  bestEpoch: number;
  bestVal: number;
  seconds: number;
}

function trainNet(
  c: Candidate,
  maxEpochs = MAX_EPOCHS,
  patience = PATIENCE,
  seed = 7,
  data: { Xtr: Float64Array; ytr: Float64Array; Xva: Float64Array; yva: Float64Array } = { Xtr, ytr, Xva, yva },
): TrainResult {
  const { Xtr, ytr, Xva, yva } = data;
  const net = new MLP([N_FEATURES, ...c.hidden, 1], c.activation, seed);
  const rand = mulberry32(seed + 1);
  let best = Infinity;
  let bestEpoch = 0;
  let bestNet = net.clone();
  const history: TrainResult['history'] = [];
  const t0 = performance.now();
  for (let e = 1; e <= maxEpochs; e++) {
    const lr = 0.002 * Math.max(0.05, 0.5 * (1 + Math.cos((Math.PI * (e - 1)) / maxEpochs)));
    const trainMse = net.trainEpoch(Xtr, ytr, { batchSize: 64, learningRate: lr, l2: L2 }, rand);
    const pv = net.predictMatrix(Xva, yva.length);
    let se = 0;
    for (let i = 0; i < yva.length; i++) se += (clampKt(pv[i]) - yva[i]) ** 2;
    const valRmse = Math.sqrt(se / yva.length);
    history.push({ epoch: e, trainRmse: Math.sqrt(trainMse), valRmse });
    if (valRmse < best - 1e-6) {
      best = valRmse;
      bestEpoch = e;
      bestNet = net.clone();
    } else if (e - bestEpoch >= patience) break;
  }
  return { net: bestNet, history, bestEpoch, bestVal: best, seconds: (performance.now() - t0) / 1000 };
}

const search: { name: string; params: number; bestEpoch: number; valRmseKt: number; seconds: number }[] = [];
let chosen: { c: Candidate; r: TrainResult } | null = null;
for (const c of candidates) {
  const r = trainNet(c);
  const name = `${N_FEATURES}-${c.hidden.join('-')}-1 (${c.activation})`;
  search.push({ name, params: r.net.parameterCount, bestEpoch: r.bestEpoch, valRmseKt: r.bestVal, seconds: r.seconds });
  console.log(`  ${name}: val RMSE(Kt)=${r.bestVal.toFixed(4)} @epoch ${r.bestEpoch} (${r.seconds.toFixed(1)} s)`);
  if (!chosen || r.bestVal < chosen.r.bestVal) chosen = { c, r };
}
const best = chosen!;
// Final model: an ensemble of networks with the chosen architecture, each
// trained from a different random initialisation and averaged (reduces variance).
const ENSEMBLE = Number(ENV.ENSEMBLE ?? 5);
const members: TrainResult[] = [best.r];
for (let k = 1; k < ENSEMBLE; k++) {
  const r = trainNet(best.c, MAX_EPOCHS, PATIENCE, 7 + 10 * k);
  console.log(`  ensemble member ${k + 1}: val RMSE(Kt)=${r.bestVal.toFixed(4)} @epoch ${r.bestEpoch} (${r.seconds.toFixed(1)} s)`);
  members.push(r);
}
const nets = members.map((m) => m.net);
const net = nets[0];
const ensembleKtScaled = (xs: number[]) => nets.reduce((s, n) => s + n.predict(xs), 0) / nets.length;
const nnKt = (r: Rec) => clampKt(ensembleKtScaled(scale(r.x, scaler)));
const neural: Predictor = (r) => nnKt(r) * r.ra;
console.log(`chosen: ${search.find((s) => s.valRmseKt === best.r.bestVal)!.name}`);

// ---------------------------------------------------------------- prediction intervals
// Split-conformal style 80 % intervals: empirical 10th/90th percentiles of the
// residual (actual Kt - predicted Kt), binned by predicted Kt.
const edges = [0, 0.25, 0.35, 0.45, 0.55, 0.62, 1];
const binOf = (k: number) => {
  for (let i = 0; i < edges.length - 1; i++) if (k < edges[i + 1]) return i;
  return edges.length - 2;
};
function intervalTable(pairs: { kt: number; pred: number }[]): IntervalTable {
  const bins: number[][] = edges.slice(0, -1).map(() => []);
  for (const p of pairs) bins[binOf(p.pred)].push(p.kt - p.pred);
  bins.forEach((b) => b.sort((a, c) => a - c));
  return { edges, lo: bins.map((b) => quantile(b, 0.1)), hi: bins.map((b) => quantile(b, 0.9)), level: 0.8 };
}
// (a) Places the network was trained on: residuals on the 2024 validation year.
const intervals = intervalTable(split.val.map((r) => ({ kt: r.kt, pred: nnKt(r) })));

// (b) New places: 5-fold leave-cities-out cross-validation on the 30 training
// cities. Each fold trains a fresh network without 6 cities and measures its
// errors on those unseen cities (2021-2024). This also estimates how well the
// approach generalises to new locations.
const trainCityIdx = cities.map((c, i) => (c.split === 'train' ? i : -1)).filter((i) => i >= 0);
const cvRand = mulberry32(31);
const shuffledCities = trainCityIdx.slice();
shuffle(shuffledCities, cvRand);
const FOLDS = 5;
const cvFolds: { cities: string[]; r2: number; mae: number; n: number }[] = [];
const oocPairs: { kt: number; pred: number }[] = [];
if (RUN_CV) {
  for (let f = 0; f < FOLDS; f++) {
    const outCities = new Set(shuffledCities.filter((_, i) => i % FOLDS === f));
    const inRecs = recs.filter((r) => isTrainCity(r) && !outCities.has(r.city));
    const fTrain = inRecs.filter((r) => r.year <= 2023);
    const fVal = inRecs.filter((r) => r.year === 2024);
    const fOut = recs.filter((r) => outCities.has(r.city) && r.year <= 2024);
    const fScaler = fitScaler(fTrain.map((r) => r.x));
    const M = (rs: Rec[]) => toMatrix(rs.map((r) => r.x), fScaler);
    const res = trainNet(best.c, MAX_EPOCHS, PATIENCE, 100 + f, { Xtr: M(fTrain), ytr: yKt(fTrain), Xva: M(fVal), yva: yKt(fVal) });
    const preds = fOut.map((r) => clampKt(res.net.predict(scale(r.x, fScaler))));
    fOut.forEach((r, i) => oocPairs.push({ kt: r.kt, pred: preds[i] }));
    const m = regressionMetrics(fOut.map((r) => r.rs), fOut.map((r, i) => preds[i] * r.ra));
    cvFolds.push({ cities: [...outCities].map((i) => cities[i].name), r2: m.r2, mae: m.mae, n: m.n });
    console.log(`  CV fold ${f + 1}: R2=${m.r2.toFixed(3)} MAE=${m.mae.toFixed(3)} (${res.seconds.toFixed(0)} s)`);
  }
}
const intervalsNewSite = RUN_CV ? intervalTable(oocPairs) : intervals;

function intervalCoverage(rs: Rec[], table: IntervalTable): number {
  let inside = 0;
  for (const r of rs) {
    const k = nnKt(r);
    const bin = binOf(k);
    const lo = clampKt(k + table.lo[bin]) * r.ra;
    const hi = clampKt(k + table.hi[bin]) * r.ra;
    if (r.rs >= lo - 1e-9 && r.rs <= hi + 1e-9) inside++;
  }
  return inside / rs.length;
}

// ---------------------------------------------------------------- evaluation
const models: { key: string; name: string; kind: string; fn: Predictor }[] = [
  { key: 'climatology', name: 'Monthly climatology', kind: 'Statistical baseline', fn: climatology },
  { key: 'hargreaves', name: 'Hargreaves-Samani (FAO-56)', kind: 'Empirical physics formula', fn: hargreaves },
  { key: 'linear', name: 'Ridge linear regression', kind: 'Linear ML', fn: linear },
  { key: 'mlp', name: 'SuryaCast neural network', kind: 'Neural network (ours)', fn: neural },
];

const round = (v: number, d = 3) => Number(v.toFixed(d));
const roundMetrics = (m: Metrics) => ({
  n: m.n,
  mae: round(m.mae),
  rmse: round(m.rmse),
  mbe: round(m.mbe),
  r2: round(m.r2, 4),
  nrmse: round(m.nrmse, 2),
});

const evalSplits = { val: split.val, testTime: split.testTime, testSpace: split.testSpace } as const;
const results: Record<string, Record<string, ReturnType<typeof roundMetrics>>> = {};
for (const m of models) {
  results[m.key] = {};
  for (const [sk, rs] of Object.entries(evalSplits)) {
    results[m.key][sk] = roundMetrics(regressionMetrics(rs.map((r) => r.rs), rs.map(m.fn)));
  }
}
console.table(
  models.map((m) => ({
    model: m.name,
    'R2 time': results[m.key].testTime.r2,
    'MAE time': results[m.key].testTime.mae,
    'R2 space': results[m.key].testSpace.r2,
    'MAE space': results[m.key].testSpace.mae,
  })),
);

// Per-city errors for the neural network and Hargreaves on unseen data.
const perCity = cities.map((c, ci) => {
  const rs = c.split === 'train' ? split.testTime.filter((r) => r.city === ci) : split.testSpace.filter((r) => r.city === ci);
  const nn = regressionMetrics(rs.map((r) => r.rs), rs.map(neural));
  const hs = regressionMetrics(rs.map((r) => r.rs), rs.map(hargreaves));
  return {
    id: c.id,
    name: c.name,
    split: c.split,
    period: c.split === 'train' ? '2025' : '2021-2025',
    n: rs.length,
    mlpMae: round(nn.mae),
    mlpR2: round(nn.r2, 3),
    hargreavesMae: round(hs.mae),
  };
});

// Monthly error profile on all unseen data (monsoon months are hardest).
const unseen = [...split.testTime, ...split.testSpace];
const monthly = Array.from({ length: 12 }, (_, i) => {
  const rs = unseen.filter((r) => r.month === i + 1);
  const m = (fn: Predictor) => round(regressionMetrics(rs.map((r) => r.rs), rs.map(fn)).mae);
  return {
    month: i + 1,
    mlp: m(neural),
    hargreaves: m(hargreaves),
    linear: m(linear),
    climatology: m(climatology),
    meanRs: round(rs.reduce((s, r) => s + r.rs, 0) / rs.length, 2),
  };
});

// Permutation feature importance on unseen cities (increase in RMSE, MJ/m2/day).
const permRand = mulberry32(99);
const baseRmse = regressionMetrics(split.testSpace.map((r) => r.rs), split.testSpace.map(neural)).rmse;
const importance = FEATURE_NAMES.map((name, j) => {
  let inc = 0;
  const repeats = 3;
  for (let rep = 0; rep < repeats; rep++) {
    const col = split.testSpace.map((r) => r.x[j]);
    shuffle(col, permRand);
    const preds = split.testSpace.map((r, i) => {
      const x = r.x.slice();
      x[j] = col[i];
      return clampKt(ensembleKtScaled(scale(x, scaler))) * r.ra;
    });
    inc += regressionMetrics(split.testSpace.map((r) => r.rs), preds).rmse - baseRmse;
  }
  return { feature: name, key: FEATURE_KEYS[j], rmseIncrease: round(inc / repeats) };
}).sort((a, b) => b.rmseIncrease - a.rmseIncrease);

// Scatter sample of unseen-city predictions.
const scatterRand = mulberry32(5);
const scatterPool = split.testSpace.slice();
shuffle(scatterPool, scatterRand);
const scatter = scatterPool.slice(0, 700).map((r) => ({
  actual: round(r.rs, 2),
  mlp: round(neural(r), 2),
  hargreaves: round(hargreaves(r), 2),
  city: cities[r.city].name,
  date: r.date,
}));

// Example time series: one unseen city through the 2025 monsoon.
const seriesCity = cities.findIndex((c) => c.id === 'coimbatore');
const series = split.testSpace
  .filter((r) => r.city === seriesCity && r.date >= '2025-04-01' && r.date <= '2025-10-31')
  .map((r) => ({
    date: r.date,
    actual: round(r.rs, 2),
    mlp: round(neural(r), 2),
    hargreaves: round(hargreaves(r), 2),
    cloud: r.w.cloudMean,
  }));

// Specific yield of a default 1 kWp rooftop system in every city (2025 ERA5 radiation).
const yields = cities.map((c, ci) => {
  const days = recs.filter((r) => r.city === ci && r.year === 2025);
  const sys = { ...DEFAULT_SYSTEM, capacityKw: 1, tiltDeg: Math.round(c.lat) };
  const kwh = days.reduce(
    (s, r) => s + dailyPvEnergy({ ghi: r.rs, tmax: r.w.tmax, tmin: r.w.tmin, lat: c.lat, doy: dayOfYear(r.date) }, sys).kwh,
    0,
  );
  const ghiKwh = days.reduce((s, r) => s + r.rs, 0) / 3.6;
  return { id: c.id, name: c.name, kwhPerKwp: Math.round(kwh), ghiKwhPerM2: Math.round(ghiKwh), days: days.length };
});
console.log('specific yield kWh/kWp (2025):', yields.map((y) => `${y.name}:${y.kwhPerKwp}`).join(', '));

// ---------------------------------------------------------------- write outputs
function roundTable(t: IntervalTable): IntervalTable {
  return { ...t, lo: t.lo.map((v) => round(v, 4)), hi: t.hi.map((v) => round(v, 4)) };
}
const modelJson: SuryaModelJSON = {
  name: 'SuryaCast solar radiation network',
  version: '1.0.0',
  trainedAt: new Date().toISOString(),
  featureNames: [...FEATURE_NAMES],
  scaler: { mean: scaler.mean.map((v) => round(v, 6)), std: scaler.std.map((v) => round(v, 6)) },
  ensemble: nets.map((n) => n.toJSON(7)),
  intervals: roundTable(intervals),
  intervalsNewSite: roundTable(intervalsNewSite),
  trainSites: cities.filter((c) => c.split === 'train').map((c) => [c.lat, c.lon]),
};
if (DRY) {
  console.log('DRY run: no files written');
  process.exit(0);
}
fs.writeFileSync(path.join(OUT_MODEL, 'suryacast-mlp.json'), JSON.stringify(modelJson));

const chosenName = `${N_FEATURES}-${best.c.hidden.join('-')}-1 (${best.c.activation})`;
const report = {
  generatedAt: new Date().toISOString(),
  dataset: {
    source: 'ERA5 reanalysis (ECMWF) daily aggregates via the Open-Meteo Historical Weather API',
    period: '2021-01-01 to 2025-12-31',
    cities: cities.length,
    trainCities: cities.filter((c) => c.split === 'train').length,
    holdoutCities: cities.filter((c) => c.split === 'holdout').map((c) => c.name),
    records: recs.length,
    dropped,
    splits: Object.fromEntries(Object.entries(split).map(([k, v]) => [k, v.length])),
    features: FEATURE_NAMES,
    target: 'Daily clearness index Kt = Rs / Ra (Rs = shortwave radiation sum, MJ/m2/day)',
  },
  network: {
    architecture: chosenName,
    parameters: net.parameterCount,
    ensembleSize: nets.length,
    members: members.map((m) => ({ bestEpoch: m.bestEpoch, valRmseKt: round(m.bestVal, 4), seconds: round(m.seconds, 1) })),
    bestEpoch: best.r.bestEpoch,
    trainingSeconds: round(members.reduce((s, m) => s + m.seconds, 0), 1),
    optimizer: `Adam (lr 0.002, cosine decay), batch 64, L2 ${L2}, early stopping on the 2024 validation year`,
    history: best.r.history.map((h) => ({ epoch: h.epoch, trainRmse: round(h.trainRmse, 4), valRmse: round(h.valRmse, 4) })),
    search: search.map((s) => ({ ...s, valRmseKt: round(s.valRmseKt, 4), seconds: round(s.seconds, 1) })),
  },
  models: models.map((m) => ({ key: m.key, name: m.name, kind: m.kind, metrics: results[m.key] })),
  intervals: {
    level: 0.8,
    coverage: {
      val: round(intervalCoverage(split.val, intervals), 3),
      testTime: round(intervalCoverage(split.testTime, intervals), 3),
      testSpace: round(intervalCoverage(split.testSpace, intervalsNewSite), 3),
      testSpaceNarrow: round(intervalCoverage(split.testSpace, intervals), 3),
    },
  },
  crossValidation: {
    folds: cvFolds.map((f) => ({ ...f, r2: round(f.r2, 4), mae: round(f.mae) })),
    meanR2: cvFolds.length ? round(cvFolds.reduce((s, f) => s + f.r2, 0) / cvFolds.length, 4) : null,
    sdR2: cvFolds.length
      ? round(Math.sqrt(cvFolds.reduce((s, f, _, a) => s + (f.r2 - a.reduce((t, g) => t + g.r2, 0) / a.length) ** 2, 0) / cvFolds.length), 4)
      : null,
    meanMae: cvFolds.length ? round(cvFolds.reduce((s, f) => s + f.mae, 0) / cvFolds.length) : null,
  },
  perCity,
  monthly,
  importance,
  scatter,
  series: { city: cities[seriesCity].name, points: series },
  yields,
  ridge: { weights: ridge.weights.map((w) => round(w, 5)), bias: round(ridge.bias, 5) },
};
fs.writeFileSync(path.join(OUT_SRC, 'model-report.json'), JSON.stringify(report));

// City metadata for the website.
fs.writeFileSync(
  path.join(OUT_SRC, 'cities.json'),
  JSON.stringify(cities.map((c, ci) => ({ ...c, elevation: elevations[ci] }))),
);

// Per-city daily history (for the annual planner): [dayIndexFrom2021-01-01, ghi, tmax, tmin].
const base = Date.UTC(2021, 0, 1);
cities.forEach((c, ci) => {
  const rows = recs
    .filter((r) => r.city === ci)
    .map((r) => [Math.round((Date.parse(`${r.date}T00:00:00Z`) - base) / 86_400_000), round(r.rs, 2), r.w.tmax, r.w.tmin]);
  fs.writeFileSync(
    path.join(OUT_DATA, 'cities', `${c.id}.json`),
    JSON.stringify({ id: c.id, name: c.name, lat: c.lat, lon: c.lon, elevation: elevations[ci], start: '2021-01-01', rows }),
  );
});

// Compact raw dataset for the in-browser training lab.
const labRand = mulberry32(2026);
const sample = (rs: Rec[], n: number) => {
  const copy = rs.slice();
  shuffle(copy, labRand);
  return copy.slice(0, n);
};
const lab = { train: sample(split.train, 9000), val: sample(split.val, 2500), test: sample(split.testSpace, 3000) };
const pack = (rs: Rec[]) =>
  rs.map((r) => [
    r.city,
    Math.round((Date.parse(`${r.date}T00:00:00Z`) - base) / 86_400_000),
    r.w.tmax,
    r.w.tmin,
    r.w.cloudMean,
    r.w.cloudMax,
    r.w.cloudMin,
    r.w.rh,
    r.w.precip,
    r.w.precipHours,
    round(r.rs, 2),
  ]);
fs.writeFileSync(
  path.join(OUT_DATA, 'train-lab.json'),
  JSON.stringify({
    start: '2021-01-01',
    columns: ['city', 'day', 'tmax', 'tmin', 'cloudMean', 'cloudMax', 'cloudMin', 'rh', 'precip', 'precipHours', 'rs'],
    cities: cities.map((c, ci) => ({ id: c.id, name: c.name, lat: c.lat, lon: c.lon, elevation: elevations[ci], zone: c.zone })),
    train: pack(lab.train),
    val: pack(lab.val),
    test: pack(lab.test),
  }),
);

// Feature table for the independent scikit-learn cross-check (ml/crosscheck.py).
// 'ra' is already one of the features, so it is not repeated next to the target.
const csvRows = [['split', 'city', 'date', ...FEATURE_KEYS, 'rs', 'kt'].join(',')];
for (const [sk, rs] of Object.entries(split)) {
  for (const r of rs) csvRows.push([sk, cities[r.city].id, r.date, ...r.x.map((v) => round(v, 6)), r.rs, round(r.kt, 5)].join(','));
}
fs.writeFileSync(path.join(ROOT, 'ml', 'data', 'features.csv'), csvRows.join('\n'));

console.log('wrote public/model/suryacast-mlp.json, src/data/model-report.json, public/data/*, ml/data/features.csv');
