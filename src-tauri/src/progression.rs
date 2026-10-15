use crate::models::{
    Block, Exercise, Plan, Profile, ProgressionSuggestion, SetLog, Settings, Units,
};

/// Evaluates double progression for an exercise based on recent logged sets.
/// Progression order:
/// 1. More reps up to top of window (e.g. 15 or 20 reps).
/// 2. Execution intensifiers (slow 3-4s lowering, pause in stretch, lengthened partials).
/// 3. Harder variation (next rung on ladder).
/// 4. Backpack weight (if enabled, in 1.5L / 5L bottle units).
/// Checks whether logged performances meet the fatigue-aware progression criteria:
/// Condition A: Strict top sweep across all hard sets.
/// Condition B: 2+ hard sets inside target window, best set >= top_target, and average within ~10% of top.
/// Condition C: First/best set overflows top target by 2+ reps (or 10+s) with all sets inside window.
pub fn check_ready_to_progress(
    time_based: bool,
    min_target: u32,
    top_target: u32,
    hard_perfs: &[u32],
) -> bool {
    if hard_perfs.is_empty() {
        return false;
    }
    let all_sets_hit_top = hard_perfs.iter().all(|&p| p >= top_target);
    let max_perf = hard_perfs.iter().copied().max().unwrap_or(0);
    let all_in_window = hard_perfs.iter().all(|&p| p >= min_target);
    let avg_perf = hard_perfs.iter().copied().sum::<u32>() as f64 / (hard_perfs.len() as f64);

    let avg_threshold = if time_based {
        (top_target as f64) * 0.90
    } else {
        (top_target as f64) - 1.5
    };
    let overflow_threshold = if time_based {
        top_target + 10
    } else {
        top_target + 2
    };

    all_sets_hit_top
        || (hard_perfs.len() >= 2
            && all_in_window
            && ((max_perf >= top_target && avg_perf >= avg_threshold)
                || max_perf >= overflow_threshold))
}

