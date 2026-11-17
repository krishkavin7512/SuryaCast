"""Builds notebooks/SuryaCast_Model_Training.ipynb (the Colab notebook).

    python scripts/notebook/build_notebook.py

The notebook is a faithful Python/NumPy reproduction of the TypeScript training
pipeline (scripts/train.ts): same data, features, splits, baselines, network,
optimiser and early stopping. It also downloads the deployed model and
re-evaluates it independently.
"""
from pathlib import Path

import nbformat as nbf

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "notebooks" / "SuryaCast_Model_Training.ipynb"
SITE = "https://suryacast.vercel.app"
REPO = "https://github.com/krishkavin7512/SuryaCast"

cells = []
md = lambda s: cells.append(nbf.v4.new_markdown_cell(s.strip()))
code = lambda s: cells.append(nbf.v4.new_code_cell(s.strip()))

md(f"""
# ☀️ SuryaCast: model training notebook

**Forecast the sun. Cut the carbon.** This notebook trains the SuryaCast solar-radiation neural network **from scratch in NumPy** on real ERA5 weather data for 38 Indian cities. It then evaluates the network against established methods on data it never saw.

| | |
|---|---|
| Course | 21CEO310T: Global Warming and Climate Change (LLT / CLA-2 working model) |
| Team | Kavin Krish Vijay (RA2411003011558) · Tanay Krishnan (RA2411003011550) · Niyati Agrawal (RA2411003011569) · Shaurya Ojha (RA2411003011565) |
| Live working model | {SITE} |
| Source code | {REPO} |

The website's model was trained by the TypeScript pipeline in the repository (`scripts/train.ts`). This notebook is a **faithful Python reproduction** of that pipeline: same data, 13 features, splits, baselines, 13-64-32-1 network, Adam optimiser and early stopping. It also downloads **the model deployed on the website** and re-scores it independently.

Run it top to bottom: **Runtime → Run all** (about 5 minutes on a standard CPU runtime).
""")

md("""
## 1. Setup and data

The dataset is ERA5 reanalysis (ECMWF / Copernicus) daily aggregates for 2021–2025, retrieved via the Open-Meteo Historical Weather API. It is served as one CSV by the project website.
""")
code(f"""
import json, time, urllib.request
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

SITE = "{SITE}"
df = pd.read_csv(f"{{SITE}}/data/suryacast-era5-dataset.csv", parse_dates=["date"])
print(f"{{len(df):,}} city-days, {{df.city_id.nunique()}} cities, {{df.date.min().date()}} to {{df.date.max().date()}}")
df.head()
""")
code("""
# Columns
#   ghi_mj        solar energy reaching the ground (MJ/m2/day)  <- what we predict
#   tmax, tmin    daily max / min air temperature (degC)
#   cloud_*       mean / max / min cloud cover (%)
#   rh_mean       mean relative humidity (%)
#   precip_mm     rainfall (mm), precip_hours: hours of rain
#   split         'train' = one of 30 training cities, 'holdout' = one of 8 cities never used in training
df.describe().round(2).T
""")

