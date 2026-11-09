#!/usr/bin/env bash
# Builds deliverables/SuryaCast - Project Report.{docx,pdf} from the SRMIST template (two passes for page numbers).
# Usage: bash scripts/report/make_report.sh "<path to template.docx>"
set -euo pipefail
cd "$(dirname "$0")/../.."
TPL="$1"
WORK="${TEMP:-/tmp}/suryacast_report"; mkdir -p "$WORK" deliverables
OUT="deliverables/SuryaCast - Project Report"
w() { cygpath -w "$1" 2>/dev/null || echo "$1"; }
npx tsx scripts/report/monthly.ts "$(w "$WORK/monthly.json")"
python scripts/report/figures.py "$(w "$WORK/monthly.json")" "$(w "$WORK/fig")"
pdf() { powershell -NoProfile -ExecutionPolicy Bypass -File scripts/report/docx2pdf.ps1 -Src "$(w "$PWD/$OUT.docx")" -Dst "$(w "$PWD/$OUT.pdf")" -TimeoutSec 240; }
python scripts/report/build_report.py "$(w "$TPL")" "$(w "$WORK/fig")" "$(w "$PWD/docs/screenshots")" "$(w "$PWD/$OUT.docx")"
pdf
python scripts/report/find_pages.py "$OUT.pdf" "$OUT.docx.index.json" "$(w "$WORK/pages.json")"
python scripts/report/build_report.py "$(w "$TPL")" "$(w "$WORK/fig")" "$(w "$PWD/docs/screenshots")" "$(w "$PWD/$OUT.docx")" "$(w "$WORK/pages.json")"
pdf
rm -f "$OUT.docx.index.json"