/// Evaluates double progression for an exercise based on recent logged sets.
/// Progression order:
/// 1. More reps up to top of window (e.g. 15 or 20 reps).
/// 2. Execution intensifiers (slow 3-4s lowering, pause in stretch, lengthened partials).
/// 3. Harder variation (next rung on ladder).
/// 4. Backpack weight (if enabled, in 1.5L / 5L bottle units).
pub fn evaluate_progression(
    session_number: u32,
    block_index: usize,
    block: &Block,
    exercise: &Exercise,
    recent_logs: &[SetLog],
    settings: &Settings,
) -> Option<ProgressionSuggestion> {
    if recent_logs.is_empty() {
        return None;
    }

    let hard_sets: Vec<&SetLog> = recent_logs
        .iter()
        .filter(|l| l.exercise_id == exercise.id && l.reps_from_failure <= 3)
        .collect();

    if hard_sets.is_empty() {
        return Some(ProgressionSuggestion {
            session_number,
            block_index,
            exercise_id: exercise.id.clone(),
            action: "effort_check".to_string(),
            message: "Sets were ended 4+ reps from failure. Aim to bring sets within 0-3 reps of failure for effective growth stimulus.".to_string(),
            new_added_weight_kg: None,
            next_exercise_id: None,
            new_tempo_cue: None,
        });
    }

    let (min_target, top_target) = if exercise.time_based {
        (
            block.seconds_target_min.unwrap_or(20),
            block.seconds_target_max.unwrap_or(60),
        )
    } else {
        (
            block.rep_target_min.max(6),
            block.rep_target_max.max(15),
        )
    };
    let unit_label = if exercise.time_based { "seconds" } else { "reps" };

    let hard_perfs: Vec<u32> = hard_sets.iter().map(|l| l.reps_or_seconds).collect();
    let ready_to_progress = check_ready_to_progress(
        exercise.time_based,
        min_target,
        top_target,
        &hard_perfs,
    );

    if ready_to_progress {
        // Step 2, 3 or 4: Execution intensifiers -> Harder variation -> Backpack weight
        let partials_cue = if exercise.stretched_position && !exercise.time_based {
            ", and lengthened partials after failure"
        } else {
            ""
        };

        if let Some(ref harder_id) = exercise.harder_id {
            if exercise.time_based {
                if !block.tempo_cue.contains("Focus on full-body tension") {
                    Some(ProgressionSuggestion {
                        session_number,
                        block_index,
                        exercise_id: exercise.id.clone(),
                        action: "intensify_execution".to_string(),
                        message: format!(
                            "Top hold time reached. Deepen the stimulus first: focus on full-body tension and active shoulder/core bracing. When this feels mastered, advance to the next variation: {}.",
                            harder_id
                        ),
                        new_added_weight_kg: None,
                        next_exercise_id: Some(harder_id.clone()),
                        new_tempo_cue: Some("Focus on full-body tension and active shoulder/core bracing".to_string()),
                    })
                } else {
                    Some(ProgressionSuggestion {
                        session_number,
                        block_index,
                        exercise_id: exercise.id.clone(),
                        action: "advance_variation".to_string(),
                        message: format!(
                            "You've mastered the intensified hold on {}! Advance to the next ladder rung: {}.",
                            exercise.name,
                            harder_id
                        ),
                        new_added_weight_kg: None,
                        next_exercise_id: Some(harder_id.clone()),
                        new_tempo_cue: Some("Controlled hold".to_string()),
                    })
                }
            } else if !block.tempo_cue.contains("3-4s") {
                Some(ProgressionSuggestion {
                    session_number,
                    block_index,
                    exercise_id: exercise.id.clone(),
                    action: "intensify_execution".to_string(),
                    message: format!(
                        "Top reps reached. Deepen the stimulus first: try a 3-4s lowering tempo, pause at the bottom{}. When this feels mastered, advance to the next variation: {}.",
                        partials_cue,
                        harder_id
                    ),
                    new_added_weight_kg: None,
                    next_exercise_id: Some(harder_id.clone()),
                    new_tempo_cue: Some(format!("Slow 3-4s lowering, 1s pause at bottom{}", partials_cue)),
                })
            } else {
                Some(ProgressionSuggestion {
                    session_number,
                    block_index,
                    exercise_id: exercise.id.clone(),
                    action: "advance_variation".to_string(),
                    message: format!(
                        "You've mastered the intensified tempo on {}! Advance to the next ladder rung: {}.",
                        exercise.name,
                        harder_id
                    ),
                    new_added_weight_kg: None,
                    next_exercise_id: Some(harder_id.clone()),
                    new_tempo_cue: Some("Controlled 2-3s negative".to_string()),
                })
            }
        } else if settings.backpack {
            let current_weight = block.added_weight_kg;
            let next_weight = current_weight + 1.5;
            let bottle_cue = format_backpack_loading(next_weight, settings.units);
            Some(ProgressionSuggestion {
                session_number,
                block_index,
                exercise_id: exercise.id.clone(),
                action: "add_backpack_weight".to_string(),
                message: format!(
                    "You've maxed out this variation! Add backpack weight: {}.",
                    bottle_cue
                ),
                new_added_weight_kg: Some(next_weight),
                next_exercise_id: None,
                new_tempo_cue: None,
            })
        } else if exercise.time_based {
            Some(ProgressionSuggestion {
                session_number,
                block_index,
                exercise_id: exercise.id.clone(),
                action: "intensify_execution".to_string(),
                message: "Top hold time reached. Focus on full-body tension and active shoulder/core bracing.".to_string(),
                new_added_weight_kg: None,
                next_exercise_id: None,
                new_tempo_cue: Some("Focus on full-body tension and active shoulder/core bracing".to_string()),
            })
        } else {
            // Execution intensifiers for exercises without harder variations (e.g. dumbbell exercises)
            Some(ProgressionSuggestion {
                session_number,
                block_index,
                exercise_id: exercise.id.clone(),
                action: "intensify_execution".to_string(),
                message: format!(
                    "Top reps reached. Deepen the stimulus with a 3-4s lowering tempo, pause at the bottom{}.",
                    partials_cue
                ),
                new_added_weight_kg: None,
                next_exercise_id: None,
                new_tempo_cue: Some(format!("Slow 3-4s lowering, 1s pause at bottom{}", partials_cue)),
            })
        }
    } else {
        Some(ProgressionSuggestion {
            session_number,
            block_index,
            exercise_id: exercise.id.clone(),
            action: "add_reps".to_string(),
            message: format!(
                "Keep working towards {} {} across all sets at 0-3 reps from failure.",
                top_target, unit_label
            ),
            new_added_weight_kg: None,
            next_exercise_id: None,
            new_tempo_cue: None,
        })
    }
}

