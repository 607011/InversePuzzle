# inverse-puzzle-solver (Rust)

A dev-only Rust port of `../solver.js`, plus a level **generator**. Never loaded by the game — this exists purely for level design/validation speed. `../levels.js` remains the single source of truth for what actually ships; this crate reads/writes the JSON schema produced by `../export-levels.js`.

## Build

```bash
cargo build --release
```

## Solve

```bash
cd ..
node export-levels.js          # writes levels.json from levels.js
cd solver-rs
./target/release/solve                 # every level in ../levels.json
./target/release/solve ../levels.json level2   # one level, by id or index
```

Reports solution count, timing, search-node count, and a difficulty breakdown (see "Difficulty metrics" below) for each level — see `../solver.js`'s header comment for the pruning approach both implementations share (orientation dedup, non-null-cell prefiltering, most-constrained-first ordering, monotonic per-channel pruning, "leave unplaced" as a legal move for decoys).

## Generate

```bash
./target/release/generate --cols 4 --rows 4 --pieces 3 --decoys 1
```

Builds a level *constructively* — random pieces placed at random positions, with the target derived from that placement — rather than by searching backwards from a random target (which would be a genuinely hard combinatorial problem; see the design discussion in `../STATUS.md`). The only search involved is bounded and cheap: confirming each decoy has zero plausible placements, and confirming the assembled level has exactly one real solution via the full solver, retrying with a fresh random candidate (up to `--attempts`, default 500) if not. Typical runs take well under a millisecond.

Key options: `--cols`, `--rows`, `--pieces`, `--decoys`, `--max-size` (largest piece, in cells), `--colors` (comma-separated pigment names), `--min-score`/`--max-score` (reject candidates outside a difficulty band), `--out` (output path, default `generated-level.json`).

Writes the result as JSON (one level object). Turn it into a levels.js-ready snippet with:

```bash
cd ..
node json-to-level.js solver-rs/generated-level.json
```

...then paste the printed object into `LEVELS` in `levels.js` (after giving it a real `id`/`name`) and re-run `node export-levels.js && cargo run --release --bin solve` from `solver-rs/` to confirm it still checks out from the canonical source.

## Difficulty metrics

There's no single canonical "human difficulty" for this kind of puzzle, so rather than fabricate one number, the solver reports several concrete, cheaply-computed structural stats (see `src/difficulty.rs` for exact definitions and rationale):

- **shape-only placements** — how many (orientation, position) combinations fit the grid and land only on non-empty target cells, ignoring color. A rough proxy for how much a player has to consider geometrically.
- **locally-plausible placements** — the subset of the above that also don't overshoot any color channel when checked in isolation against an empty board. Cheap to compute (no combinatorics) yet a sound over-approximation of "could this placement ever be part of any solution."
- **red herrings** — locally-plausible placements minus the one actually used per piece in the (required-to-be-unique) solution: how many "this might fit" options a careful player still has to rule out.
- **duplicate-color regions** — how many distinct target colors appear in 2+ separate (non-4-connected) patches of the grid. This is the general form of Level 2's "look again" trick (the same exact color arising two different ways), and empirically the strongest single signal: it's what actually made Level 2 score highest among the three hand-built levels.
- **sneaky decoys** — how many decoy pieces have at least one locally-plausible placement (as opposed to failing even a careless color check).
- **score** — a weighted sum of the above (see `score_from` in `src/difficulty.rs`), weighted so a duplicate-color region counts far more than an ordinary red herring. The weights are a starting point, not validated against real playtesting — tune them as you get more levels and player feedback.

A level with zero or more than one real solution gets no score (`solution_count != 1` is a design bug to fix, not a difficulty level to rate).
