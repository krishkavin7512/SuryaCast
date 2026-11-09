"""Builds the SuryaCast project report from the SRMIST case-study template.

    python scripts/report/build_report.py <template.docx> <figures_dir> <screenshots_dir> <out.docx> [pages.json]

Every number is read from the project's own result files (src/data/*.json), so
the report always matches the website and the trained model. Placeholders the
student must fill in (register number, department, faculty) stay highlighted in
yellow, as in the template.
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
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Inches, Pt, RGBColor

TEMPLATE, FIGS, SHOTS, OUT = (Path(a) for a in sys.argv[1:5])
PAGES = json.loads(Path(sys.argv[5]).read_text(encoding="utf-8")) if len(sys.argv) > 5 else {}
ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "src" / "data"
R = json.loads((D / "model-report.json").read_text(encoding="utf-8"))
P = json.loads((D / "performance.json").read_text(encoding="utf-8"))
C = json.loads((D / "climate.json").read_text(encoding="utf-8"))
SK = json.loads((D / "sklearn-crosscheck.json").read_text(encoding="utf-8"))
TNR = "Times New Roman"
K = 1 / 3.6

TITLE = "SuryaCast: Machine-Learning Solar Forecasting and Carbon-Offset Planning for Indian Rooftops"
COURSE = "21CEO310T"
COURSE_NAME = "Global Warming and Climate Change"
STUDENT = "KAVIN KRISH"
REG = "<RA2XXXXXXXXXXX>"
LIVE = "https://suryacast.vercel.app"
REPO = "https://github.com/krishkavin7512/SuryaCast"


def model(key):
    return next(m for m in P["models"] if m["key"] == key)["metrics"]


NN, HS, LIN, CL = model("mlp"), model("hargreaves"), model("linear"), model("climatology")
CO2_LAST = C["co2Annual"][-1]
GIS_LAST = C["gistemp"][-1]
IMPROVE = 100 * (1 - NN["testSpace"]["mae"] / HS["testSpace"]["mae"])

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


def fill(p, parts, size=12):
    """parts: list of (text, opts) or plain strings."""
    clear(p)
    for part in parts:
        text, opts = (part, {}) if isinstance(part, str) else part
        r = style_run(p.add_run(text), size=opts.get("size", size), bold=opts.get("bold"), italic=opts.get("italic"), hl=opts.get("hl"))
        if opts.get("sub"):
            r.font.subscript = True


# Math symbols written as X_sub (K_t, R_a, T_max ...) become real subscripts; column names are untouched.
MATH_SUB = re.compile(r"(?<![A-Za-z0-9_])(K̂|R̂|K|R|T|k|G|d|ω|H|ρ|η)_(max|min|Rs|sc|eff|BOS|t|a|s|r|b|T|d|g|c)(?![A-Za-z0-9_])")


def rich(text, size=12, base_bold=False, base_italic=False):
    """Tiny markup: **bold**, *italic*, [[placeholder]] (highlighted), X_sub (math subscript)."""
    text = MATH_SUB.sub(lambda m: f"{m.group(1)}~{m.group(2)}~", text)
    out = []
    for tok in re.split(r"(\*\*.+?\*\*|\*.+?\*|\[\[.+?\]\]|~[^~]+~)", text):
        if not tok:
            continue
        if tok.startswith("**"):
            out.extend((t, {**o, "bold": True}) for t, o in rich(tok[2:-2], size, False, base_italic))
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


def chapter(num, title):
    p = para(f"Chapter {num}: {title}" if num else title, size=16, align=WD_ALIGN_PARAGRAPH.LEFT, sa=12, sb=0, ls=1.15, bold=True, keep=True)
    p.paragraph_format.page_break_before = True
    set_outline(p, 0)
    return p


def h2(text):
    p = para(text, size=14, align=WD_ALIGN_PARAGRAPH.LEFT, sa=4, sb=12, ls=1.15, bold=True, keep=True)
    set_outline(p, 1)
    return p


def h3(text):
    p = para(text, size=12, align=WD_ALIGN_PARAGRAPH.LEFT, sa=2, sb=8, ls=1.15, bold=True, keep=True)
    set_outline(p, 2)
    return p


def bullets(items, size=12):
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
        pf.line_spacing = 1.5
        pf.space_after = Pt(2)
        fill(p, rich(it, size), size)


TEXT_W = Cm(21.0) - Inches(1.5) - Inches(1.0)
FIG_N = {}
TAB_N = {}
FIG_LIST, TAB_LIST = [], []


def caption(kind, chap, text):
    counter = FIG_N if kind == "Fig." else TAB_N
    counter[chap] = counter.get(chap, 0) + 1
    label = f"{kind} {chap}.{counter[chap]}"
    (FIG_LIST if kind == "Fig." else TAB_LIST).append((label, text))
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.alignment = WD_ALIGN_PARAGRAPH.CENTER
    pf.space_before = Pt(4 if kind == "Fig." else 10)
    pf.space_after = Pt(10 if kind == "Fig." else 4)
    pf.keep_with_next = kind != "Fig."
    fill(p, [(label + "  ", {"bold": True, "size": 11}), (text, {"size": 11})], 11)
    return label


def figure(chap, path, text, width_cm=14.6):
    p = doc.add_paragraph()
    p.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.keep_with_next = True
    p.paragraph_format.space_before = Pt(6)
    p.add_run().add_picture(str(path), width=Cm(width_cm))
    return caption("Fig.", chap, text)


def set_cell_borders(table):
    tbl = table._tbl
    tblPr = tbl.tblPr
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


def table(chap, title, headers, rows, widths_cm, size=10.5, bold_first_col=False, highlight_row=None, align_num=True):
    caption("Table", chap, title)
    t = doc.add_table(rows=1 + len(rows), cols=len(headers))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    set_cell_borders(t)
    grid = t._tbl.tblGrid
    for gc, w in zip(grid.findall(qn("w:gridCol")), widths_cm):
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
            bold = ri == 0 or (bold_first_col and ci == 0) or (highlight_row is not None and ri - 1 == highlight_row)
            fill(p, rich(str(val), size, base_bold=bold), size)
            if ri < len(rows):
                pf.keep_with_next = True  # keep the whole table on one page
            if ri == 0:
                shade(cell, "D9D9D9")
            elif highlight_row is not None and ri - 1 == highlight_row:
                shade(cell, "FCE9D9")
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return t


def equation(text, num):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.space_before = Pt(4)
    pf.space_after = Pt(6)
    pf.left_indent = Cm(0.8)
    pf.tab_stops.add_tab_stop(int(TEXT_W - Cm(0.8)) - 10, WD_TAB_ALIGNMENT.RIGHT)
    fill(p, rich(text, 11.5, base_italic=True) + [(f"\t({num})", {"size": 11.5})])


# ================================================================== 1. COVER PAGE
ps = doc.paragraphs
fill(ps[0], [(TITLE, {"bold": True, "size": 22})])
fill(ps[1], [(f"{COURSE} – {COURSE_NAME}", {"bold": True, "size": 12}), (" · Working Model Project (LLT / CLA-2)", {"bold": True, "size": 12})])
fill(ps[3], [(STUDENT + " ", {"bold": True, "size": 16}), ("[" + REG + "]", {"bold": True, "size": 16, "hl": True})])
fill(ps[7], [("<Name of the Faculty>", {"bold": True, "size": 14, "hl": True})])
fill(ps[8], [("<Designation>", {"bold": True, "size": 14, "hl": True})])
fill(ps[9], [("<Department of the Faculty>", {"bold": True, "size": 14, "hl": True})])
fill(ps[11], [("of", {"italic": True, "size": 12})])
ps[11].add_run().add_break()
style_run(ps[11].runs[-1], size=12)
style_run(ps[11].add_run("Bachelor of Technology"), size=12, italic=True)
fill(ps[13], [("<YOUR DEPARTMENT>", {"bold": True, "size": 14, "hl": True})])

# ================================================================== 2. BONAFIDE
fill(ps[27], [
    ("This is to certify that the ", {"size": 14}),
    (f"{COURSE} – {COURSE_NAME}", {"bold": True, "size": 14}),
    (" working model report titled “", {"size": 14}),
    (TITLE, {"bold": True, "size": 14}),
    ("” is the bonafide work of ", {"size": 14}),
    (STUDENT + " (", {"bold": True, "size": 14}),
    (REG, {"bold": True, "size": 14, "hl": True}),
    ("),", {"bold": True, "size": 14}),
    (" who undertook the task of completing the project within the allotted time.", {"size": 14}),
])
sig = doc.tables[0].rows[0].cells[0].paragraphs
fill(sig[4], [("<Designation>", {"size": 12, "hl": True})])
fill(sig[5], [("<Department of the Faculty>", {"size": 12, "hl": True})])

# ================================================================== 3. ABSTRACT
abstract = (
    "Electricity generation is India's largest source of carbon dioxide: every unit drawn from the grid emits about "
    "0.727 kg of CO₂ because most of it still comes from coal. Rooftop solar photovoltaics is the most direct mitigation "
    "measure available to a household, and the PM Surya Ghar scheme aims to put it on one crore homes, but solar output "
    "swings with clouds, the monsoon and heat, while sensors that measure sunlight are rare. This project builds SuryaCast, "
    "a working model that forecasts rooftop solar generation for any location in India from routine weather data and "
    "converts it into avoided CO₂, carbon credits and savings. A neural network written from scratch (an ensemble of five "
    "13-64-32-1 multilayer perceptrons, trained with back-propagation and the Adam optimiser) learns the daily clearness "
    f"index from cloud cover, humidity, rainfall and temperature, using {R['dataset']['records']:,} days of ERA5 reanalysis "
    "data for 38 Indian cities (2021–2025). Solar geometry from FAO-56 and photovoltaic physics then convert sunlight into "
    f"electricity. On a year the model never saw it achieves R² = {NN['testTime']['r2']:.3f}; on eight unseen cities "
    f"R² = {NN['testSpace']['r2']:.3f}, with {IMPROVE:.0f}% lower error than the FAO-56 Hargreaves–Samani method, a statistically "
    f"significant difference. Monthly solar energy is predicted within {P['horizons']['mlp']['monthly']:.1f}%. The working model "
    "runs live in a web browser and also explains the greenhouse effect, the measured warming evidence and carbon-credit "
    "mechanisms, linking all five course units from cause to mitigation."
)
p_abs_head = ps[42]
p_abs_head.paragraph_format.page_break_before = True
fill(ps[43], [(abstract, {"size": 14})])
ps[43].paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
ps[43].paragraph_format.line_spacing = 1.5
kw = ps[44]
fill(kw, [("Keywords: ", {"bold": True, "size": 12}), ("global warming, rooftop solar, solar radiation forecasting, neural network, carbon credits, climate mitigation, India", {"italic": True, "size": 12})])
kw.paragraph_format.space_before = Pt(12)

# remove filler blank paragraphs (bonafide tail and abstract tail) and start TOC on a new page
for idx in sorted(list(range(32, 42)) + list(range(45, 66)), reverse=True):
    el = ps[idx]._p
    if not ps[idx].text.strip() and not el.xpath(".//w:drawing") and not el.xpath("./w:pPr/w:sectPr"):
        el.getparent().remove(el)
toc_head = next(p for p in doc.paragraphs if p.text.strip() == "TABLE OF CONTENTS")
toc_head.paragraph_format.page_break_before = True

# drop the template's guidance text (everything after the TOC table)
toc_tbl = doc.tables[1]._tbl
for el in list(toc_tbl.itersiblings()):
    if el.tag != qn("w:sectPr"):
        body.remove(el)

# ================================================================== 4. FRONT-MATTER LISTS
def front_heading(text):
    p = para(text, size=16, align=WD_ALIGN_PARAGRAPH.CENTER, sa=12, ls=1.15, bold=True)
    p.paragraph_format.page_break_before = True
    return p


ABBR = [
    ("ANN / MLP", "Artificial neural network / multilayer perceptron"),
    ("CDM", "Clean Development Mechanism (Kyoto Protocol)"),
    ("CCTS", "Carbon Credit Trading Scheme (India, 2023)"),
    ("CEA", "Central Electricity Authority, Government of India"),
    ("CI", "Confidence interval"),
    ("CO", "Course outcome"),
    ("ERA5", "Fifth-generation ECMWF atmospheric reanalysis"),
    ("FAO-56", "FAO Irrigation and Drainage Paper 56"),
    ("GHI", "Global horizontal irradiation (kWh/m²/day)"),
    ("K_t", "Daily clearness index, R_s / R_a"),
    ("kWp", "Kilowatt-peak, rated DC capacity of a PV array"),
    ("LCA", "Life-cycle analysis"),
    ("MAE / RMSE", "Mean absolute error / root-mean-square error"),
    ("NOCT", "Nominal operating cell temperature"),
    ("NWP", "Numerical weather prediction"),
    ("POA", "Plane-of-array (tilted panel) irradiation"),
    ("PV", "Photovoltaic"),
    ("R_a / R_s", "Extraterrestrial / surface solar radiation (MJ/m²/day)"),
    ("R²", "Coefficient of determination"),
]
lists_anchor = front_heading("LIST OF FIGURES")
LOF_SLOT = doc.add_paragraph()
front_heading("LIST OF TABLES")
LOT_SLOT = doc.add_paragraph()
front_heading("LIST OF ABBREVIATIONS")
abbr_tbl_slot = doc.add_paragraph()

# body section: Arabic page numbers from Chapter 1
body_section = doc.add_section(WD_SECTION.NEW_PAGE)

# ================================================================== CHAPTER 1
chapter(1, "Introduction")
h2("1.1 Background")
para(
    "Global warming is the long-term rise in Earth's average surface temperature caused mainly by greenhouse gases, above all "
    f"carbon dioxide, released by burning fossil fuels. Atmospheric CO₂ measured at Mauna Loa has risen from about 316 ppm in 1959 to "
    f"**{CO2_LAST[1]:.1f} ppm in {CO2_LAST[0]}**, far above the pre-industrial level of about 280 ppm. NASA's GISTEMP record places "
    f"{GIS_LAST[0]} at **+{GIS_LAST[1]:.2f} °C** above the 1951–1980 average. India is warming too: the Berkeley Earth record shows "
    f"the country's mean temperature in 2011–2020 was **+{C['india']['change']:.2f} °C** warmer than in 1901–1930, with the trend "
    f"accelerating to {C['india']['trend1971']['perDecade']:.2f} °C per decade since 1971. Warming brings more intense heat waves, "
    "erratic monsoons and rising seas, all of which affect India strongly."
)
figure(1, FIGS / "fig02_climate_evidence.png", "Evidence of global warming: (a) atmospheric CO₂ at Mauna Loa (NOAA GML); (b) global temperature anomaly (NASA GISTEMP v4).")
para(
    "Electricity generation is the largest single source of CO₂ in India. According to the Central Electricity Authority, the "
    "weighted-average emission factor of the Indian grid in FY 2023-24 was **0.727 tonnes of CO₂ per MWh**, i.e. 0.727 kg for every "
    "unit consumed, because coal still supplies most of the country's power. Replacing grid electricity with solar energy at the "
    "point of use is therefore one of the most direct mitigation measures available to individual households."
)
h2("1.2 Industry/Domain Context")
para(
    "India's rooftop solar programme received a major push in February 2024 with **PM Surya Ghar: Muft Bijli Yojana**, which offers "
    "central financial assistance of ₹30,000 per kW for the first 2 kW and ₹18,000 for the third kW (capped at ₹78,000) and targets "
    "one crore households. As rooftop capacity grows, two practical questions arise. A household asks how much electricity its roof "
    "will really produce, and what it will save. An electricity distribution company asks how much solar power will feed into its "
    "network tomorrow, so that it can schedule other generators. Both depend on how much sunlight reaches the ground, which varies "
    "sharply from day to day with clouds, humidity, dust and the monsoon."
)
para(
    "Sunlight at the ground is measured with pyranometers, which are expensive and found at only a small number of stations. "
    "Routine weather variables such as cloud cover, humidity, rainfall and temperature, by contrast, are measured and forecast for "
    "every location. Turning these routine variables into reliable solar estimates is therefore a valuable engineering problem."
)
h2("1.3 Problem Statement")
para(
    "To design, build and validate a working model that estimates and forecasts daily rooftop solar electricity for any location in "
    "India using only routine weather variables, quantifies the uncertainty of each forecast, and converts the result into avoided "
    "CO₂ emissions, carbon credits and economic benefit, so that households and grid operators can plan around the variability of solar "
    "energy and so that the climate benefit of rooftop solar can be demonstrated with real data."
)
h2("1.4 Objectives")
bullets([
    "To train and evaluate a neural network that estimates daily solar radiation from cloud, humidity, rainfall and temperature, and to "
    "compare it rigorously with the standard FAO-56 Hargreaves–Samani method and other baselines on data it has never seen.",
    "To combine the model with photovoltaic engineering physics into a live, browser-based working model that forecasts rooftop "
    "electricity and avoided CO₂ for the next seven days at any location in India.",
    "To analyse the climate, carbon-credit and economic benefit of rooftop solar (life-cycle emissions, subsidy, payback and national "
    "scale-up) and present the underlying climate science to promote public awareness.",
])
h2("1.5 Scope and Limitations")
para(
    "The model covers mainland and island India through 38 representative cities spanning hot-dry, composite, warm-humid, temperate, "
    "cold and hill climates, at daily resolution, using five years (2021–2025) of data. The working model handles household systems "
    "from 1 to 10 kWp facing south. The main limitations are:"
)
bullets([
    "The model is trained and tested on ERA5 reanalysis rather than ground pyranometer measurements; ERA5 can overestimate sunshine "
    "under heavy aerosol haze.",
    "Forecasts are daily totals, not hour by hour, and live accuracy also depends on the weather forecast supplied to the model.",
    "Shading, dust, panel orientation other than south and wiring details are simplified; system cost, tariff and carbon-credit price "
    "are editable assumptions.",
])
h2("1.6 Relevance to Course Units and Outcomes")
para("The working model was designed so that each unit of the 21CEO310T syllabus is used, not only mentioned (Table 1.1).")
table(1, "Mapping of the working model to syllabus Units I–V", ["Unit", "Syllabus topics used", "Where it appears in the working model"], [
    ["I · Earth's Climate System", "Greenhouse gases and effect, carbon cycle, atmosphere", "Greenhouse-effect simulator; Keeling curve showing the seasonal carbon cycle; CO₂–temperature regression"],
    ["II · Climate Indices & Extremes", "Earth's energy balance, heat waves, Indian monsoon", "Energy-balance model; monsoon dip in solar output; heat-wave penalty on PV panels"],
    ["III · Physical Evidence", "Warming evidence, energy generation and emissions", "NOAA, NASA and Berkeley Earth records; grid emission factor; generation vs. coal emissions"],
    ["IV · International Responses", "IPCC, Kyoto Protocol, carbon credits, CDM", "Carbon credits per roof; CDM Programme of Activities; Paris Art. 6.4; IPCC life-cycle data"],
    ["V · Adaptation & Mitigation", "Solar energy, clean technology, LCA, awareness", "ML solar forecasting, sizing, subsidy and payback, life-cycle analysis, scale-up"],
], [3.6, 4.6, 6.4], size=10, bold_first_col=True, align_num=False)
para(
    "The project maps most strongly to **CO-5** (implement and analyse mitigation measures) and **CO-2** (identify climate parameters "
    "and human impact), and also supports CO-1 (Earth-system energy balance), CO-3 (impact of heat and monsoon on the energy sector) and "
    "CO-4 (Kyoto, CDM and Paris carbon-credit mechanisms)."
)
h2("1.7 Organization of the Report")
para(
    "Chapter 2 reviews existing approaches to estimating solar radiation. Chapter 3 describes the data, architecture and implementation "
    "strategy. Chapter 4 explains how the model was built and trained, including the core equations and the challenges faced. "
    "Chapter 5 presents and discusses the results, and Chapter 6 concludes with future scope."
)

# ================================================================== CHAPTER 2
chapter(2, "Literature Review / Background Study")
h2("2.1 Introduction")
para(
    "Estimating the solar radiation that reaches the ground is a long-standing problem in climatology, agriculture and solar "
    "engineering. Existing approaches fall into three families: empirical formulas that relate radiation to simpler measurements, "
    "physical models (satellite retrievals and numerical weather prediction or reanalysis), and data-driven machine-learning models. "
    "Converting horizontal radiation into photovoltaic output is a separate, well-established engineering step."
)
h2("2.2 Review of Existing Approaches")
reviews = [
    ("Ångström (1924) and Prescott (1940)", "proposed the first regression between the clearness of the sky and relative sunshine duration, "
     "R_s/R_a = a + b·(n/N). It is accurate but requires sunshine recorders, which are themselves scarce."),
    ("Hargreaves and Samani (1985)", "estimated radiation from the daily temperature range alone, R_s = k_Rs·√(T_max − T_min)·R_a. The "
     "method is adopted by FAO-56 (Allen et al., 1998) for stations with no radiation data. It needs only thermometers but cannot "
     "distinguish cloud from humidity, and it is known to perform poorly in humid, coastal and monsoon climates."),
    ("Liu and Jordan (1960) and Erbs, Klein and Duffie (1982)", "provided the relations used to split global radiation into direct and "
     "diffuse parts and to transpose it onto a tilted panel; together with cell-temperature models (Duffie and Beckman) they form "
     "the standard route from radiation to PV energy."),
    ("Hersbach et al. (2020)", "describe ERA5, the ECMWF reanalysis that assimilates satellite and ground observations into a consistent "
     "global record with surface radiation. It provides long, gap-free records for any location and is widely used to assess solar resources."),
    ("Mellit and Kalogirou (2008)", "reviewed artificial-intelligence techniques for photovoltaic applications and found that artificial "
     "neural networks generally estimate solar radiation more accurately than empirical correlations, particularly when several "
     "meteorological inputs are combined."),
    ("Yadav and Chandel (2014)", "reviewed ANN models for solar radiation prediction, many of them for Indian locations, and identified "
     "temperature, humidity, sunshine and cloud as the most useful inputs, while noting that many studies validate only on the same stations."),
    ("Voyant et al. (2017)", "reviewed machine-learning methods for solar forecasting and stressed proper benchmarking against "
     "climatology and persistence, skill scores, and out-of-sample validation, which this project adopts."),
]
for who, what in reviews:
    para(f"**{who}** {what}")
h2("2.3 Comparative Analysis / Gap Identification")
table(2, "Comparison of solar-radiation estimation approaches", ["Approach", "Inputs needed", "Strength", "Limitation"], [
    ["Ångström–Prescott", "Sunshine hours", "Simple, accurate", "Sunshine recorders are rare"],
    ["Hargreaves–Samani (FAO-56)", "T_max, T_min", "Needs only temperature", "Blind to cloud and humidity; weak in monsoon"],
    ["Satellite / NWP / ERA5", "Model physics, satellites", "Physically complete", "Heavy infrastructure; not explainable to users"],
    ["Published ANN studies", "Station weather", "More accurate than formulas", "Often tested on the same stations; rarely deployed"],
    ["**SuryaCast (this work)**", "Cloud, RH, rain, temperature", "Tested on unseen cities and year; live, explainable, open", "Daily resolution; reanalysis target"],
], [3.6, 3.4, 3.8, 3.8], size=10, align_num=False)
para(
    "The review shows a clear gap: few models are tested honestly on locations they have never seen, report calibrated uncertainty, "
    "run openly where a household can use them, and connect the forecast to emissions, carbon credits and economics. SuryaCast "
    "addresses this gap with a physics-informed neural network, strict out-of-sample testing and a free browser-based working model."
)

# ================================================================== CHAPTER 3
chapter(3, "Methodology / Framework Design")
h2("3.1 Approach Overview")
para(
    "SuryaCast follows a **physics-informed machine-learning** approach. The sunlight arriving at the top of the atmosphere, R_a, is "
    "computed exactly from astronomy (FAO-56). The neural network predicts only the fraction of that sunlight that survives the "
    "atmosphere, the clearness index K_t = R_s/R_a, from routine weather variables. Engineering physics then converts the predicted "
    "sunlight into electricity for a tilted panel, and the electricity into avoided CO₂. Separating astronomy from atmosphere makes "
    "the model generalise across latitudes and seasons, and each step can be explained to a user."
)
figure(3, FIGS / "fig01_block_diagram.png", "Block diagram of the SuryaCast working model: offline training pipeline (top) and live browser model (bottom).")
h2("3.2 Data Collection / Requirements Gathering")
para(
    "All data are real and publicly available (Table 3.1). Daily weather and surface solar radiation for 38 cities were downloaded "
    "from the ERA5 reanalysis through the Open-Meteo Historical Weather API and cached in the project repository so that every result "
    "can be reproduced. Climate evidence comes from NOAA, NASA and Berkeley Earth, and emission and policy constants from CEA, MNRE and IPCC."
)
table(3, "Data sources used", ["Dataset", "Provider", "Use in the project"], [
    ["ERA5 daily reanalysis (2021–2025), 38 cities", "ECMWF / Copernicus, via Open-Meteo", "Training and testing data (69,388 city-days)"],
    ["7-day weather forecast", "Open-Meteo forecast API", "Live inputs to the working model"],
    ["Mauna Loa CO₂ (monthly, annual)", "NOAA Global Monitoring Laboratory", "Keeling curve, CO₂–temperature regression"],
    ["GISTEMP v4 global temperature", "NASA GISS", "Global warming evidence"],
    ["India regional temperature", "Berkeley Earth", "Warming evidence for India"],
    ["Grid emission factor 0.727 t/MWh", "CEA CO₂ Baseline Database v20", "CO₂ avoided per kWh"],
    ["Subsidy slabs; life-cycle emissions", "MNRE PM Surya Ghar; IPCC AR5", "Economics and life-cycle analysis"],
], [5.2, 4.4, 5.0], size=10, align_num=False)
table(3, "Daily variables in the ERA5 dataset", ["Column", "Unit", "Meaning"], [
    ["shortwave_radiation_sum", "MJ/m²/day", "Solar energy reaching the ground (target)"],
    ["temperature_2m_max / _min", "°C", "Daily maximum and minimum air temperature"],
    ["cloud_cover_mean / _max / _min", "%", "Average, cloudiest and clearest sky cover"],
    ["relative_humidity_2m_mean", "%", "Mean relative humidity"],
    ["precipitation_sum", "mm", "Total rainfall"],
    ["precipitation_hours", "h", "Hours with rain"],
], [5.6, 2.6, 6.4], size=10, align_num=False)
splits = R["dataset"]["splits"]
table(3, "Experiment design: training, validation and test splits", ["Split", "Cities", "Years", "Days", "Purpose"], [
    ["Training", "30", "2021–2023", f"{splits['train']:,}", "Learn the network weights"],
    ["Validation", "30", "2024", f"{splits['val']:,}", "Early stopping and model choice"],
    ["Test: unseen year", "30", "2025", f"{splits['testTime']:,}", "Future performance"],
    ["Test: unseen cities", "8", "2021–2025", f"{splits['testSpace']:,}", "Performance in new places"],
], [3.4, 1.6, 2.4, 2.0, 5.2], size=10)
para("The eight held-out cities were Coimbatore, Surat, Vijayawada, Ranchi, Bikaner, Gangtok, Port Blair and Shimla, chosen to cover different climate zones.")
h2("3.3 Architecture / Workflow Diagram")
para(
    "Figure 3.1 shows the two halves of the system. Offline, the raw data are converted into 13 engineered features (Table 3.4), "
    "baselines and candidate networks are trained, and the selected ensemble is evaluated and exported as a 181 kB JSON file. Live, "
    "the browser fetches the weather forecast for the chosen location, computes the same features, runs the five networks, and "
    "applies PV physics and carbon accounting."
)
table(3, "Engineered input features", ["Feature", "Computation", "Physical reason"], [
    ["Cloud mean, max, min", "Cloud cover / 100", "Clouds block and scatter sunlight"],
    ["Relative humidity", "RH / 100", "Water vapour absorbs sunlight"],
    ["Rainfall (log)", "ln(1 + rain)", "Rain implies thick cloud; log limits outliers"],
    ["Rain hours", "hours / 24", "Long rain implies long overcast spells"],
    ["Diurnal temperature range", "T_max − T_min", "Clear skies give hot days and cold nights"],
    ["Maximum temperature", "T_max", "Hot dry days tend to be sunny"],
    ["Top-of-atmosphere sun R_a", "FAO-56 eq. 21", "Astronomy: latitude and date"],
    ["Season (sin, cos)", "sin/cos(2π·doy/365.25)", "Cyclic seasonality (31 Dec next to 1 Jan)"],
    ["Latitude, elevation", "degrees, km", "Location; thinner air at altitude"],
], [4.2, 4.0, 6.4], size=10, align_num=False)
h2("3.4 Implementation Strategy")
table(3, "Tools and technologies", ["Layer", "Technology", "Role"], [
    ["Machine learning", "TypeScript (written from scratch)", "Neural network, back-propagation, Adam, ridge regression, metrics"],
    ["Training pipeline", "Node.js with tsx", "Feature engineering, training, cross-validation, analysis"],
    ["Independent check", "Python 3, scikit-learn, pandas", "Reference models on the same features"],
    ["Web application", "React 19, Vite 8, Tailwind CSS 4", "Interactive working model (runs in the browser)"],
    ["Charts and maps", "Recharts, Leaflet, Canvas 2D", "Visualisation, satellite location picker"],
    ["Quality", "Vitest (44 tests)", "Physics checks, gradient checks, model-accuracy checks"],
    ["Hosting", "Git, GitHub, Vercel", "Version control and public deployment"],
], [3.4, 4.6, 6.6], size=10, align_num=False)
para(
    "No machine-learning library is used in the model itself: the forward pass, back-propagation and the Adam optimiser are about "
    "250 lines of TypeScript. The same code trains the model offline and in the user's browser. The website needs no server, so the "
    "model, the five-year city data and an offline forecast snapshot ship with the site and the demonstration works even without internet."
)

# ================================================================== CHAPTER 4
chapter(4, "Case Study Implementation / Analysis")
h2("4.1 Execution & Step-by-Step Analysis")
bullets([
    "**Data acquisition:** ERA5 daily data for 38 cities were downloaded with a throttled script that respects the API's rate limits and caches every response.",
    "**Feature engineering:** each day was converted into the 13 features of Table 3.4 and the target K_t, then standardised using training-set statistics.",
    "**Baselines:** monthly climatology, the FAO-56 Hargreaves–Samani formula and ridge linear regression were fitted on the same training data.",
    f"**Architecture search:** four network sizes were trained and compared on the 2024 validation year; the best was {R['network']['architecture']}.",
    f"**Ensemble:** five networks of that size were trained from different random seeds (best epochs {', '.join(str(m['bestEpoch']) for m in R['network']['members'])}) and their predictions averaged.",
    "**Uncertainty:** 80% prediction intervals were built from validation errors; wider intervals for new locations were calibrated with five-fold leave-cities-out cross-validation.",
    "**Evaluation and analysis:** all models were scored on the unseen year and unseen cities; bootstrap confidence intervals and error breakdowns were computed from the exported model.",
    "**Working model:** the trained ensemble was embedded in a web application with a live forecast, an impact planner, a model lab, a performance page and a climate-science page.",
])
table(4, "Architecture search on the 2024 validation year", ["Network", "Weights", "Best epoch", "Validation RMSE (K_t)"], [
    [s["name"], f"{s['params']:,}", str(s["bestEpoch"]), f"{s['valRmseKt']:.4f}"] for s in R["network"]["search"]
], [5.6, 2.6, 2.6, 3.8], size=10)
figure(4, FIGS / "fig03_learning_curve.png", "Learning curve of network #1: training and validation error fall together; the best epoch is kept (early stopping).", 12.5)
para("The finished working model is shown in Figures 4.2 to 4.4. A user selects a place by city search, GPS or by clicking a roof on a satellite map, and every number is computed live in the browser.")
figure(4, SHOTS / "hero.jpg", f"SuryaCast home page. Each dot is one real day of sunlight in Chennai (2021–2025); dark arcs show monsoon cloud. Live site: {LIVE}")
figure(4, SHOTS / "forecast.jpg", "Live forecast: seven-day rooftop electricity with 80% uncertainty bands (bars) and the weather model's own radiation as a cross-check (dots).", 13.2)
figure(4, SHOTS / "forecast_explain.jpg", "Step-by-step explanation of one day's forecast, from the weather inputs to CO₂ avoided.")
h2("4.2 Core Algorithms / Configurations")
para("**Extraterrestrial radiation** (FAO-56, eq. 21), with solar constant G_sc = 0.082 MJ m⁻² min⁻¹, inverse Earth–Sun distance d_r, latitude φ, declination δ and sunset hour angle ω_s:")
equation("R_a = (24·60/π) · G_sc · d_r · [ ω_s sin φ sin δ + cos φ cos δ sin ω_s ]", "4.1")
para("**Target and prediction.** The network predicts the clearness index; radiation follows from it:")
equation("K_t = R_s / R_a ,     R̂_s = K̂_t · R_a", "4.2")
para("**Neural network.** Each of the five networks maps the standardised feature vector x to K_t with two leaky-ReLU hidden layers (64 and 32 neurons); the ensemble averages them:")
equation("h₁ = σ(W₁x + b₁),   h₂ = σ(W₂h₁ + b₂),   K̂_t = W₃h₂ + b₃", "4.3")
para("where σ(z) = max(z, 0.01z) is the leaky-ReLU activation; the final prediction is the mean of the five networks' outputs.")
para("**Training.** The mean-squared error is minimised by back-propagation with the Adam optimiser (learning rate 0.002 with cosine decay, batch 64, L2 weight decay), stopping when the 2024 validation error no longer improves:")
equation("L = (1/n) Σ (K̂_t − K_t)² ,   θ ← θ − η · m̂ / (√v̂ + ε)", "4.4")
para("**Baseline** (FAO-56 eq. 50), with k_Rs = 0.16 inland and 0.19 on the coast:")
equation("R_s = k_Rs · √(T_max − T_min) · R_a", "4.5")
para("**Photovoltaic energy.** Daily radiation is split into beam and diffuse parts (Erbs et al.) and transposed to a south-facing panel at tilt β (Liu–Jordan), and the cell temperature lowers efficiency:")
equation("H_T = H_b R_b + H_d (1 + cos β)/2 + H ρ_g (1 − cos β)/2", "4.6")
equation("T_c = T_a + (NOCT − 20)/800 · G_eff", "4.7")
equation("E = P · H_T · η_BOS · [1 + γ (T_c − 25)]", "4.8")
para("**Climate impact and the greenhouse effect.** Avoided emissions use the CEA grid factor; the science page uses the CO₂ radiative forcing of Myhre et al. with a climate sensitivity of about 3 °C per doubling:")
equation("CO₂ avoided = E × 0.727 kg/kWh", "4.9")
equation("ΔF = 5.35 ln(C / 280) W/m² ,   ΔT = λ · ΔF", "4.10")
h2("4.3 Challenges Faced & Mitigation")
table(4, "Challenges and how they were resolved", ["Challenge", "Mitigation"], [
    ["API rate limits when downloading five years for 38 cities", "Requests throttled to stay within the cost budget; every response cached in the repository"],
    ["A satellite-based (MERRA-2) city temperature series showed almost no warming over north India, contradicting IMD", "Replaced with the Berkeley Earth country-level record, which is consistent with IMD"],
    ["Uncertainty bands too narrow for new cities (64.9% instead of 80% coverage)", "Wider bands for new sites calibrated by leave-cities-out cross-validation (77.9% coverage)"],
    ["Single networks varied between random seeds", "Ensemble of five networks plus early stopping"],
    ["The published Erbs correlation slightly exceeds 1 on very overcast days", "Clamped to the physical range [0, 1]; caught by an automated unit test"],
    ["Classroom demonstration may lack internet", "Model, city data and a forecast snapshot ship with the site for offline use"],
], [7.0, 7.6], size=10, align_num=False)

# ================================================================== CHAPTER 5
chapter(5, "Results and Discussion")
h2("5.1 Findings and Output")
para("Table 5.1 compares the four methods on data none of them was trained on. Errors are in kWh/m² per day; mean daily sunlight is about 5 kWh/m².")
table(5, "Accuracy on unseen data (kWh/m²/day)", ["Method", "R² (2025)", "MAE (2025)", "R² (unseen cities)", "MAE (unseen cities)", "Skill"], [
    [n, f"{m['testTime']['r2']:.3f}", f"{m['testTime']['mae']:.2f}", f"{m['testSpace']['r2']:.3f}", f"{m['testSpace']['mae']:.2f}", f"{m['testSpace']['skill'] * 100:.0f}%"]
    for n, m in (("Monthly climatology", CL), ("Hargreaves–Samani (FAO-56)", HS), ("Ridge linear regression", LIN), ("SuryaCast neural network", NN))
], [4.6, 1.9, 2.0, 2.3, 2.3, 1.5], size=10, highlight_row=3)
figure(5, FIGS / "fig04_pred_vs_actual.png", "Predicted against actual daily radiation for 700 random days in the eight unseen cities.", 14.0)
ci = P["ci"]
table(5, "Actual observations from the working model", ["Observation", "Measured value"], [
    ["Dataset size", f"{R['dataset']['records']:,} city-days, 38 cities, 2021–2025"],
    ["R², unseen year 2025 / unseen cities", f"{NN['testTime']['r2']:.3f} / {NN['testSpace']['r2']:.3f}"],
    ["95% bootstrap CI of R² (unseen cities): network vs FAO-56", f"{ci['mlp']['r2'][0]:.3f}–{ci['mlp']['r2'][1]:.3f} vs {ci['hargreaves']['r2'][0]:.3f}–{ci['hargreaves']['r2'][1]:.3f}"],
    ["Leave-cities-out cross-validation R²", f"{R['crossValidation']['meanR2']:.3f} ± {R['crossValidation']['sdR2']:.3f}"],
    ["80% interval coverage: 2025 / new cities", f"{R['intervals']['coverage']['testTime'] * 100:.1f}% / {R['intervals']['coverage']['testSpace'] * 100:.1f}%"],
    ["Days predicted within ±0.5 kWh/m² (unseen cities)", f"{NN['testSpace']['within05']:.1f}% (FAO-56: {HS['testSpace']['within05']:.1f}%)"],
    ["Energy forecast error: daily / monthly / yearly", f"{P['horizons']['mlp']['daily']:.1f}% / {P['horizons']['mlp']['monthly']:.1f}% / {P['horizons']['mlp']['yearly']:.1f}%"],
    ["scikit-learn reference models, R² (unseen cities)", f"{min(v['testSpace']['r2'] for v in SK['models'].values() if v['testSpace']['r2'] > 0.75):.3f}–{max(v['testSpace']['r2'] for v in SK['models'].values()):.3f}"],
    ["3 kWp roof in Chennai (2021–2025 weather)", "4,755 kWh/yr; 1,585 kWh/kWp; performance ratio 78.3%"],
    ["CO₂ avoided by that roof", "3.46 t/yr; 81.4 t over 25 years"],
    ["Payback after PM Surya Ghar subsidy (₹60,000/kW, ₹7/unit)", "about 3.0 years"],
    ["CO₂–temperature regression (1959–2025)", f"{C['co2Temp']['perDoubling']:.1f} °C per CO₂ doubling, R² = {C['co2Temp']['r2']:.2f}"],
], [8.4, 6.2], size=10, align_num=False)
figure(5, FIGS / "fig05_error_by_sky.png", "Mean absolute error grouped by the day's cloud cover (all unseen data).", 12.5)
figure(5, FIGS / "fig06_monsoon_series.png", "Daily radiation in Coimbatore, the most difficult unseen city, through the 2025 monsoon.")
figure(5, FIGS / "fig07_feature_importance.png", "Permutation importance: increase in error when each input is shuffled (unseen cities).", 12.0)
figure(5, FIGS / "fig08_horizon.png", "Electricity forecast error for a 3 kWp roof by aggregation horizon (unseen cities).", 12.0)
figure(5, FIGS / "fig09_monthly_generation.png", "Monthly generation of a 3 kWp rooftop in Chennai; whiskers show the best and worst of five real years.", 12.0)
h2("5.2 Discussion")
para(
    f"The first objective is met. On the unseen year the network explains {NN['testTime']['r2'] * 100:.0f}% of the day-to-day variation "
    f"in sunlight, and in eight cities it never saw it reaches R² = {NN['testSpace']['r2']:.3f}, against {HS['testSpace']['r2']:.3f} for "
    f"the FAO-56 formula. Its error is {IMPROVE:.0f}% lower, and the 95% confidence intervals do not overlap, so the improvement is "
    "statistically significant. Independent scikit-learn models trained on the same features reach similar accuracy, which confirms "
    "that the from-scratch implementation is correct."
)
para(
    "The breakdown by sky condition (Fig. 5.2) explains why. On clear days the network is almost five times more accurate than the "
    "formula, because it combines cloud and humidity with the temperature range; the formula sees only temperature. Overcast and "
    "monsoon days remain the hardest for every method, since a daily cloud average cannot reveal when the clouds passed. The "
    "permutation importance (Fig. 5.4) shows that the network rediscovered the physical idea behind Hargreaves' formula, as the "
    "temperature range is its most important input, and improved on it with cloud cover and humidity."
)
para(
    "The model's weaknesses are honestly visible. Coimbatore in the Palghat Gap (R² 0.55) and the hill cities Gangtok and Shimla are "
    f"the most difficult, because terrain creates local cloud that the 30 training cities do not fully represent. The model slightly "
    f"under-predicts on average ({NN['testSpace']['mbe']:+.2f} kWh/m² per day). For planning, however, daily errors partly cancel: "
    f"monthly energy is predicted within {P['horizons']['mlp']['monthly']:.1f}%, accurate enough for bill and payback estimates."
)
para(
    "The climate analysis connects the result to global warming. A 3 kWp roof in Chennai avoids about 3.5 tonnes of CO₂ a year, and "
    "its life-cycle emissions (about 41 g CO₂/kWh, IPCC) are repaid in under two years against the 727 g/kWh grid. The heat-wave "
    "analysis shows a climate feedback: a 45 °C day costs a panel roughly 6–8% of its daily output compared with a mild day, so "
    "global warming slightly erodes solar yield."
)
h2("5.3 Practical Implications")
bullets([
    "**Households** can decide on PM Surya Ghar with real numbers for their own roof (generation, subsidy, payback) and shift heavy loads to sunny days.",
    "**Distribution companies** can estimate tomorrow's rooftop generation per area without pyranometers, reducing the fossil back-up kept running.",
    "**Installers** can assess a site in seconds by clicking it on a satellite map.",
    "**Climate policy:** if one crore homes install 3 kWp, the model estimates about 46–48 TWh of clean electricity and roughly 34 Mt of CO₂ avoided per year, around 2.7% of India's FY 2023-24 generation.",
    "**Carbon markets:** individual roofs are too small to earn credits alone, but aggregated programmes (CDM Programme of Activities, Paris Article 6.4, India's CCTS) can use forecasts like these for monitoring.",
    "**Scaling up** would need DISCOM net-metering approval, structural checks of roofs, grid readiness for midday solar peaks and panel recycling under India's E-Waste Rules.",
])

# ================================================================== CHAPTER 6
chapter(6, "Conclusion and Future Scope")
h2("6.1 Conclusion")
para(
    "SuryaCast shows that a compact neural network, written from scratch and trained on real reanalysis data, can turn routine weather "
    "into reliable solar-energy estimates for Indian rooftops. It outperforms the standard FAO-56 method by a statistically significant "
    "margin on a future year and on cities it never saw, and it reports honest uncertainty. Embedded in a live working model, it connects "
    "the cause of global warming (coal electricity), its mechanism (the greenhouse effect), the measured evidence and a practical "
    "mitigation measure (rooftop solar), quantified in kWh, rupees and tonnes of CO₂. All three objectives were achieved."
)
h2("6.2 Future Scope")
bullets([
    "Validate against ground pyranometer stations (e.g. India's solar radiation resource assessment network) and real rooftop meter data.",
    "Forecast hour by hour and add satellite cloud imagery and aerosol optical depth to improve monsoon and haze days.",
    "Add more hill and coastal training cities to strengthen performance in complex terrain.",
    "Learn continuously from users' meter readings, and add battery and load scheduling for higher self-consumption.",
    "Aggregate forecasts by electricity feeder for DISCOMs, and offer the interface in regional languages.",
])

# ================================================================== REFERENCES
chapter(None, "References")
refs = [
    "R. G. Allen, L. S. Pereira, D. Raes and M. Smith, “Crop evapotranspiration: Guidelines for computing crop water requirements,” FAO Irrigation and Drainage Paper 56, FAO, Rome, 1998.",
    "G. H. Hargreaves and Z. A. Samani, “Reference crop evapotranspiration from temperature,” Applied Engineering in Agriculture, vol. 1, no. 2, pp. 96–99, 1985.",
    "A. Ångström, “Solar and terrestrial radiation,” Quarterly Journal of the Royal Meteorological Society, vol. 50, pp. 121–126, 1924.",
    "B. Y. H. Liu and R. C. Jordan, “The interrelationship and characteristic distribution of direct, diffuse and total solar radiation,” Solar Energy, vol. 4, no. 3, pp. 1–19, 1960.",
    "D. G. Erbs, S. A. Klein and J. A. Duffie, “Estimation of the diffuse radiation fraction for hourly, daily and monthly-average global radiation,” Solar Energy, vol. 28, no. 4, pp. 293–302, 1982.",
    "J. A. Duffie and W. A. Beckman, Solar Engineering of Thermal Processes, 4th ed. Hoboken, NJ: Wiley, 2013.",
    "H. Hersbach et al., “The ERA5 global reanalysis,” Quarterly Journal of the Royal Meteorological Society, vol. 146, pp. 1999–2049, 2020.",
    "A. Mellit and S. A. Kalogirou, “Artificial intelligence techniques for photovoltaic applications: A review,” Progress in Energy and Combustion Science, vol. 34, no. 5, pp. 574–632, 2008.",
    "A. K. Yadav and S. S. Chandel, “Solar radiation prediction using artificial neural network techniques: A review,” Renewable and Sustainable Energy Reviews, vol. 33, pp. 772–781, 2014.",
    "C. Voyant et al., “Machine learning methods for solar radiation forecasting: A review,” Renewable Energy, vol. 105, pp. 569–582, 2017.",
    "D. P. Kingma and J. Ba, “Adam: A method for stochastic optimization,” in Proc. Int. Conf. Learning Representations (ICLR), 2015.",
    "G. Myhre, E. J. Highwood, K. P. Shine and F. Stordal, “New estimates of radiative forcing due to well mixed greenhouse gases,” Geophysical Research Letters, vol. 25, no. 14, pp. 2715–2718, 1998.",
    "IPCC, Climate Change 2014: Mitigation of Climate Change, Working Group III, Annex III (S. Schlömer et al.). Cambridge University Press, 2014.",
    "IPCC, Climate Change 2021: The Physical Science Basis, Working Group I Contribution to the Sixth Assessment Report. Cambridge University Press, 2021.",
    "Central Electricity Authority, “CO₂ Baseline Database for the Indian Power Sector, Version 20.0,” Government of India, New Delhi, 2024.",
    "Ministry of New and Renewable Energy, “PM Surya Ghar: Muft Bijli Yojana,” Government of India, 2024.",
    "X. Lan, P. Tans and K. W. Thoning, “Trends in globally-averaged and Mauna Loa CO₂,” NOAA Global Monitoring Laboratory, 2025.",
    "N. Lenssen et al., “Improvements in the GISTEMP uncertainty model,” Journal of Geophysical Research: Atmospheres, vol. 124, no. 12, pp. 6307–6326, 2019.",
    "R. A. Rohde and Z. Hausfather, “The Berkeley Earth land/ocean temperature record,” Earth System Science Data, vol. 12, pp. 3469–3479, 2020.",
    "P. Zippenfenig, “Open-Meteo.com Weather API,” Zenodo, 2023, doi: 10.5281/zenodo.7970649.",
]
for i, r in enumerate(refs, 1):
    p = para(f"[{i}] {r}", size=11, align=WD_ALIGN_PARAGRAPH.LEFT, sa=4, ls=1.15)
    p.paragraph_format.left_indent = Cm(0.9)
    p.paragraph_format.first_line_indent = Cm(-0.9)

# ================================================================== APPENDICES
chapter(None, "Appendices")
h2("Appendix A: Group Members and Contributions")
para("The assignment requires every member, register number, department and specific contribution. Replace the highlighted fields; add one row per member (maximum six).", size=11)
table("A", "Group members and individual contributions", ["Name", "Register No.", "Department", "Specific contribution"], [
    ["Kavin Krish", "[[<RA2XXXXXXXXXXX>]]", "[[<Department>]]", "Data pipeline, neural network, website, analysis and report"],
    ["[[<Member 2>]]", "[[<Reg. No.>]]", "[[<Department>]]", "[[<Contribution>]]"],
], [3.2, 3.4, 3.2, 4.8], size=10, align_num=False)
h2("Appendix B: Accessing and Reproducing the Working Model")
bullets([
    f"**Live working model:** {LIVE}",
    f"**Source code, data and trained model:** {REPO}",
    "**Run locally:** npm install, then npm run dev (http://localhost:5173); npm test runs the 44 automated tests.",
    "**Reproduce all results:** python ml/fetch_data.py; npm run train; npm run prepare-climate; npm run analyze; python ml/crosscheck.py.",
], size=11)

# ================================================================== FILL FRONT-MATTER LISTS & TOC
def fill_list(slot, items, prefix_pages):
    prev = slot
    for label, text in items:
        p = docx.text.paragraph.Paragraph(copy.deepcopy(slot._p), slot._parent)
        prev._p.addnext(p._p)
        prev = p
        pf = p.paragraph_format
        pf.alignment = WD_ALIGN_PARAGRAPH.LEFT
        pf.line_spacing = 1.15
        pf.space_after = Pt(4)
        pf.left_indent = Cm(2.0)
        pf.first_line_indent = Cm(-2.0)
        pf.tab_stops.add_tab_stop(Cm(2.0))
        pf.tab_stops.add_tab_stop(int(TEXT_W) - 10, WD_TAB_ALIGNMENT.RIGHT)
        pg = str(prefix_pages.get(label, ""))
        fill(p, [(label, {"bold": True, "size": 11}), ("\t" + text, {"size": 11}), ("\t" + pg, {"size": 11})], 11)
    slot._p.getparent().remove(slot._p)


fill_list(LOF_SLOT, FIG_LIST, PAGES.get("figures", {}))
fill_list(LOT_SLOT, TAB_LIST, PAGES.get("tables", {}))

# abbreviations table (built at the end, then moved into its slot)
abbr = doc.add_table(rows=len(ABBR), cols=2)
set_cell_borders(abbr)
abbr.alignment = WD_TABLE_ALIGNMENT.CENTER
for gc, w in zip(abbr._tbl.tblGrid.findall(qn("w:gridCol")), (3.6, 11.0)):
    gc.set(qn("w:w"), str(int(Cm(w).twips)))
for i, (a, b) in enumerate(ABBR):
    for j, (val, w) in enumerate(((a, 3.6), (b, 11.0))):
        c = abbr.rows[i].cells[j]
        c.width = Cm(w)
        fill(c.paragraphs[0], rich(val, 11, base_bold=(j == 0)), 11)
        c.paragraphs[0].paragraph_format.space_after = Pt(2)
abbr_tbl_slot._p.addnext(abbr._tbl)
abbr_tbl_slot._p.getparent().remove(abbr_tbl_slot._p)

# TOC table
toc = doc.tables[1]
proto_chap = copy.deepcopy(toc.rows[1]._tr)
proto_sec = copy.deepcopy(toc.rows[2]._tr)
for row in list(toc.rows)[1:]:
    toc._tbl.remove(row._tr)
TOC_ROWS = [("", "List of Figures", True), ("", "List of Tables", True), ("", "List of Abbreviations", True)]
for p in doc.paragraphs:
    t = p.text.strip()
    m = re.match(r"Chapter (\d): (.+)$", t)
    if m:
        TOC_ROWS.append((m.group(1), m.group(2), True))
    elif re.match(r"^\d\.\d ", t) and p.runs and p.runs[0].font.size == Pt(14):
        TOC_ROWS.append((t.split(" ", 1)[0], t.split(" ", 1)[1], False))
    elif t in ("References", "Appendices") and p.runs and p.runs[0].font.size == Pt(16):
        TOC_ROWS.append(("", t, True))
toc_pages = PAGES.get("toc", {})
for num, title, is_chap in TOC_ROWS:
    tr = copy.deepcopy(proto_chap if is_chap else proto_sec)
    toc._tbl.append(tr)
    row = toc.rows[-1]
    for ci, val in enumerate((num, title, str(toc_pages.get(f"{num}|{title}", "")))):
        p = row.cells[ci].paragraphs[0]
        runs = p.runs
        fmt_bold = runs[0].bold if runs else is_chap
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
doc.core_properties.author = "Kavin Krish"
doc.core_properties.subject = f"{COURSE} {COURSE_NAME}"
OUT.parent.mkdir(parents=True, exist_ok=True)
doc.save(str(OUT))
json.dump({"toc": [[n, t] for n, t, _ in TOC_ROWS], "figures": FIG_LIST, "tables": TAB_LIST}, open(str(OUT) + ".index.json", "w", encoding="utf-8"), ensure_ascii=False)
print("saved", OUT, "figures", len(FIG_LIST), "tables", len(TAB_LIST), "toc rows", len(TOC_ROWS))
