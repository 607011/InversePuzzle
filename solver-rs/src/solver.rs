//! Exhaustive solution finder, ported from `../solver.js` (see that file's header comment
//! for the pruning rationale — orientation dedup, non-null-cell prefiltering,
//! most-constrained-first ordering, monotonic per-channel pruning, and "leave unplaced" as
//! a legal option so decoy pieces don't make a level look falsely unsolvable). This Rust
//! version exists to run the same search much faster, so a generator can afford to check
//! (and reject) many candidate levels per second — see generator.rs.
//!
//! Supports both blend modes (see level.rs): additive sums only ever grow (prune once a
//! channel exceeds target), subtractive products only ever shrink (prune once a channel
//! drops below target). Subtractive mixing is also idempotent per distinct pigment
//! (painting the same pigment over itself is a no-op — see level.rs's multiply_colors), so
//! rather than a running float product, this tracks, per cell, which distinct pigments
//! used anywhere in the level have touched it (a small integer reference-count table) and
//! recomputes the color as the product of whichever are present. That's exact integer
//! arithmetic throughout — no epsilon, no rounding tolerance — mirroring solver.js exactly.

use crate::level::{bounding_size, build_target, normalize, rotate90, flip_horizontal, Cell, Level, Rgb};
use std::collections::HashMap;
use std::time::{Duration, Instant};

#[derive(Debug, Clone)]
pub struct Placement {
    pub indices: Vec<usize>,
    pub origin: (i32, i32),
    pub cells: Vec<Cell>,
}

pub struct PieceInfo {
    pub id: String,
    pub pigment: Rgb,
    /// Index into the level-wide list of *distinct* pigments (see `distinct_pigments`).
    /// Only meaningful for subtractive levels, but always computed — harmless to ignore.
    pub pigment_index: usize,
    pub is_decoy: bool,
    /// Placements whose cells all land in-bounds on a non-null target cell (shape-only
    /// prefilter — doesn't check color yet).
    pub placements: Vec<Placement>,
    /// Subset of `placements` that also don't overshoot any channel when checked against an
    /// otherwise-empty board — i.e. "could plausibly belong here at all," independent of
    /// what any other piece does. See `DifficultyMetrics` for why this is useful on its own.
    pub locally_plausible: Vec<Placement>,
}

#[derive(Debug, Clone)]
pub struct ChosenPiece {
    pub id: String,
    pub origin: (i32, i32),
    pub cells: Vec<Cell>,
}

pub struct SolveResult {
    pub solutions: Vec<Vec<ChosenPiece>>,
    pub nodes_visited: u64,
    pub elapsed: Duration,
    pub never_placeable: Vec<String>,
    pub all_piece_ids: Vec<String>,
    pub placement_counts: Vec<(String, usize)>,
    /// True if the search hit `max_nodes` and gave up early. Treat `solutions` as a lower
    /// bound, not the true count, when this is set — a defensive cap for pathological
    /// inputs (e.g. many pieces sharing both color and shape, so the search legitimately
    /// has to explore a huge number of interchangeable-looking placements), not something
    /// that should ever trigger on the hand-built levels or typically-sized generated ones.
    pub truncated: bool,
}

fn cells_signature(cells: &[Cell]) -> Vec<(i32, i32)> {
    let mut v: Vec<(i32, i32)> = cells.iter().map(|c| (c.dx, c.dy)).collect();
    v.sort_unstable();
    v
}

/// All (up to) 8 elements of the dihedral group D4: 4 rotations, and the same 4 rotations
/// mirrored, deduplicated by shape (a 2x2 square or a domino has fewer than 8 distinct
/// orientations, and the search should never explore the "same" placement twice).
pub fn unique_orientations(cells: &[Cell]) -> Vec<Vec<Cell>> {
    let mut seen: HashMap<Vec<(i32, i32)>, Vec<Cell>> = HashMap::new();
    let mut current = normalize(cells);
    for _flip in 0..2 {
        for _rot in 0..4 {
            let sig = cells_signature(&current);
            seen.entry(sig).or_insert_with(|| current.clone());
            current = rotate90(&current);
        }
        current = flip_horizontal(&current);
    }
    seen.into_values().collect()
}

