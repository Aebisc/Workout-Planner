use crate::calibration::calibrate_initial_profile;
use crate::models::{
    CalibrationAnswers, CompleteSessionResponse, CompletedSession, Exercise, FullBackupPayload,
    LanSyncStatus, Plan, Profile, ProgressionSuggestion, Session, SessionExerciseSummary, SetLog,
    Settings, Warning,
};
use crate::progression::{evaluate_progression, update_profile_from_set};
use crate::scheduler::generate_plan as sched_generate_plan;
use crate::storage::StorageManager;
use crate::volume::evaluate_plan_warnings;
use crate::{load_embedded_exercises, load_embedded_warning_tiers};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{Emitter, Manager};

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

    let exercises = load_embedded_exercises();
    let old_exercise_id = {
        let session = plan
            .sessions
            .iter()
            .find(|s| s.session_number == session_number)
            .ok_or_else(|| format!("Session {} not found", session_number))?;

        if block_index >= session.blocks.len() {
            return Err(format!("Block index {} out of bounds", block_index));
        }
        session.blocks[block_index].exercise_id.clone()
    };

    let new_ex = exercises
        .iter()
        .find(|e| e.id == new_exercise_id)
        .ok_or_else(|| format!("Exercise {} not found", new_exercise_id))?;

    let old_ex = exercises
        .iter()
        .find(|e| e.id == old_exercise_id)
        .ok_or_else(|| format!("Current exercise {} not found in library", old_exercise_id))?;

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
    let available_eq = settings.get_available_equipment();

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

    // 3. Mutate session block with unified cues and maintain block set count
    let mutate_session_block = |sess: &mut Session| -> Result<(), String> {
        let block = sess
            .blocks
            .get_mut(block_index)
            .ok_or_else(|| format!("Block index {} not found in session {}", block_index, sess.session_number))?;

        block.exercise_id = new_ex.id.clone();
        block.added_weight_kg = 0.0;
        block.tempo_cue = "Controlled 2-3s negative".to_string();
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

        block.effort_target = crate::scheduler::effort_target_for_exercise(new_ex);
        block.rest_cue = crate::scheduler::rest_cue_for_exercise(new_ex);

        // Re-sort session blocks and re-align focus to guarantee compound-first ordering after swaps
        crate::scheduler::sort_session_blocks(&mut sess.blocks, &exercises);
        sess.focus.clear();
        for b in &sess.blocks {
            if let Some(e) = exercises.iter().find(|ex| ex.id == b.exercise_id) {
                if !sess.focus.contains(&e.primary_muscle) {
                    sess.focus.push(e.primary_muscle);
                }
            }
        }

        Ok(())
    };

    let session = plan
        .sessions
        .iter_mut()
        .find(|s| s.session_number == session_number)
        .ok_or_else(|| format!("Session {} not found", session_number))?;
    mutate_session_block(session)?;
    let updated_session = session.clone();

    if plan.is_deload {
        if let Some(ref mut pre_sessions) = plan.pre_deload_sessions {
            if let Some(pre_sess) = pre_sessions.iter_mut().find(|s| s.session_number == session_number) {
                mutate_session_block(pre_sess)?;
            }
        }
    }

    storage.save_plan(&plan)?;

    Ok(updated_session)
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

        let suggestion = evaluate_progression(
            log.session_number,
            log.block_index,
            blk,
            ex,
            &recent_exercise_logs,
            &settings,
        );
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
        let mut warnings = evaluate_plan_warnings(&plan, &ex_map, &settings, &tiers);

        if !plan.is_deload {
            let all_logs = storage.load_set_logs()?;
            let stall_warnings = crate::volume::evaluate_stall_warnings(&plan, &ex_map, &all_logs);
            warnings.extend(stall_warnings);
        }

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
pub fn restore_deload_plan(app: tauri::AppHandle) -> Result<Plan, String> {
    let storage = get_storage(&app)?;
    let plan = storage
        .load_plan()?
        .ok_or_else(|| "No active workout plan found to restore".to_string())?;

    let restored = crate::progression::restore_from_deload(&plan);
    storage.save_plan(&restored)?;
    Ok(restored)
}

