import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Printer, Plus, Trash2, Target, ListChecks, BookOpen, Presentation, MessageCircleQuestion, AlertTriangle, Rocket, Leaf, Users } from 'lucide-react';
import reportJson from '../data/model-report.json';
import climate from '../data/climate.json';
import SystemDiagram from '../components/SystemDiagram';
import { Card, CardTitle, Container, PageHead, SectionTitle, cx } from '../components/ui';
import { fmt, fmt0, MJ_TO_KWH } from '../lib/format';

const R = reportJson as unknown as {
  dataset: { records: number; cities: number };
  models: { key: string; name: string; metrics: Record<string, { mae: number; r2: number; rmse: number }> }[];
  intervals: { coverage: Record<string, number> };
  crossValidation: { meanR2: number; sdR2: number };
  yields: { name: string; kwhPerKwp: number }[];
};
const CL = climate as unknown as { co2Temp: { perDoubling: number; r2: number }; india: { change: number } };
const m = (k: string) => R.models.find((x) => x.key === k)!;

interface Member {
  name: string;
  reg: string;
  dept: string;
  role: string;
}

const SYLLABUS = [
  {
    unit: 'Unit I',
    title: "Earth's Climate System",
    topics: 'Greenhouse gases & greenhouse effect, carbon cycle, atmosphere, global warming',
    where: 'Greenhouse simulator (energy balance, radiative forcing), Keeling curve showing the seasonal carbon cycle, CO₂–temperature regression.',
    to: '/science',
  },
  {
    unit: 'Unit II',
    title: 'Climate Indices & Extreme Events',
    topics: "Earth's energy balance, heat waves, Indian climate system (monsoon), natural vs human-induced change",
    where: 'Energy-balance model (S, albedo, CO₂); monsoon dip in solar output; heat-wave penalty on panels; India warming series.',
    to: '/science',
  },
  {
    unit: 'Unit III',
    title: 'Physical Evidence of Climate Change',
    topics: 'Warming evidence, energy generation & emissions',
    where: 'NOAA / NASA / Berkeley Earth evidence; grid emission factor (0.727 kg/kWh); solar generation vs coal emissions.',
    to: '/science',
  },
  {
    unit: 'Unit IV',
    title: 'International Responses',
    topics: 'Kyoto Protocol, carbon credits, Clean Development Mechanism, UNFCCC / IPCC',
    where: 'Carbon credits earned per roof, CDM Programme of Activities, Paris Article 6.4, India CCTS; IPCC life-cycle data and the Paris 1.5/2 °C limits.',
    to: '/planner',
  },
  {
    unit: 'Unit V',
    title: 'Adaptation & Mitigation',
    topics: 'Solar energy, clean technology, life-cycle analysis, sustainable development, public awareness',
    where: 'The whole working model: ML solar forecasting, rooftop sizing, PM Surya Ghar economics, LCA comparison, scale-up and adaptation tips.',
    to: '/forecast',
  },
];

const COS = [
  { co: 'CO-1', text: 'Apply knowledge of the Earth system', how: 'Energy balance and greenhouse forcing used quantitatively; solar geometry from Earth–Sun astronomy.' },
  { co: 'CO-2', text: 'Identify climate parameters and the human impact on them', how: 'CO₂, temperature, cloud, humidity and radiation analysed from real datasets; coal electricity → CO₂.' },
  { co: 'CO-3', text: 'Identify climate-change impacts on sectors', how: 'Energy sector: heat waves reduce PV efficiency; monsoon variability affects generation and grid planning.' },
  { co: 'CO-4', text: 'Interpret climate protocols', how: 'Kyoto → CDM → Paris Article 6.4 → India CCTS carbon-credit pathway for aggregated rooftops.' },
  { co: 'CO-5', text: 'Implement & analyse mitigation measures', how: 'A working, tested ML + physics tool that quantifies avoided emissions, cost and life-cycle benefit.' },
];

