import { useEffect, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Play, Square, Cpu, CheckCircle2 } from 'lucide-react';
import type { TrainMessage, TrainRequest } from '../lib/ml/trainer.worker';
import type { Activation } from '../lib/ml/mlp';
import { fmt, MJ_TO_KWH } from '../lib/format';
import { Card, CardTitle, LegendItem, SERIES, Segmented, Slider, TipBox } from './ui';
import type { BrowserModel } from './Playground';

const ARCH: Record<string, number[]> = { '16': [16], '32-16': [32, 16], '64-32': [64, 32] };

export default function BrowserTrainer({ onTrained }: { onTrained: (m: BrowserModel) => void }) {
  const [arch, setArch] = useState<'16' | '32-16' | '64-32'>('32-16');
  const [act, setAct] = useState<Activation>('relu');
  const [epochs, setEpochs] = useState(25);
  const [lr, setLr] = useState(3);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('Ready. Nothing is sent to a server: training happens on this computer.');
  const [curve, setCurve] = useState<{ epoch: number; train: number; val: number }[]>([]);
  const [info, setInfo] = useState<{ nTrain: number; nVal: number; nTest: number; params: number } | null>(null);
  const [result, setResult] = useState<Extract<TrainMessage, { type: 'done' }> | null>(null);
  const [msPerEpoch, setMs] = useState(0);
  const worker = useRef<Worker | null>(null);

  useEffect(() => {
    return () => {
      worker.current?.terminate();
    };
  }, []);

  const start = () => {
    worker.current?.terminate();
    const w = new Worker(new URL('../lib/ml/trainer.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    setCurve([]);
    setResult(null);
    setRunning(true);
    w.onmessage = (e: MessageEvent<TrainMessage>) => {
      const m = e.data;
      if (m.type === 'status') setStatus(m.text);
      else if (m.type === 'ready') {
        setInfo(m);
        setStatus(`Training ${m.params.toLocaleString('en-IN')} weights on ${m.nTrain.toLocaleString('en-IN')} days…`);
      } else if (m.type === 'epoch') {
        setCurve((c) => [...c, { epoch: m.epoch, train: m.trainRmse * MJ_TO_KWH, val: m.valRmse * MJ_TO_KWH }]);
        setMs(m.ms);
        setStatus(`Epoch ${m.epoch} / ${epochs}`);
      } else if (m.type === 'done') {
        setResult(m);
        setRunning(false);
        setStatus(`Finished in ${fmt(m.seconds, 1)} s. Best epoch kept (early stopping).`);
        onTrained({ model: m.model, scaler: m.scaler });
        w.terminate();
      } else if (m.type === 'error') {
        setStatus(`Error: ${m.text}`);
        setRunning(false);
      }
    };
    const req: TrainRequest = { hidden: ARCH[arch], activation: act, epochs, learningRate: lr / 1000, seed: Math.floor(Math.random() * 1000) };
    w.postMessage(req);
  };

  const stop = () => {
    worker.current?.terminate();
    setRunning(false);
    setStatus('Stopped.');
  };

  return (
    <Card>
      <CardTitle sub="Train a brand-new network from random weights, live in your browser, using the same from-scratch code and real data. Watch it learn epoch by epoch.">
        Train it yourself
      </CardTitle>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[300px_1fr]">
        <div className="space-y-5">
          <div>
            <div className="mb-2 text-sm font-medium text-ink-2">Hidden layers</div>
            <Segmented label="Architecture" value={arch} onChange={setArch} options={[{ value: '16', label: '16' }, { value: '32-16', label: '32-16' }, { value: '64-32', label: '64-32' }]} />
          </div>
          <div>
            <div className="mb-2 text-sm font-medium text-ink-2">Activation</div>
            <Segmented label="Activation" value={act} onChange={setAct} options={[{ value: 'relu', label: 'Leaky ReLU' }, { value: 'tanh', label: 'tanh' }]} />
          </div>
          <Slider label="Epochs" value={epochs} min={5} max={60} onChange={setEpochs} display={epochs} />
          <Slider label="Learning rate" value={lr} min={1} max={10} onChange={setLr} display={fmt(lr / 1000, 3)} hint="Adam optimiser with cosine decay" />
          <div className="flex gap-2">
            {!running ? (
              <button onClick={start} className="btn btn--primary flex-1" data-cursor="train">
                <Play className="h-4 w-4" aria-hidden /> Start training
              </button>
            ) : (
              <button onClick={stop} className="btn flex-1">
                <Square className="h-4 w-4" aria-hidden /> Stop
              </button>
            )}
          </div>
          <p className="flex items-start gap-2 text-xs text-muted" role="status" aria-live="polite">
            <Cpu className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {status}
            {running && msPerEpoch > 0 && ` (${Math.round(msPerEpoch)} ms/epoch)`}
          </p>
        </div>
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-ink">Learning curve (RMSE, kWh/m² per day)</div>
            <div className="flex gap-3">
              <LegendItem color={SERIES.ml} label="Training data" />
              <LegendItem color={SERIES.ref} label="Validation (2024)" />
            </div>
          </div>
          <div className="h-60 rounded-xl border border-line bg-paper/60 p-2">
            {curve.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={curve} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="epoch" tickLine={false} axisLine={{ stroke: SERIES.axis }} />
                  <YAxis tickLine={false} axisLine={false} domain={['auto', 'auto']} tickFormatter={(v) => fmt(v, 2)} />
                  <Tooltip content={({ active, payload }) => (active && payload?.length ? <TipBox title={`Epoch ${(payload[0].payload as { epoch: number }).epoch}`} rows={[{ label: 'Training', value: fmt(Number(payload[0].payload.train), 3), color: SERIES.ml }, { label: 'Validation', value: fmt(Number(payload[0].payload.val), 3), color: SERIES.ref }]} /> : null)} />
                  <Line dataKey="train" stroke={SERIES.ml} strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line dataKey="val" stroke={SERIES.ref} strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-sm text-muted">Press “Start training” to watch the error fall.</div>
            )}
          </div>
          {result && info && (
            <div className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4">
              <div className="flex items-center gap-2 font-semibold text-emerald-200">
                <CheckCircle2 className="h-5 w-5" aria-hidden /> Tested on {info.nTest.toLocaleString('en-IN')} days from 8 cities your network never saw
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="font-display text-2xl font-bold text-emerald-100">{fmt(result.test.r2, 3)}</div>
                  <div className="text-[11px] text-emerald-300">R² (yours)</div>
                </div>
                <div>
                  <div className="font-display text-2xl font-bold text-emerald-100">{fmt(result.test.mae * MJ_TO_KWH, 2)}</div>
                  <div className="text-[11px] text-emerald-300">MAE kWh/m² (yours)</div>
                </div>
                <div>
                  <div className="font-display text-2xl font-bold text-muted">{fmt(result.hargreaves.r2, 3)}</div>
                  <div className="text-[11px] text-muted">R² Hargreaves formula</div>
                </div>
              </div>
              <p className="mt-3 text-xs text-emerald-200">
                Your network now also runs in the playground above. It trained on a 9,000-day sample, so it is slightly less accurate
                than the shipped 5-network ensemble trained on all 32,850 training days.
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
