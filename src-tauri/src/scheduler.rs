use crate::models::{Block, Cycle, Exercise, Muscle, Plan, Profile, Session, Settings};
use std::collections::HashMap;

#[derive(Debug, Clone)]
struct CandidateCycle {
    length_days: u32,
    sessions_count: u32,
    rate: f64,
    description: String,
}

/// Matches input days_per_week to the optimal repeating cycle.
pub fn days_per_week_to_cycle(input: f64) -> Cycle {
    // 1. Check presets first
    let presets = [
        (7.00, 1, 1, "Every day (1-day cycle, 1 session)"),
        (5.25, 4, 3, "3 on / 1 off (4-day cycle, 3 sessions)"),
        (4.67, 3, 2, "2 on / 1 off (3-day cycle, 2 sessions)"),
        (3.50, 2, 1, "Every other day (2-day cycle, 1 session)"),
        (2.33, 3, 1, "1 on / 2 off (3-day cycle, 1 session)"),
        (6.00, 7, 6, "6 days / week (7-day cycle, 6 sessions)"),
        (5.00, 7, 5, "5 days / week (7-day cycle, 5 sessions)"),
        (4.00, 7, 4, "4 days / week (7-day cycle, 4 sessions)"),
        (3.00, 7, 3, "3 days / week (7-day cycle, 3 sessions)"),
        (2.00, 7, 2, "2 days / week (7-day cycle, 2 sessions)"),
        (1.00, 7, 1, "1 day / week (7-day cycle, 1 session)"),
    ];

    for (target, len, sessions, desc) in presets {
        if (input - target).abs() < 0.02 {
            return Cycle {
                length_days: len,
                sessions_count: sessions,
                effective_weekly_rate: target,
                description: desc.to_string(),
                is_adjusted: false,
                adjusted_message: None,
            };
        }
    }

    // 2. Generate candidate cycles: L in {1, 2, 3, 4, 5, 7}, S from 1 to L
    let mut candidates = Vec::new();
    let lengths = [1, 2, 3, 4, 5, 7];

    for &len in &lengths {
        for s in 1..=len {
            if s == len && len != 1 {
                continue; // S = L only allowed for every day (L = 1)
            }
            // Avoid duplicates with smaller representations (e.g. 2 in 4 is same as 1 in 2)
            let is_duplicate = candidates
                .iter()
                .any(|c: &CandidateCycle| (c.rate - (s as f64 * 7.0 / len as f64)).abs() < 0.001);
            if !is_duplicate {
                let rate = (s as f64) * 7.0 / (len as f64);
                candidates.push(CandidateCycle {
                    length_days: len,
                    sessions_count: s,
                    rate,
                    description: format!("{}-day cycle with {} session(s)", len, s),
                });
            }
        }
    }

    // 3. Find candidates within ±0.15
    let tolerance = 0.15;
    let mut within_tol: Vec<&CandidateCycle> = candidates
        .iter()
        .filter(|c| (c.rate - input).abs() <= tolerance)
        .collect();

    within_tol.sort_by(|a, b| {
        let diff_a = (a.rate - input).abs();
        let diff_b = (b.rate - input).abs();
        diff_a
            .partial_cmp(&diff_b)
            .unwrap()
            .then(a.length_days.cmp(&b.length_days))
    });

    if let Some(best) = within_tol.first() {
        Cycle {
            length_days: best.length_days,
            sessions_count: best.sessions_count,
            effective_weekly_rate: best.rate,
            description: best.description.clone(),
            is_adjusted: false,
            adjusted_message: None,
        }
    } else {
        // Fallback: closest candidate
        let mut all_sorted = candidates.clone();
        all_sorted.sort_by(|a, b| {
            let diff_a = (a.rate - input).abs();
            let diff_b = (b.rate - input).abs();
            diff_a
                .partial_cmp(&diff_b)
                .unwrap()
                .then(a.length_days.cmp(&b.length_days))
        });
        let closest = all_sorted.first().unwrap();
        Cycle {
            length_days: closest.length_days,
            sessions_count: closest.sessions_count,
            effective_weekly_rate: closest.rate,
            description: closest.description.clone(),
            is_adjusted: true,
            adjusted_message: Some(format!(
                "Input {:.2} days/wk adjusted to nearest repeating cycle: {:.2} days/wk",
                input, closest.rate
            )),
        }
    }
}

/// Computes the exact whole-set budget per cycle:
/// B_cycle = sets_per_day * sessions_in_cycle
pub fn compute_cycle_budget(sets_per_day: u32, sessions_count: u32) -> u32 {
    sets_per_day * sessions_count
}

