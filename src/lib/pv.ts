/**
 * Daily photovoltaic (PV) energy model.
 *
 * Energy = capacity x plane-of-array insolation x balance-of-system efficiency
 *          x temperature derating, with the cell temperature from the NOCT model.
 */
import { MJ_PER_KWH, daylightHours, tiltedRadiation } from './solar';

export interface PvSystem {
  /** DC nameplate capacity (kWp). */
  capacityKw: number;
  /** Panel tilt from horizontal (degrees), facing the equator (south in India). */
  tiltDeg: number;
  /** Inverter, wiring, soiling, mismatch and availability losses combined (0..1). */
  bosEfficiency: number;
  /** Power temperature coefficient (per degC), about -0.0037 for mono-PERC silicon. */
  tempCoeff: number;
  /** Nominal operating cell temperature (degC). */
  noct: number;
  /** Ground reflectance. */
  albedo: number;
}

export const DEFAULT_SYSTEM: PvSystem = {
  capacityKw: 3,
  tiltDeg: 13,
  bosEfficiency: 0.86,
  tempCoeff: -0.0037,
  noct: 45,
  albedo: 0.2,
};

export interface DayInput {
  /** Global horizontal irradiation (MJ m^-2 day^-1). */
  ghi: number;
  tmax: number;
  tmin: number;
  lat: number;
  doy: number;
}

export interface DayOutput {
  /** AC energy delivered (kWh). */
  kwh: number;
  /** Plane-of-array insolation (kWh m^-2). */
  poaKwh: number;
  /** Energy-weighted mean cell temperature (degC). */
  cellTemp: number;
  /** Multiplicative temperature derating (e.g. 0.9 = 10 % loss). */
  tempFactor: number;
  /** Effective performance ratio = kWh / (kWp x POA). */
  performanceRatio: number;
}

/**
 * For a half-sine irradiance profile G(t) = Gmax sin(pi t / N) over N daylight
 * hours, the daily insolation is H = 2 Gmax N / pi and the energy-weighted mean
 * irradiance is pi^2 H / (8 N). That is the irradiance the cell "sees" while it
 * produces most of its energy.
 */
export function energyWeightedIrradiance(poaWhPerM2: number, daylightH: number): number {
  if (daylightH <= 0) return 0;
  return (Math.PI ** 2 * poaWhPerM2) / (8 * daylightH);
}

export function dailyPvEnergy(input: DayInput, sys: PvSystem): DayOutput {
  const poa = tiltedRadiation(Math.max(0, input.ghi), input.lat, input.doy, sys.tiltDeg, sys.albedo);
  const poaKwh = poa.total / MJ_PER_KWH;
  const n = daylightHours(input.lat, input.doy);
  const gEff = energyWeightedIrradiance(poaKwh * 1000, n);
  // Daytime ambient temperature: weighted towards the afternoon maximum.
  const tAmb = 0.75 * input.tmax + 0.25 * input.tmin;
  const cellTemp = tAmb + ((sys.noct - 20) / 800) * gEff;
  const tempFactor = Math.max(0, 1 + sys.tempCoeff * (cellTemp - 25));
  const kwh = sys.capacityKw * poaKwh * sys.bosEfficiency * tempFactor;
  const performanceRatio = poaKwh > 0 ? kwh / (sys.capacityKw * poaKwh) : 0;
  return { kwh, poaKwh, cellTemp, tempFactor, performanceRatio };
}
