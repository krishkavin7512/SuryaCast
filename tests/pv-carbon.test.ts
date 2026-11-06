import { describe, expect, it } from 'vitest';
import { DEFAULT_SYSTEM, dailyPvEnergy, energyWeightedIrradiance } from '../src/lib/pv';
import {
  carbonPaybackYears,
  co2AvoidedKg,
  lifetimeProjection,
  paybackYears,
  pmSuryaGharSubsidy,
} from '../src/lib/carbon';

const sunnyChennaiDay = { ghi: 20, tmax: 32, tmin: 25, lat: 13.08, doy: 80 };

describe('PV energy model', () => {
  it('gives a realistic daily yield and performance ratio for 1 kWp', () => {
    const out = dailyPvEnergy(sunnyChennaiDay, { ...DEFAULT_SYSTEM, capacityKw: 1, tiltDeg: 13 });
    // 20 MJ/m2 = 5.6 kWh/m2; Indian rooftop PR is typically 0.70-0.82.
    expect(out.kwh).toBeGreaterThan(3.8);
    expect(out.kwh).toBeLessThan(4.9);
    expect(out.performanceRatio).toBeGreaterThan(0.7);
    expect(out.performanceRatio).toBeLessThan(0.84);
    expect(out.cellTemp).toBeGreaterThan(sunnyChennaiDay.tmax);
  });

  it('scales linearly with capacity', () => {
    const a = dailyPvEnergy(sunnyChennaiDay, { ...DEFAULT_SYSTEM, capacityKw: 1 });
    const b = dailyPvEnergy(sunnyChennaiDay, { ...DEFAULT_SYSTEM, capacityKw: 3 });
    expect(b.kwh).toBeCloseTo(3 * a.kwh, 9);
  });

  it('produces less energy on hotter days (temperature derating)', () => {
    const cool = dailyPvEnergy({ ...sunnyChennaiDay, tmax: 25, tmin: 18 }, DEFAULT_SYSTEM);
    const hot = dailyPvEnergy({ ...sunnyChennaiDay, tmax: 42, tmin: 30 }, DEFAULT_SYSTEM);
    expect(hot.kwh).toBeLessThan(cool.kwh);
    expect(hot.tempFactor).toBeLessThan(cool.tempFactor);
  });

  it('produces nothing without sunlight', () => {
    expect(dailyPvEnergy({ ...sunnyChennaiDay, ghi: 0 }, DEFAULT_SYSTEM).kwh).toBe(0);
  });

  it('energy-weighted irradiance follows the half-sine profile identity', () => {
    // H = 2 Gmax N / pi  ->  Gmax = pi H / (2N);  weighted mean = (pi/4) Gmax
    const H = 6000;
    const N = 12;
    const gmax = (Math.PI * H) / (2 * N);
    expect(energyWeightedIrradiance(H, N)).toBeCloseTo((Math.PI / 4) * gmax, 9);
  });
});

describe('PM Surya Ghar subsidy and carbon accounting', () => {
  it('applies the central subsidy slabs and cap', () => {
    expect(pmSuryaGharSubsidy(1)).toBe(30_000);
    expect(pmSuryaGharSubsidy(2)).toBe(60_000);
    expect(pmSuryaGharSubsidy(2.5)).toBe(69_000);
    expect(pmSuryaGharSubsidy(3)).toBe(78_000);
    expect(pmSuryaGharSubsidy(10)).toBe(78_000);
    expect(pmSuryaGharSubsidy(0)).toBe(0);
  });

  it('uses the CEA grid emission factor (0.727 kg/kWh)', () => {
    expect(co2AvoidedKg(1000)).toBeCloseTo(727, 6);
  });

  it('degrades output each year and computes payback', () => {
    const p = lifetimeProjection({ firstYearKwh: 1000, tariffRs: 10, tariffEscalation: 0, netCostRs: 25_000, years: 25 });
    expect(p).toHaveLength(25);
    expect(p[1].kwh).toBeCloseTo(995, 6);
    expect(p[24].kwh).toBeCloseTo(1000 * 0.995 ** 24, 6);
    const pb = paybackYears(p, 25_000)!;
    expect(pb).toBeGreaterThan(2.5);
    expect(pb).toBeLessThan(2.6);
    expect(paybackYears(p, 1e9)).toBeNull();
  });

  it('carbon payback is a small fraction of the system life', () => {
    const years = carbonPaybackYears(25 * 1450, 1450);
    expect(years).toBeGreaterThan(1);
    expect(years).toBeLessThan(2);
  });
});
