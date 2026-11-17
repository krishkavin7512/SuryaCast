"""Builds the 15-page SuryaCast project report from the SRMIST case-study template.

    python scripts/report/build_report.py <template.docx> <figures_dir> <screenshots_dir> <out.docx> <colab.json> [pages.json]

Every number comes from the project's own result files (src/data/*.json) or from the
executed Colab notebook (colab.json), so the report agrees with the website, the
trained model and the notebook. The longer 29-page version lives in build_report_full.py.
"""
from __future__ import annotations

import copy
import json
import re
import sys
from pathlib import Path

import docx
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_COLOR_INDEX, WD_TAB_ALIGNMENT
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Inches, Pt, RGBColor

TEMPLATE, FIGS, SHOTS, OUT, COLAB_PATH = (Path(a) for a in sys.argv[1:6])
PAGES = json.loads(Path(sys.argv[6]).read_text(encoding="utf-8")) if len(sys.argv) > 6 else {}
ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "src" / "data"
R = json.loads((D / "model-report.json").read_text(encoding="utf-8"))
P = json.loads((D / "performance.json").read_text(encoding="utf-8"))
C = json.loads((D / "climate.json").read_text(encoding="utf-8"))
COLAB = json.loads(COLAB_PATH.read_text(encoding="utf-8"))
TNR = "Times New Roman"

TITLE = "SuryaCast: Machine-Learning Solar Forecasting and Carbon-Offset Planning for Indian Rooftops"
COURSE = "21CEO310T"
COURSE_NAME = "Global Warming and Climate Change"
MEMBERS = [
    ("KAVIN KRISH VIJAY", "RA2411003011558"),
    ("TANAY KRISHNAN", "RA2411003011550"),
    ("NIYATI AGRAWAL", "RA2411003011569"),
    ("SHAURYA OJHA", "RA2411003011565"),
]
STUDENT_DEPT = "Department of Computing Technologies"
GUIDE, GUIDE_DESIG, GUIDE_DEPT = "Dr. Arokiaprakash. A", "Assistant Professor", "Department of Civil Engineering"
LIVE = "https://suryacast.vercel.app"
REPO = "https://github.com/krishkavin7512/SuryaCast"
CSV_URL = f"{LIVE}/data/suryacast-era5-dataset.csv"
COLAB_URL = COLAB["url"]


def metrics(key):
    return next(m for m in P["models"] if m["key"] == key)["metrics"]


NN, HS = metrics("mlp"), metrics("hargreaves")
CO2_LAST, GIS_LAST = C["co2Annual"][-1], C["gistemp"][-1]
IMPROVE = 100 * (1 - NN["testSpace"]["mae"] / HS["testSpace"]["mae"])
CROW = {r["model"]: r for r in COLAB["rows"]}
NB_NN = CROW["SuryaCast neural network (this notebook)"]
NB_DEP = CROW["Deployed website model (TypeScript-trained)"]
CI = P["ci"]
SKY = {b["label"]: b for b in P["bySky"]}
HZ = P["horizons"]["mlp"]
HARD = sorted((c for c in R["perCity"] if c["split"] == "holdout"), key=lambda c: c["mlpR2"])[:2]
MBE = f"{NN['testSpace']['mbe']:+.2f}".replace("-", "−")

# References, numbered in order of first citation in the text (IEEE style).
REFS = [
    ("noaa", "X. Lan, P. Tans and K. W. Thoning, “Trends in globally-averaged and Mauna Loa CO₂,” NOAA Global Monitoring Laboratory, 2025."),
    ("gistemp", "N. Lenssen et al., “Improvements in the GISTEMP uncertainty model,” Journal of Geophysical Research: Atmospheres, vol. 124, no. 12, pp. 6307–6326, 2019."),
    ("berkeley", "R. A. Rohde and Z. Hausfather, “The Berkeley Earth land/ocean temperature record,” Earth System Science Data, vol. 12, pp. 3469–3479, 2020."),
    ("cea", "Central Electricity Authority, “CO₂ Baseline Database for the Indian Power Sector, Version 20.0,” Government of India, New Delhi, 2024."),
    ("mnre", "Ministry of New and Renewable Energy, “PM Surya Ghar: Muft Bijli Yojana,” Government of India, 2024."),
    ("angstrom", "A. Ångström, “Solar and terrestrial radiation,” Quarterly Journal of the Royal Meteorological Society, vol. 50, pp. 121–126, 1924."),
    ("prescott", "J. A. Prescott, “Evaporation from a water surface in relation to solar radiation,” Transactions of the Royal Society of South Australia, vol. 64, pp. 114–118, 1940."),
    ("hargreaves", "G. H. Hargreaves and Z. A. Samani, “Reference crop evapotranspiration from temperature,” Applied Engineering in Agriculture, vol. 1, no. 2, pp. 96–99, 1985."),
    ("fao56", "R. G. Allen, L. S. Pereira, D. Raes and M. Smith, “Crop evapotranspiration: Guidelines for computing crop water requirements,” FAO Irrigation and Drainage Paper 56, FAO, Rome, 1998."),
    ("liu", "B. Y. H. Liu and R. C. Jordan, “The interrelationship and characteristic distribution of direct, diffuse and total solar radiation,” Solar Energy, vol. 4, no. 3, pp. 1–19, 1960."),
    ("erbs", "D. G. Erbs, S. A. Klein and J. A. Duffie, “Estimation of the diffuse radiation fraction for hourly, daily and monthly-average global radiation,” Solar Energy, vol. 28, no. 4, pp. 293–302, 1982."),
    ("duffie", "J. A. Duffie and W. A. Beckman, Solar Engineering of Thermal Processes, 4th ed. Hoboken, NJ: Wiley, 2013."),
    ("era5", "H. Hersbach et al., “The ERA5 global reanalysis,” Quarterly Journal of the Royal Meteorological Society, vol. 146, pp. 1999–2049, 2020."),
    ("mellit", "A. Mellit and S. A. Kalogirou, “Artificial intelligence techniques for photovoltaic applications: A review,” Progress in Energy and Combustion Science, vol. 34, no. 5, pp. 574–632, 2008."),
    ("yadav", "A. K. Yadav and S. S. Chandel, “Solar radiation prediction using artificial neural network techniques: A review,” Renewable and Sustainable Energy Reviews, vol. 33, pp. 772–781, 2014."),
    ("voyant", "C. Voyant et al., “Machine learning methods for solar radiation forecasting: A review,” Renewable Energy, vol. 105, pp. 569–582, 2017."),
    ("openmeteo", "P. Zippenfenig, “Open-Meteo.com Weather API,” Zenodo, 2023, doi: 10.5281/zenodo.7970649."),
    ("adam", "D. P. Kingma and J. Ba, “Adam: A method for stochastic optimization,” in Proc. Int. Conf. Learning Representations (ICLR), 2015."),
]
REF_NO = {k: i for i, (k, _) in enumerate(REFS, 1)}


def ref(*keys):
    return ", ".join(f"[{REF_NO[k]}]" for k in keys)


