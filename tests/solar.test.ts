import { describe, expect, it } from 'vitest';
import {
  beamTiltFactor,
  dayOfYear,
  daylightHours,
  declination,
  erbsDiffuseFraction,
  extraterrestrialRadiation,
  hargreavesRadiation,
  inverseRelativeDistance,
  sunsetHourAngle,
  tiltedRadiation,
  DEG,
} from '../src/lib/solar';

describe('solar geometry (FAO-56 worked examples)', () => {
  it('computes day of year, including leap years', () => {
    expect(dayOfYear('2025-01-01')).toBe(1);
    expect(dayOfYear('2025-09-03')).toBe(246);
    expect(dayOfYear('2024-12-31')).toBe(366);
  });

  it('matches FAO-56 Example 8: Ra at 20 deg S on 3 September = 32.2 MJ/m2/day', () => {
    const J = 246;
    expect(inverseRelativeDistance(J)).toBeCloseTo(0.985, 3);
    expect(declination(J)).toBeCloseTo(0.12, 2);
    expect(sunsetHourAngle(-20 * DEG, declination(J))).toBeCloseTo(1.527, 2);
    expect(extraterrestrialRadiation(-20, J)).toBeCloseTo(32.2, 1);
  });

  it('matches FAO-56 Example 9: daylight hours N = 11.7 h for the same day', () => {
    expect(daylightHours(-20, 246)).toBeCloseTo(11.7, 1);
  });

  it('matches FAO-56 Example 15: Hargreaves Rs = 22.3 MJ/m2/day (Lyon, 15 July)', () => {
    const ra = extraterrestrialRadiation(45 + 43 / 60, 196);
    expect(ra).toBeCloseTo(40.6, 0);
    expect(hargreavesRadiation(ra, 26.6, 14.8, false, 200)).toBeCloseTo(22.3, 0);
  });

  it('has no sunshine during polar night and 24 h during polar day', () => {
    expect(extraterrestrialRadiation(80, 355)).toBe(0);
    expect(daylightHours(80, 172)).toBeCloseTo(24, 5);
  });
});

describe('radiation on a tilted panel', () => {
  it('Erbs diffuse fraction stays within [0, 1] and falls as the sky clears', () => {
    const ws = 1.6;
    let prev = 1.01;
    for (let kt = 0; kt <= 0.8; kt += 0.05) {
      const f = erbsDiffuseFraction(kt, ws);
      expect(f).toBeGreaterThan(0);
      expect(f).toBeLessThanOrEqual(1);
      expect(f).toBeLessThan(prev + 0.02);
      prev = f;
    }
    expect(erbsDiffuseFraction(0, ws)).toBeCloseTo(1, 5);
  });

  it('a horizontal panel receives exactly the horizontal radiation', () => {
    expect(beamTiltFactor(13, 0, 100)).toBeCloseTo(1, 6);
    const t = tiltedRadiation(20, 13, 100, 0);
    expect(t.total).toBeCloseTo(20, 6);
    expect(t.reflected).toBe(0);
  });

  it('tilting toward the equator gains in winter and loses slightly in summer (Chennai)', () => {
    const winter = tiltedRadiation(18, 13.08, 355, 13);
    const summer = tiltedRadiation(24, 13.08, 172, 13);
    expect(winter.total).toBeGreaterThan(18);
    expect(summer.total).toBeLessThan(24);
  });
});
