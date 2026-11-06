/** Simulates a rooftop system over five real years of daily weather. */
import { dailyPvEnergy, type PvSystem } from './pv';
import type { HistoryData } from './openmeteo';
import { MJ_PER_KWH } from './solar';

export interface MonthStat {
  month: number; // 1..12
  mean: number; // kWh, mean over years
  min: number;
  max: number;
  ghiKwhM2: number; // mean daily GHI in kWh/m2
  meanTmax: number;
}

export interface PlannerResult {
  years: { year: number; kwh: number; days: number }[];
  monthly: MonthStat[];
  annualKwh: number;
  specificYield: number; // kWh per kWp per year
  capacityFactor: number; // fraction
  ghiAnnualKwhM2: number;
  performanceRatio: number;
  worstYear: number;
  bestYear: number;
}

export function simulateHistory(hist: HistoryData, lat: number, sys: PvSystem): PlannerResult {
  const base = Date.parse(`${hist.start}T00:00:00Z`);
  const perYearMonth = new Map<string, number>();
  const perYear = new Map<number, { kwh: number; days: number; poa: number }>();
  const ghiMonth = Array.from({ length: 13 }, () => ({ sum: 0, n: 0, tmax: 0 }));
  for (const [dayIdx, ghi, tmax, tmin] of hist.rows) {
    const d = new Date(base + dayIdx * 86_400_000);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const doy = Math.floor((d.getTime() - Date.UTC(year, 0, 1)) / 86_400_000) + 1;
    const out = dailyPvEnergy({ ghi, tmax, tmin, lat, doy }, sys);
    const key = `${year}-${month}`;
    perYearMonth.set(key, (perYearMonth.get(key) ?? 0) + out.kwh);
    const y = perYear.get(year) ?? { kwh: 0, days: 0, poa: 0 };
    y.kwh += out.kwh;
    y.days += 1;
    y.poa += out.poaKwh;
    perYear.set(year, y);
    ghiMonth[month].sum += ghi / MJ_PER_KWH;
    ghiMonth[month].tmax += tmax;
    ghiMonth[month].n += 1;
  }
  const fullYears = [...perYear.entries()].filter(([, v]) => v.days >= 360).sort((a, b) => a[0] - b[0]);
  const years = fullYears.map(([year, v]) => ({ year, kwh: v.kwh, days: v.days }));
  const monthly: MonthStat[] = [];
  for (let m = 1; m <= 12; m++) {
    const vals = fullYears.map(([y]) => perYearMonth.get(`${y}-${m}`) ?? 0);
    monthly.push({
      month: m,
      mean: vals.reduce((s, v) => s + v, 0) / Math.max(1, vals.length),
      min: Math.min(...vals),
      max: Math.max(...vals),
      ghiKwhM2: ghiMonth[m].sum / Math.max(1, ghiMonth[m].n),
      meanTmax: ghiMonth[m].tmax / Math.max(1, ghiMonth[m].n),
    });
  }
  const annualKwh = years.reduce((s, y) => s + y.kwh, 0) / Math.max(1, years.length);
  const poaAnnual = fullYears.reduce((s, [, v]) => s + v.poa, 0) / Math.max(1, fullYears.length);
  const ghiAnnualKwhM2 = monthly.reduce((s, m) => s + m.ghiKwhM2 * daysInMonth(m.month), 0);
  return {
    years,
    monthly,
    annualKwh,
    specificYield: annualKwh / sys.capacityKw,
    capacityFactor: annualKwh / (sys.capacityKw * 8760),
    ghiAnnualKwhM2,
    performanceRatio: annualKwh / (sys.capacityKw * poaAnnual),
    worstYear: Math.min(...years.map((y) => y.kwh)),
    bestYear: Math.max(...years.map((y) => y.kwh)),
  };
}

const DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const daysInMonth = (m: number) => DAYS[m - 1];