doc = docx.Document(str(TEMPLATE))
body = doc.element.body


# ------------------------------------------------------------------ run helpers
def style_run(r, size=None, bold=None, italic=None, hl=None, color=None, font=TNR):
    r.font.name = font
    rpr = r._r.get_or_add_rPr()
    fonts = rpr.find(qn("w:rFonts"))
    if fonts is None:
        fonts = OxmlElement("w:rFonts")
        rpr.insert(0, fonts)
    for a in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        fonts.set(qn(a), font)
    if size is not None:
        r.font.size = Pt(size)
    if bold is not None:
        r.bold = bold
    if italic is not None:
        r.italic = italic
    r.font.highlight_color = WD_COLOR_INDEX.YELLOW if hl else None
    if color:
        r.font.color.rgb = RGBColor.from_string(color)
    return r


def clear(p):
    for el in list(p._p):
        if el.tag != qn("w:pPr"):
            p._p.remove(el)


def add_link(p, url, text, size, bold=None):
    """A real, clickable hyperlink (blue, underlined)."""
    r_id = p.part.relate_to(url, RT.HYPERLINK, is_external=True)
    h = OxmlElement("w:hyperlink")
    h.set(qn("r:id"), r_id)
    h.set(qn("w:history"), "1")
    r = OxmlElement("w:r")
    rpr = OxmlElement("w:rPr")
    fonts = OxmlElement("w:rFonts")
    for a in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        fonts.set(qn(a), TNR)
    rpr.append(fonts)
    if bold:
        rpr.append(OxmlElement("w:b"))
    color = OxmlElement("w:color")
    color.set(qn("w:val"), "0563C1")
    rpr.append(color)
    for tag in ("w:sz", "w:szCs"):
        s = OxmlElement(tag)
        s.set(qn("w:val"), str(int(size * 2)))
        rpr.append(s)
    u = OxmlElement("w:u")
    u.set(qn("w:val"), "single")
    rpr.append(u)
    r.append(rpr)
    t = OxmlElement("w:t")
    t.text = text
    t.set(qn("xml:space"), "preserve")
    r.append(t)
    h.append(r)
    p._p.append(h)


def fill(p, parts, size=12):
    """parts: list of (text, opts) or plain strings."""
    clear(p)
    for part in parts:
        text, opts = (part, {}) if isinstance(part, str) else part
        if opts.get("link"):
            add_link(p, opts["link"], text, opts.get("size", size), opts.get("bold"))
            continue
        r = style_run(p.add_run(text), size=opts.get("size", size), bold=opts.get("bold"), italic=opts.get("italic"), hl=opts.get("hl"))
        if opts.get("sub"):
            r.font.subscript = True


# Math symbols written as X_sub (K_t, R_a, T_max ...) become real subscripts; column names are untouched.
MATH_SUB = re.compile(r"(?<![A-Za-z0-9_])(K̂|R̂|K|R|T|k|G|d|ω|H|ρ|η)_(max|min|Rs|sc|eff|BOS|t|a|s|r|b|T|d|g|c)(?![A-Za-z0-9_])")


def rich(text, size=12, base_bold=False, base_italic=False):
    """Tiny markup: **bold**, *italic*, [[highlight]], {{url|label}} (hyperlink), X_sub (math subscript)."""
    text = MATH_SUB.sub(lambda m: f"{m.group(1)}~{m.group(2)}~", text)
    out = []
    for tok in re.split(r"(\*\*.+?\*\*|\*.+?\*|\[\[.+?\]\]|\{\{.+?\}\}|~[^~]+~)", text):
        if not tok:
            continue
        if tok.startswith("**"):
            out.extend((t, {**o, "bold": True}) for t, o in rich(tok[2:-2], size, False, base_italic))
        elif tok.startswith("{{"):
            url, label = tok[2:-2].split("|", 1)
            out.append((label, {"link": url, "size": size, "bold": base_bold or None}))
        elif tok.startswith("[["):
            out.append((tok[2:-2], {"bold": True, "size": size, "hl": True}))
        elif tok.startswith("~"):
            out.append((tok[1:-1], {"size": size, "sub": True, "bold": base_bold or None, "italic": base_italic or None}))
        elif tok.startswith("*") and len(tok) > 2:
            out.append((tok[1:-1], {"italic": True, "size": size, "bold": base_bold or None}))
        else:
            out.append((tok, {"size": size, "bold": base_bold or None, "italic": base_italic or None}))
    return out


def set_outline(p, level):
    pPr = p._p.get_or_add_pPr()
    ol = OxmlElement("w:outlineLvl")
    ol.set(qn("w:val"), str(level))
    pPr.append(ol)


# ------------------------------------------------------------------ block builders
def para(text="", size=12, align=WD_ALIGN_PARAGRAPH.JUSTIFY, sa=6, sb=0, ls=1.5, bold=False, keep=False):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.alignment = align
    pf.space_after = Pt(sa)
    pf.space_before = Pt(sb)
    pf.line_spacing = ls
    pf.keep_with_next = keep
    fill(p, rich(text, size, bold), size)
    return p


def chapter(num, title, new_page=False):
    p = para(f"Chapter {num}: {title}" if num else title, size=16, align=WD_ALIGN_PARAGRAPH.LEFT, sa=8, sb=0 if new_page else 10, ls=1.15, bold=True, keep=True)
    p.paragraph_format.page_break_before = new_page
    set_outline(p, 0)
    return p


def h2(text):
    p = para(text, size=14, align=WD_ALIGN_PARAGRAPH.LEFT, sa=2, sb=6, ls=1.15, bold=True, keep=True)
    set_outline(p, 1)
    return p


def bullets(items, size=12, ls=1.35):
    for it in items:
        p = doc.add_paragraph()
        pPr = p._p.get_or_add_pPr()
        num = OxmlElement("w:numPr")
        ilvl = OxmlElement("w:ilvl")
        ilvl.set(qn("w:val"), "0")
        nid = OxmlElement("w:numId")
        nid.set(qn("w:val"), "1")
        num.append(ilvl)
        num.append(nid)
        pPr.append(num)
        pf = p.paragraph_format
        pf.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        pf.line_spacing = ls
        pf.space_after = Pt(2)
        fill(p, rich(it, size), size)


TEXT_W = Cm(21.0) - Inches(1.5) - Inches(1.0)
FIG_N, TAB_N = {}, {}
FIG_LIST, TAB_LIST = [], []


def caption(kind, chap, text):
    counter = FIG_N if kind == "Fig." else TAB_N
    counter[chap] = counter.get(chap, 0) + 1
    label = f"{kind} {chap}.{counter[chap]}"
    (FIG_LIST if kind == "Fig." else TAB_LIST).append((label, text))
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.alignment = WD_ALIGN_PARAGRAPH.CENTER
    pf.space_before = Pt(3 if kind == "Fig." else 8)
    pf.space_after = Pt(8 if kind == "Fig." else 3)
    pf.keep_with_next = kind != "Fig."
    fill(p, [(label + "  ", {"bold": True, "size": 10.5}), (text, {"size": 10.5})], 10.5)
    return label


