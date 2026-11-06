/**
 * Live data from Open-Meteo (https://open-meteo.com, CC BY 4.0).
 * The forecast API supplies the routine weather variables the neural network
 * needs, plus the weather model's own radiation forecast, which we show only as
 * an independent cross-check.
 */
import type { DailyWeather } from './ml/features';

export interface ForecastDay extends DailyWeather {
  /** Radiation from the numerical weather prediction model (MJ m^-2), for comparison only. */
  nwpGhi: number | null;
  weatherCode: number;
  isPast: boolean;
  isToday: boolean;
}

export interface ForecastResult {
  lat: number;
  lon: number;
  elevation: number;
  timezone: string;
  fetchedAt: string;
  days: ForecastDay[];
  source: 'live' | 'snapshot';
}

const DAILY = [
  'temperature_2m_max',
  'temperature_2m_min',
  'cloud_cover_mean',
  'cloud_cover_max',
  'cloud_cover_min',
  'relative_humidity_2m_mean',
  'precipitation_sum',
  'precipitation_hours',
  'shortwave_radiation_sum',
  'weather_code',
];

const CACHE_MS = 30 * 60 * 1000;

interface RawDaily {
  time: string[];
  [k: string]: (number | null)[] | string[];
}

function parseForecast(j: { latitude: number; longitude: number; elevation: number; timezone: string; daily: RawDaily }, source: ForecastResult['source'], fetchedAt: string): ForecastResult {
  const d = j.daily;
  const num = (k: string, i: number) => (d[k] as (number | null)[])[i];
  // "Today" in the location's own timezone.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: j.timezone || 'Asia/Kolkata' }).format(
    source === 'snapshot' ? new Date(fetchedAt) : new Date(),
  );
  const days: ForecastDay[] = [];
  d.time.forEach((date, i) => {
    const vals = [
      num('temperature_2m_max', i),
      num('temperature_2m_min', i),
      num('cloud_cover_mean', i),
      num('cloud_cover_max', i),
      num('cloud_cover_min', i),
      num('relative_humidity_2m_mean', i),
      num('precipitation_sum', i),
      num('precipitation_hours', i),
    ];
    if (vals.some((v) => v === null || v === undefined)) return;
    const v = vals as number[];
    days.push({
      date,
      tmax: v[0],
      tmin: v[1],
      cloudMean: v[2],
      cloudMax: v[3],
      cloudMin: v[4],
      rh: v[5],
      precip: v[6],
      precipHours: v[7],
      nwpGhi: num('shortwave_radiation_sum', i),
      weatherCode: num('weather_code', i) ?? 0,
      isPast: date < today,
      isToday: date === today,
    });
  });
  return { lat: j.latitude, lon: j.longitude, elevation: j.elevation, timezone: j.timezone, fetchedAt, days, source };
}

export async function fetchForecast(lat: number, lon: number, pastDays = 7, forecastDays = 7): Promise<ForecastResult> {
  const key = `sc-fc:${lat.toFixed(3)},${lon.toFixed(3)},${pastDays},${forecastDays}`;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) {
      const c = JSON.parse(cached) as { at: number; raw: Parameters<typeof parseForecast>[0] };
      if (Date.now() - c.at < CACHE_MS) return parseForecast(c.raw, 'live', new Date(c.at).toISOString());
    }
  } catch {
    /* ignore storage errors */
  }
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=${DAILY.join(',')}&timezone=auto&past_days=${pastDays}&forecast_days=${forecastDays}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather service returned ${res.status}`);
  const raw = await res.json();
  if (!raw.daily) throw new Error(raw.reason || 'Unexpected weather response');
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), raw }));
  } catch {
    /* ignore quota errors */
  }
  return parseForecast(raw, 'live', new Date().toISOString());
}

/** Bundled snapshot (Chennai) so the model can still be demonstrated offline. */
export async function loadSnapshot(): Promise<ForecastResult> {
  const res = await fetch('/data/forecast-snapshot.json');
  const j = await res.json();
  return parseForecast(j.raw, 'snapshot', j.fetchedAt);
}

export interface HistoryData {
  lat: number;
  lon: number;
  elevation: number;
  start: string;
  /** [dayIndex since start, ghi MJ/m2, tmax, tmin] */
  rows: [number, number, number, number][];
  source: 'bundled' | 'live';
}

/** Five years (2021-2025) of daily ERA5 radiation and temperature. */
export async function loadHistory(place: { cityId?: string; lat: number; lon: number }): Promise<HistoryData> {
  if (place.cityId) {
    const res = await fetch(`/data/cities/${place.cityId}.json`);
    const j = await res.json();
    return { ...j, source: 'bundled' };
  }
  const key = `sc-hist:${place.lat.toFixed(2)},${place.lon.toFixed(2)}`;
  try {
    const cached = localStorage.getItem(key);
    if (cached) return JSON.parse(cached);
  } catch {
    /* ignore */
  }
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${place.lat}&longitude=${place.lon}` +
    `&start_date=2021-01-01&end_date=2025-12-31&daily=shortwave_radiation_sum,temperature_2m_max,temperature_2m_min&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Climate archive returned ${res.status}`);
  const j = await res.json();
  const base = Date.UTC(2021, 0, 1);
  const rows: HistoryData['rows'] = [];
  j.daily.time.forEach((t: string, i: number) => {
    const g = j.daily.shortwave_radiation_sum[i];
    const tx = j.daily.temperature_2m_max[i];
    const tn = j.daily.temperature_2m_min[i];
    if (g === null || tx === null || tn === null) return;
    rows.push([Math.round((Date.parse(`${t}T00:00:00Z`) - base) / 86_400_000), g, tx, tn]);
  });
  const out: HistoryData = { lat: place.lat, lon: place.lon, elevation: j.elevation, start: '2021-01-01', rows, source: 'live' };
  try {
    localStorage.setItem(key, JSON.stringify(out));
  } catch {
    /* ignore */
  }
  return out;
}

/** WMO weather interpretation codes -> short label. */
export function weatherLabel(code: number): string {
  if (code === 0) return 'Clear sky';
  if (code === 1) return 'Mainly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog / haze';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain showers';
  if (code >= 85 && code <= 86) return 'Snow showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Mixed';
}
