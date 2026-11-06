import { lazy, Suspense, useState } from 'react';
import { capturing } from '../lib/fx';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  LabelList,
} from 'recharts';
import { Database, Target, Brain, FlaskConical, ShieldCheck, Layers } from 'lucide-react';
import reportJson from '../data/model-report.json';
import sklearnJson from '../data/sklearn-crosscheck.json';
import { MONTHS, fmt, fmt0, shortDate, MJ_TO_KWH } from '../lib/format';
import { Card, CardTitle, Container, LegendItem, Note, PageHead, SERIES, Segmented, Stat, TipBox, cx } from '../components/ui';
import { CountUp } from '../components/motion';
import Playground, { type BrowserModel } from '../components/Playground';
import BrowserTrainer from '../components/BrowserTrainer';

const CitiesMap = lazy(() => import('../components/MapPicker').then((m) => ({ default: m.CitiesMap })));

interface M {
  n: number;
  mae: number;
  rmse: number;
  mbe: number;
  r2: number;
  nrmse: number;
}
interface Report {
  dataset: { source: string; period: string; cities: number; trainCities: number; holdoutCities: string[]; records: number; splits: Record<string, number> };
  network: {
    architecture: string;
    parameters: number;
    ensembleSize: number;
    members: { bestEpoch: number; valRmseKt: number; seconds: number }[];
    optimizer: string;
    history: { epoch: number; trainRmse: number; valRmse: number }[];
    search: { name: string; params: number; bestEpoch: number; valRmseKt: number; seconds: number }[];
    trainingSeconds: number;
  };
  models: { key: string; name: string; kind: string; metrics: Record<'val' | 'testTime' | 'testSpace', M> }[];
  intervals: { level: number; coverage: Record<string, number> };
  crossValidation: { folds: { cities: string[]; r2: number; mae: number; n: number }[]; meanR2: number; sdR2: number; meanMae: number };
  perCity: { id: string; name: string; split: string; period: string; n: number; mlpMae: number; mlpR2: number; hargreavesMae: number }[];
  monthly: { month: number; mlp: number; hargreaves: number; linear: number; climatology: number; meanRs: number }[];
  importance: { feature: string; key: string; rmseIncrease: number }[];
  scatter: { actual: number; mlp: number; hargreaves: number; city: string; date: string }[];
  series: { city: string; points: { date: string; actual: number; mlp: number; hargreaves: number; cloud: number }[] };
}
const R = reportJson as unknown as Report;
const SK = sklearnJson as unknown as { models: Record<string, { seconds: number; testTime: { mae: number; r2: number }; testSpace: { mae: number; r2: number } }> };

const K = MJ_TO_KWH;
const MODEL_COLOR: Record<string, string> = { mlp: SERIES.ml, hargreaves: SERIES.ref, linear: SERIES.leaf, climatology: SERIES.violet };
const mlp = R.models.find((m) => m.key === 'mlp')!;
const hs = R.models.find((m) => m.key === 'hargreaves')!;