def figure(chap, path, text, width_cm=12.0):
    p = doc.add_paragraph()
    p.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.keep_with_next = True
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(0)
    p.add_run().add_picture(str(path), width=Cm(width_cm))
    return caption("Fig.", chap, text)


def set_cell_borders(table):
    tblPr = table._tbl.tblPr
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        e = OxmlElement(f"w:{edge}")
        e.set(qn("w:val"), "single")
        e.set(qn("w:sz"), "6")
        e.set(qn("w:space"), "0")
        e.set(qn("w:color"), "808080")
        borders.append(e)
    tblPr.append(borders)


def shade(cell, hexcolor):
    tcPr = cell._tc.get_or_add_tcPr()
    sh = OxmlElement("w:shd")
    sh.set(qn("w:val"), "clear")
    sh.set(qn("w:color"), "auto")
    sh.set(qn("w:fill"), hexcolor)
    tcPr.append(sh)


def table(chap, title, headers, rows, widths_cm, size=10, bold_first_col=False, highlight_rows=(), align_num=True):
    caption("Table", chap, title)
    t = doc.add_table(rows=1 + len(rows), cols=len(headers))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    set_cell_borders(t)
    for gc, w in zip(t._tbl.tblGrid.findall(qn("w:gridCol")), widths_cm):
        gc.set(qn("w:w"), str(int(Cm(w).twips)))
    for ri, row in enumerate([headers] + rows):
        for ci, val in enumerate(row):
            cell = t.rows[ri].cells[ci]
            cell.width = Cm(widths_cm[ci])
            p = cell.paragraphs[0]
            pf = p.paragraph_format
            pf.space_after = Pt(1)
            pf.space_before = Pt(1)
            pf.line_spacing = 1.0
            is_num = align_num and ci > 0 and re.fullmatch(r"[−\-+]?[\d.,%]+[\d%]*( \w+)?", str(val).strip() or "x") is not None
            pf.alignment = WD_ALIGN_PARAGRAPH.CENTER if (ri == 0 or is_num) else WD_ALIGN_PARAGRAPH.LEFT
            hot = ri > 0 and (ri - 1) in highlight_rows
            bold = ri == 0 or (bold_first_col and ci == 0) or hot
            fill(p, rich(str(val), size, base_bold=bold), size)
            if ri < len(rows):
                pf.keep_with_next = True  # keep the whole table on one page
            if ri == 0:
                shade(cell, "D9D9D9")
            elif hot:
                shade(cell, "FCE9D9")
    sp = doc.add_paragraph()
    sp.paragraph_format.space_after = Pt(0)
    sp.paragraph_format.line_spacing = 0.6
    return t


def equation(text, num):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.space_before = Pt(3)
    pf.space_after = Pt(4)
    pf.left_indent = Cm(0.8)
    pf.tab_stops.add_tab_stop(int(TEXT_W - Cm(0.8)) - 10, WD_TAB_ALIGNMENT.RIGHT)
    fill(p, rich(text, 11.5, base_italic=True) + [(f"\t({num})", {"size": 11.5})])


# ================================================================== 1. COVER PAGE
ps = doc.paragraphs
fill(ps[0], [(TITLE, {"bold": True, "size": 22})])
fill(ps[1], [(f"{COURSE} – {COURSE_NAME}", {"bold": True, "size": 12}), (" · Working Model Project (LLT / CLA-2)", {"bold": True, "size": 12})])
import copy
fill(ps[3], [(f"{MEMBERS[0][0]} [{MEMBERS[0][1]}]", {"bold": True, "size": 14})])
fill(ps[4], [(f"{MEMBERS[1][0]} [{MEMBERS[1][1]}]", {"bold": True, "size": 14})])
ps[4].paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
ps[3].paragraph_format.line_spacing = 1.3
ps[3].paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
ps[3].paragraph_format.right_indent = None  # template offsets the first name line; centre it like the others
ps[4].paragraph_format.line_spacing = 1.3
# four names plus guide block must still fit the cover page: tighten the spacer and the italic lines
ps[5].paragraph_format.line_spacing = Pt(8)
for _i in (7, 8, 9):
    ps[_i].paragraph_format.line_spacing = 1.3
for _i in (10, 11, 12):
    ps[_i].paragraph_format.line_spacing = 1.25
_prev = ps[4]._p
for _name, _reg in MEMBERS[2:]:  # further team members: copies of the second name line
    _new = copy.deepcopy(ps[4]._p)
    _prev.addnext(_new)
    fill(docx.text.paragraph.Paragraph(_new, ps[4]._parent), [(f"{_name} [{_reg}]", {"bold": True, "size": 14})])
    _prev = _new
fill(ps[7], [(GUIDE, {"bold": True, "size": 14})])
fill(ps[8], [(GUIDE_DESIG, {"bold": True, "size": 14})])
fill(ps[9], [(GUIDE_DEPT, {"bold": True, "size": 14})])
fill(ps[11], [("of", {"italic": True, "size": 12})])
ps[11].add_run().add_break()
style_run(ps[11].runs[-1], size=12)
style_run(ps[11].add_run("Bachelor of Technology"), size=12, italic=True)
fill(ps[13], [("COMPUTER SCIENCE AND ENGINEERING", {"bold": True, "size": 14})])
ps[13].add_run().add_break()
style_run(ps[13].runs[-1], size=12)
style_run(ps[13].add_run(f"({STUDENT_DEPT})"), size=12, bold=True)

# ================================================================== 2. BONAFIDE
for _r in ps[21].runs:
    _r.text = _r.text.replace("INSTITUTION", "INSTITUTE")
assert "INSTITUTE" in ps[21].text
fill(ps[27], [
    ("This is to certify that the ", {"size": 14}),
    (f"{COURSE} – {COURSE_NAME}", {"bold": True, "size": 14}),
    (" working model report titled “", {"size": 14}),
    (TITLE, {"bold": True, "size": 14}),
    ("” is the bonafide work of ", {"size": 14}),
] + [
    run
    for i, (n, r) in enumerate(MEMBERS)
    for run in (
        [(", " if i < len(MEMBERS) - 1 else " and ", {"size": 14})] if i else []
    ) + [(f"{n} ({r})", {"bold": True, "size": 14})]
] + [
    (f", {STUDENT_DEPT}, who undertook the task of completing the project within the allotted time.", {"size": 14}),
])
sig = doc.tables[0].rows[0].cells[0].paragraphs
fill(sig[3], [(GUIDE, {"bold": True, "size": 12})])
fill(sig[4], [(GUIDE_DESIG, {"size": 12})])
fill(sig[5], [(GUIDE_DEPT, {"size": 12})])

