import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const perf = JSON.parse(fs.readFileSync(path.join(root, 'src/data/performance.json'), 'utf8'));
const report = JSON.parse(fs.readFileSync(path.join(root, 'src/data/model-report.json'), 'utf8'));
const K = 1 / 3.6;

describe('performance analysis data', () => {
  it('agrees with the training report for every model and split', () => {
    for (const m of report.models) {
      const p = perf.models.find((x: { key: string }) => x.key === m.key);
      for (const split of ['val', 'testTime', 'testSpace']) {
        expect(Math.abs(p.metrics[split].r2 - m.metrics[split].r2)).toBeLessThan(0.002);
        expect(Math.abs(p.metrics[split].mae - m.metrics[split].mae * K)).toBeLessThan(0.002);
      }
    }
  });

  it('confidence intervals contain the point estimate and separate the network from FAO-56', () => {
    const mlp = perf.models.find((x: { key: string }) => x.key === 'mlp').metrics.testSpace;
    expect(perf.ci.mlp.r2[0]).toBeLessThanOrEqual(mlp.r2);
    expect(perf.ci.mlp.r2[1]).toBeGreaterThanOrEqual(mlp.r2);
    expect(perf.ci.mlp.r2[0]).toBeGreaterThan(perf.ci.hargreaves.r2[1]);
  });

  it('residual histogram sums to ~100% and sky bins cover all unseen days', () => {
    const total = perf.residuals.reduce((s: number, r: { mlp: number }) => s + r.mlp, 0);
    expect(total).toBeGreaterThan(99.5);
    expect(total).toBeLessThan(100.5);
    const share = perf.bySky.reduce((s: number, b: { share: number }) => s + b.share, 0);
    expect(share).toBeGreaterThan(99.5);
  });

  it('aggregated (monthly) energy error is smaller than daily error', () => {
    expect(perf.horizons.mlp.monthly).toBeLessThan(perf.horizons.mlp.daily);
    expect(perf.horizons.mlp.daily).toBeLessThan(perf.horizons.hargreaves.daily);
  });
});
