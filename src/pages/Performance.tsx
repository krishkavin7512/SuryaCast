import { useState } from 'react';
import { capturing } from '../lib/fx';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, AlertTriangle, Cpu, Sigma, CloudSun, Layers, ShieldCheck, ArrowRight } from 'lucide-react';
import perfJson from '../data/performance.json';
import reportJson from '../data/model-report.json';
import sklearnJson from '../data/sklearn-crosscheck.json';
import { Card, CardTitle, Container, LegendItem, Note, PageHead, SERIES, Segmented, TipBox, cx } from '../components/ui';
import { CountUp } from '../components/motion';
import { fmt, fmt0 } from '../lib/format';

type SplitKey = 'val' | 'testTime' | 'testSpace';
interface Row {
  n: number;
  mae: number;
  rmse: number;
  mbe: number;
  r2: number;
  r: number;
  nrmse: number;
  skill: number;
  within05: number;
  within10: number;
}
interface Perf {
  models: { key: string; name: string; metrics: Record<SplitKey, Row> }[];
  ci: Record<'mlp' | 'hargreaves' | 'linear', { mae: [number, number]; r2: [number, number] }>;
  bySky: { label: string; range: string; n: number; share: number; mlp: number; hargreaves: number; linear: number; meanGhi: number }[];
  residuals: { bin: number; mlp: number; hargreaves: number }[];
  horizons: Record<'mlp' | 'hargreaves' | 'linear', { daily: number; weekly: number; monthly: number; yearly: number; dailyKwhMae: number; meanDailyKwh: number }>;
  byZone: { zone: string; n: number; cities: string[]; mlpMae: number; mlpR2: number; hsMae: number }[];
  seasons: { label: string; n: number; mlpMae: number; mlpR2: number; hsMae: number; hsR2: number }[];
  inference: { usPerPrediction: number; weightsPerNetwork: number; networks: number; modelKb: number };
}
const P = perfJson as unknown as Perf;
const R = reportJson as unknown as {
  network: { architecture: string; trainingSeconds: number; ensembleSize: number };
  crossValidation: { meanR2: number; sdR2: number; folds: unknown[] };
  intervals: { coverage: Record<string, number> };
  dataset: { records: number };
};
const SK = sklearnJson as unknown as { models: Record<string, { testTime: { r2: number; mae: number }; testSpace: { r2: number; mae: number } }> };

const COLOR: Record<string, string> = { mlp: SERIES.ml, hargreaves: SERIES.ref, linear: SERIES.leaf, climatology: SERIES.violet };
const SHORT: Record<string, string> = { mlp: 'SuryaCast NN', hargreaves: 'Hargreaves', linear: 'Linear', climatology: 'Climatology' };
const SPLITS: { value: SplitKey; label: string }[] = [
  { value: 'testSpace', label: '8 unseen cities' },
  { value: 'testTime', label: 'Unseen year 2025' },
  { value: 'val', label: 'Validation 2024' },
];

const mlp = P.models.find((m) => m.key === 'mlp')!;
const hs = P.models.find((m) => m.key === 'hargreaves')!;
const clear = P.bySky[0];
const overcast = P.bySky[P.bySky.length - 1];