/// Decoupled from `Level`/`PieceDef` (just raw grid dimensions + a shape) so the generator
/// can reuse it directly when checking whether a candidate decoy is truly unplaceable,
/// without needing a fully-assembled level.
pub fn compute_placements(grid_cols: i32, grid_rows: i32, cells_in: &[Cell], target: &[Option<Rgb>]) -> Vec<Placement> {
    let orientations = unique_orientations(cells_in);
    let mut placements = Vec::new();
    for cells in orientations {
        let (w, h) = bounding_size(&cells);
        if w > grid_cols || h > grid_rows {
            continue;
        }
        for row in 0..=(grid_rows - h) {
            for col in 0..=(grid_cols - w) {
                let mut indices = Vec::with_capacity(cells.len());
                let mut valid = true;
                for c in &cells {
                    let cc = col + c.dx;
                    let rr = row + c.dy;
                    let idx = (rr * grid_cols + cc) as usize;
                    if target[idx].is_none() {
                        valid = false;
                        break;
                    }
                    indices.push(idx);
                }
                if valid {
                    placements.push(Placement { indices, origin: (col, row), cells: cells.clone() });
                }
            }
        }
    }
    placements
}

/// A placement "fits" a target in isolation if placing just this one pigment (nothing else
/// ever touching these cells) wouldn't already be wrong. For additive: it mustn't overshoot
/// a non-saturated channel (sums only ever grow from here). For subtractive: it mustn't
/// already undershoot any channel (a single pigment alone is the *lightest* this cell could
/// ever end up — more pigments later only darken it further, never lighten). Any placement
/// that's part of ANY valid solution must pass this, so it's a cheap, sound
/// over-approximation of "could this placement ever be correct."
pub fn fits_in_isolation(placement: &Placement, pigment: &Rgb, target: &[Option<Rgb>], subtractive: bool) -> bool {
    for &idx in &placement.indices {
        let t = target[idx].unwrap();
        if subtractive {
            if pigment.r < t.r || pigment.g < t.g || pigment.b < t.b {
                return false;
            }
        } else {
            if t.r < 255 && pigment.r > t.r {
                return false;
            }
            if t.g < 255 && pigment.g > t.g {
                return false;
            }
            if t.b < 255 && pigment.b > t.b {
                return false;
            }
        }
    }
    true
}

/// The list of *distinct* pigments (by exact RGB) used anywhere among `pieces` — the
/// alphabet subtractive mixing multiplies over. Order is first-seen, arbitrary but stable
/// for a given piece list.
fn distinct_pigments(pigments_in_order: &[Rgb]) -> Vec<Rgb> {
    let mut distinct: Vec<Rgb> = Vec::new();
    for p in pigments_in_order {
        if !distinct.iter().any(|d| d.r == p.r && d.g == p.g && d.b == p.b) {
            distinct.push(*p);
        }
    }
    distinct
}

/// Builds per-piece search metadata, plus the level-wide distinct-pigment list that
/// subtractive solving needs (see the module doc comment). The pigment list is meaningless
/// for additive levels but always computed — cheap, and keeps the API uniform.
pub fn build_piece_infos(level: &Level, pigments: &HashMap<String, Rgb>, target: &[Option<Rgb>]) -> (Vec<PieceInfo>, Vec<Rgb>) {
    let subtractive = level.is_subtractive();
    let piece_pigments: Vec<Rgb> = level.pieces.iter().map(|def| *pigments.get(&def.color).expect("unknown pigment color")).collect();
    let pigment_list = distinct_pigments(&piece_pigments);

    let mut infos: Vec<PieceInfo> = level
        .pieces
        .iter()
        .zip(piece_pigments.iter())
        .map(|(def, pigment)| {
            let placements = compute_placements(level.grid_cols, level.grid_rows, &def.cells, target);
            let locally_plausible: Vec<Placement> = placements
                .iter()
                .filter(|p| fits_in_isolation(p, pigment, target, subtractive))
                .cloned()
                .collect();
            let pigment_index = pigment_list.iter().position(|c| c.r == pigment.r && c.g == pigment.g && c.b == pigment.b).unwrap();
            PieceInfo { id: def.id.clone(), pigment: *pigment, pigment_index, is_decoy: def.decoy, placements, locally_plausible }
        })
        .collect();
    // Most-constrained-first: the piece with fewest options is tried first, so a doomed
    // branch fails fast instead of many pieces deep. "Leave unplaced" is always an option
    // too (see solve_level), so a piece with zero placements doesn't block the search.
    infos.sort_by_key(|p| p.placements.len());
    (infos, pigment_list)
}

