/**
 * Feature engineering shared by the training script (Node) and the website
 * (browser), so a model always sees features computed the same way.
 *
 * The model predicts the daily clearness index Kt = Rs / Ra (the fraction of
 * top-of-atmosphere sunlight that reaches the ground). Radiation is then
 * recovered as Rs = Kt x Ra. Predicting Kt instead of Rs builds the
 * astronomy into the model, so the network only has to learn the effect of the
 * atmosphere (clouds, humidity, rain, haze).
 */
import { dayOfYear, extraterrestrialRadiation } from '../solar';

export interface DailyWeather {
  date: string; // YYYY-MM-DD
  tmax: number; // degC
  tmin: number; // degC
  cloudMean: number; // %
  cloudMax: number; // %
  cloudMin: number; // %
  rh: number; // mean relative humidity %
  precip: number; // mm
  precipHours: number; // h
}

export interface Site {
  lat: number;
  lon: number;
  elevation: number; // m
}

export const FEATURE_NAMES = [
  'Mean cloud cover',
  'Max cloud cover',
  'Min cloud cover',
  'Relative humidity',
  'Rainfall (log)',
  'Rain hours',
  'Diurnal temp. range',
  'Max temperature',
  'Top-of-atmosphere sun (Ra)',
  'Season (sin)',
  'Season (cos)',
  'Latitude',
  'Elevation',
] as const;

export const FEATURE_KEYS = [
  'cloud_mean',
  'cloud_max',
  'cloud_min',
  'rh',
  'log_rain',
  'rain_hours',
  'dtr',
  'tmax',
  'ra',
  'season_sin',
  'season_cos',
  'lat',
  'elev_km',
] as const;

export const N_FEATURES = FEATURE_NAMES.length;

/** Upper bound for a physically plausible daily clearness index. */
export const KT_MAX = 0.85;

export function buildFeatures(w: DailyWeather, site: Site): number[] {
  const doy = dayOfYear(w.date);
  const ra = extraterrestrialRadiation(site.lat, doy);
  const angle = (2 * Math.PI * doy) / 365.25;
  return [
    w.cloudMean / 100,
    w.cloudMax / 100,
    w.cloudMin / 100,
    w.rh / 100,
    Math.log1p(Math.max(0, w.precip)),
    w.precipHours / 24,
    w.tmax - w.tmin,
    w.tmax,
    ra,
    Math.sin(angle),
    Math.cos(angle),
    site.lat,
    site.elevation / 1000,
  ];
}

export interface Scaler {
  mean: number[];
  std: number[];
}

export function fitScaler(rows: number[][]): Scaler {
  const d = rows[0].length;
  const mean = new Array(d).fill(0);
  const std = new Array(d).fill(0);
  for (const r of rows) for (let j = 0; j < d; j++) mean[j] += r[j];
  for (let j = 0; j < d; j++) mean[j] /= rows.length;
  for (const r of rows) for (let j = 0; j < d; j++) std[j] += (r[j] - mean[j]) ** 2;
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j] / rows.length) || 1;
  return { mean, std };
}

export function scale(row: number[], s: Scaler): number[] {
  return row.map((v, j) => (v - s.mean[j]) / s.std[j]);
}

/** Flatten scaled rows into a contiguous Float64Array (row-major) for fast training. */
export function toMatrix(rows: number[][], s: Scaler): Float64Array {
  const d = rows[0].length;
  const out = new Float64Array(rows.length * d);
  rows.forEach((r, i) => {
    for (let j = 0; j < d; j++) out[i * d + j] = (r[j] - s.mean[j]) / s.std[j];
  });
  return out;
}
