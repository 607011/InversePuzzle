"use strict";

// Shared, pure game data and logic: the color model, piece transforms, and level
// definitions. Loaded as a plain classic <script> in the browser (defines globals
// consumed by script.js) and required() as a CommonJS module by Node tools (e.g. solver.js).
// No build step either way.

// ---------- Color model ----------
// Each base pigment is added channel-wise and clamped to 0-255 ("light" mixing).
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
  {
    id: "level1",
    name: "Level 1 · Basics",
    gridCols: 3,
    gridRows: 2,
    pieces: [
      {
        id: "green-piece",
        color: "green",
        cells: [
          { dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 },
          { dx: 1, dy: 1 }, { dx: 2, dy: 1 },
        ],
        origin: { col: 0, row: 0 },
      },
      {
        id: "red-piece",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
        origin: { col: 0, row: 1 },
      },
      {
        id: "blue-piece",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }],
        origin: { col: 0, row: 0 },
      },
    ],
  },
  {
    id: "level2",
    name: "Level 2 · Look again",
    gridCols: 4,
    gridRows: 3,
    pieces: [
      // Green and red overlap at (0,0) and (1,1), producing two amber cells diagonally
      // from each other, plus one pure-green and one pure-red cell.
      {
        id: "green-piece",
        color: "green",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }],
        origin: { col: 0, row: 0 },
        start: { rotate: 2 },
      },
      {
        id: "red-piece",
        color: "red",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 }],
        origin: { col: 0, row: 0 },
        start: { rotate: 1 },
      },
      // A single piece already painted with the premixed amber pigment: pixel-identical
      // to the red+green overlap above, but it is its own separate patch elsewhere.
      {
        id: "amber-piece",
        color: "amber",
        cells: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }],
        origin: { col: 3, row: 0 },
        start: { rotate: 1 },
      },
      {
        id: "blue-piece",
        color: "blue",
        cells: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
        origin: { col: 2, row: 2 },
        start: { rotate: 1 },
      },
    ],
  },
];

function buildTarget(level) {
  const target = Array.from({ length: level.gridRows }, () => Array(level.gridCols).fill(null));
  const contributions = Array.from({ length: level.gridRows }, () =>
    Array.from({ length: level.gridCols }, () => [])
  );
  for (const def of level.pieces) {
    for (const cell of def.cells) {
      const col = def.origin.col + cell.dx;
      const row = def.origin.row + cell.dy;
      contributions[row][col].push(PIGMENTS[def.color]);
    }
  }
  for (let row = 0; row < level.gridRows; row++) {
    for (let col = 0; col < level.gridCols; col++) {
      target[row][col] = addColors(contributions[row][col]);
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
    colorsEqual,
    cssColor,
    normalize,
    rotate90,
    flipHorizontal,
    boundingSize,
    applyStartTransform,
    buildTarget,
    LEVELS,
  };
}
