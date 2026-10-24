pub mod calibration;
pub mod commands;
pub mod models;
pub mod progression;
pub mod scheduler;
pub mod storage;
pub mod volume;

use models::{Exercise, MuscleWeights, WarningTiersData};
use std::collections::HashMap;
#[cfg(desktop)]
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
            #[cfg(desktop)]
            {
                if let Some(icon) = app.default_window_icon() {
                    for (_label, window) in app.webview_windows() {
                        let _ = window.set_icon(icon.clone());
                    }
                }
            }
            #[cfg(mobile)]
            let _ = app;
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
            commands::restore_deload_plan,
            commands::apply_progression,
            commands::complete_session,
            commands::get_session_history,
            commands::update_completed_session,
            commands::delete_completed_session,
            commands::export_full_backup,
            commands::import_full_backup,
            commands::start_lan_sync_server,
            commands::stop_lan_sync_server,
            commands::get_lan_sync_status,
            commands::get_lan_client_meta,
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

    #[test]
    fn test_full_backup_payload_round_trip() {
        let temp_dir = std::env::temp_dir().join(format!(
            "mgp_test_sync_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let storage = storage::StorageManager::new(temp_dir.clone());

        let settings = models::Settings {
            units: models::Units::Imperial,
            backpack: true,
            bed_height_cm: 45.0,
            priority_muscles: vec![models::Muscle::Chest, models::Muscle::Triceps],
            maintenance_on: true,
            experience: models::ExperienceLevel::Over2Years,
            sets_per_day: 5,
            days_per_week: 4.67,
            calendar_view: true,
            rest_timer_sound: true,
            ..Default::default()
        };

        let mut max_reps = HashMap::new();
        max_reps.insert("push_up".to_string(), 35);
        max_reps.insert("archer_push_up".to_string(), 12);
        let profile = models::Profile {
            body_weight_kg: 82.5,
            estimated_max_reps: max_reps,
        };

        let block = models::Block {
            exercise_id: "archer_push_up".to_string(),
            sets: 3,
            rep_target_min: 8,
            rep_target_max: 12,
            seconds_target_min: None,
            seconds_target_max: None,
            effort_target: "2 RIR".to_string(),
            tempo_cue: "3s eccentric".to_string(),
            rest_cue: "2-3 min".to_string(),
            added_weight_kg: 5.0,
        };

        let session = models::Session {
            session_number: 1,
            focus: vec![models::Muscle::Chest],
            blocks: vec![block],
        };

        let cycle = models::Cycle {
            length_days: 7,
            sessions_count: 3,
            effective_weekly_rate: 3.0,
            description: "Standard".to_string(),
            is_adjusted: false,
            adjusted_message: None,
        };

        let plan = models::Plan {
            cycle,
            sessions: vec![session],
            maintenance_deficits: HashMap::new(),
            cumulative_effective_sets: HashMap::new(),
            maintenance_dropped: false,
            is_deload: true,
            pre_deload_sessions: None,
        };

        let set_log = models::SetLog {
            timestamp: 1700000000000,
            session_number: 1,
            block_index: 0,
            exercise_id: "archer_push_up".to_string(),
            reps_or_seconds: 10,
            added_weight_kg: 5.0,
            reps_from_failure: 1,
        };

        let completed = models::CompletedSession {
            id: "sess-1-1700000000000".to_string(),
            timestamp: 1700000000000,
            session_number: 1,
            focus: vec![models::Muscle::Chest],
            total_sets: 1,
            exercises_summary: vec![models::SessionExerciseSummary {
                exercise_id: "archer_push_up".to_string(),
                exercise_name: "Archer Push Up".to_string(),
                sets_completed: 1,
                reps_or_seconds: vec![10],
                added_weight_kg: 5.0,
                avg_rir: 1.0,
            }],
        };

        let client_meta = serde_json::json!({
            "cycleAnchorDate": "2026-10-16",
            "cycleAnchorManual": "manual_set",
            "activeSessionDrafts": { "mgp_active_session_1": "[{\"reps\":10}]" }
        });

        let payload = models::FullBackupPayload {
            version: 1,
            exported_at: 1700000000000,
            settings: settings.clone(),
            profile: profile.clone(),
            plan: Some(plan.clone()),
            set_logs: vec![set_log.clone()],
            session_history: vec![completed.clone()],
            client_meta: Some(client_meta.clone()),
        };

        // 1. Test serde_json serialization round-trip
        let serialized = serde_json::to_string(&payload).expect("Serialization failed");
        let deserialized: models::FullBackupPayload =
            serde_json::from_str(&serialized).expect("Deserialization failed");
        assert_eq!(deserialized.version, 1);
        assert_eq!(deserialized.settings.units, models::Units::Imperial);
        assert_eq!(deserialized.settings.days_per_week, 4.67);
        assert_eq!(
            deserialized.settings.priority_muscles,
            vec![models::Muscle::Chest, models::Muscle::Triceps]
        );
        assert_eq!(deserialized.profile.body_weight_kg, 82.5);
        assert_eq!(
            deserialized.profile.estimated_max_reps.get("archer_push_up"),
            Some(&12)
        );
        assert!(deserialized.plan.as_ref().unwrap().is_deload);
        assert_eq!(
            deserialized.plan.as_ref().unwrap().sessions[0].blocks[0].exercise_id,
            "archer_push_up"
        );
        assert_eq!(
            deserialized.plan.as_ref().unwrap().sessions[0].blocks[0].added_weight_kg,
            5.0
        );
        assert_eq!(deserialized.set_logs.len(), 1);
        assert_eq!(deserialized.session_history.len(), 1);
        assert_eq!(
            deserialized.client_meta.as_ref().unwrap()["cycleAnchorDate"],
            "2026-10-16"
        );

        // 2. Test disk storage persistence
        storage.save_settings(&deserialized.settings).unwrap();
        storage.save_profile(&deserialized.profile).unwrap();
        storage
            .save_plan(deserialized.plan.as_ref().unwrap())
            .unwrap();
        storage.save_set_logs(&deserialized.set_logs).unwrap();
        storage
            .save_session_history(&deserialized.session_history)
            .unwrap();

        let loaded_settings = storage.load_settings().unwrap();
        assert_eq!(loaded_settings.units, models::Units::Imperial);
        assert_eq!(loaded_settings.sets_per_day, 5);

        let loaded_profile = storage.load_profile().unwrap();
        assert_eq!(loaded_profile.body_weight_kg, 82.5);

        let loaded_plan = storage.load_plan().unwrap().unwrap();
        assert!(loaded_plan.is_deload);
        assert_eq!(
            loaded_plan.sessions[0].blocks[0].exercise_id,
            "archer_push_up"
        );

        let loaded_logs = storage.load_set_logs().unwrap();
        assert_eq!(loaded_logs.len(), 1);
        assert_eq!(loaded_logs[0].exercise_id, "archer_push_up");

        let loaded_hist = storage.load_session_history().unwrap();
        assert_eq!(loaded_hist.len(), 1);
        assert_eq!(loaded_hist[0].id, "sess-1-1700000000000");

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
