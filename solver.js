#!/usr/bin/env node
"use strict";

// Exhaustive solution finder for Overhue levels. Given a level's target grid and
// its set of pieces, finds every way to place SOME OR ALL of the pieces (any of up to 8
// dihedral orientations, any grid position — or left unplaced entirely) so the additive
// color mix matches the target exactly. Leaving a piece unplaced is legal because the game
// itself doesn't require every piece to be used (see Level 3's decoy pieces, which by
// design can never be placed anywhere without breaking the match).
//
// This is a dev tool, not part of the game: it's how a level designer checks that a level
// has exactly the intended solution(s) — e.g. that "Level 2 · Look again" (see levels.js),
// which deliberately LOOKS ambiguous while solving (two patches share the same color), does
// not accidentally have more than one *actual* full solution.
//
// Usage:
//   node solver.js              # solve every level in levels.js
//   node solver.js level2       # solve just the level with this id
//   node solver.js 1            # ...or by index
//
// Performance notes (why this isn't a naive brute force):
//   - Piece orientations are deduplicated (a 2x2 square looks the same after any of the 8
//     transforms; a domino has only 2 distinct orientations, a monomino just 1), so the
//     search never wastes time on a branch it has already tried under a different name.
//   - Valid positions per orientation are precomputed ONCE per piece: a placement is only
//     considered if every cell it covers is inside the grid AND has a non-null target color
//     (pieces can never legally touch a cell meant to stay empty).
//   - Pieces are tried most-constrained-first (fewest valid placements first), a standard
//     CSP heuristic that makes bad branches fail fast instead of late. "Leave unplaced"
//     counts as one more option per piece, so this ordering still applies unchanged.
//   - The search prunes on a simple invariant: pigments only ever ADD, so a cell's running
//     channel sum is monotonically non-decreasing as more pieces are placed on it. The
//     moment a channel's running sum exceeds the target's value there (and that channel
//     isn't already saturated at 255), the branch is dead — no need to place another piece
//     to find out. This turns "generate everything, check colors at the end" into "die
//     after the first wrong overlap," which is what makes the search fast.

const {
  LEVELS,
  PAINT_LEVELS,
  PIGMENTS,
  buildTarget,
  addColors,
  colorsEqual,
  normalize,
  rotate90,
  flipHorizontal,
} = require("./levels.js");

const ALL_LEVELS = [...LEVELS, ...PAINT_LEVELS];

// ---------- Piece orientation enumeration ----------
function cellsSignature(cells) {
  return cells
    .map((c) => `${c.dx},${c.dy}`)
    .sort()
    .join("|");
}

// All 8 elements of the dihedral group D4: 4 rotations, and the same 4 rotations mirrored.
function uniqueOrientations(cells) {
  const seen = new Map();
  let current = normalize(cells);
  for (let flip = 0; flip < 2; flip++) {
    for (let rot = 0; rot < 4; rot++) {
      const sig = cellsSignature(current);
      if (!seen.has(sig)) seen.set(sig, current);
      current = rotate90(current);
    }
    current = flipHorizontal(current);
  }
  return [...seen.values()];
}

function boundingSize(cells) {
  return {
    w: Math.max(...cells.map((c) => c.dx)) + 1,
    h: Math.max(...cells.map((c) => c.dy)) + 1,
  };
}

// ---------- Placement precomputation ----------
// A placement is one concrete (orientation, origin) pair, reduced to the flat cell indices
// it would occupy plus the pigment it contributes there.
function computePlacements(level, pieceDef, targetFlat) {
  const { gridCols, gridRows } = level;
  const orientations = uniqueOrientations(pieceDef.cells);
  const placements = [];

  for (const cells of orientations) {
    const size = boundingSize(cells);
    for (let row = 0; row <= gridRows - size.h; row++) {
      for (let col = 0; col <= gridCols - size.w; col++) {
        const indices = new Array(cells.length);
        let valid = true;
        for (let i = 0; i < cells.length; i++) {
          const c = col + cells[i].dx;
          const r = row + cells[i].dy;
          const idx = r * gridCols + c;
          if (targetFlat[idx] === null) {
            valid = false;
            break;
          }
          indices[i] = idx;
        }
        if (valid) {
          placements.push({ indices, origin: { col, row }, cells });
        }
      }
    }
  }
  return placements;
}