#[tauri::command]
pub fn apply_progression(
    app: tauri::AppHandle,
    session_number: u32,
    block_index: usize,
    new_exercise_id: Option<String>,
    new_added_weight_kg: Option<f64>,
    new_tempo_cue: Option<String>,
) -> Result<Plan, String> {
    let storage = get_storage(&app)?;
    let mut plan = storage
        .load_plan()?
        .ok_or_else(|| "No active plan found".to_string())?;

    let exercises = load_embedded_exercises();

    let mutate_block = |sess: &mut Session| -> Result<(), String> {
        let block = sess
            .blocks
            .get_mut(block_index)
            .ok_or_else(|| format!("Block index {} not found in session {}", block_index, sess.session_number))?;

        // Invariant Check (§8): Never touch block.sets!
        if let Some(w) = new_added_weight_kg {
            block.added_weight_kg = w;
            if block.seconds_target_min.is_none() {
                block.rep_target_min = 8;
                block.rep_target_max = 12;
            }
        }

        if let Some(ref cue) = new_tempo_cue {
            block.tempo_cue = cue.clone();
        }

        if let Some(ref ex_id) = new_exercise_id {
            let new_ex = exercises
                .iter()
                .find(|e| e.id == *ex_id)
                .ok_or_else(|| format!("Exercise {} not found in exercises library", ex_id))?;

            block.exercise_id = new_ex.id.clone();
            block.added_weight_kg = 0.0;
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
            block.effort_target = crate::scheduler::effort_target_for_exercise(new_ex);
            block.tempo_cue = "Controlled 2-3s negative".to_string();
            block.rest_cue = crate::scheduler::rest_cue_for_exercise(new_ex);

            // Universal Exercise Sequencing (§6.4)
            crate::scheduler::sort_session_blocks(&mut sess.blocks, &exercises);
            sess.focus.clear();
            for b in &sess.blocks {
                if let Some(e) = exercises.iter().find(|ex| ex.id == b.exercise_id) {
                    if !sess.focus.contains(&e.primary_muscle) {
                        sess.focus.push(e.primary_muscle);
                    }
                }
            }
        }

        Ok(())
    };

    let session = plan
        .sessions
        .iter_mut()
        .find(|s| s.session_number == session_number)
        .ok_or_else(|| format!("Session {} not found", session_number))?;
    mutate_block(session)?;

    if plan.is_deload {
        if let Some(ref mut pre_sessions) = plan.pre_deload_sessions {
            if let Some(pre_sess) = pre_sessions.iter_mut().find(|s| s.session_number == session_number) {
                mutate_block(pre_sess)?;
            }
        }
    }

    storage.save_plan(&plan)?;
    Ok(plan)
}

#[tauri::command]
pub fn complete_session(
    app: tauri::AppHandle,
    session: CompletedSession,
    sets: Vec<SetLog>,
) -> Result<CompleteSessionResponse, String> {
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
    }

    let all_logs = storage.load_set_logs()?;
    let mut evaluated_blocks = std::collections::HashSet::new();

    for set in &sets {
        if !evaluated_blocks.insert((set.session_number, set.block_index)) {
            continue;
        }

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

            let mut block_suggestion = evaluate_progression(
                session.session_number,
                set.block_index,
                blk,
                ex,
                &current_block_sets,
                &settings,
            );

            let is_deload = plan.as_ref().map(|p| p.is_deload).unwrap_or(false);
            let is_below_top_target = block_suggestion
                .as_ref()
                .map(|s| s.action == "add_reps")
                .unwrap_or(true);

            if !is_deload
                && is_below_top_target
                && crate::progression::detect_stall_from_all_logs(&ex.id, &all_logs)
            {
                let next_ex = ex.harder_id.clone().or_else(|| ex.easier_id.clone());
                block_suggestion = Some(ProgressionSuggestion {
                    session_number: session.session_number,
                    block_index: set.block_index,
                    exercise_id: ex.id.clone(),
                    action: "stall_detected".to_string(),
                    message: format!(
                        "{} has stalled for 3 consecutive exposures without rep or load progress. Consider applying execution intensifiers, swapping variations, or triggering a deload cycle.",
                        ex.name
                    ),
                    new_added_weight_kg: None,
                    next_exercise_id: next_ex,
                    new_tempo_cue: Some("Slow 3-4s lowering, 1s pause at bottom".to_string()),
                });
            }

            if let Some(sugg) = block_suggestion {
                if !suggestions.iter().any(|s: &ProgressionSuggestion| s.exercise_id == sugg.exercise_id && s.block_index == sugg.block_index) {
                    suggestions.push(sugg);
                }
            }
        }
    }

    storage.save_profile(&profile)?;

    let is_deload = plan.as_ref().map(|p| p.is_deload).unwrap_or(false);
    let deload_cycle_completed = if is_deload {
        if let Some(ref p) = plan {
            session.session_number >= p.cycle.sessions_count
        } else {
            false
        }
    } else {
        false
    };

    Ok(CompleteSessionResponse {
        suggestions,
        deload_cycle_completed,
    })
}

