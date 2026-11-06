/* Shared app state: the selected place and rooftop system, persisted locally. */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import citiesJson from './data/cities.json';
import { SolarModel } from './lib/ml/model';

export interface City {
  id: string;
  name: string;
  state: string;
  lat: number;
  lon: number;
  zone: string;
  split: 'train' | 'holdout';
  elevation: number;
}

export const CITIES = (citiesJson as City[]).slice().sort((a, b) => a.name.localeCompare(b.name));

export interface Place {
  name: string;
  subtitle: string;
  lat: number;
  lon: number;
  /** Set when the place is one of the bundled cities (5-year history available offline). */
  cityId?: string;
  elevation?: number;
}

export const SRM_KTR: Place = {
  name: 'SRM IST, Kattankulathur',
  subtitle: 'Chengalpattu, Tamil Nadu',
  lat: 12.8231,
  lon: 80.0444,
};

export const cityPlace = (c: City): Place => ({
  name: c.name,
  subtitle: `${c.state} · ${c.zone}`,
  lat: c.lat,
  lon: c.lon,
  cityId: c.id,
  elevation: c.elevation,
});

export interface SystemSettings {
  capacityKw: number;
  /** null = use the latitude (the usual rule of thumb) */
  tiltDeg: number | null;
  tariffRs: number;
  costPerKwRs: number;
  bosEfficiency: number;
  tempCoeff: number;
}

export const DEFAULT_SETTINGS: SystemSettings = {
  capacityKw: 3,
  tiltDeg: null,
  tariffRs: 7,
  costPerKwRs: 60_000,
  bosEfficiency: 0.86,
  tempCoeff: -0.0037,
};

interface AppState {
  place: Place;
  setPlace: (p: Place) => void;
  settings: SystemSettings;
  setSettings: (s: Partial<SystemSettings>) => void;
  tilt: number;
}

const Ctx = createContext<AppState | null>(null);

/** Settings are merged with defaults (so new fields get values); a place is restored as-is. */
function load<T>(key: string, fallback: T, merge = true): T {
  try {
    const v = localStorage.getItem(key);
    if (!v) return fallback;
    const parsed = JSON.parse(v);
    return merge ? { ...fallback, ...parsed } : parsed;
  } catch {
    return fallback;
  }
}

function loadPlace(fallback: Place): Place {
  const p = load<Place | null>('sc-place', null, false);
  return p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && typeof p.name === 'string' ? p : fallback;
}

const DEFAULT_PLACE = cityPlace(CITIES.find((c) => c.id === 'chennai')!);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [place, setPlace] = useState<Place>(() => loadPlace(DEFAULT_PLACE));
  const [settings, setAll] = useState<SystemSettings>(() => load('sc-settings', DEFAULT_SETTINGS));
  useEffect(() => {
    localStorage.setItem('sc-place', JSON.stringify(place));
  }, [place]);
  useEffect(() => {
    localStorage.setItem('sc-settings', JSON.stringify(settings));
  }, [settings]);
  const value = useMemo<AppState>(
    () => ({
      place,
      setPlace,
      settings,
      setSettings: (s) => setAll((prev) => ({ ...prev, ...s })),
      tilt: settings.tiltDeg ?? Math.round(Math.abs(place.lat)),
    }),
    [place, settings],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppState outside provider');
  return v;
}

// ---------------------------------------------------------------- model loader
let modelPromise: Promise<SolarModel> | null = null;
export function getModel(): Promise<SolarModel> {
  if (!modelPromise) {
    modelPromise = SolarModel.load('/model/suryacast-mlp.json').catch((e) => {
      modelPromise = null;
      throw e;
    });
  }
  return modelPromise;
}

export function useModel(): { model: SolarModel | null; error: string | null } {
  const [model, setModel] = useState<SolarModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getModel()
      .then((m) => alive && setModel(m))
      .catch((e) => alive && setError(String(e.message || e)));
    return () => {
      alive = false;
    };
  }, []);
  return { model, error };
}