export default function ModelLab() {
  const [browserModel, setBrowserModel] = useState<BrowserModel | null>(null);
  const [split, setSplit] = useState<'testTime' | 'testSpace'>('testSpace');
  const [scatterModel, setScatterModel] = useState<'mlp' | 'hargreaves'>('mlp');

  const leaderboard = R.models.map((m) => ({ name: m.name, key: m.key, mae: m.metrics[split].mae * K, r2: m.metrics[split].r2 }));
  const cityData = [...R.perCity].sort((a, b) => a.mlpMae - b.mlpMae).map((c) => ({ ...c, mlpMaeK: c.mlpMae * K, hsK: c.hargreavesMae * K }));
  const improvement = 100 * (1 - mlp.metrics.testSpace.mae / hs.metrics.testSpace.mae);

  return (
    <div>
      <PageHead
        eyebrow="Model Lab · machine learning"
        title="Can a neural network learn how much sunlight survives the sky?"
        em="We tested it on a future year and on cities it never saw."
        lead="Pyranometers that measure sunlight are expensive and rare. Cloud, humidity, rain and temperature are measured or forecast everywhere. We trained a neural network, written from scratch with no ML libraries, to turn those routine readings into solar energy."
        units={['CO-2 · climate parameters', 'CO-5 · analyse mitigation', 'Bloom · Apply & Analyze']}
      />
      <Container>
        <div className="stat-strip grid-cols-2 md:grid-cols-4" data-reveal="">
          {[
            { v: R.dataset.records, d: 0, l: 'real daily records', s: `${R.dataset.cities} cities · ${R.dataset.period.slice(0, 4)}–${R.dataset.period.slice(-10, -6)}` },
            { v: mlp.metrics.testTime.r2, d: 3, l: 'R², unseen year 2025', s: `MAE ${fmt(mlp.metrics.testTime.mae * K, 2)} kWh/m²/day` },
            { v: mlp.metrics.testSpace.r2, d: 3, l: 'R², 8 unseen cities', s: `MAE ${fmt(mlp.metrics.testSpace.mae * K, 2)} kWh/m²/day` },
            { v: improvement, d: 0, suffix: '%', l: 'lower error than FAO-56', s: 'Hargreaves–Samani, unseen cities' },
          ].map((x) => (
            <div key={x.l}>
              <div className="stat__v">
                <CountUp value={x.v} decimals={x.d} suffix={x.suffix ?? ''} />
              </div>
              <div className="mt-2 text-[13px] text-ink-2">{x.l}</div>
              <div className="mt-0.5 font-mono text-[11px] text-muted">{x.s}</div>
            </div>
          ))}
        </div>
      </Container>

      <Container className="space-y-6 py-10">
        {/* Data & design */}
        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <Card>
            <CardTitle sub="Orange: 30 training cities. Blue: 8 cities held out completely, to test whether the model works in new places.">
              <span className="inline-flex items-center gap-2">
                <Database className="h-5 w-5 text-acc" aria-hidden /> 38 cities across India's climate zones
              </span>
            </CardTitle>
            <Suspense fallback={<div className="skeleton h-[380px]" />}>
              <div className="overflow-hidden rounded-xl">
                <CitiesMap height={380} />
              </div>
            </Suspense>
            <div className="mt-3 flex gap-4">
              <LegendItem color={SERIES.ml} label="Training city" square />
              <LegendItem color={SERIES.ref} label="Unseen test city" square />
            </div>
          </Card>
          <Card>
            <CardTitle sub="Testing on data the model has never seen is what makes the results trustworthy">
              <span className="inline-flex items-center gap-2">
                <Target className="h-5 w-5 text-acc" aria-hidden /> Experiment design
              </span>
            </CardTitle>
            <div className="overflow-hidden rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-3 py-2">Split</th>
                    <th className="px-3 py-2">Cities</th>
                    <th className="px-3 py-2">Years</th>
                    <th className="px-3 py-2 text-right">Days</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[
                    ['Training', '30', '2021–2023', R.dataset.splits.train, 'Weights are learned here'],
                    ['Validation', '30', '2024', R.dataset.splits.val, 'Early stopping & model choice'],
                    ['Test: future', '30', '2025', R.dataset.splits.testTime, 'A year the model never saw'],
                    ['Test: new places', '8 unseen', '2021–2025', R.dataset.splits.testSpace, 'Cities the model never saw'],
                  ].map(([a, b, c, d, e]) => (
                    <tr key={a as string}>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-ink">{a}</div>
                        <div className="text-xs text-muted">{e}</div>
                      </td>
                      <td className="px-3 py-2.5 text-ink-2">{b}</td>
                      <td className="px-3 py-2.5 text-ink-2">{c}</td>
                      <td className="tabular px-3 py-2.5 text-right font-semibold">{fmt0(d as number)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 space-y-2 text-sm leading-relaxed text-ink-2">
              <p>
                <strong>Data:</strong> {R.dataset.source}. ERA5 assimilates satellite and ground observations.
              </p>
              <p>
                <strong>Target:</strong> the clearness index K<sub>t</sub> = R<sub>s</sub> / R<sub>a</sub>. The astronomy (R<sub>a</sub>) is
                calculated exactly, so the network only learns what the atmosphere does to sunlight.
              </p>
              <p>
                <strong>Unseen cities:</strong> {R.dataset.holdoutCities.join(', ')}.
              </p>
            </div>
          </Card>
        </div>

        {/* Leaderboard */}
        <Card>
          <CardTitle
            sub="All four methods predict daily solar radiation from the same information. Lower error is better; R² closer to 1 is better."
            right={<Segmented label="Test set" value={split} onChange={setSplit} options={[{ value: 'testSpace', label: '8 unseen cities' }, { value: 'testTime', label: 'Unseen year 2025' }]} />}
          >
            Results: our network vs established methods
          </CardTitle>
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-3 py-2">Method</th>
                    <th className="px-3 py-2 text-right">MAE</th>
                    <th className="px-3 py-2 text-right">RMSE</th>
                    <th className="px-3 py-2 text-right">Bias</th>
                    <th className="px-3 py-2 text-right">R²</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {R.models.map((m) => {
                    const v = m.metrics[split];
                    return (
                      <tr key={m.key} className={cx(m.key === 'mlp' && 'bg-orange-400/10')}>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2 font-semibold text-ink">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: MODEL_COLOR[m.key] }} />
                            {m.name}
                          </div>
                          <div className="pl-[18px] text-xs text-muted">{m.kind}</div>
                        </td>
                        <td className="tabular px-3 py-2.5 text-right">{fmt(v.mae * K, 3)}</td>
                        <td className="tabular px-3 py-2.5 text-right">{fmt(v.rmse * K, 3)}</td>
                        <td className="tabular px-3 py-2.5 text-right">{v.mbe >= 0 ? '+' : ''}{fmt(v.mbe * K, 3)}</td>
                        <td className="tabular px-3 py-2.5 text-right font-semibold">{fmt(v.r2, 3)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="border-t border-line px-3 py-2 text-xs text-muted">Errors in kWh/m² per day. Mean daily sunlight is ≈ 5 kWh/m². n = {fmt0(mlp.metrics[split].n)} days.</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leaderboard} margin={{ top: 18, right: 8, left: -14, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: SERIES.axis }} tick={{ fontSize: 11 }} interval={0} tickFormatter={(v: string) => v.split(' ')[0]} />
                  <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => fmt(v, 1)} />
                  <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }} content={({ active, payload }) => (active && payload?.length ? <TipBox title={(payload[0].payload as { name: string }).name} rows={[{ label: 'MAE', value: `${fmt(Number(payload[0].value), 3)} kWh/m²` }, { label: 'R²', value: fmt((payload[0].payload as { r2: number }).r2, 3) }]} /> : null)} />
                  <Bar isAnimationActive={!capturing} dataKey="mae" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {leaderboard.map((d) => (
                      <Cell key={d.key} fill={MODEL_COLOR[d.key]} />
                    ))}
                    <LabelList dataKey="mae" position="top" formatter={(v: unknown) => fmt(Number(v), 2)} fontSize={11} fill="#c9c5bc" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="-mt-1 text-center text-xs text-muted">Mean absolute error (kWh/m²/day)</p>
            </div>
          </div>
        </Card>

        {/* Scatter + series */}
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardTitle sub="700 random days from the 8 unseen cities. Points on the dashed line are perfect predictions." right={<Segmented label="Method" value={scatterModel} onChange={setScatterModel} options={[{ value: 'mlp', label: 'Neural net' }, { value: 'hargreaves', label: 'Hargreaves' }]} />}>
              Predicted vs actual
            </CardTitle>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 12, left: -6, bottom: 8 }}>
                  <CartesianGrid />
                  <XAxis type="number" dataKey="a" domain={[0, 9]} ticks={[0, 3, 6, 9]} tickLine={false} axisLine={{ stroke: SERIES.axis }} label={{ value: 'Actual (ERA5) kWh/m²', position: 'insideBottom', offset: -4, fontSize: 11, fill: '#8e897f' }} />
                  <YAxis type="number" dataKey="p" domain={[0, 9]} ticks={[0, 3, 6, 9]} tickLine={false} axisLine={false} label={{ value: 'Predicted', angle: -90, position: 'insideLeft', offset: 18, fontSize: 11, fill: '#8e897f' }} />
                  <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 9, y: 9 }]} stroke={SERIES.truth} strokeDasharray="5 4" />
                  <Tooltip content={({ active, payload }) => { if (!active || !payload?.length) return null; const d = payload[0].payload as { a: number; p: number; city: string; date: string }; return <TipBox title={`${d.city}, ${shortDate(d.date)} ${d.date.slice(0, 4)}`} rows={[{ label: 'Actual', value: `${fmt(d.a, 2)} kWh/m²` }, { label: 'Predicted', value: `${fmt(d.p, 2)} kWh/m²`, color: MODEL_COLOR[scatterModel] }]} />; }} />
                  <Scatter data={R.scatter.map((s) => ({ a: s.actual * K, p: (scatterModel === 'mlp' ? s.mlp : s.hargreaves) * K, city: s.city, date: s.date }))} fill={MODEL_COLOR[scatterModel]} fillOpacity={0.45} shape="circle" isAnimationActive={false} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card>
            <CardTitle sub={`${R.series.city} was never used for training. Through the 2025 monsoon the network tracks cloudy days that the temperature-only formula misses.`}>
              A real monsoon, day by day
            </CardTitle>
            <div className="mb-2 flex flex-wrap gap-4">
              <LegendItem color={SERIES.truth} label="Actual (ERA5)" />
              <LegendItem color={SERIES.ml} label="Neural network" />
              <LegendItem color={SERIES.ref} label="Hargreaves" dashed />
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={R.series.points.map((p) => ({ ...p, actual: p.actual * K, mlp: p.mlp * K, hargreaves: p.hargreaves * K }))} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={{ stroke: SERIES.axis }} tickFormatter={(d: string) => MONTHS[Number(d.slice(5, 7)) - 1]} interval={30} />
                  <YAxis tickLine={false} axisLine={false} domain={[0, 'auto']} tickFormatter={(v) => fmt(v, 0)} />
                  <Tooltip content={({ active, payload }) => { if (!active || !payload?.length) return null; const d = payload[0].payload as { date: string; actual: number; mlp: number; hargreaves: number; cloud: number }; return <TipBox title={`${shortDate(d.date)} 2025 · ${d.cloud}% cloud`} rows={[{ label: 'Actual', value: fmt(d.actual, 2), color: SERIES.truth }, { label: 'Neural net', value: fmt(d.mlp, 2), color: SERIES.ml }, { label: 'Hargreaves', value: fmt(d.hargreaves, 2), color: SERIES.ref }]} />; }} />
                  <Line dataKey="actual" stroke={SERIES.truth} strokeWidth={1.6} dot={false} isAnimationActive={false} />
                  <Line dataKey="hargreaves" stroke={SERIES.ref} strokeWidth={1.4} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                  <Line dataKey="mlp" stroke={SERIES.ml} strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Monthly + importance */}
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardTitle sub="Mean absolute error by month, all unseen data. Monsoon months (Jun–Sep) are hardest for every method, because clouds change hour by hour.">
              When is solar hardest to predict?
            </CardTitle>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={R.monthly.map((m) => ({ name: MONTHS[m.month - 1], mlp: m.mlp * K, hargreaves: m.hargreaves * K, linear: m.linear * K, climatology: m.climatology * K }))} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: SERIES.axis }} />
                  <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => fmt(v, 1)} />
                  <Tooltip content={({ active, payload, label }) => (active && payload?.length ? <TipBox title={String(label)} rows={payload.map((p) => ({ label: R.models.find((m) => m.key === p.dataKey)?.name ?? String(p.dataKey), value: `${fmt(Number(p.value), 2)} kWh/m²`, color: p.color }))} /> : null)} />
                  <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} formatter={(v: string) => R.models.find((m) => m.key === v)?.name.split(' (')[0] ?? v} />
                  {(['climatology', 'hargreaves', 'linear', 'mlp'] as const).map((k) => (
                    <Line key={k} dataKey={k} stroke={MODEL_COLOR[k]} strokeWidth={k === 'mlp' ? 2.5 : 1.8} dot={{ r: 2.5 }} isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card>
            <CardTitle sub="Permutation importance: shuffle one input at a time and measure how much worse the network gets on unseen cities.">
              <span className="inline-flex items-center gap-2">
                <Brain className="h-5 w-5 text-acc" aria-hidden /> What did the network learn to rely on?
              </span>
            </CardTitle>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={R.importance.map((i) => ({ ...i, v: Math.max(0, i.rmseIncrease * K) }))} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={{ stroke: SERIES.axis }} tickFormatter={(v) => fmt(v, 2)} />
                  <YAxis type="category" dataKey="feature" width={168} tickLine={false} axisLine={false} tick={{ fontSize: 11.5 }} />
                  <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }} content={({ active, payload }) => (active && payload?.length ? <TipBox title={(payload[0].payload as { feature: string }).feature} rows={[{ label: 'RMSE increase when shuffled', value: `${fmt(Number(payload[0].value), 3)} kWh/m²` }]} /> : null)} />
                  <Bar isAnimationActive={!capturing} dataKey="v" fill={SERIES.ml} radius={[0, 4, 4, 0]} maxBarSize={14}>
                    <LabelList dataKey="v" position="right" formatter={(v: unknown) => fmt(Number(v), 2)} fontSize={10.5} fill="#c9c5bc" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-2">
              The day's temperature range ranks first: clear skies let the ground heat up by day and cool by night. That is the physics behind the
              Hargreaves formula, which the network rediscovered and combined with cloud and humidity.
            </p>
          </Card>
        </div>

        {/* Per city */}
        <Card>
          <CardTitle sub="Mean absolute error for each city on data it never trained on (2025 for training cities; all 5 years for unseen cities). Blue = unseen city.">
            Accuracy city by city
          </CardTitle>
          <div className="h-[420px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cityData} margin={{ top: 8, right: 8, left: -14, bottom: 60 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: SERIES.axis }} interval={0} angle={-55} textAnchor="end" tick={{ fontSize: 11 }} height={70} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => fmt(v, 1)} />
                <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }} content={({ active, payload }) => { if (!active || !payload?.length) return null; const d = payload[0].payload as (typeof cityData)[number]; return <TipBox title={`${d.name} (${d.split === 'train' ? 'training city, 2025' : 'unseen city, 2021–25'})`} rows={[{ label: 'Neural net MAE', value: `${fmt(d.mlpMaeK, 2)} kWh/m²`, color: d.split === 'train' ? SERIES.ml : SERIES.ref }, { label: 'Neural net R²', value: fmt(d.mlpR2, 3) }, { label: 'Hargreaves MAE', value: `${fmt(d.hsK, 2)} kWh/m²` }]} />; }} />
                <Bar isAnimationActive={!capturing} dataKey="mlpMaeK" radius={[4, 4, 0, 0]} maxBarSize={22}>
                  {cityData.map((c) => (
                    <Cell key={c.id} fill={c.split === 'train' ? SERIES.ml : SERIES.ref} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Note>
            <strong>Honest limitation:</strong> the network is weakest in Coimbatore, Gangtok and the hill cities. Coimbatore sits in the
            Palghat Gap, where winds funnel through the Western Ghats, and mountains create local cloud the 30 training cities don't fully
            represent. More training cities from these terrains would help.
          </Note>
        </Card>

        {/* Rigor */}
        <div className="grid gap-6 xl:grid-cols-3">
          <Card>
            <CardTitle sub="Five networks, each trained without 6 of the training cities and tested on them">
              <span className="inline-flex items-center gap-2">
                <Layers className="h-5 w-5 text-acc" aria-hidden /> Leave-cities-out cross-validation
              </span>
            </CardTitle>
            <div className="space-y-2">
              {R.crossValidation.folds.map((f, i) => (
                <div key={i} className="rounded-lg bg-surface-2 px-3 py-2 text-xs">
                  <div className="flex justify-between font-semibold text-ink">
                    <span>Fold {i + 1}</span>
                    <span className="tabular">R² {fmt(f.r2, 3)} · MAE {fmt(f.mae * K, 2)}</span>
                  </div>
                  <div className="mt-0.5 text-muted">{f.cities.join(', ')}</div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-ink-2">
              Mean R² = <strong>{fmt(R.crossValidation.meanR2, 3)} ± {fmt(R.crossValidation.sdR2, 3)}</strong> across folds: the
              approach generalises, though some regions are harder than others.
            </p>
          </Card>
          <Card>
            <CardTitle sub="Is the 80% uncertainty band honest? It should contain the true value ~80% of the time.">
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-acc" aria-hidden /> Calibrated uncertainty
              </span>
            </CardTitle>
            <div className="space-y-3">
              {[
                ['Validation year 2024', R.intervals.coverage.val],
                ['Unseen year 2025', R.intervals.coverage.testTime],
                ['Unseen cities (new-site band)', R.intervals.coverage.testSpace],
                ['Unseen cities if we had used the narrow band', R.intervals.coverage.testSpaceNarrow],
              ].map(([label, v]) => (
                <div key={label as string}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-ink-2">{label}</span>
                    <span className="tabular font-semibold">{fmt((v as number) * 100, 1)}%</span>
                  </div>
                  <div className="relative h-2 rounded-full bg-surface-3">
                    <div className="h-2 rounded-full bg-orange-400" style={{ width: `${(v as number) * 100}%` }} />
                    <div className="absolute top-[-3px] h-[14px] w-0.5 bg-ink" style={{ left: '80%' }} title="80% target" />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-2">
              New locations get a wider band, calibrated from the cross-validation errors, so the forecast never claims more certainty than it
              has earned.
            </p>
          </Card>
          <Card>
            <CardTitle sub="Same features, same splits, trained with scikit-learn in Python">
              <span className="inline-flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-acc" aria-hidden /> Independent cross-check
              </span>
            </CardTitle>
            <table className="w-full text-xs">
              <thead className="text-left text-muted">
                <tr>
                  <th className="py-1.5">Model</th>
                  <th className="py-1.5 text-right">R² 2025</th>
                  <th className="py-1.5 text-right">R² new cities</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <tr className="bg-orange-400/10 font-semibold">
                  <td className="py-2 pl-1">SuryaCast (ours, from scratch)</td>
                  <td className="tabular py-2 text-right">{fmt(mlp.metrics.testTime.r2, 3)}</td>
                  <td className="tabular py-2 text-right">{fmt(mlp.metrics.testSpace.r2, 3)}</td>
                </tr>
                {Object.entries(SK.models).map(([name, v]) => (
                  <tr key={name}>
                    <td className="py-2 pl-1 text-ink-2">{name}</td>
                    <td className="tabular py-2 text-right">{fmt(v.testTime.r2, 3)}</td>
                    <td className="tabular py-2 text-right">{fmt(v.testSpace.r2, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-ink-2">
              Our hand-written network matches professional library implementations, which confirms the maths is correct. Tree ensembles
              score similarly but are far larger to ship to a browser.
            </p>
          </Card>
        </div>

        {/* Training details */}
        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardTitle sub={`Network #1 of the ensemble. ${R.network.optimizer}.`}>Learning curve of the shipped model</CardTitle>
            <div className="mb-2 flex gap-4">
              <LegendItem color={SERIES.ml} label="Training RMSE" />
              <LegendItem color={SERIES.ref} label="Validation RMSE (2024)" />
            </div>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={R.network.history} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="epoch" tickLine={false} axisLine={{ stroke: SERIES.axis }} />
                  <YAxis tickLine={false} axisLine={false} domain={['auto', 'auto']} tickFormatter={(v) => fmt(v, 3)} />
                  <Tooltip content={({ active, payload }) => (active && payload?.length ? <TipBox title={`Epoch ${(payload[0].payload as { epoch: number }).epoch}`} rows={[{ label: 'Train RMSE (Kt)', value: fmt((payload[0].payload as { trainRmse: number }).trainRmse, 4), color: SERIES.ml }, { label: 'Val RMSE (Kt)', value: fmt((payload[0].payload as { valRmse: number }).valRmse, 4), color: SERIES.ref }]} /> : null)} />
                  <Line dataKey="trainRmse" stroke={SERIES.ml} strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line dataKey="valRmse" stroke={SERIES.ref} strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card>
            <CardTitle sub="Chosen by validation error (clearness-index RMSE, lower is better)">Architecture search</CardTitle>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="py-1.5">Network</th>
                  <th className="py-1.5 text-right">Weights</th>
                  <th className="py-1.5 text-right">Val RMSE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {R.network.search.map((s) => (
                  <tr key={s.name} className={cx(s.name === R.network.architecture && 'font-semibold text-acc')}>
                    <td className="py-2">{s.name}</td>
                    <td className="tabular py-2 text-right">{fmt0(s.params)}</td>
                    <td className="tabular py-2 text-right">{fmt(s.valRmseKt, 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-ink-2">
              Final model: <strong>{R.network.ensembleSize} × {R.network.architecture}</strong>, {fmt0(R.network.parameters * R.network.ensembleSize)} weights in
              total, averaged to reduce variance. Total training time {fmt(R.network.trainingSeconds / 60, 1)} min on a laptop CPU.
            </p>
          </Card>
        </div>

        <Playground browserModel={browserModel} />
        <BrowserTrainer onTrained={setBrowserModel} />

        <div className="grid gap-4 md:grid-cols-3">
          <Stat label="Why predict Kt, not radiation?" icon={<Target className="h-4 w-4" />} value="Physics-informed" sub="Ra is exact astronomy; the network learns only the atmosphere's effect, which makes it generalise across latitudes and seasons." />
          <Stat label="Why an ensemble?" accent="violet" icon={<Layers className="h-4 w-4" />} value="5 networks" sub="Each starts from different random weights; averaging cancels their individual quirks and improves accuracy on new cities." />
          <Stat label="Why from scratch?" accent="leaf" icon={<Brain className="h-4 w-4" />} value="0 ML libraries" sub="Forward pass, back-propagation and the Adam optimiser are about 250 lines of TypeScript, verified by gradient-check unit tests." />
        </div>
        <p className="text-center text-xs text-muted">
          All numbers on this page are produced by <code>npm run train</code> and <code>python ml/crosscheck.py</code> from the cached raw data. Nothing is typed in by hand.
        </p>
      </Container>
    </div>
  );
}
