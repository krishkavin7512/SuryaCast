/** Regression error metrics. */
export interface Metrics {
  n: number;
  mae: number;
  rmse: number;
  /** Mean bias error (prediction - actual). */
  mbe: number;
  r2: number;
  /** RMSE as a percentage of the mean actual value. */
  nrmse: number;
}

export function regressionMetrics(actual: ArrayLike<number>, pred: ArrayLike<number>): Metrics {
  const n = actual.length;
  let sumA = 0;
  for (let i = 0; i < n; i++) sumA += actual[i];
  const mean = sumA / n;
  let ae = 0;
  let se = 0;
  let be = 0;
  let st = 0;
  for (let i = 0; i < n; i++) {
    const e = pred[i] - actual[i];
    ae += Math.abs(e);
    se += e * e;
    be += e;
    st += (actual[i] - mean) ** 2;
  }
  const rmse = Math.sqrt(se / n);
  return { n, mae: ae / n, rmse, mbe: be / n, r2: 1 - se / st, nrmse: (100 * rmse) / mean };
}

export function quantile(sorted: ArrayLike<number>, q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
