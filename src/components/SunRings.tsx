import { useEffect, useRef, useState } from 'react';
import { reduced } from '../lib/fx';
import { MONTHS } from '../lib/format';

interface Dot {
  year: number;
  doy: number;
  date: string;
  ghi: number; // kWh/m2
  v: number; // 0..1 normalised
  delay: number;
}

const ease = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
function colour(v: number, a: number) {
  // ember -> orange -> gold -> near-white
  const stops = [
    [70, 28, 14],
    [224, 98, 31],
    [255, 197, 61],
    [255, 246, 214],
  ];
  const x = Math.min(0.999, Math.max(0, v)) * (stops.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const c = stops[i].map((s, k) => Math.round(s + (stops[i + 1][k] - s) * f));
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

/**
 * Hero visual: five years of real daily sunlight as rings of dots around a sun.
 * Angle = day of year, ring = year, size and colour = that day's solar energy.
 */
export default function SunRings({ cityId = 'chennai', cityName = 'Chennai' }: { cityId?: string; cityName?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<Dot | null>(null);
  const [stats, setStats] = useState<{ best: number; worst: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let dots: Dot[] = [];
    let W = 0;
    let H = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;
    let visible = true;
    let alive = true;
    let px = -1;
    let py = -1;
    let tiltX = 0;
    let tiltY = 0;
    let targetX = 0;
    let targetY = 0;
    let scrollBoost = 0;
    let lastScroll = scrollY;
    let hovered: Dot | null = null;
    const t0 = performance.now();

    fetch(`/data/cities/${cityId}.json`)
      .then((r) => r.json())
      .then((j: { start: string; rows: [number, number, number, number][] }) => {
        if (!alive) return;
        const base = Date.parse(`${j.start}T00:00:00Z`);
        const raw = j.rows.map(([d, g]) => {
          const dt = new Date(base + d * 86_400_000);
          const year = dt.getUTCFullYear();
          const doy = Math.floor((dt.getTime() - Date.UTC(year, 0, 1)) / 86_400_000) + 1;
          return { year, doy, date: dt.toISOString().slice(0, 10), ghi: g / 3.6 };
        });
        const max = Math.max(...raw.map((r) => r.ghi));
        const min = Math.min(...raw.map((r) => r.ghi));
        // Rank (percentile) scale: the cloudiest quarter of days glows dim ember, the sunniest quarter near-white.
        const order = raw.map((r, i) => [r.ghi, i] as const).sort((a, b) => a[0] - b[0]);
        const rank = new Array<number>(raw.length);
        order.forEach(([, i], k) => (rank[i] = k / (raw.length - 1)));
        dots = raw.map((r, i) => ({ ...r, v: rank[i], delay: (r.year - 2021) * 0.12 + (r.doy / 365) * 0.5 }));
        setStats({ best: max, worst: min });
      })
      .catch(() => undefined);

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      W = r.width;
      H = r.height;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(canvas);
    const onScroll = () => {
      scrollBoost += Math.abs(scrollY - lastScroll) * 0.00008;
      lastScroll = scrollY;
    };
    addEventListener('scroll', onScroll, { passive: true });
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      px = e.clientX - r.left;
      py = e.clientY - r.top;
      targetX = (py / r.height - 0.5) * 0.35;
      targetY = (px / r.width - 0.5) * 0.35;
    };
    const onLeave = () => {
      px = py = -1;
      targetX = targetY = 0;
      hovered = null;
      setHover(null);
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);

    let rot = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible) return;
      const t = (now - t0) / 1000;
      scrollBoost *= 0.92;
      rot += reduced ? 0 : 0.0006 + scrollBoost;
      tiltX += (targetX - tiltX) * 0.06;
      tiltY += (targetY - tiltY) * 0.06;
      ctx.clearRect(0, 0, W, H);
      const S = Math.min(W, H);
      const cx = W / 2 + tiltY * 30;
      const cy = H / 2 + tiltX * 30;
      const R0 = S * 0.13;
      const inner = R0 * 1.55;
      const outer = S * 0.5 - 32; // leave room for the month labels
      const gap = (outer - inner) / 4;
      const squash = 1 - Math.abs(tiltX) * 0.25;

      // sun glow and disc
      const pulse = reduced ? 1 : 1 + Math.sin(t * 1.4) * 0.03;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, outer * 1.1);
      glow.addColorStop(0, 'rgba(255,197,61,0.22)');
      glow.addColorStop(0.35, 'rgba(224,98,31,0.08)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
      const disc = ctx.createRadialGradient(cx - R0 * 0.3, cy - R0 * 0.3, R0 * 0.1, cx, cy, R0 * pulse);
      disc.addColorStop(0, '#fff6d6');
      disc.addColorStop(0.45, '#ffc53d');
      disc.addColorStop(1, '#e0621f');
      ctx.beginPath();
      ctx.arc(cx, cy, R0 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = disc;
      ctx.fill();

      // faint guide rings and month spokes
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, squash);
      ctx.strokeStyle = 'rgba(255,228,190,0.06)';
      ctx.lineWidth = 1;
      for (let k = 0; k < 5; k++) {
        ctx.beginPath();
        ctx.arc(0, 0, inner + k * gap, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      ctx.font = '600 10px "JetBrains Mono Variable", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let m = 0; m < 12; m++) {
        const a = -Math.PI / 2 + ((m + 0.5) / 12) * Math.PI * 2 + rot;
        ctx.fillStyle = 'rgba(201,197,188,0.55)';
        ctx.fillText(MONTHS[m].toUpperCase(), cx + Math.cos(a) * (outer + 18), cy + Math.sin(a) * (outer + 18) * squash);
      }

      // the data
      const asm = reduced ? 1 : Math.max(0, (now - t0 - 500) / 2400);
      let best: { d: Dot; dist: number } | null = null;
      for (const d of dots) {
        const a = reduced ? 1 : ease(Math.max(0, Math.min(1, (asm - d.delay * 0.6) / 0.5)));
        if (a <= 0) continue;
        const ang = -Math.PI / 2 + ((d.doy - 1) / 365) * Math.PI * 2 + rot;
        const rr = R0 + (inner + (d.year - 2021) * gap - R0) * a;
        const x = cx + Math.cos(ang) * rr;
        const y = cy + Math.sin(ang) * rr * squash;
        const size = (0.7 + 2.5 * Math.pow(d.v, 1.6)) * (0.6 + 0.4 * a);
        const isHover = hovered === d;
        if (d.v > 0.72 && !isHover) {
          ctx.beginPath();
          ctx.arc(x, y, size * 2.6, 0, Math.PI * 2);
          ctx.fillStyle = colour(d.v, 0.07 * a);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(x, y, isHover ? size + 3 : size, 0, Math.PI * 2);
        ctx.fillStyle = isHover ? '#ffffff' : colour(d.v, 0.25 + 0.75 * a);
        ctx.fill();
        if (px >= 0) {
          const dist = (x - px) ** 2 + (y - py) ** 2;
          if (dist < 90 && (!best || dist < best.dist)) best = { d, dist };
        }
      }
      if ((best?.d ?? null) !== hovered) {
        hovered = best?.d ?? null;
        setHover(hovered);
      }
      // year labels along the top
      ctx.font = '500 9px "JetBrains Mono Variable", monospace';
      ctx.textAlign = 'left';
      for (let k = 0; k < 5; k++) {
        ctx.fillStyle = 'rgba(142,137,127,0.8)';
        ctx.fillText(String(2021 + k), cx + 6, cy - (inner + k * gap) * squash);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      removeEventListener('scroll', onScroll);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
    };
  }, [cityId]);

  return (
    <figure className="relative m-0">
      <canvas
        ref={canvasRef}
        className="aspect-square w-full"
        data-cursor="day"
        role="img"
        aria-label={`Five years of daily sunlight in ${cityName}, 2021 to 2025, drawn as rings of dots around a sun. Brighter, larger dots are sunnier days; the darker arcs are the monsoon months.`}
      />
      <div className="pointer-events-none absolute left-0 top-0">
        {hover ? (
          <div className="rounded-full border border-line-2 bg-bg/80 px-3 py-1 font-mono text-xs text-ink backdrop-blur">
            {new Date(`${hover.date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} ·{' '}
            <b className="text-acc">{hover.ghi.toFixed(2)}</b> kWh/m²
          </div>
        ) : (
          <div className="tag">hover a day</div>
        )}
      </div>
      <figcaption className="mt-1 text-center text-xs leading-relaxed text-muted">
        Every dot is one real day of sunlight in <span className="text-ink-2">{cityName}</span>, 2021–2025 (ERA5). Rings are years, the angle is
        the date. Dark arcs are monsoon cloud.
        {stats && (
          <>
            {' '}
            Range {stats.worst.toFixed(1)}–{stats.best.toFixed(1)} kWh/m² per day.
          </>
        )}
      </figcaption>
    </figure>
  );
}