/// Rebuilds profile.estimated_max_reps for exercises affected by an edited or deleted session.
pub fn rebuild_profile_maxes_from_logs(
    profile: &mut Profile,
    previous_logs_for_removed_session: &[SetLog],
    all_remaining_logs: &[SetLog],
) {
    let affected_exercises: std::collections::HashSet<String> = previous_logs_for_removed_session
        .iter()
        .map(|l| l.exercise_id.clone())
        .collect();

    for ex_id in affected_exercises {
        let max_from_logs = all_remaining_logs
            .iter()
            .filter(|l| l.exercise_id == ex_id && l.reps_from_failure <= 3)
            .map(|l| l.reps_or_seconds + l.reps_from_failure)
            .max();

        if let Some(max_val) = max_from_logs {
            profile.estimated_max_reps.insert(ex_id, max_val);
        } else {
            profile.estimated_max_reps.remove(&ex_id);
        }
    }
}

/// Detects stall from historical set logs grouped across chronological exposures:
/// 1. Filters logs to matching exercise and hard sets (reps_from_failure <= 3).
/// 2. Groups into distinct exposures separated by > 3 hours or distinct session_number.
/// 3. Checks if added_weight_kg increased across last 3 exposures (if so, not a stall).
/// 4. Checks if best hard-set reps failed to increase across the 3 exposures.
pub fn detect_stall_from_all_logs(exercise_id: &str, all_logs: &[SetLog]) -> bool {
    let mut matching_logs: Vec<SetLog> = all_logs
        .iter()
        .filter(|l| l.exercise_id == exercise_id && l.reps_from_failure <= 3)
        .cloned()
        .collect();

    if matching_logs.is_empty() {
        return false;
    }

    matching_logs.sort_by_key(|l| l.timestamp);

    let mut exposures: Vec<Vec<SetLog>> = Vec::new();
    let three_hours_ms: i64 = 3 * 3600 * 1000;

    for log in matching_logs {
        let new_group = if let Some(last_group) = exposures.last() {
            if let Some(last_log) = last_group.last() {
                (log.timestamp - last_log.timestamp).abs() > three_hours_ms
                    || log.session_number != last_log.session_number
            } else {
                true
            }
        } else {
            true
        };

        if new_group {
            exposures.push(vec![log]);
        } else {
            exposures.last_mut().unwrap().push(log);
        }
    }

    if exposures.len() < 3 {
        return false;
    }

    let last_three = &exposures[exposures.len() - 3..];
    detect_stall(exercise_id, last_three)
}