/// Allocates total cycle set budget across priority and maintenance muscles.
pub fn allocate_cycle_sets(
    b_cycle: u32,
    cycle: &Cycle,
    settings: &Settings,
    maintenance_deficits: &mut HashMap<Muscle, f64>,
    cumulative_effective_sets: &HashMap<Muscle, f64>,
    indirect_received: &HashMap<Muscle, f64>,
) -> (HashMap<Muscle, u32>, bool) {
    let mut allocation: HashMap<Muscle, u32> = HashMap::new();
    for m in Muscle::ALL {
        allocation.insert(m, 0);
    }

    if b_cycle == 0 {
        return (allocation, false);
    }

    let non_priority: Vec<Muscle> = Muscle::ALL
        .iter()
        .copied()
        .filter(|m| !settings.priority_muscles.contains(m))
        .collect();

    let mut maintenance_dropped = false;

    // 1. Maintenance Check & Allocation
    if settings.maintenance_on && !non_priority.is_empty() {
        // Each non-priority target per cycle: 3 * cycle_len / 7
        let per_cycle_target = 3.0 * (cycle.length_days as f64) / 7.0;

        // Indirect volume from planned movements is counted first.
        // Direct maintenance sets are added only where a deficit remains.
        let mut total_direct_needed = 0.0;
        for &m in &non_priority {
            let indirect = indirect_received.get(&m).copied().unwrap_or(0.0);
            let net = (per_cycle_target - indirect).max(0.0);
            total_direct_needed += net;
        }

        // Budget limit: if maintenance needed > 50% of B_cycle, drop maintenance
        if total_direct_needed > (b_cycle as f64 * 0.50) {
            maintenance_dropped = true;
        } else {
            // Allocate maintenance direct sets using carry-over blocks (>= 2 sets)
            let mut remaining_budget = b_cycle;
            for &m in &non_priority {
                let indirect = indirect_received.get(&m).copied().unwrap_or(0.0);
                let net_target = (per_cycle_target - indirect).max(0.0);
                let def = maintenance_deficits.entry(m).or_insert(0.0);
                *def += net_target;

                if *def >= 2.0 && remaining_budget >= 2 {
                    let sets_to_schedule = (*def).floor().min(4.0) as u32;
                    let scheduled = sets_to_schedule.min(remaining_budget);
                    if scheduled >= 2 {
                        *allocation.get_mut(&m).unwrap() += scheduled;
                        *def -= scheduled as f64;
                        remaining_budget -= scheduled;
                    }
                }
            }
        }
    }

    // 2. Priority Distribution
    let maintenance_sets_used: u32 = allocation.values().sum();
    let remaining_sets = b_cycle.saturating_sub(maintenance_sets_used);

    if !settings.priority_muscles.is_empty() && remaining_sets > 0 {
        let p_count = settings.priority_muscles.len() as u32;
        // Priority ceiling: ~20 effective sets per week
        let cycle_cap = ((20.0 * (cycle.length_days as f64) / 7.0).ceil()) as u32;

        let equal_share = (remaining_sets / p_count).min(cycle_cap);
        let mut allocated_priority = 0;

        for &p in &settings.priority_muscles {
            *allocation.get_mut(&p).unwrap() += equal_share;
            allocated_priority += equal_share;
        }

        let mut remaining_priority_budget = remaining_sets.saturating_sub(allocated_priority);

        // Leftover sets go one at a time to priority muscle with lowest cumulative volume (up to cap)
        let mut sorted_priority = settings.priority_muscles.clone();
        sorted_priority.sort_by(|a, b| {
            let vol_a = cumulative_effective_sets.get(a).unwrap_or(&0.0);
            let vol_b = cumulative_effective_sets.get(b).unwrap_or(&0.0);
            vol_a.partial_cmp(vol_b).unwrap()
        });

        for p in sorted_priority {
            if remaining_priority_budget == 0 {
                break;
            }
            let current = allocation.get_mut(&p).unwrap();
            if *current < cycle_cap {
                *current += 1;
                remaining_priority_budget -= 1;
            }
        }

        // 3. Surplus: any sets left after priority muscles reach ceiling go to non-priority muscles
        if remaining_priority_budget > 0 && !non_priority.is_empty() {
            let np_count = non_priority.len() as u32;
            let np_share = remaining_priority_budget / np_count;
            let mut np_leftover = remaining_priority_budget % np_count;

            for &m in &non_priority {
                *allocation.get_mut(&m).unwrap() += np_share;
            }

            if np_leftover > 0 {
                let mut sorted_np = non_priority.clone();
                sorted_np.sort_by(|a, b| {
                    let vol_a = cumulative_effective_sets.get(a).unwrap_or(&0.0);
                    let vol_b = cumulative_effective_sets.get(b).unwrap_or(&0.0);
                    vol_a.partial_cmp(vol_b).unwrap()
                });
                for m in sorted_np {
                    if np_leftover == 0 {
                        break;
                    }
                    *allocation.get_mut(&m).unwrap() += 1;
                    np_leftover -= 1;
                }
            }
        }
    } else if remaining_sets > 0 {
        // Fallback if no priority selected: distribute evenly across all
        let all_count = Muscle::ALL.len() as u32;
        let share = remaining_sets / all_count;
        for m in Muscle::ALL {
            *allocation.get_mut(&m).unwrap() += share;
        }
    }

    (allocation, maintenance_dropped)
}

/// Selects the best exercise for a muscle matching available equipment and stretch preference.
pub fn select_exercise_for_muscle<'a>(
    muscle: Muscle,
    exercises: &'a [Exercise],
    available_equipment: &[String],
    prefer_stretch: bool,
    session_index: usize,
    profile: &Profile,
    settings: &Settings,
) -> Option<&'a Exercise> {
    select_exercise_for_session_block(
        muscle,
        exercises,
        available_equipment,
        prefer_stretch,
        session_index,
        profile,
        settings,
        &[],
    )
}

