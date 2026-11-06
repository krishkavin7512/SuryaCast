import { useEffect, useMemo, useState } from 'react';
import { capturing } from '../lib/fx';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  ErrorBar,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LabelList,
} from 'recharts';
import { Sun, Leaf, Wallet, Timer, TreePine, BadgeIndianRupee, Factory, Recycle, Building2, Globe2, Loader2, Landmark } from 'lucide-react';
import { useAppState } from '../state';
import { loadHistory, type HistoryData } from '../lib/openmeteo';
import { simulateHistory } from '../lib/planner';
import { DEFAULT_SYSTEM } from '../lib/pv';
import {
  INDIA_GRID_EF_KG_PER_KWH,
  LIFECYCLE_G_PER_KWH,
  SYSTEM_LIFE_YEARS,
  TREE_SEEDLING_10Y_KG,
  carbonPaybackYears,
  lifetimeProjection,
  paybackYears,
  pmSuryaGharSubsidy,
} from '../lib/carbon';
import { MONTHS, fmt, fmt0, mass, rupees } from '../lib/format';
import PlacePicker from '../components/PlacePicker';
import SystemPanel from '../components/SystemPanel';
import { Card, CardTitle, Container, LegendItem, NumberField, Note, PageHead, SERIES, Slider, Stat, TipBox } from '../components/ui';