# ================================================================== 3. ABSTRACT
abstract = (
    "Electricity generation is one of India's largest sources of carbon dioxide: every unit drawn from the grid emits about "
    "0.727 kg of CO₂ because most of it still comes from coal. Rooftop solar photovoltaics is a direct mitigation "
    "measure open to a household, and the PM Surya Ghar scheme aims to reach one crore homes, but solar output swings with "
    "clouds, the monsoon and heat, while sensors that measure sunlight are scarce. This project builds SuryaCast, a working "
    "model that forecasts rooftop solar generation for any location in India from routine weather data and converts it into "
    "avoided CO₂, carbon credits and savings. A neural network written from scratch, an ensemble of five 13-64-32-1 multilayer "
    "perceptrons trained with back-propagation and the Adam optimiser, learns the daily clearness index from cloud cover, "
    f"humidity, rainfall and temperature using {R['dataset']['records']:,} city-days of ERA5 reanalysis data for 38 Indian cities "
    "(2021–2025). FAO-56 solar geometry and photovoltaic physics then convert sunlight into electricity. On a year the model "
    f"never saw it reaches R² = {NN['testTime']['r2']:.3f}, and on eight unseen cities R² = {NN['testSpace']['r2']:.3f}, with "
    f"{IMPROVE:.0f}% lower error than the FAO-56 Hargreaves–Samani method; bootstrap confidence intervals show the difference "
    f"is statistically significant. Monthly solar energy is predicted within {HZ['monthly']:.1f}%. The model runs live in a web "
    "browser, and a Google Colab notebook retrains and re-evaluates it in Python. The website also explains the greenhouse "
    "effect, the measured warming evidence and carbon-credit mechanisms, linking all five course units from cause to mitigation."
)
assert len(abstract.split()) <= 300, len(abstract.split())
ps[42].paragraph_format.page_break_before = True
fill(ps[43], [(abstract, {"size": 14})])
ps[43].paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
ps[43].paragraph_format.line_spacing = 1.3
kw = ps[44]
fill(kw, [("Keywords: ", {"bold": True, "size": 12}), ("global warming, rooftop solar, solar radiation forecasting, neural network, carbon credits, climate mitigation, India", {"italic": True, "size": 12})])
kw.paragraph_format.space_before = Pt(10)
kw.paragraph_format.line_spacing = 1.15

# remove the template's filler blank paragraphs and start the TOC on a new page
for idx in sorted(list(range(32, 42)) + list(range(45, 66)), reverse=True):
    el = ps[idx]._p
    if not ps[idx].text.strip() and not el.xpath(".//w:drawing") and not el.xpath("./w:pPr/w:sectPr"):
        el.getparent().remove(el)
toc_head = next(p for p in doc.paragraphs if p.text.strip() == "TABLE OF CONTENTS")
toc_head.paragraph_format.page_break_before = True

# project-links block below the keywords (abstract page)
box = [
    ("Live working model", LIVE, LIVE),
    ("Source code (GitHub)", REPO, REPO),
    ("Model-training notebook (Google Colab)", COLAB_URL, COLAB_URL),
]
anchor = kw
hdr = copy.deepcopy(kw._p)
anchor._p.addnext(hdr)
hp = docx.text.paragraph.Paragraph(hdr, kw._parent)
fill(hp, [("Project links", {"bold": True, "size": 12})])
hp.paragraph_format.space_before = Pt(14)
anchor = hp
for label, url, text in box:
    e = copy.deepcopy(kw._p)
    anchor._p.addnext(e)
    ep = docx.text.paragraph.Paragraph(e, kw._parent)
    fill(ep, [(label + ": ", {"bold": True, "size": 11}), (text, {"link": url, "size": 11})], 11)
    ep.paragraph_format.space_before = Pt(2)
    ep.paragraph_format.line_spacing = 1.15
    anchor = ep

# drop the template's guidance text (everything after the TOC table)
toc_tbl = doc.tables[1]._tbl
for el in list(toc_tbl.itersiblings()):
    if el.tag != qn("w:sectPr"):
        body.remove(el)

# ================================================================== 4. FRONT-MATTER LISTS (one page)
ABBR = [
    ("ANN / MLP", "Artificial neural network / multilayer perceptron"),
    ("CDM / CCTS", "Clean Development Mechanism / Carbon Credit Trading Scheme (India)"),
    ("CEA", "Central Electricity Authority, Government of India"),
    ("CI", "Confidence interval"),
    ("ERA5", "Fifth-generation ECMWF atmospheric reanalysis"),
    ("FAO-56", "FAO Irrigation and Drainage Paper 56"),
    ("GHI", "Global horizontal irradiation (kWh/m²/day)"),
    ("K_t", "Daily clearness index, R_s / R_a"),
    ("kWp", "Kilowatt-peak, rated DC capacity of a PV array"),
    ("MAE / RMSE", "Mean absolute error / root-mean-square error"),
    ("NOCT", "Nominal operating cell temperature"),
    ("PV", "Photovoltaic"),
    ("R_a / R_s", "Extraterrestrial / surface solar radiation (MJ/m²/day)"),
    ("R²", "Coefficient of determination"),
]


def front_heading(text, new_page=False):
    p = para(text, size=14, align=WD_ALIGN_PARAGRAPH.CENTER, sa=6, sb=0 if new_page else 12, ls=1.15, bold=True, keep=True)
    p.paragraph_format.page_break_before = new_page
    return p


front_heading("LIST OF FIGURES", new_page=True)
LOF_SLOT = doc.add_paragraph()
front_heading("LIST OF TABLES")
LOT_SLOT = doc.add_paragraph()
front_heading("LIST OF ABBREVIATIONS")
abbr_tbl_slot = doc.add_paragraph()

# body section: Arabic page numbers from Chapter 1
doc.add_section(WD_SECTION.NEW_PAGE)

