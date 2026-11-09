import { useCallback, useEffect, useMemo, useState } from 'react';
import { capturing } from '../lib/fx';
import { Link } from 'react-router-dom';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  ErrorBar,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from 'recharts';
import {
  Zap,
  Leaf,
  IndianRupee,
  Trophy,
  RefreshCw,
  WifiOff,
  Cpu,
  Radio,
  WashingMachine,
  PlugZap,
  Droplets,
  ArrowRight,
  AlertTriangle,
  Sigma,
} from 'lucide-react';
import { useAppState, useModel } from '../state';
import { fetchForecast, loadSnapshot, weatherLabel, type ForecastResult } from '../lib/openmeteo';
import { runPipeline, pearson, type DayResult } from '../lib/pipeline';
import { DEFAULT_SYSTEM } from '../lib/pv';
import { INDIA_GRID_EF_KG_PER_KWH } from '../lib/carbon';
import { fmt, fmt0, mass, rupees, shortDate, weekday, MJ_TO_KWH } from '../lib/format';
import PlacePicker from '../components/PlacePicker';
import SystemPanel from '../components/SystemPanel';
import WeatherIcon from '../components/WeatherIcon';
import { Card, CardTitle, Container, LegendItem, Note, PageHead, SERIES, Stat, TipBox, cx } from '../components/ui';

type Status = 'loading' | 'ok' | 'error';

