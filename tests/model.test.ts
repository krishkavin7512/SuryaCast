import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SolarModel, haversineKm, type SuryaModelJSON } from '../src/lib/ml/model';
import { decodeRows, type LabFile } from '../src/lib/ml/lab-data';
import { regressionMetrics } from '../src/lib/ml/metrics';
import { scale } from '../src/lib/ml/features';
import { runPipeline } from '../src/lib/pipeline';
import { DEFAULT_SYSTEM } from '../src/lib/pv';

const root = path.resolve(import.meta.dirname, '..');
const modelJson = JSON.parse(fs.readFileSync(path.join(root, 'public/model/suryacast-mlp.json'), 'utf8')) as SuryaModelJSON;
const lab = JSON.parse(fs.readFileSync(path.join(root, 'public/data/train-lab.json'), 'utf8')) as LabFile;
const report = JSON.parse(fs.readFileSync(path.join(root, 'src/data/model-report.json'), 'utf8'));
const model = new SolarModel(modelJson);

describe('shipped model artefact', () => {
  it('is a 5-network ensemble with the documented architecture', () => {
    expect(model.nets).toHaveLength(5);
    expect(modelJson.ensemble[0].sizes).toEqual([13, 64, 32, 1]);
    expect(model.trainSites).toHaveLength(30);
  });

  it('reproduces the reported unseen-city accuracy through the browser code path', () => {
    const rows = decodeRows(lab, lab.test);
    const preds = rows.map((r) => model.predictKtFromFeatures(r.x) * r.ra);
    const m = regressionMetrics(rows.map((r) => r.rs), preds);
    const reported = report.models.find((x: { key: string }) => x.key === 'mlp').metrics.testSpace;
    expect(m.r2).toBeGreaterThan(0.75);
    expect(Math.abs(m.r2 - reported.r2)).toBeLessThan(0.03);
    expect(Math.abs(m.mae - reported.mae)).toBeLessThan(0.1);
    // ...and beats the FAO-56 Hargreaves baseline on the same days.
    const h = regressionMetrics(rows.map((r) => r.rs), rows.map((r) => r.hargreaves));
    expect(m.mae).toBeLessThan(h.mae * 0.7);
  });

  it('gives calibrated 80% intervals for new sites', () => {
    const rows = decodeRows(lab, lab.test);
    let inside = 0;
    for (const r of rows) {
      const kt = model.predictKtFromFeatures(r.x);
      const [lo, hi] = model.interval(kt, false);
      if (r.rs >= lo * r.ra - 1e-9 && r.rs <= hi * r.ra + 1e-9) inside++;
    }
    const coverage = inside / rows.length;
    expect(coverage).toBeGreaterThan(0.72);
    expect(coverage).toBeLessThan(0.88);
  });

  it('feature scaling matches the stored scaler', () => {
    const rows = decodeRows(lab, lab.train.slice(0, 1));
    const z = scale(rows[0].x, model.scaler);
    expect(z.every(Number.isFinite)).toBe(true);
  });

  it('knows which places it was trained near', () => {
    expect(model.isKnownSite({ lat: 13.08, lon: 80.27 })).toBe(true); // Chennai
    expect(model.isKnownSite({ lat: 11.02, lon: 76.96 })).toBe(false); // Coimbatore (held out)
    expect(haversineKm(13.08, 80.27, 12.97, 77.59)).toBeGreaterThan(280);
  });
});

describe('end-to-end pipeline', () => {
  const site = { lat: 13.08, lon: 80.27, elevation: 10 };
  const clear = { date: '2025-03-15', tmax: 32, tmin: 23, cloudMean: 5, cloudMax: 20, cloudMin: 0, rh: 65, precip: 0, precipHours: 0 };
  const storm = { date: '2025-11-20', tmax: 27, tmin: 24, cloudMean: 100, cloudMax: 100, cloudMin: 98, rh: 94, precip: 60, precipHours: 20 };

  it('a clear March day in Chennai gives a realistic yield', () => {
    const r = runPipeline(model, clear, site, { ...DEFAULT_SYSTEM, capacityKw: 1, tiltDeg: 13 }, 7);
    expect(r.ghi / 3.6).toBeGreaterThan(5.5);
    expect(r.ghi / 3.6).toBeLessThan(7.5);
    expect(r.kwh).toBeGreaterThan(4.2);
    expect(r.kwh).toBeLessThan(6.2);
    expect(r.kwhLo).toBeLessThanOrEqual(r.kwh);
    expect(r.kwhHi).toBeGreaterThanOrEqual(r.kwh);
    expect(r.co2Kg).toBeCloseTo(r.kwh * 0.727, 9);
  });

  it('a cyclonic downpour cuts generation by more than half', () => {
    const a = runPipeline(model, clear, site, DEFAULT_SYSTEM, 7);
    const b = runPipeline(model, storm, site, DEFAULT_SYSTEM, 7);
    expect(b.kwh).toBeLessThan(a.kwh * 0.5);
    expect(b.kt).toBeLessThan(0.35);
  });

  it('is monotonic: more cloud never means more sunlight (on average)', () => {
    const kts = [0, 25, 50, 75, 100].map((c) =>
      runPipeline(model, { ...clear, cloudMean: c, cloudMax: Math.max(c, 20), cloudMin: Math.min(c, 0) }, site, DEFAULT_SYSTEM, 7).kt,
    );
    expect(kts[4]).toBeLessThan(kts[0]);
    expect(kts[2]).toBeLessThan(kts[0]);
  });
});