/// Selects the best exercise for a session block, excluding exercises already scheduled in the
/// same session where alternative eligible exercises exist for that muscle.
pub fn select_exercise_for_session_block<'a>(
    muscle: Muscle,
    exercises: &'a [Exercise],
    available_equipment: &[String],
    prefer_stretch: bool,
    session_index: usize,
    profile: &Profile,
    _settings: &Settings,
    used_in_session: &[String],
) -> Option<&'a Exercise> {
    let mut candidates: Vec<&'a Exercise> = exercises
        .iter()
        .filter(|e| {
            e.primary_muscle == muscle
                && e.equipment
                    .iter()
                    .all(|eq| eq == "none" || available_equipment.contains(eq))
        })
        .collect();

    if candidates.is_empty() {
        // Relax equipment restriction to 'none' fallback
        candidates = exercises
            .iter()
            .filter(|e| e.primary_muscle == muscle && e.equipment.contains(&"none".to_string()))
            .collect();
    }

    if candidates.is_empty() {
        return None;
    }

    // Guardrail 1: Filter out regressions for capable trainees
    if muscle == Muscle::Back {
        let pull_max = profile.estimated_max_reps.get("pull_up").copied().unwrap_or(0);
        if pull_max >= 6 {
            // Trainee can do full pull-ups; strictly exclude assisted/eccentric regressions
            candidates.retain(|e| e.id != "slow_lowering_pull_up" && e.id != "jump_assisted_pull_up");
            // Prefer main pull ladder (pull_up, pause_pull_up) over biceps branch (chin_up) for Back compound
            if candidates.iter().any(|e| e.ladder == "pull") {
                candidates.retain(|e| e.ladder != "pull_biceps_branch");
            }
        } else if pull_max == 0 && profile.estimated_max_reps.contains_key("pull_up") {
            // Trainee cannot do bodyweight pull-ups; exclude unassisted variations
            candidates.retain(|e| e.id != "pull_up" && e.id != "pause_pull_up" && e.id != "chin_up");
        }
    } else if muscle == Muscle::Chest {
        let push_max = profile.estimated_max_reps.get("push_up").copied().unwrap_or(0);
        if push_max >= 8 {
            candidates.retain(|e| e.id != "incline_push_up");
        } else if push_max == 0 && profile.estimated_max_reps.contains_key("push_up") {
            candidates.retain(|e| e.rung <= 1 || e.ladder != "push");
        }
    }

    if candidates.is_empty() {
        return None;
    }

    // Prefer candidates not yet scheduled in the current session
    let unused_candidates: Vec<&'a Exercise> = candidates
        .iter()
        .filter(|e| !used_in_session.contains(&e.id))
        .copied()
        .collect();

    let target_candidates = if !unused_candidates.is_empty() {
        unused_candidates
    } else {
        candidates
    };

    // Separate into suitability tiers based on estimated reps
    let mut in_target_window = Vec::new();
    let mut overflow_or_acceptable = Vec::new();
    let mut other_candidates = Vec::new();

    for &cand in &target_candidates {
        if let Some(&est_reps) = profile.estimated_max_reps.get(&cand.id) {
            if (8..=20).contains(&est_reps) {
                in_target_window.push(cand);
            } else if est_reps > 20 || (6..=30).contains(&est_reps) {
                overflow_or_acceptable.push(cand);
            } else {
                other_candidates.push(cand);
            }
        } else {
            other_candidates.push(cand);
        }
    }

    in_target_window.sort_by_key(|e| std::cmp::Reverse(e.rung));
    overflow_or_acceptable.sort_by_key(|e| std::cmp::Reverse(e.rung));

    let pool: Vec<&'a Exercise> = if !in_target_window.is_empty() {
        in_target_window
    } else if !overflow_or_acceptable.is_empty() {
        overflow_or_acceptable
    } else if !other_candidates.is_empty() {
        other_candidates
    } else {
        target_candidates.clone()
    };

    if prefer_stretch {
        if let Some(&stretch_ex) = pool.iter().find(|e| e.stretched_position) {
            return Some(stretch_ex);
        }
        if let Some(&stretch_ex) = target_candidates.iter().find(|e| e.stretched_position) {
            return Some(stretch_ex);
        }
    }

    let idx = session_index % pool.len();
    Some(pool[idx])
}

/// Partitions a session's set count into valid exercise blocks (>= 2 sets per block).
pub fn partition_sets_into_blocks(total_sets: u32) -> Vec<u32> {
    if total_sets <= 1 {
        return vec![total_sets];
    }
    match total_sets {
        2 => vec![2],
        3 => vec![3],
        4 => vec![4], // Or 2, 2
        5 => vec![3, 2],
        6 => vec![3, 3],
        7 => vec![4, 3],
        8 => vec![4, 4],
        _ => {
            let mut res = Vec::new();
            let mut rem = total_sets;
            while rem > 0 {
                if rem <= 4 {
                    res.push(rem);
                    break;
                }
                res.push(3);
                rem -= 3;
            }
            res
        }
    }
}

