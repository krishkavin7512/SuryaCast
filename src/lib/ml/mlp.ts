/**
 * A multilayer perceptron (feed-forward neural network) for regression,
 * written from scratch: forward pass, back-propagation and the Adam optimiser.
 * No ML libraries are used, so the same code trains the model in Node.js
 * (scripts/train.ts) and live in the browser (Model Lab page).
 */
import { gaussian, mulberry32, shuffle } from './rng';

export type Activation = 'tanh' | 'relu';

export interface MlpJSON {
  sizes: number[];
  activation: Activation;
  weights: number[][];
  biases: number[][];
}

export interface TrainOptions {
  batchSize: number;
  learningRate: number;
  /** L2 weight decay applied to weights (not biases). */
  l2?: number;
  beta1?: number;
  beta2?: number;
  epsilon?: number;
}

const act = (a: Activation, z: number) => (a === 'tanh' ? Math.tanh(z) : z > 0 ? z : 0.01 * z);
/** Derivative expressed in terms of the activation output `y` (tanh) or the input `z` (leaky ReLU). */
const dact = (a: Activation, z: number, y: number) => (a === 'tanh' ? 1 - y * y : z > 0 ? 1 : 0.01);

export class MLP {
  readonly sizes: number[];
  readonly activation: Activation;
  /** W[l] has shape (sizes[l+1] x sizes[l]), stored row-major. */
  W: Float64Array[];
  b: Float64Array[];
  private mW: Float64Array[];
  private vW: Float64Array[];
  private mB: Float64Array[];
  private vB: Float64Array[];
  private step = 0;
  // Scratch buffers reused across samples.
  private z: Float64Array[];
  private a: Float64Array[];
  private delta: Float64Array[];
  private gW: Float64Array[];
  private gB: Float64Array[];

  constructor(sizes: number[], activation: Activation = 'tanh', seed = 42) {
    this.sizes = sizes;
    this.activation = activation;
    const rand = mulberry32(seed);
    this.W = [];
    this.b = [];
    for (let l = 0; l < sizes.length - 1; l++) {
      const fanIn = sizes[l];
      const fanOut = sizes[l + 1];
      // Xavier/Glorot for tanh, He for ReLU.
      const std = activation === 'tanh' ? Math.sqrt(2 / (fanIn + fanOut)) : Math.sqrt(2 / fanIn);
      const w = new Float64Array(fanIn * fanOut);
      for (let i = 0; i < w.length; i++) w[i] = gaussian(rand) * std;
      this.W.push(w);
      this.b.push(new Float64Array(fanOut));
    }
    const zeros = (arr: Float64Array[]) => arr.map((x) => new Float64Array(x.length));
    this.mW = zeros(this.W);
    this.vW = zeros(this.W);
    this.mB = zeros(this.b);
    this.vB = zeros(this.b);
    this.gW = zeros(this.W);
    this.gB = zeros(this.b);
    this.z = sizes.map((n) => new Float64Array(n));
    this.a = sizes.map((n) => new Float64Array(n));
    this.delta = sizes.map((n) => new Float64Array(n));
  }

  get parameterCount(): number {
    return this.W.reduce((s, w) => s + w.length, 0) + this.b.reduce((s, b) => s + b.length, 0);
  }

  /** Forward pass for one sample starting at `offset` in a flat feature matrix. */
  private forward(x: ArrayLike<number>, offset = 0): number {
    const L = this.sizes.length - 1;
    const a0 = this.a[0];
    for (let i = 0; i < this.sizes[0]; i++) a0[i] = x[offset + i];
    for (let l = 0; l < L; l++) {
      const nIn = this.sizes[l];
      const nOut = this.sizes[l + 1];
      const w = this.W[l];
      const b = this.b[l];
      const aIn = this.a[l];
      const z = this.z[l + 1];
      const aOut = this.a[l + 1];
      const last = l === L - 1;
      for (let o = 0; o < nOut; o++) {
        let s = b[o];
        const row = o * nIn;
        for (let i = 0; i < nIn; i++) s += w[row + i] * aIn[i];
        z[o] = s;
        aOut[o] = last ? s : act(this.activation, s);
      }
    }
    return this.a[L][0];
  }

  predict(x: ArrayLike<number>): number {
    return this.forward(x, 0);
  }

  /** Activations of every layer for one input (used to visualise the network). */
  trace(x: ArrayLike<number>): number[][] {
    this.forward(x, 0);
    return this.a.map((layer) => Array.from(layer));
  }

  predictMatrix(X: Float64Array, n: number): Float64Array {
    const d = this.sizes[0];
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = this.forward(X, i * d);
    return out;
  }

