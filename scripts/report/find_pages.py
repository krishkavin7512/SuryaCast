"""Finds the printed page number of every TOC entry, figure and table in the rendered PDF.

    python scripts/report/find_pages.py <report.pdf> <report.docx.index.json> <pages.json>

Front matter is numbered in lower-case Roman numerals (the cover counts as i) and
the chapters in Arabic numerals starting at 1 on "Chapter 1".
"""
import json
import re
import sys

import pymupdf

pdf, index_path, out = sys.argv[1:4]
index = json.load(open(index_path, encoding="utf-8"))
doc = pymupdf.open(pdf)
lines = [[ln.strip() for ln in page.get_text("text").splitlines() if ln.strip()] for page in doc]


def roman(n):
    vals = [(10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i")]
    out = ""
    for v, s in vals:
        while n >= v:
            out += s
            n -= v
    return out


def first(pred, start=0):
    for i in range(start, len(lines)):
        if any(pred(ln) for ln in lines[i]):
            return i
    return None


ch1 = first(lambda ln: ln.startswith("Chapter 1:"))
abbr = first(lambda ln: ln == "LIST OF ABBREVIATIONS")
printed = lambda i: roman(i + 1) if i < ch1 else str(i - ch1 + 1)

toc = {}
for num, title in index["toc"]:
    if title in ("List of Figures", "List of Tables", "List of Abbreviations"):
        i = first(lambda ln, t=title.upper(): ln == t)
    elif num and "." not in num:
        i = first(lambda ln, n=num: ln.startswith(f"Chapter {n}:"), ch1)
    elif num:
        i = first(lambda ln, n=num, t=title: ln == f"{n} {t}" or ln.startswith(f"{n} {t[:25]}"), ch1)
    else:
        i = first(lambda ln, t=title: ln == t, ch1)
    toc[f"{num}|{title}"] = printed(i) if i is not None else ""

figs, tabs = {}, {}
for label, _ in index["figures"]:
    i = first(lambda ln, l=label: re.match(re.escape(l) + r"(\s|$)", ln) is not None, abbr + 1)
    figs[label] = printed(i) if i is not None else ""
for label, _ in index["tables"]:
    i = first(lambda ln, l=label: re.match(re.escape(l) + r"(\s|$)", ln) is not None, abbr + 1)
    tabs[label] = printed(i) if i is not None else ""

json.dump({"toc": toc, "figures": figs, "tables": tabs}, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
missing = [k for d in (toc, figs, tabs) for k, v in d.items() if not v]
print(f"pages: {len(doc)}, chapter 1 on sheet {ch1 + 1}, missing: {missing}")