export default function Forecast() {
  const { place, settings, tilt } = useAppState();
  const { model, error: modelError } = useModel();
  const [fc, setFc] = useState<ForecastResult | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [err, setErr] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setErr('');
    try {
      const r = await fetchForecast(place.lat, place.lon, 7, 7);
      setFc(r);
      setStatus('ok');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, [place.lat, place.lon]);

  useEffect(() => {
    load();
    setSelected(null);
  }, [load]);

  const useSnapshot = async () => {
    try {
      setFc(await loadSnapshot());
      setStatus('ok');
    } catch {
      setErr('Snapshot unavailable');
    }
  };

  const sys = useMemo(
    () => ({ ...DEFAULT_SYSTEM, capacityKw: settings.capacityKw, tiltDeg: tilt, bosEfficiency: settings.bosEfficiency, tempCoeff: settings.tempCoeff }),
    [settings.capacityKw, settings.bosEfficiency, settings.tempCoeff, tilt],
  );

  const rows: (DayResult & { isPast: boolean; isToday: boolean; code: number })[] = useMemo(() => {
    if (!model || !fc) return [];
    const site = { lat: fc.lat, lon: fc.lon, elevation: fc.elevation ?? place.elevation ?? 0 };
    return fc.days.map((d) => ({
      ...runPipeline(model, d, site, sys, settings.tariffRs),
      isPast: d.isPast,
      isToday: d.isToday,
      code: d.weatherCode,
    }));
  }, [model, fc, sys, settings.tariffRs, place.elevation]);

  const future = rows.filter((r) => !r.isPast);
  const week = future.slice(0, 7);
  const totals = useMemo(
    () => ({
      kwh: week.reduce((s, r) => s + r.kwh, 0),
      lo: week.reduce((s, r) => s + r.kwhLo, 0),
      hi: week.reduce((s, r) => s + r.kwhHi, 0),
      co2: week.reduce((s, r) => s + r.co2Kg, 0),
      rs: week.reduce((s, r) => s + r.rupees, 0),
    }),
    [week],
  );
  const best = week.length ? week.reduce((a, b) => (b.kwh > a.kwh ? b : a)) : null;
  const worst = week.length ? week.reduce((a, b) => (b.kwh < a.kwh ? b : a)) : null;
  const sel = rows.find((r) => r.date === selected) ?? best ?? rows[0];

  const agreement = useMemo(() => {
    const pairs = rows.filter((r) => r.nwpGhi != null);
    if (pairs.length < 3) return null;
    const a = pairs.map((r) => r.ghi);
    const b = pairs.map((r) => r.nwpGhi as number);
    const mae = a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
    const meanB = b.reduce((s, v) => s + v, 0) / b.length;
    const points = pairs.map((r) => ({ ml: r.ghi * MJ_TO_KWH, nwp: (r.nwpGhi as number) * MJ_TO_KWH, date: r.date }));
    // Same rounded scale on both axes so the 1:1 line sits at exactly 45 degrees.
    const axisMax = Math.max(2, 2 * Math.ceil(Math.max(...points.map((p) => Math.max(p.ml, p.nwp))) / 2));
    const ticks = Array.from({ length: axisMax / 2 + 1 }, (_, i) => i * 2);
    return { n: a.length, mae, r: pearson(a, b), pct: (100 * mae) / meanB, points, axisMax, ticks };
  }, [rows]);

  const chartData = rows.map((r) => ({
    date: r.date,
    label: `${weekday(r.date)} ${shortDate(r.date)}`,
    kwh: r.kwh,
    err: [r.kwh - r.kwhLo, r.kwhHi - r.kwh],
    nwp: r.nwpKwh,
    lo: r.kwhLo,
    hi: r.kwhHi,
    isPast: r.isPast,
    cloud: r.weather.cloudMean,
  }));
  const todayIdx = chartData.findIndex((d) => !d.isPast);

  return (
    <div>
      <PageHead
        eyebrow="The working model · live"
        title="How much electricity will your roof make?"
        em="This week."
        lead="Live weather for your location goes through a neural network trained on 69,388 days of real Indian weather. It predicts how much sunlight will reach your roof, and engineering physics turns that into electricity, CO₂ avoided and money saved."
        units={['Unit V · Solar energy', 'Unit III · Energy & emissions', "Unit II · Earth's energy balance"]}
        right={<PlacePicker />}
      />

      <Container className="py-8">
        {/* Status line */}
        <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-2">
          <span className="inline-flex items-center gap-2">
            {status === 'ok' && fc?.source === 'live' && (
              <>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                Live forecast · fetched {new Date(fc.fetchedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </>
            )}
            {status === 'ok' && fc?.source === 'snapshot' && (
              <>
                <WifiOff className="h-4 w-4 text-amber-400" aria-hidden /> Offline snapshot ({shortDate(fc.fetchedAt.slice(0, 10))}, Chennai)
              </>
            )}
            {status === 'loading' && (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> Fetching live weather…
              </>
            )}
          </span>
          <span className="inline-flex items-center gap-2">
            <Cpu className="h-4 w-4 text-acc" aria-hidden />
            {model ? `Neural network loaded (${model.nets.length}-network ensemble), running in your browser` : modelError ? `Model error: ${modelError}` : 'Loading neural network…'}
          </span>
          {rows[0] && (
            <span
              className={cx(
                'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                rows[0].knownSite ? 'bg-orange-400/10 text-orange-400' : 'bg-blue-400/10 text-blue-400',
              )}
              title={rows[0].knownSite ? 'Within 30 km of a training city' : 'The model never saw this place during training; uncertainty bands are wider'}
            >
              {rows[0].knownSite ? 'Training-region site' : 'New site · wider uncertainty'}
            </span>
          )}
          <button onClick={load} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold hover:border-acc/40">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Refresh
          </button>
        </div>

        {status === 'error' && (
          <div className="mb-8 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-400" aria-hidden />
              <div className="flex-1">
                <div className="font-semibold text-amber-100">Couldn't reach the live weather service</div>
                <p className="mt-1 text-sm text-amber-200">
                  {err}. Check the internet connection and retry, or run the model on the saved Chennai snapshot to demonstrate it offline.
                </p>
                <div className="mt-3 flex gap-2">
                  <button onClick={load} className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white">
                    Retry
                  </button>
                  <button onClick={useSnapshot} className="rounded-lg border border-amber-400/30 bg-surface-2 px-3 py-1.5 text-sm font-semibold text-amber-200">
                    Use offline snapshot
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              {rows.length ? (
                <>
                  <Stat
                    label="Next 7 days"
                    icon={<Zap className="h-4 w-4" />}
                    num={totals.kwh}
                    unit="kWh"
                    sub={`80% range ${fmt(totals.lo, 0)}–${fmt(totals.hi, 0)} kWh from ${fmt(settings.capacityKw, 1)} kWp`}
                  />
                  <Stat
                    label="CO₂ kept out of the air"
                    accent="leaf"
                    icon={<Leaf className="h-4 w-4" />}
                    num={totals.co2}
                    unit="kg"
                    sub={`vs. India's coal-heavy grid (${INDIA_GRID_EF_KG_PER_KWH} kg CO₂/kWh)`}
                  />
                  <Stat
                    label="Bill savings"
                    accent="sky"
                    icon={<IndianRupee className="h-4 w-4" />}
                    value={rupees(totals.rs)}
                    sub={`at ₹${settings.tariffRs}/unit · ≈ ${rupees(totals.rs * (365 / 7))} a year at this rate`}
                  />
                  <Stat
                    label="Sunniest day ahead"
                    accent="violet"
                    icon={<Trophy className="h-4 w-4" />}
                    value={best ? weekday(best.date) : '–'}
                    unit={best ? shortDate(best.date) : ''}
                    sub={best ? `${fmt(best.kwh, 1)} kWh · ${weatherLabel(best.code).toLowerCase()}` : ''}
                  />
                </>
              ) : (
                [0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-36" />)
              )}
            </div>

            {/* Main chart */}
            <Card>
              <CardTitle
                sub="Bars: SuryaCast neural-network prediction, with whiskers for the 80% prediction interval. Dots: the same physics fed with the weather model's own radiation forecast, as a cross-check."
                right={
                  <div className="flex flex-wrap gap-4">
                    <LegendItem color={SERIES.ml} label="SuryaCast (ML)" square />
                    <LegendItem color={SERIES.ref} label="Weather-model radiation" />
                  </div>
                }
              >
                Daily solar electricity, past week and next week
              </CardTitle>
              <div className="h-80">
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 10, right: 8, left: -12, bottom: 0 }} onClick={(e) => {
                      const d = (e as { activeLabel?: string; activePayload?: { payload: { date: string } }[] })?.activePayload?.[0]?.payload;
                      if (d) setSelected(d.date);
                    }}>
                      <CartesianGrid vertical={false} />
                      {todayIdx > 0 && (
                        <ReferenceArea x1={chartData[0].label} x2={chartData[todayIdx - 1].label} fill="#ffffff" fillOpacity={0.025} ifOverflow="extendDomain" label={{ value: 'PAST 7 DAYS', position: 'insideTop', fill: '#8e897f', fontSize: 10 }} />
                      )}
                      <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: SERIES.axis }} interval={0} tick={{ fontSize: 11 }} angle={-35} textAnchor="end" height={54} />
                      <YAxis tickLine={false} axisLine={false} unit=" kWh" width={64} />
                      <Tooltip
                        cursor={{ fill: 'rgba(255,197,61,0.05)' }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload as (typeof chartData)[number];
                          return (
                            <TipBox
                              title={`${d.label}${d.isPast ? ' (past)' : ''}`}
                              rows={[
                                { label: 'SuryaCast', value: `${fmt(d.kwh, 1)} kWh`, color: SERIES.ml },
                                { label: '80% range', value: `${fmt(d.lo, 1)}–${fmt(d.hi, 1)}` },
                                ...(d.nwp != null ? [{ label: 'Weather model', value: `${fmt(d.nwp, 1)} kWh`, color: SERIES.ref }] : []),
                                { label: 'Cloud cover', value: `${d.cloud}%` },
                              ]}
                            />
                          );
                        }}
                      />
                      <Bar isAnimationActive={!capturing} dataKey="kwh" radius={[4, 4, 0, 0]} maxBarSize={34} cursor="pointer">
                        {chartData.map((d) => (
                          <Cell key={d.date} fill={SERIES.ml} fillOpacity={d.isPast ? 0.45 : sel?.date === d.date ? 1 : 0.85} stroke={sel?.date === d.date ? '#ffc53d' : undefined} strokeWidth={sel?.date === d.date ? 2 : 0} />
                        ))}
                        <ErrorBar dataKey="err" width={5} strokeWidth={1.5} stroke="#c9c5bc" />
                      </Bar>
                      <Line dataKey="nwp" stroke={SERIES.ref} strokeWidth={0} dot={{ r: 4.5, fill: SERIES.ref, stroke: '#fff', strokeWidth: 2 }} activeDot={false} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="skeleton h-full" />
                )}
              </div>
              <p className="mt-2 text-xs text-muted">Tip: click any bar to see exactly how the model calculated that day.</p>
            </Card>

            {/* Day cards */}
            {week.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
                {week.map((r) => {
                  const maxK = Math.max(...week.map((w) => w.kwh));
                  return (
                    <button
                      key={r.date}
                      onClick={() => setSelected(r.date)}
                      className={cx(
                        'card flex flex-col items-start gap-2 p-3.5 text-left transition hover:-translate-y-0.5 hover:border-acc/40',
                        sel?.date === r.date && 'border-acc/70 ring-2 ring-acc/25',
                      )}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="text-sm font-semibold text-ink">{r.isToday ? 'Today' : weekday(r.date)}</span>
                        <WeatherIcon code={r.code} className="h-5 w-5" />
                      </div>
                      <span className="text-[11px] text-muted">{shortDate(r.date)} · {weatherLabel(r.code)}</span>
                      <span className="font-display text-2xl font-bold text-ink">
                        {fmt(r.kwh, 1)}
                        <span className="ml-1 text-xs font-medium text-muted">kWh</span>
                      </span>
                      <span className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                        <span className="block h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${(100 * r.kwh) / maxK}%` }} />
                      </span>
                      <span className="text-[11px] text-ink-2">
                        ☁ {r.weather.cloudMean}% · {Math.round(r.weather.tmax)}°/{Math.round(r.weather.tmin)}°
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Explain the day */}
            {sel && <ExplainDay r={sel} capacity={settings.capacityKw} tilt={tilt} tariff={settings.tariffRs} bos={settings.bosEfficiency} />}

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              {/* Load shifting */}
              {best && worst && (
                <Card>
                  <CardTitle sub="Run heavy appliances when your own panels are producing. That cuts both your bill and the grid's evening coal peak.">
                    Smart-usage planner
                  </CardTitle>
                  <div className="space-y-3">
                    {[
                      { icon: <WashingMachine className="h-5 w-5" />, task: 'Washing machine & dishwasher', kwh: 1.2 },
                      { icon: <Droplets className="h-5 w-5" />, task: 'Water pump / overhead tank', kwh: 0.8 },
                      { icon: <PlugZap className="h-5 w-5" />, task: 'EV / e-scooter charging', kwh: 3 },
                    ].map((t) => (
                      <div key={t.task} className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
                        <span className="grid h-10 w-10 place-items-center rounded-lg bg-surface-2 text-acc shadow-sm">{t.icon}</span>
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-ink">{t.task}</div>
                          <div className="text-xs text-muted">
                            Best: <strong className="text-ink-2">{weekday(best.date)} {shortDate(best.date)}</strong>, 10 am – 2 pm · avoid{' '}
                            {weekday(worst.date)}
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-emerald-400">−{fmt(t.kwh * INDIA_GRID_EF_KG_PER_KWH, 1)} kg CO₂</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Cross-check */}
              {agreement && (
                <Card>
                  <CardTitle sub="The weather model calculates radiation with full atmospheric physics. Our network only sees cloud, humidity, rain and temperature, so close agreement shows it has learned real physics.">
                    Live cross-check vs the weather model
                  </CardTitle>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-xl bg-surface-2 p-3">
                      <div className="font-display text-2xl font-bold">{fmt(agreement.r, 2)}</div>
                      <div className="text-[11px] text-muted">correlation r</div>
                    </div>
                    <div className="rounded-xl bg-surface-2 p-3">
                      <div className="font-display text-2xl font-bold">{fmt(agreement.mae * MJ_TO_KWH, 2)}</div>
                      <div className="text-[11px] text-muted">mean gap, kWh/m²</div>
                    </div>
                    <div className="rounded-xl bg-surface-2 p-3">
                      <div className="font-display text-2xl font-bold">{fmt(agreement.pct, 0)}%</div>
                      <div className="text-[11px] text-muted">relative gap</div>
                    </div>
                  </div>
                  <div className="mt-3 h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 8, right: 8, left: -18, bottom: 10 }}>
                        <CartesianGrid />
                        <XAxis type="number" dataKey="nwp" name="Weather model" domain={[0, agreement.axisMax]} ticks={agreement.ticks} tickLine={false} axisLine={{ stroke: SERIES.axis }} label={{ value: 'Weather model (kWh/m²)', position: 'insideBottom', offset: -10, fontSize: 11, fill: '#8e897f' }} height={40} />
                        <YAxis type="number" dataKey="ml" name="SuryaCast" domain={[0, agreement.axisMax]} ticks={agreement.ticks} tickLine={false} axisLine={false} />
                        <ReferenceLine segment={[{ x: 0, y: 0 }, { x: agreement.axisMax, y: agreement.axisMax }]} stroke={SERIES.axis} strokeDasharray="4 4" />
                        <Tooltip content={({ active, payload }) => active && payload?.length ? (
                          <TipBox title={shortDate((payload[0].payload as { date: string }).date)} rows={[
                            { label: 'SuryaCast', value: `${fmt((payload[0].payload as { ml: number }).ml, 2)} kWh/m²`, color: SERIES.ml },
                            { label: 'Weather model', value: `${fmt((payload[0].payload as { nwp: number }).nwp, 2)} kWh/m²`, color: SERIES.ref },
                          ]} />) : null} />
                        <Scatter isAnimationActive={!capturing} data={agreement.points} fill={SERIES.ml} stroke="#fff" strokeWidth={1.5} />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-muted">Dashed line = perfect agreement. {agreement.n} days compared (past and forecast).</p>
                </Card>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <aside className="space-y-6">
            <div className="lg:sticky lg:top-24">
              <SystemPanel />
              <div className="mt-6">
                <Note>
                  Want the full-year picture: annual generation, payback, carbon credits and the PM Surya Ghar subsidy?{' '}
                  <Link to="/planner" className="inline-flex items-center gap-1 font-semibold text-sky-300 underline">
                    Open the Impact Planner <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Note>
              </div>
            </div>
          </aside>
        </div>
      </Container>
    </div>
  );
}

function Step({ n, title, formula, children, icon }: { n: number; title: string; formula?: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <li className="relative pl-12">
      <span className="absolute left-0 top-0 grid h-8 w-8 place-items-center rounded-full bg-surface-3/60 text-xs font-bold text-white">{icon ?? n}</span>
      <div className="font-semibold text-ink">{title}</div>
      <div className="mt-1 text-sm leading-relaxed text-ink-2">{children}</div>
      {formula && <code className="mt-2 inline-block rounded-lg bg-surface-3 px-2.5 py-1 font-mono text-xs text-ink">{formula}</code>}
    </li>
  );
}

function ExplainDay({ r, capacity, tilt, tariff, bos }: { r: DayResult & { isPast: boolean; isToday: boolean; code: number }; capacity: number; tilt: number; tariff: number; bos: number }) {
  const w = r.weather;
  return (
    <Card className="overflow-hidden" pad={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-3/60 px-6 py-4 text-white">
        <div className="flex items-center gap-3">
          <Sigma className="h-5 w-5 text-gold" aria-hidden />
          <div>
            <div className="font-semibold">How the model calculated {r.isToday ? 'today' : `${weekday(r.date)} ${shortDate(r.date)}`}</div>
            <div className="text-xs text-white/60">Every number below is computed live, step by step</div>
          </div>
        </div>
        <span className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs">
          <Radio className="h-3.5 w-3.5" aria-hidden /> {weatherLabel(r.code)}
        </span>
      </div>
      <ol className="grid grid-cols-1 gap-7 p-6 md:grid-cols-2">
        <Step n={1} title="Read the weather forecast">
          Cloud cover {w.cloudMean}% (range {w.cloudMin}–{w.cloudMax}%), humidity {w.rh}%, rain {fmt(w.precip, 1)} mm over {fmt(w.precipHours, 0)} h, temperature{' '}
          {fmt(w.tmin, 1)}–{fmt(w.tmax, 1)} °C.
        </Step>
        <Step n={2} title="Sunlight at the top of the atmosphere" formula={`Ra = ${fmt(r.ra, 2)} MJ/m²  ·  daylight ${fmt(r.daylight, 1)} h`}>
          Pure astronomy (FAO-56): Earth–Sun distance, solar declination and latitude decide how much sunlight arrives before any clouds.
        </Step>
        <Step n={3} title="Neural network: how clear is the sky?" formula={`Kt = ${fmt(r.kt, 3)}  (80%: ${fmt(r.ktLo, 2)}–${fmt(r.ktHi, 2)})`}>
          13 engineered features → 5 neural networks (13→64→32→1) → averaged. Kt is the fraction of that sunlight that survives clouds, water vapour and haze.
        </Step>
        <Step n={4} title="Solar energy reaching the ground" formula={`GHI = Kt × Ra = ${fmt(r.ghi, 2)} MJ/m² = ${fmt(r.ghi * MJ_TO_KWH, 2)} kWh/m²`}>
          This is the global horizontal irradiation, the quantity a ₹20,000+ pyranometer would measure.
        </Step>
        <Step n={5} title={`Onto your panel, tilted ${tilt}° south`} formula={`POA = ${fmt(r.poaKwh, 2)} kWh/m²  ·  diffuse ${fmt(r.diffuseFraction * 100, 0)}%`}>
          The Erbs correlation splits sunlight into direct and diffuse parts. Liu–Jordan geometry then transposes them onto the tilted plane.
        </Step>
        <Step n={6} title="Heat lowers efficiency" formula={`T_cell ≈ ${fmt(r.cellTemp, 1)} °C  →  ×${fmt(r.tempFactor, 3)}`}>
          Silicon cells lose ~0.37% power per °C above 25 °C. This is also why heat waves, made worse by global warming, cut solar output.
        </Step>
        <Step n={7} title="Electricity from your system" formula={`E = ${fmt(capacity, 1)} kWp × ${fmt(r.poaKwh, 2)} × ${fmt(bos, 2)} × ${fmt(r.tempFactor, 3)} = ${fmt(r.kwh, 2)} kWh`}>
          Capacity × sunlight on the panel × balance-of-system efficiency × temperature factor.
        </Step>
        <Step n={8} title="Climate & money impact" formula={`CO₂ = ${fmt(r.kwh, 2)} × ${INDIA_GRID_EF_KG_PER_KWH} = ${fmt(r.co2Kg, 2)} kg  ·  ₹${fmt0(r.kwh * tariff)}`}>
          Each solar kWh replaces a grid kWh that would have emitted {INDIA_GRID_EF_KG_PER_KWH} kg CO₂ (CEA, FY 2023-24). That's {mass(r.co2Kg)} avoided.
        </Step>
      </ol>
    </Card>
  );
}
