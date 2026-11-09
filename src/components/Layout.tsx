import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { capturing, cursor, initFx, tween } from '../lib/fx';
import { cx } from './ui';

const NAV = [
  { to: '/forecast', label: 'Live Forecast' },
  { to: '/planner', label: 'Impact Planner' },
  { to: '/model', label: 'Model Lab' },
  { to: '/performance', label: 'Performance' },
  { to: '/science', label: 'Climate Science' },
  { to: '/project', label: 'Project' },
];

export function Logo() {
  return (
    <Link to="/" className="group inline-flex items-center gap-2.5 font-display text-xl font-bold tracking-tight text-ink" aria-label="SuryaCast home" data-cursor="home">
      <svg viewBox="0 0 32 32" className="h-[26px] w-[26px] transition-transform duration-700 group-hover:rotate-90" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#ffc53d" />
        <circle cx="16" cy="16" r="5.2" fill="#1f1500" />
        <g stroke="#1f1500" strokeWidth="2.2" strokeLinecap="round">
          <line x1="16" y1="4.5" x2="16" y2="7.5" />
          <line x1="16" y1="24.5" x2="16" y2="27.5" />
          <line x1="4.5" y1="16" x2="7.5" y2="16" />
          <line x1="24.5" y1="16" x2="27.5" y2="16" />
          <line x1="7.9" y1="7.9" x2="10" y2="10" />
          <line x1="22" y1="22" x2="24.1" y2="24.1" />
          <line x1="7.9" y1="24.1" x2="10" y2="22" />
          <line x1="22" y1="10" x2="24.1" y2="7.9" />
        </g>
      </svg>
      SuryaCast
    </Link>
  );
}

/** Intro loader (count-up + wipe), shown once per browser session. */
function Loader() {
  const [skip] = useState(() => {
    try {
      return capturing || sessionStorage.getItem('sc-intro') === '1';
    } catch {
      return false;
    }
  });
  const [done, setDone] = useState(skip);
  const [gone, setGone] = useState(skip);
  const numRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (skip) return;
    try {
      sessionStorage.setItem('sc-intro', '1');
    } catch {
      /* ignore */
    }
    document.body.classList.add('is-loading');
    const stop = tween(0, 69388, 1150, (v) => {
      if (numRef.current) numRef.current.textContent = Math.round(v).toLocaleString('en-IN');
    });
    const a = setTimeout(() => {
      setDone(true);
      document.body.classList.remove('is-loading');
    }, 1350);
    const b = setTimeout(() => setGone(true), 2450);
    return () => {
      stop();
      clearTimeout(a);
      clearTimeout(b);
      document.body.classList.remove('is-loading');
    };
  }, [skip]);
  if (gone) return null;
  return (
    <div className={cx('loader', done && 'done')} aria-hidden>
      <div className="loader__inner">
        <div className="loader__read">
          <span ref={numRef}>0</span>
          <small>real days</small>
        </div>
        <div className="loader__line">
          <i />
        </div>
        <div className="loader__meta">
          <span>38 cities</span>
          <span>5 neural networks</span>
          <span>0 ML libraries</span>
        </div>
      </div>
    </div>
  );
}

