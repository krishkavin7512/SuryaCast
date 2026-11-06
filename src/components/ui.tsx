import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { CountUp } from './motion';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mx-auto w-[min(calc(100%-2*clamp(16px,4vw,56px)),1320px)]', className)}>{children}</div>;
}

export function Eyebrow({ children }: { children: ReactNode; tone?: string }) {
  return (
    <span className="eyebrow" data-reveal="">
      {children}
    </span>
  );
}

/** Page header: eyebrow, big two-tone headline, lead, unit chips; optional right column. */
export function PageHead({
  eyebrow,
  title,
  em,
  lead,
  units,
  right,
}: {
  eyebrow: string;
  title: string;
  em?: string;
  lead?: ReactNode;
  units?: string[];
  right?: ReactNode;
}) {
  return (
    <section className="relative pb-10 pt-32 sm:pt-36">
      <Container className={cx('grid gap-10', !!right && 'lg:grid-cols-[1.25fr_1fr] lg:items-end')}>
        <div>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="h2 !mb-5 !text-[clamp(36px,4.6vw,68px)]" data-reveal="" style={{ ['--d' as string]: 80 }}>
            {title} {em && <em>{em}</em>}
          </h1>
          {lead && (
            <p className="lead" data-reveal="" style={{ ['--d' as string]: 180 }}>
              {lead}
            </p>
          )}
          {units && (
            <div className="mt-5 flex flex-wrap gap-2" data-reveal="" style={{ ['--d' as string]: 260 }}>
              {units.map((u) => (
                <UnitChip key={u}>{u}</UnitChip>
              ))}
            </div>
          )}
        </div>
        {right && (
          <div data-reveal="" style={{ ['--d' as string]: 220 }} className="relative z-20">
            {right}
          </div>
        )}
      </Container>
    </section>
  );
}

