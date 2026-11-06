/**
 * Builds src/data/climate.json from the downloaded observational datasets:
 *  - NOAA GML Mauna Loa CO2 (monthly + annual means)
 *  - NASA GISTEMP v4 global land-ocean temperature anomaly (vs 1951-1980)
 *  - NASA POWER annual 2 m temperature for the 38 SuryaCast cities (1981-2025)
 *
 *   npm run prepare-climate
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const G = path.join(ROOT, 'ml', 'data', 'global');
const round = (v: number, d = 3) => Number(v.toFixed(d));

function ols(x: number[], y: number[]) {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = (sxy * sxy) / (sxx * syy);
  // Standard error of the slope.
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (y[i] - (intercept + slope * x[i])) ** 2;
  const se = Math.sqrt(sse / (n - 2) / sxx);
  return { slope, intercept, r2, se, n };
}

const lines = (f: string) =>
  fs
    .readFileSync(path.join(G, f), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#'));

// NOAA monthly: year,month,decimal date,average,deseasonalized,ndays,sdev,unc
const co2Monthly = lines('co2_mm_mlo.csv')
  .slice(1)
  .map((l) => l.split(','))
  .filter((c) => Number(c[3]) > 0)
  .map((c) => [round(Number(c[2]), 3), round(Number(c[3]), 2), round(Number(c[4]), 2)]);

const co2Annual = lines('co2_annmean_mlo.csv')
  .slice(1)
  .map((l) => l.split(','))
  .map((c) => [Number(c[0]), round(Number(c[1]), 2)]);

// GISTEMP: first line is a title, second the header.
const gisLines = fs.readFileSync(path.join(G, 'gistemp.csv'), 'utf8').split(/\r?\n/);
const header = gisLines[1].split(',');
const jd = header.indexOf('J-D');
const gistemp = gisLines
  .slice(2)
  .map((l) => l.split(','))
  .filter((c) => c.length > jd && c[jd] && !c[jd].includes('*'))
  .map((c) => [Number(c[0]), round(Number(c[jd]), 2)]);

// Empirical CO2 -> temperature relation (1959 onwards): T = a + b ln(C / 280).
const co2ByYear = new Map(co2Annual.map(([y, c]) => [y, c]));
const paired = gistemp.filter(([y]) => co2ByYear.has(y)).map(([y, t]) => ({ year: y, co2: co2ByYear.get(y)!, t }));
const fit = ols(
  paired.map((p) => Math.log(p.co2 / 280)),
  paired.map((p) => p.t),
);
const co2Temp = {
  points: paired,
  slope: round(fit.slope, 4),
  intercept: round(fit.intercept, 4),
  r2: round(fit.r2, 4),
  perDoubling: round(fit.slope * Math.LN2, 3),
  perDoublingSe: round(fit.se * Math.LN2, 3),
  n: fit.n,
};

// Berkeley Earth regional series for India: monthly anomalies vs Jan 1951-Dec 1980.
const beText = fs.readFileSync(path.join(G, 'india-TAVG-Trend.txt'), 'utf8');
const beLines = beText.split(/\r?\n/);
const baseline = Number(/absolute temperature \(C\):\s*([\d.]+)/.exec(beText)![1]);
const byYear = new Map<number, number[]>();
for (const l of beLines) {
  if (!l.trim() || l.trim().startsWith('%')) continue;
  const c = l.trim().split(/\s+/);
  const y = Number(c[0]);
  const v = Number(c[2]);
  if (!Number.isFinite(v)) continue;
  if (!byYear.has(y)) byYear.set(y, []);
  byYear.get(y)!.push(v);
}
const indiaSeries = [...byYear.entries()]
  .filter(([, v]) => v.length === 12)
  .map(([y, v]) => [y, round(v.reduce((a, b) => a + b, 0) / 12, 3)] as [number, number])
  .filter(([y]) => y >= 1880)
  .sort((a, b) => a[0] - b[0]);
const trend = (from: number) => {
  const pts = indiaSeries.filter(([y]) => y >= from);
  const f = ols(pts.map((p) => p[0]), pts.map((p) => p[1]));
  return { from, to: pts.at(-1)![0], perDecade: round(f.slope * 10, 3), se: round(f.se * 10, 3), r2: round(f.r2, 3) };
};
const mean = (from: number, to: number) => {
  const pts = indiaSeries.filter(([y]) => y >= from && y <= to);
  return pts.reduce((s, p) => s + p[1], 0) / pts.length;
};

const out = {
  generatedAt: new Date().toISOString(),
  sources: {
    co2: 'NOAA Global Monitoring Laboratory, Mauna Loa CO2 monthly and annual means (Lan, Tans & Thoning)',
    gistemp: 'NASA GISS Surface Temperature Analysis (GISTEMP v4), global land-ocean annual mean anomaly vs 1951-1980',
    india: 'Berkeley Earth regional land temperature series for India (TAVG), anomalies vs Jan 1951-Dec 1980',
  },
  co2Monthly,
  co2Annual,
  gistemp,
  co2Temp,
  india: {
    baselineAbsC: baseline,
    series: indiaSeries,
    trend1901: trend(1901),
    trend1971: trend(1971),
    change: round(mean(2011, 2020) - mean(1901, 1930), 3),
  },
};
fs.writeFileSync(path.join(ROOT, 'src', 'data', 'climate.json'), JSON.stringify(out));
console.log(
  `CO2 ${co2Annual[0][0]}-${co2Annual.at(-1)![0]} (${co2Annual.at(-1)![1]} ppm), GISTEMP to ${gistemp.at(-1)![0]} (${gistemp.at(-1)![1]} C), ` +
    `warming per CO2 doubling (empirical) = ${co2Temp.perDoubling} +/- ${co2Temp.perDoublingSe} C (R2 ${co2Temp.r2})`,
);
console.log('India (Berkeley Earth):', JSON.stringify(out.india.trend1901), JSON.stringify(out.india.trend1971), 'change 1901-30 -> 2011-20:', out.india.change);
