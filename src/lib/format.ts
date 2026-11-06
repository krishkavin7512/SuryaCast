const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export const fmt = (v: number, digits = 1) =>
  Number.isFinite(v) ? v.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '–';

export const fmt0 = (v: number) => (Number.isFinite(v) ? inr.format(Math.round(v)) : '–');

/** Indian currency, compact for large values (lakh / crore). */
export function rupees(v: number): string {
  if (!Number.isFinite(v)) return '–';
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} crore`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2)} lakh`;
  return `${sign}₹${inr.format(Math.round(a))}`;
}

/** Mass in kg, switching to tonnes above 1,000 kg. */
export function mass(kg: number, digits = 1): string {
  if (!Number.isFinite(kg)) return '–';
  if (Math.abs(kg) >= 1e9) return `${fmt(kg / 1e9, 2)} Mt`;
  if (Math.abs(kg) >= 1e6) return `${fmt(kg / 1e6, 2)} kt`;
  if (Math.abs(kg) >= 1000) return `${fmt(kg / 1000, digits)} t`;
  return `${fmt(kg, kg < 10 ? 1 : 0)} kg`;
}

export function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function weekday(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-IN', { weekday: 'short' });
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const MJ_TO_KWH = 1 / 3.6;
