use crate::calibration::calibrate_initial_profile;
use crate::models::{
    CalibrationAnswers, CompletedSession, Exercise, Plan, Profile, ProgressionSuggestion, Session,
    SessionExerciseSummary, SetLog, Settings, Warning,
};
use crate::progression::{evaluate_progression, update_profile_from_set};
use crate::scheduler::generate_plan as sched_generate_plan;
use crate::storage::StorageManager;
use crate::volume::evaluate_plan_warnings;
use crate::{load_embedded_exercises, load_embedded_warning_tiers};
use std::collections::HashMap;
use tauri::Manager;

fn get_storage(app: &tauri::AppHandle) -> Result<StorageManager, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {}", e))?;
    Ok(StorageManager::new(dir))
}

#[tauri::command]
pub fn get_settings(app: tauri::AppHandle) -> Result<Settings, String> {
    let storage = get_storage(&app)?;
    storage.load_settings()
}

#[tauri::command]
pub fn update_settings(app: tauri::AppHandle, settings: Settings) -> Result<Plan, String> {
    let storage = get_storage(&app)?;
    storage.save_settings(&settings)?;

    let profile = storage.load_profile()?;
    let exercises = load_embedded_exercises();

    let existing_plan = storage.load_plan()?;
    let (deficits, cumulative) = match existing_plan {
        Some(p) => (p.maintenance_deficits, p.cumulative_effective_sets),
        None => (HashMap::new(), HashMap::new()),
    };

    let plan = sched_generate_plan(
        &settings,
        &profile,
        &exercises,
        deficits,
        cumulative,
    );
    storage.save_plan(&plan)?;
    Ok(plan)
}

#[tauri::command]
pub fn get_profile(app: tauri::AppHandle) -> Result<Profile, String> {
    let storage = get_storage(&app)?;
    storage.load_profile()
}

#[tauri::command]
pub fn calibrate(
    app: tauri::AppHandle,
    answers: CalibrationAnswers,
) -> Result<(Profile, String, f64), String> {
    let storage = get_storage(&app)?;
    let exercises = load_embedded_exercises();

    let (profile, starting_ex, added_kg) = calibrate_initial_profile(&answers, &exercises);
    storage.save_profile(&profile)?;

    // Also update settings with calibrated body weight and bed height
    let mut settings = storage.load_settings()?;
    settings.bed_height_cm = answers.bed_height_cm;
    settings.experience = answers.experience;
    storage.save_settings(&settings)?;

    // Generate initial plan with new calibration
    let plan = sched_generate_plan(
        &settings,
        &profile,
        &exercises,
        HashMap::new(),
        HashMap::new(),
    );
    storage.save_plan(&plan)?;

    Ok((profile, starting_ex, added_kg))
}

#[tauri::command]
pub fn get_plan(app: tauri::AppHandle) -> Result<Option<Plan>, String> {
    let storage = get_storage(&app)?;
    storage.load_plan()
}

#[tauri::command]
pub fn generate_plan(app: tauri::AppHandle) -> Result<Plan, String> {
    let storage = get_storage(&app)?;
    let settings = storage.load_settings()?;
    let profile = storage.load_profile()?;
    let exercises = load_embedded_exercises();

    let existing_plan = storage.load_plan()?;
    let (deficits, cumulative) = match existing_plan {
        Some(p) => (p.maintenance_deficits, p.cumulative_effective_sets),
        None => (HashMap::new(), HashMap::new()),
    };

    let plan = sched_generate_plan(&settings, &profile, &exercises, deficits, cumulative);
    storage.save_plan(&plan)?;
    Ok(plan)
}

