# Status

Last updated: 2026-09-18 (settings menu + Hard mode added)

**Live version:** https://607011.github.io/InversePuzzle/ (GitHub Pages, serves the `main` branch root, rebuilds automatically on every push)

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
  - Live color preview while hovering a valid drop position: both the ghost and the workspace cells underneath show the *actual resulting* mixed color (existing placed color + the dragged piece's pigment, clamped), not just an outline. This is exact, not approximate — clamping is monotonic under addition (once a channel is saturated it stays saturated), so mixing the already-clamped displayed color with the new pigment and re-clamping gives the identical result to summing the raw contributions from scratch.
- **Shared data module** (`levels.js`): color model, transforms, and level definitions extracted out of `script.js` into a file that works unchanged both as a browser `<script>` (defines globals, loaded before `script.js`) and as a Node.js `require()`-able CommonJS module (via a trailing `if (typeof module !== "undefined") module.exports = {...}` guard). No build step needed on either side. This exists so the solver (below) can never drift out of sync with what the game actually plays.
- **Level select UI**: a row of buttons above the puzzle switches between levels via `loadLevel(index)`, which rebuilds the target, resets all pieces, and clears any in-progress drag/selection state.
- **Level 2, "Look again"** — the first difficulty idea from the list below, implemented: two patches of the target grid are colored *identically* (same exact RGB), but one is built from a genuine red+green overlap and the other from a single piece pre-painted with a "premixed" pigment (`amber`, defined as exactly `addColors([red, green])` so it's pixel-identical by construction, not by coincidence). The color alone can never tell the two patches apart — only the piece shapes (and the fact that there's only one red and one green piece to go around) resolve which is which. Pieces also start pre-rotated (`start: {rotate: n}` in the level data) so the solution orientation has to be rediscovered, not just the position.
- **Solver** (`solver.js`): a standalone Node.js dev tool (not loaded by the game), see its own section below.
- **Win condition generalized**: `checkWin` no longer requires every piece to be placed — it only checks that every grid cell's color matches the target. This was a prerequisite for Level 3 (below): a required piece being unplaced still fails correctly (some cell stays wrong/empty), so the relaxation is safe, and it's what makes "leave this piece in the tray" a legitimate winning move.
- **Level 3, "Red herrings"** — difficulty idea 3 (decoy pieces), implemented: 3 real pieces (blue monomino, green domino, red monomino overlapping the green domino to make yellow) plus 2 decoys that share a color or a shape with a real piece but are never usable anywhere: a blue *domino* (the only blue needed is a single isolated cell, so it always spills onto a neighboring cell), and a red piece with the exact same domino shape as the real green piece (fits the silhouette perfectly, wrong color). Because any piece not part of the true solution would have to touch a cell that's either already exactly right or must stay empty, a genuine decoy is automatically unplaceable by construction — no special-case "this piece is fake" logic needed anywhere in the game code, it falls directly out of the existing exact-match rule. `levels.js` marks them with `decoy: true`, which `buildTarget` uses to skip them when computing the target (they still need real `cells`/`start` data to render and drag normally, just no `origin`, since decoys never contribute color).
- **Settings menu + Hard mode**: a hamburger button in the header opens a dropdown panel (a `<div>` positioned `absolute` inside a `position: relative` wrapper, toggled via a `hidden` attribute and closed on outside click). Its one setting so far, "Hard mode" (persisted in `localStorage`), does two things: (1) the live color preview from above is suppressed — the positional "you can drop here" outline still shows, but the actual resulting color is withheld, so you have to reason about the mix yourself before committing; (2) a piece can no longer be picked back up off the workspace once dropped (the grid cells' `pointerdown` handler just returns early), making placement decisions permanent. "Reset level" still works in hard mode — the puzzle can always be restarted from scratch, only *selective* undo is disabled.

### Bugs found and fixed during development

- Re-rendering the whole workspace grid DOM on every `mouseenter` (old click-based interaction) destroyed the very cell element a subsequent click was targeting, so clicks silently did nothing. Fixed by only toggling CSS classes on cached cell elements for hover feedback, never rebuilding the DOM mid-gesture.
- The tray preview didn't reflect a piece's live rotation/flip while it was picked up, because it rendered the piece's committed shape instead of the in-hand transformed shape.
- (Testing artifact, not a shipped bug) The browser used for verification cached a stale `script.js`; worth remembering if manual testing ever "sees" old behavior after an edit — hard-reload or cache-bust the script URL.
- (Testing artifact) While manually playtesting Level 2's rotation, forgot that undoing a 90° starting scramble on an asymmetric L-tromino needs 3 more clockwise clicks, not 1 (rotation isn't its own inverse unless the shape has the matching symmetry) — a reminder for testing by hand, not an app bug.

## Solver

`solver.js` is a Node.js-only dev tool (never loaded by the game) that exhaustively finds every way to place *some or all* of a level's pieces — across every distinct rotation/flip, every grid position, or left unplaced entirely — that reproduces the target exactly. Built to answer one question: does a level (especially one deliberately designed to *look* ambiguous while solving, like Level 2, or one with decoys, like Level 3) actually have more than one *real* solution, or an unintentionally placeable decoy, which would be a design bug?

Run it with `node solver.js` (all levels) or `node solver.js <id-or-index>` (one level).

Performance approach (this was an explicit requirement, not just "make it work"):

- **Orientation dedup**: a piece's up to 8 dihedral transforms (4 rotations × mirrored/not) are generated once and deduplicated by a canonical cell-signature, so shapes with symmetry (a 2×2 square, a domino) don't get searched redundantly under different names.
- **Placement prefiltering**: for each orientation, every grid position is precomputed once; a position is only kept if every cell it covers both fits in the grid and has a non-null target color. Pieces can never legally touch a "background" cell, so this eliminates most positions before the search even starts.
- **Most-constrained-first ordering**: pieces are searched in ascending order of how many valid placements they have, a standard CSP heuristic — the piece with the fewest options is tried first, so a doomed branch fails immediately instead of many pieces deep. "Leave unplaced" is one more option available to every piece, so a piece with zero real placements (an unconditional decoy) doesn't make the level unsolvable — it just always sits out.
- **Monotonic pruning**: pigments only ever add, never subtract, so a cell's running per-channel sum can only grow as more pieces are placed on it. The moment a channel's running sum exceeds the target's value there (for a channel that isn't already saturated at 255), that branch can be abandoned immediately — it can never come back down to match. This is what turns the search from "generate every full combination, then check" into "die after the first wrong overlap."
- Verified against a deliberately ambiguous test level (two identical monominoes, two interchangeable target cells) that the solver correctly reports 2 solutions rather than over-pruning to 1 — i.e. the pruning is sound, not just fast.

