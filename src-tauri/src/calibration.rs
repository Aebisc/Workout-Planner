use crate::models::{BwAnchor, Exercise, Profile, Settings};
use std::collections::HashMap;

/// Calculates fresh single-set max reps from 4-set average and failure proximity.
/// - Sets taken close to failure (0-3 reps short): round(avg / 0.80)
/// - Sets not close to failure (4+ reps short): round(avg / 0.90 + 4.0)
pub fn estimate_fresh_max(four_set_avg: f64, close_to_failure: bool) -> u32 {
    if four_set_avg <= 0.0 {
        return 0;
    }
    let est = if close_to_failure {
        (four_set_avg / 0.80).round()
    } else {
        (four_set_avg / 0.90 + 4.0).round()
    };
    est.max(1.0) as u32
}

/// Linear interpolation of bodyweight fraction across height anchors (e.g., bed height).
pub fn interpolate_bw_fraction(anchors: &[BwAnchor], height_cm: f64) -> f64 {
    if anchors.is_empty() {
        return 0.64;
    }
    if anchors.len() == 1 {
        return anchors[0].fraction;
    }

    let mut sorted = anchors.to_vec();
    sorted.sort_by(|a, b| a.height_cm.partial_cmp(&b.height_cm).unwrap());

    if height_cm <= sorted.first().unwrap().height_cm {
        return sorted.first().unwrap().fraction;
    }
    if height_cm >= sorted.last().unwrap().height_cm {
        return sorted.last().unwrap().fraction;
    }

    for window in sorted.windows(2) {
        let p0 = &window[0];
        let p1 = &window[1];
        if height_cm >= p0.height_cm && height_cm <= p1.height_cm {
            let t = (height_cm - p0.height_cm) / (p1.height_cm - p0.height_cm);
            return p0.fraction + t * (p1.fraction - p0.fraction);
        }
    }

    sorted.last().unwrap().fraction
}

/// Computes the effective load lifted in kg:
/// load = (fraction * body_weight) + added_weight
pub fn compute_load(fraction: f64, body_weight_kg: f64, added_kg: f64) -> f64 {
    (fraction * body_weight_kg) + added_kg
}

/// Computes effective load taking into account lever arm physics:
/// Torso-mounted backpack on push ladder exercises contributes 0.75x force at hands (van den Tillaar & Ball, 2020).
pub fn compute_exercise_load(exercise: &Exercise, fraction: f64, body_weight_kg: f64, added_kg: f64) -> f64 {
    let effective_added = if exercise.ladder == "push" {
        added_kg * 0.75
    } else {
        added_kg
    };
    (fraction * body_weight_kg) + effective_added
}

/// Epley 1RM estimation: 1RM = load * (1 + reps / 30)
pub fn epley_1rm(load: f64, reps: u32) -> f64 {
    if reps == 0 {
        return 0.0;
    }
    load * (1.0 + (reps as f64) / 30.0)
}

/// Estimated reps to failure at a new load given a 1RM:
/// reps = 30 * (1RM / new_load - 1)
pub fn reps_at_new_load(one_rm: f64, new_load: f64) -> f64 {
    if new_load <= 0.0 || one_rm <= new_load {
        return 0.0;
    }
    30.0 * (one_rm / new_load - 1.0)
}

/// Get effective bodyweight fraction for an exercise given current bed height.
pub fn get_exercise_bw_fraction(exercise: &Exercise, bed_height_cm: f64) -> f64 {
    if let Some(fraction) = exercise.bw_fraction {
        fraction
    } else if let Some(ref anchors) = exercise.bw_anchors {
        interpolate_bw_fraction(anchors, bed_height_cm)
    } else {
        0.64
    }
}