# ================================================================== CHAPTER 1
chapter(1, "Introduction")
h2("1.1 Background")
para(
    "Global warming is the long-term rise in Earth's average surface temperature caused mainly by greenhouse gases, above all "
    f"carbon dioxide from burning fossil fuels. Atmospheric CO₂ at Mauna Loa rose from about 316 ppm in 1959 to **{CO2_LAST[1]:.1f} ppm "
    f"in {CO2_LAST[0]}** {ref('noaa')}, well above the pre-industrial level of about 280 ppm, and NASA's GISTEMP record puts {GIS_LAST[0]} at "
    f"**+{GIS_LAST[1]:.2f} °C** above the 1951–1980 average {ref('gistemp')}. India is warming too: the Berkeley Earth record shows 2011–2020 was "
    f"**+{C['india']['change']:.2f} °C** warmer than 1901–1930, with {C['india']['trend1971']['perDecade']:.2f} °C per "
    f"decade since 1971 {ref('berkeley')}. Electricity generation is one of India's largest sources of CO₂: the Central Electricity Authority (CEA) "
    f"reports a weighted-average grid emission factor of **0.727 t CO₂/MWh** for FY 2023-24 {ref('cea')}, i.e. 0.727 kg for every unit "
    "consumed, because coal still supplies most of the power."
)
figure(1, FIGS / "fig02_climate_evidence.png", f"Evidence of global warming: (a) atmospheric CO₂ at Mauna Loa {ref('noaa')}; (b) global temperature anomaly, NASA GISTEMP v4 {ref('gistemp')}.", 10.0)
h2("1.2 Industry/Domain Context")
para(
    f"India's rooftop solar programme received a major push in February 2024 with **PM Surya Ghar: Muft Bijli Yojana**, which gives "
    f"central assistance of ₹30,000 per kW for the first 2 kW and ₹18,000 for the third kW (capped at ₹78,000) and targets one crore "
    f"households {ref('mnre')}. A household then asks how much electricity its roof will really make; a distribution company asks how "
    "much solar power will feed into its network tomorrow. Both depend on the sunlight reaching the ground, which varies sharply with "
    "clouds, humidity and the monsoon. Sunlight is measured with pyranometers, which are costly and found at few stations, whereas "
    "cloud cover, humidity, rainfall and temperature are measured and forecast everywhere, so turning these routine variables into "
    "solar estimates is a valuable engineering problem."
)
h2("1.3 Problem Statement")
para(
    "To design, build and validate a working model that estimates and forecasts daily rooftop solar electricity for any location in "
    "India from routine weather variables, states the uncertainty of each forecast, and converts the result into avoided CO₂ "
    "emissions, carbon credits and economic benefit, so that households and grid operators can plan around the variability of "
    "solar energy and the climate benefit of rooftop solar can be shown with real data."
)
h2("1.4 Objectives")
bullets([
    "To train and evaluate a neural network that estimates daily solar radiation from cloud, humidity, rainfall and temperature, "
    "and to compare it rigorously with the FAO-56 Hargreaves–Samani method and other baselines on data it has never seen.",
    "To combine the model with photovoltaic physics into a live, browser-based working model that forecasts rooftop electricity "
    "and avoided CO₂ for the next seven days at any location in India.",
    "To analyse the climate, carbon-credit and economic benefit of rooftop solar and present the underlying climate science to "
    "promote public awareness.",
])
h2("1.5 Scope and Limitations")
para(
    "The model covers 38 cities spanning hot-dry, composite, warm-humid, temperate, cold and hill climates, at daily resolution, "
    "using five years (2021–2025) of data, for south-facing household systems of 1–10 kWp. Its main limitations are:"
)
bullets([
    "it is trained and tested on ERA5 reanalysis, not ground pyranometers, and ERA5 can overestimate sunshine under heavy haze;",
    "forecasts are daily totals, and live accuracy also depends on the weather forecast supplied to the model;",
    "shading, dust, other panel orientations and wiring are simplified; cost, tariff and carbon-credit price are editable assumptions.",
])
h2("1.6 Project Resources and Team")
para("All parts of the project are openly available online (Table 1.1), and the team is listed in Table 1.2.", sa=3)
table(1, "Project resources", ["Resource", "Link", "Description"], [
    ["Live working model", f"{{{{{LIVE}|{LIVE}}}}}", "Forecast, planner, model lab, performance, science pages"],
    ["Source code (GitHub)", f"{{{{{REPO}|{REPO}}}}}", "Web app, training pipeline, ERA5 data, tests"],
    ["Model-training notebook (Google Colab)", f"{{{{{COLAB_URL}|{COLAB_URL}}}}}", "Python re-training, baselines, metrics, charts"],
    ["Dataset (CSV)", f"{{{{{CSV_URL}|{CSV_URL}}}}}", "69,388 city-days of ERA5 data"],
], [2.9, 7.7, 4.0], size=9, bold_first_col=True, align_num=False)
table(1, "Project team", ["Name", "Register No.", "Department", "Contribution"], [
    [n, r, STUDENT_DEPT, "Equal joint work on all parts"] for n, r in MEMBERS
], [3.9, 3.3, 3.8, 3.6], size=9, align_num=False)
h2("1.7 Relevance to the Course and Organization of the Report")
para(
    "The model uses every unit of the 21CEO310T syllabus: the greenhouse effect and carbon cycle (Unit I); Earth's energy balance and "
    "heat waves (Unit II); warming evidence and grid emissions (Unit III); carbon credits and the Clean Development Mechanism (Unit IV); "
    "and solar energy, life-cycle analysis and awareness (Unit V). It supports mainly CO-5 and CO-2. Chapters 2–6 give the "
    "literature survey, methodology, implementation, results and conclusion."
)

# ================================================================== CHAPTER 2
chapter(2, "Literature Survey")
h2("2.1 Introduction")
para(
    "Estimating the sunlight that reaches the ground is a long-standing problem in climatology and solar engineering. Existing "
    "approaches are empirical formulas, physical models (satellites, weather prediction, reanalysis) and data-driven learning."
)
h2("2.2 Review of Existing Approaches")
for who, what in [
    ("Ångström (1924) and Prescott (1940)", "related the clearness of the sky to relative sunshine duration, R_s/R_a = a + b·(n/N), which needs sunshine recorders that are scarce " + ref("angstrom", "prescott") + "."),
    ("Hargreaves and Samani (1985)", "estimated radiation from the daily temperature range alone; FAO-56 adopts it when no radiation data exist " + ref("hargreaves", "fao56") + ". It cannot tell cloud from humidity."),
    ("Liu and Jordan (1960), Erbs et al. (1982)", "gave the relations that split global radiation into direct and diffuse parts and transpose it onto a tilted panel " + ref("liu", "erbs") + "; with cell-temperature models " + ref("duffie") + " they form the standard route from radiation to PV energy."),
    ("Hersbach et al. (2020)", "describe ERA5, ECMWF's reanalysis that blends satellite and ground observations into a consistent, gap-free global record that includes surface radiation " + ref("era5") + "."),
    ("Mellit and Kalogirou (2008), Yadav and Chandel (2014), Voyant et al. (2017)", "reviewed artificial-intelligence and neural-network techniques for photovoltaic applications and solar radiation prediction " + ref("mellit", "yadav") + ", and machine-learning methods for solar radiation forecasting " + ref("voyant") + "."),
]:
    para(f"**{who}** {what}", sa=3)
h2("2.3 Comparative Analysis / Gap Identification")
table(2, "Comparison of approaches to estimating solar radiation", ["Approach", "Inputs", "Strength", "Limitation"], [
    ["Ångström–Prescott", "Sunshine hours", "Simple, accurate", "Recorders are scarce"],
    ["Hargreaves–Samani", "T_max, T_min", "Needs only temperature", "Blind to cloud and humidity"],
    ["ERA5 / weather models", "Model physics, satellites", "Physically complete", "Heavy infrastructure"],
    ["**SuryaCast (this work)**", "Cloud, RH, rain, temperature", "Tested on unseen cities; live; open", "Daily resolution"],
], [3.4, 3.6, 4.0, 3.6], size=9.5, align_num=False)
para(
    "The gap addressed here is a model tested on places and years it has never seen, with calibrated uncertainty, openly "
    "reproducible, and linked to emissions, carbon credits and economics."
)

