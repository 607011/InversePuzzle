# Status

Last updated: 2026-09-18 (prev/next level buttons)

**Live version:** https://607011.github.io/Overhue/ (GitHub Pages, serves the `main` branch root, rebuilds automatically on every push)

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
- **Drag-and-drop level JSON import**: the Target panel accepts a dropped `.json` file for quick playtesting of a level without editing `levels.js` and reloading — dropping solver-rs's `generate` output onto it loads and switches to that level immediately. Accepts either one level object or a full `export-levels.js`-style `{ pigments, levels: [...] }` file (loads every level in it). Validated defensively (grid dimensions, piece shapes, and that every referenced color exists in `PIGMENTS`) with an inline error message on the panel for anything malformed, rather than crashing. Dropped levels are kept in a separate runtime-only `levelsList` (built-ins from `levels.js`, concatenated with whatever's been dropped) and shown as dashed "custom" buttons in the level picker — they're never written back to `levels.js`; a page reload discards them. A second drop replaces the previous custom batch rather than accumulating unboundedly.
- **Sequential level progression**: level *i* only unlocks once level *i-1* has been solved; a level you've already solved stays unlocked (and re-solvable) even after later ones open up. Tracked as a `Set` of solved level ids in `localStorage` (keyed by id, not array index, so it survives `levels.js` being reordered), checked by `isLevelUnlocked(index)`. Locked buttons in the level picker show a 🔒 and are disabled; solved ones show a ✓. Dropped/custom levels (previous bullet) are exempt from the gate entirely — they're for testing, not progression.
- **30 generated levels (Level 4-33)**: built via `solver-rs`'s generator with a rough parameter ramp (grid size 4x3 up to 6x6, real pieces 2 up to 14, decoys 0 up to 2), then — since raw generation parameters don't map cleanly to difficulty score (see `solver-rs`'s difficulty metric; e.g. a random 12-piece level scored both 70.0 and 147.0 across two runs) — **sorted by their actual computed difficulty score** to guarantee a genuinely monotonic ramp, rather than trusting parameter order alone. The last level (33) was generated to match `generate --cols 6 --rows 6 --pieces 14 --decoys 2 --attempts 10000` exactly (score 97.0, found on attempt 2077 of 10000, ~78s); everything before it was filtered to strictly lower scores so it stays the hardest. Cross-validated with both solvers: all 33 levels (3 hand-built + 30 generated) confirmed to have exactly one solution by solver.js AND solver-rs independently.
- **Level picker is a `<select>`**: swapped out the wrapping grid of level buttons (fine for 3 levels, unwieldy for 33) for a single dropdown. Locked options are `disabled` with a 🔒 prefix, solved ones get a ✓ prefix, and dropped/custom levels land in their own `<optgroup>`.
- **Renamed to Overhue**: the GitHub repo moved from `607011/InversePuzzle` to `607011/Overhue` (old URLs redirect automatically), which also moved the GitHub Pages URL. Updated everywhere the old name appeared — page title/heading, docs, the Rust crate (`inverse-puzzle-solver` → `overhue-solver`, including its Rust import paths), and the two `localStorage` keys.
- **Footer repo link**: a plain "View source on GitHub" link to the repo, `target="_blank" rel="noopener"`.
- **Prev/next level buttons**: ◀/▶ icon buttons flank the level dropdown. Previous is disabled at level 1; next is disabled at the last level *or* whenever the following level isn't unlocked yet (`isLevelUnlocked(currentLevelIndex + 1)`) — so it can't be used to skip ahead of progression, only to step back and forth across what's already open.
- **Send a placed piece back to the tray**: drag it from the workspace onto the tray panel and release. First tried as a plain click (no drag) on a placed piece, but that made it too easy to unplace something by accident — a deliberate drag onto the tray requires actual intent, matching how every other move in the game already works. Implemented in `finishDrag`: a grid-sourced drag that doesn't land on a valid cell checks whether the drop point is over the tray panel (`isPointOverTray`, a simple bounding-rect containment check against `trayEl.closest(".panel")` — the whole panel, not just the tight piece tray div, so it doesn't require pixel-perfect aim) — if so, the piece is unplaced; if not (e.g. a near-miss just outside a grid cell), it reverts to its previous position rather than being lost. Only reachable outside Hard mode, via the same `pointerdown` guard that blocks picking a piece up at all when `hardMode` is on.

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

