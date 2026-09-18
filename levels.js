"use strict";

// Shared, pure game data and logic: the color model, piece transforms, and level
// definitions. Loaded as a plain classic <script> in the browser (defines globals
// consumed by script.js) and required() as a CommonJS module by Node tools (e.g. solver.js).
// No build step either way.

// ---------- Color model ----------
// Two mixing rules, selected per level via `blendMode` (see LEVELS/PAINT_LEVELS below).
//
// "additive" (light mixing): each pigment is added channel-wise and clamped to 0-255.
// This is how overlapping colored light (or colored glass/gels) behaves — red+green light
// makes yellow, and stacking the same color on itself only ever gets brighter (it clamps at
// white). It's the default and what all of LEVELS uses.
//
// "subtractive" (paint/ink mixing): each pigment's channel is treated as how much of that
// wavelength it *lets through* (0 = fully absorbed, 255 = fully reflected), so overlapping
// *different* pigments multiply those fractions together — red+green makes a dark
// olive/brown (not yellow), and mixing all three primaries heads toward black/mud rather
// than white. Crucially, this is idempotent for the *same* pigment: painting a color over
// itself changes nothing (real paint doesn't get darker with every identical coat — it's
// already fully opaque/absorbing at that pigment's own characteristic level; only a
// genuinely different pigment on top absorbs anything further). Multiplication alone isn't
// idempotent (x*x != x), so this dedupes by exact color identity first and only multiplies
// the *distinct* pigments present. See PAINT_LEVELS.
function addColors(colors) {
  if (colors.length === 0) return null;
  const sum = { r: 0, g: 0, b: 0 };
  for (const c of colors) {
    sum.r += c.r;
    sum.g += c.g;
    sum.b += c.b;
  }
  return {
    r: Math.min(255, sum.r),
    g: Math.min(255, sum.g),
    b: Math.min(255, sum.b),
  };
}