/// Calculates added backpack weight in 1.5 kg increments to bring high-rep exercises (>20 reps) into 8-15 reps.
pub fn calculate_backpack_weight(
    exercise: &Exercise,
    est_reps: u32,
    body_weight_kg: f64,
    bed_height_cm: f64,
) -> f64 {
    if est_reps <= 20 {
        return 0.0;
    }
    let frac = crate::calibration::get_exercise_bw_fraction(exercise, bed_height_cm);
    let base_load = crate::calibration::compute_exercise_load(exercise, frac, body_weight_kg, 0.0);
    let one_rm = crate::calibration::epley_1rm(base_load, est_reps);

    let mut best_added = 1.5;
    let mut best_diff = f64::MAX;

    let mut added = 1.5;
    while added <= 30.0 {
        let load = crate::calibration::compute_exercise_load(exercise, frac, body_weight_kg, added);
        let reps = crate::calibration::reps_at_new_load(one_rm, load);
        if (8.0..=15.0).contains(&reps) {
            return added;
        }
        let diff = (reps - 12.0).abs();
        if diff < best_diff {
            best_diff = diff;
            best_added = added;
        }
        added += 1.5;
    }
    best_added
}

pub fn effort_target_for_exercise(ex: &Exercise) -> String {
    match ex.movement_category() {
        crate::models::MovementCategory::Compound => {
            "1–2 RIR (0–1 RIR on final set)".to_string()
        }
        crate::models::MovementCategory::Isolation
        | crate::models::MovementCategory::Core => {
            "0–1 RIR (all sets close to failure)".to_string()
        }
    }
}

pub fn rest_cue_for_exercise(ex: &Exercise) -> String {
    match ex.ladder.as_str() {
        "biceps"
        | "triceps_stretch"
        | "triceps_isolation"
        | "forearms_isolation"
        | "forearms_grip"
        | "abs"
        | "abs_floor" => "1-2 min between sets".to_string(),
        _ => "2-3 min between sets".to_string(),
    }
}