function Navbar() {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const loc = useLocation();
  const linksRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [loc.pathname]);

  // Sliding pill behind the active link.
  useLayoutEffect(() => {
    const move = () => {
      const c = linksRef.current;
      const pill = pillRef.current;
      if (!c || !pill) return;
      const a = c.querySelector<HTMLElement>('a.active');
      if (!a) {
        pill.style.opacity = '0';
        return;
      }
      pill.style.opacity = '1';
      pill.style.width = `${a.offsetWidth}px`;
      pill.style.transform = `translateX(${a.offsetLeft}px)`;
    };
    move();
    const t = setTimeout(move, 400); // after fonts settle
    addEventListener('resize', move);
    return () => {
      clearTimeout(t);
      removeEventListener('resize', move);
    };
  }, [loc.pathname]);

  // Scroll progress bar and hide-on-scroll-down.
  useEffect(() => {
    let last = scrollY;
    const onScroll = () => {
      const y = scrollY;
      const max = document.documentElement.scrollHeight - innerHeight;
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
      setHidden(y > last && y > 500);
      last = y;
    };
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
    return () => removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <div className="progress" ref={progressRef} />
      <header className={cx('nav no-print', hidden && !open && 'hidden-nav')}>
        <Logo />
        <nav className="nav__links hidden xl:flex" aria-label="Main" ref={linksRef}>
          <span className="nav__pill" ref={pillRef} />
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/forecast" className="btn btn--primary btn--sm hidden sm:inline-flex" data-cursor="run">
            Run the model <span className="arrow">→</span>
          </Link>
          <button className="btn btn--sm xl:hidden" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </header>
      {open && (
        <nav className="fixed inset-x-4 top-20 z-[1090] rounded-2xl border border-line bg-surface/95 p-2 backdrop-blur-xl xl:hidden" aria-label="Mobile">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => cx('block rounded-xl px-4 py-3 text-base font-medium', isActive ? 'bg-acc/10 text-acc' : 'text-ink-2')}>
              {n.label}
            </NavLink>
          ))}
        </nav>
      )}
    </>
  );
}

function Footer() {
  return (
    <footer className="no-print mt-24 border-t border-line pb-10 pt-14 sm:pt-20">
      <div className="mx-auto w-[min(calc(100%-2*clamp(16px,4vw,56px)),1320px)]">
        <Link to="/forecast" className="mega-link" data-reveal="" data-cursor="open">
          <div className="mega-link__row">
            <div className="mega-link__txt">
              <span className="roll">
                <span>Forecast your roof,</span>
                <span>Forecast your roof,</span>
              </span>
              <br />
              <span className="roll">
                <span>cut the carbon.</span>
                <span>cut the carbon.</span>
              </span>
            </div>
            <div className="mega-link__arrow">
              <svg width="40%" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" stroke="#f4f1ea" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </Link>
        <div className="mt-10 grid grid-cols-1 gap-8 text-sm text-muted md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-3 max-w-sm leading-relaxed">
              An AI rooftop-solar forecaster and carbon-offset planner for Indian cities. Working model for{' '}
              <span className="text-ink-2">21CEO310T · Global Warming and Climate Change</span> (LLT / CLA-2).
            </p>
          </div>
          <div>
            <div className="tag mb-3">Explore</div>
            <ul className="space-y-1.5">
              {NAV.map((n) => (
                <li key={n.to}>
                  <Link to={n.to} className="text-ink-2 hover:text-acc">
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="tag mb-3">Data</div>
            <ul className="space-y-1.5 leading-relaxed">
              <li>
                ERA5 weather via{' '}
                <a className="border-b border-line-2 text-ink-2 hover:text-acc" href="https://open-meteo.com/" target="_blank" rel="noreferrer">
                  Open-Meteo
                </a>{' '}
                (CC BY 4.0)
              </li>
              <li>CO₂: NOAA Global Monitoring Laboratory</li>
              <li>Temperature: NASA GISTEMP v4, Berkeley Earth</li>
              <li>Grid emissions: Central Electricity Authority</li>
            </ul>
          </div>
        </div>
        <div className="mt-10 flex flex-wrap justify-between gap-3 border-t border-line pt-6 text-xs text-muted">
          <span>Neural network, back-propagation and Adam written from scratch in TypeScript. No ML libraries.</span>
          <span>No tracking. Every model runs in your browser.</span>
        </div>
      </div>
    </footer>
  );
}

export default function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  useEffect(() => {
    const stopCursor = capturing ? () => undefined : cursor();
    const stopFx = initFx(document.body);
    return () => {
      stopCursor();
      stopFx();
    };
  }, []);
  return (
    <div className="flex min-h-screen flex-col">
      <Loader />
      <div className="aurora no-print" aria-hidden>
        <span />
        <span />
      </div>
      <div className="gridlines" aria-hidden />
      <div className="grain" aria-hidden />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[2000] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">
        Skip to content
      </a>
      <Navbar />
      <main id="main" className="page-enter flex-1" key={pathname}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