md("""
## 2. Physics: extraterrestrial radiation (FAO-56)

Sunlight at the top of the atmosphere, $R_a$, follows from astronomy alone (FAO Irrigation & Drainage Paper 56, eq. 21):

$$R_a = \\frac{24 \\cdot 60}{\\pi} G_{sc}\\, d_r \\left[\\omega_s \\sin\\varphi \\sin\\delta + \\cos\\varphi \\cos\\delta \\sin\\omega_s\\right]$$

The network predicts the **clearness index** $K_t = R_s / R_a$, the fraction of that sunlight that survives clouds, water vapour and haze. Radiation is recovered as $R_s = K_t \\cdot R_a$.
""")
code("""
GSC, KT_MAX = 0.082, 0.85

def extraterrestrial(lat_deg, doy):
    phi = np.radians(lat_deg)
    dr = 1 + 0.033 * np.cos(2 * np.pi * doy / 365)
    dec = 0.409 * np.sin(2 * np.pi * doy / 365 - 1.39)
    ws = np.arccos(np.clip(-np.tan(phi) * np.tan(dec), -1, 1))
    ra = (24 * 60 / np.pi) * GSC * dr * (ws * np.sin(phi) * np.sin(dec) + np.cos(phi) * np.cos(dec) * np.sin(ws))
    return np.maximum(0, ra)

# FAO-56 Example 8 check: 20 degS on 3 September (day 246) -> 32.2 MJ/m2/day
print("Ra check:", round(float(extraterrestrial(-20, 246)), 1), "(expected 32.2)")

df["doy"] = df.date.dt.dayofyear
df["year"] = df.date.dt.year
df["month"] = df.date.dt.month
df["ra"] = extraterrestrial(df.lat.values, df.doy.values)
df["kt"] = np.minimum(KT_MAX, df.ghi_mj / df.ra)
""")

md("""
## 3. Feature engineering (13 inputs)

| Feature | Computation | Physical reason |
|---|---|---|
| Cloud mean / max / min | % / 100 | clouds block and scatter sunlight |
| Relative humidity | % / 100 | water vapour absorbs sunlight |
| Rainfall | ln(1 + mm) | rain implies thick cloud; log limits outliers |
| Rain hours | h / 24 | long rain means long overcast spells |
| Diurnal temperature range | Tmax − Tmin | clear skies give hot days and cold nights |
| Max temperature | Tmax | hot dry days tend to be sunny |
| Ra | FAO-56 | astronomy (latitude and date) |
| Season | sin, cos(2π·doy/365.25) | cyclic seasonality |
| Latitude, elevation | degrees, km | location; thinner air at altitude |
""")
code("""
FEATURES = ["cloud_mean", "cloud_max", "cloud_min", "rh", "log_rain", "rain_hours", "dtr", "tmax", "ra",
            "season_sin", "season_cos", "lat", "elev_km"]

def build_features(d):
    ang = 2 * np.pi * d.doy.values / 365.25
    return np.column_stack([
        d.cloud_mean / 100, d.cloud_max / 100, d.cloud_min / 100, d.rh_mean / 100,
        np.log1p(np.maximum(0, d.precip_mm)), d.precip_hours / 24, d.tmax - d.tmin, d.tmax, d.ra,
        np.sin(ang), np.cos(ang), d.lat, d.elevation_m / 1000,
    ]).astype(np.float64)

X_all = build_features(df)
is_train_city = (df.split == "train").values
masks = {
    "train":     is_train_city & (df.year <= 2023).values,   # 30 cities, 2021-2023
    "val":       is_train_city & (df.year == 2024).values,   # early stopping / model choice
    "testTime":  is_train_city & (df.year == 2025).values,   # a year never seen
    "testSpace": ~is_train_city,                              # 8 cities never seen
}
for k, m in masks.items():
    print(f"{k:10s} {m.sum():6,d} days")
print("Unseen cities:", ", ".join(sorted(df.loc[~is_train_city, "city"].unique())))

mu = X_all[masks["train"]].mean(axis=0)
sd = X_all[masks["train"]].std(axis=0)
sd[sd == 0] = 1
Z = (X_all - mu) / sd
y_kt, ra, rs = df.kt.values, df.ra.values, df.ghi_mj.values
""")

