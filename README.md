# Inverse Puzzle

A puzzle concept where you overlap colored polyomino pieces to reconstruct a target pattern. Colors mix **additively** where pieces overlap (like light: Red + Green = Yellow, Green + Blue = Cyan, ...). The twist: you work backward from the target — figuring out which pieces, in which orientation and position, combine to produce exactly the colors and shape shown.

## How to play

1. Open [index.html](index.html) directly in a browser (no build step, no server required).
2. Drag pieces from the tray onto the workspace grid.
3. Rotate (`R`) or flip (`F`) a piece — either while dragging it, or after selecting it in the tray with a plain click (no drag).
4. Overlapping pieces mix their colors additively, clamped at 255 per channel.
5. Match every cell of the workspace exactly to the target grid to solve the level.

## Tech

Plain HTML/CSS/JavaScript. No frameworks, no build tools, no dependencies. `script.js` is a single classic script (not an ES module), so the page also works when opened straight from the filesystem (`file://`).

- [index.html](index.html) — markup and instructions
- [style.css](style.css) — dark theme, grid/piece/ghost styling
- [script.js](script.js) — color model, level data, piece transforms, rendering, drag-and-drop interaction

## Current state

This is an early prototype with a single hand-built level, meant to validate the core mechanic (additive color mixing as the puzzle constraint) before investing in level generation, more pieces, or difficulty tuning. See [STATUS.md](STATUS.md) for a detailed log of what's done and what's planned.
