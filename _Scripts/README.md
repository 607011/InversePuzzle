# _Scripts

Reusable, but not permanently-wired-in, dev tooling for building out level sets. Unlike
`../export-levels.js` and `../json-to-level.js` (the two fixed bridge scripts between
`levels.js` and `solver-rs` — see their own header comments), the scripts here are one level
up: they drive `solver-rs`'s `generate` binary through a whole *ramp* of parameters to
produce a batch of candidate levels for a level set, rather than a single level.

Output lands under `out/` (gitignored) so re-runs don't dirty the working tree.

## gen-paint-levels.sh

Generates a parameter ramp of candidate Paint-mode (subtractive blend) levels. Used to build
the 30 generated Paint levels in `../levels.js`'s `PAINT_LEVELS`, the same way an equivalent
sweep was used earlier for the 30 generated additive Light-mode levels in `LEVELS`.

```bash
cd .. && node export-levels.js   # generator reads the pigment table from levels.json
_Scripts/gen-paint-levels.sh     # writes out/paint-candidates/cand-*.json
```

The script only sweeps parameters and lets `generate` validate+score each candidate — it
does **not** pick which candidates ship. That's a separate, manual step: sort every
candidate by its actual computed `difficulty score` (from each `generate` run's console
output, or by re-running `solve` on the exported JSON) and choose a slice with a genuinely
monotonic ramp. Raw generation parameters (grid size, piece count, decoy count) don't
correlate cleanly with score — e.g. two runs with identical parameters can land on very
different scores — so sorting by the real score, not by rung order, is what actually
guarantees the level set gets harder from level 1 to level 30.

Once a candidate is chosen:

```bash
node ../json-to-level.js out/paint-candidates/cand-17.json
```

prints a ready-to-paste `levels.js` object literal (give it a real `id`/`name`).

See `../solver-rs/README.md` for what the ramp parameters (`--cols`, `--pieces`, `--decoys`,
`--colors`, ...) mean and for the scaling limits that shaped this script's specific ramp.

## gen-colorblind-levels.sh

Same idea as `gen-paint-levels.sh`, but for `COLORBLIND_LEVELS`: additive mixing (like
`LEVELS`), just on the `cbBlue`/`cbOrange`/`cbPurple` palette instead of `red`/`green`/`blue`
(see the `CB_BLUE` comment in `../levels.js` for why — red and green sit on exactly the axis
that red-green color vision deficiency collapses, which undermines this game's whole
"match the mixed color by eye" mechanic). Same additive ramp as the original 30 Light-mode
levels (grid 4x3 up to 6x6, 2-14 real pieces, 0-2 decoys) since it's the same mixing rule.

```bash
cd .. && node export-levels.js       # generator reads cbBlue/cbOrange/cbPurple from levels.json
_Scripts/gen-colorblind-levels.sh    # writes out/colorblind-candidates/cand-*.json
```

Same manual pick-by-actual-score step afterwards as `gen-paint-levels.sh` — see above.
