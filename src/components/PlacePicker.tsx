import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Search, LocateFixed, Map as MapIcon, X, GraduationCap, Loader2 } from 'lucide-react';
import { CITIES, SRM_KTR, cityPlace, useAppState, type Place } from '../state';
import { cx } from './ui';

const MapPicker = lazy(() => import('./MapPicker'));

interface GeoResult {
  id: number;
  name: string;
  admin1?: string;
  country_code: string;
  latitude: number;
  longitude: number;
  elevation?: number;
}

export function placeLabel(p: Place) {
  return `${Math.abs(p.lat).toFixed(2)}°${p.lat >= 0 ? 'N' : 'S'}, ${Math.abs(p.lon).toFixed(2)}°${p.lon >= 0 ? 'E' : 'W'}`;
}

export default function PlacePicker({ compact = false }: { compact?: boolean }) {
  const { place, setPlace } = useAppState();
  const [open, setOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [q, setQ] = useState('');
  const [geo, setGeo] = useState<GeoResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const local = useMemo(() => {
    const s = q.trim().toLowerCase();
    return CITIES.filter((c) => !s || c.name.toLowerCase().includes(s) || c.state.toLowerCase().includes(s));
  }, [q]);

  // Search any Indian town through the Open-Meteo geocoder when local cities don't match.
  useEffect(() => {
    const s = q.trim();
    if (s.length < 3) {
      setGeo([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(s)}&count=8&language=en&countryCode=IN`);
        const j = await r.json();
        setGeo((j.results ?? []) as GeoResult[]);
      } catch {
        setGeo([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const choose = (p: Place) => {
    setPlace(p);
    setOpen(false);
    setQ('');
    setMsg(null);
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setMsg('Location is not available in this browser.');
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        choose({
          name: 'My location',
          subtitle: placeLabel({ name: '', subtitle: '', lat: pos.coords.latitude, lon: pos.coords.longitude }),
          lat: Number(pos.coords.latitude.toFixed(4)),
          lon: Number(pos.coords.longitude.toFixed(4)),
        });
      },
      () => {
        setBusy(false);
        setMsg('Location permission was denied. Pick a city or use the map instead.');
      },
      { timeout: 10000 },
    );
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cx(
          'group flex w-full items-center gap-3 card text-left transition hover:border-acc/40',
          compact ? 'px-3 py-2' : 'px-4 py-3',
        )}
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-acc/10 text-acc">
          <MapPin className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-ink">{place.name}</span>
          <span className="block truncate text-xs text-muted">
            {place.subtitle} · {placeLabel(place)}
          </span>
        </span>
        <span className="rounded-lg bg-surface-3 px-2.5 py-1 text-xs font-semibold text-ink-2 group-hover:bg-acc/10 group-hover:text-acc">
          Change
        </span>
      </button>

      {open && (
        <div role="dialog" aria-label="Choose a location" className="absolute left-0 right-0 top-full z-[1100] mt-2 overflow-hidden rounded-2xl border border-line-2 bg-[#0e1016]/95 shadow-2xl backdrop-blur-xl animate-rise sm:right-auto sm:w-[420px]">
          <div className="border-b border-line p-3">
            <div className="flex items-center gap-2 rounded-xl border border-line px-3 focus-within:border-acc/60 focus-within:ring-2 focus-within:ring-acc/15">
              <Search className="h-4 w-4 text-muted" aria-hidden />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search any city or town in India…"
                className="w-full bg-transparent py-2.5 text-sm outline-none"
                aria-label="Search location"
              />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <button onClick={locate} className="flex items-center justify-center gap-1.5 rounded-lg bg-surface-3 px-2 py-2 text-xs font-semibold text-ink-2 hover:bg-acc/10 hover:text-acc">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />} My location
              </button>
              <button
                onClick={() => {
                  setMapOpen(true);
                  setOpen(false);
                }}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-surface-3 px-2 py-2 text-xs font-semibold text-ink-2 hover:bg-acc/10 hover:text-acc"
              >
                <MapIcon className="h-3.5 w-3.5" /> Pick on map
              </button>
              <button onClick={() => choose(SRM_KTR)} className="flex items-center justify-center gap-1.5 rounded-lg bg-surface-3 px-2 py-2 text-xs font-semibold text-ink-2 hover:bg-acc/10 hover:text-acc">
                <GraduationCap className="h-3.5 w-3.5" /> SRM KTR
              </button>
            </div>
            {msg && <p className="mt-2 text-xs text-amber-400">{msg}</p>}
          </div>
          <div className="max-h-80 overflow-y-auto p-1.5">
            {local.length > 0 && <div className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Model cities (5-yr data bundled)</div>}
            {local.map((c) => (
              <button
                key={c.id}
                onClick={() => choose(cityPlace(c))}
                className={cx('flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm hover:bg-acc/10', place.cityId === c.id && 'bg-acc/10')}
              >
                <span>
                  <span className="font-medium text-ink">{c.name}</span>
                  <span className="ml-2 text-xs text-muted">{c.state}</span>
                </span>
                <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-semibold', c.split === 'train' ? 'bg-[#e0621f]/15 text-[#f08a55]' : 'bg-[#3987e5]/15 text-[#7fb2f0]')}>
                  {c.split === 'train' ? 'trained' : 'unseen'}
                </span>
              </button>
            ))}
            {geo.length > 0 && <div className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Other places</div>}
            {geo.map((g) => (
              <button
                key={g.id}
                onClick={() =>
                  choose({ name: g.name, subtitle: g.admin1 ?? 'India', lat: Number(g.latitude.toFixed(4)), lon: Number(g.longitude.toFixed(4)), elevation: g.elevation })
                }
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm hover:bg-acc/10"
              >
                <span>
                  <span className="font-medium text-ink">{g.name}</span>
                  <span className="ml-2 text-xs text-muted">{g.admin1}</span>
                </span>
              </button>
            ))}
            {local.length === 0 && geo.length === 0 && <p className="p-4 text-center text-sm text-muted">Type at least 3 letters to search all of India.</p>}
          </div>
        </div>
      )}

      {mapOpen &&
        createPortal(
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-night/70 p-4 backdrop-blur-sm" role="dialog" aria-label="Pick a location on the map">
          <div className="relative w-full max-w-4xl overflow-hidden rounded-3xl bg-surface-2 shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <div>
                <div className="font-semibold text-ink">Click anywhere, even on your own rooftop</div>
                <div className="text-xs text-muted">Satellite imagery: zoom in to find your building, then click it.</div>
              </div>
              <button onClick={() => setMapOpen(false)} className="rounded-lg p-2 hover:bg-surface-3" aria-label="Close map">
                <X className="h-5 w-5" />
              </button>
            </div>
            <Suspense fallback={<div className="skeleton m-4 h-[60vh]" />}>
              <MapPicker
                initial={place}
                onPick={(lat, lon) => {
                  setMapOpen(false);
                  const near = CITIES.find((c) => Math.abs(c.lat - lat) < 0.05 && Math.abs(c.lon - lon) < 0.05);
                  choose(near ? cityPlace(near) : { name: 'Pinned rooftop', subtitle: 'Picked on map', lat: Number(lat.toFixed(4)), lon: Number(lon.toFixed(4)) });
                }}
              />
            </Suspense>
          </div>
        </div>,
          document.body,
        )}
    </div>
  );
}