/// Distributes allocated sets into sessions and exercise blocks.
fn build_sessions(
    cycle: &Cycle,
    sets_per_session: u32,
    allocation: &mut HashMap<Muscle, u32>,
    exercises: &[Exercise],
    available_eq: &[String],
    settings: &Settings,
    profile: &Profile,
) -> Vec<Session> {
    let mut sessions = Vec::new();
    let mut stretched_covered: std::collections::HashSet<Muscle> = std::collections::HashSet::new();

    for s_idx in 0..(cycle.sessions_count as usize) {
        let block_sizes = if sets_per_session == 3
            && settings.priority_muscles.len() >= 2
            && cycle.effective_weekly_rate <= 2.5
        {
            vec![2, 1]
        } else {
            partition_sets_into_blocks(sets_per_session)
        };
        let mut session_blocks: Vec<Block> = Vec::new();
        let mut session_focus = Vec::new();

        // Push / Pull alternation heuristic:
        // Even sessions emphasize Push (Chest/Triceps), Odd sessions emphasize Pull (Back/Biceps)
        let is_even_session = s_idx % 2 == 0;
        let mut priority_order: Vec<Muscle> = allocation
            .iter()
            .filter(|&(_, &sets)| sets > 0)
            .map(|(&m, _)| m)
            .collect();

        priority_order.sort_by(|&a, &b| {
            let sets_a = allocation.get(&a).unwrap_or(&0);
            let sets_b = allocation.get(&b).unwrap_or(&0);
            sets_b.cmp(sets_a)
        });

        if is_even_session {
            // Favor push in even sessions: Torso Compound (Chest) -> Arm Isolation (Triceps) -> Pull -> Core
            priority_order.sort_by_key(|m| match m {
                Muscle::Chest => 0,
                Muscle::Triceps => 1,
                Muscle::Back => 2,
                Muscle::Biceps => 3,
                Muscle::Forearms => 4,
                Muscle::Abs => 5,
            });
        } else {
            // Favor pull in odd sessions: Torso Compound (Back) -> Arm Isolation (Biceps/Forearms) -> Push -> Core
            priority_order.sort_by_key(|m| match m {
                Muscle::Back => 0,
                Muscle::Biceps => 1,
                Muscle::Forearms => 2,
                Muscle::Chest => 3,
                Muscle::Triceps => 4,
                Muscle::Abs => 5,
            });
        }

        for &block_set_count in &block_sizes {
            // Find muscle with highest remaining allocation
            let chosen_muscle = priority_order
                .iter()
                .copied()
                .find(|m| *allocation.get(m).unwrap_or(&0) >= block_set_count)
                .or_else(|| {
                    priority_order
                        .iter()
                        .copied()
                        .find(|m| *allocation.get(m).unwrap_or(&0) > 0)
                })
                .unwrap_or(Muscle::Chest);

            let remaining = allocation.entry(chosen_muscle).or_insert(0);
            let sets_scheduled = block_set_count.min(*remaining);
            *remaining = remaining.saturating_sub(sets_scheduled);

            if sets_scheduled > 0 {
                if !session_focus.contains(&chosen_muscle) {
                    session_focus.push(chosen_muscle);
                }

                let prefer_stretch = !stretched_covered.contains(&chosen_muscle);
                let used_in_session: Vec<String> =
                    session_blocks.iter().map(|b| b.exercise_id.clone()).collect();
                if let Some(ex) = select_exercise_for_session_block(
                    chosen_muscle,
                    exercises,
                    available_eq,
                    prefer_stretch,
                    s_idx,
                    profile,
                    settings,
                    &used_in_session,
                ) {
                    if ex.stretched_position {
                        stretched_covered.insert(chosen_muscle);
                    }

                    if let Some(existing_block) = session_blocks.iter_mut().find(|b| b.exercise_id == ex.id) {
                        existing_block.sets += sets_scheduled;
                    } else {
                        let est_reps = profile.estimated_max_reps.get(&ex.id).copied().unwrap_or(0);
                        let is_pull = ex.ladder == "pull" || ex.ladder == "pull_biceps_branch";
                        let has_weight_vest = settings.weight_vest || settings.enabled_equipment.contains(&"weight_vest".to_string());
                        let has_backpack = settings.backpack || settings.enabled_equipment.contains(&"backpack".to_string());

                        let added_kg = if is_pull && has_weight_vest && est_reps > 15 {
                            10.0
                        } else if has_backpack && est_reps > 20 {
                            calculate_backpack_weight(
                                ex,
                                est_reps,
                                profile.body_weight_kg,
                                settings.bed_height_cm,
                            )
                        } else {
                            0.0
                        };

                        let (mut rep_min, mut rep_max, sec_min, sec_max) = if ex.time_based {
                            (0, 0, Some(20), Some(60))
                        } else if added_kg > 0.0 {
                            (8, 12, None, None)
                        } else {
                            (8, 15, None, None)
                        };

                        let mut tempo_cue = if added_kg == 10.0 && is_pull && has_weight_vest {
                            "Controlled 2-3s negative with 10kg vest".to_string()
                        } else if !has_backpack && est_reps > 20 {
                            "Slow 3-4s lowering with 1s pause in stretch".to_string()
                        } else {
                            "Controlled 2-3s negative".to_string()
                        };

                        // Adapt dumbbell work based on trainee's estimated max reps on that specific exercise
                        if ex.equipment.contains(&"dumbbell".to_string()) {
                            if est_reps > 22 {
                                tempo_cue = "Slow 3-4s lowering, pause in stretch, plus lengthened partials after failure".to_string();
                                rep_min = 10;
                                rep_max = 15;
                            } else if est_reps > 15 {
                                tempo_cue = "Slow 3-4s lowering with 1s pause in stretch".to_string();
                                rep_min = 8;
                                rep_max = 12;
                            } else if est_reps > 0 && est_reps < 8 {
                                tempo_cue = "Controlled 2s negative, focus on form and control".to_string();
                                rep_min = 6;
                                rep_max = 10;
                            }
                        }

                        let rest_cue = rest_cue_for_exercise(ex);
                        let effort_target = effort_target_for_exercise(ex);

                        session_blocks.push(Block {
                            exercise_id: ex.id.clone(),
                            sets: sets_scheduled,
                            rep_target_min: rep_min,
                            rep_target_max: rep_max,
                            seconds_target_min: sec_min,
                            seconds_target_max: sec_max,
                            effort_target,
                            tempo_cue,
                            rest_cue,
                            added_weight_kg: added_kg,
                        });
                    }
                }
            }
        }

        // Apply Option 1 & 2: Compound-first & synergist-dependency exercise ordering
        sort_session_blocks(&mut session_blocks, exercises);

        // Re-align focus pills to reflect the actual execution order
        let mut ordered_focus = Vec::new();
        for block in &session_blocks {
            if let Some(ex) = exercises.iter().find(|e| e.id == block.exercise_id) {
                if !ordered_focus.contains(&ex.primary_muscle) {
                    ordered_focus.push(ex.primary_muscle);
                }
            }
        }

        sessions.push(Session {
            session_number: (s_idx + 1) as u32,
            focus: ordered_focus,
            blocks: session_blocks,
        });
    }

    sessions
}