## Rust solver + generator + difficulty metric

Follow-up to a design discussion about level generation: generating a level by inventing a random target color grid and searching for a decomposition into overlapping pieces would be a genuinely hard combinatorial problem. Generating *forwards* instead — place random pieces first, derive the target from that placement (exactly how Levels 1-3 were hand-built) — is O(1) per piece and always trivially solvable, since it *is* a solution by construction. The only real search needed is validating a candidate is *good* (uniquely solvable, decoys genuinely unplaceable), and that's cheap given how fast the solver already runs on puzzles this size.

Built `solver-rs/`, a separate Rust crate (never loaded by the game):

- **`level.rs`**: a Rust port of levels.js's color model, transforms, and `buildTarget` — reads/writes the same JSON shape as a new bridge, `export-levels.js` (dumps `LEVELS`+`PIGMENTS` to `levels.json`) and `json-to-level.js` (the reverse: formats a generated level back into a pasteable levels.js object literal). `levels.js` stays the one source of truth for the shipped game; Rust only ever sees a JSON snapshot of it.
- **`solver.rs`**: the same algorithm as `solver.js` (orientation dedup, non-null-cell prefiltering, most-constrained-first, monotonic pruning, "leave unplaced" for decoys) — **independently cross-checked against solver.js and found to agree exactly** (same solution count, same per-piece origin/shape) on all three hand-built levels and on generated levels, which is a real correctness signal since the two implementations don't share code.
- **`generator.rs`**: builds real pieces via random-walk polyomino shapes placed at random valid positions (always succeeds), then decoys via mutating a random real piece's shape-or-color and rejecting any candidate that turns out to have even one locally-plausible placement, then validates the *whole* assembled level with the real solver (must be exactly 1 solution) before accepting — regenerating from scratch (bounded, default 500 attempts) otherwise. Confirmed fast in practice: e.g. 6 real pieces + 3 decoys on a 6x6 grid with a difficulty floor found a valid level in 3 attempts / 0.8ms; an intentionally-unreachable difficulty target correctly gives up after the attempt budget rather than hanging.
- **`difficulty.rs`**: see below.

