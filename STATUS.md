# Status

Last updated: 2026-09-17

## Concept

A puzzle where colored polyomino pieces are dragged, rotated, and overlapped on a grid. Overlapping cells mix their pigment colors additively (channel-wise sum, clamped to 0-255). The goal is to reconstruct a fixed target pattern of colors exactly — shape and color both have to match. The "inverse" framing: instead of assembling a picture from shapes, you reverse-engineer which pigment combinations produce the required target colors.

## Done

- **Core mechanic prototype** (`script.js`, `style.css`, `index.html`): plain HTML/CSS/JS, no build step, works opened directly via `file://`.
- **Color model**: three base pigments (red, green, blue), additive mixing with per-channel clamping at 255.
- **One hand-built level**: a 2x3 target grid solved by 3 monochrome pieces (a 5-cell green piece, a 2-cell red domino, a 1-cell blue piece) whose overlaps produce cyan, yellow, and two pure colors.
- **Piece transforms**: rotate 90° and horizontal flip, both normalized back to a canonical top-left-anchored cell list.
- **Win detection**: exact per-cell color match required between workspace and target; no partial credit.
- **Interaction, iteration 1 (click-based)**: click a tray piece to pick it up, click a grid cell to place it. Superseded by drag-and-drop (see below) because it felt unintuitive.
- **Interaction, iteration 2 (drag-and-drop, current)**:
  - Pointer Events (`pointerdown`/`pointermove`/`pointerup`), works for mouse and touch (`touch-action: none` on draggable elements).
  - Dragging a piece (from the tray, or picking one back up off the workspace) spawns a full-size ghost that tracks the pointer and previews valid/invalid drop cells.
  - A plain click (pointer down+up without crossing a small movement threshold) on a tray piece selects it instead of dragging, so it can be rotated/flipped with the buttons or `R`/`F` before being dragged.
  - `R` / `F` also work live during an active drag (the ghost updates immediately).
  - Dropping outside the grid reverts the piece: back to the tray if it came from the tray, back to its previous position if it was already placed.
  - `Esc` cancels an in-progress drag and reverts.

### Bugs found and fixed during development

- Re-rendering the whole workspace grid DOM on every `mouseenter` (old click-based interaction) destroyed the very cell element a subsequent click was targeting, so clicks silently did nothing. Fixed by only toggling CSS classes on cached cell elements for hover feedback, never rebuilding the DOM mid-gesture.
- The tray preview didn't reflect a piece's live rotation/flip while it was picked up, because it rendered the piece's committed shape instead of the in-hand transformed shape.
- (Testing artifact, not a shipped bug) The browser used for verification cached a stale `script.js`; worth remembering if manual testing ever "sees" old behavior after an edit — hard-reload or cache-bust the script URL.

## Open questions / decisions already made

- Transform freedom: rotation **and** flipping are both allowed (chosen over move-only or rotate-only).
- Level authoring: current level is hand-built, not procedurally generated (deliberate, to validate the mechanic first).
- Color model: real channel-wise additive RGB with clamping, not a fixed lookup table of predefined color combinations.
- Win condition: exact color+shape match required everywhere; no "shape only" fallback.

## Ideas for making levels genuinely difficult

Discussed as a deliberate alternative to just scaling grid size / piece count, which is the least interesting difficulty lever. Ideas, roughly in order of how directly they follow from the existing mechanic:

1. **Ambiguous target colors via clamping** — design levels where a target color is reachable by more than one combination of pieces because channel values saturate at 255 and lose information. The player can be led toward a combination that "looks" right until a specific cell is checked closely. (Candidate first pick: elegant, needs no new UI, follows directly from the existing color model.)
2. **More/non-orthogonal pigments** — instead of pure R/G/B, use 4-5 pigments with overlapping channel contributions, which increases the combinatorial space of "which pieces sum to this target."
3. **Decoy pieces** — extra pieces in the tray that don't belong in the solution, forcing genuine combination reasoning instead of "just place everything."
4. **Blend-mode or order-dependent special pieces** — most pieces stay additive, but introduce occasional pieces that use a different blend mode (e.g. multiply, or alpha blending) so stacking order starts to matter, compounding with rotation/flip choices.
5. **Partially hidden piece shapes** — a piece's true footprint is only revealed once it overlaps something else (e.g. some cells start "invisible" until covered), mixing shape discovery with color discovery.

None of these are implemented yet. First planned iteration: **idea 1** (ambiguous target colors from clamping), since it's the cheapest to build on top of the current level-data structure.

## Next steps (not yet started)

- [ ] Build a second, deliberately tricky level using the clamping-ambiguity idea.
- [ ] Consider a level-select / multi-level structure (currently the game hardcodes exactly one level).
- [ ] Decide on and build a difficulty progression once more than 2-3 levels exist.
- [ ] Longer-term, evaluate procedural level generation (start from a random target, decompose into pieces) — deliberately deferred until the mechanic and difficulty levers are validated by hand-built levels.
