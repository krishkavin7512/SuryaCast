/** Labelled block diagram of the SuryaCast working model (for the report). */
export default function SystemDiagram() {
  const box = (x: number, y: number, w: number, h: number, title: string, lines: string[], fill: string, stroke: string, n: string) => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={14} fill={fill} stroke={stroke} strokeWidth={1.5} />
      <circle cx={x + 18} cy={y + 20} r={11} fill={stroke} />
      <text x={x + 18} y={y + 24} textAnchor="middle" fontSize="12" fontWeight={700} fill="#fff">
        {n}
      </text>
      <text x={x + 36} y={y + 25} fontSize="14" fontWeight={700} fill="#f4f1ea">
        {title}
      </text>
      {lines.map((l, i) => (
        <text key={l} x={x + 14} y={y + 50 + i * 17} fontSize="11.5" fill="#c9c5bc">
          {l}
        </text>
      ))}
    </g>
  );
  const arrow = (x1: number, y1: number, x2: number, y2: number) => (
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#8e897f" strokeWidth={2} markerEnd="url(#arr)" />
  );
  return (
    <svg viewBox="0 0 980 470" className="h-auto w-full" role="img" aria-label="SuryaCast system block diagram">
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="#8e897f" />
        </marker>
      </defs>
      <text x="490" y="26" textAnchor="middle" fontSize="16" fontWeight={700} fill="#f4f1ea">
        Fig. 1 · SuryaCast working model: block diagram
      </text>
      {/* Row 1: offline training */}
      <text x="20" y="62" fontSize="11" fontWeight={700} fill="#ffc53d" letterSpacing="1.5">
        OFFLINE: TRAINING PIPELINE (Node.js + Python)
      </text>
      {box(20, 72, 220, 120, 'Real data', ['ERA5 reanalysis, 38 cities', '2021–2025 · 69,388 days', '9 weather variables +', 'solar radiation (target)'], 'rgba(57,135,229,0.10)', '#3987e5', '1')}
      {arrow(240, 132, 268, 132)}
      {box(270, 72, 210, 120, 'Feature engineering', ['13 features: cloud, RH,', 'rain, temperature range,', 'Ra (FAO-56), season,', 'latitude, elevation'], 'rgba(224,98,31,0.10)', '#e0621f', '2')}
      {arrow(480, 132, 508, 132)}
      {box(510, 72, 220, 120, 'Neural-network training', ['5 × MLP 13-64-32-1', 'Back-propagation + Adam', 'Early stopping (2024)', 'Target: clearness Kt'], 'rgba(224,98,31,0.10)', '#e0621f', '3')}
      {arrow(730, 132, 758, 132)}
      {box(760, 72, 200, 120, 'Evaluation', ['Unseen year 2025', '8 unseen cities', 'vs FAO-56 & regression', 'sklearn cross-check'], 'rgba(25,158,112,0.10)', '#199e70', '4')}
      {/* Row 2: live inference */}
      <text x="20" y="246" fontSize="11" fontWeight={700} fill="#ffc53d" letterSpacing="1.5">
        LIVE: IN THE BROWSER (the working demonstration)
      </text>
      {box(20, 256, 190, 130, 'Live forecast', ['Open-Meteo API', '7-day weather for', 'any Indian location', '(offline snapshot)'], 'rgba(57,135,229,0.10)', '#3987e5', '5')}
      {arrow(210, 321, 236, 321)}
      {box(238, 256, 175, 130, 'Trained model', ['Same features', '→ ensemble Kt', '→ GHI = Kt × Ra', '+ 80% interval'], 'rgba(224,98,31,0.10)', '#e0621f', '6')}
      {arrow(413, 321, 439, 321)}
      {box(441, 256, 200, 130, 'PV physics', ['Erbs diffuse split', 'Liu–Jordan tilt', 'NOCT cell temperature', 'P = kWp·POA·η·f(T)'], 'rgba(144,133,233,0.10)', '#9085e9', '7')}
      {arrow(641, 321, 667, 321)}
      {box(669, 256, 291, 130, 'Climate & economic impact', ['kWh/day, CO₂ avoided (0.727 kg/kWh)', 'Carbon credits (CDM / Art. 6.4)', 'PM Surya Ghar subsidy, payback', 'Life-cycle analysis, scale-up'], 'rgba(25,158,112,0.10)', '#199e70', '8')}
      {/* model ships */}
      <path d="M620,192 C620,225 330,220 325,254" fill="none" stroke="#ffc53d" strokeWidth={2} strokeDasharray="6 5" markerEnd="url(#arr)" />
      <text x="470" y="226" textAnchor="middle" fontSize="11" fill="#ffc53d">
        trained weights (JSON, ~180 kB)
      </text>
      <text x="490" y="430" textAnchor="middle" fontSize="12" fill="#c9c5bc">
        User inputs: location (city, GPS, or click on a satellite map), panel capacity, tilt, tariff
      </text>
      <text x="490" y="452" textAnchor="middle" fontSize="11" fill="#8e897f">
        Outputs are verified against the weather model's own radiation forecast (live cross-check)
      </text>
    </svg>
  );
}
