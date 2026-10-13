pub mod calibration;
pub mod commands;
pub mod models;
pub mod progression;
pub mod scheduler;
pub mod storage;
pub mod volume;

use models::{Exercise, MuscleWeights, WarningTiersData};
use std::collections::HashMap;
use tauri::Manager;

pub static EXERCISES_JSON: &str = include_str!("../data/exercises.json");
pub static WARNING_TIERS_JSON: &str = include_str!("../data/warning_tiers.json");
pub static MUSCLE_WEIGHTS_JSON: &str = include_str!("../data/muscle_weights.json");

pub fn load_embedded_exercises() -> Vec<Exercise> {
    serde_json::from_str(EXERCISES_JSON).expect("Failed to parse embedded exercises.json")
}

pub fn load_embedded_warning_tiers() -> WarningTiersData {
    serde_json::from_str(WARNING_TIERS_JSON).expect("Failed to parse embedded warning_tiers.json")
}

pub fn load_embedded_muscle_weights() -> HashMap<String, MuscleWeights> {
    serde_json::from_str(MUSCLE_WEIGHTS_JSON).expect("Failed to parse embedded muscle_weights.json")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(icon) = app.default_window_icon() {
                for (_label, window) in app.webview_windows() {
                    let _ = window.set_icon(icon.clone());
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::update_settings,
            commands::get_profile,
            commands::calibrate,
            commands::get_plan,
            commands::generate_plan,
            commands::get_session,
            commands::swap_exercise,
            commands::log_set,
            commands::get_warnings,
            commands::get_exercises,
            commands::get_set_logs,
            commands::trigger_deload,
            commands::calibrate_dumbbell,
            commands::complete_session,
            commands::get_session_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_embedded_data_files_parse() {
        let exercises = load_embedded_exercises();
        assert!(
            !exercises.is_empty(),
            "Exercises library should not be empty"
        );
        assert!(exercises.len() >= 20, "Should have all core exercises");

        let tiers = load_embedded_warning_tiers();
        assert_eq!(tiers.experienced.len(), 5);
        assert_eq!(tiers.beginner_factor, 0.7);

        let weights = load_embedded_muscle_weights();
        assert!(!weights.is_empty());
        assert!(weights.contains_key("push_up"));
    }

    #[test]
    fn test_high_rep_pull_up_calibration_never_selects_assisted() {
        let exercises = load_embedded_exercises();
        let answers = models::CalibrationAnswers {
            body_weight_kg: 75.0,
            bed_height_cm: 50.0,
            push_ups_4_set_avg: 20.0,
            pull_ups_4_set_avg: 16.0,
            sets_close_to_failure: true,
            experience: models::ExperienceLevel::SixTo24Months,
        };

        let (profile, _, _) = calibration::calibrate_initial_profile(&answers, &exercises);

        let settings = models::Settings {
            sets_per_day: 4,
            days_per_week: 3.0,
            priority_muscles: vec![models::Muscle::Back],
            maintenance_on: true,
            ..Default::default()
        };

        let plan = scheduler::generate_plan(
            &settings,
            &profile,
            &exercises,
            HashMap::new(),
            HashMap::new(),
        );

        assert!(!plan.sessions.is_empty(), "Plan should have sessions");

        for session in &plan.sessions {
            for block in &session.blocks {
                assert_ne!(
                    block.exercise_id, "jump_assisted_pull_up",
                    "Session {} scheduled jump_assisted_pull_up for a 16 pull-up trainee!",
                    session.session_number
                );
                assert_ne!(
                    block.exercise_id, "slow_lowering_pull_up",
                    "Session {} scheduled slow_lowering_pull_up for a 16 pull-up trainee!",
                    session.session_number
                );
                let ex = exercises.iter().find(|e| e.id == block.exercise_id).unwrap();
                if ex.primary_muscle == models::Muscle::Back {
                    assert!(
                        block.exercise_id == "pull_up" || block.exercise_id == "pause_pull_up",
                        "Scheduled Back compound was {}, expected pull_up or pause_pull_up",
                        block.exercise_id
                    );
                }
            }
        }
    }
}