function multiplyColors(colors) {
  if (colors.length === 0) return null;
  const distinct = [];
  for (const c of colors) {
    if (!distinct.some((d) => d.r === c.r && d.g === c.g && d.b === c.b)) distinct.push(c);
  }
  let r = 1;
  let g = 1;
  let b = 1;
  for (const c of distinct) {
    r *= c.r / 255;
    g *= c.g / 255;
    b *= c.b / 255;
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

// Dispatches to the right mixing rule for a level. `blendMode` defaults to "additive" so
// existing level data (LEVELS) doesn't need to mention it at all.
function combineColors(colors, blendMode) {
  return blendMode === "subtractive" ? multiplyColors(colors) : addColors(colors);
}

function colorsEqual(a, b) {
  if (a === null || b === null) return a === b;
  return a.r === b.r && a.g === b.g && a.b === b.b;
}

function cssColor(c) {
  return `rgb(${c.r}, ${c.g}, ${c.b})`;
}

const RED = { r: 235, g: 45, b: 45 };
const GREEN = { r: 60, g: 210, b: 60 };
const BLUE = { r: 45, g: 70, b: 235 };
// "amber" is a premixed pigment, deliberately defined as exactly the additive sum of
// red+green. A piece painted with it is pixel-identical to a red+green overlap, on purpose
// (see level 2): the color alone can never tell the two apart, only the piece shapes can.
const AMBER = addColors([RED, GREEN]);

const PIGMENTS = { red: RED, green: GREEN, blue: BLUE, amber: AMBER };

// ---------- Piece transforms ----------
function normalize(cells) {
  const minDx = Math.min(...cells.map((c) => c.dx));
  const minDy = Math.min(...cells.map((c) => c.dy));
  return cells.map((c) => ({ dx: c.dx - minDx, dy: c.dy - minDy }));
}

function rotate90(cells) {
  // (dx, dy) -> (-dy, dx)
  return normalize(cells.map((c) => ({ dx: -c.dy, dy: c.dx })));
}

function flipHorizontal(cells) {
  return normalize(cells.map((c) => ({ dx: -c.dx, dy: c.dy })));
}

function boundingSize(cells) {
  return {
    w: Math.max(...cells.map((c) => c.dx)) + 1,
    h: Math.max(...cells.map((c) => c.dy)) + 1,
  };
}

function applyStartTransform(cells, start) {
  let result = cells;
  const rotations = (start && start.rotate) || 0;
  for (let i = 0; i < rotations; i++) result = rotate90(result);
  if (start && start.flip) result = flipHorizontal(result);
  return normalize(result);
}

// ---------- Level definitions ----------
// Grid coordinates: col = x (dx), row = y (dy). Each piece's `cells` are given in the
// exact orientation it needs for the solution; `origin` says where that solved shape sits.
// The target is derived from cells+origin+color automatically, so level data can't drift
// out of sync with what's actually achievable. `start` (optional) scrambles a piece's
// initial orientation in the tray, so the solution orientation must be rediscovered.
const LEVELS = [
  // difficulty score (solver-rs): 1
  {
    id: "level1",
    name: "Level 1 · Generated",
    gridCols: 4,
    gridRows: 3,
    pieces: [
      {
        id: "piece-1",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 2, row: 1 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-2",
        color: "green",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 1 },
        start: { rotate: 1 },
      }
    ],
  },
  // difficulty score (solver-rs): 4.5
  {
    id: "level2",
    name: "Level 2 · Generated",
    gridCols: 5,
    gridRows: 4,
    pieces: [
      {
        id: "piece-1",
        color: "green",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 1, row: 0 },
      },
      {
        id: "piece-2",
        color: "amber",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 4, row: 3 },
      },
      {
        id: "piece-3",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 4, row: 3 },
      },
      {
        id: "piece-4",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 1, row: 3 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "decoy-1",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }],
        decoy: true,
      }
    ],
  },
  // difficulty score (solver-rs): 5.5
  {
    id: "level3",
    name: "Level 3 · Generated",
    gridCols: 4,
    gridRows: 3,
    pieces: [
      {
        id: "piece-1",
        color: "amber",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 2, dy: 0 }],
        origin: { col: 1, row: 0 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-2",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 0, row: 2 },
        start: { flip: true },
      },
      {
        id: "decoy-1",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        decoy: true,
        start: { rotate: 2 },
      }
    ],
  },
  // difficulty score (solver-rs): 7.5
  {
    id: "level4",
    name: "Level 4 · Generated",
    gridCols: 4,
    gridRows: 4,
    pieces: [
      {
        id: "piece-1",
        color: "amber",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 0, row: 3 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-2",
        color: "green",
        cells: [{ dx: 0, dy: 2 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 1, row: 1 },
        start: { rotate: 3 },
      },
      {
        id: "piece-3",
        color: "red",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 1, row: 1 },
        start: { rotate: 2 },
      }
    ],
  },
  // difficulty score (solver-rs): 9.5
  {
    id: "level5",
    name: "Level 5 · Generated",
    gridCols: 5,
    gridRows: 4,
    pieces: [
      {
        id: "piece-1",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 1, row: 1 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-2",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 2, row: 0 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-3",
        color: "amber",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 3, dy: 0 }],
        origin: { col: 1, row: 3 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-4",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 3, row: 3 },
        start: { rotate: 3 },
      },
      {
        id: "decoy-1",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        decoy: true,
      }
    ],
  },
  // difficulty score (solver-rs): 15
  {
    id: "level6",
    name: "Level 6 · Generated",
    gridCols: 4,
    gridRows: 4,
    pieces: [
      {
        id: "piece-1",
        color: "green",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 2 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 0 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-2",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 2, dy: 0 }],
        origin: { col: 0, row: 0 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-3",
        color: "amber",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }],
        origin: { col: 2, row: 1 },
        start: { rotate: 2 },
      },
      {
        id: "decoy-1",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 2, dy: 0 }],
        decoy: true,
      }
    ],
  },
  // difficulty score (solver-rs): 17
  {
    id: "level7",
    name: "Level 7 · Generated",
    gridCols: 5,
    gridRows: 5,
    pieces: [
      {
        id: "piece-1",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 }],
        origin: { col: 0, row: 2 },
        start: { rotate: 1 },
      },
      {
        id: "piece-2",
        color: "amber",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 4, row: 4 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-3",
        color: "blue",
        cells: [{ dx: 1, dy: 2 }, { dx: 1, dy: 1 }, { dx: 0, dy: 2 }, { dx: 1, dy: 0 }],
        origin: { col: 1, row: 0 },
      },
      {
        id: "piece-4",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 0, row: 0 },
      },
      {
        id: "piece-5",
        color: "red",
        cells: [{ dx: 2, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 1, row: 1 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "decoy-1",
        color: "green",
        cells: [{ dx: 2, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        decoy: true,
        start: { rotate: 2, flip: true },
      }
    ],
  },
  // difficulty score (solver-rs): 17
  {
    id: "level8",
    name: "Level 8 · Generated",
    gridCols: 5,
    gridRows: 5,
    pieces: [
      {
        id: "piece-1",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 1, row: 3 },
        start: { flip: true },
      },
      {
        id: "piece-2",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: 2 }],
        origin: { col: 3, row: 0 },
        start: { flip: true },
      },
      {
        id: "piece-3",
        color: "green",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 3, row: 2 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-4",
        color: "amber",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 3, row: 2 },
        start: { rotate: 3 },
      },
      {
        id: "piece-5",
        color: "blue",
        cells: [{ dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 1 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-6",
        color: "red",
        cells: [{ dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 1, dy: 2 }, { dx: 1, dy: 0 }],
        origin: { col: 3, row: 0 },
        start: { rotate: 1 },
      },
      {
        id: "decoy-1",
        color: "amber",
        cells: [{ dx: 2, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        decoy: true,
        start: { rotate: 1, flip: true },
      },
      {
        id: "decoy-2",
        color: "green",
        cells: [{ dx: 2, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        decoy: true,
        start: { rotate: 3, flip: true },
      }
    ],
  },
  // difficulty score (solver-rs): 21
  {
    id: "level9",
    name: "Level 9 · Generated",
    gridCols: 5,
    gridRows: 4,
    pieces: [
      {
        id: "piece-1",
        color: "amber",
        cells: [{ dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 0, row: 0 },
        start: { rotate: 3 },
      },
      {
        id: "piece-2",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 1, row: 1 },
      },
      {
        id: "piece-3",
        color: "amber",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 2, row: 1 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-4",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 1, row: 1 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-5",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 0, row: 2 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "decoy-1",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 2, dy: 0 }],
        decoy: true,
        start: { rotate: 2 },
      }
    ],
  },
  // difficulty score (solver-rs): 24.5
  {
    id: "level10",
    name: "Level 10 · Generated",
    gridCols: 5,
    gridRows: 5,
    pieces: [
      {
        id: "piece-1",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 }],
        origin: { col: 0, row: 2 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-2",
        color: "amber",
        cells: [{ dx: 2, dy: 0 }, { dx: 2, dy: 1 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }],
        origin: { col: 2, row: 0 },
        start: { rotate: 2 },
      },
      {
        id: "piece-3",
        color: "green",
        cells: [{ dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 2, dy: 1 }],
        origin: { col: 2, row: 2 },
      },
      {
        id: "piece-4",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 1, row: 4 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-5",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 3, row: 1 },
        start: { flip: true },
      },
      {
        id: "piece-6",
        color: "blue",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
        origin: { col: 0, row: 1 },
        start: { rotate: 2 },
      },
      {
        id: "decoy-1",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 2, dy: 1 }],
        decoy: true,
        start: { rotate: 2 },
      }
    ],
  },
  // difficulty score (solver-rs): 25
  {
    id: "level11",
    name: "Level 11 · Generated",
    gridCols: 6,
    gridRows: 5,
    pieces: [
      {
        id: "piece-1",
        color: "red",
        cells: [{ dx: 0, dy: 2 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 0, dy: 3 }],
        origin: { col: 4, row: 1 },
        start: { flip: true },
      },
      {
        id: "piece-2",
        color: "amber",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 0, row: 1 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-3",
        color: "red",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 2 }],
        origin: { col: 2, row: 1 },
        start: { flip: true },
      },
      {
        id: "piece-4",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
        origin: { col: 0, row: 4 },
        start: { rotate: 2 },
      },
      {
        id: "piece-5",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 3, row: 1 },
        start: { rotate: 1 },
      },
      {
        id: "piece-6",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 3, dy: 0 }],
        origin: { col: 0, row: 2 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-7",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 0, row: 4 },
        start: { rotate: 1 },
      },
      {
        id: "piece-8",
        color: "amber",
        cells: [{ dx: 0, dy: 2 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 1 },
        start: { rotate: 2 },
      },
      {
        id: "decoy-1",
        color: "amber",
        cells: [{ dx: 0, dy: 2 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 0, dy: 3 }],
        decoy: true,
        start: { flip: true },
      },
      {
        id: "decoy-2",
        color: "amber",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 2 }, { dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
        decoy: true,
        start: { rotate: 3 },
      }
    ],
  },
  // difficulty score (solver-rs): 26
  {
    id: "level12",
    name: "Level 12 · Generated",
    gridCols: 6,
    gridRows: 5,
    pieces: [
      {
        id: "piece-1",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }, { dx: 2, dy: 0 }],
        origin: { col: 3, row: 0 },
        start: { flip: true },
      },
      {
        id: "piece-2",
        color: "green",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 2 }, { dx: 0, dy: 3 }, { dx: 0, dy: 0 }],
        origin: { col: 5, row: 1 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-3",
        color: "amber",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 2, row: 0 },
        start: { flip: true },
      },
      {
        id: "piece-4",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 5, row: 2 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-5",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
        origin: { col: 4, row: 1 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-6",
        color: "blue",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 3, row: 0 },
        start: { rotate: 2 },
      },
      {
        id: "piece-7",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 2, row: 3 },
        start: { rotate: 3 },
      },
      {
        id: "decoy-1",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }, { dx: 2, dy: 0 }],
        decoy: true,
        start: { rotate: 2, flip: true },
      }
    ],
  },
  // difficulty score (solver-rs): 30
  {
    id: "level13",
    name: "Level 13 · Generated",
    gridCols: 6,
    gridRows: 6,
    pieces: [
      {
        id: "piece-1",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 1, row: 2 },
        start: { rotate: 1 },
      },
      {
        id: "piece-2",
        color: "blue",
        cells: [{ dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 1, row: 1 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-3",
        color: "amber",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
        origin: { col: 3, row: 3 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-4",
        color: "amber",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 5, row: 1 },
        start: { rotate: 2 },
      },
      {
        id: "piece-5",
        color: "red",
        cells: [{ dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 1, dy: 0 }],
        origin: { col: 0, row: 0 },
        start: { rotate: 1 },
      },
      {
        id: "piece-6",
        color: "green",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }],
        origin: { col: 4, row: 1 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-7",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 5, row: 1 },
        start: { flip: true },
      },
      {
        id: "piece-8",
        color: "green",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 2, row: 0 },
        start: { rotate: 3 },
      },
      {
        id: "decoy-1",
        color: "amber",
        cells: [{ dx: 0, dy: 2 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        decoy: true,
        start: { flip: true },
      },
      {
        id: "decoy-2",
        color: "blue",
        cells: [{ dx: 0, dy: 2 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        decoy: true,
        start: { rotate: 3, flip: true },
      }
    ],
  },
  // difficulty score (solver-rs): 36.5
  {
    id: "level14",
    name: "Level 14 · Generated",
    gridCols: 6,
    gridRows: 6,
    pieces: [
      {
        id: "piece-1",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
        origin: { col: 0, row: 3 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-2",
        color: "green",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 4, row: 4 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-3",
        color: "red",
        cells: [{ dx: 2, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 2 },
        start: { rotate: 2 },
      },
      {
        id: "piece-4",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 3, row: 0 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-5",
        color: "red",
        cells: [{ dx: 0, dy: 2 }, { dx: 0, dy: 1 }, { dx: 0, dy: 3 }, { dx: 0, dy: 0 }],
        origin: { col: 3, row: 0 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-6",
        color: "amber",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 4, row: 4 },
        start: { rotate: 2 },
      },
      {
        id: "piece-7",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 3 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-8",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 0, row: 3 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-9",
        color: "green",
        cells: [{ dx: 2, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 1 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "decoy-1",
        color: "amber",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        decoy: true,
        start: { rotate: 3 },
      },
      {
        id: "decoy-2",
        color: "amber",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        decoy: true,
        start: { rotate: 1, flip: true },
      }
    ],
  },
  // difficulty score (solver-rs): 39
  {
    id: "level15",
    name: "Level 15 · Generated",
    gridCols: 6,
    gridRows: 5,
    pieces: [
      {
        id: "piece-1",
        color: "amber",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }],
        origin: { col: 4, row: 0 },
        start: { rotate: 1 },
      },
      {
        id: "piece-2",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 3, row: 0 },
        start: { rotate: 3 },
      },
      {
        id: "piece-3",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 0, row: 0 },
        start: { rotate: 1 },
      },
      {
        id: "piece-4",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 2, row: 2 },
      },
      {
        id: "piece-5",
        color: "red",
        cells: [{ dx: 0, dy: 2 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 1, row: 2 },
        start: { rotate: 1 },
      },
      {
        id: "piece-6",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 }],
        origin: { col: 2, row: 2 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-7",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 }],
        origin: { col: 3, row: 1 },
        start: { rotate: 2 },
      },
      {
        id: "piece-8",
        color: "blue",
        cells: [{ dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 1, dy: 0 }],
        origin: { col: 1, row: 3 },
        start: { rotate: 1 },
      },
      {
        id: "decoy-1",
        color: "amber",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 3, dy: 0 }],
        decoy: true,
        start: { rotate: 3, flip: true },
      },
      {
        id: "decoy-2",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 3, dy: 0 }],
        decoy: true,
        start: { rotate: 2 },
      }
    ],
  },
  // difficulty score (solver-rs): 41
  {
    id: "level16",
    name: "Level 16 · Generated",
    gridCols: 6,
    gridRows: 6,
    pieces: [
      {
        id: "piece-1",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 }],
        origin: { col: 1, row: 0 },
        start: { flip: true },
      },
      {
        id: "piece-2",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 }],
        origin: { col: 4, row: 2 },
        start: { rotate: 1 },
      },
      {
        id: "piece-3",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: 2 }],
        origin: { col: 2, row: 1 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-4",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 2, row: 3 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-5",
        color: "blue",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
        origin: { col: 4, row: 2 },
        start: { rotate: 1 },
      },
      {
        id: "piece-6",
        color: "green",
        cells: [{ dx: 0, dy: 2 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }],
        origin: { col: 1, row: 3 },
      },
      {
        id: "piece-7",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 1, row: 5 },
        start: { flip: true },
      },
      {
        id: "piece-8",
        color: "green",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 1, row: 5 },
      },
      {
        id: "piece-9",
        color: "red",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 5, row: 2 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-10",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }, { dx: 2, dy: 1 }],
        origin: { col: 1, row: 0 },
      },
      {
        id: "decoy-1",
        color: "amber",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
        decoy: true,
        start: { rotate: 1 },
      },
      {
        id: "decoy-2",
        color: "amber",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 }],
        decoy: true,
        start: { rotate: 1, flip: true },
      }
    ],
  },
  // difficulty score (solver-rs): 41.5
  {
    id: "level17",
    name: "Level 17 · Generated",
    gridCols: 6,
    gridRows: 5,
    pieces: [
      {
        id: "piece-1",
        color: "amber",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 0, row: 0 },
        start: { rotate: 2 },
      },
      {
        id: "piece-2",
        color: "amber",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 0, row: 3 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-3",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: 2 }, { dx: 1, dy: 0 }],
        origin: { col: 1, row: 0 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-4",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 2, dy: 0 }, { dx: 3, dy: 0 }],
        origin: { col: 0, row: 4 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-5",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
        origin: { col: 2, row: 0 },
      },
      {
        id: "piece-6",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 1, row: 0 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-7",
        color: "red",
        cells: [{ dx: 2, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 0, row: 1 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "decoy-1",
        color: "blue",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: 0 }],
        decoy: true,
        start: { rotate: 3, flip: true },
      },
      {
        id: "decoy-2",
        color: "amber",
        cells: [{ dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        decoy: true,
        start: { rotate: 1 },
      }
    ],
  },
  // difficulty score (solver-rs): 46.5
  {
    id: "level18",
    name: "Level 18 · Generated",
    gridCols: 6,
    gridRows: 6,
    pieces: [
      {
        id: "piece-1",
        color: "amber",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }, { dx: 1, dy: 2 }],
        origin: { col: 2, row: 3 },
        start: { rotate: 1 },
      },
      {
        id: "piece-2",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }],
        origin: { col: 1, row: 3 },
        start: { flip: true },
      },
      {
        id: "piece-3",
        color: "green",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 0, row: 4 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-4",
        color: "amber",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 2, row: 3 },
        start: { rotate: 2 },
      },
      {
        id: "piece-5",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 3, row: 2 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-6",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 3, row: 2 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-7",
        color: "green",
        cells: [{ dx: 2, dy: 0 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }],
        origin: { col: 1, row: 0 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-8",
        color: "red",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 2 }, { dx: 0, dy: 0 }],
        origin: { col: 5, row: 2 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-9",
        color: "red",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 4 },
      },
      {
        id: "decoy-1",
        color: "blue",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }, { dx: 1, dy: 2 }],
        decoy: true,
        start: { rotate: 3 },
      },
      {
        id: "decoy-2",
        color: "blue",
        cells: [{ dx: 2, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        decoy: true,
        start: { flip: true },
      }
    ],
  },
  // difficulty score (solver-rs): 55.5
  {
    id: "level19",
    name: "Level 19 · Generated",
    gridCols: 6,
    gridRows: 6,
    pieces: [
      {
        id: "piece-1",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 2, dy: 0 }],
        origin: { col: 0, row: 0 },
        start: { rotate: 2 },
      },
      {
        id: "piece-2",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 2, row: 2 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-3",
        color: "red",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 }],
        origin: { col: 0, row: 4 },
        start: { flip: true },
      },
      {
        id: "piece-4",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 5, row: 1 },
        start: { rotate: 3 },
      },
      {
        id: "piece-5",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 0, dy: 2 }],
        origin: { col: 3, row: 3 },
        start: { rotate: 2 },
      },
      {
        id: "piece-6",
        color: "blue",
        cells: [{ dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 0, row: 4 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-7",
        color: "green",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 2, row: 0 },
        start: { rotate: 3 },
      },
      {
        id: "piece-8",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 2 }],
        origin: { col: 4, row: 2 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-9",
        color: "red",
        cells: [{ dx: 0, dy: 2 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 0, row: 2 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-10",
        color: "amber",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 5, row: 2 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-11",
        color: "blue",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 2 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 1 },
        start: { rotate: 2 },
      },
      {
        id: "decoy-1",
        color: "amber",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 2 }],
        decoy: true,
        start: { rotate: 3 },
      },
      {
        id: "decoy-2",
        color: "amber",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 2 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        decoy: true,
        start: { rotate: 1, flip: true },
      }
    ],
  },
  // difficulty score (solver-rs): 63.5
  {
    id: "level20",
    name: "Level 20 · Generated",
    gridCols: 6,
    gridRows: 6,
    pieces: [
      {
        id: "piece-1",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: 2 }],
        origin: { col: 3, row: 3 },
        start: { flip: true },
      },
      {
        id: "piece-2",
        color: "amber",
        cells: [{ dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
        origin: { col: 0, row: 2 },
        start: { flip: true },
      },
      {
        id: "piece-3",
        color: "green",
        cells: [{ dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 0 }, { dx: 2, dy: 1 }],
        origin: { col: 3, row: 3 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-4",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 }],
        origin: { col: 2, row: 0 },
        start: { flip: true },
      },
      {
        id: "piece-5",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 0, row: 4 },
        start: { flip: true },
      },
      {
        id: "piece-6",
        color: "blue",
        cells: [{ dx: 0, dy: 2 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 2 }],
        origin: { col: 3, row: 0 },
        start: { flip: true },
      },
      {
        id: "piece-7",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 2, row: 0 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-8",
        color: "amber",
        cells: [{ dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 0 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-9",
        color: "amber",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 1, row: 4 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "decoy-1",
        color: "blue",
        cells: [{ dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
        decoy: true,
        start: { rotate: 1 },
      },
      {
        id: "decoy-2",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 1, dy: 0 }],
        decoy: true,
      }
    ],
  },
  // difficulty score (solver-rs): 63.5
  {
    id: "level21",
    name: "Level 21 · Generated",
    gridCols: 6,
    gridRows: 6,
    pieces: [
      {
        id: "piece-1",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 }],
        origin: { col: 3, row: 5 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-2",
        color: "amber",
        cells: [{ dx: 1, dy: 1 }, { dx: 2, dy: 1 }, { dx: 2, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 2, row: 2 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-3",
        color: "green",
        cells: [{ dx: 1, dy: 2 }, { dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 2 }],
        origin: { col: 0, row: 0 },
        start: { rotate: 1 },
      },
      {
        id: "piece-4",
        color: "amber",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 3, row: 0 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-5",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 3, row: 2 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-6",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 3, row: 5 },
        start: { rotate: 1 },
      },
      {
        id: "piece-7",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 0, row: 0 },
        start: { flip: true },
      },
      {
        id: "piece-8",
        color: "blue",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 2 }, { dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
        origin: { col: 4, row: 2 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-9",
        color: "amber",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 0, row: 5 },
        start: { rotate: 2 },
      },
      {
        id: "piece-10",
        color: "amber",
        cells: [{ dx: 2, dy: 0 }, { dx: 1, dy: 0 }, { dx: 3, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 1, row: 3 },
        start: { flip: true },
      },
      {
        id: "piece-11",
        color: "blue",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 2 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 0 },
        start: { rotate: 1 },
      },
      {
        id: "decoy-1",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        decoy: true,
        start: { rotate: 2 },
      },
      {
        id: "decoy-2",
        color: "blue",
        cells: [{ dx: 2, dy: 0 }, { dx: 1, dy: 0 }, { dx: 3, dy: 0 }, { dx: 0, dy: 0 }],
        decoy: true,
        start: { rotate: 2, flip: true },
      }
    ],
  },
  // difficulty score (solver-rs): 70
  {
    id: "level22",
    name: "Level 22 · Generated",
    gridCols: 6,
    gridRows: 6,
    pieces: [
      {
        id: "piece-1",
        color: "blue",
        cells: [{ dx: 0, dy: 2 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }],
        origin: { col: 3, row: 1 },
        start: { rotate: 2 },
      },
      {
        id: "piece-2",
        color: "green",
        cells: [{ dx: 2, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 1 },
        start: { flip: true },
      },
      {
        id: "piece-3",
        color: "amber",
        cells: [{ dx: 1, dy: 1 }, { dx: 2, dy: 1 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 0, row: 3 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-4",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 5, row: 1 },
        start: { flip: true },
      },
      {
        id: "piece-5",
        color: "blue",
        cells: [{ dx: 1, dy: 2 }, { dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 0, row: 1 },
        start: { rotate: 2 },
      },
      {
        id: "piece-6",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }],
        origin: { col: 2, row: 0 },
      },
      {
        id: "piece-7",
        color: "green",
        cells: [{ dx: 1, dy: 2 }, { dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 3, row: 0 },
        start: { rotate: 3 },
      },
      {
        id: "piece-8",
        color: "red",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 2, dy: 0 }],
        origin: { col: 3, row: 3 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-9",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 0, row: 4 },
      },
      {
        id: "piece-10",
        color: "amber",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 2, dy: 1 }],
        origin: { col: 0, row: 0 },
        start: { flip: true },
      },
      {
        id: "decoy-1",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }],
        decoy: true,
      },
      {
        id: "decoy-2",
        color: "amber",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }],
        decoy: true,
        start: { rotate: 2, flip: true },
      }
    ],
  },
  // difficulty score (solver-rs): 70
  {
    id: "level23",
    name: "Level 23 · Generated",
    gridCols: 6,
    gridRows: 6,
    pieces: [
      {
        id: "piece-1",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 1, dy: 2 }],
        origin: { col: 1, row: 3 },
        start: { rotate: 1 },
      },
      {
        id: "piece-2",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }],
        origin: { col: 1, row: 3 },
        start: { flip: true },
      },
      {
        id: "piece-3",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 3, row: 1 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-4",
        color: "green",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 3, row: 3 },
        start: { rotate: 2 },
      },
      {
        id: "piece-5",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 2, row: 5 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-6",
        color: "red",
        cells: [{ dx: 0, dy: 2 }, { dx: 0, dy: 1 }, { dx: 1, dy: 2 }, { dx: 0, dy: 0 }],
        origin: { col: 3, row: 1 },
        start: { rotate: 3 },
      },
      {
        id: "piece-7",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 0, row: 0 },
      },
      {
        id: "piece-8",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
        origin: { col: 3, row: 5 },
        start: { flip: true },
      },
      {
        id: "piece-9",
        color: "amber",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 2, row: 0 },
        start: { flip: true },
      },
      {
        id: "piece-10",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 3, row: 1 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-11",
        color: "red",
        cells: [{ dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 2 }],
        origin: { col: 2, row: 1 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-12",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 0, row: 0 },
        start: { rotate: 2 },
      },
      {
        id: "decoy-1",
        color: "amber",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        decoy: true,
        start: { rotate: 1, flip: true },
      },
      {
        id: "decoy-2",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 3, dy: 0 }],
        decoy: true,
        start: { flip: true },
      }
    ],
  },
  // difficulty score (solver-rs): 71.5
  {
    id: "level24",
    name: "Level 24 · Generated",
    gridCols: 6,
    gridRows: 6,
    pieces: [
      {
        id: "piece-1",
        color: "red",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }],
        origin: { col: 2, row: 0 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-2",
        color: "blue",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 2 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 3, row: 0 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-3",
        color: "green",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 2, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 0, row: 2 },
      },
      {
        id: "piece-4",
        color: "blue",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 1, row: 2 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-5",
        color: "red",
        cells: [{ dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 0, dy: 2 }, { dx: 0, dy: 0 }],
        origin: { col: 0, row: 1 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-6",
        color: "amber",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 2, dy: 1 }],
        origin: { col: 0, row: 4 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-7",
        color: "red",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 2 }],
        origin: { col: 0, row: 1 },
        start: { rotate: 3 },
      },
      {
        id: "piece-8",
        color: "blue",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 2, row: 3 },
        start: { rotate: 1 },
      },
      {
        id: "piece-9",
        color: "green",
        cells: [{ dx: 0, dy: 2 }, { dx: 1, dy: 2 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 4, row: 0 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-10",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 1, row: 3 },
      },
      {
        id: "piece-11",
        color: "amber",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 1, row: 1 },
        start: { flip: true },
      },
      {
        id: "decoy-1",
        color: "blue",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 2, dy: 1 }],
        decoy: true,
        start: { rotate: 2, flip: true },
      },
      {
        id: "decoy-2",
        color: "blue",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 2 }],
        decoy: true,
        start: { rotate: 3 },
      }
    ],
  },
  // difficulty score (solver-rs): 78
  {
    id: "level25",
    name: "Level 25 · Generated",
    gridCols: 6,
    gridRows: 6,
    pieces: [
      {
        id: "piece-1",
        color: "green",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 2 }, { dx: 1, dy: 1 }, { dx: 1, dy: 0 }],
        origin: { col: 2, row: 3 },
        start: { flip: true },
      },
      {
        id: "piece-2",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: 0 }, { dx: 2, dy: 1 }],
        origin: { col: 0, row: 3 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-3",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }],
        origin: { col: 0, row: 2 },
        start: { rotate: 3 },
      },
      {
        id: "piece-4",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 1, dy: 2 }, { dx: 0, dy: 0 }],
        origin: { col: 4, row: 0 },
        start: { flip: true },
      },
      {
        id: "piece-5",
        color: "amber",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 2, dy: 0 }, { dx: 3, dy: 0 }],
        origin: { col: 0, row: 0 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-6",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 3, row: 3 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-7",
        color: "green",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 4 },
        start: { rotate: 3 },
      },
      {
        id: "piece-8",
        color: "green",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 4, row: 1 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-9",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 1, row: 4 },
        start: { flip: true },
      },
      {
        id: "piece-10",
        color: "green",
        cells: [{ dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 2 }, { dx: 1, dy: 0 }],
        origin: { col: 0, row: 2 },
      },
      {
        id: "decoy-1",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: 0 }, { dx: 2, dy: 1 }],
        decoy: true,
      },
      {
        id: "decoy-2",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 2, dy: 0 }, { dx: 3, dy: 0 }],
        decoy: true,
        start: { rotate: 2 },
      }
    ],
  },
  // difficulty score (solver-rs): 81.5
  {
    id: "level26",
    name: "Level 26 · Generated",
    gridCols: 6,
    gridRows: 6,
    pieces: [
      {
        id: "piece-1",
        color: "blue",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 2, dy: 1 }],
        origin: { col: 0, row: 4 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-2",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 5, row: 0 },
        start: { rotate: 1 },
      },
      {
        id: "piece-3",
        color: "red",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 0 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-4",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 2, dy: 0 }],
        origin: { col: 0, row: 4 },
      },
      {
        id: "piece-5",
        color: "green",
        cells: [{ dx: 2, dy: 1 }, { dx: 2, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 1, row: 1 },
      },
      {
        id: "piece-6",
        color: "green",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 4, row: 2 },
        start: { rotate: 3 },
      },
      {
        id: "piece-7",
        color: "red",
        cells: [{ dx: 2, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 2, dy: 1 }],
        origin: { col: 1, row: 0 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-8",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
        origin: { col: 3, row: 3 },
      },
      {
        id: "piece-9",
        color: "amber",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 2, row: 4 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-10",
        color: "amber",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 3, row: 3 },
      },
      {
        id: "piece-11",
        color: "green",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }, { dx: 1, dy: 0 }],
        origin: { col: 1, row: 1 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "decoy-1",
        color: "blue",
        cells: [{ dx: 2, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 2, dy: 1 }],
        decoy: true,
        start: { rotate: 2 },
      },
      {
        id: "decoy-2",
        color: "blue",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: 1 }],
        decoy: true,
        start: { rotate: 3, flip: true },
      }
    ],
  },
  // difficulty score (solver-rs): 86.5
  {
    id: "level27",
    name: "Level 27 · Generated",
    gridCols: 6,
    gridRows: 6,
    pieces: [
      {
        id: "piece-1",
        color: "green",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 0 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-2",
        color: "red",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 0, dy: 2 }],
        origin: { col: 2, row: 0 },
        start: { flip: true },
      },
      {
        id: "piece-3",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 2, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 0, row: 2 },
      },
      {
        id: "piece-4",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 0 }, { dx: 2, dy: 0 }],
        origin: { col: 2, row: 2 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-5",
        color: "amber",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 1, row: 2 },
        start: { rotate: 3 },
      },
      {
        id: "piece-6",
        color: "green",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 0, row: 4 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-7",
        color: "red",
        cells: [{ dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 1, dy: 0 }],
        origin: { col: 2, row: 4 },
        start: { rotate: 2 },
      },
      {
        id: "piece-8",
        color: "amber",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 0, row: 4 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-9",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 4, row: 2 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-10",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 1, row: 2 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-11",
        color: "amber",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }, { dx: 1, dy: 0 }],
        origin: { col: 3, row: 2 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-12",
        color: "blue",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
        origin: { col: 1, row: 1 },
        start: { flip: true },
      },
      {
        id: "piece-13",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 2, dy: 0 }],
        origin: { col: 2, row: 1 },
        start: { rotate: 1 },
      },
      {
        id: "decoy-1",
        color: "amber",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 0 }, { dx: 2, dy: 0 }],
        decoy: true,
        start: { rotate: 3 },
      },
      {
        id: "decoy-2",
        color: "amber",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 0 }, { dx: 2, dy: 0 }],
        decoy: true,
        start: { rotate: 2, flip: true },
      }
    ],
  },
  // difficulty score (solver-rs): 88
  {
    id: "level28",
    name: "Level 28 · Generated",
    gridCols: 6,
    gridRows: 6,
    pieces: [
      {
        id: "piece-1",
        color: "amber",
        cells: [{ dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 2, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 3, row: 0 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-2",
        color: "green",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 1, row: 2 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-3",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 0 },
      },
      {
        id: "piece-4",
        color: "green",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 2 }, { dx: 0, dy: 2 }],
        origin: { col: 3, row: 1 },
        start: { rotate: 2 },
      },
      {
        id: "piece-5",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 5, row: 5 },
        start: { rotate: 2 },
      },
      {
        id: "piece-6",
        color: "red",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 0, dy: 2 }],
        origin: { col: 1, row: 0 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-7",
        color: "amber",
        cells: [{ dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 1, dy: 2 }, { dx: 1, dy: 0 }],
        origin: { col: 2, row: 3 },
        start: { flip: true },
      },
      {
        id: "piece-8",
        color: "amber",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }, { dx: 2, dy: 1 }],
        origin: { col: 3, row: 4 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-9",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 1, dy: 2 }, { dx: 0, dy: 0 }],
        origin: { col: 4, row: 1 },
      },
      {
        id: "piece-10",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 1, row: 1 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "decoy-1",
        color: "blue",
        cells: [{ dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 2, dy: 1 }, { dx: 0, dy: 0 }],
        decoy: true,
        start: { rotate: 3, flip: true },
      },
      {
        id: "decoy-2",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }, { dx: 2, dy: 1 }],
        decoy: true,
      }
    ],
  },
  // difficulty score (solver-rs): 96
  {
    id: "level29",
    name: "Level 29 · Generated",
    gridCols: 6,
    gridRows: 6,
    pieces: [
      {
        id: "piece-1",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 1, dy: 2 }, { dx: 0, dy: 1 }],
        origin: { col: 3, row: 0 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-2",
        color: "amber",
        cells: [{ dx: 0, dy: 2 }, { dx: 0, dy: 3 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 2 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-3",
        color: "green",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 1, row: 5 },
        start: { rotate: 1 },
      },
      {
        id: "piece-4",
        color: "blue",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 4, row: 3 },
        start: { rotate: 3 },
      },
      {
        id: "piece-5",
        color: "red",
        cells: [{ dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 2, dy: 1 }, { dx: 1, dy: 0 }],
        origin: { col: 2, row: 3 },
        start: { flip: true },
      },
      {
        id: "piece-6",
        color: "amber",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 4, row: 0 },
        start: { rotate: 2 },
      },
      {
        id: "piece-7",
        color: "amber",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 0, row: 0 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-8",
        color: "blue",
        cells: [{ dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 1, dy: 0 }],
        origin: { col: 3, row: 1 },
        start: { flip: true },
      },
      {
        id: "piece-9",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 0, row: 0 },
      },
      {
        id: "piece-10",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 0, row: 0 },
      },
      {
        id: "piece-11",
        color: "red",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 1, dy: 2 }],
        origin: { col: 4, row: 2 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-12",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 1, row: 3 },
        start: { flip: true },
      },
      {
        id: "decoy-1",
        color: "amber",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 1, dy: 2 }, { dx: 0, dy: 1 }],
        decoy: true,
        start: { rotate: 2 },
      },
      {
        id: "decoy-2",
        color: "blue",
        cells: [{ dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 2 }],
        decoy: true,
        start: { rotate: 1 },
      }
    ],
  },
  // difficulty score (solver-rs): 97
  {
    id: "level30",
    name: "Level 30 · Generated",
    gridCols: 6,
    gridRows: 6,
    pieces: [
      {
        id: "piece-1",
        color: "blue",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 2 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 0 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-2",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 3, row: 1 },
        start: { flip: true },
      },
      {
        id: "piece-3",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 1, row: 4 },
        start: { rotate: 3 },
      },
      {
        id: "piece-4",
        color: "green",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 3, row: 0 },
        start: { flip: true },
      },
      {
        id: "piece-5",
        color: "red",
        cells: [{ dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 2 },
      },
      {
        id: "piece-6",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 0, row: 0 },
        start: { rotate: 3 },
      },
      {
        id: "piece-7",
        color: "amber",
        cells: [{ dx: 2, dy: 0 }, { dx: 2, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 3, row: 0 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-8",
        color: "amber",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 4, row: 2 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-9",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 3, dy: 0 }],
        origin: { col: 2, row: 3 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-10",
        color: "amber",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 1, row: 5 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-11",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
        origin: { col: 1, row: 1 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-12",
        color: "blue",
        cells: [{ dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 0 }],
        origin: { col: 1, row: 4 },
        start: { rotate: 1 },
      },
      {
        id: "piece-13",
        color: "red",
        cells: [{ dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 2, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 3, row: 3 },
        start: { rotate: 2 },
      },
      {
        id: "piece-14",
        color: "blue",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 0, dy: 2 }],
        origin: { col: 5, row: 0 },
        start: { rotate: 3 },
      },
      {
        id: "decoy-1",
        color: "amber",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 2 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        decoy: true,
        start: { flip: true },
      },
      {
        id: "decoy-2",
        color: "blue",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 2 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }],
        decoy: true,
        start: { rotate: 3 },
      }
    ],
  },
];