md("""
## 4. Baselines

1. **Monthly climatology**: the average clearness of each month.
2. **Hargreaves–Samani (FAO-56 eq. 50)**: $R_s = k_{Rs}\\sqrt{T_{max}-T_{min}}\\,R_a$, the standard method when no sunlight sensor exists.
3. **Ridge linear regression** on the same 13 features.
""")
code("""
clamp = lambda k: np.clip(k, 0.02, KT_MAX)
tr = masks["train"]

month_kt = df[tr].groupby("month").kt.mean()
pred = {"climatology": month_kt.reindex(df.month).values * ra}

coastal = df.zone.str.contains("coastal|island", case=False).values
k_rs = np.where(coastal, 0.19, 0.16)
rso = (0.75 + 2e-5 * df.elevation_m.values) * ra
pred["hargreaves"] = np.minimum(k_rs * np.sqrt(np.maximum(0, df.tmax - df.tmin).values) * ra, rso)

A = np.column_stack([Z[tr], np.ones(tr.sum())])
lam = 1e-4 * tr.sum()
reg = np.eye(A.shape[1]) * lam
reg[-1, -1] = 0                      # the bias is not regularised
w_ridge = np.linalg.solve(A.T @ A + reg, A.T @ y_kt[tr])
pred["linear"] = clamp(np.column_stack([Z, np.ones(len(Z))]) @ w_ridge) * ra
print("baselines ready")
""")

