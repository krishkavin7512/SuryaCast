import { Link } from 'react-router-dom';
import { ArrowUpRight, CloudSun, Brain, Cpu, Leaf, Factory, CloudRain, Gauge } from 'lucide-react';
import reportJson from '../data/model-report.json';
import climate from '../data/climate.json';
import HeroLive from '../components/HeroLive';
import SunRings from '../components/SunRings';
import { CountUp, Marquee, SplitText } from '../components/motion';
import { Container, Eyebrow, SectionTitle } from '../components/ui';
import { INDIA_GRID_EF_KG_PER_KWH } from '../lib/carbon';
import { fmt, MJ_TO_KWH } from '../lib/format';
import { useAppState } from '../state';

const R = reportJson as unknown as { dataset: { records: number; cities: number }; models: { key: string; metrics: Record<string, { r2: number; mae: number }> }[] };
const CL = climate as unknown as { co2Annual: [number, number][]; gistemp: [number, number][] };
const mlp = R.models.find((m) => m.key === 'mlp')!;
const hs = R.models.find((m) => m.key === 'hargreaves')!;

export default function Home() {
  const { place } = useAppState();
  const co2 = CL.co2Annual[CL.co2Annual.length - 1];
  const temp = CL.gistemp[CL.gistemp.length - 1];
  const better = 100 * (1 - mlp.metrics.testSpace.mae / hs.metrics.testSpace.mae);
  return (
    <div>
      {/* HERO */}
      <section className="relative flex min-h-[100svh] items-center overflow-hidden pb-12 pt-24">
        <Container className="relative">
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[1.05fr_.95fr]">
            <div>
              <Eyebrow>Global warming & climate change · working model</Eyebrow>
              <SplitText as="h1" className="h-hero" text="Forecast the sun." accent="Cut the carbon." base={1450} />
              <p className="lead mb-8 mt-7" data-reveal="" style={{ ['--d' as string]: 300 }}>
                A neural network, written from scratch and trained on <span className="text-ink">{R.dataset.records.toLocaleString('en-IN')} days</span> of real Indian weather, predicts how much
                electricity your roof will make this week and how much CO₂ that keeps out of the sky.
              </p>
              <div className="flex flex-wrap gap-3" data-reveal="" style={{ ['--d' as string]: 450 }}>
                <Link to="/forecast" className="btn btn--primary" data-cursor="run">
                  Run the live model <span className="arrow">→</span>
                </Link>
                <Link to="/model" className="btn">
                  See how it learned
                </Link>
              </div>
            </div>
            <div data-reveal="scale" style={{ ['--d' as string]: 200 }} className="mx-auto w-full max-w-[540px]">
              <SunRings cityId={place.cityId ?? 'chennai'} cityName={place.cityId ? place.name : 'Chennai'} />
            </div>
          </div>
          <div className="stat-strip mt-6 grid-cols-2 md:grid-cols-4" data-reveal="" style={{ ['--d' as string]: 600 }}>
            <div>
              <div className="stat__v">
                <CountUp value={co2[1]} decimals={1} />
                <small>ppm</small>
              </div>
              <div className="mt-2 text-[13px] leading-snug text-muted">CO₂ in {co2[0]}, Mauna Loa (NOAA)</div>
            </div>
            <div>
              <div className="stat__v">
                <CountUp value={temp[1]} decimals={2} prefix="+" />
                <small>°C</small>
              </div>
              <div className="mt-2 text-[13px] leading-snug text-muted">global warming {temp[0]} vs 1951–80 (NASA)</div>
            </div>
            <div>
              <div className="stat__v">
                <CountUp value={INDIA_GRID_EF_KG_PER_KWH} decimals={3} />
                <small>kg/kWh</small>
              </div>
              <div className="mt-2 text-[13px] leading-snug text-muted">CO₂ per unit of Indian grid power (CEA)</div>
            </div>
            <div>
              <div className="stat__v">
                <CountUp value={mlp.metrics.testTime.r2} decimals={3} />
                <small>R²</small>
              </div>
              <div className="mt-2 text-[13px] leading-snug text-muted">accuracy on 2025, a year it never saw</div>
            </div>
          </div>
        </Container>
        <div className="scroll-cue" aria-hidden>
          <span>Scroll</span>
          <i />
        </div>
      </section>

      <Marquee items={['Forecast the sun', '69,388 real days', 'Cut the carbon', '38 Indian cities', 'From scratch', '0.727 kg CO₂ per unit', 'PM Surya Ghar', 'Monsoon-aware']} />

      {/* 01 PROBLEM */}
      <section className="border-t border-line py-[clamp(72px,10vw,130px)]">
        <Container>
          <SectionTitle eyebrow="01 · The problem" title="India runs on coal." em="The sun doesn't run on a schedule." units={['Unit III · Energy & emissions', 'Unit V · Solar energy']}>
            Rooftop solar is the most direct climate action a household can take. But clouds and the monsoon make its output swing from day to
            day, and that uncertainty slows adoption by homes and by the grid.
          </SectionTitle>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              { icon: <Factory className="h-5 w-5" />, k: '0.727', u: 'kg CO₂ / unit', t: 'Every unit of grid power', d: "The weighted-average emission factor of India's grid (CEA, FY 2023-24). A typical home uses 2,000–3,000 units a year." },
              { icon: <CloudRain className="h-5 w-5" />, k: '−70%', u: 'on a monsoon day', t: 'Sunlight swings with weather', d: 'Monsoon cloud can cut a day\'s output by 70%, and heat waves lower panel efficiency. One average figure misleads.' },
              { icon: <Gauge className="h-5 w-5" />, k: '₹20k+', u: 'per sensor', t: 'Sunlight sensors are rare', d: 'Pyranometers are expensive. Routine weather (cloud, humidity, rain, temperature) is available everywhere.' },
            ].map((c, i) => (
              <div key={c.t} className="card p-6" data-reveal="" style={{ ['--d' as string]: i * 100 }}>
                <div className="mb-6 flex items-center justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-xl border border-line-2 text-acc">{c.icon}</span>
                  <span className="tag">0{i + 1}</span>
                </div>
                <div className="font-mono text-4xl font-semibold tracking-tight text-ink">
                  {c.k} <span className="text-sm font-normal text-muted">{c.u}</span>
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold">{c.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{c.d}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* 02 HOW */}
      <section className="border-t border-line py-[clamp(72px,10vw,130px)]">
        <Container>
          <SectionTitle eyebrow="02 · How it works" title="Weather in, carbon out." em="Machine learning in the middle." />
          <div className="relative grid grid-cols-1 gap-3 md:grid-cols-4">
            {[
              { icon: <CloudSun className="h-5 w-5" />, t: 'Live weather', d: '7-day cloud, humidity, rain and temperature for any spot in India (Open-Meteo).' },
              { icon: <Brain className="h-5 w-5" />, t: 'Neural network', d: 'Five 13→64→32→1 networks, written from scratch, predict how clear the sky will be.' },
              { icon: <Cpu className="h-5 w-5" />, t: 'Solar physics', d: 'FAO-56 astronomy, panel-tilt geometry and cell temperature give kWh for your roof.' },
              { icon: <Leaf className="h-5 w-5" />, t: 'Climate impact', d: 'CO₂ avoided, carbon credits, bill savings, subsidy and life-cycle benefit.' },
            ].map((s, i) => (
              <div key={s.t} className="card p-6" data-reveal="" style={{ ['--d' as string]: i * 110 }}>
                <div className="flex items-center justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-acc text-acc-ink">{s.icon}</span>
                  <span className="font-mono text-3xl font-semibold text-line-2">0{i + 1}</span>
                </div>
                <h3 className="mt-6 font-display text-lg font-semibold">{s.t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{s.d}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* 03 LIVE */}
      <section className="border-t border-line py-[clamp(72px,10vw,130px)]">
        <Container className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[.9fr_1.1fr]">
          <div>
            <Eyebrow>03 · Running right now</Eyebrow>
            <h2 className="h2" data-reveal="">
              This is not a screenshot. <em>It is the model, live.</em>
            </h2>
            <p className="lead" data-reveal="" style={{ ['--d' as string]: 150 }}>
              The card on the right fetched today's weather forecast for {place.name}, ran it through the trained networks in your browser and
              converted the result into electricity and CO₂ for a {fmt(3, 0)} kWp roof.
            </p>
          </div>
          <div data-reveal="scale" style={{ ['--d' as string]: 150 }}>
            <HeroLive />
          </div>
        </Container>
      </section>

      {/* 04 RESULTS */}
      <section className="border-t border-line py-[clamp(72px,10vw,130px)]">
        <Container>
          <SectionTitle eyebrow="04 · Tested honestly" title="Better than the textbook formula," em="on data it had never seen.">
            We held back a whole year and eight entire cities. On those unseen cities the network's error is {fmt(better, 0)}% lower than the
            FAO-56 Hargreaves–Samani method engineers use when no sunlight sensor exists.
          </SectionTitle>
          <div className="stat-strip grid-cols-2 md:grid-cols-4" data-reveal="">
            {[
              { v: mlp.metrics.testTime.r2, d: 3, l: 'R², the unseen year 2025' },
              { v: mlp.metrics.testSpace.r2, d: 3, l: 'R², 8 unseen cities' },
              { v: hs.metrics.testSpace.r2, d: 3, l: 'R², FAO-56 formula on the same cities' },
              { v: mlp.metrics.testSpace.mae * MJ_TO_KWH, d: 2, l: 'kWh/m² mean daily error, unseen cities' },
            ].map((x) => (
              <div key={x.l}>
                <div className="stat__v !text-[clamp(30px,3.6vw,52px)]">
                  <CountUp value={x.v} decimals={x.d} />
                </div>
                <div className="mt-2 text-[13px] text-muted">{x.l}</div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* 05 EXPLORE */}
      <section className="border-t border-line py-[clamp(72px,10vw,130px)]">
        <Container>
          <SectionTitle eyebrow="05 · Explore" title="Six rooms." em="One working model." />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {[
              { to: '/forecast', t: 'Live Forecast', d: '7-day rooftop kWh anywhere in India, with uncertainty and an 8-step explanation.' },
              { to: '/planner', t: 'Impact Planner', d: 'A real year: CO₂, carbon credits, PM Surya Ghar subsidy, payback, LCA.' },
              { to: '/model', t: 'Model Lab', d: 'Unseen-city tests, a what-if playground, and train a network in your browser.' },
              { to: '/performance', t: 'Performance', d: 'Full metrics scorecard, significance tests, error by sky, season, zone and horizon.' },
              { to: '/science', t: 'Climate Science', d: 'Greenhouse simulator plus NOAA, NASA and Berkeley Earth evidence.' },
              { to: '/project', t: 'Project', d: 'Aim, objectives, Units I–V, COs, diagram, results, viva prep, references.' },
            ].map((c, i) => (
              <Link key={c.to} to={c.to} className="card group flex min-h-52 flex-col p-6 transition-transform duration-500 hover:-translate-y-1" data-reveal="" style={{ ['--d' as string]: i * 80 }} data-cursor="open">
                <div className="flex items-start justify-between">
                  <span className="tag">0{i + 1}</span>
                  <ArrowUpRight className="h-5 w-5 text-muted transition duration-500 group-hover:rotate-45 group-hover:text-acc" aria-hidden />
                </div>
                <h3 className="mt-auto font-display text-xl font-semibold">{c.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{c.d}</p>
              </Link>
            ))}
          </div>
        </Container>
      </section>
    </div>
  );
}
