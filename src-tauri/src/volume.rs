use crate::models::{
    Exercise, ExperienceLevel, Muscle, Plan, SetLog, Settings, Warning, WarningSeverity,
    WarningTiersData,
};
use std::collections::HashMap;

/// Calculates effective sets per cycle for each muscle:
/// effective_sets = direct_sets + Σ(indirect_sets * contribution_weight)
pub fn effective_sets_per_cycle(
    plan: &Plan,
    exercises_map: &HashMap<String, Exercise>,
) -> HashMap<Muscle, f64> {
    let mut totals = HashMap::new();
    for muscle in Muscle::ALL {
        totals.insert(muscle, 0.0);
    }

    for session in &plan.sessions {
        for block in &session.blocks {
            if let Some(exercise) = exercises_map.get(&block.exercise_id) {
                let sets = block.sets as f64;
                for muscle in Muscle::ALL {
                    let weight = exercise.contribution_weights.get(muscle);
                    if weight > 0.0 {
                        let current = totals.entry(muscle).or_insert(0.0);
                        *current += sets * weight;
                    }
                }
            }
        }
    }

    totals
}

/// Converts cycle effective sets into weekly effective sets (derived reporting metric):
/// weekly = cycle_effective_sets * (7.0 / cycle_length_in_days)
pub fn weekly_effective_sets(
    cycle_effective: &HashMap<Muscle, f64>,
    cycle_length_days: u32,
) -> HashMap<Muscle, f64> {
    let factor = 7.0 / (cycle_length_days as f64);
    let mut weekly = HashMap::new();
    for (muscle, sets) in cycle_effective {
        weekly.insert(*muscle, sets * factor);
    }
    weekly
}