md("""
## 5. The neural network, written from scratch

A multilayer perceptron **13 → 64 → 32 → 1** with leaky-ReLU hidden layers and a linear output. It is trained on the mean-squared error with back-propagation and the **Adam** optimiser: learning rate 0.002 with cosine decay, mini-batches of 64 and L2 weight decay 1e-5. Training stops early when the 2024 validation error stops improving (patience 20). Five networks with different random initialisations are averaged into an ensemble. No machine-learning library is used.
""")
code("""
class MLP:
    def __init__(self, sizes, seed):
        rng = np.random.default_rng(seed)
        self.W = [rng.normal(0, np.sqrt(2 / sizes[i]), (sizes[i + 1], sizes[i])) for i in range(len(sizes) - 1)]
        self.b = [np.zeros(sizes[i + 1]) for i in range(len(sizes) - 1)]
        self.m = [np.zeros_like(p) for p in self.W + self.b]
        self.v = [np.zeros_like(p) for p in self.W + self.b]
        self.t = 0

    @staticmethod
    def act(z):  return np.where(z > 0, z, 0.01 * z)        # leaky ReLU
    @staticmethod
    def dact(z): return np.where(z > 0, 1.0, 0.01)

    def forward(self, X):
        a, zs, acts = X, [], [X]
        for l, (W, b) in enumerate(zip(self.W, self.b)):
            z = a @ W.T + b
            zs.append(z)
            a = z if l == len(self.W) - 1 else self.act(z)
            acts.append(a)
        return a[:, 0], zs, acts

    def predict(self, X):
        return self.forward(X)[0]

    def step(self, X, y, lr, l2=1e-5, b1=0.9, b2=0.999, eps=1e-8):
        out, zs, acts = self.forward(X)
        m = len(y)
        delta = ((out - y) / m)[:, None]                        # dL/dz of the linear output, L = mean(0.5*(out-y)^2)
        gW, gb = [None] * len(self.W), [None] * len(self.b)
        for l in reversed(range(len(self.W))):
            gW[l] = delta.T @ acts[l] + l2 * self.W[l]
            gb[l] = delta.sum(axis=0)
            if l > 0:
                delta = (delta @ self.W[l]) * self.dact(zs[l - 1])
        self.t += 1
        params, grads = self.W + self.b, gW + gb
        for i, (p, g) in enumerate(zip(params, grads)):        # Adam with bias correction
            self.m[i] = b1 * self.m[i] + (1 - b1) * g
            self.v[i] = b2 * self.v[i] + (1 - b2) * g * g
            p -= lr * (self.m[i] / (1 - b1 ** self.t)) / (np.sqrt(self.v[i] / (1 - b2 ** self.t)) + eps)
        return float(np.mean((out - y) ** 2))

    def copy_weights(self):
        return [w.copy() for w in self.W], [b.copy() for b in self.b]

# Gradient check against finite differences (verifies the back-propagation maths)
net = MLP([3, 5, 4, 1], seed=11)
x0, y0 = np.array([[0.3, -0.7, 1.1]]), np.array([0.4])
out, zs, acts = net.forward(x0)
delta = (out - y0)[:, None]
grads = []
for l in reversed(range(len(net.W))):
    grads.insert(0, delta.T @ acts[l])
    if l > 0:
        delta = (delta @ net.W[l]) * net.dact(zs[l - 1])
num = np.zeros_like(net.W[0]); h = 1e-6
for i in range(net.W[0].shape[0]):
    for j in range(net.W[0].shape[1]):
        net.W[0][i, j] += h; up = 0.5 * (net.predict(x0)[0] - y0[0]) ** 2
        net.W[0][i, j] -= 2 * h; dn = 0.5 * (net.predict(x0)[0] - y0[0]) ** 2
        net.W[0][i, j] += h
        num[i, j] = (up - dn) / (2 * h)
print("max gradient error:", float(np.abs(num - grads[0]).max()))
""")
code("""
def train_network(seed, max_epochs=150, patience=20, batch=64, lr0=0.002):
    net = MLP([13, 64, 32, 1], seed)
    rng = np.random.default_rng(seed + 1)
    Xtr, ytr = Z[masks["train"]], y_kt[masks["train"]]
    Xva, yva = Z[masks["val"]], y_kt[masks["val"]]
    best, best_epoch, best_w, history = np.inf, 0, net.copy_weights(), []
    for e in range(1, max_epochs + 1):
        lr = lr0 * max(0.05, 0.5 * (1 + np.cos(np.pi * (e - 1) / max_epochs)))
        order = rng.permutation(len(ytr))
        losses = [net.step(Xtr[order[s:s + batch]], ytr[order[s:s + batch]], lr) for s in range(0, len(ytr), batch)]
        val_rmse = float(np.sqrt(np.mean((clamp(net.predict(Xva)) - yva) ** 2)))
        history.append((e, float(np.sqrt(np.mean(losses))), val_rmse))
        if val_rmse < best - 1e-6:
            best, best_epoch, best_w = val_rmse, e, net.copy_weights()
        elif e - best_epoch >= patience:
            break
    net.W, net.b = best_w
    return net, history, best_epoch, best

t0 = time.time()
ensemble, histories = [], []
for k, seed in enumerate([7, 17, 27, 37, 47]):
    net, hist, ep, best = train_network(seed)
    ensemble.append(net); histories.append(hist)
    print(f"network {k + 1}: best epoch {ep:3d}, validation RMSE(Kt) = {best:.4f}")
print(f"trained 5 networks in {time.time() - t0:.0f} s")

pred["mlp"] = clamp(np.mean([n.predict(Z) for n in ensemble], axis=0)) * ra
""")
code("""
fig, ax = plt.subplots(figsize=(8, 3.6))
for k, h in enumerate(histories):
    h = np.array(h)
    ax.plot(h[:, 0], h[:, 2], lw=1.4, label=f"network {k + 1} (validation)")
ax.plot(np.array(histories[0])[:, 0], np.array(histories[0])[:, 1], color="k", lw=1, ls="--", label="network 1 (training)")
ax.set_xlabel("epoch"); ax.set_ylabel("RMSE of clearness index"); ax.set_title("Learning curves: the error falls, then early stopping keeps the best epoch")
ax.legend(fontsize=8); ax.grid(alpha=0.3); plt.show()
""")

