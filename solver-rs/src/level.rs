//! Level data model and pure color/transform logic — a Rust port of the relevant parts of
//! `../levels.js`. `levels.js` stays the single source of truth for the shipped game; this
//! module reads/writes the same JSON shape produced by `../export-levels.js`, so the two
//! implementations describe identical puzzles, they just don't share source code.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Cell {
    pub dx: i32,
    pub dy: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rgb {
    pub r: i32,
    pub g: i32,
    pub b: i32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Origin {
    pub col: i32,
    pub row: i32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct StartTransform {
    #[serde(default)]
    pub rotate: u8,
    #[serde(default)]
    pub flip: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PieceDef {
    pub id: String,
    pub color: String,
    pub cells: Vec<Cell>,
    pub origin: Option<Origin>,
    #[serde(default)]
    pub decoy: bool,
    pub start: Option<StartTransform>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Level {
    pub id: String,
    pub name: String,
    pub grid_cols: i32,
    pub grid_rows: i32,
    /// "additive" (light-like, the default — see add_colors) or "subtractive" (paint-like —
    /// see multiply_colors). Absent/omitted means additive, matching levels.js.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blend_mode: Option<String>,
    pub pieces: Vec<PieceDef>,
}

impl Level {
    pub fn is_subtractive(&self) -> bool {
        self.blend_mode.as_deref() == Some("subtractive")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LevelsFile {
    pub pigments: HashMap<String, Rgb>,
    pub levels: Vec<Level>,
}

// ---------- Color model ----------
// Two mixing rules — must match levels.js's addColors/multiplyColors/combineColors exactly.
//
// "additive" (light mixing): channel-wise sum, clamped to 0-255.
pub fn add_colors(colors: &[Rgb]) -> Option<Rgb> {
    if colors.is_empty() {
        return None;
    }
    let mut r = 0i32;
    let mut g = 0i32;
    let mut b = 0i32;
    for c in colors {
        r += c.r;
        g += c.g;
        b += c.b;
    }
    Some(Rgb {
        r: r.min(255),
        g: g.min(255),
        b: b.min(255),
    })
}

// "subtractive" (paint/ink mixing): overlapping *different* pigments multiply their
// channel fractions together. Crucially idempotent for the *same* pigment — painting a
// color over itself changes nothing (real paint doesn't get darker with every identical
// coat), so this dedupes by exact color identity before multiplying. Plain multiplication
// alone isn't idempotent (x*x != x), which was a real bug caught by a playtester: dedupe
// first, or "red mixed with red" quietly comes out darker instead of staying red.
pub fn multiply_colors(colors: &[Rgb]) -> Option<Rgb> {
    if colors.is_empty() {
        return None;
    }
    let mut distinct: Vec<Rgb> = Vec::new();
    for c in colors {
        if !distinct.iter().any(|d| d.r == c.r && d.g == c.g && d.b == c.b) {
            distinct.push(*c);
        }
    }
    let mut r = 1.0f64;
    let mut g = 1.0f64;
    let mut b = 1.0f64;
    for c in &distinct {
        r *= c.r as f64 / 255.0;
        g *= c.g as f64 / 255.0;
        b *= c.b as f64 / 255.0;
    }
    Some(Rgb {
        r: (r * 255.0).round() as i32,
        g: (g * 255.0).round() as i32,
        b: (b * 255.0).round() as i32,
    })
}

pub fn combine_colors(colors: &[Rgb], blend_mode: Option<&str>) -> Option<Rgb> {
    if blend_mode == Some("subtractive") {
        multiply_colors(colors)
    } else {
        add_colors(colors)
    }
}

// ---------- Piece transforms ----------
// Mirrors normalize/rotate90/flipHorizontal/boundingSize in levels.js.
pub fn normalize(cells: &[Cell]) -> Vec<Cell> {
    let min_dx = cells.iter().map(|c| c.dx).min().unwrap();
    let min_dy = cells.iter().map(|c| c.dy).min().unwrap();
    cells
        .iter()
        .map(|c| Cell {
            dx: c.dx - min_dx,
            dy: c.dy - min_dy,
        })
        .collect()
}

pub fn rotate90(cells: &[Cell]) -> Vec<Cell> {
    let rotated: Vec<Cell> = cells.iter().map(|c| Cell { dx: -c.dy, dy: c.dx }).collect();
    normalize(&rotated)
}

pub fn flip_horizontal(cells: &[Cell]) -> Vec<Cell> {
    let flipped: Vec<Cell> = cells.iter().map(|c| Cell { dx: -c.dx, dy: c.dy }).collect();
    normalize(&flipped)
}

pub fn bounding_size(cells: &[Cell]) -> (i32, i32) {
    let w = cells.iter().map(|c| c.dx).max().unwrap() + 1;
    let h = cells.iter().map(|c| c.dy).max().unwrap() + 1;
    (w, h)
}

pub fn apply_start_transform(cells: &[Cell], start: Option<StartTransform>) -> Vec<Cell> {
    let mut result = cells.to_vec();
    if let Some(s) = start {
        for _ in 0..s.rotate {
            result = rotate90(&result);
        }
        if s.flip {
            result = flip_horizontal(&result);
        }
    }
    normalize(&result)
}

// ---------- Target computation ----------
// Mirrors buildTarget in levels.js: sums each non-decoy piece's pigment onto its solution
// cells, then clamps. Returned as a row-major flat Vec of length grid_cols*grid_rows.
pub fn build_target(level: &Level, pigments: &HashMap<String, Rgb>) -> Vec<Option<Rgb>> {
    let n = (level.grid_cols * level.grid_rows) as usize;
    let mut contributions: Vec<Vec<Rgb>> = vec![Vec::new(); n];
    for def in &level.pieces {
        if def.decoy {
            continue;
        }
        let origin = def
            .origin
            .unwrap_or_else(|| panic!("non-decoy piece '{}' has no origin", def.id));
        let pigment = *pigments
            .get(&def.color)
            .unwrap_or_else(|| panic!("unknown pigment color '{}'", def.color));
        for cell in &def.cells {
            let col = origin.col + cell.dx;
            let row = origin.row + cell.dy;
            let idx = (row * level.grid_cols + col) as usize;
            contributions[idx].push(pigment);
        }
    }
    let blend_mode = level.blend_mode.as_deref();
    contributions.iter().map(|c| combine_colors(c, blend_mode)).collect()
}