# ================================================================== CHAPTER 3
chapter(3, "Methodology / Framework Design")
h2("3.1 Approach Overview")
para(
    "SuryaCast is **physics-informed machine learning**. The sunlight at the top of the atmosphere, R_a, is computed exactly from "
    "astronomy (FAO-56). A neural network predicts only the fraction that survives the atmosphere, the clearness index "
    "K_t = R_s/R_a, from routine weather variables; engineering physics then converts the predicted sunlight into electricity for a "
    "tilted panel and into avoided CO₂. Separating astronomy from atmosphere helps the model generalise across latitudes and seasons."
)
h2("3.2 Data Collection / Requirements Gathering")
para(
    f"All data are real and public. Daily weather and surface solar radiation for 38 cities, 2021–2025, were downloaded from the "
    f"ERA5 reanalysis {ref('era5')} through the Open-Meteo API {ref('openmeteo')}, cached in the repository, and published as one CSV "
    "(Table 1.1): 69,388 city-days with none missing. Each day has nine variables: solar energy at the ground (the target), "
    "maximum and minimum temperature, mean, maximum and minimum cloud cover, relative humidity, rainfall and hours of rain."
)
sp = R["dataset"]["splits"]
table(3, "Experiment design: how the data are split", ["Split", "Cities", "Years", "Days", "Purpose"], [
    ["Training", "30", "2021–2023", f"{sp['train']:,}", "Learn the weights"],
    ["Validation", "30", "2024", f"{sp['val']:,}", "Early stopping, model choice"],
    ["Test: unseen year", "30", "2025", f"{sp['testTime']:,}", "Future performance"],
    ["Test: unseen cities", "8", "2021–2025", f"{sp['testSpace']:,}", "New-place performance"],
], [3.5, 1.5, 2.4, 2.0, 5.2], size=9.5)
para(
    "The eight unseen cities are Coimbatore, Surat, Vijayawada, Ranchi, Bikaner, Gangtok, Port Blair and Shimla, chosen from different climate zones.",
    sa=4,
)
h2("3.3 Architecture / Workflow Diagram")
para("Figure 3.1 shows the two halves of the system. Offline, the data become the 13 features of Table 3.2 and the selected ensemble is exported as a 181 kB JSON file; live, the browser fetches the forecast for the chosen place, computes the same features and applies the networks, PV physics and carbon accounting.", sa=3)
figure(3, FIGS / "fig01_block_diagram.png", "Block diagram: offline training pipeline (top) and live in-browser working model (bottom).", 13.4)
table(3, "The 13 input features", ["Feature", "Computation", "Physical reason"], [
    ["Cloud cover: mean, max, min", "percent / 100", "Clouds block and scatter sunlight"],
    ["Relative humidity; rain (log); rain hours", "RH/100; ln(1+mm); h/24", "Water vapour absorbs; rain implies thick cloud"],
    ["Diurnal range; maximum temperature", "T_max − T_min; T_max", "Clear skies give hot days and cold nights"],
    ["Top-of-atmosphere sun R_a; season", "FAO-56; sin, cos of day of year", "Astronomy; cyclic seasonality"],
    ["Latitude; elevation", "degrees; km", "Location; thinner air at altitude"],
], [5.3, 4.2, 5.1], size=9.5, align_num=False)
h2("3.4 Implementation Strategy")
para(
    "The neural network, back-propagation and Adam optimiser are about 250 lines of TypeScript with **no machine-learning "
    "library**; ridge regression and the metrics are hand-written too. Node.js runs the training pipeline, Python (scikit-learn, "
    "pandas) gives an independent cross-check, and the web application uses React, Vite and Recharts. Forty-four automated tests check the physics against FAO-56 "
    "worked examples, the back-propagation gradients and the accuracy of the shipped model. The site needs no server (the model, "
    "city data and an offline forecast snapshot ship with it) and is hosted on Vercel, with the code on GitHub."
)

# ================================================================== CHAPTER 4
chapter(4, "Case Study Implementation / Analysis")
h2("4.1 Execution & Step-by-Step Analysis")
bullets([
    "**Data:** ERA5 daily data for 38 cities were downloaded with a throttled script that respects the API's limits and caches every response.",
    "**Features and baselines:** each day became the 13 features of Table 3.2 and the target K_t; monthly climatology, the FAO-56 formula and ridge regression were fitted on the same training data.",
    f"**Network search:** four network sizes were compared on the 2024 validation year; the best was {R['network']['architecture']}.",
    f"**Ensemble and uncertainty:** five such networks were trained from different random starts (best epochs {', '.join(str(m['bestEpoch']) for m in R['network']['members'])}) and averaged; "
    "80% intervals come from validation errors, widened for new places by leave-cities-out cross-validation.",
], size=12, ls=1.35)
para(
    f"**Training notebook (Google Colab).** The training is also reproduced in a Colab notebook (Table 1.1) that anyone can run in a browser: "
    "it downloads the same CSV, rebuilds features and splits, checks back-propagation against finite differences "
    f"(maximum error {COLAB['gradientError']:.1e}), trains the baselines and five 13-64-32-1 networks in NumPy, computes bootstrap "
    "confidence intervals, re-scores the deployed website model from its published weights and cross-checks three scikit-learn models. "
    f"The five networks trained in {COLAB['trainSeconds']} s on the Colab CPU runtime (Fig. 4.1); results are in Table 5.1. The trained "
    "ensemble runs in the browser inside the web application (Fig. 4.2)."
)
assert (SHOTS / "colab_notebook.jpg").exists(), "Colab screenshot missing"
figure(4, SHOTS / "colab_notebook.jpg", "The training notebook executed in Google Colab (outputs saved with the notebook).", 9.6)
figure(4, SHOTS / "hero.jpg", f"The deployed working model, {LIVE}. Each dot is one real day of sunlight in Chennai (2021–2025); dark arcs are monsoon cloud.", 5.6)
h2("4.2 Core Algorithms / Configurations")
para(f"**Extraterrestrial radiation** (FAO-56 eq. 21 {ref('fao56')}; G_sc = 0.082 MJ m⁻² min⁻¹, inverse Earth–Sun distance d_r, latitude φ, declination δ, sunset hour angle ω_s) and the **target**:", sa=2, ls=1.3)
equation("R_a = (24·60/π) · G_sc · d_r · [ ω_s sin φ sin δ + cos φ cos δ sin ω_s ]", "4.1")
equation("K_t = R_s / R_a  (capped at 0.85),     R̂_s = K̂_t · R_a", "4.2")
para("**Neural network.** Each network maps the standardised features x to K_t through two leaky-ReLU layers (64 and 32 neurons), where σ(z) = max(z, 0.01z); the ensemble averages five networks:", sa=2, ls=1.3)
equation("h₁ = σ(W₁x + b₁),   h₂ = σ(W₂h₁ + b₂),   K̂_t = W₃h₂ + b₃", "4.3")
para(f"**Training** minimises the mean-squared error with back-propagation and the Adam optimiser {ref('adam')} (learning rate 0.002 with cosine decay, batch 64, L2 decay 1e-5), stopping when the 2024 validation error stops improving (patience 20):", sa=2, ls=1.3)
equation("L = (1/n) Σ (K̂_t − K_t)² ,    θ ← θ − η · m̂ / (√v̂ + ε)", "4.4")
para(f"**Baseline** (FAO-56 eq. 50; k_Rs = 0.16 inland, 0.19 coastal; capped at clear-sky radiation) and **photovoltaic energy** (Liu–Jordan tilt {ref('liu', 'duffie')}, NOCT cell temperature, temperature coefficient γ = −0.37 %/°C, balance-of-system efficiency η_BOS = 0.86):", sa=2, ls=1.3)
equation("R_s = k_Rs · √(T_max − T_min) · R_a", "4.5")
equation("H_T = H_b R_b + H_d (1 + cos β)/2 + H ρ_g (1 − cos β)/2", "4.6")
equation("T_c = T_a + (NOCT − 20)/800 · G_eff ,     E = P · H_T · η_BOS · [1 + γ (T_c − 25)]", "4.7")
equation("CO₂ avoided = E × 0.727 kg/kWh", "4.8")
h2("4.3 Challenges Faced & Mitigation")
table(4, "Challenges and how they were resolved", ["Challenge", "Mitigation"], [
    ["API rate limits when downloading five years for 38 cities", "Throttled requests; every response cached in the repository"],
    ["A satellite-based (MERRA-2) city temperature series showed almost no warming over north India", "Replaced by the Berkeley Earth India record, consistent with observations"],
    [f"80% intervals covered only {R['intervals']['coverage']['testSpaceNarrow'] * 100:.1f}% of days in new cities", f"Wider bands for new sites from cross-validation ({R['intervals']['coverage']['testSpace'] * 100:.1f}% coverage)"],
    ["The published Erbs diffuse-fraction fit slightly exceeds 1 on very overcast days", "Clamped to [0, 1]; caught by an automated test"],
], [7.0, 7.6], size=9.5, align_num=False)

