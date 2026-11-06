/**
 * Zero-dimensional energy-balance climate model (the "greenhouse effect" demo).
 */
export const SIGMA = 5.670374419e-8; // Stefan-Boltzmann constant, W m^-2 K^-4
export const S0 = 1361; // total solar irradiance, W m^-2
export const ALBEDO0 = 0.3; // planetary albedo
export const CO2_PREINDUSTRIAL = 280; // ppm
/** Climate sensitivity parameter (K per W m^-2): ~3 degC per CO2 doubling (IPCC AR6 best estimate). */
export const LAMBDA = 3 / (5.35 * Math.log(2));
/** Pre-industrial global mean surface temperature (degC), approximately. */
export const T_PREINDUSTRIAL = 13.9;

/** Radiative-equilibrium temperature of a planet with no greenhouse effect (K). */
export function effectiveTemperature(S = S0, albedo = ALBEDO0): number {
  return ((S * (1 - albedo)) / (4 * SIGMA)) ** 0.25;
}

/** Radiative forcing of CO2 relative to pre-industrial (Myhre et al., 1998), W m^-2. */
export function co2Forcing(ppm: number, ref = CO2_PREINDUSTRIAL): number {
  return 5.35 * Math.log(ppm / ref);
}

/** Change in absorbed sunlight relative to the reference planet, W m^-2. */
export function solarForcing(S: number, albedo: number): number {
  return (S * (1 - albedo) - S0 * (1 - ALBEDO0)) / 4;
}

export interface Balance {
  incoming: number; // W m^-2 at top of atmosphere (global mean)
  reflected: number;
  absorbed: number;
  forcing: number; // total W m^-2
  co2Forcing: number;
  warming: number; // equilibrium K vs pre-industrial
  surfaceC: number;
  effectiveC: number; // no-greenhouse temperature
  greenhouseK: number; // size of the greenhouse effect
}

export function energyBalance(ppm: number, S = S0, albedo = ALBEDO0): Balance {
  const incoming = S / 4;
  const reflected = incoming * albedo;
  const absorbed = incoming - reflected;
  const fc = co2Forcing(ppm);
  const forcing = fc + solarForcing(S, albedo);
  const warming = LAMBDA * forcing;
  const surfaceC = T_PREINDUSTRIAL + warming;
  const effectiveC = effectiveTemperature(S, albedo) - 273.15;
  return { incoming, reflected, absorbed, forcing, co2Forcing: fc, warming, surfaceC, effectiveC, greenhouseK: surfaceC - effectiveC };
}

/** Ordinary least squares y = a + b x. */
export function linearFit(x: number[], y: number[]): { a: number; b: number; r2: number } {
  const n = x.length;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  const b = sxy / sxx;
  return { a: my - b * mx, b, r2: (sxy * sxy) / (sxx * syy) };
}

export function movingAverage(values: number[], window: number): (number | null)[] {
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    if (i < half || i >= values.length - half) return null;
    let s = 0;
    for (let k = i - half; k <= i + half; k++) s += values[k];
    return s / (2 * half + 1);
  });
}