md("""
## 6. Results on data the models never saw

Errors are in kWh/m² per day (MJ ÷ 3.6); mean daily sunlight is about 5 kWh/m².
""")
code("""
def metrics(actual, predicted):
    e = predicted - actual
    return {"MAE": np.mean(np.abs(e)) / 3.6, "RMSE": np.sqrt(np.mean(e ** 2)) / 3.6, "Bias": np.mean(e) / 3.6,
            "R2": 1 - np.sum(e ** 2) / np.sum((actual - actual.mean()) ** 2)}

names = {"climatology": "Monthly climatology", "hargreaves": "Hargreaves-Samani (FAO-56)", "linear": "Ridge linear regression",
         "mlp": "SuryaCast neural network (this notebook)"}
rows = []
for key, name in names.items():
    for split, label in (("testTime", "unseen year 2025"), ("testSpace", "8 unseen cities")):
        m = masks[split]
        rows.append({"model": name, "test set": label, **metrics(rs[m], pred[key][m])})
results = pd.DataFrame(rows)
results.pivot(index="model", columns="test set", values=["R2", "MAE"]).round(3).loc[list(names.values())]
""")
code("""
fig, axes = plt.subplots(1, 2, figsize=(10, 4.3), sharey=True)
m = masks["testSpace"]
sample = np.random.default_rng(5).choice(np.where(m)[0], 1500, replace=False)
for ax, key, col in ((axes[0], "mlp", "#d9541a"), (axes[1], "hargreaves", "#2a6fc4")):
    ax.scatter(rs[sample] / 3.6, pred[key][sample] / 3.6, s=6, alpha=0.35, color=col)
    ax.plot([0, 8.5], [0, 8.5], "k--", lw=1)
    r2 = metrics(rs[m], pred[key][m])["R2"]
    ax.set_title(f"{names[key]}\\nR² = {r2:.3f} on 8 unseen cities", fontsize=10)
    ax.set_xlabel("actual GHI (kWh/m²/day)"); ax.set_xlim(0, 8.5); ax.set_ylim(0, 8.5); ax.grid(alpha=0.3)
axes[0].set_ylabel("predicted GHI (kWh/m²/day)")
plt.tight_layout(); plt.show()
""")
code("""
# Where is solar hardest to predict? Error by sky condition (all unseen data)
unseen = masks["testTime"] | masks["testSpace"]
bins = [(0, 20, "Clear"), (20, 50, "Partly cloudy"), (50, 80, "Mostly cloudy"), (80, 101, "Overcast")]
sky = []
for lo, hi, label in bins:
    mm = unseen & (df.cloud_mean.values >= lo) & (df.cloud_mean.values < hi)
    sky.append({"sky": label, "share of days %": 100 * mm.sum() / unseen.sum(),
                **{names[k].split(" (")[0]: metrics(rs[mm], pred[k][mm])["MAE"] for k in ("mlp", "linear", "hargreaves")}})
sky = pd.DataFrame(sky).set_index("sky")
sky.drop(columns="share of days %").plot.bar(figsize=(8, 3.6), color=["#d9541a", "#178a62", "#2a6fc4"], rot=0)
plt.ylabel("MAE (kWh/m²/day)"); plt.title("Mean absolute error by cloud cover"); plt.grid(axis="y", alpha=0.3); plt.show()
sky.round(3)
""")
code("""
# Is the improvement statistically significant? 1,000 bootstrap resamples of the unseen-city days
rng = np.random.default_rng(11)
m = np.where(masks["testSpace"])[0]
def boot_r2(key):
    vals = []
    for _ in range(1000):
        i = rng.choice(m, len(m))
        e = pred[key][i] - rs[i]
        vals.append(1 - np.sum(e ** 2) / np.sum((rs[i] - rs[i].mean()) ** 2))
    return np.percentile(vals, [2.5, 97.5])
for key in ("mlp", "hargreaves"):
    lo, hi = boot_r2(key)
    print(f"{names[key]:42s} R² 95% CI: {lo:.3f} - {hi:.3f}")
""")

