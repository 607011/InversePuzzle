# Inverse Puzzle

**Play the latest version:** https://607011.github.io/InversePuzzle/

A puzzle concept where you overlap colored polyomino pieces to reconstruct a target pattern. Colors mix **additively** where pieces overlap (like light: Red + Green = Yellow, Green + Blue = Cyan, ...). The twist: you work backward from the target — figuring out which pieces, in which orientation and position, combine to produce exactly the colors and shape shown.

## How to play

1. Open [index.html](index.html) directly in a browser (no build step, no server required).
2. Pick a level with the buttons at the top.
3. Drag pieces from the tray onto the workspace grid.
4. Rotate (`R`) or flip (`F`) a piece — either while dragging it, or after selecting it in the tray with a plain click (no drag).
5. Overlapping pieces mix their colors additively, clamped at 255 per channel.
6. Match every cell of the workspace exactly to the target grid to solve the level.
7. Not every piece has to be used — some levels include pieces that never belong anywhere.

## Tech

Plain HTML/CSS/JavaScript. No frameworks, no build tools, no dependencies. Everything is loaded as classic `<script>` tags (no ES modules), so the page also works when opened straight from the filesystem (`file://`).

- [index.html](index.html) — markup and instructions
- [style.css](style.css) — dark theme, grid/piece/ghost styling
- [levels.js](levels.js) — color model, piece transforms, and level definitions. Written so it also loads in Node.js unchanged (see below), which is what the solver uses.
- [script.js](script.js) — game state, rendering, drag-and-drop interaction
- [solver.js](solver.js) — a dev tool, not part of the game itself (see below)

## Solver

`solver.js` is an exhaustive backtracking solver used while designing levels, to check that a level has exactly the solution(s) intended — in particular, that a level built around a deliberate visual trap (like Level 2) or decoy pieces (like Level 3) doesn't accidentally admit an unintended *second* real solution, or a decoy that turns out to be secretly usable.

```bash
node solver.js          # solve every level
node solver.js level2   # solve just one level, by id or index
```

It reports every way to place some or all pieces (across all rotations/flips and positions, or left unplaced) that reproduces the target exactly, plus timing and how many search nodes it visited — see the comment at the top of the file for how the pruning works.

## Current state

Three levels so far: basics, a color-ambiguity level ("Look again"), and a decoy-pieces level ("Red herrings") — each exploring a different way additive color mixing itself (not just grid size or piece count) can make a puzzle genuinely harder. See [STATUS.md](STATUS.md) for a detailed log of what's done and what's planned.
