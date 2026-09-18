#!/usr/bin/env node
"use strict";

// Dev-tool bridge, the reverse of export-levels.js: takes a level JSON file produced by
// `solver-rs`'s `generate` binary and pretty-prints it as a JS object literal in the same
// style as the entries in levels.js's LEVELS array, ready to paste in. Rust never writes to
// levels.js directly — this keeps a human in the loop to pick an id/name and glance over the
// result before it becomes part of the shipped game.
//
// Usage:
//   node json-to-level.js path/to/generated-level.json

const fs = require("fs");

const inPath = process.argv[2];
if (!inPath) {
  console.error("Usage: node json-to-level.js path/to/generated-level.json");
  process.exit(1);
}

const level = JSON.parse(fs.readFileSync(inPath, "utf8"));

function cellsLiteral(cells) {
  return `[${cells.map((c) => `{ dx: ${c.dx}, dy: ${c.dy} }`).join(", ")}]`;
}

function pieceLiteral(p) {
  const lines = [`id: ${JSON.stringify(p.id)}`, `color: ${JSON.stringify(p.color)}`, `cells: ${cellsLiteral(p.cells)}`];
  if (p.origin) lines.push(`origin: { col: ${p.origin.col}, row: ${p.origin.row} }`);
  if (p.decoy) lines.push(`decoy: true`);
  if (p.start && (p.start.rotate || p.start.flip)) {
    const parts = [];
    if (p.start.rotate) parts.push(`rotate: ${p.start.rotate}`);
    if (p.start.flip) parts.push(`flip: true`);
    lines.push(`start: { ${parts.join(", ")} }`);
  }
  return `  {\n    ${lines.join(",\n    ")},\n  }`;
}

const blendModeLine = level.blendMode && level.blendMode !== "additive" ? `\n  blendMode: ${JSON.stringify(level.blendMode)},` : "";

const out = `{
  id: ${JSON.stringify(level.id)},
  name: ${JSON.stringify(level.name)},
  gridCols: ${level.gridCols},
  gridRows: ${level.gridRows},${blendModeLine}
  pieces: [
${level.pieces.map(pieceLiteral).join(",\n")}
  ],
}`;

console.log(out);
console.error("\n// Paste the above into levels.js's LEVELS array (give it a real id/name first).");