// A separate, smaller level set using "subtractive" (paint/ink-like) mixing instead of
// "additive" (light-like) mixing — see the color-model comment above. Kept apart from
// LEVELS rather than folding in: LEVELS' own tricks (Level 2's premixed "amber" pigment
// especially) are specifically built around additive sums and would mean something
// different — or nothing at all — under multiplication, so reusing the same level data
// for both modes isn't meaningful. Same RED/GREEN/BLUE pigment values work well for both
// mixing rules without retuning (verified: red+green -> a dark olive/brown, red+blue -> a
// dark magenta, green+blue -> a dark teal, all three -> near-black, and the same pigment
// any number of times over stays exactly itself — see multiplyColors above).
const PAINT_LEVELS = [
  // difficulty score (solver-rs): 1.0
  {
    id: "paint1",
    name: "Paint 1 · Generated",
    gridCols: 3,
    gridRows: 2,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "green",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 2, row: 1 },
        start: { rotate: 1 },
      },
      {
        id: "piece-2",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 1, row: 1 },
        start: { rotate: 3, flip: true },
      }
    ],
  },
  // difficulty score (solver-rs): 1.5
  {
    id: "paint2",
    name: "Paint 2 · Generated",
    gridCols: 4,
    gridRows: 3,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "green",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 0, row: 1 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-2",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 2, row: 1 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-3",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
        origin: { col: 2, row: 2 },
        start: { rotate: 2 },
      }
    ],
  },
  // difficulty score (solver-rs): 5.5
  {
    id: "paint3",
    name: "Paint 3 · Generated",
    gridCols: 4,
    gridRows: 3,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "green",
        cells: [{ dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 1, row: 1 },
      },
      {
        id: "piece-2",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }],
        origin: { col: 1, row: 0 },
        start: { rotate: 2 },
      },
      {
        id: "piece-3",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 1, row: 1 },
        start: { rotate: 1 },
      }
    ],
  },
  // difficulty score (solver-rs): 6.0
  {
    id: "paint4",
    name: "Paint 4 · Generated",
    gridCols: 4,
    gridRows: 3,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }, { dx: 2, dy: 0 }],
        origin: { col: 0, row: 1 },
      },
      {
        id: "piece-2",
        color: "green",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 2, row: 2 },
        start: { flip: true },
      },
      {
        id: "piece-3",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }, { dx: 2, dy: 0 }],
        origin: { col: 0, row: 1 },
      },
      {
        id: "decoy-1",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        decoy: true,
        start: { flip: true },
      }
    ],
  },
  // difficulty score (solver-rs): 7.0
  {
    id: "paint5",
    name: "Paint 5 · Generated",
    gridCols: 5,
    gridRows: 4,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 0 },
        start: { rotate: 1 },
      },
      {
        id: "piece-2",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: 2 }],
        origin: { col: 3, row: 0 },
        start: { rotate: 1 },
      },
      {
        id: "piece-3",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 3 },
      },
      {
        id: "piece-4",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }],
        origin: { col: 2, row: 0 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-5",
        color: "green",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 1, row: 0 },
        start: { flip: true },
      },
      {
        id: "decoy-1",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }],
        decoy: true,
        start: { rotate: 2, flip: true },
      }
    ],
  },
  // difficulty score (solver-rs): 7.5
  {
    id: "paint6",
    name: "Paint 6 · Generated",
    gridCols: 3,
    gridRows: 3,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "red",
        cells: [{ dx: 2, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 0, row: 2 },
        start: { rotate: 1 },
      },
      {
        id: "piece-2",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 1, row: 0 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-3",
        color: "red",
        cells: [{ dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 0 }],
        origin: { col: 0, row: 0 },
        start: { rotate: 2, flip: true },
      }
    ],
  },
  // difficulty score (solver-rs): 8.0
  {
    id: "paint7",
    name: "Paint 7 · Generated",
    gridCols: 4,
    gridRows: 4,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
        origin: { col: 2, row: 1 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-2",
        color: "green",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 0, row: 1 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-3",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 1, row: 2 },
        start: { flip: true },
      },
      {
        id: "piece-4",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 2, row: 3 },
        start: { rotate: 3, flip: true },
      }
    ],
  },
  // difficulty score (solver-rs): 9.0
  {
    id: "paint8",
    name: "Paint 8 · Generated",
    gridCols: 4,
    gridRows: 3,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 3, row: 0 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-2",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 0, row: 2 },
        start: { rotate: 1 },
      },
      {
        id: "piece-3",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 3, row: 2 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "decoy-1",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        decoy: true,
        start: { rotate: 3 },
      }
    ],
  },
  // difficulty score (solver-rs): 9.5
  {
    id: "paint9",
    name: "Paint 9 · Generated",
    gridCols: 4,
    gridRows: 4,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 2, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 0, row: 0 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-2",
        color: "blue",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: 2 }],
        origin: { col: 1, row: 0 },
        start: { rotate: 1 },
      },
      {
        id: "piece-3",
        color: "green",
        cells: [{ dx: 0, dy: 2 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }],
        origin: { col: 1, row: 1 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-4",
        color: "red",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 }],
        origin: { col: 0, row: 2 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "decoy-1",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 2, dy: 1 }, { dx: 0, dy: 0 }],
        decoy: true,
        start: { flip: true },
      }
    ],
  },
  // difficulty score (solver-rs): 11.5
  {
    id: "paint10",
    name: "Paint 10 · Generated",
    gridCols: 5,
    gridRows: 4,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
        origin: { col: 1, row: 0 },
        start: { rotate: 1 },
      },
      {
        id: "piece-2",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }],
        origin: { col: 0, row: 2 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-3",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 1, row: 1 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-4",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 4, row: 3 },
        start: { flip: true },
      },
      {
        id: "piece-5",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 3, row: 3 },
        start: { flip: true },
      },
      {
        id: "decoy-1",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 0 }],
        decoy: true,
        start: { rotate: 2, flip: true },
      },
      {
        id: "decoy-2",
        color: "red",
        cells: [{ dx: 1, dy: 2 }, { dx: 0, dy: 2 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        decoy: true,
      }
    ],
  },
  // difficulty score (solver-rs): 13.0
  {
    id: "paint11",
    name: "Paint 11 · Generated",
    gridCols: 5,
    gridRows: 4,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: 2 }],
        origin: { col: 1, row: 0 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-2",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 0, row: 0 },
      },
      {
        id: "piece-3",
        color: "green",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 1, row: 2 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-4",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 2, dy: 0 }],
        origin: { col: 2, row: 1 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-5",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 2, row: 0 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "decoy-1",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        decoy: true,
        start: { rotate: 3, flip: true },
      }
    ],
  },
  // difficulty score (solver-rs): 16.0
  {
    id: "paint12",
    name: "Paint 12 · Generated",
    gridCols: 4,
    gridRows: 4,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 0, row: 1 },
        start: { rotate: 2 },
      },
      {
        id: "piece-2",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }],
        origin: { col: 0, row: 1 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-3",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 0, row: 1 },
      },
      {
        id: "piece-4",
        color: "green",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 0, row: 3 },
        start: { rotate: 2 },
      },
      {
        id: "piece-5",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 1 },
        start: { rotate: 2 },
      },
      {
        id: "decoy-1",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        decoy: true,
        start: { rotate: 2, flip: true },
      }
    ],
  },
  // difficulty score (solver-rs): 16.5
  {
    id: "paint13",
    name: "Paint 13 · Generated",
    gridCols: 3,
    gridRows: 3,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 0, row: 0 },
        start: { rotate: 1 },
      },
      {
        id: "piece-2",
        color: "red",
        cells: [{ dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 0 }],
        origin: { col: 1, row: 0 },
        start: { rotate: 3 },
      },
      {
        id: "piece-3",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: 2 }],
        origin: { col: 1, row: 0 },
        start: { flip: true },
      }
    ],
  },
  // difficulty score (solver-rs): 17.0
  {
    id: "paint14",
    name: "Paint 14 · Generated",
    gridCols: 5,
    gridRows: 4,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "blue",
        cells: [{ dx: 2, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 2 },
        start: { rotate: 2 },
      },
      {
        id: "piece-2",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 3 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-3",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 1 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-4",
        color: "green",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 0, row: 2 },
        start: { rotate: 3 },
      },
      {
        id: "piece-5",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 0, row: 1 },
        start: { flip: true },
      },
      {
        id: "piece-6",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 3 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "decoy-1",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: 0 }],
        decoy: true,
        start: { rotate: 3 },
      },
      {
        id: "decoy-2",
        color: "green",
        cells: [{ dx: 1, dy: 2 }, { dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 2 }],
        decoy: true,
      }
    ],
  },
  // difficulty score (solver-rs): 17.5
  {
    id: "paint15",
    name: "Paint 15 · Generated",
    gridCols: 5,
    gridRows: 5,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 2, dy: 0 }],
        origin: { col: 1, row: 1 },
      },
      {
        id: "piece-2",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 0 },
        start: { rotate: 1 },
      },
      {
        id: "piece-3",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
        origin: { col: 2, row: 1 },
      },
      {
        id: "piece-4",
        color: "green",
        cells: [{ dx: 2, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 0, row: 3 },
        start: { flip: true },
      },
      {
        id: "piece-5",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }],
        origin: { col: 0, row: 1 },
      },
      {
        id: "piece-6",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 3, row: 3 },
      },
      {
        id: "piece-7",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }],
        origin: { col: 0, row: 0 },
        start: { flip: true },
      },
      {
        id: "decoy-1",
        color: "green",
        cells: [{ dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 0 }],
        decoy: true,
        start: { rotate: 2 },
      },
      {
        id: "decoy-2",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }],
        decoy: true,
      }
    ],
  },
  // difficulty score (solver-rs): 22.0
  {
    id: "paint16",
    name: "Paint 16 · Generated",
    gridCols: 4,
    gridRows: 4,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 2, row: 1 },
        start: { flip: true },
      },
      {
        id: "piece-2",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 1, dy: 2 }],
        origin: { col: 0, row: 0 },
        start: { flip: true },
      },
      {
        id: "piece-3",
        color: "green",
        cells: [{ dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 0 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-4",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 }],
        origin: { col: 0, row: 2 },
        start: { rotate: 2 },
      },
      {
        id: "piece-5",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 1 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "decoy-1",
        color: "red",
        cells: [{ dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        decoy: true,
      }
    ],
  },
  // difficulty score (solver-rs): 22.5
  {
    id: "paint17",
    name: "Paint 17 · Generated",
    gridCols: 4,
    gridRows: 4,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: 2 }, { dx: 1, dy: 2 }],
        origin: { col: 2, row: 1 },
        start: { rotate: 2 },
      },
      {
        id: "piece-2",
        color: "green",
        cells: [{ dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 1 },
        start: { flip: true },
      },
      {
        id: "piece-3",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 2, row: 2 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-4",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 2, dy: 0 }],
        origin: { col: 0, row: 1 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-5",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 3, row: 0 },
        start: { rotate: 3, flip: true },
      }
    ],
  },
  // difficulty score (solver-rs): 24.5
  {
    id: "paint18",
    name: "Paint 18 · Generated",
    gridCols: 5,
    gridRows: 5,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 1, dy: 1 }],
        origin: { col: 2, row: 0 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-2",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 0, row: 0 },
      },
      {
        id: "piece-3",
        color: "red",
        cells: [{ dx: 2, dy: 0 }, { dx: 3, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 1, row: 0 },
        start: { rotate: 1 },
      },
      {
        id: "piece-4",
        color: "red",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 2 }],
        origin: { col: 0, row: 1 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-5",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 2, row: 0 },
      },
      {
        id: "piece-6",
        color: "green",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
        origin: { col: 1, row: 0 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-7",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 1, row: 4 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "decoy-1",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        decoy: true,
        start: { rotate: 3, flip: true },
      },
      {
        id: "decoy-2",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 }],
        decoy: true,
        start: { rotate: 2 },
      }
    ],
  },
  // difficulty score (solver-rs): 26.0
  {
    id: "paint19",
    name: "Paint 19 · Generated",
    gridCols: 5,
    gridRows: 5,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 2, dy: 0 }],
        origin: { col: 2, row: 3 },
      },
      {
        id: "piece-2",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 0, row: 0 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-3",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 2, row: 3 },
      },
      {
        id: "piece-4",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 0, row: 4 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-5",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 0, row: 0 },
        start: { rotate: 3 },
      },
      {
        id: "piece-6",
        color: "green",
        cells: [{ dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 1, row: 1 },
        start: { rotate: 1 },
      },
      {
        id: "decoy-1",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 2, dy: 0 }],
        decoy: true,
      },
      {
        id: "decoy-2",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: 1 }],
        decoy: true,
        start: { rotate: 2 },
      }
    ],
  },
  // difficulty score (solver-rs): 30.0
  {
    id: "paint20",
    name: "Paint 20 · Generated",
    gridCols: 5,
    gridRows: 4,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 2, row: 2 },
        start: { rotate: 2 },
      },
      {
        id: "piece-2",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 2, row: 1 },
        start: { rotate: 1 },
      },
      {
        id: "piece-3",
        color: "red",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 2 },
        start: { rotate: 3 },
      },
      {
        id: "piece-4",
        color: "blue",
        cells: [{ dx: 0, dy: 2 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 1, row: 1 },
        start: { rotate: 2 },
      },
      {
        id: "piece-5",
        color: "blue",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 4, row: 0 },
        start: { rotate: 1 },
      },
      {
        id: "piece-6",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }],
        origin: { col: 3, row: 2 },
        start: { rotate: 3 },
      },
      {
        id: "decoy-1",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }],
        decoy: true,
        start: { flip: true },
      },
      {
        id: "decoy-2",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: 1 }],
        decoy: true,
        start: { rotate: 3 },
      }
    ],
  },
  // difficulty score (solver-rs): 31.5
  {
    id: "paint21",
    name: "Paint 21 · Generated",
    gridCols: 5,
    gridRows: 4,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 4, row: 2 },
      },
      {
        id: "piece-2",
        color: "blue",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 0, dy: 2 }, { dx: 1, dy: 0 }],
        origin: { col: 3, row: 0 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-3",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 1, row: 3 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-4",
        color: "red",
        cells: [{ dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 2, dy: 1 }, { dx: 2, dy: 0 }],
        origin: { col: 2, row: 1 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-5",
        color: "green",
        cells: [{ dx: 0, dy: 2 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 1, row: 1 },
        start: { rotate: 3 },
      },
      {
        id: "piece-6",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 0, row: 3 },
      },
      {
        id: "decoy-1",
        color: "green",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 0, dy: 2 }, { dx: 1, dy: 0 }],
        decoy: true,
        start: { flip: true },
      }
    ],
  },
  // difficulty score (solver-rs): 33.0
  {
    id: "paint22",
    name: "Paint 22 · Generated",
    gridCols: 5,
    gridRows: 5,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 3, row: 3 },
        start: { rotate: 2 },
      },
      {
        id: "piece-2",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: 2 }],
        origin: { col: 2, row: 2 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-3",
        color: "blue",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 0, row: 0 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-4",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 1, row: 2 },
        start: { rotate: 1 },
      },
      {
        id: "piece-5",
        color: "red",
        cells: [{ dx: 0, dy: 2 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 2 }],
        origin: { col: 3, row: 0 },
        start: { rotate: 1 },
      },
      {
        id: "piece-6",
        color: "green",
        cells: [{ dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
        origin: { col: 2, row: 1 },
        start: { rotate: 3 },
      },
      {
        id: "piece-7",
        color: "green",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 2, dy: 0 }],
        origin: { col: 0, row: 0 },
        start: { flip: true },
      },
      {
        id: "decoy-1",
        color: "blue",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 2, dy: 0 }],
        decoy: true,
      }
    ],
  },
  // difficulty score (solver-rs): 38.0
  {
    id: "paint23",
    name: "Paint 23 · Generated",
    gridCols: 5,
    gridRows: 5,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 3, row: 2 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-2",
        color: "red",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 2, dy: 1 }],
        origin: { col: 2, row: 1 },
        start: { rotate: 1 },
      },
      {
        id: "piece-3",
        color: "green",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 3, row: 0 },
        start: { rotate: 3 },
      },
      {
        id: "piece-4",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 0, row: 0 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-5",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 0, row: 4 },
        start: { rotate: 1 },
      },
      {
        id: "piece-6",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 2, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 0, row: 3 },
        start: { rotate: 3 },
      },
      {
        id: "piece-7",
        color: "blue",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 0, dy: 2 }],
        origin: { col: 4, row: 2 },
      },
      {
        id: "piece-8",
        color: "green",
        cells: [{ dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 0, dy: 0 }, { dx: 0, dy: 2 }],
        origin: { col: 2, row: 1 },
      },
      {
        id: "decoy-1",
        color: "red",
        cells: [{ dx: 0, dy: 2 }, { dx: 0, dy: 1 }, { dx: 0, dy: 3 }, { dx: 0, dy: 0 }],
        decoy: true,
        start: { rotate: 2, flip: true },
      },
      {
        id: "decoy-2",
        color: "blue",
        cells: [{ dx: 0, dy: 2 }, { dx: 0, dy: 1 }, { dx: 0, dy: 3 }, { dx: 0, dy: 0 }],
        decoy: true,
        start: { rotate: 3 },
      }
    ],
  },
  // difficulty score (solver-rs): 41.0
  {
    id: "paint24",
    name: "Paint 24 · Generated",
    gridCols: 5,
    gridRows: 5,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 1, row: 1 },
        start: { flip: true },
      },
      {
        id: "piece-2",
        color: "green",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 1, row: 0 },
        start: { rotate: 1 },
      },
      {
        id: "piece-3",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 1, row: 2 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-4",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 2, dy: 0 }],
        origin: { col: 0, row: 1 },
        start: { rotate: 3 },
      },
      {
        id: "piece-5",
        color: "blue",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 2, dy: 1 }],
        origin: { col: 2, row: 0 },
        start: { rotate: 1 },
      },
      {
        id: "piece-6",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
        origin: { col: 3, row: 1 },
        start: { rotate: 2 },
      },
      {
        id: "piece-7",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 1, row: 0 },
        start: { flip: true },
      },
      {
        id: "piece-8",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 1, row: 4 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "decoy-1",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }],
        decoy: true,
        start: { rotate: 2, flip: true },
      },
      {
        id: "decoy-2",
        color: "red",
        cells: [{ dx: 1, dy: 1 }, { dx: 2, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        decoy: true,
        start: { rotate: 2 },
      }
    ],
  },
  // difficulty score (solver-rs): 42.0
  {
    id: "paint25",
    name: "Paint 25 · Generated",
    gridCols: 5,
    gridRows: 5,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "blue",
        cells: [{ dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 0 }],
        origin: { col: 3, row: 0 },
      },
      {
        id: "piece-2",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 1, row: 4 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-3",
        color: "red",
        cells: [{ dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 3, row: 2 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-4",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 0, row: 2 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-5",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 0 }, { dx: 2, dy: 0 }],
        origin: { col: 1, row: 3 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-6",
        color: "red",
        cells: [{ dx: 2, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 0, row: 0 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-7",
        color: "red",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 2 }, { dx: 0, dy: 3 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 1 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-8",
        color: "green",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
        origin: { col: 2, row: 3 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-9",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 3, row: 3 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "decoy-1",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: 2 }, { dx: 1, dy: 2 }],
        decoy: true,
      }
    ],
  },
  // difficulty score (solver-rs): 46.0
  {
    id: "paint26",
    name: "Paint 26 · Generated",
    gridCols: 6,
    gridRows: 5,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 }],
        origin: { col: 0, row: 1 },
      },
      {
        id: "piece-2",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }],
        origin: { col: 0, row: 3 },
        start: { rotate: 3 },
      },
      {
        id: "piece-3",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 1, dy: 1 }],
        origin: { col: 3, row: 2 },
        start: { flip: true },
      },
      {
        id: "piece-4",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 4, row: 4 },
        start: { flip: true },
      },
      {
        id: "piece-5",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 5, row: 2 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-6",
        color: "blue",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 0, dy: 2 }],
        origin: { col: 5, row: 1 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-7",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 4, row: 1 },
        start: { rotate: 2 },
      },
      {
        id: "piece-8",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 4, row: 0 },
        start: { rotate: 2 },
      },
      {
        id: "piece-9",
        color: "green",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 1, row: 3 },
        start: { rotate: 1 },
      },
      {
        id: "piece-10",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: 2 }],
        origin: { col: 5, row: 1 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "decoy-1",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }],
        decoy: true,
        start: { rotate: 2, flip: true },
      },
      {
        id: "decoy-2",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }],
        decoy: true,
        start: { flip: true },
      }
    ],
  },
  // difficulty score (solver-rs): 50.0
  {
    id: "paint27",
    name: "Paint 27 · Generated",
    gridCols: 5,
    gridRows: 5,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "green",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 0, row: 4 },
      },
      {
        id: "piece-2",
        color: "red",
        cells: [{ dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
        origin: { col: 0, row: 2 },
        start: { flip: true },
      },
      {
        id: "piece-3",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 2, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 1, row: 0 },
        start: { flip: true },
      },
      {
        id: "piece-4",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 }],
        origin: { col: 0, row: 1 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-5",
        color: "green",
        cells: [{ dx: 0, dy: 2 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 1 }],
        origin: { col: 3, row: 0 },
        start: { flip: true },
      },
      {
        id: "piece-6",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 2, row: 2 },
        start: { rotate: 2 },
      },
      {
        id: "piece-7",
        color: "red",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 1, row: 0 },
        start: { rotate: 3 },
      },
      {
        id: "piece-8",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }],
        origin: { col: 0, row: 1 },
      },
      {
        id: "decoy-1",
        color: "blue",
        cells: [{ dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
        decoy: true,
        start: { flip: true },
      },
      {
        id: "decoy-2",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 1, dy: 2 }, { dx: 0, dy: 1 }],
        decoy: true,
        start: { rotate: 1, flip: true },
      }
    ],
  },
  // difficulty score (solver-rs): 52.5
  {
    id: "paint28",
    name: "Paint 28 · Generated",
    gridCols: 5,
    gridRows: 5,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 3, row: 1 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-2",
        color: "red",
        cells: [{ dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 0 }],
        origin: { col: 1, row: 3 },
        start: { flip: true },
      },
      {
        id: "piece-3",
        color: "blue",
        cells: [{ dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 1, row: 0 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-4",
        color: "green",
        cells: [{ dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 0 }],
        origin: { col: 2, row: 0 },
      },
      {
        id: "piece-5",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 0, row: 2 },
        start: { rotate: 1 },
      },
      {
        id: "piece-6",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 0, row: 1 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-7",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 3, row: 3 },
      },
      {
        id: "piece-8",
        color: "blue",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }, { dx: 0, dy: 2 }, { dx: 1, dy: 1 }],
        origin: { col: 3, row: 1 },
        start: { rotate: 2 },
      },
      {
        id: "piece-9",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 2, dy: 1 }, { dx: 0, dy: 1 }],
        origin: { col: 2, row: 1 },
        start: { rotate: 1 },
      },
      {
        id: "decoy-1",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 2, dy: 1 }, { dx: 0, dy: 1 }],
        decoy: true,
        start: { rotate: 2 },
      },
      {
        id: "decoy-2",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 2, dy: 1 }, { dx: 0, dy: 1 }],
        decoy: true,
        start: { rotate: 1 },
      }
    ],
  },
  // difficulty score (solver-rs): 55.5
  {
    id: "paint29",
    name: "Paint 29 · Generated",
    gridCols: 5,
    gridRows: 5,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 0, row: 2 },
      },
      {
        id: "piece-2",
        color: "green",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 3, row: 1 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-3",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 1, row: 0 },
      },
      {
        id: "piece-4",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 3, row: 3 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-5",
        color: "green",
        cells: [{ dx: 0, dy: 3 }, { dx: 0, dy: 2 }, { dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 4, row: 1 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-6",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 2, row: 0 },
        start: { rotate: 2 },
      },
      {
        id: "piece-7",
        color: "red",
        cells: [{ dx: 1, dy: 2 }, { dx: 1, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 2 }],
        origin: { col: 1, row: 1 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-8",
        color: "blue",
        cells: [{ dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 2, row: 0 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-9",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: 0 }, { dx: 3, dy: 0 }],
        origin: { col: 1, row: 4 },
        start: { rotate: 1 },
      },
      {
        id: "decoy-1",
        color: "blue",
        cells: [{ dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 0, dy: 2 }, { dx: 1, dy: 0 }],
        decoy: true,
        start: { rotate: 3 },
      },
      {
        id: "decoy-2",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }],
        decoy: true,
        start: { rotate: 3, flip: true },
      }
    ],
  },
  // difficulty score (solver-rs): 67.0
  {
    id: "paint30",
    name: "Paint 30 · Generated",
    gridCols: 6,
    gridRows: 6,
    blendMode: "subtractive",
    pieces: [
      {
        id: "piece-1",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 1, dy: 2 }],
        origin: { col: 2, row: 0 },
        start: { rotate: 1 },
      },
      {
        id: "piece-2",
        color: "blue",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 2, dy: 0 }],
        origin: { col: 1, row: 2 },
        start: { rotate: 2 },
      },
      {
        id: "piece-3",
        color: "red",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 3, row: 4 },
        start: { rotate: 3, flip: true },
      },
      {
        id: "piece-4",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 0, row: 4 },
        start: { flip: true },
      },
      {
        id: "piece-5",
        color: "green",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 1, row: 5 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-6",
        color: "green",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }],
        origin: { col: 3, row: 4 },
        start: { rotate: 1 },
      },
      {
        id: "piece-7",
        color: "green",
        cells: [{ dx: 1, dy: 2 }, { dx: 0, dy: 2 }, { dx: 1, dy: 1 }, { dx: 1, dy: 0 }],
        origin: { col: 3, row: 1 },
        start: { rotate: 2, flip: true },
      },
      {
        id: "piece-8",
        color: "blue",
        cells: [{ dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
        origin: { col: 4, row: 0 },
        start: { rotate: 2 },
      },
      {
        id: "piece-9",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 4, row: 3 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "piece-10",
        color: "blue",
        cells: [{ dx: 0, dy: 1 }, { dx: 0, dy: 0 }],
        origin: { col: 4, row: 4 },
        start: { rotate: 1, flip: true },
      },
      {
        id: "decoy-1",
        color: "red",
        cells: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 2, dy: 0 }],
        decoy: true,
        start: { rotate: 3, flip: true },
      },
      {
        id: "decoy-2",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 1, dy: 0 }],
        decoy: true,
        start: { flip: true },
      }
    ],
  },
];

function buildTarget(level) {
  const target = Array.from({ length: level.gridRows }, () => Array(level.gridCols).fill(null));
  const contributions = Array.from({ length: level.gridRows }, () =>
    Array.from({ length: level.gridCols }, () => [])
  );
  for (const def of level.pieces) {
    if (def.decoy) continue; // decoys never belong in the target; see Level 3
    for (const cell of def.cells) {
      const col = def.origin.col + cell.dx;
      const row = def.origin.row + cell.dy;
      contributions[row][col].push(PIGMENTS[def.color]);
    }
  }
  for (let row = 0; row < level.gridRows; row++) {
    for (let col = 0; col < level.gridCols; col++) {
      target[row][col] = combineColors(contributions[row][col], level.blendMode);
    }
  }
  return target;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    PIGMENTS,
    RED,
    GREEN,
    BLUE,
    AMBER,
    addColors,
    multiplyColors,
    combineColors,
    colorsEqual,
    cssColor,
    normalize,
    rotate90,
    flipHorizontal,
    boundingSize,
    applyStartTransform,
    buildTarget,
    LEVELS,
    PAINT_LEVELS,
  };
}