/// Chooses the optimal starting variation and backpack load along a progression ladder
/// targeting 8-20 reps to failure (acceptable 6-30).
pub fn choose_starting_variation<'a>(
    ladder_exercises: &'a [Exercise],
    calibrated_exercise_id: &str,
    calibrated_max_reps: u32,
    body_weight_kg: f64,
    settings: &Settings,
) -> (&'a Exercise, f64) {
    let base_exercise = ladder_exercises
        .iter()
        .find(|e| e.id == calibrated_exercise_id)
        .unwrap_or(&ladder_exercises[0]);

    let base_fraction = get_exercise_bw_fraction(base_exercise, settings.bed_height_cm);
    let base_load = compute_exercise_load(base_exercise, base_fraction, body_weight_kg, 0.0);
    let one_rm = epley_1rm(base_load, calibrated_max_reps);

    let mut ladder: Vec<&'a Exercise> = ladder_exercises.iter().collect();
    ladder.sort_by_key(|e| e.rung);

    let mut best_exercise = base_exercise;
    let mut best_backpack = 0.0;
    let mut best_diff_from_target = f64::MAX;

    for &ex in &ladder {
        let frac = get_exercise_bw_fraction(ex, settings.bed_height_cm);
        let load = compute_exercise_load(ex, frac, body_weight_kg, 0.0);
        let est_reps = reps_at_new_load(one_rm, load);

        if (8.0..=20.0).contains(&est_reps) {
            let diff = (est_reps - 12.0).abs();
            if diff < best_diff_from_target {
                best_diff_from_target = diff;
                best_exercise = ex;
                best_backpack = 0.0;
            }
        }
    }

    if best_diff_from_target < f64::MAX {
        return (best_exercise, best_backpack);
    }

    // If all reps are > 20 on highest rung and backpack enabled, calculate required bottle increments (1.5 kg bottles)
    let highest_ex = ladder.last().copied().unwrap_or(base_exercise);
    let highest_frac = get_exercise_bw_fraction(highest_ex, settings.bed_height_cm);
    let highest_reps = reps_at_new_load(one_rm, compute_exercise_load(highest_ex, highest_frac, body_weight_kg, 0.0));

    if highest_reps > 20.0 && settings.backpack {
        let mut added = 1.5;
        while added <= 30.0 {
            let load = compute_exercise_load(highest_ex, highest_frac, body_weight_kg, added);
            let reps = reps_at_new_load(one_rm, load);
            if (8.0..=20.0).contains(&reps) {
                return (highest_ex, added);
            }
            added += 1.5;
        }
    }

    // Fallback: pick the exercise whose estimated reps are closest to 12
    for &ex in &ladder {
        let frac = get_exercise_bw_fraction(ex, settings.bed_height_cm);
        let load = compute_load(frac, body_weight_kg, 0.0);
        let est_reps = reps_at_new_load(one_rm, load);
        let diff = (est_reps - 12.0).abs();
        if diff < best_diff_from_target {
            best_diff_from_target = diff;
            best_exercise = ex;
            best_backpack = 0.0;
        }
    }

    (best_exercise, best_backpack)
}