# ================================================================== CHAPTER 5
chapter(5, "Results and Discussion")
h2("5.1 Findings and Output")
NAMES = [
    ("Monthly climatology", "Monthly climatology"),
    ("Hargreaves-Samani (FAO-56)", "Hargreaves–Samani (FAO-56)"),
    ("Ridge linear regression", "Ridge linear regression"),
    ("Deployed website model (TypeScript-trained)", "SuryaCast NN, deployed (TypeScript)"),
    ("SuryaCast neural network (this notebook)", "SuryaCast NN, this notebook (Python)"),
    ("scikit-learn MLP (64-32)", "scikit-learn MLP (64-32)"),
    ("Histogram gradient boosting", "Histogram gradient boosting"),
    ("Random forest (200 trees)", "Random forest (200 trees)"),
]
para("Table 5.1 compares all methods on data none of them was trained on, as computed in the Colab notebook. Errors are in kWh/m² per day; mean daily sunlight is about 5 kWh/m².", sa=3)
table(5, "Accuracy on unseen data (Google Colab run)", ["Method", "R² 2025", "MAE 2025", "R² unseen cities", "MAE unseen cities"], [
    [label, f"{CROW[k]['R² 2025']:.3f}", f"{CROW[k]['MAE 2025']:.3f}", f"{CROW[k]['R² unseen cities']:.3f}", f"{CROW[k]['MAE unseen cities']:.3f}"]
    for k, label in NAMES
], [6.2, 1.8, 1.9, 2.4, 2.3], size=9.5, highlight_rows=(3, 4))
figure(5, FIGS / "fig04_pred_vs_actual.png", "Predicted against actual daily radiation for 700 random days in the eight unseen cities (deployed model).", 10.8)
table(5, "Further evidence for the deployed model", ["Observation", "Value"], [
    ["95% CI of R², unseen cities: network vs FAO-56", f"{CI['mlp']['r2'][0]:.3f}–{CI['mlp']['r2'][1]:.3f} vs {CI['hargreaves']['r2'][0]:.3f}–{CI['hargreaves']['r2'][1]:.3f}"],
    ["Leave-cities-out cross-validation R² (5 folds)", f"{R['crossValidation']['meanR2']:.3f} ± {R['crossValidation']['sdR2']:.3f}"],
    ["80% interval coverage: unseen year / unseen cities", f"{R['intervals']['coverage']['testTime'] * 100:.1f}% / {R['intervals']['coverage']['testSpace'] * 100:.1f}%"],
    ["Days within ±0.5 kWh/m²: network (FAO-56)", f"{NN['testSpace']['within05']:.1f}% ({HS['testSpace']['within05']:.1f}%)"],
    ["Electricity forecast error: daily / monthly / yearly", f"{HZ['daily']:.1f}% / {HZ['monthly']:.1f}% / {HZ['yearly']:.1f}%"],
    ["MAE on clear / overcast days (kWh/m²)", f"{SKY['Clear']['mlp']:.2f} / {SKY['Overcast']['mlp']:.2f}"],
    ["3 kWp roof, Chennai (five real years)", "4,755 kWh/yr; 3.46 t CO₂/yr avoided"],
], [8.0, 6.6], size=9.5, align_num=False)
h2("5.2 Discussion")
para(
    f"The first objective is met. On the unseen year the network explains {NN['testTime']['r2'] * 100:.0f}% of the day-to-day variation in "
    f"sunlight, and on eight cities it never saw it reaches R² = {NN['testSpace']['r2']:.3f} against {HS['testSpace']['r2']:.3f} for the FAO-56 "
    f"formula. Its error is {IMPROVE:.0f}% lower, and the confidence intervals do not overlap, so the improvement is statistically "
    f"significant. On clear days its error is {SKY['Clear']['mlp']:.2f} kWh/m², about five times smaller than the formula's "
    f"({SKY['Clear']['hargreaves']:.2f}), because it combines cloud and humidity with the temperature range; overcast days "
    f"({SKY['Overcast']['mlp']:.2f}) are hardest for every method, since a daily cloud average cannot show when the clouds passed."
)
para(
    f"The notebook's independently trained ensemble scored R² = {NB_NN['R² 2025']:.3f} on 2025 and {NB_NN['R² unseen cities']:.3f} on the unseen cities, "
    f"against {NB_DEP['R² 2025']:.3f} and {NB_DEP['R² unseen cities']:.3f} for the deployed model. The two agree to 0.001 on the unseen year but differ by "
    f"{abs(NB_NN['R² unseen cities'] - NB_DEP['R² unseen cities']):.3f} on the unseen cities, so unseen-city accuracy is more sensitive to the random "
    "initialisation and should be read as about 0.8. Both far exceed the FAO-56 formula and match the scikit-learn models, "
    "which supports the correctness of the from-scratch implementation."
)
para(
    f"The weaknesses are visible too: {HARD[0]['name']} (R² {HARD[0]['mlpR2']:.2f}) and {HARD[1]['name']} ({HARD[1]['mlpR2']:.2f}) are the hardest unseen cities, "
    f"and the network slightly under-predicts on average ({MBE} kWh/m² per day). For planning, daily errors partly cancel, so monthly energy is within {HZ['monthly']:.1f}%."
)
h2("5.3 Practical Implications")
bullets([
    "**Households** can judge PM Surya Ghar with real numbers for their own roof, and run heavy loads on sunny days.",
    "**Distribution companies** can estimate tomorrow's rooftop generation without pyranometers, reducing fossil back-up.",
    "**Carbon markets:** one roof is too small to earn credits alone, but programmes that aggregate many roofs (the Clean Development Mechanism, Paris Article 6.4, India's CCTS) can use such forecasts.",
], size=12, ls=1.35)

