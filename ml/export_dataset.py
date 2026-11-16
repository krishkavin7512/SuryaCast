"""Exports the full training/evaluation dataset as one CSV for the Colab notebook.

    python ml/export_dataset.py

Reads the cached ERA5 responses (ml/data/raw) and city list (ml/cities.json) and
writes public/data/suryacast-era5-dataset.csv, which the website serves publicly.
"""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
cities = json.loads((ROOT / "cities.json").read_text(encoding="utf-8"))
out = ROOT.parent / "public" / "data" / "suryacast-era5-dataset.csv"
cols = ["city_id", "city", "state", "lat", "lon", "elevation_m", "zone", "split", "date",
        "ghi_mj", "tmax", "tmin", "cloud_mean", "cloud_max", "cloud_min", "rh_mean", "precip_mm", "precip_hours"]
keys = ["shortwave_radiation_sum", "temperature_2m_max", "temperature_2m_min", "cloud_cover_mean", "cloud_cover_max",
        "cloud_cover_min", "relative_humidity_2m_mean", "precipitation_sum", "precipitation_hours"]
n = 0
with out.open("w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(cols)
    for c in cities:
        j = json.loads((ROOT / "data" / "raw" / f"{c['id']}.json").read_text(encoding="utf-8"))
        d = j["daily"]
        for i, date in enumerate(d["time"]):
            vals = [d[k][i] for k in keys]
            if any(v is None for v in vals):
                continue
            w.writerow([c["id"], c["name"], c["state"], c["lat"], c["lon"], j["elevation"], c["zone"], c["split"], date, *vals])
            n += 1
print(f"wrote {n} rows -> {out} ({out.stat().st_size / 1e6:.1f} MB)")
