/* React wrappers around the shared motion toolkit. */
import { useEffect, useRef, type ReactNode } from 'react';
import { marquee, reduced, scramble, tween } from '../lib/fx';

/** Headline whose words rise out of a mask one after another. */
export function SplitText({ text, accent, base = 0, className = '', as: Tag = 'h1' }: { text: string; accent?: string; base?: number; className?: string; as?: 'h1' | 'h2' }) {
  let i = 0;
  const words = (s: string, em: boolean) =>
    s.split(/(\s+)/).map((w, k) =>
      /^\s+$/.test(w) || !w ? (
        w
      ) : (
        <span className="w" key={`${em ? 'e' : 'n'}${k}`}>
          <span style={{ ['--i' as string]: i++ }}>{w}</span>
        </span>
      ),
    );
  return (
    <Tag className={`split ${className}`} style={{ ['--base' as string]: `${base}ms` }}>
      {words(text, false)}
      {accent && (
        <>
          {' '}
          <em className="acc">{words(accent, true)}</em>
        </>
      )}
    </Tag>
  );
}

/** Number that counts from its previous value to the new one (like fx.countTo). */
export function CountUp({ value, decimals = 0, prefix = '', suffix = '', duration = 1400, format }: { value: number; decimals?: number; prefix?: string; suffix?: string; duration?: number; format?: (v: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef<number | null>(null);
  const seen = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !Number.isFinite(value)) {
      if (el) el.textContent = '–';
      return;
    }
    const show = (v: number) => {
      el.textContent = prefix + (format ? format(v) : v.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })) + suffix;
    };
    let cancel = () => {};
    const run = () => {
      const from = prev.current ?? 0;
      prev.current = value;
      cancel = tween(from, value, duration, show);
    };
    if (seen.current || reduced) {
      run();
      return () => cancel();
    }
    show(prev.current ?? 0);
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        seen.current = true;
        io.disconnect();
        run();
      }
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancel();
    };
  }, [value, decimals, prefix, suffix, duration, format]);
  return <span ref={ref} className="tabular" />;
}

/** Infinite marquee, outlined and filled words alternating. */
export function Marquee({ items }: { items: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => (ref.current ? marquee(ref.current) : undefined), []);
  const all = [...items, ...items];
  return (
    <div className="marquee" aria-hidden>
      <div className="marquee__track" ref={ref}>
        {all.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
    </div>
  );
}

/** Text that scrambles into its new value when it changes. */
export function Scramble({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (ref.current) scramble(ref.current, text);
  }, [text]);
  return <span ref={ref} className={className} />;
}

/** Fade + rise + un-blur when scrolled into view. `d` is a delay in ms. */
export function Reveal({ children, d = 0, scale = false, className = '' }: { children: ReactNode; d?: number; scale?: boolean; className?: string }) {
  return (
    <div data-reveal={scale ? 'scale' : ''} className={className} style={{ ['--d' as string]: d }}>
      {children}
    </div>
  );
}
