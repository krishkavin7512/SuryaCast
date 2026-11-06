import { FEATURE_NAMES } from '../lib/ml/features';

/**
 * Draws the 13-64-32-1 network. When `trace` is given (activations of each
 * layer for the current input), neurons light up in proportion to their activity.
 */
export default function NetworkDiagram({ trace, output }: { trace?: number[][] | null; output?: string }) {
  const W = 760;
  const H = 420;
  const layers = [
    { n: 13, show: 13, x: 170, label: 'Inputs (13 features)' },
    { n: 64, show: 16, x: 380, label: 'Hidden layer 1 · 64 neurons' },
    { n: 32, show: 12, x: 560, label: 'Hidden layer 2 · 32 neurons' },
    { n: 1, show: 1, x: 700, label: 'Clearness Kt' },
  ];
  const ys = (count: number) => {
    const top = 46;
    const bottom = H - 30;
    if (count === 1) return [(top + bottom) / 2];
    return Array.from({ length: count }, (_, i) => top + (i * (bottom - top)) / (count - 1));
  };
  const pos = layers.map((l) => ys(l.show));
  // Normalise activations per layer for colouring.
  const intensity = (li: number, ni: number) => {
    if (!trace) return 0.25;
    const layer = trace[li];
    if (!layer) return 0.25;
    const idx = Math.round((ni * (layer.length - 1)) / Math.max(1, layers[li].show - 1));
    const v = Math.abs(layer[idx] ?? 0);
    const max = Math.max(...layer.map(Math.abs), 1e-6);
    return 0.12 + 0.88 * (v / max);
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Diagram of the 13-64-32-1 neural network">
      {/* Edges */}
      {layers.slice(0, -1).map((l, li) =>
        pos[li].map((y1, i) =>
          pos[li + 1].map((y2, j) => (
            <line
              key={`${li}-${i}-${j}`}
              x1={l.x}
              y1={y1}
              x2={layers[li + 1].x}
              y2={y2}
              stroke="#ffc53d"
              strokeOpacity={trace ? 0.04 + 0.12 * intensity(li, i) * intensity(li + 1, j) : 0.06}
              strokeWidth={1}
            />
          )),
        ),
      )}
      {/* Nodes */}
      {layers.map((l, li) =>
        pos[li].map((y, i) => {
          const a = intensity(li, i);
          return (
            <g key={`${li}-${i}`}>
              <circle cx={l.x} cy={y} r={li === 3 ? 16 : li === 0 ? 7 : 6.5} fill="#ffc53d" fillOpacity={a} stroke="#ffc53d" strokeOpacity={0.5} strokeWidth={1} />
              {li === 0 && (
                <text x={l.x - 14} y={y + 4} textAnchor="end" fontSize="11.5" fill="#c9c5bc">
                  {FEATURE_NAMES[i]}
                </text>
              )}
            </g>
          );
        }),
      )}
      {/* Ellipses for hidden layers */}
      {[1, 2].map((li) => (
        <text key={li} x={layers[li].x + 14} y={H / 2 + 4} fontSize="11" fill="#8e897f">
          ⋮ {layers[li].n - layers[li].show} more
        </text>
      ))}
      {layers.map((l) => (
        <text key={l.label} x={l.x} y={22} textAnchor="middle" fontSize="12" fontWeight={600} fill="#f4f1ea">
          {l.label}
        </text>
      ))}
      {output && (
        <text x={layers[3].x} y={H / 2 + 38} textAnchor="middle" fontSize="13" fontWeight={700} fill="#ffc53d">
          {output}
        </text>
      )}
    </svg>
  );
}
