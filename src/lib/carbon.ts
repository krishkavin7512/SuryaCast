/**
 * Emissions, carbon-credit and economics helpers.
 * Every constant carries its source so it can be cited in the report.
 */

/**
 * Weighted-average CO2 emission factor of the Indian grid, FY 2023-24:
 * 0.727 tCO2/MWh = 0.727 kg CO2 per kWh.
 * Source: Central Electricity Authority, CO2 Baseline Database for the Indian
 * Power Sector, Version 20.0 (Dec 2024).
 */
export const INDIA_GRID_EF_KG_PER_KWH = 0.727;

/**
 * US EPA Greenhouse Gas Equivalencies Calculator: one urban tree seedling grown
 * for 10 years sequesters about 0.060 t CO2.
 */
export const TREE_SEEDLING_10Y_KG = 60;

/** Typical crystalline-silicon module degradation per year. */
export const DEFAULT_DEGRADATION = 0.005;

/** Typical design life of a rooftop PV system (years). */
export const SYSTEM_LIFE_YEARS = 25;

/**
 * Life-cycle greenhouse-gas emissions of electricity sources, median values
 * (g CO2-eq per kWh). Source: IPCC AR5 WGIII (2014), Annex III, Table A.III.2.
 */
export const LIFECYCLE_G_PER_KWH: { source: string; g: number; group: 'fossil' | 'renewable' | 'other' }[] = [
  { source: 'Coal (pulverised)', g: 820, group: 'fossil' },
  { source: 'Natural gas (combined cycle)', g: 490, group: 'fossil' },
  { source: 'Biomass (dedicated)', g: 230, group: 'renewable' },
  { source: 'Solar PV (utility)', g: 48, group: 'renewable' },
  { source: 'Solar PV (rooftop)', g: 41, group: 'renewable' },
  { source: 'Geothermal', g: 38, group: 'renewable' },
  { source: 'Concentrated solar', g: 27, group: 'renewable' },
  { source: 'Hydropower', g: 24, group: 'renewable' },
  { source: 'Nuclear', g: 12, group: 'other' },
  { source: 'Wind (onshore)', g: 11, group: 'renewable' },
];

export const ROOFTOP_PV_LIFECYCLE_G_PER_KWH = 41;

/**
 * PM Surya Ghar: Muft Bijli Yojana (MNRE, Feb 2024) central financial assistance for
 * residential rooftop solar: Rs 30,000/kW for the first 2 kW, Rs 18,000/kW for
 * the third kW, capped at Rs 78,000 for systems of 3 kW and above.
 */
export function pmSuryaGharSubsidy(capacityKw: number): number {
  const kw = Math.max(0, capacityKw);
  const subsidy = Math.min(kw, 2) * 30_000 + Math.min(Math.max(kw - 2, 0), 1) * 18_000;
  return Math.min(subsidy, 78_000);
}

export function co2AvoidedKg(kwh: number, efKgPerKwh = INDIA_GRID_EF_KG_PER_KWH): number {
  return kwh * efKgPerKwh;
}

export interface LifetimeYear {
  year: number;
  kwh: number;
  co2Kg: number;
  savingsRs: number;
  cumulativeCashRs: number;
}

export interface LifetimeInputs {
  firstYearKwh: number;
  years?: number;
  degradation?: number;
  efKgPerKwh?: number;
  tariffRs: number;
  /** Annual increase in the electricity tariff (fraction). */
  tariffEscalation?: number;
  netCostRs: number;
  /** Annual operations & maintenance cost as a fraction of the gross system cost. */
  omRs?: number;
}

export function lifetimeProjection(inp: LifetimeInputs): LifetimeYear[] {
  const years = inp.years ?? SYSTEM_LIFE_YEARS;
  const deg = inp.degradation ?? DEFAULT_DEGRADATION;
  const ef = inp.efKgPerKwh ?? INDIA_GRID_EF_KG_PER_KWH;
  const esc = inp.tariffEscalation ?? 0.02;
  const om = inp.omRs ?? 0;
  let cumulative = -inp.netCostRs;
  const out: LifetimeYear[] = [];
  for (let y = 1; y <= years; y++) {
    const kwh = inp.firstYearKwh * (1 - deg) ** (y - 1);
    const savingsRs = kwh * inp.tariffRs * (1 + esc) ** (y - 1) - om;
    cumulative += savingsRs;
    out.push({ year: y, kwh, co2Kg: kwh * ef, savingsRs, cumulativeCashRs: cumulative });
  }
  return out;
}

/** Simple payback period in years (fractional), or null if never paid back. */
export function paybackYears(projection: LifetimeYear[], netCostRs: number): number | null {
  let remaining = netCostRs;
  for (const p of projection) {
    if (p.savingsRs >= remaining) return p.year - 1 + remaining / p.savingsRs;
    remaining -= p.savingsRs;
  }
  return null;
}

/**
 * Carbon payback: years of generation needed before the CO2 avoided equals the
 * system's embodied (life-cycle) emissions.
 */
export function carbonPaybackYears(
  lifetimeKwh: number,
  firstYearKwh: number,
  efKgPerKwh = INDIA_GRID_EF_KG_PER_KWH,
  lifecycleGPerKwh = ROOFTOP_PV_LIFECYCLE_G_PER_KWH,
): number {
  const embodiedKg = (lifetimeKwh * lifecycleGPerKwh) / 1000;
  const avoidedPerYear = firstYearKwh * efKgPerKwh;
  return avoidedPerYear > 0 ? embodiedKg / avoidedPerYear : Infinity;
}
