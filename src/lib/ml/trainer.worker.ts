/// <reference lib="webworker" />
/**
 * Trains a fresh SuryaCast network inside the browser (off the main thread),
 * streaming the learning curve back to the page after every epoch.
 */
import { MLP, type Activation } from './mlp';
import { fitScaler, toMatrix, scale, KT_MAX } from './features';
import { decodeRows, type LabFile } from './lab-data';
import { regressionMetrics } from './metrics';
import { mulberry32 } from './rng';

export interface TrainRequest {
  hidden: number[];
  activation: Activation;
  epochs: number;
  learningRate: number;
  seed: number;
}

export type TrainMessage =
  | { type: 'status'; text: string }
  | { type: 'ready'; nTrain: number; nVal: number; nTest: number; params: number }
  | { type: 'epoch'; epoch: number; trainRmse: number; valRmse: number; ms: number }
  | {
      type: 'done';
      test: { mae: number; rmse: number; r2: number };
      hargreaves: { mae: number; rmse: number; r2: number };
      model: ReturnType<MLP['toJSON']>;
      scaler: { mean: number[]; std: number[] };
      seconds: number;
    }
  | { type: 'error'; text: string };

const post = (m: TrainMessage) => (self as unknown as Worker).postMessage(m);
let cache: LabFile | null = null;

self.onmessage = async (e: MessageEvent<TrainRequest>) => {
  try {
    const req = e.data;
    if (!cache) {
      post({ type: 'status', text: 'Downloading 14,500 real daily records…' });
      const res = await fetch('/data/train-lab.json');
      cache = (await res.json()) as LabFile;
    }
    post({ type: 'status', text: 'Engineering features…' });
    const train = decodeRows(cache, cache.train);
    const val = decodeRows(cache, cache.val);
    const test = decodeRows(cache, cache.test);
    const scaler = fitScaler(train.map((r) => r.x));
    const Xtr = toMatrix(train.map((r) => r.x), scaler);
    const ytr = Float64Array.from(train.map((r) => r.kt));
    const Xva = toMatrix(val.map((r) => r.x), scaler);
    const net = new MLP([train[0].x.length, ...req.hidden, 1], req.activation, req.seed);
    post({ type: 'ready', nTrain: train.length, nVal: val.length, nTest: test.length, params: net.parameterCount });
    const rand = mulberry32(req.seed + 1);
    const clamp = (k: number) => Math.min(KT_MAX, Math.max(0.02, k));
    const t0 = performance.now();
    let best = Infinity;
    let bestJson = net.toJSON(17);
    for (let ep = 1; ep <= req.epochs; ep++) {
      const t = performance.now();
      const lr = req.learningRate * Math.max(0.05, 0.5 * (1 + Math.cos((Math.PI * (ep - 1)) / req.epochs)));
      net.trainEpoch(Xtr, ytr, { batchSize: 64, learningRate: lr, l2: 1e-5 }, rand);
      // Report errors in physical units (MJ/m2/day) so they are easy to interpret.
      const pv = net.predictMatrix(Xva, val.length);
      let se = 0;
      for (let i = 0; i < val.length; i++) se += (clamp(pv[i]) * val[i].ra - val[i].rs) ** 2;
      const ptr = net.predictMatrix(Xtr, Math.min(train.length, 3000));
      let st = 0;
      for (let i = 0; i < ptr.length; i++) st += (clamp(ptr[i]) * train[i].ra - train[i].rs) ** 2;
      const valRmse = Math.sqrt(se / val.length);
      if (valRmse < best) {
        best = valRmse;
        bestJson = net.toJSON(17);
      }
      post({ type: 'epoch', epoch: ep, trainRmse: Math.sqrt(st / ptr.length), valRmse, ms: performance.now() - t });
      await new Promise((r) => setTimeout(r, 0));
    }
    const bestNet = MLP.fromJSON(bestJson);
    const preds = test.map((r) => clamp(bestNet.predict(scale(r.x, scaler))) * r.ra);
    const m = regressionMetrics(test.map((r) => r.rs), preds);
    const h = regressionMetrics(test.map((r) => r.rs), test.map((r) => r.hargreaves));
    post({
      type: 'done',
      test: { mae: m.mae, rmse: m.rmse, r2: m.r2 },
      hargreaves: { mae: h.mae, rmse: h.rmse, r2: h.r2 },
      model: bestJson,
      scaler,
      seconds: (performance.now() - t0) / 1000,
    });
  } catch (err) {
    post({ type: 'error', text: err instanceof Error ? err.message : String(err) });
  }
};