/// Detects stall: 3 consecutive exposures to an exercise without rep, time, or load progress.
/// Evaluates average reps or seconds across all hard sets (reps_from_failure <= 3).
/// If the average of the most recent session has not increased compared to the first (oldest) session
/// in the 3-session window (at the same or lower load), a stall is detected.
pub fn detect_stall(exercise_id: &str, session_logs: &[Vec<SetLog>]) -> bool {
    if session_logs.len() < 3 {
        return false;
    }

    let mut session_averages = Vec::new();
    let mut session_max_weights = Vec::new();

    // Iterate through the 3 most recent sessions (rev().take(3))
    // Index 0: most recent, Index 1: middle, Index 2: oldest
    for logs in session_logs.iter().rev().take(3) {
        let hard_sets: Vec<&SetLog> = logs
            .iter()
            .filter(|l| l.exercise_id == exercise_id && l.reps_from_failure <= 3)
            .collect();

        if hard_sets.is_empty() {
            return false;
        }

        let total_reps: u32 = hard_sets.iter().map(|l| l.reps_or_seconds).sum();
        let avg_reps = total_reps as f64 / hard_sets.len() as f64;
        let max_weight = hard_sets
            .iter()
            .map(|l| (l.added_weight_kg * 1000.0).round() as i64)
            .max()
            .unwrap_or(0);

        session_averages.push(avg_reps);
        session_max_weights.push(max_weight);
    }

    if session_averages.len() < 3 {
        return false;
    }

    let a_recent = session_averages[0]; // most recent
    let _a_mid = session_averages[1];   // middle
    let a_old = session_averages[2];    // oldest (first of the 3 exposures)

    let w_recent = session_max_weights[0];
    let w_mid = session_max_weights[1];
    let w_old = session_max_weights[2];

    // If load increased at any point across the 3 exposures, that is progression via load
    if w_recent > w_mid || w_mid > w_old {
        return false;
    }

    // Stall if the most recent average failed to improve over the first session's average
    // A small epsilon (1e-4) avoids floating point precision issues
    a_recent <= a_old + 1e-4
}

/// Applies a lighter cycle (deload):
/// Cuts each session's set count by 40-50% (floor 1).
/// Suspends the 2-set block minimum.
/// Idempotent: If plan.is_deload is already true, returns plan unchanged.
pub fn apply_deload(plan: &Plan) -> Plan {
    if plan.is_deload {
        return plan.clone();
    }

    let mut deload_plan = plan.clone();
    deload_plan.pre_deload_sessions = Some(plan.sessions.clone());
    deload_plan.is_deload = true;

    for session in &mut deload_plan.sessions {
        let original_total: u32 = session.blocks.iter().map(|b| b.sets).sum();
        let target_total = ((original_total as f64) * 0.5).round().max(1.0) as u32;

        for block in &mut session.blocks {
            let halved = ((block.sets as f64) * 0.5).round() as u32;
            block.sets = halved.max(1);
        }

        let mut current_total: u32 = session.blocks.iter().map(|b| b.sets).sum();
        while current_total > target_total {
            if let Some(max_block) = session
                .blocks
                .iter_mut()
                .filter(|b| b.sets > 1)
                .max_by_key(|b| b.sets)
            {
                max_block.sets -= 1;
                current_total -= 1;
            } else {
                break;
            }
        }
    }
    deload_plan
}

/// Restores a plan from a lighter cycle (deload) back to full volume.
pub fn restore_from_deload(plan: &Plan) -> Plan {
    let mut restored = plan.clone();
    if let Some(saved_sessions) = &plan.pre_deload_sessions {
        restored.sessions = saved_sessions.clone();
    }
    restored.is_deload = false;
    restored.pre_deload_sessions = None;
    restored
}

/// Converts kg into water bottle units:
/// 1.5L bottles (~1.5 kg each) or 5L jugs (~5 kg each).
pub fn format_backpack_loading(added_kg: f64, units: Units) -> String {
    if added_kg <= 0.0 {
        return "No added weight".to_string();
    }

    let five_l_jugs = (added_kg / 5.0).floor() as u32;
    let remainder = added_kg - (five_l_jugs as f64 * 5.0);
    let one_and_half_l_bottles = (remainder / 1.5).round() as u32;

    let mut parts = Vec::new();
    if five_l_jugs > 0 {
        parts.push(format!("{} × 5 L jug(s)", five_l_jugs));
    }
    if one_and_half_l_bottles > 0 {
        parts.push(format!("{} × 1.5 L bottle(s)", one_and_half_l_bottles));
    }

    let bottle_desc = if parts.is_empty() {
        "1 × 1.5 L bottle".to_string()
    } else {
        parts.join(" + ")
    };

    match units {
        Units::Metric => format!("Add {} (~{:.1} kg)", bottle_desc, added_kg),
        Units::Imperial => {
            let lbs = added_kg * 2.20462;
            format!("Add {} (~{:.1} lb)", bottle_desc, lbs)
        }
    }
}