#[tauri::command]
pub fn get_session_history(app: tauri::AppHandle) -> Result<Vec<CompletedSession>, String> {
    let storage = get_storage(&app)?;
    let mut history = storage.load_session_history()?;

    if history.is_empty() {
        let mut set_logs = storage.load_set_logs()?;
        if !set_logs.is_empty() {
            set_logs.sort_by_key(|l| l.timestamp);
            let exercises = load_embedded_exercises();

            // Cluster sets into individual workout sessions by session_number and 12-hour window
            let mut session_clusters: Vec<Vec<SetLog>> = Vec::new();
            for log in set_logs {
                let found_cluster = session_clusters.iter_mut().find(|cluster| {
                    if let Some(first) = cluster.first() {
                        first.session_number == log.session_number
                            && (log.timestamp - first.timestamp).abs() < 43_200_000
                    } else {
                        false
                    }
                });
                if let Some(cluster) = found_cluster {
                    cluster.push(log);
                } else {
                    session_clusters.push(vec![log]);
                }
            }

            for s_logs in session_clusters {
                let earliest_ts = s_logs.iter().map(|l| l.timestamp).min().unwrap_or(0);
                let sess_num = s_logs.first().map(|l| l.session_number).unwrap_or(1);
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
                    id: format!("legacy-{}-{}", sess_num, earliest_ts),
                    timestamp: earliest_ts,
                    session_number: sess_num,
                    focus,
                    total_sets: s_logs.len() as u32,
                    exercises_summary,
                });
            }
            history.sort_by_key(|a| std::cmp::Reverse(a.timestamp));
        }
    } else {
        history.sort_by_key(|a| std::cmp::Reverse(a.timestamp));
    }

    Ok(history)
}

#[tauri::command]
pub fn update_completed_session(
    app: tauri::AppHandle,
    session: CompletedSession,
    sets: Vec<SetLog>,
) -> Result<(), String> {
    let storage = get_storage(&app)?;
    let mut history = storage.load_session_history()?;

    let mut old_timestamp: Option<i64> = None;

    if let Some(pos) = history.iter().position(|s| s.id == session.id) {
        old_timestamp = Some(history[pos].timestamp);
        history[pos] = session.clone();
    } else if let Some(pos) = history.iter().position(|s| {
        s.session_number == session.session_number
            && (s.timestamp - session.timestamp).abs() < 43_200_000
    }) {
        old_timestamp = Some(history[pos].timestamp);
        history[pos] = session.clone();
    } else {
        history.push(session.clone());
    }
    storage.save_session_history(&history)?;

    // Update set logs: purge sets matching session number within 12h of either new or old timestamp
    let mut all_logs = storage.load_set_logs()?;
    let mut removed_logs: Vec<SetLog> = Vec::new();
    all_logs.retain(|l| {
        let matches_new = l.session_number == session.session_number
            && (l.timestamp - session.timestamp).abs() < 43_200_000;
        let matches_old = if let Some(old_ts) = old_timestamp {
            l.session_number == session.session_number
                && (l.timestamp - old_ts).abs() < 43_200_000
        } else {
            false
        };
        let should_remove = matches_new || matches_old;
        if should_remove {
            removed_logs.push(l.clone());
        }
        !should_remove
    });
    for s in &sets {
        all_logs.push(s.clone());
    }
    storage.save_set_logs(&all_logs)?;

    if let Ok(mut profile) = storage.load_profile() {
        crate::progression::rebuild_profile_maxes_from_logs(&mut profile, &removed_logs, &all_logs);
        for s in &sets {
            update_profile_from_set(&mut profile, s);
        }
        let _ = storage.save_profile(&profile);
    }

    Ok(())
}

