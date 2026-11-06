/** Decodes the compact training-lab dataset (public/data/train-lab.json). */
import { buildFeatures, KT_MAX, type DailyWeather, type Site } from './features';
import { dayOfYear, extraterrestrialRadiation, hargreavesRadiation } from '../solar';

export interface LabCity {
  id: string;
  name: string;
  lat: number;
  lon: number;
  elevation: number;
  zone: string;
}

export interface LabFile {
  start: string;
  columns: string[];
  cities: LabCity[];
  train: number[][];
  val: number[][];
  test: number[][];
}

export interface LabRow {
  x: number[];
  kt: number;
  ra: number;
  rs: number;
  hargreaves: number;
  city: number;
}

export function decodeRows(file: LabFile, rows: number[][]): LabRow[] {
  const base = Date.parse(`${file.start}T00:00:00Z`);
  return rows.map((r) => {
    const [city, day, tmax, tmin, cloudMean, cloudMax, cloudMin, rh, precip, precipHours, rs] = r;
    const c = file.cities[city];
    const date = new Date(base + day * 86_400_000).toISOString().slice(0, 10);
    const w: DailyWeather = { date, tmax, tmin, cloudMean, cloudMax, cloudMin, rh, precip, precipHours };
    const site: Site = { lat: c.lat, lon: c.lon, elevation: c.elevation };
    const ra = extraterrestrialRadiation(c.lat, dayOfYear(date));
    const coastal = /coastal|island/i.test(c.zone);
    return {
      x: buildFeatures(w, site),
      kt: Math.min(KT_MAX, rs / ra),
      ra,
      rs,
      hargreaves: hargreavesRadiation(ra, tmax, tmin, coastal, c.elevation),
      city,
    };
  });
}
