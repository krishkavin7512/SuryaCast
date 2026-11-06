/**
 * The complete SuryaCast prediction chain for one day:
 * weather -> neural network (clearness index) -> solar radiation ->
 * tilted panel -> cell temperature -> electricity -> CO2 avoided.
 */
import { dayOfYear, daylightHours, tiltedRadiation, MJ_PER_KWH } from './solar';
import { dailyPvEnergy, type PvSystem } from './pv';
import { INDIA_GRID_EF_KG_PER_KWH } from './carbon';
import type { SolarModel } from './ml/model';
import type { DailyWeather, Site } from './ml/features';

export interface DayResult {
  date: string;
  doy: number;
  weather: DailyWeather;
  ra: number;
  daylight: number;
  kt: number;
  ktLo: number;
  ktHi: number;
  ghi: number;
  ghiLo: number;
  ghiHi: number;
  poaKwh: number;
  diffuseFraction: number;
  cellTemp: number;
  tempFactor: number;
  kwh: number;
  kwhLo: number;
  kwhHi: number;
  co2Kg: number;
  rupees: number;
  nwpGhi: number | null;
  nwpKwh: number | null;
  knownSite: boolean;
}

export function runPipeline(
  model: SolarModel,
  w: DailyWeather & { nwpGhi?: number | null },
  site: Site,
  sys: PvSystem,
  tariffRs: number,
): DayResult {
  const doy = dayOfYear(w.date);
  const p = model.predict(w, site);
  const pvIn = (ghi: number) => ({ ghi, tmax: w.tmax, tmin: w.tmin, lat: site.lat, doy });
  const pv = dailyPvEnergy(pvIn(p.ghi), sys);
  const lo = dailyPvEnergy(pvIn(p.ghiLo), sys);
  const hi = dailyPvEnergy(pvIn(p.ghiHi), sys);
  const nwp = w.nwpGhi != null ? dailyPvEnergy(pvIn(w.nwpGhi), sys) : null;
  const t = tiltedRadiation(p.ghi, site.lat, doy, sys.tiltDeg, sys.albedo);
  return {
    date: w.date,
    doy,
    weather: w,
    ra: p.ra,
    daylight: daylightHours(site.lat, doy),
    kt: p.kt,
    ktLo: p.ghiLo / p.ra,
    ktHi: p.ghiHi / p.ra,
    ghi: p.ghi,
    ghiLo: p.ghiLo,
    ghiHi: p.ghiHi,
    poaKwh: t.total / MJ_PER_KWH,
    diffuseFraction: t.diffuseFraction,
    cellTemp: pv.cellTemp,
    tempFactor: pv.tempFactor,
    kwh: pv.kwh,
    kwhLo: lo.kwh,
    kwhHi: hi.kwh,
    co2Kg: pv.kwh * INDIA_GRID_EF_KG_PER_KWH,
    rupees: pv.kwh * tariffRs,
    nwpGhi: w.nwpGhi ?? null,
    nwpKwh: nwp ? nwp.kwh : null,
    knownSite: p.knownSite,
  };
}

/** Pearson correlation coefficient. */
export function pearson(a: number[], b: number[]): number {
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
