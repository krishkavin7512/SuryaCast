import { useState } from 'react';
import { ChevronDown, SlidersHorizontal, RotateCcw } from 'lucide-react';
import { DEFAULT_SETTINGS, useAppState } from '../state';
import { Slider, NumberField, cx } from './ui';
import { fmt } from '../lib/format';

export default function SystemPanel({ showEconomics = false }: { showEconomics?: boolean }) {
  const { settings, setSettings, tilt, place } = useAppState();
  const [adv, setAdv] = useState(false);
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-ink">
          <SlidersHorizontal className="h-4 w-4 text-acc" aria-hidden /> Your rooftop system
        </div>
        <button
          onClick={() => setSettings(DEFAULT_SETTINGS)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-surface-3 hover:text-ink"
        >
          <RotateCcw className="h-3 w-3" aria-hidden /> Reset
        </button>
      </div>
      <div className="space-y-5">
        <Slider
          label="Panel capacity"
          value={settings.capacityKw}
          min={1}
          max={10}
          step={0.5}
          onChange={(v) => setSettings({ capacityKw: v })}
          display={`${fmt(settings.capacityKw, 1)} kWp`}
          hint={`≈ ${Math.ceil((settings.capacityKw * 1000) / 550)} panels of 550 W · needs ≈ ${Math.round(settings.capacityKw * 10)} m² of shade-free roof`}
        />
        <Slider
          label="Panel tilt (facing south)"
          value={tilt}
          min={0}
          max={45}
          onChange={(v) => setSettings({ tiltDeg: v })}
          display={
            <>
              {tilt}°{' '}
              {settings.tiltDeg === null && <span className="font-normal text-muted">(= latitude)</span>}
            </>
          }
          hint={settings.tiltDeg !== null ? undefined : `Rule of thumb: tilt ≈ latitude (${Math.abs(place.lat).toFixed(1)}°) for the most yearly energy.`}
        />
        <NumberField
          label="Electricity tariff"
          value={settings.tariffRs}
          step={0.5}
          min={0}
          prefix="₹"
          suffix="per unit (kWh)"
          onChange={(v) => setSettings({ tariffRs: v })}
        />
        {showEconomics && (
          <NumberField
            label="Installed cost before subsidy"
            value={settings.costPerKwRs}
            step={1000}
            min={0}
            prefix="₹"
            suffix="per kW"
            onChange={(v) => setSettings({ costPerKwRs: v })}
            hint="Assumption: typical 2025 residential quote. Use your vendor's quote."
          />
        )}
        <button
          onClick={() => setAdv((a) => !a)}
          className="flex w-full items-center justify-between rounded-lg py-1 text-sm font-medium text-ink-2 hover:text-ink"
          aria-expanded={adv}
        >
          Advanced engineering inputs
          <ChevronDown className={cx('h-4 w-4 transition', adv && 'rotate-180')} aria-hidden />
        </button>
        {adv && (
          <div className="space-y-5 border-t border-line pt-4">
            <Slider
              label="Balance-of-system efficiency"
              value={Math.round(settings.bosEfficiency * 100)}
              min={70}
              max={95}
              onChange={(v) => setSettings({ bosEfficiency: v / 100 })}
              display={`${Math.round(settings.bosEfficiency * 100)} %`}
              hint="Inverter, wiring, dust (soiling), mismatch and downtime losses combined."
            />
            <Slider
              label="Temperature coefficient"
              value={Math.round(settings.tempCoeff * 10000) / 100}
              min={-0.5}
              max={-0.25}
              step={0.01}
              onChange={(v) => setSettings({ tempCoeff: v / 100 })}
              display={`${fmt(settings.tempCoeff * 100, 2)} %/°C`}
              hint="Power lost per °C above 25 °C. Mono-PERC ≈ −0.37, TOPCon ≈ −0.30, HJT ≈ −0.26."
            />
          </div>
        )}
      </div>
    </div>
  );
}
