/** Ridge (L2-regularised) linear regression solved with the normal equations. */
export interface LinearModel {
  weights: number[];
  bias: number;
}

/** Solve A x = b by Gaussian elimination with partial pivoting (A is n x n). */
export function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-12) throw new Error('Singular matrix');
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** Fit y = w.x + b on (already scaled) rows. The bias is not regularised. */
export function fitRidge(X: number[][], y: number[], lambda = 1e-3): LinearModel {
  const d = X[0].length;
  const p = d + 1; // last column is the bias
  const XtX = Array.from({ length: p }, () => new Array(p).fill(0));
  const Xty = new Array(p).fill(0);
  const row = new Array(p);
  for (let i = 0; i < X.length; i++) {
    for (let j = 0; j < d; j++) row[j] = X[i][j];
    row[d] = 1;
    for (let a = 0; a < p; a++) {
      Xty[a] += row[a] * y[i];
      for (let c = a; c < p; c++) XtX[a][c] += row[a] * row[c];
    }
  }
  for (let a = 0; a < p; a++) for (let c = 0; c < a; c++) XtX[a][c] = XtX[c][a];
  for (let j = 0; j < d; j++) XtX[j][j] += lambda * X.length;
  const sol = solveLinearSystem(XtX, Xty);
  return { weights: sol.slice(0, d), bias: sol[d] };
}

export function predictLinear(m: LinearModel, x: ArrayLike<number>): number {
  let s = m.bias;
  for (let j = 0; j < m.weights.length; j++) s += m.weights[j] * x[j];
  return s;
}
