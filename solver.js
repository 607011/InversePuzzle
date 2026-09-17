#!/usr/bin/env node
"use strict";

// Exhaustive solution finder for Inverse Puzzle levels. Given a level's target grid and
// its set of pieces, finds every way to place ALL pieces (any of up to 8 dihedral
// orientations, any grid position) so the additive color mix matches the target exactly.
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
//     CSP heuristic that makes bad branches fail fast instead of late.
//   - The search prunes on a simple invariant: pigments only ever ADD, so a cell's running
//     channel sum is monotonically non-decreasing as more pieces are placed on it. The
//     moment a channel's running sum exceeds the target's value there (and that channel
//     isn't already saturated at 255), the branch is dead — no need to place another piece
//     to find out. This turns "generate everything, check colors at the end" into "die
//     after the first wrong overlap," which is what makes the search fast.

const {
  LEVELS,
  PIGMENTS,
  buildTarget,
  addColors,
  colorsEqual,
  normalize,
  rotate90,
  flipHorizontal,
} = require("./levels.js");

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
function solveLevel(level) {
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
    placements: computePlacements(level, def, targetFlat),
  }));

  // Most-constrained-first: fail fast on the piece with the fewest options.
  pieceInfos.sort((a, b) => a.placements.length - b.placements.length);

  const unsolvable = pieceInfos.find((p) => p.placements.length === 0);
  if (unsolvable) {
    return { solvable: false, reason: `"${unsolvable.id}" has no legal placement at all`, solutions: [], nodesVisited: 0, timeMs: 0 };
  }

  const sumR = new Int32Array(n);
  const sumG = new Int32Array(n);
  const sumB = new Int32Array(n);
  const touched = new Uint8Array(n);

  const solutions = [];
  let nodesVisited = 0;
  const MAX_SOLUTIONS = 1000; // safety cap; these levels are tiny, this should never bite

  const startTime = process.hrtime.bigint();

  function fits(placement, pigment) {
    for (const idx of placement.indices) {
      const t = targetFlat[idx];
      if (t.r < 255 && sumR[idx] + pigment.r > t.r) return false;
      if (t.g < 255 && sumG[idx] + pigment.g > t.g) return false;
      if (t.b < 255 && sumB[idx] + pigment.b > t.b) return false;
    }
    return true;
  }

  function apply(placement, pigment) {
    for (const idx of placement.indices) {
      sumR[idx] += pigment.r;
      sumG[idx] += pigment.g;
      sumB[idx] += pigment.b;
      touched[idx]++;
    }
  }

  function undo(placement, pigment) {
    for (const idx of placement.indices) {
      sumR[idx] -= pigment.r;
      sumG[idx] -= pigment.g;
      sumB[idx] -= pigment.b;
      touched[idx]--;
    }
  }

  function isExactMatch() {
    for (let idx = 0; idx < n; idx++) {
      const color = touched[idx] > 0 ? addColors([{ r: sumR[idx], g: sumG[idx], b: sumB[idx] }]) : null;
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
    for (const placement of piece.placements) {
      if (!fits(placement, piece.pigment)) continue;
      apply(placement, piece.pigment);
      chosen.push({ id: piece.id, origin: placement.origin, cells: placement.cells });
      search(pieceIndex + 1, chosen);
      chosen.pop();
      undo(placement, piece.pigment);
      if (solutions.length >= MAX_SOLUTIONS) return;
    }
  }

  search(0, []);

  const timeMs = Number(process.hrtime.bigint() - startTime) / 1e6;
  return { solvable: true, solutions, nodesVisited, timeMs, pieceInfos };
}

// ---------- CLI ----------
function formatCells(cells) {
  return cells.map((c) => `(${c.dx},${c.dy})`).join(" ");
}

function reportLevel(level) {
  console.log(`\n=== ${level.name} (${level.id}) — grid ${level.gridCols}x${level.gridRows} ===`);
  const result = solveLevel(level);

  if (!result.solvable) {
    console.log(`  UNSOLVABLE: ${result.reason}`);
    return;
  }

  console.log(`  placements/piece: ${result.pieceInfos.map((p) => `${p.id}=${p.placements.length}`).join(", ")}`);
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
    for (const piece of solution) {
      console.log(`    ${piece.id}: origin=(${piece.origin.col},${piece.origin.row}) shape=[${formatCells(piece.cells)}]`);
    }
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { solveLevel };
}

function main() {
  const arg = process.argv[2];
  let levelsToRun = LEVELS;
  if (arg !== undefined) {
    const byIndex = LEVELS[Number(arg)];
    const byId = LEVELS.find((l) => l.id === arg);
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
