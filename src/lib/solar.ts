/**
 * Solar geometry and radiation physics.
 *
 * Equations follow FAO Irrigation & Drainage Paper 56 (Allen et al., 1998),
 * chapter 3, and Duffie & Beckman, "Solar Engineering of Thermal Processes".
 * All daily radiation quantities are in MJ m^-2 day^-1 unless stated.
 */

/** Solar constant expressed as in FAO-56 (MJ m^-2 min^-1). */
export const GSC = 0.082;
export const DEG = Math.PI / 180;
/** 1 kWh = 3.6 MJ */
export const MJ_PER_KWH = 3.6;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Day of the year (1..366) for an ISO date string (YYYY-MM-DD) or Date. */
export function dayOfYear(date: string | Date): number {
  const d = typeof date === 'string' ? new Date(`${date.slice(0, 10)}T00:00:00Z`) : date;
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((d.getTime() - start) / 86_400_000) + 1;
}

/** FAO-56 eq. 23: inverse relative Earth-Sun distance. */
export function inverseRelativeDistance(J: number): number {
  return 1 + 0.033 * Math.cos(((2 * Math.PI) / 365) * J);
}

/** FAO-56 eq. 24: solar declination (rad). */
export function declination(J: number): number {
  return 0.409 * Math.sin(((2 * Math.PI) / 365) * J - 1.39);
}

/** FAO-56 eq. 25: sunset hour angle (rad). */
export function sunsetHourAngle(latRad: number, decl: number): number {
  return Math.acos(clamp(-Math.tan(latRad) * Math.tan(decl), -1, 1));
}

/** FAO-56 eq. 21: extraterrestrial radiation Ra on a horizontal surface (MJ m^-2 day^-1). */
export function extraterrestrialRadiation(latDeg: number, J: number): number {
  const phi = latDeg * DEG;
  const dr = inverseRelativeDistance(J);
  const d = declination(J);
  const ws = sunsetHourAngle(phi, d);
  const ra =
    ((24 * 60) / Math.PI) *
    GSC *
    dr *
    (ws * Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.sin(ws));
  return Math.max(0, ra);
}

/** FAO-56 eq. 34: maximum possible daylight hours N. */
export function daylightHours(latDeg: number, J: number): number {
  return (24 / Math.PI) * sunsetHourAngle(latDeg * DEG, declination(J));
}

/** FAO-56 eq. 37: clear-sky solar radiation Rso. */
export function clearSkyRadiation(ra: number, elevationM: number): number {
  return (0.75 + 2e-5 * elevationM) * ra;
}

/**
 * FAO-56 eq. 50: Hargreaves-Samani radiation estimate from air temperature range.
 * kRs = 0.16 for interior and 0.19 for coastal locations. Result is capped at Rso.
 */
export function hargreavesRadiation(
  ra: number,
  tmax: number,
  tmin: number,
  coastal: boolean,
  elevationM = 0,
): number {
  const kRs = coastal ? 0.19 : 0.16;
  const rs = kRs * Math.sqrt(Math.max(0, tmax - tmin)) * ra;
  return Math.min(rs, clearSkyRadiation(ra, elevationM));
}

/**
 * Erbs et al. (1982) daily diffuse fraction Hd/H as a function of the daily
 * clearness index KT and the sunset hour angle (Duffie & Beckman eq. 2.11.2).
 */
export function erbsDiffuseFraction(kt: number, wsRad: number): number {
  const k = clamp(kt, 0, 1);
  const wsDeg = wsRad / DEG;
  let f: number;
  if (wsDeg <= 81.4) {
    f = k < 0.715 ? 1.0 - 0.2727 * k + 2.4495 * k ** 2 - 11.9514 * k ** 3 + 9.3879 * k ** 4 : 0.143;
  } else {
    f = k < 0.722 ? 1.0 + 0.2832 * k - 2.5557 * k ** 2 + 0.8448 * k ** 3 : 0.175;
  }
  // The fitted polynomial slightly exceeds 1 for very overcast days; the
  // diffuse share of sunlight is physically bounded to [0, 1].
  return clamp(f, 0, 1);
}

/**
 * Daily ratio of beam radiation on an equator-facing tilted surface to that on a
 * horizontal surface (Liu & Jordan; Duffie & Beckman eq. 2.19.3).
 */
export function beamTiltFactor(latDeg: number, tiltDeg: number, J: number): number {
  const phi = latDeg * DEG;
  const beta = tiltDeg * DEG;
  const d = declination(J);
  // Equator-facing: in the northern hemisphere the surface "sees" latitude (phi - beta).
  const phiT = latDeg >= 0 ? phi - beta : phi + beta;
  const ws = sunsetHourAngle(phi, d);
  const wsT = Math.min(ws, Math.acos(clamp(-Math.tan(phiT) * Math.tan(d), -1, 1)));
  const num = Math.cos(phiT) * Math.cos(d) * Math.sin(wsT) + wsT * Math.sin(phiT) * Math.sin(d);
  const den = Math.cos(phi) * Math.cos(d) * Math.sin(ws) + ws * Math.sin(phi) * Math.sin(d);
  if (den <= 0) return 0;
  return Math.max(0, num / den);
}

export interface TiltedRadiation {
  /** Global radiation on the tilted plane (MJ m^-2 day^-1). */
  total: number;
  beam: number;
  diffuse: number;
  reflected: number;
  /** Daily clearness index H / Ho. */
  kt: number;
  diffuseFraction: number;
}

/**
 * Isotropic-sky (Liu & Jordan) transposition of daily global horizontal
 * radiation onto an equator-facing plane tilted at `tiltDeg`.
 */
export function tiltedRadiation(
  ghi: number,
  latDeg: number,
  J: number,
  tiltDeg: number,
  albedo = 0.2,
): TiltedRadiation {
  const ra = extraterrestrialRadiation(latDeg, J);
  const kt = ra > 0 ? clamp(ghi / ra, 0, 1) : 0;
  const ws = sunsetHourAngle(latDeg * DEG, declination(J));
  const fd = erbsDiffuseFraction(kt, ws);
  const hd = fd * ghi;
  const hb = ghi - hd;
  const beta = tiltDeg * DEG;
  const beam = hb * beamTiltFactor(latDeg, tiltDeg, J);
  const diffuse = (hd * (1 + Math.cos(beta))) / 2;
  const reflected = (ghi * albedo * (1 - Math.cos(beta))) / 2;
  return { total: beam + diffuse + reflected, beam, diffuse, reflected, kt, diffuseFraction: fd };
}