// ---------- Backtracking search ----------
// Additive and subtractive levels need different pruning: additive sums only ever grow
// (prune once a channel exceeds target), subtractive products only ever shrink (prune once
// a channel drops below target) — see the color-model comment in levels.js. Both are
// monotonic in their own direction, which is what makes either one safe to prune eagerly.
function solveLevel(level) {
  const subtractive = level.blendMode === "subtractive";
  const target = buildTarget(level);
  const n = level.gridCols * level.gridRows;
  const targetFlat = new Array(n);
  for (let row = 0; row < level.gridRows; row++) {
    for (let col = 0; col < level.gridCols; col++) {
      targetFlat[row * level.gridCols + col] = target[row][col];
    }
  }

  const pieceInfos = level.pieces.map((def) => ({
    id: def.id,
    pigment: PIGMENTS[def.color],
    isDecoy: !!def.decoy,
    placements: computePlacements(level, def, targetFlat),
  }));

  // Most-constrained-first: fail fast on the piece with the fewest options. "Leave
  // unplaced" is available only for decoys (see search() below) — a non-decoy piece
  // contributes to the target by construction (buildTarget sums exactly the non-decoy
  // pieces), so in a well-formed level it can never be validly skipped, and a piece with
  // zero real placements there would mean the level is actually broken, not just decoy-shy.
  pieceInfos.sort((a, b) => a.placements.length - b.placements.length);
  const neverPlaceable = pieceInfos.filter((p) => p.placements.length === 0).map((p) => p.id);

  // Additive state: running per-channel sums (integers, exact).
  const sumR = new Int32Array(n);
  const sumG = new Int32Array(n);
  const sumB = new Int32Array(n);
  const touched = new Uint8Array(n);

  // Subtractive state: mixing is idempotent per distinct pigment (see levels.js's
  // multiplyColors) — painting the same pigment over itself is a no-op, only a genuinely
  // different one darkens anything further. So instead of a running product, track a
  // per-cell reference count *per distinct pigment used anywhere in this level* — the same
  // pigment applied twice is a no-op on that count's *presence* (0 vs >0), not its value.
  // This is exact integer bookkeeping, no rounding/epsilon involved anywhere.
  let pigmentList = [];
  let touchCount = null; // Int32Array[n * pigmentList.length]
  if (subtractive) {
    for (const info of pieceInfos) {
      const already = pigmentList.findIndex((c) => c.r === info.pigment.r && c.g === info.pigment.g && c.b === info.pigment.b);
      info.pigmentIndex = already !== -1 ? already : pigmentList.push(info.pigment) - 1;
    }
    touchCount = new Int32Array(n * pigmentList.length);
  }

  function subtractiveColorAt(idx) {
    let r = 1;
    let g = 1;
    let b = 1;
    let any = false;
    const base = idx * pigmentList.length;
    for (let p = 0; p < pigmentList.length; p++) {
      if (touchCount[base + p] === 0) continue;
      any = true;
      r *= pigmentList[p].r / 255;
      g *= pigmentList[p].g / 255;
      b *= pigmentList[p].b / 255;
    }
    return any ? { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) } : null;
  }

  const solutions = [];
  let nodesVisited = 0;
  const MAX_SOLUTIONS = 1000; // safety cap; these levels are tiny, this should never bite

  const startTime = process.hrtime.bigint();

  function fits(placement, pieceInfo) {
    if (subtractive) {
      const p = pieceInfo.pigmentIndex;
      for (const idx of placement.indices) {
        const base = idx * pigmentList.length;
        if (touchCount[base + p] > 0) continue; // already present here — a true no-op
        // Adding a genuinely new distinct pigment can only shrink each channel further (or
        // leave it, if that channel's already 0 in this new pigment) — so hypothetically add
        // it and check we haven't already undershot the target; more pigments later can
        // only shrink it more, never recover it.
        touchCount[base + p]++;
        const after = subtractiveColorAt(idx);
        touchCount[base + p]--;
        const t = targetFlat[idx];
        if (after.r < t.r || after.g < t.g || after.b < t.b) return false;
      }
      return true;
    }
    const pigment = pieceInfo.pigment;
    for (const idx of placement.indices) {
      const t = targetFlat[idx];
      if (t.r < 255 && sumR[idx] + pigment.r > t.r) return false;
      if (t.g < 255 && sumG[idx] + pigment.g > t.g) return false;
      if (t.b < 255 && sumB[idx] + pigment.b > t.b) return false;
    }
    return true;
  }

  function apply(placement, pieceInfo) {
    for (const idx of placement.indices) {
      if (subtractive) {
        touchCount[idx * pigmentList.length + pieceInfo.pigmentIndex]++;
      } else {
        sumR[idx] += pieceInfo.pigment.r;
        sumG[idx] += pieceInfo.pigment.g;
        sumB[idx] += pieceInfo.pigment.b;
      }
      touched[idx]++;
    }
  }

  function undo(placement, pieceInfo) {
    for (const idx of placement.indices) {
      if (subtractive) {
        touchCount[idx * pigmentList.length + pieceInfo.pigmentIndex]--;
      } else {
        sumR[idx] -= pieceInfo.pigment.r;
        sumG[idx] -= pieceInfo.pigment.g;
        sumB[idx] -= pieceInfo.pigment.b;
      }
      touched[idx]--;
    }
  }

  function isExactMatch() {
    for (let idx = 0; idx < n; idx++) {
      const color = subtractive
        ? subtractiveColorAt(idx)
        : touched[idx] > 0
        ? { r: Math.min(255, sumR[idx]), g: Math.min(255, sumG[idx]), b: Math.min(255, sumB[idx]) }
        : null;
      if (!colorsEqual(color, targetFlat[idx])) return false;
    }
    return true;
  }

  function search(pieceIndex, chosen) {
    nodesVisited++;
    if (solutions.length >= MAX_SOLUTIONS) return;

    if (pieceIndex === pieceInfos.length) {
      if (isExactMatch()) {
        solutions.push(chosen.map((c) => ({ id: c.id, origin: c.origin, cells: c.cells })));
      }
      return;
    }

    const piece = pieceInfos[pieceIndex];

    // Option 1: leave this piece unplaced. Only legal for a decoy (see the sort comment
    // above) — restricting this instead of offering it unconditionally to every piece
    // matters a lot at scale: with N non-decoy pieces, an unconditional skip option
    // doubles the branching factor at every one of those N levels for no possible benefit.
    if (piece.isDecoy) {
      search(pieceIndex + 1, chosen);
      if (solutions.length >= MAX_SOLUTIONS) return;
    }

    // Option 2: place it at one of its precomputed valid placements.
    for (const placement of piece.placements) {
      if (!fits(placement, piece)) continue;
      apply(placement, piece);
      chosen.push({ id: piece.id, origin: placement.origin, cells: placement.cells });
      search(pieceIndex + 1, chosen);
      chosen.pop();
      undo(placement, piece);
      if (solutions.length >= MAX_SOLUTIONS) return;
    }
  }

  search(0, []);

  const timeMs = Number(process.hrtime.bigint() - startTime) / 1e6;
  return { solvable: true, solutions, nodesVisited, timeMs, pieceInfos, neverPlaceable, allPieceIds: pieceInfos.map((p) => p.id) };
}