Current result: all three levels have exactly one solution. Level 2's visual trap is a genuine red herring during solving, not an accidental second valid arrangement, and Level 3's two decoys are confirmed mathematically unplaceable anywhere without breaking the match (each ends up "(left in tray)" in the one solution found) — all found in well under a millisecond, visiting a couple dozen search nodes at most (these puzzles are tiny; the pruning above matters more as levels grow larger).

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

**Idea 1 is now implemented** (Level 2, described above) — though via the "premixed pigment" variant of the idea (a dedicated piece whose color exactly equals another combination's sum) rather than pure channel-saturation trickery, since that turned out to be the cleaner and more reliably-constructible way to guarantee genuine, exact color ambiguity rather than a merely close/confusable one.

**Idea 3 is now implemented** (Level 3, described above). Ideas 2, 4, and 5 remain open.

## Next steps (not yet started)

- [ ] Try difficulty idea 2, 4, or 5 from the list above for a Level 4.
- [ ] Decide on and build a difficulty progression once more than 2-3 levels exist.
- [ ] Consider having the solver double as an in-game/CI sanity check (e.g. a script that fails CI if any level has zero or more-than-expected solutions), rather than only a manually-run dev tool.
- [ ] Longer-term, evaluate procedural level generation (start from a random target, decompose into pieces) — deliberately deferred until the mechanic and difficulty levers are validated by hand-built levels. The solver's placement-enumeration logic would likely be reusable for this (generate candidate piece sets, then use the solver to confirm uniqueness).