const VIVA = [
  ['What exactly does the ML model predict?', 'The daily clearness index Kt: the fraction of top-of-atmosphere sunlight that reaches the ground. Multiplying by Ra (computed with the FAO-56 equation) gives solar radiation in kWh/m², and PV physics turns that into kWh of electricity.'],
  ['Why not just use a formula?', 'We tested the standard FAO-56 Hargreaves–Samani formula. On cities the model never saw it scores R² ≈ ' + fmt(m('hargreaves').metrics.testSpace.r2, 2) + ' against ' + fmt(m('mlp').metrics.testSpace.r2, 2) + ' for our network: the formula only uses temperature, the network also uses cloud, humidity and rain.'],
  ['How do you know the model is not overfitting?', 'Three checks: a validation year (2024) for early stopping, a completely unseen year (2025), and 8 cities that were never used in training. We also ran 5-fold leave-cities-out cross-validation (R² ' + fmt(R.crossValidation.meanR2, 2) + ' ± ' + fmt(R.crossValidation.sdR2, 2) + ').'],
  ['Is the data real?', 'Yes. ERA5 is ECMWF\'s reanalysis, which blends satellite and ground observations into a consistent record. It is fetched through the Open-Meteo API and cached in the repository. CO₂ comes from NOAA Mauna Loa, temperature from NASA GISTEMP and Berkeley Earth. All results are computed by scripts; none are typed in.'],
  ['How is CO₂ avoided calculated?', 'kWh generated × 0.727 kg CO₂/kWh, the weighted-average emission factor of India\'s grid for FY 2023-24 published by the Central Electricity Authority (CO₂ Baseline Database v20).'],
  ['Why does generation fall in July even though days are long?', 'Monsoon clouds. The Kt values the model predicts drop sharply on overcast, rainy days. You can see it in the Planner\'s monthly chart and the Model Lab\'s monsoon time series.'],
  ['Why does heat reduce solar output?', 'Silicon cell voltage falls as temperature rises: about −0.37% of power per °C above 25 °C. On a 45 °C afternoon a panel can reach ~75 °C and deliver ~18% below its rating at that moment; over a whole day a heat wave costs roughly 6–8% compared with a mild day. So global warming slightly erodes solar yield.'],
  ['How would you scale this up?', 'Aggregate many homes for DISCOM-level forecasting, add more training cities (especially hills and coasts), feed live rooftop meter data back to retrain the model, and bundle homes into a carbon-credit programme.'],
];

const REFS = [
  'Allen, R.G., Pereira, L.S., Raes, D. & Smith, M. (1998). Crop evapotranspiration: FAO Irrigation and Drainage Paper 56, Ch. 3 (solar radiation equations 21–50). FAO, Rome.',
  'Duffie, J.A. & Beckman, W.A. (2013). Solar Engineering of Thermal Processes, 4th ed. Wiley. (Liu–Jordan tilted-surface model; Erbs et al. 1982 diffuse correlation.)',
  'Hersbach, H. et al. (2020). The ERA5 global reanalysis. Quarterly Journal of the Royal Meteorological Society, 146, 1999–2049. Data via Open-Meteo Historical Weather API (CC BY 4.0).',
  'Central Electricity Authority, Govt. of India (2024). CO₂ Baseline Database for the Indian Power Sector, Version 20.0: weighted-average emission factor FY 2023-24 = 0.727 tCO₂/MWh.',
  'Ministry of New & Renewable Energy (2024). PM Surya Ghar: Muft Bijli Yojana: central financial assistance for residential rooftop solar.',
  'IPCC (2014). Climate Change 2014: Mitigation of Climate Change, WGIII AR5, Annex III (Schlömer et al.), Table A.III.2: life-cycle emissions of electricity supply technologies.',
  'IPCC (2021). Climate Change 2021: The Physical Science Basis, WGI AR6. Equilibrium climate sensitivity best estimate 3 °C.',
  'Myhre, G. et al. (1998). New estimates of radiative forcing due to well-mixed greenhouse gases. Geophysical Research Letters, 25(14), 2715–2718.',
  'Lan, X., Tans, P. & Thoning, K.W. NOAA Global Monitoring Laboratory: Trends in atmospheric CO₂ (Mauna Loa monthly and annual means).',
  'GISTEMP Team (2025). GISS Surface Temperature Analysis v4, NASA Goddard Institute for Space Studies; Lenssen, N. et al. (2019), JGR Atmospheres 124.',
  'Rohde, R.A. & Hausfather, Z. (2020). The Berkeley Earth Land/Ocean Temperature Record. Earth System Science Data, 12, 3469–3479.',
  'Hargreaves, G.H. & Samani, Z.A. (1985). Reference crop evapotranspiration from temperature. Applied Engineering in Agriculture, 1(2), 96–99.',
  'Kingma, D.P. & Ba, J. (2015). Adam: A method for stochastic optimization. International Conference on Learning Representations (ICLR).',
  'US EPA. Greenhouse Gas Equivalencies Calculator: calculations and references (urban tree seedling grown for 10 years = 0.060 t CO₂).',
];