/// Initialize profile estimates from onboarding answers.
pub fn calibrate_initial_profile(
    answers: &crate::models::CalibrationAnswers,
    exercises: &[Exercise],
) -> (Profile, String, f64) {
    let mut profile = Profile {
        body_weight_kg: answers.body_weight_kg,
        estimated_max_reps: HashMap::new(),
        dumbbell_calibrated_reps: None,
    };

    let push_ladder: Vec<Exercise> = exercises
        .iter()
        .filter(|e| e.ladder == "push")
        .cloned()
        .collect();

    let push_max = estimate_fresh_max(answers.push_ups_4_set_avg, answers.sets_close_to_failure);
    profile
        .estimated_max_reps
        .insert("push_up".to_string(), push_max);

    if push_max > 0 {
        let push_ex_opt = push_ladder.iter().find(|e| e.id == "push_up");
        let push_frac = push_ex_opt
            .map(|e| get_exercise_bw_fraction(e, answers.bed_height_cm))
            .unwrap_or(0.64);
        let push_load = compute_exercise_load(
            push_ex_opt.unwrap_or(&push_ladder[0]),
            push_frac,
            answers.body_weight_kg,
            0.0,
        );
        let push_1rm = epley_1rm(push_load, push_max);
        for ex in &push_ladder {
            if ex.id != "push_up" {
                let frac = get_exercise_bw_fraction(ex, answers.bed_height_cm);
                let load = compute_exercise_load(ex, frac, answers.body_weight_kg, 0.0);
                let est_reps = reps_at_new_load(push_1rm, load).round() as u32;
                profile.estimated_max_reps.insert(ex.id.clone(), est_reps);
            }
        }
    } else {
        profile.estimated_max_reps.insert("incline_push_up".to_string(), 5);
    }

    let pull_max = estimate_fresh_max(answers.pull_ups_4_set_avg, answers.sets_close_to_failure);
    profile
        .estimated_max_reps
        .insert("pull_up".to_string(), pull_max);

    if answers.pull_ups_4_set_avg >= 1.0 && pull_max > 0 {
        let pull_1rm = epley_1rm(0.93 * answers.body_weight_kg, pull_max);
        for ex in exercises
            .iter()
            .filter(|e| e.ladder == "pull" || e.ladder == "pull_biceps_branch")
        {
            if ex.id != "pull_up" {
                let frac = get_exercise_bw_fraction(ex, answers.bed_height_cm);
                let load = compute_exercise_load(ex, frac, answers.body_weight_kg, 0.0);
                let est_reps = reps_at_new_load(pull_1rm, load).round() as u32;
                profile.estimated_max_reps.insert(ex.id.clone(), est_reps);
            }
        }
    } else {
        profile.estimated_max_reps.insert("pull_up".to_string(), 0);
        profile.estimated_max_reps.insert("chin_up".to_string(), 0);
        profile.estimated_max_reps.insert("pause_pull_up".to_string(), 0);
        profile.estimated_max_reps.insert("jump_assisted_pull_up".to_string(), 3);
        profile.estimated_max_reps.insert("slow_lowering_pull_up".to_string(), 6);
    }

    let settings = Settings {
        bed_height_cm: answers.bed_height_cm,
        experience: answers.experience,
        ..Default::default()
    };

    let (starting_push, added_weight) = choose_starting_variation(
        &push_ladder,
        "push_up",
        push_max,
        answers.body_weight_kg,
        &settings,
    );

    (profile, starting_push.id.clone(), added_weight)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_estimate_fresh_max_close_to_failure() {
        // Average 10 close to failure: 10 / 0.80 = 12.5 -> 13
        assert_eq!(estimate_fresh_max(10.0, true), 13);
        // Average 20 close to failure: 20 / 0.80 = 25
        assert_eq!(estimate_fresh_max(20.0, true), 25);
        // Average 0 -> 0
        assert_eq!(estimate_fresh_max(0.0, true), 0);
    }

    #[test]
    fn test_estimate_fresh_max_not_close_to_failure() {
        // Average 10 not close: 10 / 0.90 + 4 = 11.11 + 4 = 15.11 -> 15
        assert_eq!(estimate_fresh_max(10.0, false), 15);
    }

    #[test]
    fn test_interpolate_bw_fraction_default_bed() {
        let hands_anchors = vec![
            BwAnchor {
                height_cm: 0.0,
                fraction: 0.64,
            },
            BwAnchor {
                height_cm: 30.0,
                fraction: 0.55,
            },
            BwAnchor {
                height_cm: 61.0,
                fraction: 0.41,
            },
        ];
        // At 50cm: between 30 and 61: 0.55 + (20/31) * (0.41 - 0.55) = 0.55 - 0.0903 ≈ 0.46
        let frac_50 = interpolate_bw_fraction(&hands_anchors, 50.0);
        assert!((frac_50 - 0.46).abs() < 0.01);

        let feet_anchors = vec![
            BwAnchor {
                height_cm: 0.0,
                fraction: 0.64,
            },
            BwAnchor {
                height_cm: 61.0,
                fraction: 0.74,
            },
        ];
        // At 50cm: 0.64 + (50/61) * (0.74 - 0.64) = 0.64 + 0.082 ≈ 0.722
        let feet_50 = interpolate_bw_fraction(&feet_anchors, 50.0);
        assert!((feet_50 - 0.72).abs() < 0.01);
    }

    #[test]
    fn test_epley_1rm_and_reps_at_new_load() {
        let load = 50.0;
        let reps = 10;
        let one_rm = epley_1rm(load, reps); // 50 * (1 + 10/30) = 66.666...
        assert!((one_rm - 66.67).abs() < 0.05);

        let roundtrip_reps = reps_at_new_load(one_rm, load);
        assert!((roundtrip_reps - 10.0).abs() < 0.01);
    }
}
