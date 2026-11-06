import { Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudSnow, CloudLightning } from 'lucide-react';

export default function WeatherIcon({ code, className = 'h-6 w-6' }: { code: number; className?: string }) {
  const p = { className, 'aria-hidden': true, strokeWidth: 1.8 } as const;
  if (code === 0 || code === 1) return <Sun {...p} className={`${className} text-amber-500`} />;
  if (code === 2) return <CloudSun {...p} className={`${className} text-amber-500`} />;
  if (code === 3) return <Cloud {...p} className={`${className} text-slate-400`} />;
  if (code === 45 || code === 48) return <CloudFog {...p} className={`${className} text-slate-400`} />;
  if (code >= 51 && code <= 57) return <CloudDrizzle {...p} className={`${className} text-sky-400`} />;
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return <CloudRain {...p} className={`${className} text-sky-400`} />;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return <CloudSnow {...p} className={`${className} text-sky-400`} />;
  if (code >= 95) return <CloudLightning {...p} className={`${className} text-violet-400`} />;
  return <CloudSun {...p} className={`${className} text-amber-500`} />;
}
