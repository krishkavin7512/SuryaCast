import { describe, expect, it } from 'vitest';
import { MLP } from '../src/lib/ml/mlp';
import { fitRidge, predictLinear, solveLinearSystem } from '../src/lib/ml/linear';
import { regressionMetrics, quantile } from '../src/lib/ml/metrics';
import { buildFeatures, fitScaler, N_FEATURES, scale } from '../src/lib/ml/features';
import { mulberry32 } from '../src/lib/ml/rng';
import { extraterrestrialRadiation } from '../src/lib/solar';

describe('neural network (from scratch)', () => {
  it('back-propagation matches finite-difference gradients', () => {
    for (const activation of ['tanh', 'relu'] as const) {
      const net = new MLP([3, 5, 4, 1], activation, 11);
      const x = [0.3, -0.7, 1.1];
      const y = 0.4;
      const { gW, gB } = net.gradient(x, y);
      const loss = () => 0.5 * (net.predict(x) - y) ** 2;
      const h = 1e-6;
      for (let l = 0; l < net.W.length; l++) {
        for (let i = 0; i < net.W[l].length; i++) {
          const orig = net.W[l][i];
          net.W[l][i] = orig + h;
          const up = loss();
          net.W[l][i] = orig - h;
          const down = loss();
          net.W[l][i] = orig;
          expect(gW[l][i]).toBeCloseTo((up - down) / (2 * h), 5);
        }
        for (let i = 0; i < net.b[l].length; i++) {
          const orig = net.b[l][i];
          net.b[l][i] = orig + h;
          const up = loss();
          net.b[l][i] = orig - h;
          const down = loss();
          net.b[l][i] = orig;
          expect(gB[l][i]).toBeCloseTo((up - down) / (2 * h), 5);
        }
      }
    }
  });

  it('learns a non-linear function', () => {
    const rand = mulberry32(3);
    const n = 600;
    const X = new Float64Array(n * 2);
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = rand() * 4 - 2;
      const b = rand() * 4 - 2;
      X[2 * i] = a;
      X[2 * i + 1] = b;
      y[i] = Math.sin(a) * 0.5 + 0.3 * b * b;
    }
    const net = new MLP([2, 16, 1], 'tanh', 1);
    const first = net.trainEpoch(X, y, { batchSize: 32, learningRate: 0.01 }, rand);
    let last = first;
    for (let e = 0; e < 150; e++) last = net.trainEpoch(X, y, { batchSize: 32, learningRate: 0.01 }, rand);
    expect(last).toBeLessThan(first / 10);
    expect(last).toBeLessThan(0.01);
  });

  it('serialises and restores identical predictions', () => {
    const net = new MLP([4, 8, 1], 'tanh', 5);
    const copy = MLP.fromJSON(net.toJSON(17));
    const x = [0.1, 0.2, -0.3, 0.9];
    expect(copy.predict(x)).toBeCloseTo(net.predict(x), 12);
    expect(net.parameterCount).toBe(4 * 8 + 8 + 8 + 1);
  });
});

describe('ridge regression and metrics', () => {
  it('solves a linear system', () => {
    const x = solveLinearSystem([[2, 1], [1, 3]], [3, 5]);
    expect(x[0]).toBeCloseTo(0.8, 9);
    expect(x[1]).toBeCloseTo(1.4, 9);
  });

  it('recovers known coefficients', () => {
    const rand = mulberry32(8);
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 400; i++) {
      const r = [rand(), rand(), rand()];
      X.push(r);
      y.push(2 * r[0] - 3 * r[1] + 0.5 * r[2] + 1);
    }
    const m = fitRidge(X, y, 0);
    expect(m.weights[0]).toBeCloseTo(2, 6);
    expect(m.weights[1]).toBeCloseTo(-3, 6);
    expect(m.weights[2]).toBeCloseTo(0.5, 6);
    expect(m.bias).toBeCloseTo(1, 6);
    expect(predictLinear(m, [1, 1, 1])).toBeCloseTo(0.5, 6);
  });

  it('computes regression metrics', () => {
    const m = regressionMetrics([1, 2, 3, 4], [1, 2, 3, 4]);
    expect(m.r2).toBe(1);
    expect(m.mae).toBe(0);
    const m2 = regressionMetrics([1, 2, 3, 4], [2, 3, 4, 5]);
    expect(m2.mbe).toBe(1);
    expect(m2.rmse).toBe(1);
    expect(quantile([0, 10], 0.5)).toBe(5);
  });
});

describe('feature engineering', () => {
  const w = {
    date: '2025-03-21',
    tmax: 33,
    tmin: 25,
    cloudMean: 40,
    cloudMax: 80,
    cloudMin: 5,
    rh: 70,
    precip: 0,
    precipHours: 0,
  };
  it('produces the documented feature vector', () => {
    const f = buildFeatures(w, { lat: 13.08, lon: 80.27, elevation: 10 });
    expect(f).toHaveLength(N_FEATURES);
    expect(f[0]).toBeCloseTo(0.4, 9);
    expect(f[6]).toBeCloseTo(8, 9);
    expect(f[8]).toBeCloseTo(extraterrestrialRadiation(13.08, 80), 9);
    expect(f.every(Number.isFinite)).toBe(true);
  });

  it('standardises features to zero mean and unit variance', () => {
    const rows = [[1, 10], [2, 20], [3, 30]];
    const s = fitScaler(rows);
    const z = rows.map((r) => scale(r, s));
    expect(z.reduce((a, r) => a + r[0], 0)).toBeCloseTo(0, 9);
    expect(Math.sqrt(z.reduce((a, r) => a + r[1] ** 2, 0) / 3)).toBeCloseTo(1, 9);
  });
});
