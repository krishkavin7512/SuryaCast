import { useState } from 'react';
import { Thermometer } from 'lucide-react';
import { energyBalance, CO2_PREINDUSTRIAL } from '../lib/climate';
import { fmt } from '../lib/format';
import { Card, CardTitle, Slider, cx } from './ui';

const PRESETS = [
  { label: 'Ice age', ppm: 185 },
  { label: '1850', ppm: 280 },
  { label: 'Today', ppm: 427 },
  { label: '2× CO₂', ppm: 560 },
  { label: 'High-emission 2100', ppm: 1000 },
];

/** Interactive single-column energy-balance model with an animated greenhouse diagram. */
export default function GreenhouseSim() {
  const [ppm, setPpm] = useState(427);
  const [albedo, setAlbedo] = useState(0.3);
  const [solar, setSolar] = useState(0);
  const S = 1361 * (1 + solar / 100);
  const b = energyBalance(ppm, S, albedo);
  // Visual intensities.
  const trap = Math.min(1, Math.max(0.05, 0.35 + 0.22 * Math.log(ppm / CO2_PREINDUSTRIAL) / Math.log(2)));
  const heat = Math.min(1, Math.max(0, (b.warming + 3) / 9));
  const surface = `rgb(${Math.round(60 + 170 * heat)}, ${Math.round(150 - 60 * heat)}, ${Math.round(110 - 70 * heat)})`;
  const status =
    b.warming < 1.5 ? { t: 'Below the Paris 1.5 °C limit', c: 'bg-emerald-400/15 text-emerald-200' } : b.warming < 2 ? { t: 'Between 1.5 °C and 2 °C', c: 'bg-amber-400/15 text-amber-200' } : { t: 'Beyond the Paris 2 °C limit', c: 'bg-red-400/15 text-red-200' };

  return (
    <Card>
      <CardTitle sub="A zero-dimensional energy-balance model: incoming sunlight must equal the heat Earth radiates back to space. More CO₂ traps more outgoing infrared, so the surface must warm until the balance is restored.">
        Greenhouse effect simulator
      </CardTitle>
      <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr]">
        <div className="overflow-hidden rounded-2xl bg-surface-3/60">
          <svg viewBox="0 0 640 400" className="h-auto w-full" role="img" aria-label={`Diagram: CO2 ${ppm} ppm, surface ${fmt(b.surfaceC, 1)} degrees Celsius`}>
            <defs>
              <radialGradient id="sun" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fff3c4" />
                <stop offset="55%" stopColor="#ffb703" />
                <stop offset="100%" stopColor="#fb8500" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="atm" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7dd3fc" stopOpacity={0.05} />
                <stop offset="100%" stopColor="#7dd3fc" stopOpacity={0.12 + 0.45 * trap} />
              </linearGradient>
              <marker id="ah-y" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="#ffd166" />
              </marker>
              <marker id="ah-r" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="#f87171" />
              </marker>
            </defs>
            {/* stars */}
            {Array.from({ length: 30 }, (_, i) => (
              <circle key={i} cx={(i * 137) % 640} cy={(i * 53) % 110} r={i % 3 === 0 ? 1.2 : 0.7} fill="#fff" opacity={0.5} />
            ))}
            <circle cx="70" cy="62" r="70" fill="url(#sun)" style={{ animation: 'pulse-glow 4s ease-in-out infinite', transformOrigin: '70px 62px' }} />
            <circle cx="70" cy="62" r="26" fill="#ffd166" />
            {/* atmosphere */}
            <rect x="0" y="150" width="640" height="170" fill="url(#atm)" />
            {Array.from({ length: Math.round(6 + 26 * trap) }, (_, i) => (
              <g key={i} opacity={0.7}>
                <circle cx={40 + ((i * 97) % 580)} cy={175 + ((i * 41) % 120)} r={3.2} fill="#94a3b8" />
                <circle cx={33 + ((i * 97) % 580)} cy={175 + ((i * 41) % 120)} r={2.2} fill="#e11d48" />
                <circle cx={47 + ((i * 97) % 580)} cy={175 + ((i * 41) % 120)} r={2.2} fill="#e11d48" />
              </g>
            ))}
            <text x="625" y="168" textAnchor="end" fontSize="12" fill="#bae6fd" opacity={0.9}>
              Atmosphere · CO₂ {ppm} ppm
            </text>
            {/* incoming sunlight */}
            {[0, 1, 2].map((i) => (
              <line key={i} x1={110 + i * 40} y1={92 + i * 6} x2={230 + i * 70} y2={318} stroke="#ffd166" strokeWidth={3.5} strokeDasharray="10 8" markerEnd="url(#ah-y)" style={{ animation: 'ray 1.2s linear infinite' }} />
            ))}
            {/* reflected */}
            <line x1={330} y1={318} x2={420 + 120 * albedo} y2={70} stroke="#fde68a" strokeWidth={1 + 9 * albedo} strokeDasharray="10 8" markerEnd="url(#ah-y)" opacity={0.85} style={{ animation: 'ray 1.2s linear infinite' }} />
            <text x={430 + 120 * albedo} y={62} fontSize="12" fill="#fde68a">
              reflected {fmt(b.reflected, 0)} W/m²
            </text>
            {/* outgoing infrared */}
            {[0, 1, 2].map((i) => {
              const escape = i === 2 || (i === 1 && trap < 0.55);
              const x0 = 470 + i * 45;
              return escape ? (
                <path key={i} d={`M${x0},318 q12,-30 0,-60 q-12,-30 0,-60 q12,-30 0,-60 q-12,-30 0,-60`} fill="none" stroke="#f87171" strokeWidth={3} markerEnd="url(#ah-r)" strokeDasharray="8 6" style={{ animation: 'ray 1.6s linear infinite' }} />
              ) : (
                <g key={i}>
                  <path d={`M${x0},318 q12,-30 0,-60 q-12,-30 0,-50`} fill="none" stroke="#f87171" strokeWidth={3} strokeDasharray="8 6" style={{ animation: 'ray 1.6s linear infinite' }} />
                  <path d={`M${x0},208 q30,10 20,55 q-8,30 4,52`} fill="none" stroke="#fb7185" strokeWidth={2.5} strokeDasharray="6 6" markerEnd="url(#ah-r)" style={{ animation: 'ray 1.6s linear infinite' }} />
                </g>
              );
            })}
            <text x="530" y="140" textAnchor="middle" fontSize="12" fill="#fecaca">
              infrared heat {trap > 0.55 ? '(mostly trapped)' : '(partly escapes)'}
            </text>
            {/* surface */}
            <path d="M0,320 Q160,305 320,320 T640,318 L640,400 L0,400 Z" fill={surface} style={{ transition: 'fill 0.4s' }} />
            <path d="M0,340 Q160,330 320,342 T640,338 L640,400 L0,400 Z" fill="#0e7490" opacity={0.55} />
            <text x="20" y="380" fontSize="13" fontWeight={700} fill="#fff">
              Surface {fmt(b.surfaceC, 1)} °C
            </text>
            <text x="20" y="396" fontSize="11" fill="#e2e8f0" opacity={0.85}>
              Without greenhouse gases it would be {fmt(b.effectiveC, 0)} °C
            </text>
          </svg>
        </div>

        <div className="space-y-5">
          <div>
            <Slider label="Atmospheric CO₂" value={ppm} min={180} max={1200} step={1} onChange={setPpm} display={`${ppm} ppm`} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button key={p.label} onClick={() => setPpm(p.ppm)} className={cx('rounded-lg border px-2 py-1 text-xs font-semibold', ppm === p.ppm ? 'border-acc/70 bg-acc/10 text-acc' : 'border-line bg-surface-2 text-ink-2 hover:border-acc/40')}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <Slider label="Planetary albedo (reflectivity)" value={albedo} min={0.25} max={0.4} step={0.005} onChange={setAlbedo} display={fmt(albedo, 3)} hint="Melting ice and snow lower albedo, so Earth absorbs more sunlight (ice-albedo feedback)." />
          <Slider label="Solar output change" value={solar} min={-1} max={1} step={0.05} onChange={setSolar} display={`${solar > 0 ? '+' : ''}${fmt(solar, 2)}%`} hint="The 11-year sunspot cycle changes output by only ~0.1%." />

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="text-xs text-muted">CO₂ radiative forcing</div>
              <div className="font-display text-2xl font-bold">{b.co2Forcing >= 0 ? '+' : ''}{fmt(b.co2Forcing, 2)}</div>
              <div className="text-xs text-muted">W/m² · ΔF = 5.35 ln(C/280)</div>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="text-xs text-muted">Sunlight absorbed</div>
              <div className="font-display text-2xl font-bold">{fmt(b.absorbed, 1)}</div>
              <div className="text-xs text-muted">W/m² of {fmt(b.incoming, 1)} incoming</div>
            </div>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 p-4 text-white">
            <div className="flex items-center gap-2 text-sm font-medium text-white/90">
              <Thermometer className="h-4 w-4" aria-hidden /> Equilibrium warming vs 1850
            </div>
            <div className="font-display text-4xl font-bold">
              {b.warming >= 0 ? '+' : ''}
              {fmt(b.warming, 2)} °C
            </div>
            <div className="relative mt-2 h-2 rounded-full bg-white/25">
              <div className="h-2 rounded-full bg-surface-2" style={{ width: `${Math.min(100, Math.max(0, (b.warming / 5) * 100))}%` }} />
              {[1.5, 2].map((t) => (
                <span key={t} className="absolute -top-1 h-4 w-0.5 bg-night/70" style={{ left: `${(t / 5) * 100}%` }} />
              ))}
            </div>
            <div className="relative mt-1 h-3 text-[10px] text-white/85">
              <span className="absolute left-0">0</span>
              <span className="absolute -translate-x-full pr-1" style={{ left: '30%' }}>1.5°</span>
              <span className="absolute pl-1" style={{ left: '40%' }}>2°</span>
              <span className="absolute right-0">5 °C</span>
            </div>
          </div>
          <div className={cx('rounded-xl px-3 py-2 text-sm font-semibold', status.c)}>{status.t}</div>
          <p className="text-xs leading-relaxed text-muted">
            ΔT = λ·ΔF with λ = 0.81 K per W/m² (≈ 3 °C per CO₂ doubling, IPCC AR6 best estimate). This is the warming once oceans catch up.
            Observed warming so far (~1.2 °C) is smaller because oceans lag and aerosol pollution masks some heat, while methane and N₂O add more.
          </p>
        </div>
      </div>
    </Card>
  );
}