/// Refines profile's estimated max reps from a logged set.
pub fn update_profile_from_set(profile: &mut Profile, log: &SetLog) {
    if log.reps_from_failure <= 3 {
        let current_max = profile
            .estimated_max_reps
            .get(&log.exercise_id)
            .copied()
            .unwrap_or(0);
        let estimated_capacity = log.reps_or_seconds + log.reps_from_failure;
        if estimated_capacity > current_max {
            profile
                .estimated_max_reps
                .insert(log.exercise_id.clone(), estimated_capacity);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Cycle, Muscle, Session};

    #[test]
    fn test_format_backpack_loading_metric_and_imperial() {
        let msg_3kg = format_backpack_loading(3.0, Units::Metric);
        assert!(msg_3kg.contains("2 × 1.5 L bottle(s)"));
        assert!(msg_3kg.contains("3.0 kg"));

        let msg_imp = format_backpack_loading(3.0, Units::Imperial);
        assert!(msg_imp.contains("6.6 lb"));
    }

    #[test]
    fn test_apply_deload_halves_volume() {
        let plan = Plan {
            cycle: Cycle {
                length_days: 7,
                sessions_count: 1,
                effective_weekly_rate: 1.0,
                description: "test".to_string(),
                is_adjusted: false,
                adjusted_message: None,
            },
            sessions: vec![Session {
                session_number: 1,
                focus: vec![Muscle::Chest],
                blocks: vec![Block {
                    exercise_id: "push_up".to_string(),
                    sets: 4,
                    rep_target_min: 8,
                    rep_target_max: 12,
                    seconds_target_min: None,
                    seconds_target_max: None,
                    effort_target: "0-3 reps".to_string(),
                    tempo_cue: "tempo".to_string(),
                    rest_cue: "rest".to_string(),
                    added_weight_kg: 0.0,
                }],
            }],
            maintenance_deficits: std::collections::HashMap::new(),
            cumulative_effective_sets: std::collections::HashMap::new(),
            maintenance_dropped: false,
            is_deload: false,
            pre_deload_sessions: None,
        };

        let deloaded = apply_deload(&plan);
        assert_eq!(deloaded.sessions[0].blocks[0].sets, 2);
    }

    #[test]
    fn test_progression_intensifiers_before_variation() {
        let block = Block {
            exercise_id: "push_up".to_string(),
            sets: 3,
            rep_target_min: 8,
            rep_target_max: 12,
            seconds_target_min: None,
            seconds_target_max: None,
            effort_target: "0-3 reps".to_string(),
            tempo_cue: "tempo".to_string(),
            rest_cue: "rest".to_string(),
            added_weight_kg: 0.0,
        };
        let exercise = Exercise {
            id: "push_up".to_string(),
            name: "Standard Push-up".to_string(),
            primary_muscle: Muscle::Chest,
            contribution_weights: crate::models::MuscleWeights::default(),
            equipment: vec!["none".to_string()],
            ladder: "push".to_string(),
            rung: 2,
            easier_id: None,
            harder_id: Some("feet_elevated_push_up".to_string()),
            bw_fraction: Some(0.64),
            bw_anchors: None,
            time_based: false,
            stretched_position: false,
            cues: "cues".to_string(),
        };
        let logs = vec![
            SetLog {
                timestamp: 1,
                session_number: 1,
                block_index: 0,
                exercise_id: "push_up".to_string(),
                reps_or_seconds: 15,
                added_weight_kg: 0.0,
                reps_from_failure: 1,
            },
            SetLog {
                timestamp: 2,
                session_number: 1,
                block_index: 0,
                exercise_id: "push_up".to_string(),
                reps_or_seconds: 15,
                added_weight_kg: 0.0,
                reps_from_failure: 1,
            },
        ];
        let settings = Settings::default();
        let suggestion = evaluate_progression(1, 0, &block, &exercise, &logs, &settings);
        assert!(suggestion.is_some());
        let s = suggestion.unwrap();
        assert_eq!(s.session_number, 1);
        assert_eq!(s.block_index, 0);
        assert_eq!(s.action, "intensify_execution");
        assert_eq!(s.next_exercise_id, Some("feet_elevated_push_up".to_string()));
    }
}
