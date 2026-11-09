"""Crops the full-page captures from scripts/screenshots.sh into README / report images."""
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parents[1] / "docs" / "screenshots"
CROPS = {
    "hero": ("hero", 0, 900),
    "forecast": ("forecast", 0, 1440),
    "forecast_explain": ("forecast", 1620, 2340),
    "planner": ("planner", 0, 1400),
    "planner_lca": ("planner", 2150, 3150),
    "model_lab": ("model_lab", 0, 1800),
    "model_lab_playground": ("model_lab", 4900, 6000),
    "performance": ("performance", 0, 1700),
    "performance_analysis": ("performance", 1680, 2680),
    "science": ("science", 0, 1420),
    "science_evidence": ("science", 1395, 2640),
    "project": ("project", 0, 1700),
}
for name, (src, y0, y1) in CROPS.items():
    im = Image.open(OUT / f"{src}.png").convert("RGB")
    im.crop((0, y0, im.width, min(y1, im.height))).save(OUT / f"{name}.jpg", quality=84, optimize=True)
for png in OUT.glob("*.png"):
    png.unlink()
print("cropped", len(CROPS), "screenshots")
