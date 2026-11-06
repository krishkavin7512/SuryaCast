"""Print-quality figures for the project report (white background, Times New Roman).

    python scripts/report/figures.py <monthly.json> <out_dir>

Every figure is drawn from the result files the website itself uses:
src/data/model-report.json, src/data/performance.json, src/data/climate.json.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "src" / "data"
monthly = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
OUT = Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)

R = json.loads((DATA / "model-report.json").read_text(encoding="utf-8"))
P = json.loads((DATA / "performance.json").read_text(encoding="utf-8"))
C = json.loads((DATA / "climate.json").read_text(encoding="utf-8"))
K = 1 / 3.6

plt.rcParams.update({
    "font.family": "serif",
    "font.serif": ["Times New Roman", "Times", "DejaVu Serif"],
    "font.size": 10.5,
    "axes.titlesize": 11.5,
    "axes.labelsize": 10.5,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "axes.grid": True,
    "grid.color": "#e5e5e5",
    "grid.linewidth": 0.6,
    "legend.frameon": False,
    "savefig.dpi": 220,
    "savefig.bbox": "tight",
})
NN, HS, LIN, CLIM, TRUTH = "#d9541a", "#2a6fc4", "#178a62", "#6e5fd1", "#3b3b3b"


def save(fig, name):
    fig.savefig(OUT / f"{name}.png")
    plt.close(fig)
    print("wrote", name)


# Fig 1: block diagram ----------------------------------------------------------
fig, ax = plt.subplots(figsize=(10, 4.6))
ax.set_xlim(0, 100)
ax.set_ylim(0, 46)
ax.axis("off")


def box(x, y, w, h, title, lines, color):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.4,rounding_size=1.2", fc=color + "18", ec=color, lw=1.4))
    ax.text(x + w / 2, y + h - 2.2, title, ha="center", va="top", fontsize=10.5, fontweight="bold")
    for i, line in enumerate(lines):
        ax.text(x + w / 2, y + h - 6.0 - i * 2.6, line, ha="center", va="top", fontsize=8.6, color="#333")


def arrow(x1, y1, x2, y2, style="-|>", ls="-"):
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle=style, mutation_scale=12, lw=1.2, color="#555", linestyle=ls))


ax.text(1, 45, "OFFLINE TRAINING PIPELINE (Node.js / TypeScript + Python cross-check)", fontsize=9, fontweight="bold", color="#9a4a00")
box(1, 25, 22, 17, "1. Real data", ["ERA5 reanalysis (Open-Meteo)", "38 Indian cities, 2021-2025", "69,388 city-days", "9 weather variables + target"], HS)
box(26, 25, 22, 17, "2. Feature engineering", ["13 features: cloud, humidity,", "rain, temperature range,", "Ra (FAO-56), season,", "latitude, elevation"], NN)
box(51, 25, 22, 17, "3. Neural network", ["5 x MLP 13-64-32-1", "Back-propagation + Adam", "Early stopping (2024)", "Target: clearness index Kt"], NN)
box(76, 25, 23, 17, "4. Evaluation", ["Unseen year 2025", "8 unseen cities", "vs FAO-56 & regression", "Bootstrap CIs, CV"], LIN)
for x in (23.6, 48.6, 73.6):
    arrow(x, 33.5, x + 2.0, 33.5)
ax.text(1, 20.5, "LIVE WORKING MODEL (runs in the web browser)", fontsize=9, fontweight="bold", color="#9a4a00")
box(1, 1, 22, 17, "5. Live weather", ["Open-Meteo forecast API", "7-day forecast for any", "location in India", "(offline snapshot)"], HS)
box(26, 1, 22, 17, "6. Trained model", ["Same 13 features", "Ensemble predicts Kt", "GHI = Kt x Ra", "+ 80% interval"], NN)
box(51, 1, 22, 17, "7. PV physics", ["Erbs diffuse fraction", "Liu-Jordan tilt", "NOCT cell temperature", "E = P x POA x eta x f(T)"], CLIM)
box(76, 1, 23, 17, "8. Climate impact", ["kWh, CO2 avoided (0.727)", "Carbon credits (CDM)", "PM Surya Ghar, payback", "Life-cycle analysis"], LIN)
for x in (23.6, 48.6, 73.6):
    arrow(x, 9.5, x + 2.0, 9.5)
arrow(62, 24.6, 37, 18.6, ls="--")
ax.text(63.5, 21.6, "trained weights (JSON, 181 kB)", fontsize=8.5, color="#9a4a00", ha="left", style="italic")
save(fig, "fig01_block_diagram")

# Fig 2: climate evidence --------------------------------------------------------
fig, (a1, a2) = plt.subplots(1, 2, figsize=(10, 3.3))
co2 = C["co2Monthly"]
a1.plot([r[0] for r in co2], [r[1] for r in co2], color=HS, lw=0.8, label="Monthly mean")
a1.plot([r[0] for r in co2], [r[2] for r in co2], color=TRUTH, lw=1.6, label="Seasonally adjusted")
a1.set_title("(a) Atmospheric CO$_2$, Mauna Loa (NOAA)")
a1.set_ylabel("CO$_2$ (ppm)")
a1.legend(fontsize=8.5)
g = C["gistemp"]
a2.bar([r[0] for r in g], [r[1] for r in g], color=["#c0392b" if r[1] >= 0 else "#2a6fc4" for r in g], width=0.9)
a2.set_title("(b) Global temperature anomaly vs 1951-80 (NASA GISTEMP)")
a2.set_ylabel("Anomaly (°C)")
save(fig, "fig02_climate_evidence")

# Fig 3: learning curve ------------------------------------------------------------
h = R["network"]["history"]
fig, ax = plt.subplots(figsize=(6.4, 3.0))
ax.plot([x["epoch"] for x in h], [x["trainRmse"] for x in h], color=NN, label="Training RMSE")
ax.plot([x["epoch"] for x in h], [x["valRmse"] for x in h], color=HS, label="Validation RMSE (2024)")
ax.axvline(R["network"]["bestEpoch"], color="#888", ls="--", lw=1)
ax.text(R["network"]["bestEpoch"] + 1, ax.get_ylim()[1] * 0.97, f"best epoch {R['network']['bestEpoch']}", fontsize=8.5, va="top", color="#555")
ax.set_xlabel("Epoch")
ax.set_ylabel("RMSE of clearness index K$_t$")
ax.legend()
save(fig, "fig03_learning_curve")

# Fig 4: predicted vs actual -------------------------------------------------------
sc = R["scatter"]
fig, axes = plt.subplots(1, 2, figsize=(9, 4.0), sharey=True)
for ax, key, col, name in ((axes[0], "mlp", NN, "SuryaCast neural network"), (axes[1], "hargreaves", HS, "Hargreaves-Samani (FAO-56)")):
    ax.scatter([s["actual"] * K for s in sc], [s[key] * K for s in sc], s=7, alpha=0.4, color=col, edgecolors="none")
    ax.plot([0, 8.5], [0, 8.5], color="#333", ls="--", lw=1)
    ax.set_xlim(0, 8.5)
    ax.set_ylim(0, 8.5)
    ax.set_aspect("equal")
    r2 = P["models"][[m["key"] for m in P["models"]].index(key)]["metrics"]["testSpace"]["r2"]
    ax.set_title(f"{name}\nR$^2$ = {r2:.3f} (unseen cities)")
    ax.set_xlabel("Actual GHI (kWh/m$^2$/day)")
axes[0].set_ylabel("Predicted GHI (kWh/m$^2$/day)")
save(fig, "fig04_pred_vs_actual")

# Fig 5: error by sky condition ----------------------------------------------------
sky = P["bySky"]
fig, ax = plt.subplots(figsize=(6.6, 3.2))
xs = range(len(sky))
w = 0.26
for i, (key, col, lab) in enumerate((("mlp", NN, "SuryaCast NN"), ("linear", LIN, "Ridge regression"), ("hargreaves", HS, "Hargreaves (FAO-56)"))):
    bars = ax.bar([x + (i - 1) * w for x in xs], [b[key] for b in sky], width=w, color=col, label=lab)
    if key == "mlp":
        ax.bar_label(bars, fmt="%.2f", fontsize=8, padding=2)
ax.set_xticks(list(xs), [f"{b['label']}\n{b['range'].replace(' cloud', '')} cloud\n{b['share']:.0f}% of days" for b in sky], fontsize=8.5)
ax.set_ylabel("MAE (kWh/m$^2$/day)")
ax.legend(fontsize=8.5)
save(fig, "fig05_error_by_sky")

# Fig 6: monsoon time series -------------------------------------------------------
pts = R["series"]["points"]
fig, ax = plt.subplots(figsize=(9, 3.0))
ax.plot(range(len(pts)), [p["actual"] * K for p in pts], color=TRUTH, lw=1.2, label="Actual (ERA5)")
ax.plot(range(len(pts)), [p["hargreaves"] * K for p in pts], color=HS, lw=1.0, ls="--", label="Hargreaves (FAO-56)")
ax.plot(range(len(pts)), [p["mlp"] * K for p in pts], color=NN, lw=1.4, label="SuryaCast NN")
ticks = [i for i, p in enumerate(pts) if p["date"].endswith("-01")]
ax.set_xticks(ticks, [["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][int(pts[i]["date"][5:7])] for i in ticks])
ax.set_ylabel("GHI (kWh/m$^2$/day)")
ax.set_title(f"{R['series']['city']} (never used in training), April-October 2025")
ax.legend(ncol=3, fontsize=8.5, loc="lower left")
save(fig, "fig06_monsoon_series")

# Fig 7: permutation importance ----------------------------------------------------
imp = list(reversed(R["importance"]))
fig, ax = plt.subplots(figsize=(6.4, 3.6))
ax.barh([i["feature"] for i in imp], [max(0, i["rmseIncrease"] * K) for i in imp], color=NN)
ax.set_xlabel("Increase in RMSE when the input is shuffled (kWh/m$^2$/day)")
ax.grid(axis="y", visible=False)
save(fig, "fig07_feature_importance")

# Fig 8: accuracy vs horizon -------------------------------------------------------
hz = P["horizons"]
labels = ["Daily", "Weekly", "Monthly", "Yearly"]
fig, ax = plt.subplots(figsize=(6.4, 3.0))
for key, col, lab in (("hargreaves", HS, "Hargreaves (FAO-56)"), ("linear", LIN, "Ridge regression"), ("mlp", NN, "SuryaCast NN")):
    vals = [hz[key][k.lower()] for k in labels]
    ax.plot(labels, vals, marker="o", color=col, label=lab, lw=2 if key == "mlp" else 1.4)
    if key == "mlp":
        for x, v in zip(labels, vals):
            ax.annotate(f"{v:.1f}%", (x, v), textcoords="offset points", xytext=(0, -14), ha="center", fontsize=8.5, color=NN)
ax.set_ylabel("Energy forecast error (%)")
ax.set_ylim(0, None)
ax.legend(fontsize=8.5)
save(fig, "fig08_horizon")

# Fig 9: monthly generation --------------------------------------------------------
m = monthly["monthly"]
fig, ax = plt.subplots(figsize=(6.6, 3.0))
months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
mean = [x["mean"] for x in m]
ax.bar(months, mean, color="#f0a020", yerr=[[x["mean"] - x["min"] for x in m], [x["max"] - x["mean"] for x in m]], capsize=3, ecolor="#555")
ax.set_ylabel("Generation (kWh/month)")
ax.set_title(f"3 kWp rooftop, Chennai: {monthly['annualKwh']:.0f} kWh/yr (2021-2025 ERA5)")
save(fig, "fig09_monthly_generation")