#[tauri::command]
pub fn get_session(app: tauri::AppHandle, session_number: u32) -> Result<Option<Session>, String> {
    let storage = get_storage(&app)?;
    let plan = storage.load_plan()?;
    if let Some(plan) = plan {
        let session = plan
            .sessions
            .into_iter()
            .find(|s| s.session_number == session_number);
        Ok(session)
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn swap_exercise(
    app: tauri::AppHandle,
    session_number: u32,
    block_index: usize,
    new_exercise_id: String,
) -> Result<Session, String> {
    let storage = get_storage(&app)?;
    let mut plan = storage
        .load_plan()?
        .ok_or_else(|| "No active workout plan found to swap exercise".to_string())?;

    let session = plan
        .sessions
        .iter_mut()
        .find(|s| s.session_number == session_number)
        .ok_or_else(|| format!("Session {} not found", session_number))?;

    if block_index >= session.blocks.len() {
        return Err(format!("Block index {} out of bounds", block_index));
    }

    let exercises = load_embedded_exercises();
    let new_ex = exercises
        .iter()
        .find(|e| e.id == new_exercise_id)
        .ok_or_else(|| format!("Exercise {} not found", new_exercise_id))?;

    let block = &mut session.blocks[block_index];
    let old_ex = exercises
        .iter()
        .find(|e| e.id == block.exercise_id)
        .ok_or_else(|| format!("Current exercise {} not found in library", block.exercise_id))?;

    // 1. Muscle match validation (Plan §7: must train the same muscle)
    let is_muscle_compatible = new_ex.primary_muscle == old_ex.primary_muscle
        || new_ex.contribution_weights.get(old_ex.primary_muscle) >= 0.5;

    if !is_muscle_compatible {
        return Err(format!(
            "Cannot swap: {} (primary: {}) does not target {}",
            new_ex.name,
            new_ex.primary_muscle.as_str(),
            old_ex.primary_muscle.as_str()
        ));
    }

    // 2. Equipment validation (Plan §7: must work with current equipment)
    let settings = storage.load_settings()?;
    let mut available_eq = vec![
        "none".to_string(),
        "bed".to_string(),
        "dumbbell".to_string(),
        "pull_bar".to_string(),
        "parallettes".to_string(),
    ];
    if settings.backpack {
        available_eq.push("backpack".to_string());
    }

    let has_required_equipment = new_ex
        .equipment
        .iter()
        .all(|eq| eq == "none" || available_eq.contains(eq));

    if !has_required_equipment {
        return Err(format!(
            "Cannot swap: {} requires {:?}, which is not available in current equipment settings",
            new_ex.name, new_ex.equipment
        ));
    }

    // 3. Maintain block set count, update exercise id and cues
    block.exercise_id = new_ex.id.clone();
    if new_ex.time_based {
        block.rep_target_min = 0;
        block.rep_target_max = 0;
        block.seconds_target_min = Some(20);
        block.seconds_target_max = Some(60);
    } else {
        block.rep_target_min = 8;
        block.rep_target_max = 15;
        block.seconds_target_min = None;
        block.seconds_target_max = None;
    }

    // Differentiate rest cue per Plan §8
    block.rest_cue = match new_ex.ladder.as_str() {
        "biceps"
        | "triceps_stretch"
        | "triceps_isolation"
        | "forearms_isolation"
        | "forearms_grip"
        | "abs"
        | "abs_floor" => "1-2 min between sets".to_string(),
        _ => "2-3 min between sets".to_string(),
    };

    // Adapt tempo cue if dumbbell exercise and profile has dumbbell calibration
    if new_ex.equipment.contains(&"dumbbell".to_string()) {
        if let Ok(profile) = storage.load_profile() {
            if let Some(db_reps) = profile.dumbbell_calibrated_reps {
                if db_reps > 22 {
                    block.tempo_cue = "Slow 3-4s lowering, pause in stretch, plus lengthened partials after failure".to_string();
                    block.rep_target_min = 10;
                    block.rep_target_max = 15;
                } else if db_reps > 15 {
                    block.tempo_cue = "Slow 3-4s lowering with 1s pause in stretch".to_string();
                    block.rep_target_min = 8;
                    block.rep_target_max = 12;
                } else if db_reps < 8 {
                    block.tempo_cue = "Controlled 2s negative, focus on form and control".to_string();
                    block.rep_target_min = 6;
                    block.rep_target_max = 10;
                } else {
                    block.tempo_cue = "Standard controlled 2-3s negative".to_string();
                    block.rep_target_min = 8;
                    block.rep_target_max = 15;
                }
            }
        }
    }

    // Re-sort session blocks and re-align focus to guarantee compound-first ordering after swaps
    crate::scheduler::sort_session_blocks(&mut session.blocks, &exercises);
    session.focus.clear();
    for b in &session.blocks {
        if let Some(e) = exercises.iter().find(|ex| ex.id == b.exercise_id) {
            if !session.focus.contains(&e.primary_muscle) {
                session.focus.push(e.primary_muscle);
            }
        }
    }

    let updated_session = session.clone();
    storage.save_plan(&plan)?;

    Ok(updated_session)
}

#[tauri::command]
pub fn calibrate_dumbbell(app: tauri::AppHandle, reps: u32) -> Result<Profile, String> {
    let storage = get_storage(&app)?;
    let mut profile = storage.load_profile()?;
    profile.dumbbell_calibrated_reps = Some(reps);
    storage.save_profile(&profile)?;

    // Regenerate plan with updated dumbbell cues and targets
    let settings = storage.load_settings()?;
    let exercises = load_embedded_exercises();
    let existing_plan = storage.load_plan()?;
    let (deficits, cumulative) = match existing_plan {
        Some(p) => (p.maintenance_deficits, p.cumulative_effective_sets),
        None => (HashMap::new(), HashMap::new()),
    };

    let plan = sched_generate_plan(&settings, &profile, &exercises, deficits, cumulative);
    storage.save_plan(&plan)?;

    Ok(profile)
}

#[tauri::command]
pub fn log_set(
    app: tauri::AppHandle,
    log: SetLog,
) -> Result<Option<ProgressionSuggestion>, String> {
    let storage = get_storage(&app)?;
    storage.append_set_log(&log)?;

    let mut profile = storage.load_profile()?;
    update_profile_from_set(&mut profile, &log);
    storage.save_profile(&profile)?;

    let settings = storage.load_settings()?;
    let exercises = load_embedded_exercises();
    let exercise = exercises.iter().find(|e| e.id == log.exercise_id);

    let plan = storage.load_plan()?;
    let block = plan.as_ref().and_then(|p| {
        p.sessions
            .iter()
            .find(|s| s.session_number == log.session_number)
            .and_then(|s| s.blocks.get(log.block_index))
    });

    if let (Some(ex), Some(blk)) = (exercise, block) {
        let all_logs = storage.load_set_logs()?;
        let recent_exercise_logs: Vec<SetLog> = all_logs
            .into_iter()
            .filter(|l| {
                l.exercise_id == log.exercise_id
                    && l.session_number == log.session_number
                    && l.block_index == log.block_index
            })
            .collect();

        let suggestion = evaluate_progression(blk, ex, &recent_exercise_logs, &settings);
        Ok(suggestion)
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn get_warnings(app: tauri::AppHandle) -> Result<Vec<Warning>, String> {
    let storage = get_storage(&app)?;
    let plan = storage.load_plan()?;
    if let Some(plan) = plan {
        let settings = storage.load_settings()?;
        let exercises = load_embedded_exercises();
        let mut ex_map = HashMap::new();
        for ex in exercises {
            ex_map.insert(ex.id.clone(), ex);
        }
        let tiers = load_embedded_warning_tiers();
        let warnings = evaluate_plan_warnings(&plan, &ex_map, &settings, &tiers);
        Ok(warnings)
    } else {
        Ok(Vec::new())
    }
}

#[tauri::command]
pub fn get_exercises() -> Vec<Exercise> {
    load_embedded_exercises()
}

#[tauri::command]
pub fn get_set_logs(app: tauri::AppHandle) -> Result<Vec<SetLog>, String> {
    let storage = get_storage(&app)?;
    storage.load_set_logs()
}

#[tauri::command]
pub fn trigger_deload(app: tauri::AppHandle) -> Result<Plan, String> {
    let storage = get_storage(&app)?;
    let plan = storage
        .load_plan()?
        .ok_or_else(|| "No active workout plan found to deload".to_string())?;

    let deload_plan = crate::progression::apply_deload(&plan);
    storage.save_plan(&deload_plan)?;
    Ok(deload_plan)
}

#[tauri::command]
pub fn complete_session(
    app: tauri::AppHandle,
    session: CompletedSession,
    sets: Vec<SetLog>,
) -> Result<Vec<ProgressionSuggestion>, String> {
    let storage = get_storage(&app)?;
    storage.append_completed_session(&session)?;

    let mut profile = storage.load_profile()?;
    let settings = storage.load_settings()?;
    let exercises = load_embedded_exercises();
    let plan = storage.load_plan()?;
    let mut suggestions = Vec::new();

    for set in &sets {
        storage.append_set_log(set)?;
        update_profile_from_set(&mut profile, set);

        let exercise = exercises.iter().find(|e| e.id == set.exercise_id);
        let block = plan.as_ref().and_then(|p| {
            p.sessions
                .iter()
                .find(|s| s.session_number == set.session_number)
                .and_then(|s| s.blocks.get(set.block_index))
        });

        if let (Some(ex), Some(blk)) = (exercise, block) {
            let current_block_sets: Vec<SetLog> = sets
                .iter()
                .filter(|l| l.exercise_id == set.exercise_id && l.block_index == set.block_index)
                .cloned()
                .collect();

            if let Some(sugg) = evaluate_progression(blk, ex, &current_block_sets, &settings) {
                if !suggestions.iter().any(|s: &ProgressionSuggestion| s.exercise_id == sugg.exercise_id) {
                    suggestions.push(sugg);
                }
            }
        }
    }

    storage.save_profile(&profile)?;
    Ok(suggestions)
}

#[tauri::command]
pub fn get_session_history(app: tauri::AppHandle) -> Result<Vec<CompletedSession>, String> {
    let storage = get_storage(&app)?;
    let mut history = storage.load_session_history()?;

    if history.is_empty() {
        let set_logs = storage.load_set_logs()?;
        if !set_logs.is_empty() {
            let exercises = load_embedded_exercises();
            let mut by_session: HashMap<u32, Vec<SetLog>> = HashMap::new();
            for log in set_logs {
                by_session.entry(log.session_number).or_default().push(log);
            }
            for (sess_num, s_logs) in by_session {
                let earliest_ts = s_logs.iter().map(|l| l.timestamp).min().unwrap_or(0);
                let mut ex_map: HashMap<String, Vec<SetLog>> = HashMap::new();
                for log in &s_logs {
                    ex_map.entry(log.exercise_id.clone()).or_default().push(log.clone());
                }
                let mut exercises_summary = Vec::new();
                let mut focus = Vec::new();
                for (ex_id, elogs) in ex_map {
                    let ex_name = exercises
                        .iter()
                        .find(|e| e.id == ex_id)
                        .map(|e| e.name.clone())
                        .unwrap_or_else(|| ex_id.replace('_', " "));
                    if let Some(e) = exercises.iter().find(|e| e.id == ex_id) {
                        if !focus.contains(&e.primary_muscle) {
                            focus.push(e.primary_muscle);
                        }
                    }
                    let sets_completed = elogs.len() as u32;
                    let reps_or_seconds = elogs.iter().map(|l| l.reps_or_seconds).collect();
                    let added_weight_kg = elogs.first().map(|l| l.added_weight_kg).unwrap_or(0.0);
                    let avg_rir = elogs.iter().map(|l| l.reps_from_failure as f64).sum::<f64>()
                        / (elogs.len() as f64);
                    exercises_summary.push(SessionExerciseSummary {
                        exercise_id: ex_id,
                        exercise_name: ex_name,
                        sets_completed,
                        reps_or_seconds,
                        added_weight_kg,
                        avg_rir,
                    });
                }
                history.push(CompletedSession {
                    id: format!("legacy-{}", sess_num),
                    timestamp: earliest_ts,
                    session_number: sess_num,
                    focus,
                    total_sets: s_logs.len() as u32,
                    exercises_summary,
                });
            }
            history.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        }
    } else {
        history.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    }

    Ok(history)
}
