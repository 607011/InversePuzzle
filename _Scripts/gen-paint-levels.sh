#!/usr/bin/env bash
set -euo pipefail

# Generates a ramp of candidate Paint-mode (subtractive) levels via solver-rs's `generate`
# binary, across gradually increasing grid size / piece count / decoy count. Each candidate
# is validated (exactly one solution) and difficulty-scored by the generator itself; this
# script's job is only to sweep the parameter space, not to pick a final level set.
#
# The actual level set is chosen afterwards by SORTING every candidate by its *actual*
# computed difficulty score (see solver-rs/src/difficulty.rs) and picking a slice with a
# monotonic ramp — raw generation parameters don't correlate cleanly with score, so trusting
# parameter order alone would not guarantee the level set gets harder level over level. This
# is the same methodology used to build the 30 generated additive (Light-mode) levels.
#
# Paint mode defaults to the red/green/blue palette (see solver-rs/src/bin/generate.rs
# --paint): amber is tuned for additive mixing and isn't part of the shipped Paint levels.
# Kept to a gentler ramp than the additive levels (STATUS.md: 4x3 up to 6x6, 2-14 pieces)
# since a 3-color palette makes shape+color collisions likelier at high piece counts on a
# fixed grid (see solver-rs/README.md's "Scaling limits").
#
# Usage:
#   _Scripts/gen-paint-levels.sh [output-dir]
#
# Requires solver-rs to be built (cargo build --release) and ../levels.json to exist
# (node export-levels.js), since the generator reads the current pigment table from there.
#
# Output: one candidate-N.json per rung in output-dir (default: _Scripts/out/paint-candidates),
# in the same per-level JSON shape as levels.json. Turn a chosen candidate into a levels.js
# entry with `node json-to-level.js <candidate>.json`.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/../solver-rs"

OUT="${1:-$SCRIPT_DIR/out/paint-candidates}"
mkdir -p "$OUT"

rungs=(
  "3 2 2 0"
  "3 2 2 0"
  "3 3 2 0"
  "3 3 2 0"
  "3 3 3 0"
  "3 3 3 0"
  "4 3 3 0"
  "4 3 3 0"
  "4 3 3 1"
  "4 3 3 1"
  "4 4 4 0"
  "4 4 4 1"
  "4 4 4 1"
  "4 4 4 1"
  "4 4 5 0"
  "4 4 5 1"
  "4 4 5 1"
  "5 4 5 1"
  "5 4 5 1"
  "5 4 5 2"
  "5 4 6 1"
  "5 4 6 2"
  "5 4 6 2"
  "5 5 6 2"
  "5 5 7 1"
  "5 5 7 2"
  "5 5 7 2"
  "5 5 8 2"
  "5 5 8 2"
  "5 5 8 2"
  "5 5 9 1"
  "5 5 9 2"
  "5 5 9 2"
  "6 5 9 2"
  "6 5 10 2"
  "6 5 10 2"
  "6 6 10 2"
  "6 6 11 2"
  "6 6 12 2"
  "6 6 12 2"
)

i=0
for rung in "${rungs[@]}"; do
  read -r cols rows pieces decoys <<< "$rung"
  i=$((i+1))
  out="$OUT/cand-$i.json"
  echo "=== candidate $i: cols=$cols rows=$rows pieces=$pieces decoys=$decoys ===" >&2
  if ./target/release/generate --paint --cols "$cols" --rows "$rows" --pieces "$pieces" --decoys "$decoys" --attempts 3000 --out "$out" 2>&1 | tail -3; then
    :
  else
    echo "  (failed, skipping)" >&2
  fi
done

echo "Done. Candidates in $OUT"