// ---------- CLI ----------
function formatCells(cells) {
  return cells.map((c) => `(${c.dx},${c.dy})`).join(" ");
}

function reportLevel(level) {
  console.log(`\n=== ${level.name} (${level.id}) — grid ${level.gridCols}x${level.gridRows} ===`);
  const result = solveLevel(level);

  console.log(`  placements/piece: ${result.pieceInfos.map((p) => `${p.id}=${p.placements.length}`).join(", ")}`);
  if (result.neverPlaceable.length > 0) {
    const decoyIds = new Set(level.pieces.filter((p) => p.decoy).map((p) => p.id));
    for (const id of result.neverPlaceable) {
      const tag = decoyIds.has(id) ? "expected, marked decoy" : "UNEXPECTED — check levels.js";
      console.log(`  note: "${id}" has zero valid placements anywhere (${tag})`);
    }
  }
  console.log(`  search nodes visited: ${result.nodesVisited}`);
  console.log(`  time: ${result.timeMs.toFixed(3)} ms`);
  console.log(`  solutions found: ${result.solutions.length}${result.solutions.length >= 1000 ? " (capped)" : ""}`);

  if (result.solutions.length === 0) {
    console.log("  WARNING: level as defined has no valid solution at all (check levels.js).");
  } else if (result.solutions.length > 1) {
    console.log("  NOTE: more than one solution exists — see below.");
  }

  result.solutions.forEach((solution, i) => {
    console.log(`  solution #${i + 1}:`);
    const placedIds = new Set(solution.map((p) => p.id));
    for (const piece of solution) {
      console.log(`    ${piece.id}: origin=(${piece.origin.col},${piece.origin.row}) shape=[${formatCells(piece.cells)}]`);
    }
    for (const id of result.allPieceIds) {
      if (!placedIds.has(id)) console.log(`    ${id}: (left in tray)`);
    }
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { solveLevel };
}

function main() {
  const arg = process.argv[2];
  let levelsToRun = ALL_LEVELS;
  if (arg !== undefined) {
    const byIndex = ALL_LEVELS[Number(arg)];
    const byId = ALL_LEVELS.find((l) => l.id === arg);
    const level = !Number.isNaN(Number(arg)) ? byIndex : byId;
    if (!level) {
      console.error(`No such level: ${arg}`);
      process.exit(1);
    }
    levelsToRun = [level];
  }
  for (const level of levelsToRun) reportLevel(level);
}

if (require.main === module) {
  main();
}
