/** Loads the trained SuryaCast network and turns weather into solar radiation. */
import { extraterrestrialRadiation, dayOfYear } from '../solar';
import { KT_MAX, buildFeatures, scale, type DailyWeather, type Scaler, type Site } from './features';
import { MLP, type MlpJSON } from './mlp';

export interface IntervalTable {
  /** Bin edges on the predicted clearness index. */
  edges: number[];
  /** 10th and 90th percentile of (actual Kt - predicted Kt) in each bin, from validation data. */
  lo: number[];
  hi: number[];
  level: number;
}

export interface SuryaModelJSON {
  name: string;
  version: string;
  trainedAt: string;
  featureNames: string[];
  scaler: Scaler;
  /** Networks with identical architecture; the prediction is their average. */
  ensemble: MlpJSON[];
  /** Intervals for places the network was trained on (from 2024 validation residuals). */
  intervals: IntervalTable;
  /** Wider intervals for new places (from leave-cities-out cross-validation residuals). */
  intervalsNewSite: IntervalTable;
  /** [lat, lon] of the training cities. */
  trainSites: [number, number][];
}

export interface RadiationPrediction {
  /** Predicted clearness index. */
  kt: number;
  /** Predicted global horizontal radiation (MJ m^-2 day^-1). */
  ghi: number;
  /** Lower / upper bound of the prediction interval (MJ m^-2 day^-1). */
  ghiLo: number;
  ghiHi: number;
  /** Extraterrestrial radiation for that day and place. */
  ra: number;
  /** True when the site is within 30 km of a city the network was trained on. */
  knownSite: boolean;
}

/** Great-circle distance in km. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

const clampKt = (k: number) => Math.min(KT_MAX, Math.max(0.02, k));

export class SolarModel {
  readonly nets: MLP[];
  readonly scaler: Scaler;
  readonly intervals: IntervalTable;
  readonly intervalsNewSite: IntervalTable;
  readonly trainSites: [number, number][];
  readonly meta: Pick<SuryaModelJSON, 'name' | 'version' | 'trainedAt' | 'featureNames'>;

  constructor(j: SuryaModelJSON) {
    this.nets = j.ensemble.map((m) => MLP.fromJSON(m));
    this.scaler = j.scaler;
    this.intervals = j.intervals;
    this.intervalsNewSite = j.intervalsNewSite ?? j.intervals;
    this.trainSites = j.trainSites ?? [];
    this.meta = { name: j.name, version: j.version, trainedAt: j.trainedAt, featureNames: j.featureNames };
  }

  static async load(url = '/model/suryacast-mlp.json'): Promise<SolarModel> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not load model (${res.status})`);
    return new SolarModel((await res.json()) as SuryaModelJSON);
  }

  predictKtFromFeatures(features: number[]): number {
    const x = scale(features, this.scaler);
    return clampKt(this.nets.reduce((s, n) => s + n.predict(x), 0) / this.nets.length);
  }

  isKnownSite(site: Pick<Site, 'lat' | 'lon'>): boolean {
    return this.trainSites.some(([la, lo]) => haversineKm(site.lat, site.lon, la, lo) <= 30);
  }

  interval(kt: number, knownSite = true): [number, number] {
    const { edges, lo, hi } = knownSite ? this.intervals : this.intervalsNewSite;
    let bin = edges.length - 2;
    for (let i = 0; i < edges.length - 1; i++) {
      if (kt < edges[i + 1]) {
        bin = i;
        break;
      }
    }
    return [clampKt(kt + lo[bin]), clampKt(kt + hi[bin])];
  }

  predict(w: DailyWeather, site: Site): RadiationPrediction {
    const ra = extraterrestrialRadiation(site.lat, dayOfYear(w.date));
    const kt = this.predictKtFromFeatures(buildFeatures(w, site));
    const knownSite = this.isKnownSite(site);
    const [klo, khi] = this.interval(kt, knownSite);
    return { kt, ghi: kt * ra, ghiLo: klo * ra, ghiHi: khi * ra, ra, knownSite };
  }
}
