//! Difficulty scoring for a solved level. There is no single canonical "human difficulty"
//! number for this kind of puzzle, so rather than fabricate one, this computes a handful of
//! concrete, cheaply-derived structural metrics — each individually meaningful — plus one
//! documented, tunable weighted score for convenience (e.g. sorting/filtering generated
//! levels). Adjust the weights in `score()` as playtesting data comes in; they are a
//! starting point, not a validated model of difficulty.

use crate::level::{Level, Rgb};
use crate::solver::{PieceInfo, SolveResult};

#[derive(Debug, Clone)]
pub struct DifficultyMetrics {
    pub grid_cells: usize,
    pub non_null_cells: usize,
    pub piece_count: usize,
    pub decoy_count: usize,
    /// Sum over pieces of placements that fit the grid and land only on non-null cells
    /// (shape-only prefilter, ignores color).
    pub total_shape_placements: usize,
    /// Sum over pieces of placements that additionally don't overshoot any channel when
    /// checked against an empty board in isolation — "could this plausibly belong
    /// somewhere," independent of what any other piece does.
    pub total_locally_plausible_placements: usize,
    /// `total_locally_plausible_placements` minus one per piece actually placed in the
    /// unique solution: how many "this might fit here" options exist beyond the one real
    /// spot per piece, summed across all pieces. Only meaningful when `solution_count == 1`
    /// (see `score`).
    pub red_herrings: i64,
    /// How many of the pieces marked `decoy` in the level data have at least one
    /// locally-plausible placement (i.e. would pass a careless glance, not just a careless
    /// shape-check) — a decoy with zero here is a "cheap" decoy, easy to dismiss on sight.
    pub sneaky_decoys: usize,
    /// Count of distinct target colors that occupy 2+ separate (non-4-connected) regions
    /// of the grid — the general form of Level 2's "look again" trick: the same exact
    /// color arising from more than one place/mechanism, so color alone can't localize it.
    pub duplicate_color_regions: usize,
    pub solution_count: usize,
    /// `None` when `solution_count != 1`: a level with zero or multiple solutions is a
    /// design bug to fix, not a difficulty level to rate.
    pub score: Option<f64>,
}

/// Groups the target grid's non-null cells into 4-connected regions of identical color,
/// then counts how many distinct colors are split across 2 or more such regions.
fn count_duplicate_color_regions(target: &[Option<Rgb>], cols: i32, rows: i32) -> usize {
    let n = (cols * rows) as usize;
    let mut visited = vec![false; n];
    let mut region_color: Vec<Rgb> = Vec::new();

    for start in 0..n {
        if visited[start] || target[start].is_none() {
            continue;
        }
        let color = target[start].unwrap();
        // Flood-fill (BFS) this region.
        let mut stack = vec![start];
        visited[start] = true;
        while let Some(idx) = stack.pop() {
            let col = (idx as i32) % cols;
            let row = (idx as i32) / cols;
            let neighbors = [(col - 1, row), (col + 1, row), (col, row - 1), (col, row + 1)];
            for (nc, nr) in neighbors {
                if nc < 0 || nr < 0 || nc >= cols || nr >= rows {
                    continue;
                }
                let nidx = (nr * cols + nc) as usize;
                if !visited[nidx] && target[nidx] == Some(color) {
                    visited[nidx] = true;
                    stack.push(nidx);
                }
            }
        }
        region_color.push(color);
    }

    let mut counts: std::collections::HashMap<(i32, i32, i32), usize> = std::collections::HashMap::new();
    for c in &region_color {
        *counts.entry((c.r, c.g, c.b)).or_insert(0) += 1;
    }
    counts.values().filter(|&&n| n >= 2).count()
}

pub fn compute(level: &Level, target: &[Option<Rgb>], piece_infos: &[PieceInfo], result: &SolveResult) -> DifficultyMetrics {
    let grid_cells = (level.grid_cols * level.grid_rows) as usize;
    let non_null_cells = target.iter().filter(|c| c.is_some()).count();
    let decoy_count = level.pieces.iter().filter(|p| p.decoy).count();

    let total_shape_placements: usize = piece_infos.iter().map(|p| p.placements.len()).sum();
    let total_locally_plausible_placements: usize = piece_infos.iter().map(|p| p.locally_plausible.len()).sum();
    let sneaky_decoys = piece_infos.iter().filter(|p| p.is_decoy && !p.locally_plausible.is_empty()).count();

    let solution_count = result.solutions.len();
    // A truncated search (see SolveResult::truncated) never gets a score, even if it
    // happened to find exactly one solution before giving up — that count isn't proven
    // unique, just not-yet-disproven.
    let (red_herrings, score) = if solution_count == 1 && !result.truncated {
        let used = result.solutions[0].len();
        let red_herrings = total_locally_plausible_placements as i64 - used as i64;
        let duplicate_colors = count_duplicate_color_regions(target, level.grid_cols, level.grid_rows);
        let score = score_from(red_herrings, duplicate_colors, piece_infos.len());
        (red_herrings, Some(score))
    } else {
        (0, None)
    };

    let duplicate_color_regions = count_duplicate_color_regions(target, level.grid_cols, level.grid_rows);

    DifficultyMetrics {
        grid_cells,
        non_null_cells,
        piece_count: level.pieces.len(),
        decoy_count,
        total_shape_placements,
        total_locally_plausible_placements,
        red_herrings,
        sneaky_decoys,
        duplicate_color_regions,
        solution_count,
        score,
    }
}

/// Weighted combination of the structural signals above. Tunable; not derived from
/// playtesting data yet. Rationale for the starting weights:
/// - each red herring is a small amount of extra checking a careful player must do
/// - each duplicate-color region is a much bigger "aha, wait" moment (Level 2's whole
///   trick is exactly one of these), so it's weighted far higher per occurrence
/// - more pieces raises baseline complexity a little, but on its own is the least
///   interesting lever (see STATUS.md), so it gets the smallest weight
fn score_from(red_herrings: i64, duplicate_color_regions: usize, piece_count: usize) -> f64 {
    (red_herrings.max(0) as f64) * 1.0 + (duplicate_color_regions as f64) * 4.0 + (piece_count as f64) * 0.5
}
