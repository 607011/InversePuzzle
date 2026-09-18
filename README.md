# Overhue

**Play the latest version:** https://607011.github.io/Overhue/

A puzzle concept where you overlap colored polyomino pieces to reconstruct a target pattern. Colors mix **additively** where pieces overlap (like light: Red + Green = Yellow, Green + Blue = Cyan, ...). The twist: you work backward from the target — figuring out which pieces, in which orientation and position, combine to produce exactly the colors and shape shown.

## How to play

1. Open [index.html](index.html) directly in a browser (no build step, no server required).
2. Pick a level from the dropdown at the top, or step through with the ◀/▶ buttons — levels unlock in order as you solve them; a level you've already solved stays open for replay.
3. Drag pieces from the tray onto the workspace grid.
4. Rotate (`R`) or flip (`F`) a piece — either while dragging it, or after selecting it in the tray with a plain click (no drag). Drag a placed piece onto the tray to send it back (unless Hard mode is on).
5. Overlapping pieces mix their colors additively, clamped at 255 per channel.
6. While dragging, valid drop cells preview the actual resulting mixed color, not just an outline.
7. Match every cell of the workspace exactly to the target grid to solve the level.
8. Not every piece has to be used — some levels include pieces that never belong anywhere.
9. The ☰ menu has a "Hard mode": no live color preview, and pieces can't be picked back up once dropped.
10. Drag a level JSON file onto the Target panel to try it out — either one produced by [solver-rs](solver-rs)'s generator, or a full `levels.json` export ([export-levels.js](export-levels.js)). Loaded levels show up as dashed "custom" entries in the level picker; nothing is written back to `levels.js` — this is just for quick testing.

## Tech

Plain HTML/CSS/JavaScript. No frameworks, no build tools, no dependencies. Everything is loaded as classic `<script>` tags (no ES modules), so the page also works when opened straight from the filesystem (`file://`).

- [index.html](index.html) — markup and instructions
- [style.css](style.css) — dark theme, grid/piece/ghost styling
- [levels.js](levels.js) — color model, piece transforms, and level definitions. Written so it also loads in Node.js unchanged (see below), which is what the solver uses.
- [script.js](script.js) — game state, rendering, drag-and-drop interaction
- [solver.js](solver.js) — a dev tool, not part of the game itself (see below)
- [export-levels.js](export-levels.js) / [json-to-level.js](json-to-level.js) — bridge levels.js's data to/from JSON, for [solver-rs](solver-rs) (below)
- [solver-rs/](solver-rs) — a faster Rust solver, plus a level **generator**, for level design (see below)

## Solver

`solver.js` is an exhaustive backtracking solver used while designing levels, to check that a level has exactly the solution(s) intended — in particular, that a level built around a deliberate visual trap (like Level 2) or decoy pieces (like Level 3) doesn't accidentally admit an unintended *second* real solution, or a decoy that turns out to be secretly usable.

```bash
node solver.js          # solve every level
node solver.js level2   # solve just one level, by id or index
```

It reports every way to place some or all pieces (across all rotations/flips and positions, or left unplaced) that reproduces the target exactly, plus timing and how many search nodes it visited — see the comment at the top of the file for how the pruning works.

## Rust solver + generator

[solver-rs/](solver-rs) is a Rust port of the same solving algorithm (independently cross-checked against `solver.js` — both agree on every hand-built and generated level tried so far), plus a **level generator** that isn't practical to run purely in JS at scale. It reads/writes the same level data via a small JSON bridge (`export-levels.js` / `json-to-level.js`), so `levels.js` stays the one source of truth for what the game ships. It also computes a difficulty breakdown for any level — see [solver-rs/README.md](solver-rs/README.md) for usage, and for why the generator builds levels *forwards* (place pieces, derive the target) instead of searching backwards from a target, which is what keeps it fast.

## Current state

33 levels: 3 hand-built (basics, a color-ambiguity level, a decoy-pieces level — each exploring a different way additive color mixing can make a puzzle genuinely harder, not just grid size or piece count) plus 30 generated with `solver-rs`, sorted by their actual computed difficulty score into a monotonic ramp. All 33 are cross-validated by both solvers to have exactly one solution. See [STATUS.md](STATUS.md) for a detailed log of what's done and what's planned.