export default function Planner() {
  const { place, settings, tilt } = useAppState();
  const [hist, setHist] = useState<HistoryData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [consumption, setConsumption] = useState(250);
  const [creditPrice, setCreditPrice] = useState(400);
  const [homes, setHomes] = useState(6); // log10 scale

  useEffect(() => {
    let alive = true;
    setHist(null);
    setErr(null);
    loadHistory(place)
      .then((h) => alive && setHist(h))
      .catch((e) => alive && setErr(String(e.message || e)));
    return () => {
      alive = false;
    };
  }, [place]);

  const sys = useMemo(
    () => ({ ...DEFAULT_SYSTEM, capacityKw: settings.capacityKw, tiltDeg: tilt, bosEfficiency: settings.bosEfficiency, tempCoeff: settings.tempCoeff }),
    [settings.capacityKw, tilt, settings.bosEfficiency, settings.tempCoeff],
  );
  const sim = useMemo(() => (hist ? simulateHistory(hist, place.lat, sys) : null), [hist, place.lat, sys]);

  const econ = useMemo(() => {
    if (!sim) return null;
    const gross = settings.capacityKw * settings.costPerKwRs;
    const subsidy = pmSuryaGharSubsidy(settings.capacityKw);
    const net = Math.max(0, gross - subsidy);
    const proj = lifetimeProjection({ firstYearKwh: sim.annualKwh, tariffRs: settings.tariffRs, netCostRs: net, tariffEscalation: 0.02 });
    const lifetimeKwh = proj.reduce((s, p) => s + p.kwh, 0);
    const lifetimeCo2 = proj.reduce((s, p) => s + p.co2Kg, 0);
    const embodied = (lifetimeKwh * 41) / 1000;
    return {
      gross,
      subsidy,
      net,
      proj,
      payback: paybackYears(proj, net),
      lifetimeKwh,
      lifetimeCo2,
      netCo2: lifetimeCo2 - embodied,
      embodied,
      carbonPayback: carbonPaybackYears(lifetimeKwh, sim.annualKwh),
      firstYearSavings: proj[0].savingsRs,
      net25: proj[proj.length - 1].cumulativeCashRs,
    };
  }, [sim, settings]);

  const annualCo2 = sim ? sim.annualKwh * INDIA_GRID_EF_KG_PER_KWH : 0;
  const recommendedKw = sim ? (consumption * 12) / sim.specificYield : 0;
  const homesN = Math.round(10 ** homes);
  const scaleKwh = sim ? homesN * 3 * sim.specificYield : 0;

  const monthData = sim?.monthly.map((m) => ({
    name: MONTHS[m.month - 1],
    mean: m.mean,
    err: [m.mean - m.min, m.max - m.mean],
    min: m.min,
    max: m.max,
    use: consumption,
    ghi: m.ghiKwhM2,
    tmax: m.meanTmax,
  }));
  const peak = sim ? sim.monthly.reduce((a, b) => (b.mean > a.mean ? b : a)) : null;
  const low = sim ? sim.monthly.reduce((a, b) => (b.mean < a.mean ? b : a)) : null;

  const lca = [...LIFECYCLE_G_PER_KWH].sort((a, b) => b.g - a.g);

  return (
    <div>
      <PageHead
        eyebrow="Mitigation planner"
        title="A year on your roof:"
        em="energy, carbon and rupees."
        lead="Five real years (2021–2025) of daily sunlight and temperature at your location are replayed through the same engineering model, so monsoon dips and year-to-year swings show up in the results."
        units={['Unit V · Solar, LCA, sustainability', 'Unit IV · Carbon credits & CDM', 'Unit III · Energy & emissions']}
        right={<PlacePicker />}
      />

      <Container className="py-8">
        {err && (
          <div className="mb-6">
            <Note tone="warn">Couldn't load climate history for this place ({err}). Pick one of the 38 bundled cities to work offline.</Note>
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 space-y-6">
            {!sim ? (
              <div className="flex h-64 items-center justify-center gap-3 text-ink-2">
                <Loader2 className="h-5 w-5 animate-spin" /> Replaying 5 years of weather…
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                  <Stat label="Electricity per year" icon={<Sun className="h-4 w-4" />} num={sim.annualKwh} decimals={0} unit="kWh" sub={`${fmt0(sim.specificYield)} kWh per kWp · range ${fmt0(sim.worstYear)}–${fmt0(sim.bestYear)} across ${sim.years.length} years`} />
                  <Stat label="CO₂ avoided per year" accent="leaf" icon={<Leaf className="h-4 w-4" />} num={annualCo2 / 1000} decimals={2} unit="tonnes" sub={`${mass(econ!.lifetimeCo2)} over ${SYSTEM_LIFE_YEARS} years`} />
                  <Stat label="Payback period" accent="sky" icon={<Timer className="h-4 w-4" />} value={econ!.payback ? undefined : '> 25'} num={econ!.payback ?? undefined} decimals={1} unit="years" sub={`net cost ${rupees(econ!.net)} after ${rupees(econ!.subsidy)} subsidy`} />
                  <Stat label="25-year net gain" accent="violet" icon={<Wallet className="h-4 w-4" />} value={rupees(econ!.net25)} sub="bill savings minus net cost, tariff rising 2%/yr" />
                </div>

                <Card>
                  <CardTitle
                    sub={`Mean monthly generation for ${fmt(settings.capacityKw, 1)} kWp; whiskers show the best and worst of ${sim.years.length} years. Line: your monthly use.`}
                    right={
                      <div className="flex gap-4">
                        <LegendItem color={SERIES.ml} label="Solar generation" square />
                        <LegendItem color={SERIES.truth} label="Your consumption" dashed />
                      </div>
                    }
                  >
                    Month by month
                  </CardTitle>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={monthData} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: SERIES.axis }} />
                        <YAxis tickLine={false} axisLine={false} unit=" kWh" width={70} />
                        <Tooltip
                          cursor={{ fill: 'rgba(255,197,61,0.05)' }}
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0].payload as NonNullable<typeof monthData>[number];
                            return (
                              <TipBox
                                title={d.name}
                                rows={[
                                  { label: 'Mean generation', value: `${fmt0(d.mean)} kWh`, color: SERIES.ml },
                                  { label: 'Worst / best year', value: `${fmt0(d.min)} / ${fmt0(d.max)}` },
                                  { label: 'Sunlight (GHI)', value: `${fmt(d.ghi, 2)} kWh/m²/day` },
                                  { label: 'Mean max temp', value: `${fmt(d.tmax, 1)} °C` },
                                  { label: 'Consumption', value: `${fmt0(d.use)} kWh`, color: SERIES.truth },
                                ]}
                              />
                            );
                          }}
                        />
                        <Bar isAnimationActive={!capturing} dataKey="mean" fill={SERIES.ml} radius={[4, 4, 0, 0]} maxBarSize={40}>
                          <ErrorBar dataKey="err" width={5} stroke="#c9c5bc" strokeWidth={1.5} />
                        </Bar>
                        <Line dataKey="use" stroke={SERIES.truth} strokeDasharray="5 4" strokeWidth={2} dot={false} isAnimationActive={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  {peak && low && (
                    <p className="mt-3 text-sm text-ink-2">
                      <strong>Observation:</strong> generation peaks in <strong>{MONTHS[peak.month - 1]}</strong> ({fmt0(peak.mean)} kWh) and drops to{' '}
                      <strong>{fmt0(low.mean)} kWh</strong> in <strong>{MONTHS[low.month - 1]}</strong>, a{' '}
                      {fmt(100 * (1 - low.mean / peak.mean), 0)}% swing driven by monsoon cloud. This variability is exactly why the grid needs solar
                      forecasting.
                    </p>
                  )}
                </Card>

                {/* Sizing */}
                <Card>
                  <CardTitle sub="Size the system to your electricity bill">Right-size your system</CardTitle>
                  <div className="grid gap-6 md:grid-cols-[1fr_1.2fr] md:items-center">
                    <NumberField label="Your monthly electricity use" value={consumption} min={0} step={10} suffix="units (kWh) / month" onChange={setConsumption} />
                    <div className="rounded-2xl bg-surface-2 p-4 text-sm leading-relaxed text-ink-2">
                      To cover <strong>{fmt0(consumption)} units/month</strong> here you need about{' '}
                      <strong className="text-lg text-ink">{fmt(recommendedKw, 1)} kWp</strong> ({Math.ceil((recommendedKw * 1000) / 550)} panels, ~{Math.round(recommendedKw * 10)} m² roof). Your{' '}
                      {fmt(settings.capacityKw, 1)} kWp system covers{' '}
                      <strong>{fmt(Math.min(100, (100 * sim.annualKwh) / Math.max(1, consumption * 12)), 0)}%</strong> of your yearly use.
                    </div>
                  </div>
                </Card>

                {/* Carbon credits */}
                <div className="grid gap-6 xl:grid-cols-2">
                  <Card>
                    <CardTitle sub="Kyoto Protocol → Clean Development Mechanism → Paris Article 6.4 → India's Carbon Credit Trading Scheme">
                      Carbon credits earned
                    </CardTitle>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-emerald-400/10 p-4">
                        <div className="text-xs font-medium text-emerald-300">Credits per year</div>
                        <div className="font-display text-3xl font-bold text-emerald-200">{fmt(annualCo2 / 1000, 2)}</div>
                        <div className="text-xs text-emerald-300">1 credit = 1 tonne CO₂e avoided</div>
                      </div>
                      <div className="rounded-xl bg-emerald-400/10 p-4">
                        <div className="text-xs font-medium text-emerald-300">Value over {SYSTEM_LIFE_YEARS} yrs</div>
                        <div className="font-display text-3xl font-bold text-emerald-200">{rupees((econ!.lifetimeCo2 / 1000) * creditPrice)}</div>
                        <div className="text-xs text-emerald-300">at ₹{fmt0(creditPrice)} per credit</div>
                      </div>
                    </div>
                    <div className="mt-4">
                      <Slider label="Assumed credit price" value={creditPrice} min={100} max={2000} step={50} onChange={setCreditPrice} display={`₹${fmt0(creditPrice)} / tCO₂e`} hint="Illustrative only: voluntary renewable-energy credit prices vary widely and India's market is still forming." />
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-ink-2">
                      A single home is too small to register on its own. Under the CDM, thousands of rooftops are bundled into a{' '}
                      <em>Programme of Activities</em>; the same idea continues under the Paris Agreement's Article 6.4 mechanism and India's
                      Carbon Credit Trading Scheme (2023).
                    </p>
                  </Card>

                  <Card>
                    <CardTitle sub="Equivalents make the numbers tangible">What {mass(econ!.lifetimeCo2)} of CO₂ looks like</CardTitle>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
                        <TreePine className="h-8 w-8 text-emerald-400" aria-hidden />
                        <div>
                          <div className="font-display text-2xl font-bold">{fmt0(econ!.lifetimeCo2 / TREE_SEEDLING_10Y_KG)}</div>
                          <div className="text-xs text-muted">tree seedlings grown for 10 years (US EPA: 60 kg CO₂ each)</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
                        <Factory className="h-8 w-8 text-muted" aria-hidden />
                        <div>
                          <div className="font-display text-2xl font-bold">{fmt(econ!.lifetimeCo2 / 1000 / 2, 1)}</div>
                          <div className="text-xs text-muted">person-years of an average Indian's fossil CO₂ (≈2 t per person per year, Global Carbon Project)</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
                        <Recycle className="h-8 w-8 text-sky-400" aria-hidden />
                        <div>
                          <div className="font-display text-2xl font-bold">{fmt(econ!.carbonPayback, 1)} yrs</div>
                          <div className="text-xs text-muted">carbon payback: time to cancel the panel's own manufacturing footprint ({mass(econ!.embodied)})</div>
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>

                {/* Money */}
                <Card>
                  <CardTitle
                    sub={`Gross ${rupees(econ!.gross)} − PM Surya Ghar subsidy ${rupees(econ!.subsidy)} = ${rupees(econ!.net)} up front. Savings grow with the tariff (2%/yr) and shrink with panel ageing (0.5%/yr).`}
                  >
                    Cumulative cash flow
                  </CardTitle>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={econ!.proj} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
                        <defs>
                          <linearGradient id="cash" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={SERIES.leaf} stopOpacity={0.35} />
                            <stop offset="100%" stopColor={SERIES.leaf} stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: SERIES.axis }} tickFormatter={(v) => `Y${v}`} />
                        <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => (Math.abs(v) >= 1e5 ? `₹${(v / 1e5).toFixed(1)}L` : `₹${Math.round(v / 1000)}k`)} width={60} />
                        <ReferenceLine y={0} stroke={SERIES.truth} />
                        <Tooltip
                          content={({ active, payload }) =>
                            active && payload?.length ? (
                              <TipBox
                                title={`Year ${(payload[0].payload as { year: number }).year}`}
                                rows={[
                                  { label: 'Generation', value: `${fmt0((payload[0].payload as { kwh: number }).kwh)} kWh` },
                                  { label: 'Savings that year', value: rupees((payload[0].payload as { savingsRs: number }).savingsRs) },
                                  { label: 'Cumulative', value: rupees((payload[0].payload as { cumulativeCashRs: number }).cumulativeCashRs), color: SERIES.leaf },
                                ]}
                              />
                            ) : null
                          }
                        />
                        <Area isAnimationActive={!capturing} dataKey="cumulativeCashRs" stroke={SERIES.leaf} strokeWidth={2} fill="url(#cash)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                {/* LCA */}
                <Card>
                  <CardTitle sub="Life-cycle analysis: emissions from mining, manufacturing, construction, operation and disposal, per unit of electricity (IPCC AR5 medians)">
                    Life-cycle carbon of electricity sources
                  </CardTitle>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={lca} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 0 }}>
                        <CartesianGrid horizontal={false} />
                        <XAxis type="number" tickLine={false} axisLine={{ stroke: SERIES.axis }} unit=" g" />
                        <YAxis type="category" dataKey="source" width={170} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                        <ReferenceLine x={INDIA_GRID_EF_KG_PER_KWH * 1000} stroke={SERIES.red} strokeDasharray="5 4" label={{ value: `India grid avg ${INDIA_GRID_EF_KG_PER_KWH * 1000} g`, position: 'insideTopRight', fill: '#e66767', fontSize: 11 }} />
                        <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }} content={({ active, payload }) => (active && payload?.length ? <TipBox title={(payload[0].payload as { source: string }).source} rows={[{ label: 'Life-cycle emissions', value: `${(payload[0].payload as { g: number }).g} g CO₂e/kWh` }]} /> : null)} />
                        <Bar isAnimationActive={!capturing} dataKey="g" radius={[0, 4, 4, 0]} maxBarSize={18}>
                          {lca.map((d) => (
                            <Cell key={d.source} fill={d.source === 'Solar PV (rooftop)' ? SERIES.ml : d.group === 'fossil' ? '#6b665d' : d.group === 'other' ? '#9085e9' : '#199e70'} />
                          ))}
                          <LabelList dataKey="g" position="right" fontSize={11} fill="#c9c5bc" />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-2 text-sm text-ink-2">
                    Rooftop solar emits ~<strong>41 g</strong> over its life against <strong>820 g</strong> for coal, a 95% cut. Every solar
                    unit on an Indian roof displaces grid power averaging {INDIA_GRID_EF_KG_PER_KWH * 1000} g.
                  </p>
                </Card>

                {/* Scale up */}
                <Card className="overflow-hidden" pad={false}>
                  <div className="bg-surface-3/60 p-6 text-white">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gold">
                      <Globe2 className="h-4 w-4" aria-hidden /> Scaling the idea
                    </div>
                    <h3 className="mt-1 text-2xl font-bold">What if many homes did this?</h3>
                    <div className="mt-5 max-w-xl">
                      <Slider
                        label="Homes installing 3 kWp (at this location's sunshine)"
                        value={homes}
                        min={3}
                        max={7}
                        step={0.1}
                        onChange={setHomes}
                        display={<span className="text-white">{homesN >= 1e7 ? '1 crore' : homesN >= 1e5 ? `${fmt(homesN / 1e5, 1)} lakh` : fmt0(homesN)}</span>}
                      />
                    </div>
                    <div className="mt-6 grid gap-4 sm:grid-cols-3">
                      <div>
                        <div className="font-display text-3xl font-bold text-gold">{fmt(scaleKwh / 1e9, 2)} TWh</div>
                        <div className="text-xs text-white/60">clean electricity per year</div>
                      </div>
                      <div>
                        <div className="font-display text-3xl font-bold text-emerald-300">{fmt((scaleKwh * INDIA_GRID_EF_KG_PER_KWH) / 1e9, 2)} Mt</div>
                        <div className="text-xs text-white/60">CO₂ avoided per year</div>
                      </div>
                      <div>
                        <div className="font-display text-3xl font-bold text-sky-300">{fmt((100 * scaleKwh) / 1.739e12, 2)}%</div>
                        <div className="text-xs text-white/60">of India's ~1,739 TWh generation (FY 2023-24)</div>
                      </div>
                    </div>
                    <p className="mt-4 text-xs text-white/50">PM Surya Ghar: Muft Bijli Yojana targets 1 crore households (Feb 2024).</p>
                  </div>
                  <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { icon: <Landmark className="h-5 w-5" />, t: 'Policy & finance', d: 'Subsidy + net-metering approval from the DISCOM; low-interest rooftop loans.' },
                      { icon: <Building2 className="h-5 w-5" />, t: 'Structural safety', d: 'Roof load check (~15–20 kg/m²), wind-rated mounting, shade-free area.' },
                      { icon: <BadgeIndianRupee className="h-5 w-5" />, t: 'Grid readiness', d: 'Forecasts like SuryaCast let DISCOMs schedule around midday solar peaks.' },
                      { icon: <Recycle className="h-5 w-5" />, t: 'End of life', d: 'Panel recycling under India\'s E-Waste (Management) Rules, 2022.' },
                    ].map((x) => (
                      <div key={x.t}>
                        <div className="mb-2 grid h-9 w-9 place-items-center rounded-lg bg-acc/10 text-acc">{x.icon}</div>
                        <div className="font-semibold text-ink">{x.t}</div>
                        <div className="mt-1 text-sm text-ink-2">{x.d}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              </>
            )}
          </div>
          <aside>
            <div className="space-y-6 lg:sticky lg:top-24">
              <SystemPanel showEconomics />
              {sim && (
                <div className="card p-5 text-sm">
                  <div className="mb-3 font-semibold text-ink">Engineering summary</div>
                  <dl className="space-y-2">
                    {[
                      ['Annual sunlight (GHI)', `${fmt0(sim.ghiAnnualKwhM2)} kWh/m²`],
                      ['Specific yield', `${fmt0(sim.specificYield)} kWh/kWp`],
                      ['Capacity factor', `${fmt(sim.capacityFactor * 100, 1)} %`],
                      ['Performance ratio', `${fmt(sim.performanceRatio * 100, 1)} %`],
                      ['Subsidy (PM Surya Ghar)', rupees(econ!.subsidy)],
                      ['Data', hist?.source === 'bundled' ? 'ERA5 2021–25 (bundled)' : 'ERA5 2021–25 (live)'],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-3">
                        <dt className="text-muted">{k}</dt>
                        <dd className="tabular font-semibold text-ink">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </div>
          </aside>
        </div>
      </Container>
    </div>
  );
}
