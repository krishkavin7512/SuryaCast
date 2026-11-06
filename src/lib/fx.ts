/**
 * Motion toolkit, shared with GlucoSense / StrengthLab / SmogPrint / HomePulse:
 * reveals, split text, count-ups, magnetic buttons, tilt + spotlight cards,
 * custom cursor, scroll-velocity marquee, text scramble and toasts.
 */
/** Capture mode (?capture): every animation renders in its final state, for screenshots. */
export const capturing = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('capture');
export const reduced = typeof window !== 'undefined' && (window.matchMedia('(prefers-reduced-motion: reduce)').matches || capturing);
if (capturing) document.documentElement.classList.add('capture');
export const fine = typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

export const ease = {
  outExpo: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

export function tween(from: number, to: number, dur: number, fn: (v: number) => void, easing = ease.outExpo): () => void {
  if (reduced) {
    fn(to);
    return () => undefined;
  }
  let raf = 0;
  const t0 = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / dur);
    fn(from + (to - from) * easing(t));
    if (t < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/** Buttons drift towards the cursor and snap back with a spring. */
export function magnetic(el: HTMLElement, strength = 0.3) {
  if (!fine || reduced || (el as HTMLElement & { _mag?: boolean })._mag) return;
  (el as HTMLElement & { _mag?: boolean })._mag = true;
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * strength}px, ${(e.clientY - r.top - r.height / 2) * strength}px)`;
    el.style.transition = 'transform .15s ease-out';
  });
  el.addEventListener('pointerleave', () => {
    el.style.transform = '';
    el.style.transition = 'transform .8s cubic-bezier(.34,1.56,.64,1)';
  });
}

/** 3D tilt (optional) plus a spotlight that follows the pointer. */
export function tilt(el: HTMLElement, max = 0) {
  if (!fine || (el as HTMLElement & { _tilt?: boolean })._tilt) return;
  (el as HTMLElement & { _tilt?: boolean })._tilt = true;
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
    if (max && !reduced) {
      el.style.transform = `perspective(1000px) rotateX(${(0.5 - py) * max}deg) rotateY(${(px - 0.5) * max}deg)`;
      el.style.transition = 'transform .1s linear';
    }
  });
  el.addEventListener('pointerleave', () => {
    if (!max) return;
    el.style.transform = '';
    el.style.transition = 'transform .9s cubic-bezier(.16,1,.3,1)';
  });
}

/** Custom cursor: a dot and a lagging ring that grows over anything clickable. */
export function cursor(): () => void {
  if (!fine) return () => undefined;
  const dot = document.createElement('div');
  dot.className = 'cursor';
  const ring = document.createElement('div');
  ring.className = 'cursor-ring';
  const label = document.createElement('span');
  ring.appendChild(label);
  document.body.append(dot, ring);
  let x = innerWidth / 2;
  let y = innerHeight / 2;
  let rx = x;
  let ry = y;
  let raf = 0;
  const onMove = (e: PointerEvent) => {
    x = e.clientX;
    y = e.clientY;
  };
  addEventListener('pointermove', onMove, { passive: true });
  const loop = () => {
    rx += (x - rx) * 0.16;
    ry += (y - ry) * 0.16;
    dot.style.transform = `translate(${x}px, ${y}px)`;
    ring.style.transform = `translate(${rx}px, ${ry}px)`;
    raf = requestAnimationFrame(loop);
  };
  loop();
  const onOver = (e: Event) => {
    const t = (e.target as HTMLElement).closest?.('a, button, [data-cursor], input, select, summary, label') as HTMLElement | null;
    ring.classList.toggle('hover', !!t);
    const text = t?.dataset?.cursor || '';
    label.textContent = text;
    ring.classList.toggle('has-label', !!text);
  };
  document.addEventListener('pointerover', onOver);
  return () => {
    cancelAnimationFrame(raf);
    removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerover', onOver);
    dot.remove();
    ring.remove();
  };
}

/** Infinite marquee whose speed and skew react to scroll velocity. */
export function marquee(track: HTMLElement, base = 0.6): () => void {
  let x = 0;
  let vel = 0;
  let lastY = scrollY;
  let raf = 0;
  const loop = () => {
    const w = track.scrollWidth / 2;
    const dy = scrollY - lastY;
    lastY = scrollY;
    vel += (dy * 0.25 - vel) * 0.1;
    if (!reduced) x -= base + Math.abs(vel);
    if (x <= -w) x += w;
    track.style.transform = `translate3d(${x}px,0,0) skewX(${Math.max(-12, Math.min(12, -vel * 0.4))}deg)`;
    raf = requestAnimationFrame(loop);
  };
  loop();
  return () => cancelAnimationFrame(raf);
}

/** Text scramble for labels that change value. */
export function scramble(el: HTMLElement, text: string, dur = 700) {
  if (reduced) {
    el.textContent = text;
    return;
  }
  const chars = '!<>-_\\/[]{}=+*^?#01';
  const t0 = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / dur);
    const n = Math.floor(p * text.length);
    let out = text.slice(0, n);
    for (let i = n; i < text.length; i++) out += text[i] === ' ' ? ' ' : chars[(Math.random() * chars.length) | 0];
    el.textContent = out;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function toast(msg: string) {
  let t = document.querySelector('.toast') as (HTMLElement & { _h?: number }) | null;
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = window.setTimeout(() => t!.classList.remove('show'), 2600);
}

/**
 * One observer for the whole app: reveals [data-reveal] / .split elements as
 * they scroll into view, and wires magnetic buttons and spotlight cards,
 * including elements React adds later.
 */
export function initFx(root: HTMLElement = document.body): () => void {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
  );
  if (capturing) {
    const all = () => document.querySelectorAll('[data-reveal], .split').forEach((el) => el.classList.add('in'));
    all();
    const mo = new MutationObserver(all);
    mo.observe(root, { childList: true, subtree: true });
    const at = new URLSearchParams(window.location.search).get('at');
    if (at) setTimeout(() => document.getElementById(at)?.scrollIntoView({ block: 'start' }), 300);
    return () => mo.disconnect();
  }
  const each = (node: Element | Document | HTMLElement, sel: string, fn: (el: HTMLElement) => void) => {
    if (node instanceof Element && node.matches(sel)) fn(node as HTMLElement);
    node.querySelectorAll?.<HTMLElement>(sel).forEach(fn);
  };
  const scan = (node: Element | HTMLElement) => {
    each(node, '[data-reveal]:not(.in), .split:not(.in)', (el) => io.observe(el));
    each(node, '[data-magnetic], .btn', (el) => magnetic(el));
    each(node, '.card', (el) => tilt(el, Number(el.dataset.tilt || 0)));
  };
  scan(root);
  const mo = new MutationObserver((muts) => {
    for (const m of muts) m.addedNodes.forEach((n) => n.nodeType === 1 && scan(n as Element));
  });
  mo.observe(root, { childList: true, subtree: true });
  return () => {
    io.disconnect();
    mo.disconnect();
  };
}
