"""Renders PDF pages into contact sheets for visual checking.

    python scripts/report/render_pages.py <report.pdf> <out_dir> [pages_per_sheet]
"""
import sys
from pathlib import Path

import pymupdf
from PIL import Image

pdf, out = Path(sys.argv[1]), Path(sys.argv[2])
per = int(sys.argv[3]) if len(sys.argv) > 3 else 6
out.mkdir(parents=True, exist_ok=True)
doc = pymupdf.open(pdf)
imgs = []
for page in doc:
    pix = page.get_pixmap(dpi=55)
    imgs.append(Image.frombytes("RGB", (pix.width, pix.height), pix.samples))
for s in range(0, len(imgs), per):
    chunk = imgs[s : s + per]
    w, h = chunk[0].size
    cols = 3
    rows = (len(chunk) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * w + (cols + 1) * 8, rows * h + (rows + 1) * 8), (120, 120, 120))
    for i, im in enumerate(chunk):
        sheet.paste(im, (8 + (i % cols) * (w + 8), 8 + (i // cols) * (h + 8)))
    sheet.save(out / f"sheet_{s // per + 1:02d}.jpg", quality=80)
print(len(imgs), "pages ->", (len(imgs) + per - 1) // per, "sheets")
