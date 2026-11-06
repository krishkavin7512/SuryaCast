"""Independent cross-check of the SuryaCast results with scikit-learn.

The TypeScript pipeline (scripts/train.ts) writes the exact feature table it
trained on to ml/data/features.csv. This script trains standard scikit-learn
models on the same table and the same splits, so the from-scratch neural
network can be compared against well-tested library implementations.

    python ml/crosscheck.py
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parent
df = pd.read_csv(ROOT / "data" / "features.csv")
FEATURES = ["cloud_mean", "cloud_max", "cloud_min", "rh", "log_rain", "rain_hours",
            "dtr", "tmax", "ra", "season_sin", "season_cos", "lat", "elev_km"]
drop = [a for a in sys.argv[1:]]
feats = [f for f in FEATURES if f not in drop]

train = df[df.split == "train"]
scaler = StandardScaler().fit(train[feats])
X = {s: scaler.transform(df[df.split == s][feats]) for s in ("train", "val", "testTime", "testSpace")}
y = {s: df[df.split == s] for s in X}

models = {
    "Ridge regression": Ridge(alpha=1e-3),
    "Random forest (300 trees)": RandomForestRegressor(n_estimators=300, min_samples_leaf=3, n_jobs=-1, random_state=0),
    "Histogram gradient boosting": HistGradientBoostingRegressor(max_iter=600, learning_rate=0.05, random_state=0),
    "scikit-learn MLP (64-32, relu)": MLPRegressor(hidden_layer_sizes=(64, 32), learning_rate_init=0.002, max_iter=300,
                                                    early_stopping=True, random_state=0),
}

out = {"features": feats, "models": {}}
for name, m in models.items():
    t0 = time.time()
    m.fit(X["train"], y["train"].kt)
    res = {"seconds": round(time.time() - t0, 1)}
    for s in ("val", "testTime", "testSpace"):
        kt = np.clip(m.predict(X[s]), 0.02, 0.85)
        pred = kt * y[s].ra.values
        actual = y[s].rs.values
        res[s] = {
            "mae": round(float(mean_absolute_error(actual, pred)), 3),
            "rmse": round(float(np.sqrt(mean_squared_error(actual, pred))), 3),
            "r2": round(float(r2_score(actual, pred)), 4),
        }
    out["models"][name] = res
    print(f"{name:34s} time R2={res['testTime']['r2']:.4f} MAE={res['testTime']['mae']:.3f} | "
          f"space R2={res['testSpace']['r2']:.4f} MAE={res['testSpace']['mae']:.3f}  ({res['seconds']} s)", flush=True)

if not drop:
    (ROOT / "reports").mkdir(exist_ok=True)
    (ROOT / "reports" / "sklearn_crosscheck.json").write_text(json.dumps(out, indent=2))
    # Also shipped to the website's Model Lab page.
    (ROOT.parent / "src" / "data" / "sklearn-crosscheck.json").write_text(json.dumps(out))