# ================================================================== CHAPTER 6
chapter(6, "Conclusion and Future Scope")
h2("6.1 Conclusion")
para(
    "SuryaCast shows that a compact neural network, written from scratch and trained on real reanalysis data, can turn routine weather "
    "into reliable solar-energy estimates for Indian rooftops. It beats the standard FAO-56 method by a statistically significant margin "
    "on a future year and on cities it never saw, reports honest uncertainty, and is fully reproducible from the Colab notebook and the "
    "repository. As a working model it links the cause of warming (coal electricity), the measured evidence and a practical "
    "mitigation step, quantified in kWh, rupees and tonnes of CO₂."
)
h2("6.2 Future Scope")
bullets([
    "Validate against ground pyranometer stations and real rooftop meter data.",
    "Forecast hour by hour, adding satellite cloud and aerosol data for monsoon and haze days.",
    "Add more hill and coastal training cities, and aggregate forecasts by electricity feeder for distribution companies.",
], size=12, ls=1.35)

# ================================================================== REFERENCES
chapter(None, "References")
for i, (_, r) in enumerate(REFS, 1):
    p = para(f"[{i}] {r}", size=9.5, align=WD_ALIGN_PARAGRAPH.LEFT, sa=1.5, ls=1.0)
    p.paragraph_format.left_indent = Cm(0.9)
    p.paragraph_format.first_line_indent = Cm(-0.9)


# ================================================================== FILL FRONT-MATTER LISTS & TOC
def fill_list(slot, items, page_map):
    prev = slot
    for label, text in items:
        p = docx.text.paragraph.Paragraph(copy.deepcopy(slot._p), slot._parent)
        prev._p.addnext(p._p)
        prev = p
        pf = p.paragraph_format
        pf.alignment = WD_ALIGN_PARAGRAPH.LEFT
        pf.line_spacing = 1.05
        pf.space_after = Pt(2)
        pf.left_indent = Cm(1.9)
        pf.first_line_indent = Cm(-1.9)
        pf.tab_stops.add_tab_stop(Cm(1.9))
        pf.tab_stops.add_tab_stop(int(TEXT_W) - 10, WD_TAB_ALIGNMENT.RIGHT)
        fill(p, [(label, {"bold": True, "size": 10}), ("\t" + text, {"size": 10}), ("\t" + str(page_map.get(label, "")), {"size": 10})], 10)
    slot._p.getparent().remove(slot._p)


fill_list(LOF_SLOT, FIG_LIST, PAGES.get("figures", {}))
fill_list(LOT_SLOT, TAB_LIST, PAGES.get("tables", {}))

abbr = doc.add_table(rows=len(ABBR), cols=2)
set_cell_borders(abbr)
abbr.alignment = WD_TABLE_ALIGNMENT.CENTER
for gc, w in zip(abbr._tbl.tblGrid.findall(qn("w:gridCol")), (3.4, 11.2)):
    gc.set(qn("w:w"), str(int(Cm(w).twips)))
for i, (a, b) in enumerate(ABBR):
    for j, (val, w) in enumerate(((a, 3.4), (b, 11.2))):
        c = abbr.rows[i].cells[j]
        c.width = Cm(w)
        fill(c.paragraphs[0], rich(val, 10, base_bold=(j == 0)), 10)
        c.paragraphs[0].paragraph_format.space_after = Pt(1)
        c.paragraphs[0].paragraph_format.line_spacing = 1.0
abbr_tbl_slot._p.addnext(abbr._tbl)
abbr_tbl_slot._p.getparent().remove(abbr_tbl_slot._p)

toc = doc.tables[1]
proto_chap = copy.deepcopy(toc.rows[1]._tr)
proto_sec = copy.deepcopy(toc.rows[2]._tr)
for row in list(toc.rows)[1:]:
    toc._tbl.remove(row._tr)
TOC_ROWS = [("", "List of Figures, Tables and Abbreviations", True)]
for p in doc.paragraphs:
    t = p.text.strip()
    m = re.match(r"Chapter (\d): (.+)$", t)
    if m:
        TOC_ROWS.append((m.group(1), m.group(2), True))
    elif re.match(r"^\d\.\d ", t) and p.runs and p.runs[0].font.size == Pt(14):
        TOC_ROWS.append((t.split(" ", 1)[0], t.split(" ", 1)[1], False))
    elif t == "References" and p.runs and p.runs[0].font.size == Pt(16):
        TOC_ROWS.append(("", t, True))
toc_pages = PAGES.get("toc", {})
for num, title, is_chap in TOC_ROWS:
    tr = copy.deepcopy(proto_chap if is_chap else proto_sec)
    toc._tbl.append(tr)
    row = toc.rows[-1]
    for ci, val in enumerate((num, title, str(toc_pages.get(f"{num}|{title}", "")))):
        p = row.cells[ci].paragraphs[0]
        fmt_bold = p.runs[0].bold if p.runs else is_chap
        clear(p)
        style_run(p.add_run(val), size=12, bold=bool(fmt_bold) or is_chap)


# ================================================================== PAGE SETUP & NUMBERING
def page_numbers(section, fmt, start):
    sectPr = section._sectPr
    for old in sectPr.findall(qn("w:pgNumType")):
        sectPr.remove(old)
    pg = OxmlElement("w:pgNumType")
    pg.set(qn("w:fmt"), fmt)
    pg.set(qn("w:start"), str(start))
    sectPr.append(pg)


for s in doc.sections[1:]:
    s.left_margin, s.right_margin = Inches(1.5), Inches(1.0)
    s.top_margin, s.bottom_margin = Inches(1.0), Inches(1.0)
page_numbers(doc.sections[1], "lowerRoman", 2)
page_numbers(doc.sections[2], "decimal", 1)

doc.core_properties.title = TITLE
doc.core_properties.author = ", ".join(m[0].title() for m in MEMBERS)
doc.core_properties.subject = f"{COURSE} {COURSE_NAME}"
OUT.parent.mkdir(parents=True, exist_ok=True)
doc.save(str(OUT))
json.dump({"toc": [[n, t] for n, t, _ in TOC_ROWS], "figures": FIG_LIST, "tables": TAB_LIST}, open(str(OUT) + ".index.json", "w", encoding="utf-8"), ensure_ascii=False)
print("saved", OUT, "| figures", len(FIG_LIST), "| tables", len(TAB_LIST), "| toc rows", len(TOC_ROWS), "| abstract words", len(abstract.split()))