export function SectionTitle({ eyebrow, title, em, children, units }: { eyebrow?: string; title: ReactNode; em?: string; children?: ReactNode; units?: string[] }) {
  return (
    <div className="mb-10 grid gap-6 lg:grid-cols-[1.15fr_.85fr] lg:items-end">
      <div>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h2 className="h2 !mb-0" data-reveal="">
          {title} {em && <em>{em}</em>}
        </h2>
      </div>
      <div>
        {children && (
          <p className="lead" data-reveal="" style={{ ['--d' as string]: 150 }}>
            {children}
          </p>
        )}
        {units && (
          <div className="mt-4 flex flex-wrap gap-2" data-reveal="" style={{ ['--d' as string]: 220 }}>
            {units.map((u) => (
              <UnitChip key={u}>{u}</UnitChip>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function UnitChip({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-full border border-acc/30 bg-acc/[0.06] px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-acc">{children}</span>;
}

export function Card({ children, className, pad = true, reveal = true, d = 0 }: { children: ReactNode; className?: string; pad?: boolean; reveal?: boolean; d?: number }) {
  return (
    <div className={cx('card', pad && 'p-5 sm:p-6', className)} data-reveal={reveal ? '' : undefined} style={reveal && d ? { ['--d' as string]: d } : undefined}>
      {children}
    </div>
  );
}

export function CardTitle({ children, sub, right }: { children: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 max-w-3xl">
        <h3 className="font-display text-xl font-semibold tracking-tight text-ink">{children}</h3>
        {sub && <p className="mt-1 text-sm leading-relaxed text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

/** Stat tile with a mono count-up value. */
export function Stat({
  label,
  value,
  num,
  decimals = 1,
  unit,
  sub,
  icon,
  d = 0,
}: {
  label: string;
  value?: ReactNode;
  num?: number;
  decimals?: number;
  unit?: string;
  sub?: ReactNode;
  icon?: ReactNode;
  accent?: string;
  d?: number;
}) {
  return (
    <div className="card flex flex-col gap-3 p-5" data-reveal="" style={{ ['--d' as string]: d }}>
      <div className="flex items-center gap-2.5">
        {icon && <span className="grid h-8 w-8 place-items-center rounded-lg border border-line-2 text-acc">{icon}</span>}
        <span className="tag !text-[10.5px]">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="stat__v text-ink">{num !== undefined ? <CountUp value={num} decimals={decimals} /> : value}</span>
        {unit && <span className="font-mono text-xs text-muted">{unit}</span>}
      </div>
      {sub && <div className="text-xs leading-relaxed text-muted">{sub}</div>}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  display,
  hint,
  id,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  display?: ReactNode;
  hint?: string;
  id?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const inputId = id ?? `s-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div>
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <label htmlFor={inputId} className="text-[13px] text-ink-2">
          {label}
        </label>
        <span className="font-mono text-[13px] font-semibold text-ink">{display ?? value}</span>
      </div>
      <input id={inputId} type="range" className="slider" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ ['--fill' as string]: `${pct}%` }} />
      {hint && <p className="mt-2 text-xs leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step = 1,
  min,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
  min?: number;
  hint?: string;
}) {
  const id = `n-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] text-ink-2">
        {label}
      </label>
      <div className="flex items-center rounded-xl border border-line-2 bg-surface px-3 transition focus-within:border-acc/60">
        {prefix && <span className="font-mono text-sm text-muted">{prefix}</span>}
        <input
          id={id}
          type="number"
          step={step}
          min={min}
          value={value}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(v);
          }}
          className="w-full bg-transparent px-2 py-2 font-mono text-sm font-semibold text-ink outline-none"
        />
        {suffix && <span className="whitespace-nowrap text-xs text-muted">{suffix}</span>}
      </div>
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Segmented control with a sliding pill behind the active option. */
export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const a = wrap.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (a && pill.current) {
      pill.current.style.width = `${a.offsetWidth}px`;
      pill.current.style.transform = `translateX(${a.offsetLeft}px)`;
    }
  }, [value, options.length]);
  return (
    <div ref={wrap} role="radiogroup" aria-label={label} className="relative inline-flex rounded-full border border-line bg-surface/70 p-1">
      <span ref={pill} className="absolute bottom-1 left-0 top-1 rounded-full border border-acc/40 bg-acc/10 transition-all duration-500 [transition-timing-function:cubic-bezier(.16,1,.3,1)]" />
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx('relative z-10 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors', o.value === value ? 'text-ink' : 'text-muted hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <div className={cx('flex gap-3 rounded-xl border p-4 text-sm leading-relaxed', tone === 'info' ? 'border-d-a/30 bg-d-a/[0.07] text-ink-2' : 'border-acc/30 bg-acc/[0.07] text-ink-2')}>
      <Info className={cx('mt-0.5 h-4 w-4 shrink-0', tone === 'info' ? 'text-d-a' : 'text-acc')} aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function LegendItem({ color, label, dashed, square }: { color: string; label: string; dashed?: boolean; square?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-ink-2">
      {square ? (
        <span className="h-3 w-3 rounded-[3px]" style={{ background: color }} />
      ) : (
        <svg width="20" height="8" aria-hidden>
          <line x1="1" y1="4" x2="19" y2="4" stroke={color} strokeWidth="2.5" strokeDasharray={dashed ? '4 3' : undefined} strokeLinecap="round" />
        </svg>
      )}
      {label}
    </span>
  );
}

/** Tooltip shell for Recharts custom tooltips. */
export function TipBox({ title, rows }: { title: ReactNode; rows: { label: string; value: ReactNode; color?: string }[] }) {
  return (
    <div className="min-w-44 rounded-xl border border-line-2 bg-[#0d0f14]/95 px-3 py-2.5 text-xs shadow-2xl backdrop-blur">
      <div className="mb-1.5 font-semibold text-ink">{title}</div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted">
              {r.color && <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />}
              {r.label}
            </span>
            <span className="font-mono font-semibold text-ink">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Data colours (validated for the dark surface; same set as the sibling projects). */
export const SERIES = {
  ml: '#e0621f',
  ref: '#3987e5',
  leaf: '#199e70',
  violet: '#9085e9',
  truth: '#c9c5bc',
  red: '#e66767',
  gold: '#ffc53d',
  grid: 'rgba(255,228,190,0.07)',
  axis: 'rgba(255,228,190,0.18)',
};