export default function Performance() {
  const [split, setSplit] = useState<SplitKey>('testSpace');
  const ciRows = (['mlp', 'linear', 'hargreaves'] as const).map((k) => ({ key: k, name: SHORT[k], lo: P.ci[k].r2[0], hi: P.ci[k].r2[1], point: P.models.find((m) => m.key === k)!.metrics.testSpace.r2 }));
  const horizonData = (['daily', 'weekly', 'monthly', 'yearly'] as const).map((h) => ({
    h: h[0].toUpperCase() + h.slice(1),
    mlp: P.horizons.mlp[h],
    linear: P.horizons.linear[h],
    hargreaves: P.horizons.hargreaves[h],
  }));

  return (
    <div>
      <PageHead
        eyebrow="Performance & analysis"
        title="How good is the model?"
        em="Every number measured on data it never saw."
        lead="A full scorecard for the SuryaCast neural network. It is compared with three alternatives and broken down by sky, season, climate zone and forecast horizon, with statistical confidence intervals. All values are recomputed from the shipped model file on real held-out ERA5 data."
        units={['CO-5 · analyse mitigation', 'Bloom · Analyze & Evaluate', 'Unit III · Physical evidence']}
      />

      <Container className="space-y-6">
        {/* Headline */}
        <div className="stat-strip grid-cols-2 lg:grid-cols-5" data-reveal="">
          {[
            { v: mlp.metrics.testTime.r2, d: 3, l: 'R², unseen year 2025', s: `explains ${fmt(mlp.metrics.testTime.r2 * 100, 0)}% of daily variation` },
            { v: mlp.metrics.testSpace.r2, d: 3, l: 'R², 8 unseen cities', s: `95% CI ${fmt(P.ci.mlp.r2[0], 3)}–${fmt(P.ci.mlp.r2[1], 3)}` },
            { v: mlp.metrics.testSpace.mae, d: 2, l: 'MAE, kWh/m²/day', s: `RMSE ${fmt(mlp.metrics.testSpace.rmse, 2)} · bias ${mlp.metrics.testSpace.mbe >= 0 ? '+' : ''}${fmt(mlp.metrics.testSpace.mbe, 2)}` },
            { v: mlp.metrics.testSpace.skill * 100, d: 0, suffix: '%', l: 'skill vs climatology', s: '1 − MSE / MSE of monthly average' },
            { v: P.horizons.mlp.monthly, d: 1, suffix: '%', l: 'error on monthly energy', s: `daily ${fmt(P.horizons.mlp.daily, 1)}% → yearly ${fmt(P.horizons.mlp.yearly, 1)}%` },
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

        {/* Full metrics */}
        <Card>
          <CardTitle
            sub="Errors in kWh/m² per day (mean daily sunlight ≈ 5). Bias = average over- (+) or under-prediction. Skill = improvement over simply using the monthly average. 'Within' = share of days predicted to within that error."
            right={<Segmented label="Test set" value={split} onChange={setSplit} options={SPLITS} />}
          >
            Complete metrics scorecard
          </CardTitle>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-surface-2 text-left font-mono text-[11px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-2.5">Method</th>
                  {['MAE', 'RMSE', 'Bias', 'R²', 'Pearson r', 'nRMSE', 'Skill', '±0.5', '±1.0'].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-right">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {P.models.map((m) => {
                  const v = m.metrics[split];
                  const best = m.key === 'mlp';
                  return (
                    <tr key={m.key} className={cx(best && 'bg-[#e0621f]/[0.08]')}>
                      <td className="px-3 py-3">
                        <span className={cx('inline-flex items-center gap-2', best ? 'font-semibold text-ink' : 'text-ink-2')}>
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR[m.key] }} />
                          {m.name}
                        </span>
                      </td>
                      {[fmt(v.mae, 3), fmt(v.rmse, 3), `${v.mbe >= 0 ? '+' : ''}${fmt(v.mbe, 3)}`, fmt(v.r2, 3), fmt(v.r, 3), `${fmt(v.nrmse, 1)}%`, `${fmt(v.skill * 100, 1)}%`, `${fmt(v.within05, 1)}%`, `${fmt(v.within10, 1)}%`].map((c, i) => (
                        <td key={i} className={cx('px-3 py-3 text-right font-mono', best ? 'text-ink' : 'text-ink-2')}>
                          {c}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 font-mono text-[11px] text-muted">n = {fmt0(mlp.metrics[split].n)} days · climatology has 0% skill by definition</p>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          {/* Significance */}
          <Card>
            <CardTitle sub="1,000 bootstrap resamples of the 14,608 unseen-city days. Bars show the 95% confidence interval of R²; the dot is the measured value.">
              <span className="inline-flex items-center gap-2">
                <Sigma className="h-5 w-5 text-acc" aria-hidden /> Is the improvement real? Statistical significance
              </span>
            </CardTitle>
            <div className="space-y-5 pt-2">
              {ciRows.map((c) => (
                <div key={c.key}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="flex items-center gap-2 text-ink-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR[c.key] }} />
                      {c.name}
                    </span>
                    <span className="font-mono text-ink">
                      {fmt(c.point, 3)} <span className="text-muted">[{fmt(c.lo, 3)}, {fmt(c.hi, 3)}]</span>
                    </span>
                  </div>
                  <div className="relative h-3 rounded-full bg-surface-3">
                    <div className="absolute top-0 h-3 rounded-full opacity-60" style={{ left: `${c.lo * 100}%`, width: `${Math.max(0.6, (c.hi - c.lo) * 100)}%`, background: COLOR[c.key] }} />
                    <div className="absolute -top-0.5 h-4 w-1 rounded-full bg-ink" style={{ left: `${c.point * 100}%` }} />
                  </div>
                </div>
              ))}
              <div className="flex justify-between font-mono text-[10px] text-muted">
                <span>R² 0</span>
                <span>0.5</span>
                <span>1.0</span>
              </div>
            </div>
            <div className="mt-4 flex gap-3 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.07] p-3 text-sm text-ink-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
              <span>
                The intervals do not overlap, so the network's advantage is <strong className="text-ink">statistically significant</strong>, not luck of the sample.
                Its MAE interval is {fmt(P.ci.mlp.mae[0], 3)}–{fmt(P.ci.mlp.mae[1], 3)} against {fmt(P.ci.hargreaves.mae[0], 3)}–{fmt(P.ci.hargreaves.mae[1], 3)} kWh/m² for FAO-56.
              </span>
            </div>
          </Card>

          {/* Residuals */}
          <Card>
            <CardTitle sub="Prediction minus actual for every unseen-city day, as a share of days. A tall, narrow peak at zero means small, unbiased errors.">
              Error distribution
            </CardTitle>
            <div className="mb-2 flex gap-4">
              <LegendItem color={SERIES.ml} label="SuryaCast NN" square />
              <LegendItem color={SERIES.ref} label="Hargreaves (FAO-56)" square />
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={P.residuals.map((r) => ({ ...r, edge: Number((r.bin - 0.125).toFixed(2)) }))} margin={{ top: 8, right: 8, left: -14, bottom: 0 }} barGap={1} barCategoryGap={2}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="edge" tickLine={false} axisLine={{ stroke: SERIES.axis }} interval={3} tickFormatter={(v) => `${Number(v) > 0 ? '+' : ''}${fmt(Number(v), 0)}`} />
                  <YAxis tickLine={false} axisLine={false} unit="%" />
                  <ReferenceLine x={0} stroke="#c9c5bc" strokeDasharray="3 3" />
                  <Tooltip cursor={{ fill: 'rgba(255,197,61,0.05)' }} content={({ active, payload }) => (active && payload?.length ? <TipBox title={`Error ${fmt((payload[0].payload as { bin: number }).bin - 0.125, 2)} to ${fmt((payload[0].payload as { bin: number }).bin + 0.125, 2)} kWh/m²`} rows={[{ label: 'SuryaCast NN', value: `${fmt((payload[0].payload as { mlp: number }).mlp, 1)}% of days`, color: SERIES.ml }, { label: 'Hargreaves', value: `${fmt((payload[0].payload as { hargreaves: number }).hargreaves, 1)}% of days`, color: SERIES.ref }]} /> : null)} />
                  <Bar isAnimationActive={!capturing} dataKey="hargreaves" fill={SERIES.ref} radius={[3, 3, 0, 0]} />
                  <Bar isAnimationActive={!capturing} dataKey="mlp" fill={SERIES.ml} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-sm text-ink-2">
              {fmt(mlp.metrics.testSpace.within05, 0)}% of the network's daily predictions land within ±0.5 kWh/m², against {fmt(hs.metrics.testSpace.within05, 0)}% for the formula. The formula's errors are wide and
              skewed because temperature range alone cannot see clouds.
            </p>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          {/* Sky */}
          <Card>
            <CardTitle sub="Mean absolute error grouped by the day's mean cloud cover (all unseen data: 2025 + 8 unseen cities).">
              <span className="inline-flex items-center gap-2">
                <CloudSun className="h-5 w-5 text-acc" aria-hidden /> Accuracy by sky condition
              </span>
            </CardTitle>
            <div className="mb-2 flex flex-wrap gap-4">
              <LegendItem color={SERIES.ml} label="SuryaCast NN" square />
              <LegendItem color={SERIES.leaf} label="Linear" square />
              <LegendItem color={SERIES.ref} label="Hargreaves" square />
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={P.bySky} margin={{ top: 16, right: 8, left: -14, bottom: 0 }} barGap={2}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: SERIES.axis }} />
                  <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => fmt(v, 1)} />
                  <Tooltip cursor={{ fill: 'rgba(255,197,61,0.05)' }} content={({ active, payload }) => { if (!active || !payload?.length) return null; const d = payload[0].payload as Perf['bySky'][number]; return <TipBox title={`${d.label} (${d.range}) · ${fmt(d.share, 0)}% of days`} rows={[{ label: 'SuryaCast NN', value: `${fmt(d.mlp, 2)} kWh/m²`, color: SERIES.ml }, { label: 'Linear', value: `${fmt(d.linear, 2)}`, color: SERIES.leaf }, { label: 'Hargreaves', value: `${fmt(d.hargreaves, 2)}`, color: SERIES.ref }, { label: 'Mean sunlight', value: `${fmt(d.meanGhi, 2)} kWh/m²` }]} />; }} />
                  <Bar isAnimationActive={!capturing} dataKey="mlp" fill={SERIES.ml} radius={[4, 4, 0, 0]} maxBarSize={28}>
                    <LabelList dataKey="mlp" position="top" formatter={(v: unknown) => fmt(Number(v), 2)} fontSize={10.5} fill="#c9c5bc" />
                  </Bar>
                  <Bar isAnimationActive={!capturing} dataKey="linear" fill={SERIES.leaf} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar isAnimationActive={!capturing} dataKey="hargreaves" fill={SERIES.ref} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-sm text-ink-2">
              On clear days the network is <strong className="text-ink">{fmt(clear.hargreaves / clear.mlp, 1)}× more accurate</strong> than FAO-56 ({fmt(clear.mlp, 2)} vs {fmt(clear.hargreaves, 2)}). Overcast days ({fmt(overcast.share, 0)}% of all days) are the hardest for
              every method, because a daily cloud average cannot say <em>when</em> the clouds passed.
            </p>
          </Card>

          {/* Horizon */}
          <Card>
            <CardTitle sub="Electricity forecast error for a 3 kWp roof in the 8 unseen cities, as a % of actual generation. Day-to-day errors partly cancel when added up.">
              Accuracy grows with the forecast horizon
            </CardTitle>
            <div className="mb-2 flex flex-wrap gap-4">
              <LegendItem color={SERIES.ml} label="SuryaCast NN" />
              <LegendItem color={SERIES.leaf} label="Linear" />
              <LegendItem color={SERIES.ref} label="Hargreaves" />
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={horizonData} margin={{ top: 16, right: 16, left: -14, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="h" tickLine={false} axisLine={{ stroke: SERIES.axis }} />
                  <YAxis tickLine={false} axisLine={false} unit="%" domain={[0, 'auto']} />
                  <Tooltip content={({ active, payload, label }) => (active && payload?.length ? <TipBox title={`${label} totals`} rows={payload.map((p) => ({ label: SHORT[String(p.dataKey)], value: `${fmt(Number(p.value), 1)}% error`, color: p.color }))} /> : null)} />
                  <Line dataKey="hargreaves" stroke={SERIES.ref} strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
                  <Line dataKey="linear" stroke={SERIES.leaf} strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
                  <Line dataKey="mlp" stroke={SERIES.ml} strokeWidth={2.5} dot={{ r: 5 }} isAnimationActive={false}>
                    <LabelList dataKey="mlp" position="top" formatter={(v: unknown) => `${fmt(Number(v), 1)}%`} fontSize={11} fill="#f4f1ea" />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-sm text-ink-2">
              A typical day's generation ({fmt(P.horizons.mlp.meanDailyKwh, 1)} kWh) is forecast within ±{fmt(P.horizons.mlp.dailyKwhMae, 2)} kWh on average. Monthly totals, which matter for bills and
              payback, are within <strong className="text-ink">{fmt(P.horizons.mlp.monthly, 1)}%</strong>. Over a full year the plain linear model is about as good
              ({fmt(P.horizons.linear.yearly, 1)}%), because there long-term bias matters more than day-to-day skill.
            </p>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          {/* Seasons */}
          <Card>
            <CardTitle sub="All unseen data, split by Indian season">Performance through the Indian year</CardTitle>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="bg-surface-2 text-left font-mono text-[11px] uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-3 py-2.5">Season</th>
                    <th className="px-3 py-2.5 text-right">Days</th>
                    <th className="px-3 py-2.5 text-right">NN MAE</th>
                    <th className="px-3 py-2.5 text-right">NN R²</th>
                    <th className="px-3 py-2.5 text-right">FAO-56 R²</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {P.seasons.map((s) => (
                    <tr key={s.label}>
                      <td className="px-3 py-2.5 text-ink">{s.label}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-ink-2">{fmt0(s.n)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-ink">{fmt(s.mlpMae, 2)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-ink">{fmt(s.mlpR2, 3)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted">{fmt(s.hsR2, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-ink-2">
              The south-west monsoon has the largest errors, but the network keeps R² ≈ {fmt(P.seasons[2].mlpR2, 2)} there. The FAO-56 formula falls below zero after the monsoon (worse than guessing the mean),
              when humid, cloudy days keep the temperature range small regardless of sunshine.
            </p>
          </Card>

          {/* Zones */}
          <Card>
            <CardTitle sub="All unseen data grouped by the city's climate zone, sorted from most to least accurate">Performance by climate zone</CardTitle>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={P.byZone} layout="vertical" margin={{ top: 0, right: 48, left: 8, bottom: 0 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={{ stroke: SERIES.axis }} tickFormatter={(v) => fmt(v, 1)} />
                  <YAxis type="category" dataKey="zone" width={150} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                  <Tooltip cursor={{ fill: 'rgba(255,197,61,0.05)' }} content={({ active, payload }) => { if (!active || !payload?.length) return null; const d = payload[0].payload as Perf['byZone'][number]; return <TipBox title={d.zone} rows={[{ label: 'NN MAE', value: `${fmt(d.mlpMae, 2)} kWh/m²`, color: SERIES.ml }, { label: 'NN R²', value: fmt(d.mlpR2, 3) }, { label: 'FAO-56 MAE', value: fmt(d.hsMae, 2) }, { label: 'Cities', value: d.cities.join(', ').slice(0, 60) }]} />; }} />
                  <Bar isAnimationActive={!capturing} dataKey="mlpMae" radius={[0, 4, 4, 0]} maxBarSize={14}>
                    {P.byZone.map((z) => (
                      <Cell key={z.zone} fill={/hill/i.test(z.zone) ? SERIES.violet : SERIES.ml} />
                    ))}
                    <LabelList dataKey="mlpMae" position="right" formatter={(v: unknown) => fmt(Number(v), 2)} fontSize={10.5} fill="#c9c5bc" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-sm text-ink-2">Dry climates (hot-dry, cold-dry) are easiest: skies are either clear or clearly cloudy. Hill stations (violet) and humid zones are hardest, because terrain-driven and convective clouds come and go within a day and a daily average hides them.</p>
          </Card>
        </div>

        {/* Robustness + model card */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <Layers className="h-5 w-5 text-acc" aria-hidden /> Robustness
              </span>
            </CardTitle>
            <dl className="space-y-2.5 text-sm">
              {[
                ['Leave-cities-out CV (5 folds)', `R² ${fmt(R.crossValidation.meanR2, 3)} ± ${fmt(R.crossValidation.sdR2, 3)}`],
                ['80% interval coverage, 2025', `${fmt(R.intervals.coverage.testTime * 100, 1)}%`],
                ['80% interval coverage, new cities', `${fmt(R.intervals.coverage.testSpace * 100, 1)}%`],
                ['Bias (unseen cities)', `${mlp.metrics.testSpace.mbe >= 0 ? '+' : ''}${fmt(mlp.metrics.testSpace.mbe, 3)} kWh/m²`],
                ['Validation → 2025 R² drop', fmt(mlp.metrics.val.r2 - mlp.metrics.testTime.r2, 3)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-line pb-2 last:border-0">
                  <dt className="text-muted">{k}</dt>
                  <dd className="font-mono text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-acc" aria-hidden /> Independent cross-check
              </span>
            </CardTitle>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-3 border-b border-line pb-2">
                <dt className="font-semibold text-ink">SuryaCast (from scratch)</dt>
                <dd className="font-mono text-ink">R² {fmt(mlp.metrics.testSpace.r2, 3)}</dd>
              </div>
              {Object.entries(SK.models).map(([name, v]) => (
                <div key={name} className="flex justify-between gap-3 border-b border-line pb-2 last:border-0">
                  <dt className="text-muted">{name}</dt>
                  <dd className="font-mono text-ink-2">R² {fmt(v.testSpace.r2, 3)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-muted">scikit-learn models trained on the same features and splits (unseen cities). The hand-written network performs on par.</p>
          </Card>
          <Card>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <Cpu className="h-5 w-5 text-acc" aria-hidden /> Model card
              </span>
            </CardTitle>
            <dl className="space-y-2.5 text-sm">
              {[
                ['Architecture', `${R.network.ensembleSize} × ${R.network.architecture}`],
                ['Weights', `${fmt0(P.inference.weightsPerNetwork * P.inference.networks)} (${fmt0(P.inference.weightsPerNetwork)} per network)`],
                ['Training data', `${fmt0(R.dataset.records)} days, 38 cities`],
                ['Training time', `${fmt(R.network.trainingSeconds / 60, 1)} min, laptop CPU`],
                ['Model file', `${P.inference.modelKb} kB JSON`],
                ['Inference', `${fmt(P.inference.usPerPrediction, 0)} µs per day`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-line pb-2 last:border-0">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right font-mono text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>

        {/* Findings */}
        <Card>
          <CardTitle sub="What the analysis shows, in plain words">Key findings</CardTitle>
          <div className="grid gap-4 md:grid-cols-2">
            <ul className="space-y-3 text-sm leading-relaxed text-ink-2">
              {[
                `Generalises to new places: R² ${fmt(mlp.metrics.testSpace.r2, 2)} on 8 cities never used in training, and ${fmt(mlp.metrics.testTime.r2, 2)} on a future year.`,
                `Beats the textbook method: ${fmt(100 * (1 - mlp.metrics.testSpace.mae / hs.metrics.testSpace.mae), 0)}% lower error than FAO-56 Hargreaves–Samani, and the gap is statistically significant (non-overlapping 95% CIs).`,
                `Useful for planning: monthly solar energy is predicted within ${fmt(P.horizons.mlp.monthly, 1)}%, accurate enough for bill savings and payback estimates.`,
                `Nearly unbiased (${mlp.metrics.testSpace.mbe >= 0 ? '+' : ''}${fmt(mlp.metrics.testSpace.mbe, 2)} kWh/m²/day), and its 80% uncertainty bands are honestly calibrated.`,
              ].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
            <ul className="space-y-3 text-sm leading-relaxed text-ink-2">
              {[
                `Overcast and monsoon days remain hardest (MAE ${fmt(overcast.mlp, 2)} kWh/m² when cloud > 80%): daily averages hide when the clouds passed.`,
                'Hill and complex-terrain cities (Coimbatore, Gangtok, Shimla) are the weakest; more training cities from these regions would help.',
                'Trained and tested on ERA5 reanalysis, not ground pyranometers. Real panels add shading, dust and wiring effects not modelled here.',
                'In the live tool, accuracy also depends on the weather forecast it is fed, which degrades beyond 3–4 days.',
              ].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-acc" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Note>
          Reproduce: <code className="font-mono text-ink">npm run train</code> then <code className="font-mono text-ink">npm run analyze</code>. The analysis reloads the shipped model and fails if its accuracy differs from the training report.{' '}
          <Link to="/model" className="inline-flex items-center gap-1 font-semibold text-acc">
            Try the model in the Model Lab <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </Note>
      </Container>
    </div>
  );
}
