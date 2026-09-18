//! Level generator. Deliberately constructive, not search-based, for the reason discussed
//! before building this: generating "backwards" (invent a target color grid, then try to
//! decompose it into overlapping pieces) is a genuinely hard combinatorial search that could
//! blow up. Generating "forwards" instead — place random pieces first, derive the target
//! from that placement — is O(1) per piece, always succeeds, and is trivially guaranteed
//! solvable because it *is* a solution.
//!
//! The only real search here is small and bounded: checking that a candidate decoy piece
//! truly has no plausible placement (cheap — no combinatorics, see
//! `solver::fits_in_isolation`), and confirming the whole assembled level has exactly one
//! solution via the real solver before accepting it. Both checks are fast for these puzzle
//! sizes (see solver.rs's doc comment), so even dozens of rejected candidates cost
//! microseconds, not seconds.

use crate::level::{bounding_size, build_target, normalize, Cell, Level, Origin, PieceDef, Rgb, StartTransform};
use crate::solver::{build_piece_infos, compute_placements, fits_in_isolation, solve_with_piece_infos_capped};
use crate::difficulty::{self, DifficultyMetrics};
use rand::seq::SliceRandom;
use rand::Rng;
use std::collections::{HashMap, HashSet};

pub struct GeneratorConfig {
    pub grid_cols: i32,
    pub grid_rows: i32,
    pub real_piece_count: usize,
    pub decoy_count: usize,
    pub max_piece_size: usize,
    /// Pigment names to sample from; must all be keys in the `pigments` map passed to
    /// `generate`.
    pub colors: Vec<String>,
    /// Bound on whole-level regeneration attempts (a level is rejected and retried if it
    /// isn't uniquely solvable, or doesn't meet the requested difficulty band).
    pub max_attempts: usize,
    /// `Some("subtractive")` for Paint-mode levels, `None`/`Some("additive")` otherwise —
    /// stored on the generated `Level` and threaded into every solver call below.
    pub blend_mode: Option<String>,
}

pub struct GeneratedLevel {
    pub level: Level,
    pub metrics: DifficultyMetrics,
    pub attempts: usize,
}

/// A random polyomino via self-avoiding random walk: start at one cell, repeatedly attach a
/// random free cell adjacent to the shape so far. Capped so a run of bad luck on a tiny grid
/// can't spin forever — it just returns whatever size it managed to reach.
fn random_polyomino(rng: &mut impl Rng, size: usize) -> Vec<Cell> {
    let mut cells: Vec<Cell> = vec![Cell { dx: 0, dy: 0 }];
    let mut set: HashSet<(i32, i32)> = HashSet::new();
    set.insert((0, 0));
    let mut guard = 0;
    while cells.len() < size && guard < 200 {
        guard += 1;
        let base = cells[rng.gen_range(0..cells.len())];
        let dirs: [(i32, i32); 4] = [(1, 0), (-1, 0), (0, 1), (0, -1)];
        let (ddx, ddy) = dirs[rng.gen_range(0..4)];
        let cand = (base.dx + ddx, base.dy + ddy);
        if set.insert(cand) {
            cells.push(Cell { dx: cand.0, dy: cand.1 });
        }
    }
    normalize(&cells)
}

fn random_origin(rng: &mut impl Rng, grid_cols: i32, grid_rows: i32, cells: &[Cell]) -> Option<Origin> {
    let (w, h) = bounding_size(cells);
    if w > grid_cols || h > grid_rows {
        return None;
    }
    Some(Origin {
        col: rng.gen_range(0..=(grid_cols - w)),
        row: rng.gen_range(0..=(grid_rows - h)),
    })
}

fn random_start(rng: &mut impl Rng) -> StartTransform {
    StartTransform { rotate: rng.gen_range(0..4), flip: rng.gen_bool(0.5) }
}

