#!/usr/bin/env bash
# Captures README / report screenshots of the production build in capture mode.
# Usage: npm run build && npx vite preview --port 4173 &  then  bash scripts/screenshots.sh
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="docs/screenshots"
mkdir -p "$OUT"
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
PROFILE="${TEMP:-/tmp}/suryacast_edge_profile"
BASE="${BASE:-http://localhost:4173}"

shot() { # name WxH path
  "$EDGE" --headless=new --disable-gpu --hide-scrollbars --no-first-run --mute-audio \
    --user-data-dir="$(cygpath -w "$PROFILE")" --window-size="$2" --virtual-time-budget=15000 \
    --screenshot="$(cygpath -w "$PWD/$OUT/$1.png")" "$BASE$3" >/dev/null 2>&1 || true
  echo "$1: $(stat -c %s "$OUT/$1.png" 2>/dev/null || echo missing) bytes"
}

shot hero 1440,900 "/?capture"
shot home_full 1440,4200 "/?capture"
shot forecast 1440,3000 "/forecast?capture"
shot planner 1440,3600 "/planner?capture"
shot model_lab 1440,6000 "/model?capture"
shot performance 1440,4600 "/performance?capture"
shot science 1440,3400 "/science?capture"
shot project 1440,4200 "/project?capture"