/// Sorts exercise blocks within a session using both:
/// 1. Synergist Dependency (Option 2): If exercise A recruits exercise B's primary muscle as a secondary synergist
///    (e.g., Push-up recruits Triceps), exercise A MUST precede exercise B to avoid pre-exhaustion.
/// 2. Movement Category (Option 1): Multi-joint Compounds (Tier 0) -> Single-joint Isolations (Tier 1) -> Core/Abs (Tier 2).
pub fn sort_session_blocks(blocks: &mut [Block], exercises: &[Exercise]) {
    let ex_map: HashMap<&str, &Exercise> = exercises.iter().map(|e| (e.id.as_str(), e)).collect();

    blocks.sort_by(|a, b| {
        let ex_a = ex_map.get(a.exercise_id.as_str());
        let ex_b = ex_map.get(b.exercise_id.as_str());

        if let (Some(ea), Some(eb)) = (ex_a, ex_b) {
            // Check 1: Synergist Dependency (Option 2)
            // Does ea recruit eb's primary muscle as a secondary mover? (>= 0.2 weight)
            let a_uses_b_muscle = ea.primary_muscle != eb.primary_muscle
                && ea.contribution_weights.get(eb.primary_muscle) >= 0.2;
            let b_uses_a_muscle = eb.primary_muscle != ea.primary_muscle
                && eb.contribution_weights.get(ea.primary_muscle) >= 0.2;

            if a_uses_b_muscle && !b_uses_a_muscle {
                return std::cmp::Ordering::Less; // ea must come before eb
            }
            if b_uses_a_muscle && !a_uses_b_muscle {
                return std::cmp::Ordering::Greater; // eb must come before ea
            }

            // Check 2: Movement Category Hierarchy (Option 1)
            let cat_cmp = ea.movement_category().cmp(&eb.movement_category());
            if cat_cmp != std::cmp::Ordering::Equal {
                return cat_cmp;
            }

            // Check 3: Torso compound muscles before limb isolation before core
            let muscle_rank = |m: Muscle| match m {
                Muscle::Chest | Muscle::Back => 0,
                Muscle::Triceps | Muscle::Biceps => 1,
                Muscle::Forearms => 2,
                Muscle::Abs => 3,
            };
            let m_cmp = muscle_rank(ea.primary_muscle).cmp(&muscle_rank(eb.primary_muscle));
            if m_cmp != std::cmp::Ordering::Equal {
                return m_cmp;
            }
        }

        std::cmp::Ordering::Equal
    });
}

