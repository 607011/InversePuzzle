//! CLI: generate a new level, validated to have exactly one solution, with a difficulty
//! report. Writes the result as JSON in the same per-level shape used by levels.json, ready
//! for `node json-to-level.js <file>` to turn into a pasteable levels.js entry.
//!
//! Usage:
//!   generate [options]
//!     --cols N            grid width (default 4)
//!     --rows N            grid height (default 3)
//!     --pieces N          real (non-decoy) piece count (default 3)
//!     --decoys N          decoy piece count (default 0)
//!     --max-size N        largest allowed piece, in cells (default 4)
//!     --colors a,b,c      pigment names to sample from (default red,green,blue,amber)
//!     --paint             generate a Paint-mode (subtractive) level instead of additive
//!     --min-score N       reject candidates scoring below this
//!     --max-score N       reject candidates scoring above this
//!     --attempts N        max whole-level regeneration attempts (default 500)
//!     --pigments path     levels.json to read the pigment table from (default ../levels.json)
//!     --out path          where to write the generated level JSON (default generated-level.json)

use overhue_solver::generator::{generate, GeneratorConfig};
use overhue_solver::level::LevelsFile;
use std::collections::HashMap;
use std::env;
use std::fs;
use std::time::Instant;

fn main() {
    let mut cols = 4i32;
    let mut rows = 3i32;
    let mut piece_count = 3usize;
    let mut decoy_count = 0usize;
    let mut max_size = 4usize;
    let mut colors: Vec<String> = vec!["red".into(), "green".into(), "blue".into(), "amber".into()];
    let mut colors_explicit = false;
    let mut min_score: Option<f64> = None;
    let mut max_score: Option<f64> = None;
    let mut max_attempts = 500usize;
    let mut pigments_path = "../levels.json".to_string();
    let mut out_path = "generated-level.json".to_string();
    let mut paint = false;

    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        let mut next = || args.next().unwrap_or_else(|| { eprintln!("missing value for {arg}"); std::process::exit(1); });
        match arg.as_str() {
            "--cols" => cols = next().parse().expect("--cols must be an integer"),
            "--rows" => rows = next().parse().expect("--rows must be an integer"),
            "--pieces" => piece_count = next().parse().expect("--pieces must be an integer"),
            "--decoys" => decoy_count = next().parse().expect("--decoys must be an integer"),
            "--max-size" => max_size = next().parse().expect("--max-size must be an integer"),
            "--colors" => {
                colors = next().split(',').map(|s| s.trim().to_string()).collect();
                colors_explicit = true;
            }
            "--min-score" => min_score = Some(next().parse().expect("--min-score must be a number")),
            "--max-score" => max_score = Some(next().parse().expect("--max-score must be a number")),
            "--attempts" => max_attempts = next().parse().expect("--attempts must be an integer"),
            "--pigments" => pigments_path = next(),
            "--out" => out_path = next(),
            "--paint" => paint = true,
            other => {
                eprintln!("Unknown option: {other}");
                std::process::exit(1);
            }
        }
    }

    let text = fs::read_to_string(&pigments_path).unwrap_or_else(|e| {
        eprintln!("Failed to read {pigments_path}: {e}\nRun `node export-levels.js` first, or pass --pigments.");
        std::process::exit(1);
    });
    let data: LevelsFile = serde_json::from_str(&text).expect("invalid levels.json");
    let pigments: HashMap<String, _> = data.pigments;

    if paint && !colors_explicit {
        // Amber is tuned for additive (light) mixing — see levels.js's PIGMENTS comment —
        // so default Paint-mode generation to the primaries actually used by the shipped
        // Paint levels instead.
        colors = vec!["red".into(), "green".into(), "blue".into()];
    }

    for c in &colors {
        if !pigments.contains_key(c) {
            eprintln!("Unknown pigment '{c}'. Known: {}", pigments.keys().cloned().collect::<Vec<_>>().join(", "));
            std::process::exit(1);
        }
    }

    let cfg = GeneratorConfig {
        grid_cols: cols,
        grid_rows: rows,
        real_piece_count: piece_count,
        decoy_count,
        max_piece_size: max_size,
        colors,
        max_attempts,
        blend_mode: if paint { Some("subtractive".to_string()) } else { None },
    };

    let start = Instant::now();
    match generate(&cfg, &pigments, min_score, max_score) {
        Some(result) => {
            let elapsed = start.elapsed();
            println!("Generated a level in {} attempt(s), {:.3} ms.", result.attempts, elapsed.as_secs_f64() * 1000.0);
            let m = &result.metrics;
            println!("  grid: {}x{} ({} non-empty cells)", result.level.grid_cols, result.level.grid_rows, m.non_null_cells);
            println!("  pieces: {} real, {} decoys ({} sneaky)", result.level.pieces.len() - m.decoy_count, m.decoy_count, m.sneaky_decoys);
            println!("  duplicate-color regions: {}", m.duplicate_color_regions);
            println!("  red herrings: {}", m.red_herrings);
            println!("  difficulty score: {:.1}", m.score.unwrap_or(f64::NAN));

            let json = serde_json::to_string_pretty(&result.level).expect("serialize level");
            fs::write(&out_path, json + "\n").expect("write output file");
            println!("Wrote {out_path}");
            println!("Run `node json-to-level.js {out_path}` to get a levels.js-ready snippet.");
        }
        None => {
            eprintln!("Gave up after {max_attempts} attempts without finding a level that meets the criteria.");
            eprintln!("Try relaxing --min-score/--max-score, or allow more --pieces/--decoys/--attempts.");
            std::process::exit(1);
        }
    }
}