/// Builds one candidate level: `real_piece_count` random pieces placed at random (always
/// succeeds, see module doc), then `decoy_count` decoys, each accepted only once verified to
/// have zero locally-plausible placements against the resulting target. Returns `None` if a
/// safe decoy couldn't be found within a bounded number of tries — the caller just retries
/// with a fresh candidate rather than getting stuck mutating this one forever.
fn generate_candidate(rng: &mut impl Rng, cfg: &GeneratorConfig, pigments: &HashMap<String, Rgb>) -> Option<Level> {
    let mut pieces = Vec::new();
    for i in 0..cfg.real_piece_count {
        let size = rng.gen_range(1..=cfg.max_piece_size);
        let (cells, origin) = (0..50).find_map(|_| {
            let cells = random_polyomino(rng, size);
            random_origin(rng, cfg.grid_cols, cfg.grid_rows, &cells).map(|o| (cells, o))
        })?;
        let color = cfg.colors.choose(rng)?.clone();
        pieces.push(PieceDef {
            id: format!("piece-{}", i + 1),
            color,
            cells,
            origin: Some(origin),
            decoy: false,
            start: Some(random_start(rng)),
        });
    }

    let mut level = Level {
        id: "generated".into(),
        name: "Generated level".into(),
        grid_cols: cfg.grid_cols,
        grid_rows: cfg.grid_rows,
        blend_mode: cfg.blend_mode.clone(),
        pieces,
    };
    let subtractive = level.is_subtractive();
    let target = build_target(&level, pigments);

    for i in 0..cfg.decoy_count {
        let mut placed_decoy = None;
        'attempts: for _ in 0..50 {
            let real = &level.pieces[rng.gen_range(0..level.pieces.len())];
            let (cells, color) = if rng.gen_bool(0.5) {
                // Same color as a real piece, different (random) shape.
                let size = rng.gen_range(1..=cfg.max_piece_size);
                (random_polyomino(rng, size), real.color.clone())
            } else {
                // Same shape as a real piece, different (random) color.
                let alt: Vec<&String> = cfg.colors.iter().filter(|c| **c != real.color).collect();
                if alt.is_empty() {
                    continue 'attempts;
                }
                (real.cells.clone(), (*alt.choose(rng)?).clone())
            };
            let pigment = *pigments.get(&color)?;
            let placements = compute_placements(cfg.grid_cols, cfg.grid_rows, &cells, &target);
            let plausible = placements.iter().any(|p| fits_in_isolation(p, &pigment, &target, subtractive));
            if !plausible {
                placed_decoy = Some(PieceDef {
                    id: format!("decoy-{}", i + 1),
                    color,
                    cells,
                    origin: None,
                    decoy: true,
                    start: Some(random_start(rng)),
                });
                break 'attempts;
            }
        }
        level.pieces.push(placed_decoy?);
    }

    Some(level)
}

/// Generates and validates levels until one meets the bar, or gives up after
/// `cfg.max_attempts`. "Meets the bar" means: exactly one real solution (a level with zero or
/// multiple solutions is a bug, not a harder/easier variant — see difficulty.rs), and,
/// if given, a difficulty score inside `[min_score, max_score]`.
pub fn generate(
    cfg: &GeneratorConfig,
    pigments: &HashMap<String, Rgb>,
    min_score: Option<f64>,
    max_score: Option<f64>,
) -> Option<GeneratedLevel> {
    let mut rng = rand::thread_rng();
    for attempt in 1..=cfg.max_attempts {
        let Some(level) = generate_candidate(&mut rng, cfg, pigments) else {
            continue;
        };
        let target = build_target(&level, pigments);
        let (piece_infos, pigment_list) = build_piece_infos(&level, pigments, &target);
        // A handful of extra solutions (not just 1) would still tell us this candidate is
        // bad; capping at 5 keeps a pathological candidate from wasting time enumerating
        // hundreds of solutions we're going to reject anyway. Node count is capped much
        // lower than the default here too: during generation we're going to throw away and
        // retry a bad candidate regardless, so there's no point letting validation run for
        // seconds before giving up on one candidate — better to fail this one fast and try
        // a fresh one. A `truncated` result (couldn't confirm uniqueness within the budget)
        // is treated as a rejection, same as finding 0 or 2+ solutions: it might still be a
        // fine level, but this generator only ever accepts levels it could *prove* unique.
        let result = solve_with_piece_infos_capped(
            &piece_infos,
            &pigment_list,
            level.is_subtractive(),
            &target,
            level.grid_cols,
            level.grid_rows,
            5,
            500_000,
        );
        if result.truncated || result.solutions.len() != 1 {
            continue;
        }
        let metrics = difficulty::compute(&level, &target, &piece_infos, &result);
        if let Some(min) = min_score {
            if metrics.score.unwrap_or(f64::MIN) < min {
                continue;
            }
        }
        if let Some(max) = max_score {
            if metrics.score.unwrap_or(f64::MAX) > max {
                continue;
            }
        }
        return Some(GeneratedLevel { level, metrics, attempts: attempt });
    }
    None
}