struct Search<'a> {
    piece_infos: &'a [PieceInfo],
    target: &'a [Option<Rgb>],
    subtractive: bool,
    pigment_list: &'a [Rgb],
    // Additive state: running per-channel sums (integers, exact).
    sum_r: Vec<i32>,
    sum_g: Vec<i32>,
    sum_b: Vec<i32>,
    // Subtractive state: touch_count[idx * pigment_list.len() + p] = how many placed pieces
    // of distinct pigment `p` currently cover cell `idx`. The cell's color is the product of
    // whichever pigments have a nonzero count — see `subtractive_color_at`.
    touch_count: Vec<i32>,
    touched: Vec<u8>,
    solutions: Vec<Vec<ChosenPiece>>,
    nodes_visited: u64,
    max_solutions: usize,
    max_nodes: u64,
    truncated: bool,
}

impl<'a> Search<'a> {
    fn subtractive_color_at(&self, idx: usize) -> Option<Rgb> {
        let p_count = self.pigment_list.len();
        let base = idx * p_count;
        let mut r = 1.0f64;
        let mut g = 1.0f64;
        let mut b = 1.0f64;
        let mut any = false;
        for p in 0..p_count {
            if self.touch_count[base + p] == 0 {
                continue;
            }
            any = true;
            let c = self.pigment_list[p];
            r *= c.r as f64 / 255.0;
            g *= c.g as f64 / 255.0;
            b *= c.b as f64 / 255.0;
        }
        if any {
            Some(Rgb { r: (r * 255.0).round() as i32, g: (g * 255.0).round() as i32, b: (b * 255.0).round() as i32 })
        } else {
            None
        }
    }

    fn fits(&mut self, placement: &Placement, piece: &PieceInfo) -> bool {
        if self.subtractive {
            let p_count = self.pigment_list.len();
            let p = piece.pigment_index;
            for &idx in &placement.indices {
                let base = idx * p_count;
                if self.touch_count[base + p] > 0 {
                    continue; // already present here — a true no-op, can't fail
                }
                // Hypothetically add this new distinct pigment: it can only shrink each
                // channel further (or leave it, if that pigment's channel is already 255),
                // so if we've already undershot, no later pigment can bring it back.
                self.touch_count[base + p] += 1;
                let after = self.subtractive_color_at(idx).unwrap();
                self.touch_count[base + p] -= 1;
                let t = self.target[idx].unwrap();
                if after.r < t.r || after.g < t.g || after.b < t.b {
                    return false;
                }
            }
            true
        } else {
            for &idx in &placement.indices {
                let t = self.target[idx].unwrap();
                if t.r < 255 && self.sum_r[idx] + piece.pigment.r > t.r {
                    return false;
                }
                if t.g < 255 && self.sum_g[idx] + piece.pigment.g > t.g {
                    return false;
                }
                if t.b < 255 && self.sum_b[idx] + piece.pigment.b > t.b {
                    return false;
                }
            }
            true
        }
    }

    fn apply(&mut self, placement: &Placement, piece: &PieceInfo) {
        let p_count = self.pigment_list.len();
        for &idx in &placement.indices {
            if self.subtractive {
                self.touch_count[idx * p_count + piece.pigment_index] += 1;
            } else {
                self.sum_r[idx] += piece.pigment.r;
                self.sum_g[idx] += piece.pigment.g;
                self.sum_b[idx] += piece.pigment.b;
            }
            self.touched[idx] += 1;
        }
    }

    fn undo(&mut self, placement: &Placement, piece: &PieceInfo) {
        let p_count = self.pigment_list.len();
        for &idx in &placement.indices {
            if self.subtractive {
                self.touch_count[idx * p_count + piece.pigment_index] -= 1;
            } else {
                self.sum_r[idx] -= piece.pigment.r;
                self.sum_g[idx] -= piece.pigment.g;
                self.sum_b[idx] -= piece.pigment.b;
            }
            self.touched[idx] -= 1;
        }
    }

    fn is_exact_match(&self) -> bool {
        for idx in 0..self.target.len() {
            let color = if self.subtractive {
                self.subtractive_color_at(idx)
            } else if self.touched[idx] > 0 {
                Some(Rgb {
                    r: self.sum_r[idx].min(255),
                    g: self.sum_g[idx].min(255),
                    b: self.sum_b[idx].min(255),
                })
            } else {
                None
            };
            if color != self.target[idx] {
                return false;
            }
        }
        true
    }