md(f"""
## 7. Independent check of the model deployed on the website

The live website runs an ensemble trained by the TypeScript pipeline. Here we download those exact weights from `{SITE}/model/suryacast-mlp.json`, run them with NumPy, and score them on the same held-out data.
""")
code("""
with urllib.request.urlopen(f"{SITE}/model/suryacast-mlp.json") as r:
    shipped = json.load(r)
mu_s, sd_s = np.array(shipped["scaler"]["mean"]), np.array(shipped["scaler"]["std"])
Zs = (X_all - mu_s) / sd_s
outs = []
for net in shipped["ensemble"]:
    a = Zs
    for l, (w, b) in enumerate(zip(net["weights"], net["biases"])):
        W = np.array(w).reshape(len(b), -1)
        a = a @ W.T + np.array(b)
        if l < len(net["weights"]) - 1:
            a = np.where(a > 0, a, 0.01 * a)
    outs.append(a[:, 0])
pred["deployed"] = clamp(np.mean(outs, axis=0)) * ra
names["deployed"] = "Deployed website model (TypeScript-trained)"
print(f"{len(shipped['ensemble'])} networks, architecture {shipped['ensemble'][0]['sizes']}, trained {shipped['trainedAt'][:10]}")
for split, label in (("testTime", "unseen year 2025"), ("testSpace", "8 unseen cities")):
    r = metrics(rs[masks[split]], pred["deployed"][masks[split]])
    print(f"{label:17s} R² = {r['R2']:.3f}   MAE = {r['MAE']:.3f} kWh/m²/day")
""")

md("""
## 8. Cross-check with scikit-learn

The same features and splits, trained with standard library models, show that the hand-written network performs on par with professional implementations.
""")
code("""
from sklearn.neural_network import MLPRegressor
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
sk_models = {
    "scikit-learn MLP (64-32)": MLPRegressor(hidden_layer_sizes=(64, 32), learning_rate_init=0.002, max_iter=300, early_stopping=True, random_state=0),
    "Histogram gradient boosting": HistGradientBoostingRegressor(max_iter=600, learning_rate=0.05, random_state=0),
    "Random forest (200 trees)": RandomForestRegressor(n_estimators=200, min_samples_leaf=3, n_jobs=-1, random_state=0),
}
for name, model in sk_models.items():
    t0 = time.time()
    model.fit(Z[masks["train"]], y_kt[masks["train"]])
    key = name
    pred[key] = clamp(model.predict(Z)) * ra
    names[key] = name
    print(f"{name:30s} trained in {time.time() - t0:5.1f} s")
""")

md("## 9. Summary")
code("""
final = []
for key in ["climatology", "hargreaves", "linear", "mlp", "deployed", *sk_models.keys()]:
    a = metrics(rs[masks["testTime"]], pred[key][masks["testTime"]])
    b = metrics(rs[masks["testSpace"]], pred[key][masks["testSpace"]])
    final.append({"model": names[key], "R² 2025": round(a["R2"], 3), "MAE 2025": round(a["MAE"], 3),
                  "R² unseen cities": round(b["R2"], 3), "MAE unseen cities": round(b["MAE"], 3)})
summary = pd.DataFrame(final).set_index("model")
print("SUMMARY_JSON", json.dumps(summary.reset_index().to_dict(orient="records")))
summary
""")
md(f"""
**Conclusion.** Trained only on routine weather (cloud, humidity, rain, temperature), the from-scratch neural network explains most of the day-to-day variation in sunlight, both in a future year and in cities it never saw. It clearly outperforms the FAO-56 Hargreaves–Samani method engineers use when no sunlight sensor exists. The deployed website model reproduces its reported accuracy when scored independently here.

Try the live working model: **{SITE}**
""")

nb = nbf.v4.new_notebook()
nb["cells"] = cells
nb["metadata"] = {
    "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
    "language_info": {"name": "python"},
    "colab": {"name": "SuryaCast_Model_Training.ipynb", "provenance": []},
}
OUT.parent.mkdir(parents=True, exist_ok=True)
nbf.write(nb, OUT)
print("wrote", OUT, len(cells), "cells")
