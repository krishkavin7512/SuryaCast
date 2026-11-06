"""Download the real data used to train and evaluate SuryaCast.

1. Daily ERA5 reanalysis weather + solar radiation for 38 Indian cities
   (2021-2025) from the Open-Meteo Historical Weather API.
2. Global/India climate evidence files (NOAA Mauna Loa CO2, NASA GISTEMP,
   Berkeley Earth India) into ml/data/global.

Raw API responses are cached under ml/data so the pipeline is reproducible
and the APIs are only hit once. Run:  python ml/fetch_data.py
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "data" / "raw"
GLOBAL = ROOT / "data" / "global"
CITIES = json.loads((ROOT / "cities.json").read_text())

START, END = "2021-01-01", "2025-12-31"
DAILY_VARS = [
    "shortwave_radiation_sum",  # target (MJ/m2/day)
    "temperature_2m_max",
    "temperature_2m_min",
    "cloud_cover_mean",
    "cloud_cover_max",
    "cloud_cover_min",
    "relative_humidity_2m_mean",
    "precipitation_sum",
    "precipitation_hours",
]


def get(url: str, timeout: int = 90) -> tuple[bytes, dict]:
    req = urllib.request.Request(url, headers={"User-Agent": "SuryaCast-student-project/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(), dict(r.headers)


def fetch_open_meteo() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    for c in CITIES:
        out = RAW / f"{c['id']}.json"
        if out.exists():
            continue
        url = (
            "https://archive-api.open-meteo.com/v1/archive"
            f"?latitude={c['lat']}&longitude={c['lon']}"
            f"&start_date={START}&end_date={END}"
            f"&daily={','.join(DAILY_VARS)}&timezone=Asia%2FKolkata"
        )
        for attempt in range(6):
            try:
                body, headers = get(url)
                data = json.loads(body)
                if "daily" not in data:
                    raise RuntimeError(str(data)[:300])
                out.write_text(json.dumps(data))
                remaining = float(headers.get("X-RateLimit-Remaining", "600"))
                print(f"[open-meteo] {c['name']}: {len(data['daily']['time'])} days, "
                      f"cost={headers.get('X-RateLimit-Cost')}, remaining/min={remaining:.0f}", flush=True)
                # Stay well inside the 600-per-minute budget.
                time.sleep(16 if remaining < 250 else 2)
                break
            except urllib.error.HTTPError as e:
                print(f"[open-meteo] {c['name']}: HTTP {e.code} {e.read()[:200]!r}; waiting 65 s", flush=True)
                time.sleep(65)
            except Exception as e:  # network hiccup
                print(f"[open-meteo] {c['name']}: {e}; retry in 20 s", flush=True)
                time.sleep(20)
        else:
            raise SystemExit(f"Failed to download {c['name']}")


GLOBAL_FILES = {
    "co2_mm_mlo.csv": "https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_mm_mlo.csv",
    "co2_annmean_mlo.csv": "https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_annmean_mlo.csv",
    "gistemp.csv": "https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv",
    "india-TAVG-Trend.txt": "https://berkeley-earth-temperature.s3.us-west-1.amazonaws.com/Regional/TAVG/india-TAVG-Trend.txt",
}


def fetch_global() -> None:
    GLOBAL.mkdir(parents=True, exist_ok=True)
    for name, url in GLOBAL_FILES.items():
        out = GLOBAL / name
        if not out.exists():
            body, _ = get(url, timeout=120)
            out.write_bytes(body)
            print(f"[global] {name}: {len(body)} bytes", flush=True)


if __name__ == "__main__":
    fetch_open_meteo()
    fetch_global()
    print("done")