Two CLI binaries: `solve` (mirrors solver.js's CLI, plus the difficulty report) and `generate` (see `solver-rs/README.md` for all flags).

### Difficulty metric

No single canonical "human difficulty" number exists for this puzzle type, so rather than fabricate one, the solver reports several concrete, cheaply-computed structural stats, plus one documented and explicitly tunable weighted score:

- **shape-only placements**: geometric fit count per piece, ignoring color (a size/complexity proxy, the least interesting one — see "ideas" list below).
- **locally-plausible placements**: the subset of the above that also don't overshoot any color channel checked against an *empty* board in isolation. Cheap (no combinatorics — every placement that's part of any valid solution must pass this, since sums only ever grow) yet a real signal of "could a player think this piece goes here."
- **red herrings**: locally-plausible placements minus the one piece actually uses in the (must-be-unique) solution — how many plausible-looking wrong options exist per piece, summed.
- **duplicate-color regions**: the general form of Level 2's trick — flood-fill the target into same-color 4-connected regions, count how many distinct colors are split across 2+ separate regions. This turned out to be the standout signal: it's the only metric that's nonzero for Level 2 among the three hand-built levels, and correctly identifies it as the hardest of the three (score 6.0 vs. 1.5 for Level 1 and 2.5 for Level 3).
- **sneaky decoys**: how many decoys pass the locally-plausible check (vs. failing even a careless glance) — by this measure Level 3's two decoys are "cheap" (0 sneaky), since both fail on a color channel even before any other piece is considered; that's an honest, specific claim about *this* metric, not a claim that they're not visually tempting (which the game itself already achieves by giving them a matching color or shape — a different, complementary notion of trickiness this metric doesn't try to capture).
- **score**: a weighted sum (duplicate-color regions weighted far higher than plain red herrings, since that's the one that produced a real "aha" moment when the levels were built by hand) — a starting point for sorting/filtering generated levels, not a validated model of human difficulty.

A level with zero or more than one solution gets no score — that's a design bug to fix, not a difficulty level to rate.

### Bug found: exponential blowup at high piece counts

`./target/release/generate --cols 6 --rows 6 --pieces 17 --decoys 2` hung. Root cause: both solvers offered "leave this piece unplaced" as a legal branch for *every* piece, decoys and real pieces alike. That's needed for decoys, but for a non-decoy piece it's dead weight — `buildTarget` sums exactly the non-decoy pieces into the target, so in any well-formed level a non-decoy piece skipping placement can never produce an exact match. Offering the branch anyway doubled the search's branching factor at every one of N non-decoy pieces for zero possible benefit — with 17 real pieces that's up to 2^17 times more search tree than necessary.

Fixed in both `solver.js` and `solver-rs/src/solver.rs`: the "leave unplaced" branch is now only tried when `piece.isDecoy`/`piece.is_decoy` is true. Also added a hard node-count safety cap to the Rust solver (`SolveResult::truncated`, default 20M, tighter at 500k during generation) so a genuinely pathological input fails fast and honestly instead of running indefinitely — the generator treats a truncated validation as a rejection (same as finding 0 or 2+ solutions), and `difficulty::compute` refuses to score a truncated result even if it happened to see exactly one solution before giving up.

After the fix, `--pieces 17 --decoys 2` on a 6x6 grid no longer hangs — it now fails fast(ish) and *honestly* after exhausting its retry budget, because 17 pieces sharing only 4 possible colors on a 36-cell grid makes duplicate/interchangeable pieces (same shape *and* color) likely, and the generator only ever accepts a level it can prove has exactly one solution. Measured scaling on a 6x6 grid with default settings (4 colors, max piece size 4):

| real pieces | attempts to succeed | time |
|---|---|---|
| 8 | 1 | 0.6 ms |
| 10 | 40 | 131 ms |
| 12 | 442 | 8.2 s |
| 14 | (gave up) | >15 s |

This is no longer an implementation bug — it's the genuine cost of *proving* uniqueness exhaustively as overlap density grows, and it would eventually hit the same wall in any language. Practical guidance until/unless the generator grows a smarter acceptance criterion (see "Next steps"): keep piece count well under the grid's cell count, and/or grow the color palette alongside piece count to reduce collision odds.

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

- [ ] Try difficulty idea 2, 4, or 5 from the list above for a Level 4 (hand-built or via `solver-rs generate`).
- [ ] Decide on and build a difficulty progression once more than 2-3 levels exist — the new difficulty score gives a concrete axis to sort/space them along, once weights are validated against actual playtesting.
- [ ] Consider having a solver (either implementation) double as an in-game/CI sanity check (e.g. a script that fails CI if any level in levels.js has zero or more-than-expected solutions), rather than only a manually-run dev tool.
- [ ] Tune `difficulty.rs`'s score weights against real playtesting feedback once there are enough levels to compare against actual "this felt harder than that" judgments.
- [ ] Consider extending the generator with idea 2 (multiple non-orthogonal pigments) or idea 4 (order-dependent blend-mode pieces) as explicit generation strategies, not just random shape/color/position.
- [ ] For higher piece counts, consider a cheaper acceptance criterion than exhaustive-proof-of-uniqueness — e.g. reject a candidate outright if any two pieces share both shape and color (the likely cause of non-uniqueness at scale, per the blowup writeup above) before ever calling the full solver, and/or let the generator report "probably unique, not exhaustively proven" for large levels instead of only ever accepting exhaustively-proven ones.