/// Builds the complete workout Plan for the user's settings.
pub fn generate_plan(
    settings: &Settings,
    profile: &Profile,
    exercises: &[Exercise],
    mut maintenance_deficits: HashMap<Muscle, f64>,
    mut cumulative_effective: HashMap<Muscle, f64>,
) -> Plan {
    let cycle = days_per_week_to_cycle(settings.days_per_week);
    let b_cycle = compute_cycle_budget(settings.sets_per_day, cycle.sessions_count);

    let available_eq = settings.get_available_equipment();

    // Step 1: Draft pass to compute indirect volume from planned priority movements
    let mut indirect_received: HashMap<Muscle, f64> = HashMap::new();
    for m in Muscle::ALL {
        indirect_received.insert(m, 0.0);
    }

    if settings.maintenance_on && !settings.priority_muscles.is_empty() {
        let mut draft_deficits = maintenance_deficits.clone();
        let mut draft_settings = settings.clone();
        draft_settings.maintenance_on = false; // prioritize target movements to see indirect contribution

        let (mut draft_allocation, _) = allocate_cycle_sets(
            b_cycle,
            &cycle,
            &draft_settings,
            &mut draft_deficits,
            &cumulative_effective,
            &HashMap::new(),
        );

        let draft_sessions = build_sessions(
            &cycle,
            settings.sets_per_day,
            &mut draft_allocation,
            exercises,
            &available_eq,
            settings,
            profile,
        );

        let exercises_map: HashMap<String, &Exercise> =
            exercises.iter().map(|e| (e.id.clone(), e)).collect();

        for session in &draft_sessions {
            for block in &session.blocks {
                if let Some(ex) = exercises_map.get(&block.exercise_id) {
                    for m in Muscle::ALL {
                        if ex.primary_muscle != m {
                            let weight = ex.contribution_weights.get(m);
                            if weight > 0.0 {
                                *indirect_received.entry(m).or_insert(0.0) +=
                                    block.sets as f64 * weight;
                            }
                        }
                    }
                }
            }
        }
    }

    // Step 2: Final allocation with indirect volume deducted from maintenance
    let (mut allocation, maintenance_dropped) = allocate_cycle_sets(
        b_cycle,
        &cycle,
        settings,
        &mut maintenance_deficits,
        &cumulative_effective,
        &indirect_received,
    );

    let sessions = build_sessions(
        &cycle,
        settings.sets_per_day,
        &mut allocation,
        exercises,
        &available_eq,
        settings,
        profile,
    );

    let exercises_map: HashMap<String, &Exercise> =
        exercises.iter().map(|e| (e.id.clone(), e)).collect();
    for session in &sessions {
        for block in &session.blocks {
            if let Some(ex) = exercises_map.get(&block.exercise_id) {
                for m in Muscle::ALL {
                    let weight = if ex.primary_muscle == m {
                        1.0
                    } else {
                        ex.contribution_weights.get(m)
                    };
                    if weight > 0.0 {
                        *cumulative_effective.entry(m).or_insert(0.0) +=
                            block.sets as f64 * weight;
                    }
                }
            }
        }
    }

    Plan {
        cycle,
        sessions,
        maintenance_deficits,
        cumulative_effective_sets: cumulative_effective,
        maintenance_dropped,
        is_deload: false,
        pre_deload_sessions: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_presets_cycle_mapping() {
        let c_7 = days_per_week_to_cycle(7.0);
        assert_eq!(c_7.length_days, 1);
        assert_eq!(c_7.sessions_count, 1);

        let c_467 = days_per_week_to_cycle(4.67);
        assert_eq!(c_467.length_days, 3);
        assert_eq!(c_467.sessions_count, 2);

        let c_35 = days_per_week_to_cycle(3.50);
        assert_eq!(c_35.length_days, 2);
        assert_eq!(c_35.sessions_count, 1);

        let c_3 = days_per_week_to_cycle(3.0);
        assert_eq!(c_3.length_days, 7);
        assert_eq!(c_3.sessions_count, 3);
    }

    #[test]
    fn test_snapping_fallback_adjusted() {
        // 3.3 is 0.20 away from 3.50, triggers adjustment fallback
        let cycle = days_per_week_to_cycle(3.3);
        assert!(cycle.is_adjusted);
        assert!(cycle.adjusted_message.is_some());
        assert!((cycle.effective_weekly_rate - 3.50).abs() < 0.05);
    }

    #[test]
    fn test_worked_example_1_back_priority_3_days() {
        // 3 days/week, priority back, 4 sets/day -> 7-day cycle, 3 sessions, B_cycle = 12
        let cycle = days_per_week_to_cycle(3.0);
        let b_cycle = compute_cycle_budget(4, cycle.sessions_count);
        assert_eq!(b_cycle, 12);

        let settings = Settings {
            sets_per_day: 4,
            days_per_week: 3.0,
            priority_muscles: vec![Muscle::Back],
            maintenance_on: true,
            ..Default::default()
        };

        let mut defs = HashMap::new();
        let cum = HashMap::new();
        let (alloc, dropped) = allocate_cycle_sets(
            b_cycle,
            &cycle,
            &settings,
            &mut defs,
            &cum,
            &HashMap::new(),
        );

        // Maintenance would need ~7 of 12 sets (>50%), so it is dropped
        assert!(dropped);
        assert_eq!(alloc[&Muscle::Back], 12);
    }

    #[test]
    fn test_worked_example_3_every_other_day() {
        // 3.5 days/week (every other day), 1 priority, 4 sets/day -> 2-day cycle, 1 session, B_cycle = 4
        let cycle = days_per_week_to_cycle(3.5);
        let b_cycle = compute_cycle_budget(4, cycle.sessions_count);
        assert_eq!(b_cycle, 4);

        let settings = Settings {
            sets_per_day: 4,
            days_per_week: 3.5,
            priority_muscles: vec![Muscle::Chest],
            maintenance_on: true,
            ..Default::default()
        };

        let mut defs = HashMap::new();
        let cum = HashMap::new();
        let (alloc, dropped) = allocate_cycle_sets(
            b_cycle,
            &cycle,
            &settings,
            &mut defs,
            &cum,
            &HashMap::new(),
        );

        // Maintenance is dropped (> 50%)
        assert!(dropped);
        assert_eq!(alloc[&Muscle::Chest], 4);
    }

    #[test]
    fn test_priority_ceiling_and_surplus_redistribution() {
        // 6 days/week, 8 sets/day -> 7-day cycle, 6 sessions, B_cycle = 48
        let cycle = days_per_week_to_cycle(6.0);
        assert_eq!(cycle.length_days, 7);
        assert_eq!(cycle.sessions_count, 6);
        let b_cycle = compute_cycle_budget(8, cycle.sessions_count);
        assert_eq!(b_cycle, 48);

        let settings = Settings {
            sets_per_day: 8,
            days_per_week: 6.0,
            priority_muscles: vec![Muscle::Chest],
            maintenance_on: false,
            ..Default::default()
        };

        let mut defs = HashMap::new();
        let cum = HashMap::new();
        let (alloc, _) = allocate_cycle_sets(
            b_cycle,
            &cycle,
            &settings,
            &mut defs,
            &cum,
            &HashMap::new(),
        );

        // Chest is capped at 20 weekly sets (for 7-day cycle, cycle_cap = 20)
        assert_eq!(alloc[&Muscle::Chest], 20);

        // Surplus (48 - 20 = 28 sets) is distributed to non-priority muscles
        let non_priority_total: u32 = [
            Muscle::Back,
            Muscle::Biceps,
            Muscle::Triceps,
            Muscle::Forearms,
            Muscle::Abs,
        ]
        .iter()
        .map(|m| alloc[m])
        .sum();
        assert_eq!(non_priority_total, 28);
    }

    #[test]
    fn test_indirect_offset_reduces_maintenance() {
        // 3-day cycle, 2 sessions, B_cycle = 8 (Worked Example 2 setting)
        let cycle = days_per_week_to_cycle(4.67);
        assert_eq!(cycle.length_days, 3);
        let b_cycle = 8;

        let settings = Settings {
            sets_per_day: 4,
            days_per_week: 4.67,
            priority_muscles: vec![Muscle::Chest, Muscle::Back],
            maintenance_on: true,
            ..Default::default()
        };

        // If Chest and Back planned movements provide indirect volume:
        // Triceps gets 2.0 indirect, Biceps gets 2.0 indirect, Forearms gets 1.2 indirect.
        let mut indirect = HashMap::new();
        indirect.insert(Muscle::Triceps, 2.0);
        indirect.insert(Muscle::Biceps, 2.0);
        indirect.insert(Muscle::Forearms, 1.2);
        indirect.insert(Muscle::Abs, 0.0);

        let mut defs = HashMap::new();
        let cum = HashMap::new();
        let (alloc, dropped) =
            allocate_cycle_sets(b_cycle, &cycle, &settings, &mut defs, &cum, &indirect);

        // Maintenance is NOT dropped because net maintenance needed is small
        assert!(!dropped);
        // Triceps and Biceps needed 0 additional maintenance because indirect volume >= target (1.29)
        assert_eq!(*defs.get(&Muscle::Triceps).unwrap_or(&0.0), 0.0);
        assert_eq!(*defs.get(&Muscle::Biceps).unwrap_or(&0.0), 0.0);
        // Priority muscles get the sets
        assert_eq!(alloc[&Muscle::Chest], 4);
        assert_eq!(alloc[&Muscle::Back], 4);
    }

    #[test]
    fn test_exercise_ordering_compound_before_isolation_and_synergist_dependency() {
        let exercises = crate::load_embedded_exercises();

        // Scenario 1: Overhead DB Extension placed before Deep Parallette Push Up
        let mut session_1_blocks = vec![
            Block {
                exercise_id: "overhead_db_extension".to_string(),
                sets: 3,
                rep_target_min: 8,
                rep_target_max: 15,
                seconds_target_min: None,
                seconds_target_max: None,
                effort_target: "0-3 reps from failure".to_string(),
                tempo_cue: "".to_string(),
                rest_cue: "".to_string(),
                added_weight_kg: 0.0,
            },
            Block {
                exercise_id: "deep_parallette_push_up".to_string(),
                sets: 3,
                rep_target_min: 8,
                rep_target_max: 15,
                seconds_target_min: None,
                seconds_target_max: None,
                effort_target: "0-3 reps from failure".to_string(),
                tempo_cue: "".to_string(),
                rest_cue: "".to_string(),
                added_weight_kg: 0.0,
            },
        ];

        sort_session_blocks(&mut session_1_blocks, &exercises);

        // Assert compound push-up comes BEFORE triceps isolation
        assert_eq!(session_1_blocks[0].exercise_id, "deep_parallette_push_up");
        assert_eq!(session_1_blocks[1].exercise_id, "overhead_db_extension");

        // Scenario 2: DB Curl placed before Slow Lowering Pull Up
        let mut session_2_blocks = vec![
            Block {
                exercise_id: "db_curl".to_string(),
                sets: 3,
                rep_target_min: 8,
                rep_target_max: 15,
                seconds_target_min: None,
                seconds_target_max: None,
                effort_target: "0-3 reps from failure".to_string(),
                tempo_cue: "".to_string(),
                rest_cue: "".to_string(),
                added_weight_kg: 0.0,
            },
            Block {
                exercise_id: "slow_lowering_pull_up".to_string(),
                sets: 3,
                rep_target_min: 8,
                rep_target_max: 15,
                seconds_target_min: None,
                seconds_target_max: None,
                effort_target: "0-3 reps from failure".to_string(),
                tempo_cue: "".to_string(),
                rest_cue: "".to_string(),
                added_weight_kg: 0.0,
            },
        ];

        sort_session_blocks(&mut session_2_blocks, &exercises);

        // Assert compound pull-up comes BEFORE biceps isolation
        assert_eq!(session_2_blocks[0].exercise_id, "slow_lowering_pull_up");
        assert_eq!(session_2_blocks[1].exercise_id, "db_curl");

        // Scenario 3: Abs core exercise placed before compound or isolation
        let mut mixed_blocks = vec![
            Block {
                exercise_id: "hollow_hold".to_string(),
                sets: 3,
                rep_target_min: 0,
                rep_target_max: 0,
                seconds_target_min: Some(30),
                seconds_target_max: Some(60),
                effort_target: "0-3 reps from failure".to_string(),
                tempo_cue: "".to_string(),
                rest_cue: "".to_string(),
                added_weight_kg: 0.0,
            },
            Block {
                exercise_id: "db_curl".to_string(),
                sets: 3,
                rep_target_min: 8,
                rep_target_max: 15,
                seconds_target_min: None,
                seconds_target_max: None,
                effort_target: "0-3 reps from failure".to_string(),
                tempo_cue: "".to_string(),
                rest_cue: "".to_string(),
                added_weight_kg: 0.0,
            },
            Block {
                exercise_id: "pull_up".to_string(),
                sets: 3,
                rep_target_min: 8,
                rep_target_max: 15,
                seconds_target_min: None,
                seconds_target_max: None,
                effort_target: "0-3 reps from failure".to_string(),
                tempo_cue: "".to_string(),
                rest_cue: "".to_string(),
                added_weight_kg: 0.0,
            },
        ];

        sort_session_blocks(&mut mixed_blocks, &exercises);

        // Order must be: Compound (pull_up) -> Isolation (db_curl) -> Core (hollow_hold)
        assert_eq!(mixed_blocks[0].exercise_id, "pull_up");
        assert_eq!(mixed_blocks[1].exercise_id, "db_curl");
        assert_eq!(mixed_blocks[2].exercise_id, "hollow_hold");
    }
}