#[tauri::command]
pub fn delete_completed_session(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let storage = get_storage(&app)?;
    let mut history = storage.load_session_history()?;
    if let Some(pos) = history.iter().position(|s| s.id == id) {
        let removed = history.remove(pos);
        storage.save_session_history(&history)?;

        let mut set_logs = storage.load_set_logs()?;
        let mut removed_logs: Vec<SetLog> = Vec::new();
        set_logs.retain(|l| {
            let should_remove = l.session_number == removed.session_number
                && (l.timestamp - removed.timestamp).abs() < 43_200_000;
            if should_remove {
                removed_logs.push(l.clone());
            }
            !should_remove
        });
        storage.save_set_logs(&set_logs)?;

        if let Ok(mut profile) = storage.load_profile() {
            crate::progression::rebuild_profile_maxes_from_logs(&mut profile, &removed_logs, &set_logs);
            let _ = storage.save_profile(&profile);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn export_full_backup(
    app: tauri::AppHandle,
    client_meta: Option<serde_json::Value>,
) -> Result<FullBackupPayload, String> {
    let storage = get_storage(&app)?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    Ok(FullBackupPayload {
        version: 1,
        exported_at: now,
        settings: storage.load_settings()?,
        profile: storage.load_profile()?,
        plan: storage.load_plan()?,
        set_logs: storage.load_set_logs()?,
        session_history: storage.load_session_history()?,
        client_meta,
    })
}

#[tauri::command]
pub fn import_full_backup(
    app: tauri::AppHandle,
    payload: FullBackupPayload,
) -> Result<FullBackupPayload, String> {
    let storage = get_storage(&app)?;
    storage.save_settings(&payload.settings)?;
    storage.save_profile(&payload.profile)?;
    if let Some(ref plan) = payload.plan {
        storage.save_plan(plan)?;
    } else {
        let exercises = load_embedded_exercises();
        let generated = sched_generate_plan(
            &payload.settings,
            &payload.profile,
            &exercises,
            HashMap::new(),
            HashMap::new(),
        );
        storage.save_plan(&generated)?;
    }
    storage.save_set_logs(&payload.set_logs)?;
    storage.save_session_history(&payload.session_history)?;
    Ok(payload)
}

struct LanServerState {
    running: bool,
    ip: String,
    port: u16,
    pin: String,
    client_meta: Option<serde_json::Value>,
}

static LAN_STATE: OnceLock<Arc<Mutex<LanServerState>>> = OnceLock::new();

fn get_lan_state() -> Arc<Mutex<LanServerState>> {
    LAN_STATE
        .get_or_init(|| {
            Arc::new(Mutex::new(LanServerState {
                running: false,
                ip: "127.0.0.1".to_string(),
                port: 7878,
                pin: "0000".to_string(),
                client_meta: None,
            }))
        })
        .clone()
}

fn detect_local_ip() -> String {
    if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                let ip = addr.ip().to_string();
                if ip != "0.0.0.0" {
                    return ip;
                }
            }
        }
    }
    "127.0.0.1".to_string()
}

