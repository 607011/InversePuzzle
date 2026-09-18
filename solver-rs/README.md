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

Builds a level *constructively* — random pieces placed at random positions, with the target derived from that placement — rather than by searching backwards from a random target (which would be a genuinely hard combinatorial problem; see the design discussion in `../STATUS.md`). The only search involved is bounded and cheap: confirming each decoy has zero plausible placements, and confirming the assembled level has exactly one real solution via the full solver, retrying with a fresh random candidate (up to `--attempts`, default 500) if not. Typical runs take well under a millisecond.

**1. Build (once)**

```bash
cd solver-rs
cargo build --release
```

**2. Export pigments** (the generator reads the current colors straight from `levels.js`)

```bash
cd ..
node export-levels.js
```

**3. Generate a level**

```bash
cd solver-rs
./target/release/generate --cols 4 --rows 4 --pieces 3 --decoys 1
```

| Flag | Meaning | Default |
|---|---|---|
| `--cols`, `--rows` | grid size | 4, 3 |
| `--pieces` | number of real pieces | 3 |
| `--decoys` | number of decoy pieces | 0 |
| `--max-size` | largest piece, in cells | 4 |
| `--colors` | pigment palette, comma-separated | `red,green,blue,amber` |
| `--min-score` / `--max-score` | difficulty band to require | unbounded |
| `--attempts` | max whole-level regeneration attempts | 500 |
| `--out` | output path | `generated-level.json` |

The console output already shows a difficulty report (attempts, timing, score, decoys, red herrings) — see "Difficulty metrics" below.

**4. Bring it into the game**

```bash
cd ..
node json-to-level.js solver-rs/generated-level.json
```

This prints a ready-made JS object. Paste it into `LEVELS` in `levels.js` (give it a real `id`/`name` first).

**5. Double-check** (recommended before committing)

```bash
node export-levels.js
cd solver-rs && ./target/release/solve
```

Confirms the new level, now read straight from `levels.js` again, still has exactly one solution.

Example for something trickier, in the color-ambiguity style of Level 2:

```bash
./target/release/generate --cols 5 --rows 4 --pieces 4 --colors red,green,amber --min-score 5
```

### Scaling limits

Keep `--pieces` well under `--cols` × `--rows`. Proving a level has *exactly* one solution gets exponentially harder as pieces overlap more densely on a fixed grid with a small color palette — past a point, many candidates end up with two pieces sharing both shape and color (genuinely, unavoidably interchangeable), which the generator correctly refuses to accept, and can take a long time to determine. Measured on a 6x6 grid with the default 4-color palette and max piece size 4:

| real pieces | attempts needed | time |
|---|---|---|
| 8 | 1 | 0.6 ms |
| 10 | 40 | 131 ms |
| 12 | 442 | 8.2 s |
| 14 | gave up (500 attempts) | >15 s |

A generator run is capped (`--attempts`, default 500) and each candidate's validation is separately capped (500,000 search nodes) so a bad combination of flags fails within seconds rather than hanging — but "fails fast" isn't "succeeds fast." If you need more pieces, grow `--colors` alongside them (a bigger palette makes accidental shape+color collisions far less likely) or raise `--cols`/`--rows` to give pieces more room to be distinguishable.

## Difficulty metrics

There's no single canonical "human difficulty" for this kind of puzzle, so rather than fabricate one number, the solver reports several concrete, cheaply-computed structural stats (see `src/difficulty.rs` for exact definitions and rationale):

- **shape-only placements** — how many (orientation, position) combinations fit the grid and land only on non-empty target cells, ignoring color. A rough proxy for how much a player has to consider geometrically.
- **locally-plausible placements** — the subset of the above that also don't overshoot any color channel when checked in isolation against an empty board. Cheap to compute (no combinatorics) yet a sound over-approximation of "could this placement ever be part of any solution."
- **red herrings** — locally-plausible placements minus the one actually used per piece in the (required-to-be-unique) solution: how many "this might fit" options a careful player still has to rule out.
- **duplicate-color regions** — how many distinct target colors appear in 2+ separate (non-4-connected) patches of the grid. This is the general form of Level 2's "look again" trick (the same exact color arising two different ways), and empirically the strongest single signal: it's what actually made Level 2 score highest among the three hand-built levels.
- **sneaky decoys** — how many decoy pieces have at least one locally-plausible placement (as opposed to failing even a careless color check).
- **score** — a weighted sum of the above (see `score_from` in `src/difficulty.rs`), weighted so a duplicate-color region counts far more than an ordinary red herring. The weights are a starting point, not validated against real playtesting — tune them as you get more levels and player feedback.

A level with zero or more than one real solution gets no score (`solution_count != 1` is a design bug to fix, not a difficulty level to rate).
