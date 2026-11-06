// Monthly generation of a 3 kWp rooftop in Chennai from 5 real years (for the report figure).
import fs from 'node:fs';
import path from 'node:path';
import { simulateHistory } from '../../src/lib/planner';
import { DEFAULT_SYSTEM } from '../../src/lib/pv';
const ROOT = path.resolve(import.meta.dirname, '..', '..');
const h = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/cities/chennai.json'), 'utf8'));
const sim = simulateHistory({ ...h, source: 'bundled' }, h.lat, { ...DEFAULT_SYSTEM, capacityKw: 3, tiltDeg: 13 });
fs.writeFileSync(process.argv[2], JSON.stringify(sim));
console.log('annual', Math.round(sim.annualKwh), 'yield', Math.round(sim.specificYield), 'PR', sim.performanceRatio.toFixed(3), 'CF', sim.capacityFactor.toFixed(3));