  /**
   * One epoch of mini-batch gradient descent with Adam on the mean squared error.
   * Returns the mean training loss (MSE) over the epoch.
   */
  trainEpoch(X: Float64Array, y: Float64Array, opts: TrainOptions, rand: () => number): number {
    const n = y.length;
    const d = this.sizes[0];
    const L = this.sizes.length - 1;
    const order = new Int32Array(n);
    for (let i = 0; i < n; i++) order[i] = i;
    shuffle(order, rand);
    const { batchSize, learningRate: lr } = opts;
    const l2 = opts.l2 ?? 0;
    const b1 = opts.beta1 ?? 0.9;
    const b2 = opts.beta2 ?? 0.999;
    const eps = opts.epsilon ?? 1e-8;
    let lossSum = 0;

    for (let start = 0; start < n; start += batchSize) {
      const end = Math.min(n, start + batchSize);
      const m = end - start;
      for (let l = 0; l < L; l++) {
        this.gW[l].fill(0);
        this.gB[l].fill(0);
      }
      for (let k = start; k < end; k++) {
        const idx = order[k];
        const pred = this.forward(X, idx * d);
        const err = pred - y[idx];
        lossSum += err * err;
        // Output layer is linear: dLoss/dz = (pred - y) for loss 0.5*(pred-y)^2.
        this.delta[L][0] = err;
        for (let l = L - 1; l >= 0; l--) {
          const nIn = this.sizes[l];
          const nOut = this.sizes[l + 1];
          const w = this.W[l];
          const gw = this.gW[l];
          const gb = this.gB[l];
          const dOut = this.delta[l + 1];
          const aIn = this.a[l];
          for (let o = 0; o < nOut; o++) {
            const g = dOut[o];
            if (g === 0) continue;
            gb[o] += g;
            const row = o * nIn;
            for (let i = 0; i < nIn; i++) gw[row + i] += g * aIn[i];
          }
          if (l > 0) {
            const dIn = this.delta[l];
            const zIn = this.z[l];
            for (let i = 0; i < nIn; i++) {
              let s = 0;
              for (let o = 0; o < nOut; o++) s += w[o * nIn + i] * dOut[o];
              dIn[i] = s * dact(this.activation, zIn[i], aIn[i]);
            }
          }
        }
      }
      // Adam update with bias correction.
      this.step++;
      const c1 = 1 - b1 ** this.step;
      const c2 = 1 - b2 ** this.step;
      for (let l = 0; l < L; l++) {
        const w = this.W[l];
        const gw = this.gW[l];
        const mw = this.mW[l];
        const vw = this.vW[l];
        for (let i = 0; i < w.length; i++) {
          const g = gw[i] / m + l2 * w[i];
          mw[i] = b1 * mw[i] + (1 - b1) * g;
          vw[i] = b2 * vw[i] + (1 - b2) * g * g;
          w[i] -= (lr * (mw[i] / c1)) / (Math.sqrt(vw[i] / c2) + eps);
        }
        const bb = this.b[l];
        const gb = this.gB[l];
        const mb = this.mB[l];
        const vb = this.vB[l];
        for (let i = 0; i < bb.length; i++) {
          const g = gb[i] / m;
          mb[i] = b1 * mb[i] + (1 - b1) * g;
          vb[i] = b2 * vb[i] + (1 - b2) * g * g;
          bb[i] -= (lr * (mb[i] / c1)) / (Math.sqrt(vb[i] / c2) + eps);
        }
      }
    }
    return lossSum / n;
  }

  /** Analytic gradient of 0.5*(f(x)-y)^2 for one sample (used by gradient-check tests). */
  gradient(x: ArrayLike<number>, target: number): { gW: Float64Array[]; gB: Float64Array[] } {
    const X = Float64Array.from(x as ArrayLike<number>);
    const Y = Float64Array.of(target);
    // Run a zero-learning-rate step to fill gradient buffers without changing weights.
    const saved = { step: this.step, mW: this.mW.map((a) => a.slice()), vW: this.vW.map((a) => a.slice()), mB: this.mB.map((a) => a.slice()), vB: this.vB.map((a) => a.slice()) };
    this.trainEpoch(X, Y, { batchSize: 1, learningRate: 0 }, () => 0);
    const out = { gW: this.gW.map((a) => a.slice()), gB: this.gB.map((a) => a.slice()) };
    this.step = saved.step;
    this.mW = saved.mW;
    this.vW = saved.vW;
    this.mB = saved.mB;
    this.vB = saved.vB;
    return out;
  }

  toJSON(precision = 6): MlpJSON {
    const r = (v: number) => Number(v.toPrecision(precision));
    return {
      sizes: this.sizes,
      activation: this.activation,
      weights: this.W.map((w) => Array.from(w, r)),
      biases: this.b.map((b) => Array.from(b, r)),
    };
  }

  static fromJSON(j: MlpJSON): MLP {
    const m = new MLP(j.sizes, j.activation, 1);
    m.W = j.weights.map((w) => Float64Array.from(w));
    m.b = j.biases.map((b) => Float64Array.from(b));
    return m;
  }

  clone(): MLP {
    return MLP.fromJSON(this.toJSON(17));
  }
}
