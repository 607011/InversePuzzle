#!/usr/bin/env node
"use strict";

// Dev-tool bridge: dumps levels.js's LEVELS and PIGMENTS to plain JSON, so the Rust
// solver/generator (solver-rs/) can read the exact same level data without levels.js
// needing to know anything about Rust. levels.js stays the single source of truth for
// what the game actually ships; this file is just a snapshot for external tooling.
//
// Usage:
//   node export-levels.js [output-path]   # defaults to levels.json

const fs = require("fs");
const { LEVELS, PIGMENTS } = require("./levels.js");

const outPath = process.argv[2] || "levels.json";

const data = {
  pigments: PIGMENTS,
  levels: LEVELS.map((level) => ({
    id: level.id,
    name: level.name,
    gridCols: level.gridCols,
    gridRows: level.gridRows,
    pieces: level.pieces.map((p) => ({
      id: p.id,
      color: p.color,
      cells: p.cells,
      origin: p.origin || null,
      decoy: !!p.decoy,
      start: p.start || null,
    })),
  })),
};

fs.writeFileSync(outPath, JSON.stringify(data, null, 2) + "\n");
console.log(`Wrote ${LEVELS.length} level(s) to ${outPath}`);