#[tauri::command]
pub fn start_lan_sync_server(
    app: tauri::AppHandle,
    client_meta: Option<serde_json::Value>,
) -> Result<LanSyncStatus, String> {
    let state_arc = get_lan_state();
    {
        let mut st = state_arc.lock().unwrap();
        if st.running {
            st.client_meta = client_meta;
            return Ok(LanSyncStatus {
                running: true,
                ip: st.ip.clone(),
                port: st.port,
                pin: st.pin.clone(),
            });
        }
    }

    let ip = detect_local_ip();
    let port = 7878;
    let pin = format!(
        "{:04}",
        (std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.subsec_nanos())
            .unwrap_or(1234)
            % 9000)
            + 1000
    );

    let listener = std::net::TcpListener::bind(format!("0.0.0.0:{}", port))
        .map_err(|e| format!("Failed to bind Wi-Fi sync port {}: {}", port, e))?;
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("Failed to configure listener: {}", e))?;

    {
        let mut st = state_arc.lock().unwrap();
        st.running = true;
        st.ip = ip.clone();
        st.port = port;
        st.pin = pin.clone();
        st.client_meta = client_meta;
    }

    let app_handle = app.clone();
    let thread_state = state_arc.clone();

    std::thread::spawn(move || {
        use std::io::{Read, Write};
        loop {
            {
                let st = thread_state.lock().unwrap();
                if !st.running {
                    break;
                }
            }
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(5)));
                    let mut buf = vec![0u8; 8192];
                    let mut total_read = 0usize;
                    let mut header_end = None;
                    let mut content_len = 0usize;

                    loop {
                        if total_read >= buf.len() {
                            buf.resize(buf.len() * 2, 0);
                        }
                        match stream.read(&mut buf[total_read..]) {
                            Ok(0) => break,
                            Ok(n) => {
                                total_read += n;
                                let req_str = String::from_utf8_lossy(&buf[..total_read]);
                                if header_end.is_none() {
                                    if let Some(pos) = req_str.find("\r\n\r\n") {
                                        header_end = Some(pos + 4);
                                        for line in req_str[..pos].lines() {
                                            if line.to_ascii_lowercase().starts_with("content-length:") {
                                                if let Some(val) = line.split(':').nth(1) {
                                                    content_len = val.trim().parse().unwrap_or(0);
                                                }
                                            }
                                        }
                                        if total_read < pos + 4 + content_len && buf.len() < pos + 4 + content_len {
                                            buf.resize(pos + 4 + content_len + 1024, 0);
                                        }
                                    }
                                }
                                if let Some(h_end) = header_end {
                                    if total_read >= h_end + content_len {
                                        break;
                                    }
                                }
                            }
                            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                                std::thread::sleep(std::time::Duration::from_millis(10));
                                continue;
                            }
                            Err(_) => break,
                        }
                    }

                    let req_str = String::from_utf8_lossy(&buf[..total_read]);
                    let first_line = req_str.lines().next().unwrap_or("");
                    let parts: Vec<&str> = first_line.split_whitespace().collect();
                    let method = parts.first().copied().unwrap_or("");
                    let path = parts.get(1).copied().unwrap_or("");

                    let cors_headers = "Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\n";

                    if method == "OPTIONS" {
                        let resp = format!("HTTP/1.1 204 No Content\r\n{}\r\n", cors_headers);
                        let _ = stream.write_all(resp.as_bytes());
                        continue;
                    }

                    let expected_pin = { thread_state.lock().unwrap().pin.clone() };
                    let pin_ok = path.contains(&format!("pin={}", expected_pin));

                    if !pin_ok {
                        let body = r#"{"error":"Invalid PIN"}"#;
                        let resp = format!(
                            "HTTP/1.1 403 Forbidden\r\n{}Content-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
                            cors_headers,
                            body.len(),
                            body
                        );
                        let _ = stream.write_all(resp.as_bytes());
                        continue;
                    }

                    if method == "GET" {
                        let meta = { thread_state.lock().unwrap().client_meta.clone() };
                        if let Ok(payload) = export_full_backup(app_handle.clone(), meta) {
                            let body = serde_json::to_string(&payload).unwrap_or_default();
                            let resp = format!(
                                "HTTP/1.1 200 OK\r\n{}Content-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
                                cors_headers,
                                body.len(),
                                body
                            );
                            let _ = stream.write_all(resp.as_bytes());
                        }
                    } else if method == "POST" {
                        if let Some(h_end) = header_end {
                            let body_bytes = &buf[h_end..total_read];
                            if let Ok(payload) = serde_json::from_slice::<FullBackupPayload>(body_bytes) {
                                {
                                    let mut st = thread_state.lock().unwrap();
                                    st.client_meta = payload.client_meta.clone();
                                }
                                if import_full_backup(app_handle.clone(), payload).is_ok() {
                                    let _ = app_handle.emit("mgp://lan-sync-received", ());
                                    let ok_body = r#"{"status":"ok"}"#;
                                    let resp = format!(
                                        "HTTP/1.1 200 OK\r\n{}Content-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
                                        cors_headers,
                                        ok_body.len(),
                                        ok_body
                                    );
                                    let _ = stream.write_all(resp.as_bytes());
                                    continue;
                                }
                            }
                        }
                        let err_body = r#"{"error":"Invalid payload"}"#;
                        let resp = format!(
                            "HTTP/1.1 400 Bad Request\r\n{}Content-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
                            cors_headers,
                            err_body.len(),
                            err_body
                        );
                        let _ = stream.write_all(resp.as_bytes());
                    }
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
                Err(_) => break,
            }
        }
    });

    Ok(LanSyncStatus {
        running: true,
        ip,
        port,
        pin,
    })
}

#[tauri::command]
pub fn stop_lan_sync_server() -> Result<LanSyncStatus, String> {
    let state_arc = get_lan_state();
    let mut st = state_arc.lock().unwrap();
    st.running = false;
    Ok(LanSyncStatus {
        running: false,
        ip: st.ip.clone(),
        port: st.port,
        pin: st.pin.clone(),
    })
}

#[tauri::command]
pub fn get_lan_sync_status() -> Result<LanSyncStatus, String> {
    let state_arc = get_lan_state();
    let st = state_arc.lock().unwrap();
    Ok(LanSyncStatus {
        running: st.running,
        ip: st.ip.clone(),
        port: st.port,
        pin: st.pin.clone(),
    })
}

#[tauri::command]
pub fn get_lan_client_meta() -> Result<Option<serde_json::Value>, String> {
    let state_arc = get_lan_state();
    let st = state_arc.lock().unwrap();
    Ok(st.client_meta.clone())
}