/// Evaluates hypertrophy warning tiers and structural constraints for a plan.
pub fn evaluate_plan_warnings(
    plan: &Plan,
    exercises_map: &HashMap<String, Exercise>,
    settings: &Settings,
    tiers_data: &WarningTiersData,
) -> Vec<Warning> {
    let mut warnings = Vec::new();

    if plan.is_deload {
        warnings.push(Warning {
            code: "active_deload_cycle".to_string(),
            muscle: None,
            severity: WarningSeverity::Info,
            message: "Active Lighter Cycle (Deload): Set volume is intentionally reduced by ~50% for fatigue dissipation. Low-volume warnings are paused until full volume is restored.".to_string(),
            lower_evidence: false,
        });
    }

    let cycle_eff = effective_sets_per_cycle(plan, exercises_map);
    let weekly = weekly_effective_sets(&cycle_eff, plan.cycle.length_days);

    let is_beginner = settings.experience == ExperienceLevel::Under6Months;
    let factor = if is_beginner {
        tiers_data.beginner_factor
    } else {
        1.0
    };

    let loss_threshold = 1.0 * factor;
    let maint_threshold = 5.0 * factor;
    let small_growth_threshold = 10.0 * factor;
    let diminishing_threshold = 20.0 * factor;

    // Check each muscle's weekly volume tier
    for muscle in Muscle::ALL {
        let weekly_sets = weekly.get(&muscle).copied().unwrap_or(0.0);
        let is_priority = settings.priority_muscles.contains(&muscle);
        let lower_evidence = tiers_data
            .lower_evidence_muscles
            .contains(&muscle.as_str().to_string());

        if !plan.is_deload {
            if weekly_sets < loss_threshold {
                warnings.push(Warning {
                    code: "muscle_loss".to_string(),
                    muscle: Some(muscle),
                    severity: WarningSeverity::Alert,
                    message: format!(
                        "{}: {:.1} sets/wk. Muscle loss risk. With almost no stimulus the muscle will shrink over several weeks.",
                        muscle.as_str(),
                        weekly_sets
                    ),
                    lower_evidence,
                });
            } else if weekly_sets < maint_threshold {
                if is_priority {
                    warnings.push(Warning {
                        code: "priority_maintenance_only".to_string(),
                        muscle: Some(muscle),
                        severity: WarningSeverity::Warning,
                        message: format!(
                            "Priority {}: {:.1} sets/wk. Maintenance at best. Not enough volume to build more muscle.",
                            muscle.as_str(),
                            weekly_sets
                        ),
                        lower_evidence,
                    });
                }
            } else if weekly_sets < small_growth_threshold {
                if is_priority {
                    warnings.push(Warning {
                        code: "small_growth".to_string(),
                        muscle: Some(muscle),
                        severity: WarningSeverity::Notice,
                        message: format!(
                            "Priority {}: {:.1} sets/wk. Small growth: below what research shows is achievable.",
                            muscle.as_str(),
                            weekly_sets
                        ),
                        lower_evidence,
                    });
                }
            }
        }

        if weekly_sets > diminishing_threshold {
            warnings.push(Warning {
                code: "diminishing_returns".to_string(),
                muscle: Some(muscle),
                severity: WarningSeverity::Notice,
                message: format!(
                    "{}: {:.1} sets/wk. Diminishing returns: more recovery strain for little extra growth.",
                    muscle.as_str(),
                    weekly_sets
                ),
                lower_evidence,
            });
        }
    }

    // Check per-session direct set ceiling (max 8 direct sets per muscle)
    for session in &plan.sessions {
        let mut session_direct_sets = HashMap::new();
        for block in &session.blocks {
            if let Some(ex) = exercises_map.get(&block.exercise_id) {
                *session_direct_sets.entry(ex.primary_muscle).or_insert(0) += block.sets;
            }
        }
        for (muscle, sets) in session_direct_sets {
            if sets > tiers_data.rules.per_session_muscle_ceiling {
                warnings.push(Warning {
                    code: "session_ceiling_exceeded".to_string(),
                    muscle: Some(muscle),
                    severity: WarningSeverity::Warning,
                    message: format!(
                        "Session {}: {} direct sets for {} exceeds maximum ceiling of 8 sets per session.",
                        session.session_number,
                        sets,
                        muscle.as_str()
                    ),
                    lower_evidence: false,
                });
            }
        }
    }

    // Check diluted plan: if chosen priority muscles each get under 10 weekly effective sets
    if !plan.is_deload && settings.priority_muscles.len() > 1 {
        let all_priority_under_optimal = settings.priority_muscles.iter().all(|m| {
            let sets = weekly.get(m).copied().unwrap_or(0.0);
            sets < small_growth_threshold
        });
        if all_priority_under_optimal {
            warnings.push(Warning {
                code: "diluted_plan".to_string(),
                muscle: None,
                severity: WarningSeverity::Warning,
                message: "Volume is spread thin across multiple priority muscles. Consider focusing on fewer muscles at a time for optimal growth.".to_string(),
                lower_evidence: false,
            });
        }
    }

    // Check insufficient budget: if total capacity projects to under 5 weekly effective sets (or threshold)
    if !plan.is_deload {
        let max_weekly = weekly.values().cloned().fold(0.0_f64, f64::max);
        if max_weekly < tiers_data.rules.insufficient_budget_threshold {
            warnings.push(Warning {
                code: "insufficient_budget".to_string(),
                muscle: None,
                severity: WarningSeverity::Alert,
                message: format!(
                    "Total training capacity is too low ({:.1} sets/wk max). No muscle can reach even the small-growth tier (≥{:.1} sets/wk). Consider increasing sets per day or days per week.",
                    max_weekly,
                    tiers_data.rules.insufficient_budget_threshold
                ),
                lower_evidence: false,
            });
        }
    }

    // Check maintenance dropped flag
    if plan.maintenance_dropped {
        warnings.push(Warning {
            code: "maintenance_dropped".to_string(),
            muscle: None,
            severity: WarningSeverity::Notice,
            message: "Direct maintenance for non-priority muscles was omitted because it exceeded 50% of your cycle set budget.".to_string(),
            lower_evidence: false,
        });
    }

    warnings
}

