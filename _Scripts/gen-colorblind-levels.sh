#!/usr/bin/env bash
set -euo pipefail

# Generates a ramp of candidate additive levels on the colorblind-safe palette
# (cbBlue/cbOrange/cbPurple — see the CB_BLUE comment in ../levels.js) via solver-rs's
# `generate` binary, for COLORBLIND_LEVELS in levels.js. Same idea and same parameter ramp
# as the one used for the 30 generated Light-mode levels in LEVELS (see STATUS.md: grid size
# 4x3 up to 6x6, real pieces 2 up to 14, decoys 0 up to 2) — this is the same mixing rule
# (additive) and the same piece-density headroom (4 palette... well, 3 here), just a
# different palette, so the same ramp applies unmodified. Contrast with
# gen-paint-levels.sh's gentler ramp, which compensates for Paint mode's harder combinatorics
# at a fixed piece count (see that script's comment).
#
# See _Scripts/gen-paint-levels.sh for the full explanation of why candidates are picked by
# sorting on their *actual* computed difficulty score afterwards, not by rung order.
#
# Usage:
#   _Scripts/gen-colorblind-levels.sh [output-dir]
#
# Requires solver-rs to be built (cargo build --release) and ../levels.json to exist
# (node export-levels.js) so the generator can read the cbBlue/cbOrange/cbPurple pigment
# values.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/../solver-rs"

OUT="${1:-$SCRIPT_DIR/out/colorblind-candidates}"
mkdir -p "$OUT"

COLORS="cbBlue,cbOrange,cbPurple"

rungs=(
  "4 3 2 0"
  "4 3 2 0"
  "4 3 3 0"
  "4 3 3 0"
  "4 3 3 1"
  "4 4 3 0"
  "4 4 3 1"
  "4 4 4 0"
  "4 4 4 1"
  "4 4 4 1"
  "5 4 4 1"
  "5 4 5 0"
  "5 4 5 1"
  "5 4 5 1"
  "5 4 6 1"
  "5 5 6 1"
  "5 5 6 2"
  "5 5 7 1"
  "5 5 7 2"
  "5 5 8 1"
  "6 5 8 2"
  "6 5 9 1"
  "6 5 9 2"
  "6 5 10 2"
  "6 6 10 2"
  "6 6 11 2"
  "6 6 12 2"
  "6 6 13 2"
  "6 6 14 2"
  "6 6 14 2"
)

i=0
for rung in "${rungs[@]}"; do
  read -r cols rows pieces decoys <<< "$rung"
  i=$((i+1))
  out="$OUT/cand-$i.json"
  echo "=== candidate $i: cols=$cols rows=$rows pieces=$pieces decoys=$decoys ===" >&2
  if ./target/release/generate --cols "$cols" --rows "$rows" --pieces "$pieces" --decoys "$decoys" --colors "$COLORS" --attempts 3000 --out "$out" 2>&1 | tail -3; then
    :
  else
    echo "  (failed, skipping)" >&2
  fi
done

echo "Done. Candidates in $OUT"