function TeamTable() {
  const [rows, setRows] = useState<Member[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('sc-team') ?? '') as Member[];
    } catch {
      return [{ name: '', reg: '', dept: '', role: '' }];
    }
  });
  useEffect(() => {
    localStorage.setItem('sc-team', JSON.stringify(rows));
  }, [rows]);
  const upd = (i: number, k: keyof Member, v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Register no.</th>
              <th className="px-3 py-2">Department</th>
              <th className="px-3 py-2">Specific contribution</th>
              <th className="no-print w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r, i) => (
              <tr key={i}>
                {(['name', 'reg', 'dept', 'role'] as const).map((k) => (
                  <td key={k} className="px-1.5 py-1">
                    <input
                      value={r[k]}
                      onChange={(e) => upd(i, k, e.target.value)}
                      placeholder={{ name: 'Student name', reg: 'RA…', dept: 'e.g. CSE', role: 'e.g. data & ML training' }[k]}
                      className="w-full rounded-lg px-2 py-1.5 outline-none placeholder:text-stone-300 focus:bg-acc/10"
                      aria-label={`${k} of member ${i + 1}`}
                    />
                  </td>
                ))}
                <td className="no-print px-1">
                  <button onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className="rounded-lg p-1.5 text-muted hover:bg-red-400/10 hover:text-red-400" aria-label={`Remove member ${i + 1}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="no-print mt-3 flex flex-wrap gap-2">
        {rows.length < 6 && (
          <button onClick={() => setRows((x) => [...x, { name: '', reg: '', dept: '', role: '' }])} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm font-semibold hover:border-acc/40">
            <Plus className="h-4 w-4" /> Add member (max 6)
          </button>
        )}
        <button onClick={() => window.print()} className="btn btn--primary btn--sm">
          <Printer className="h-4 w-4" /> Print project summary
        </button>
        <span className="self-center text-xs text-muted">Saved only in this browser.</span>
      </div>
    </div>
  );
}

export default function Project() {
  const mlp = m('mlp');
  const hs = m('hargreaves');
  const best = [...R.yields].sort((a, b) => b.kwhPerKwp - a.kwhPerKwp);
  return (
    <div>
      <PageHead
        eyebrow="21CEO310T · Global Warming & Climate Change · LLT / CLA-2"
        title="SuryaCast: machine-learning solar forecasting"
        em="for climate-change mitigation."
        lead="Everything an examiner needs: problem, aim, objectives, design, syllabus and course-outcome mapping, results, limitations and references."
      />

      <Container className="space-y-12 py-10">
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <Target className="h-5 w-5 text-acc" aria-hidden /> Problem statement
              </span>
            </CardTitle>
            <p className="leading-relaxed text-ink-2">
              Electricity is India's largest source of CO₂. The grid emits <strong>0.727 kg of CO₂ for every unit (kWh)</strong> consumed,
              because most of it comes from coal. Rooftop solar is the most direct mitigation step a household can take, and the PM Surya
              Ghar scheme aims to put it on one crore homes. But solar output swings with clouds, monsoon and heat. Households cannot
              tell how much they will get, and grid operators struggle to balance the variability. Sensors that measure sunlight
              (pyranometers) are expensive and rare, while routine weather data is available everywhere.
            </p>
            <div className="mt-5 rounded-2xl bg-surface-3/60 p-5 text-white">
              <div className="text-xs font-semibold uppercase tracking-widest text-gold">Aim</div>
              <p className="mt-1 text-lg">
                Build and validate a working machine-learning model that forecasts rooftop solar generation for any location in India from
                routine weather data, and quantify the CO₂ it avoids.
              </p>
            </div>
          </Card>
          <Card>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-acc" aria-hidden /> Objectives
              </span>
            </CardTitle>
            <ol className="space-y-3 text-sm leading-relaxed text-ink-2">
              <li>
                <strong className="text-ink">1.</strong> Train and test a neural network that estimates daily solar radiation from cloud, humidity,
                rain and temperature, and compare it with the standard FAO-56 method.
              </li>
              <li>
                <strong className="text-ink">2.</strong> Combine it with PV engineering physics into a live 7-day forecaster for rooftop
                electricity and avoided CO₂.
              </li>
              <li>
                <strong className="text-ink">3.</strong> Analyse the climate, carbon-credit and economic benefit (life-cycle, subsidy, scale-up)
                to promote public awareness of mitigation.
              </li>
            </ol>
          </Card>
        </div>

        <section>
          <SectionTitle eyebrow="Design" title="Labelled block diagram">
            The training pipeline runs once, offline. The trained network then runs live in any browser as the working demonstration.
          </SectionTitle>
          <Card>
            <SystemDiagram />
          </Card>
        </section>

        <section>
          <SectionTitle eyebrow="Syllabus coverage" title="Units I–V in one working model" />
          <div className="overflow-hidden rounded-2xl border border-line bg-surface-2">
            {SYLLABUS.map((s, i) => (
              <div key={s.unit} className={cx('grid gap-3 p-5 md:grid-cols-[140px_1fr_1.4fr_auto] md:items-center', i > 0 && 'border-t border-line')}>
                <div>
                  <div className="font-display text-lg font-bold text-acc">{s.unit}</div>
                  <div className="text-xs font-medium text-ink-2">{s.title}</div>
                </div>
                <div className="text-sm text-muted">{s.topics}</div>
                <div className="text-sm text-ink">{s.where}</div>
                <Link to={s.to} className="no-print text-sm font-semibold text-acc hover:underline">
                  See it →
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionTitle eyebrow="Course outcomes" title="CO mapping" />
          <div className="grid gap-4 md:grid-cols-5">
            {COS.map((c) => (
              <div key={c.co} className="card p-4">
                <div className="font-display text-2xl font-bold text-ink">{c.co}</div>
                <div className="mt-1 text-xs font-semibold text-acc">{c.text}</div>
                <p className="mt-2 text-sm text-ink-2">{c.how}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted">Strongest mapping: CO-5 and CO-2, then CO-1 and CO-3, with CO-4 through carbon credits. Mapped POs (per syllabus): PO1, PO6, PO7.</p>
        </section>

        <section>
          <SectionTitle eyebrow="Results" title="Actual observations (computed, not invented)">
            Every value comes from the training and evaluation scripts run on real data.
          </SectionTitle>
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface-2">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3">Observation</th>
                  <th className="px-4 py-3">Value</th>
                  <th className="px-4 py-3">Meaning</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[
                  ['Dataset', `${fmt0(R.dataset.records)} days, ${R.dataset.cities} cities`, 'ERA5 daily weather + solar radiation, 2021–2025'],
                  ['Network accuracy, unseen year 2025', `R² ${fmt(mlp.metrics.testTime.r2, 3)} · MAE ${fmt(mlp.metrics.testTime.mae * MJ_TO_KWH, 2)} kWh/m²`, 'Explains ~87% of day-to-day variation in sunlight'],
                  ['Network accuracy, 8 unseen cities', `R² ${fmt(mlp.metrics.testSpace.r2, 3)} · MAE ${fmt(mlp.metrics.testSpace.mae * MJ_TO_KWH, 2)} kWh/m²`, 'Works in places it never trained on'],
                  ['FAO-56 Hargreaves (baseline), unseen cities', `R² ${fmt(hs.metrics.testSpace.r2, 3)} · MAE ${fmt(hs.metrics.testSpace.mae * MJ_TO_KWH, 2)} kWh/m²`, `Network error is ${fmt(100 * (1 - mlp.metrics.testSpace.mae / hs.metrics.testSpace.mae), 0)}% lower`],
                  ['80% prediction-interval coverage', `${fmt(R.intervals.coverage.testTime * 100, 1)}% (2025) · ${fmt(R.intervals.coverage.testSpace * 100, 1)}% (new cities)`, 'Uncertainty is honestly calibrated'],
                  ['Specific yield (2025, latitude tilt)', `${best[best.length - 1].name} ${fmt0(best[best.length - 1].kwhPerKwp)} → ${best[0].name} ${fmt0(best[0].kwhPerKwp)} kWh/kWp/yr`, 'Typical Indian rooftop: ~1,450–1,650 kWh per kW per year'],
                  ['CO₂ ↔ temperature (1959–2025)', `${fmt(CL.co2Temp.perDoubling, 1)} °C per CO₂ doubling (R² ${fmt(CL.co2Temp.r2, 2)})`, 'Observed relation consistent with greenhouse physics'],
                  ['India warming', `+${fmt(CL.india.change, 2)} °C (2011–20 vs 1901–30)`, 'Berkeley Earth regional record'],
                ].map(([a, b, c]) => (
                  <tr key={a}>
                    <td className="px-4 py-3 font-medium text-ink">{a}</td>
                    <td className="tabular px-4 py-3 font-semibold text-acc">{b}</td>
                    <td className="px-4 py-3 text-ink-2">{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <Leaf className="h-5 w-5 text-emerald-400" aria-hidden /> Environmental benefit
              </span>
            </CardTitle>
            <ul className="list-disc space-y-2 pl-5 text-sm text-ink-2">
              <li>A 3 kWp roof in Chennai avoids ≈ 3.4 t CO₂ every year (≈ 80 t over 25 years).</li>
              <li>Rooftop PV life-cycle emissions are ~41 g/kWh vs 820 g for coal (IPCC): a 95% cut.</li>
              <li>Forecasts help grids absorb more solar with less fossil back-up.</li>
              <li>Load-shifting to sunny hours lowers evening coal-fired peaks.</li>
            </ul>
          </Card>
          <Card>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <Rocket className="h-5 w-5 text-acc" aria-hidden /> Real-world applications
              </span>
            </CardTitle>
            <ul className="list-disc space-y-2 pl-5 text-sm text-ink-2">
              <li>Homeowners deciding on PM Surya Ghar: size, payback, savings.</li>
              <li>DISCOMs: day-ahead estimates of rooftop generation per feeder.</li>
              <li>Solar installers: fast site assessment without a pyranometer.</li>
              <li>Schools & NGOs: climate awareness with local, real numbers.</li>
            </ul>
          </Card>
          <Card>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-400" aria-hidden /> Limitations
              </span>
            </CardTitle>
            <ul className="list-disc space-y-2 pl-5 text-sm text-ink-2">
              <li>Trained on ERA5 reanalysis, not ground pyranometers; ERA5 can overestimate sunshine under heavy aerosol haze.</li>
              <li>Daily resolution only: no hour-by-hour forecast.</li>
              <li>Forecast skill is limited by the weather forecast it is fed.</li>
              <li>Weaker in complex terrain (Palghat Gap, Himalaya). Shading, roof orientation and dust are simplified.</li>
            </ul>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardTitle sub="A 5-minute script for the working demonstration">
              <span className="inline-flex items-center gap-2">
                <Presentation className="h-5 w-5 text-acc" aria-hidden /> How to demonstrate
              </span>
            </CardTitle>
            <ol className="space-y-3 text-sm text-ink-2">
              {[
                ['Science (1 min)', 'Open Climate Science, drag CO₂ from 280 → 427 → 560 ppm and show the warming and Paris limits.'],
                ['Live model (2 min)', 'Open Live Forecast → pick the examiner\'s home town or click a roof on the satellite map. Show the 7-day kWh, then click a day for the 8-step calculation.'],
                ['Evidence (1 min)', 'Model Lab: leaderboard (network vs FAO-56), monsoon time series, then hit “Start training” and let them watch it learn.'],
                ['Impact (1 min)', 'Impact Planner: annual kWh, CO₂, carbon credits, PM Surya Ghar subsidy, payback, scale-up slider to 1 crore homes.'],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-acc font-mono text-xs font-bold text-acc-ink">{i + 1}</span>
                  <span>
                    <strong className="text-ink">{t}:</strong> {d}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-muted">No Wi-Fi? The Forecast page offers an offline Chennai snapshot, and the Planner and Model Lab work fully offline for the 38 bundled cities.</p>
          </Card>
          <Card>
            <CardTitle sub="Likely questions and how to answer them">
              <span className="inline-flex items-center gap-2">
                <MessageCircleQuestion className="h-5 w-5 text-acc" aria-hidden /> Viva preparation
              </span>
            </CardTitle>
            <div className="space-y-2">
              {VIVA.map(([q, a]) => (
                <details key={q} className="group rounded-xl border border-line bg-surface-2 px-4 py-2.5 open:bg-surface-2">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-ink marker:hidden">
                    <span className="mr-2 text-acc group-open:rotate-90">›</span>
                    {q}
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-ink-2">{a}</p>
                </details>
              ))}
            </div>
          </Card>
        </section>

        <section>
          <SectionTitle eyebrow="Team" title="Group members and contributions">
            The assignment asks for every member, register number, department and specific contribution on the report's first page.
          </SectionTitle>
          <Card>
            <div className="mb-4 flex items-center gap-2 text-sm text-ink-2">
              <Users className="h-4 w-4 text-acc" aria-hidden /> Fill this in, then print the page for your records.
            </div>
            <TeamTable />
          </Card>
        </section>

        <section>
          <SectionTitle eyebrow="References" title="Credible sources" />
          <Card>
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-ink-2">
              {REFS.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
            <div className="mt-6 flex items-start gap-3 rounded-xl bg-surface-2 p-4 text-sm text-ink-2">
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-acc" aria-hidden />
              <div>
                <strong className="text-ink">Reproduce every result:</strong> <code className="rounded bg-surface-2 px-1.5 py-0.5">python ml/fetch_data.py</code> →{' '}
                <code className="rounded bg-surface-2 px-1.5 py-0.5">npm run train</code> → <code className="rounded bg-surface-2 px-1.5 py-0.5">npm run prepare-climate</code> →{' '}
                <code className="rounded bg-surface-2 px-1.5 py-0.5">python ml/crosscheck.py</code> → <code className="rounded bg-surface-2 px-1.5 py-0.5">npm test</code>.
              </div>
            </div>
          </Card>
        </section>
      </Container>
    </div>
  );
}