/// Evaluates stall warnings for currently scheduled exercises across historical set logs.
pub fn evaluate_stall_warnings(
    plan: &Plan,
    exercises_map: &HashMap<String, Exercise>,
    all_logs: &[SetLog],
) -> Vec<Warning> {
    let mut warnings = Vec::new();
    let mut checked_exercises = std::collections::HashSet::new();

    for session in &plan.sessions {
        for block in &session.blocks {
            if checked_exercises.insert(&block.exercise_id) {
                if let Some(ex) = exercises_map.get(&block.exercise_id) {
                    if crate::progression::detect_stall_from_all_logs(&ex.id, all_logs) {
                        warnings.push(Warning {
                            code: "exercise_stall".to_string(),
                            muscle: Some(ex.primary_muscle),
                            severity: WarningSeverity::Warning,
                            message: format!(
                                "{} has stalled for 3 consecutive exposures without rep or load progress. Consider applying execution intensifiers, swapping variations, or triggering a deload cycle.",
                                ex.name
                            ),
                            lower_evidence: false,
                        });
                    }
                }
            }
        }
    }

    warnings
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Block, Cycle, EngineRules, MuscleWeights, Session};

    fn make_test_exercise(id: &str, primary: Muscle, direct_weight: f64) -> Exercise {
        let mut weights = MuscleWeights::default();
        weights.set(primary, direct_weight);
        Exercise {
            id: id.to_string(),
            name: id.to_string(),
            primary_muscle: primary,
            contribution_weights: weights,
            equipment: vec!["none".to_string()],
            ladder: "test".to_string(),
            rung: 1,
            easier_id: None,
            harder_id: None,
            bw_fraction: Some(0.64),
            bw_anchors: None,
            time_based: false,
            stretched_position: false,
            cues: "test".to_string(),
        }
    }

    #[test]
    fn test_weekly_effective_sets_calculation() {
        let mut map = HashMap::new();
        map.insert(Muscle::Back, 12.0);
        map.insert(Muscle::Chest, 4.0);

        // 7-day cycle: weekly = 12 * 7/7 = 12
        let weekly_7 = weekly_effective_sets(&map, 7);
        assert_eq!(weekly_7[&Muscle::Back], 12.0);

        // 3-day cycle: weekly = 4 * 7/3 = 9.333...
        let weekly_3 = weekly_effective_sets(&map, 3);
        assert!((weekly_3[&Muscle::Chest] - 9.333).abs() < 0.01);
    }

    #[test]
    fn test_session_ceiling_warning() {
        let mut ex_map = HashMap::new();
        ex_map.insert(
            "push_up".to_string(),
            make_test_exercise("push_up", Muscle::Chest, 1.0),
        );

        let plan = Plan {
            cycle: Cycle {
                length_days: 7,
                sessions_count: 1,
                effective_weekly_rate: 1.0,
                description: "1 session".to_string(),
                is_adjusted: false,
                adjusted_message: None,
            },
            sessions: vec![Session {
                session_number: 1,
                focus: vec![Muscle::Chest],
                blocks: vec![Block {
                    exercise_id: "push_up".to_string(),
                    sets: 10, // > 8
                    rep_target_min: 8,
                    rep_target_max: 12,
                    seconds_target_min: None,
                    seconds_target_max: None,
                    effort_target: "0-3 reps from failure".to_string(),
                    tempo_cue: "standard".to_string(),
                    rest_cue: "2m".to_string(),
                    added_weight_kg: 0.0,
                }],
            }],
            maintenance_deficits: HashMap::new(),
            cumulative_effective_sets: HashMap::new(),
            maintenance_dropped: false,
            is_deload: false,
            pre_deload_sessions: None,
        };

        let tiers = WarningTiersData {
            experienced: vec![],
            beginner_factor: 0.7,
            lower_evidence_muscles: vec!["abs".to_string()],
            rules: EngineRules {
                per_session_muscle_ceiling: 8,
                diluted_plan_threshold: 10.0,
                insufficient_budget_threshold: 5.0,
                hard_set_max_reps_from_failure: 3,
            },
        };

        let settings = Settings::default();
        let warnings = evaluate_plan_warnings(&plan, &ex_map, &settings, &tiers);
        assert!(
            warnings
                .iter()
                .any(|w| w.code == "session_ceiling_exceeded")
        );
    }

    #[test]
    fn test_insufficient_budget_warning() {
        let mut ex_map = HashMap::new();
        ex_map.insert(
            "push_up".to_string(),
            make_test_exercise("push_up", Muscle::Chest, 1.0),
        );

        let plan = Plan {
            cycle: Cycle {
                length_days: 7,
                sessions_count: 1,
                effective_weekly_rate: 1.0,
                description: "1 session".to_string(),
                is_adjusted: false,
                adjusted_message: None,
            },
            sessions: vec![Session {
                session_number: 1,
                focus: vec![Muscle::Chest],
                blocks: vec![Block {
                    exercise_id: "push_up".to_string(),
                    sets: 2, // 2 sets/week < 5.0
                    rep_target_min: 8,
                    rep_target_max: 12,
                    seconds_target_min: None,
                    seconds_target_max: None,
                    effort_target: "0-3 reps from failure".to_string(),
                    tempo_cue: "standard".to_string(),
                    rest_cue: "2m".to_string(),
                    added_weight_kg: 0.0,
                }],
            }],
            maintenance_deficits: HashMap::new(),
            cumulative_effective_sets: HashMap::new(),
            maintenance_dropped: false,
            is_deload: false,
            pre_deload_sessions: None,
        };

        let tiers = WarningTiersData {
            experienced: vec![],
            beginner_factor: 0.7,
            lower_evidence_muscles: vec!["abs".to_string()],
            rules: EngineRules {
                per_session_muscle_ceiling: 8,
                diluted_plan_threshold: 10.0,
                insufficient_budget_threshold: 5.0,
                hard_set_max_reps_from_failure: 3,
            },
        };

        let settings = Settings::default();
        let warnings = evaluate_plan_warnings(&plan, &ex_map, &settings, &tiers);
        assert!(
            warnings
                .iter()
                .any(|w| w.code == "insufficient_budget")
        );
    }
}