    fn search(&mut self, piece_index: usize, chosen: &mut Vec<ChosenPiece>) {
        self.nodes_visited += 1;
        if self.nodes_visited >= self.max_nodes {
            self.truncated = true;
            return;
        }
        if self.solutions.len() >= self.max_solutions {
            return;
        }
        if piece_index == self.piece_infos.len() {
            if self.is_exact_match() {
                self.solutions.push(chosen.clone());
            }
            return;
        }

        let piece = &self.piece_infos[piece_index];

        // Option 1: leave this piece unplaced. Only ever legal for a decoy — buildTarget
        // sums every non-decoy piece into the target, so in a well-formed level a
        // non-decoy piece skipping placement can never produce an exact match anyway.
        // Restricting the branch to decoys (instead of offering it unconditionally, which
        // is what a truly generic solver would do) matters a lot at scale: with N
        // non-decoy pieces, an unconditional skip option doubles the branching factor at
        // every one of those N levels for no possible benefit, which is exactly what made
        // large generated levels (dozens of real pieces) effectively hang.
        if piece.is_decoy {
            self.search(piece_index + 1, chosen);
            if self.solutions.len() >= self.max_solutions || self.truncated {
                return;
            }
        }

        // Option 2: place it at one of its precomputed valid placements.
        // (Reborrow piece_infos by index each iteration since fits/apply/undo need &mut self.)
        for i in 0..self.piece_infos[piece_index].placements.len() {
            let placement = self.piece_infos[piece_index].placements[i].clone();
            let piece_id = self.piece_infos[piece_index].id.clone();
            if !self.fits(&placement, &self.piece_infos[piece_index]) {
                continue;
            }
            self.apply(&placement, &self.piece_infos[piece_index]);
            chosen.push(ChosenPiece { id: piece_id, origin: placement.origin, cells: placement.cells.clone() });
            self.search(piece_index + 1, chosen);
            chosen.pop();
            self.undo(&placement, &self.piece_infos[piece_index]);
            if self.solutions.len() >= self.max_solutions || self.truncated {
                return;
            }
        }
    }
}

/// A generous default: high enough to never bite the hand-built levels or typically-sized
/// generated ones, low enough that a pathological input (see `SolveResult::truncated`)
/// gives up in a few seconds rather than running indefinitely.
pub const DEFAULT_MAX_NODES: u64 = 20_000_000;

pub fn solve_with_piece_infos(
    piece_infos: &[PieceInfo],
    pigment_list: &[Rgb],
    subtractive: bool,
    target: &[Option<Rgb>],
    grid_cols: i32,
    grid_rows: i32,
    max_solutions: usize,
) -> SolveResult {
    solve_with_piece_infos_capped(piece_infos, pigment_list, subtractive, target, grid_cols, grid_rows, max_solutions, DEFAULT_MAX_NODES)
}

pub fn solve_with_piece_infos_capped(
    piece_infos: &[PieceInfo],
    pigment_list: &[Rgb],
    subtractive: bool,
    target: &[Option<Rgb>],
    grid_cols: i32,
    grid_rows: i32,
    max_solutions: usize,
    max_nodes: u64,
) -> SolveResult {
    let n = (grid_cols * grid_rows) as usize;

    let never_placeable: Vec<String> = piece_infos.iter().filter(|p| p.placements.is_empty()).map(|p| p.id.clone()).collect();
    let all_piece_ids: Vec<String> = piece_infos.iter().map(|p| p.id.clone()).collect();
    let placement_counts: Vec<(String, usize)> = piece_infos.iter().map(|p| (p.id.clone(), p.placements.len())).collect();

    let mut search = Search {
        piece_infos,
        target,
        subtractive,
        pigment_list,
        sum_r: vec![0; n],
        sum_g: vec![0; n],
        sum_b: vec![0; n],
        touch_count: vec![0; n * pigment_list.len().max(1)],
        touched: vec![0; n],
        solutions: Vec::new(),
        nodes_visited: 0,
        max_solutions,
        max_nodes,
        truncated: false,
    };

    let start = Instant::now();
    let mut chosen = Vec::new();
    search.search(0, &mut chosen);
    let elapsed = start.elapsed();

    SolveResult {
        solutions: search.solutions,
        nodes_visited: search.nodes_visited,
        elapsed,
        never_placeable,
        all_piece_ids,
        placement_counts,
        truncated: search.truncated,
    }
}

pub fn solve_level(level: &Level, pigments: &HashMap<String, Rgb>, max_solutions: usize) -> SolveResult {
    let target = build_target(level, pigments);
    let (piece_infos, pigment_list) = build_piece_infos(level, pigments, &target);
    solve_with_piece_infos(&piece_infos, &pigment_list, level.is_subtractive(), &target, level.grid_cols, level.grid_rows, max_solutions)
}
