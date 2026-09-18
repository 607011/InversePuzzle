//! CLI: solve every level in a levels.json export (see ../../export-levels.js) and report
//! solution count, timing, and difficulty metrics.
//!
//! Usage:
//!   solve [path/to/levels.json] [level-id-or-index]
//! Defaults to ../levels.json (relative to the crate) and all levels.

use inverse_puzzle_solver::difficulty;
use inverse_puzzle_solver::level::{build_target, LevelsFile};
use inverse_puzzle_solver::solver::{build_piece_infos, solve_with_piece_infos};
use std::env;
use std::fs;

fn main() {
    let mut args = env::args().skip(1);
    let path = args.next().unwrap_or_else(|| "../levels.json".to_string());
    let selector = args.next();

    let text = fs::read_to_string(&path).unwrap_or_else(|e| {
        eprintln!("Failed to read {path}: {e}\nRun `node export-levels.js` first.");
        std::process::exit(1);
    });
    let data: LevelsFile = serde_json::from_str(&text).unwrap_or_else(|e| {
        eprintln!("Failed to parse {path}: {e}");
        std::process::exit(1);
    });

    let levels: Vec<_> = match &selector {
        None => data.levels.iter().collect(),
        Some(sel) => {
            let by_index = sel.parse::<usize>().ok().and_then(|i| data.levels.get(i));
            let by_id = data.levels.iter().find(|l| &l.id == sel);
            match by_index.or(by_id) {
                Some(l) => vec![l],
                None => {
                    eprintln!("No such level: {sel}");
                    std::process::exit(1);
                }
            }
        }
    };

    for level in levels {
        println!("\n=== {} ({}) — grid {}x{} ===", level.name, level.id, level.grid_cols, level.grid_rows);
        let target = build_target(level, &data.pigments);
        let piece_infos = build_piece_infos(level, &data.pigments, &target);

        let placement_summary: Vec<String> = piece_infos.iter().map(|p| format!("{}={}", p.id, p.placements.len())).collect();
        println!("  placements/piece: {}", placement_summary.join(", "));

        let result = solve_with_piece_infos(&piece_infos, &target, level.grid_cols, level.grid_rows, 1000);
        for id in &result.never_placeable {
            let is_decoy = level.pieces.iter().find(|p| &p.id == id).map(|p| p.decoy).unwrap_or(false);
            let tag = if is_decoy { "expected, marked decoy" } else { "UNEXPECTED — check levels.js" };
            println!("  note: \"{id}\" has zero valid placements anywhere ({tag})");
        }
        println!("  search nodes visited: {}", result.nodes_visited);
        if result.truncated {
            println!("  WARNING: search was truncated (hit the node budget) — solution count below is a LOWER BOUND, not confirmed.");
        }
        println!("  time: {:.3} ms", result.elapsed.as_secs_f64() * 1000.0);
        println!(
            "  solutions found: {}{}",
            result.solutions.len(),
            if result.solutions.len() >= 1000 { " (capped)" } else { "" }
        );
        if result.solutions.is_empty() {
            println!("  WARNING: level as defined has no valid solution at all.");
        } else if result.solutions.len() > 1 {
            println!("  NOTE: more than one solution exists.");
        }
        for (i, solution) in result.solutions.iter().enumerate() {
            println!("  solution #{}:", i + 1);
            let placed_ids: Vec<&str> = solution.iter().map(|p| p.id.as_str()).collect();
            for piece in solution {
                let shape: Vec<String> = piece.cells.iter().map(|c| format!("({},{})", c.dx, c.dy)).collect();
                println!("    {}: origin=({},{}) shape=[{}]", piece.id, piece.origin.0, piece.origin.1, shape.join(" "));
            }
            for id in &result.all_piece_ids {
                if !placed_ids.contains(&id.as_str()) {
                    println!("    {id}: (left in tray)");
                }
            }
        }

        let metrics = difficulty::compute(level, &target, &piece_infos, &result);
        println!("  --- difficulty ---");
        println!("  grid cells: {} ({} non-empty)", metrics.grid_cells, metrics.non_null_cells);
        println!("  pieces: {} ({} decoys, {} of them sneaky)", metrics.piece_count, metrics.decoy_count, metrics.sneaky_decoys);
        println!("  shape-only placements: {}", metrics.total_shape_placements);
        println!("  locally-plausible placements: {}", metrics.total_locally_plausible_placements);
        println!("  duplicate-color regions: {}", metrics.duplicate_color_regions);
        match metrics.score {
            Some(score) => println!("  red herrings: {}  ->  difficulty score: {:.1}", metrics.red_herrings, score),
            None => println!("  difficulty score: n/a (solution_count = {}, must be exactly 1)", metrics.solution_count),
        }
    }
}
