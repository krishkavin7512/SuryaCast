import { describe, expect, it } from 'vitest';
import { co2Forcing, effectiveTemperature, energyBalance, linearFit, movingAverage, LAMBDA } from '../src/lib/climate';
import { dailyPvEnergy, DEFAULT_SYSTEM } from '../src/lib/pv';

describe('energy-balance climate model', () => {
  it('gives the textbook 255 K effective temperature of Earth', () => {
    expect(effectiveTemperature()).toBeCloseTo(255, 0);
  });

  it('gives 3.7 W/m2 forcing and ~3 C warming for doubled CO2', () => {
    expect(co2Forcing(560)).toBeCloseTo(3.708, 2);
    expect(LAMBDA * co2Forcing(560)).toBeCloseTo(3, 6);
    expect(energyBalance(280).warming).toBeCloseTo(0, 9);
  });

  it('has a ~33 K natural greenhouse effect at pre-industrial CO2', () => {
    const b = energyBalance(280);
    expect(b.greenhouseK).toBeGreaterThan(31);
    expect(b.greenhouseK).toBeLessThan(35);
    expect(b.absorbed).toBeCloseTo(238.2, 0);
  });

  it('warms more when albedo falls (ice-albedo feedback direction)', () => {
    expect(energyBalance(420, 1361, 0.28).warming).toBeGreaterThan(energyBalance(420, 1361, 0.3).warming);
  });
});

describe('statistics helpers', () => {
  it('fits a straight line', () => {
    const f = linearFit([1, 2, 3, 4], [3, 5, 7, 9]);
    expect(f.b).toBeCloseTo(2, 9);
    expect(f.a).toBeCloseTo(1, 9);
    expect(f.r2).toBeCloseTo(1, 9);
  });
  it('computes a centred moving average', () => {
    expect(movingAverage([1, 2, 3, 4, 5], 3)).toEqual([null, 2, 3, 4, null]);
  });
});

describe('heat-wave penalty on solar output', () => {
  it('a 45 C heat wave costs ~0.37%/C x the temperature rise in daily output', () => {
    const day = { ghi: 22, tmin: 20, lat: 23, doy: 140 };
    const mild = dailyPvEnergy({ ...day, tmax: 25 }, DEFAULT_SYSTEM).kwh;
    const hot = dailyPvEnergy({ ...day, tmax: 45, tmin: 32 }, DEFAULT_SYSTEM).kwh;
    const loss = 1 - hot / mild;
    // Daytime air is ~18 C hotter: expect roughly 18 x 0.37 % = 6.7 % less energy.
    expect(loss).toBeGreaterThan(0.05);
    expect(loss).toBeLessThan(0.09);
  });
});
