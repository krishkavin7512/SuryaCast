import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ComposedChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Atom, Flame, Sun, Waves } from 'lucide-react';
import climate from '../data/climate.json';
import { linearFit, movingAverage } from '../lib/climate';
import { dailyPvEnergy, DEFAULT_SYSTEM } from '../lib/pv';
import { fmt } from '../lib/format';
import GreenhouseSim from '../components/GreenhouseSim';
import { Card, CardTitle, Container, LegendItem, PageHead, SERIES, Slider, TipBox } from '../components/ui';

interface Climate {
  co2Monthly: [number, number, number][];
  co2Annual: [number, number][];
  gistemp: [number, number][];
  co2Temp: { points: { year: number; co2: number; t: number }[]; slope: number; intercept: number; r2: number; perDoubling: number; perDoublingSe: number; n: number };
  india: { baselineAbsC: number; series: [number, number][]; trend1901: { perDecade: number; to: number }; trend1971: { perDecade: number; se: number }; change: number };
}
const C = climate as unknown as Climate;

export default function Science() {
  const keeling = useMemo(() => C.co2Monthly.map(([x, avg, trend]) => ({ x, avg, trend })), []);
  const gis = useMemo(() => C.gistemp.map(([year, t]) => ({ year, t })), []);
  const india = useMemo(() => {
    const ma = movingAverage(C.india.series.map((s) => s[1]), 11);
    return C.india.series.map(([year, t], i) => ({ year, t, ma: ma[i] }));
  }, []);
  const co2T = useMemo(() => {
    const pts = C.co2Temp.points;
    const fit = linearFit(pts.map((p) => Math.log(p.co2 / 280)), pts.map((p) => p.t));
    return { pts, line: [300, 330, 360, 390, 430].map((c) => ({ co2: c, fit: fit.a + fit.b * Math.log(c / 280) })) };
  }, []);
  const latestCo2 = C.co2Annual[C.co2Annual.length - 1];
  const firstCo2 = C.co2Annual[0];
  const latestT = C.gistemp[C.gistemp.length - 1];
  const warmest = [...C.gistemp].sort((a, b) => b[1] - a[1]).slice(0, 3);

  const [amb, setAmb] = useState(35);
  const pvDay = (tmax: number) => dailyPvEnergy({ ghi: 22, tmax, tmin: tmax - 9, lat: 23, doy: 140 }, { ...DEFAULT_SYSTEM, capacityKw: 1, tiltDeg: 23 });
  const ref = pvDay(25);
  const hot = pvDay(amb);

  return (
    <div>
      <PageHead
        eyebrow="Climate science · Units I–III"
        title="Why does a rooftop panel matter?"
        em="Follow the heat."
        lead="Burning coal for electricity adds CO₂. CO₂ traps outgoing heat. Trapped heat warms the planet, and India with it. Here is the principle, then the measured evidence, built from the original datasets."
        units={['Unit I · Greenhouse effect & carbon cycle', "Unit II · Earth's energy balance & heat waves", 'Unit III · Warming evidence']}
      />

      <Container className="space-y-6 py-10">
        <GreenhouseSim />

        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: <Atom className="h-5 w-5" />, k: `${fmt(latestCo2[1], 1)} ppm`, l: `CO₂ in ${latestCo2[0]} (Mauna Loa)`, s: `up from ${fmt(firstCo2[1], 1)} ppm in ${firstCo2[0]} and ~280 ppm before industry` },
            { icon: <Flame className="h-5 w-5" />, k: `+${fmt(latestT[1], 2)} °C`, l: `Global temperature, ${latestT[0]}`, s: `vs 1951–80 average (NASA GISTEMP). Warmest years: ${warmest.map((w) => w[0]).join(', ')}` },
            { icon: <Sun className="h-5 w-5" />, k: `+${fmt(C.india.change, 2)} °C`, l: 'India has warmed', s: `2011–20 vs 1901–30 (Berkeley Earth); now ${fmt(C.india.trend1971.perDecade, 2)} °C per decade since 1971` },
          ].map((x) => (
            <div key={x.l} className="card p-5">
              <div className="mb-2 grid h-9 w-9 place-items-center rounded-lg bg-acc/10 text-acc">{x.icon}</div>
              <div className="font-display text-3xl font-bold text-ink">{x.k}</div>
              <div className="text-sm font-semibold text-ink-2">{x.l}</div>
              <div className="mt-1 text-xs text-muted">{x.s}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardTitle sub="Monthly CO₂ at Mauna Loa Observatory since 1958. The yearly zig-zag is the Northern Hemisphere's forests breathing: the carbon cycle in action.">
              The Keeling curve
            </CardTitle>
            <div className="mb-2 flex gap-4">
              <LegendItem color={SERIES.ref} label="Monthly mean" />
              <LegendItem color={SERIES.truth} label="Seasonally adjusted" />
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={keeling} margin={{ top: 8, right: 8, left: -6, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="x" type="number" domain={[1958, 2027]} ticks={[1960, 1980, 2000, 2020]} tickLine={false} axisLine={{ stroke: SERIES.axis }} />
                  <YAxis domain={[310, 435]} tickLine={false} axisLine={false} unit=" ppm" width={64} />
                  <Tooltip content={({ active, payload }) => (active && payload?.length ? <TipBox title={fmt((payload[0].payload as { x: number }).x, 2)} rows={[{ label: 'Monthly', value: `${fmt((payload[0].payload as { avg: number }).avg, 2)} ppm`, color: SERIES.ref }, { label: 'Adjusted', value: `${fmt((payload[0].payload as { trend: number }).trend, 2)} ppm`, color: SERIES.truth }]} /> : null)} />
                  <Line dataKey="avg" stroke={SERIES.ref} strokeWidth={1.2} dot={false} isAnimationActive={false} />
                  <Line dataKey="trend" stroke={SERIES.truth} strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card>
            <CardTitle sub="Global land-ocean temperature anomaly vs the 1951–1980 average (NASA GISTEMP v4). Blue = cooler, red = warmer.">
              145 years of global temperature
            </CardTitle>
            <div className="h-[310px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={gis} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap={1}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: SERIES.axis }} ticks={[1880, 1920, 1960, 2000, 2025]} />
                  <YAxis tickLine={false} axisLine={false} unit=" °C" width={56} />
                  <ReferenceLine y={0} stroke={SERIES.axis} />
                  <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={({ active, payload }) => (active && payload?.length ? <TipBox title={String((payload[0].payload as { year: number }).year)} rows={[{ label: 'Anomaly', value: `${Number(payload[0].value) > 0 ? '+' : ''}${fmt(Number(payload[0].value), 2)} °C` }]} /> : null)} />
                  <Bar dataKey="t" isAnimationActive={false}>
                    {gis.map((d) => (
                      <Cell key={d.year} fill={d.t >= 0 ? `rgba(227,73,72,${0.35 + Math.min(0.65, d.t / 1.4)})` : `rgba(42,120,214,${0.35 + Math.min(0.65, -d.t / 0.5)})`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardTitle sub={`Each dot is one year (${C.co2Temp.points[0].year}–${C.co2Temp.points[C.co2Temp.points.length - 1].year}). Warming rises with the logarithm of CO₂, as greenhouse physics predicts.`}>
              CO₂ vs temperature: our regression
            </CardTitle>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart margin={{ top: 8, right: 8, left: -10, bottom: 8 }}>
                  <CartesianGrid />
                  <XAxis dataKey="co2" type="number" domain={[310, 435]} tickLine={false} axisLine={{ stroke: SERIES.axis }} label={{ value: 'CO₂ (ppm)', position: 'insideBottom', offset: -4, fontSize: 11, fill: '#8e897f' }} />
                  <YAxis dataKey="t" type="number" domain={[-0.3, 1.4]} tickLine={false} axisLine={false} unit=" °C" width={56} />
                  <Tooltip content={({ active, payload }) => { if (!active || !payload?.length) return null; const d = payload[0].payload as { year?: number; co2: number; t?: number; fit?: number }; return d.year ? <TipBox title={String(d.year)} rows={[{ label: 'CO₂', value: `${fmt(d.co2, 1)} ppm` }, { label: 'Anomaly', value: `${fmt(d.t ?? 0, 2)} °C` }]} /> : null; }} />
                  <Scatter data={co2T.pts} fill={SERIES.red} fillOpacity={0.7} isAnimationActive={false} />
                  <Line data={co2T.line} dataKey="fit" stroke={SERIES.truth} strokeWidth={2} dot={false} strokeDasharray="6 4" isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 rounded-xl bg-surface-2 p-3 text-sm text-ink-2">
              Fit: T = {fmt(C.co2Temp.intercept, 2)} + {fmt(C.co2Temp.slope, 2)} · ln(CO₂/280), R² = {fmt(C.co2Temp.r2, 3)}. That implies about{' '}
              <strong>
                {fmt(C.co2Temp.perDoubling, 1)} ± {fmt(C.co2Temp.perDoublingSe, 1)} °C per doubling of CO₂
              </strong>
              . This is a simple statistical estimate: other gases and aerosols changed alongside CO₂.
            </div>
          </Card>
          <Card>
            <CardTitle sub={`Annual mean land temperature of India relative to 1951–1980 (Berkeley Earth, to ${C.india.trend1901.to}), with an 11-year moving average.`}>
              India is warming too
            </CardTitle>
            <div className="mb-2 flex gap-4">
              <LegendItem color={SERIES.red} label="Annual" />
              <LegendItem color={SERIES.truth} label="11-year average" />
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={india} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: SERIES.axis }} ticks={[1880, 1920, 1960, 2000, 2020]} type="number" domain={['dataMin', 'dataMax']} />
                  <YAxis tickLine={false} axisLine={false} unit=" °C" width={56} />
                  <ReferenceLine y={0} stroke={SERIES.axis} />
                  <Tooltip content={({ active, payload }) => (active && payload?.length ? <TipBox title={String((payload[0].payload as { year: number }).year)} rows={[{ label: 'Anomaly', value: `${fmt((payload[0].payload as { t: number }).t, 2)} °C`, color: SERIES.red }]} /> : null)} />
                  <Line dataKey="t" stroke={SERIES.red} strokeWidth={1.2} strokeOpacity={0.6} dot={false} isAnimationActive={false} />
                  <Line dataKey="ma" stroke={SERIES.truth} strokeWidth={2.4} dot={false} connectNulls={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-sm text-ink-2">
              Trend since 1971: <strong>+{fmt(C.india.trend1971.perDecade, 2)} ± {fmt(C.india.trend1971.se, 2)} °C per decade</strong>. A
              warmer India means more frequent heat waves, which also hurt solar panels (below).
            </p>
          </Card>
        </div>

        <Card>
          <CardTitle sub="A climate feedback that matters for solar engineering: silicon cells lose efficiency as they heat up. Heat waves, made more frequent by global warming, cut output just when air-conditioning demand peaks.">
            <span className="inline-flex items-center gap-2">
              <Waves className="h-5 w-5 text-acc" aria-hidden /> The heat-wave paradox
            </span>
          </CardTitle>
          <div className="grid gap-8 md:grid-cols-[1fr_1.2fr] md:items-center">
            <div className="space-y-4">
              <Slider label="Afternoon air temperature" value={amb} min={20} max={48} onChange={setAmb} display={`${amb} °C`} hint="Same sunshine (6.1 kWh/m²), only the air temperature changes. IMD declares a heat wave when plains reach 40 °C or more and run well above normal." />
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-surface-2 p-3">
                  <div className="font-display text-2xl font-bold">{fmt(hot.cellTemp, 0)} °C</div>
                  <div className="text-[11px] text-muted">panel temperature</div>
                </div>
                <div className="rounded-xl bg-surface-2 p-3">
                  <div className="font-display text-2xl font-bold">{fmt(hot.kwh, 2)}</div>
                  <div className="text-[11px] text-muted">kWh per kWp</div>
                </div>
                <div className="rounded-xl bg-red-400/10 p-3">
                  <div className="font-display text-2xl font-bold text-red-400">−{fmt(100 * (1 - hot.kwh / ref.kwh), 1)}%</div>
                  <div className="text-[11px] text-red-300">vs a 25 °C day</div>
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-surface-2 p-5 text-sm leading-relaxed text-ink-2">
              <div className="mb-2 font-semibold text-ink">Adaptation measures (Unit V)</div>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>Choose panels with a low temperature coefficient (TOPCon / HJT ≈ −0.26 to −0.30 %/°C).</li>
                <li>Mount panels with an air gap so wind can cool them; avoid flush mounting on hot roofs.</li>
                <li>Light-coloured "cool roof" coatings under and around arrays lower roof and cell temperature.</li>
                <li>Regular cleaning: dust from pre-monsoon storms cuts output further.</li>
              </ul>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle sub="How the pieces of this project connect">From the syllabus to the rooftop</CardTitle>
          <div className="grid gap-4 md:grid-cols-4">
            {[
              ['1 · Cause', 'Coal power plants supply most of India\'s electricity and emit 0.727 kg CO₂ per unit on average (CEA).'],
              ['2 · Mechanism', 'CO₂ absorbs outgoing infrared: +3.7 W/m² per doubling. Earth warms until it radiates the extra heat away.'],
              ['3 · Evidence', 'CO₂ 316 → 427 ppm since 1959; global +1.2 °C vs 1951–80; India +0.9 °C, with stronger heat waves and erratic monsoons.'],
              ['4 · Mitigation', 'Rooftop solar replaces grid coal power. SuryaCast forecasts it so homes and grids can plan around clouds.'],
            ].map(([t, d]) => (
              <div key={t} className="rounded-2xl border border-line p-4">
                <div className="font-display text-lg font-bold text-acc">{t}</div>
                <p className="mt-1 text-sm text-ink-2">{d}</p>
              </div>
            ))}
          </div>
        </Card>
      </Container>
    </div>
  );
}
