use muscle_growth_planner_lib::calibration::calibrate_initial_profile;
use muscle_growth_planner_lib::models::{
    Block, CalibrationAnswers, ExperienceLevel, Muscle, Profile, SetLog, Settings,
};
use muscle_growth_planner_lib::progression::{
    apply_deload, detect_stall, detect_stall_from_all_logs, evaluate_progression, restore_from_deload,
};
use muscle_growth_planner_lib::scheduler::{
    days_per_week_to_cycle, generate_plan, partition_sets_into_blocks, sort_session_blocks,
};
use muscle_growth_planner_lib::volume::{
    effective_sets_per_cycle, evaluate_plan_warnings, evaluate_stall_warnings, weekly_effective_sets,
};
use muscle_growth_planner_lib::{load_embedded_exercises, load_embedded_warning_tiers};
use std::collections::HashMap;

#[test]
fn test_worked_example_1_back_priority_3_days() {
    // 3 days/week, priority back, 4 sets/day
    // Cycle: 7 days, 3 sessions, B_cycle = 12
    let exercises = load_embedded_exercises();
    let tiers = load_embedded_warning_tiers();

    let settings = Settings {
        sets_per_day: 4,
        days_per_week: 3.0,
        priority_muscles: vec![Muscle::Back],
        maintenance_on: true,
        experience: ExperienceLevel::SixTo24Months,
        ..Default::default()
    };
    let profile = Profile::default();

    let plan = generate_plan(
        &settings,
        &profile,
        &exercises,
        HashMap::new(),
        HashMap::new(),
    );

    // Maintenance would need ~7 of 12 sets (over 50%), so it is dropped with a warning
    assert!(plan.maintenance_dropped);
    assert_eq!(plan.cycle.length_days, 7);
    assert_eq!(plan.cycle.sessions_count, 3);
    assert_eq!(plan.sessions.len(), 3);

    // Direct sets across the 3 sessions equal 12
    let total_direct_sets: u32 = plan
        .sessions
        .iter()
        .map(|s| s.blocks.iter().map(|b| b.sets).sum::<u32>())
        .sum();
    assert_eq!(total_direct_sets, 12);

    let mut ex_map = HashMap::new();
    for ex in &exercises {
        ex_map.insert(ex.id.clone(), ex.clone());
    }
    let eff = effective_sets_per_cycle(&plan, &ex_map);
    let weekly = weekly_effective_sets(&eff, plan.cycle.length_days);

    // Back gets >= 10 weekly effective sets (11.2 - 12.0), in the evidence-supported growth range
    let back_weekly = weekly[&Muscle::Back];
    assert!((10.0..=12.5).contains(&back_weekly));

    // Biceps and forearms receive indirect volume from back exercises
    assert!(weekly[&Muscle::Biceps] > 0.0);
    assert!(weekly[&Muscle::Forearms] > 0.0);

    let warnings = evaluate_plan_warnings(&plan, &ex_map, &settings, &tiers);
    assert!(warnings.iter().any(|w| w.code == "maintenance_dropped"));
}

#[test]
fn test_worked_example_2_two_on_one_off_chest_and_back() {
    // 4.67 days/week (2 on / 1 off), chest + back, 4 sets/day
    // Cycle: 3 days, 2 sessions, B_cycle = 8
    let exercises = load_embedded_exercises();
    let tiers = load_embedded_warning_tiers();

    let settings = Settings {
        sets_per_day: 4,
        days_per_week: 4.67,
        priority_muscles: vec![Muscle::Chest, Muscle::Back],
        maintenance_on: false, // Case: Maintenance off
        ..Default::default()
    };
    let profile = Profile::default();

    let plan = generate_plan(
        &settings,
        &profile,
        &exercises,
        HashMap::new(),
        HashMap::new(),
    );
    assert_eq!(plan.cycle.length_days, 3);
    assert_eq!(plan.cycle.sessions_count, 2);

    let mut ex_map = HashMap::new();
    for ex in &exercises {
        ex_map.insert(ex.id.clone(), ex.clone());
    }
    let eff = effective_sets_per_cycle(&plan, &ex_map);
    let weekly = weekly_effective_sets(&eff, plan.cycle.length_days);

    // ~4 sets per cycle each = ~9.3 weekly each -> both in small growth tier (5 to <10)
    assert!((weekly[&Muscle::Chest] - 9.33).abs() < 1.0);
    assert!((weekly[&Muscle::Back] - 9.33).abs() < 1.0);

    let warnings = evaluate_plan_warnings(&plan, &ex_map, &settings, &tiers);
    // Both get small growth warning / diluted plan suggestion
    assert!(
        warnings
            .iter()
            .any(|w| w.code == "small_growth" || w.code == "diluted_plan")
    );
}

#[test]
fn test_worked_example_3_every_other_day_one_priority() {
    // 3.5 days/week (every other day), one priority (chest), 4 sets/day
    // Cycle: 2 days, 1 session, B_cycle = 4
    let exercises = load_embedded_exercises();
    let settings = Settings {
        sets_per_day: 4,
        days_per_week: 3.5,
        priority_muscles: vec![Muscle::Chest],
        maintenance_on: true,
        ..Default::default()
    };
    let profile = Profile::default();

    let plan = generate_plan(
        &settings,
        &profile,
        &exercises,
        HashMap::new(),
        HashMap::new(),
    );
    assert!(plan.maintenance_dropped);
    assert_eq!(plan.cycle.length_days, 2);
    assert_eq!(plan.cycle.sessions_count, 1);

    let mut ex_map = HashMap::new();
    for ex in &exercises {
        ex_map.insert(ex.id.clone(), ex.clone());
    }
    let eff = effective_sets_per_cycle(&plan, &ex_map);
    let weekly = weekly_effective_sets(&eff, plan.cycle.length_days);

    // 4 sets per cycle * 7 / 2 = 14 weekly sets (in growth range 10-20)
    assert_eq!(weekly[&Muscle::Chest], 14.0);
}

#[test]
fn test_worked_example_4_two_days_per_week_one_priority() {
    // 2 days/week, one priority (chest), 4 sets/day
    // Cycle: 7 days, 2 sessions, B_cycle = 8
    let exercises = load_embedded_exercises();
    let tiers = load_embedded_warning_tiers();

    let settings = Settings {
        sets_per_day: 4,
        days_per_week: 2.0,
        priority_muscles: vec![Muscle::Chest],
        maintenance_on: false,
        ..Default::default()
    };
    let profile = Profile::default();

    let plan = generate_plan(
        &settings,
        &profile,
        &exercises,
        HashMap::new(),
        HashMap::new(),
    );
    assert_eq!(plan.cycle.length_days, 7);
    assert_eq!(plan.cycle.sessions_count, 2);

    let mut ex_map = HashMap::new();
    for ex in &exercises {
        ex_map.insert(ex.id.clone(), ex.clone());
    }
    let eff = effective_sets_per_cycle(&plan, &ex_map);
    let weekly = weekly_effective_sets(&eff, plan.cycle.length_days);

    // 8 weekly sets -> triggers small growth warning (< 10)
    assert_eq!(weekly[&Muscle::Chest], 8.0);

    let warnings = evaluate_plan_warnings(&plan, &ex_map, &settings, &tiers);
    assert!(warnings.iter().any(|w| w.code == "small_growth"));
}

#[test]
fn test_edge_case_zero_pull_ups_assisted_path() {
    let exercises = load_embedded_exercises();
    let answers = CalibrationAnswers {
        body_weight_kg: 70.0,
        bed_height_cm: 50.0,
        push_ups_4_set_avg: 8.0, // 8 / 0.8 = 10 fresh max reps
        pull_ups_4_set_avg: 0.0,
        sets_close_to_failure: true,
        experience: ExperienceLevel::SixTo24Months,
    };

    let (profile, starting_push, _) = calibrate_initial_profile(&answers, &exercises);
    assert_eq!(
        profile
            .estimated_max_reps
            .get("pull_up")
            .copied()
            .unwrap_or(0),
        0
    );
    assert_eq!(starting_push, "push_up");
}

#[test]
fn test_edge_case_one_set_per_day_block_bypass() {
    // 1 set/day budget: bypasses 2-set minimum rule
    let blocks = partition_sets_into_blocks(1);
    assert_eq!(blocks, vec![1]);

    let blocks_2 = partition_sets_into_blocks(2);
    assert_eq!(blocks_2, vec![2]);

    let blocks_5 = partition_sets_into_blocks(5);
    assert_eq!(blocks_5, vec![3, 2]);
}

#[test]
fn test_edge_case_deload_set_halving_and_floor() {
    let exercises = load_embedded_exercises();
    let settings = Settings {
        sets_per_day: 4,
        days_per_week: 3.5,
        ..Default::default()
    };
    let profile = Profile::default();

    let plan = generate_plan(
        &settings,
        &profile,
        &exercises,
        HashMap::new(),
        HashMap::new(),
    );
    let deloaded = apply_deload(&plan);

    for session in &deloaded.sessions {
        for block in &session.blocks {
            assert!(block.sets >= 1);
            // 4 sets halved = 2
            assert_eq!(block.sets, 2);
        }
    }
}

#[test]
fn test_edge_case_stall_detection() {
    // 3 consecutive exposures without progress
    let log_session_1 = vec![SetLog {
        timestamp: 1,
        session_number: 1,
        block_index: 0,
        exercise_id: "push_up".to_string(),
        reps_or_seconds: 12,
        added_weight_kg: 0.0,
        reps_from_failure: 1,
    }];
    let log_session_2 = vec![SetLog {
        timestamp: 2,
        session_number: 2,
        block_index: 0,
        exercise_id: "push_up".to_string(),
        reps_or_seconds: 12,
        added_weight_kg: 0.0,
        reps_from_failure: 2,
    }];
    let log_session_3 = vec![SetLog {
        timestamp: 3,
        session_number: 3,
        block_index: 0,
        exercise_id: "push_up".to_string(),
        reps_or_seconds: 11,
        added_weight_kg: 0.0,
        reps_from_failure: 1,
    }];

    let history = vec![log_session_1, log_session_2, log_session_3];
    assert!(detect_stall("push_up", &history));
}

#[test]
fn test_edge_case_snapping_tolerance_and_fallback() {
    // 3.4 days/week is within 0.15 of 3.50 (every other day) -> snaps without adjustment fallback
    let c_34 = days_per_week_to_cycle(3.4);
    assert!(!c_34.is_adjusted);
    assert_eq!(c_34.length_days, 2);

    // 4.6 days/week is within 0.15 of 4.67 (2 on / 1 off) -> snaps
    let c_46 = days_per_week_to_cycle(4.6);
    assert!(!c_46.is_adjusted);
    assert_eq!(c_46.length_days, 3);

    // 3.3 days/week is 0.20 away -> triggers adjusted fallback notice
    let c_33 = days_per_week_to_cycle(3.3);
    assert!(c_33.is_adjusted);
    assert!(c_33.adjusted_message.is_some());
}

#[test]
fn test_dumbbell_calibration_adapts_cues_and_rep_targets() {
    let exercises = load_embedded_exercises();
    let settings = Settings {
        sets_per_day: 4,
        days_per_week: 3.5,
        priority_muscles: vec![Muscle::Biceps],
        maintenance_on: false,
        ..Default::default()
    };

    // Case 1: Uncalibrated profile (no db_curl estimated max reps)
    let profile_uncalibrated = Profile::default();
    let plan_1 = generate_plan(
        &settings,
        &profile_uncalibrated,
        &exercises,
        HashMap::new(),
        HashMap::new(),
    );
    let db_block_1 = plan_1.sessions[0]
        .blocks
        .iter()
        .find(|b| b.exercise_id == "db_curl")
        .expect("db_curl should be scheduled for biceps priority");
    assert_eq!(db_block_1.tempo_cue, "Controlled 2-3s negative");

    // Case 2: High capacity on db_curl (>22 reps) -> lengthened partials cue
    let mut profile_high = Profile::default();
    profile_high.estimated_max_reps.insert("db_curl".to_string(), 25);
    let plan_2 = generate_plan(
        &settings,
        &profile_high,
        &exercises,
        HashMap::new(),
        HashMap::new(),
    );
    let db_block_2 = plan_2.sessions[0]
        .blocks
        .iter()
        .find(|b| b.exercise_id == "db_curl")
        .unwrap();
    assert!(db_block_2.tempo_cue.contains("lengthened partials"));
    assert_eq!(db_block_2.rep_target_min, 10);
    assert_eq!(db_block_2.rep_target_max, 15);

    // Case 3: Moderate capacity on db_curl (18 reps) -> 3-4s lowering with 1s pause
    let mut profile_mod = Profile::default();
    profile_mod.estimated_max_reps.insert("db_curl".to_string(), 18);
    let plan_3 = generate_plan(
        &settings,
        &profile_mod,
        &exercises,
        HashMap::new(),
        HashMap::new(),
    );
    let db_block_3 = plan_3.sessions[0]
        .blocks
        .iter()
        .find(|b| b.exercise_id == "db_curl")
        .unwrap();
    assert!(db_block_3.tempo_cue.contains("pause in stretch"));
    assert_eq!(db_block_3.rep_target_min, 8);
    assert_eq!(db_block_3.rep_target_max, 12);
}

#[test]
fn test_deload_lifecycle_and_restoration() {
    let exercises = load_embedded_exercises();
    let tiers = load_embedded_warning_tiers();

    let settings = Settings {
        sets_per_day: 4,
        days_per_week: 3.0,
        priority_muscles: vec![Muscle::Chest],
        maintenance_on: false,
        ..Default::default()
    };
    let profile = Profile::default();

    let plan = generate_plan(
        &settings,
        &profile,
        &exercises,
        HashMap::new(),
        HashMap::new(),
    );
    assert!(!plan.is_deload);
    assert!(plan.pre_deload_sessions.is_none());
    assert_eq!(plan.sessions[0].blocks[0].sets, 4);

    // Apply deload
    let deloaded = apply_deload(&plan);
    assert!(deloaded.is_deload);
    assert!(deloaded.pre_deload_sessions.is_some());
    assert_eq!(deloaded.sessions[0].blocks[0].sets, 2);

    // Idempotency: apply deload a second time
    let deloaded_twice = apply_deload(&deloaded);
    assert_eq!(deloaded_twice.sessions[0].blocks[0].sets, 2);

    // Evaluate warnings on deloaded plan
    let mut ex_map = HashMap::new();
    for ex in &exercises {
        ex_map.insert(ex.id.clone(), ex.clone());
    }
    let warnings = evaluate_plan_warnings(&deloaded, &ex_map, &settings, &tiers);
    assert!(warnings.iter().any(|w| w.code == "active_deload_cycle"));
    assert!(!warnings.iter().any(|w| w.code == "muscle_loss" || w.code == "small_growth"));

    // Restore from deload
    let restored = restore_from_deload(&deloaded);
    assert!(!restored.is_deload);
    assert!(restored.pre_deload_sessions.is_none());
    assert_eq!(restored.sessions[0].blocks[0].sets, 4);
}

#[test]
fn test_stall_detection_from_flat_set_logs_and_warnings() {
    let exercises = load_embedded_exercises();
    let settings = Settings {
        sets_per_day: 4,
        days_per_week: 3.0,
        priority_muscles: vec![Muscle::Chest],
        ..Default::default()
    };
    let profile = Profile::default();
    let plan = generate_plan(
        &settings,
        &profile,
        &exercises,
        HashMap::new(),
        HashMap::new(),
    );

    let mut ex_map = HashMap::new();
    for ex in &exercises {
        ex_map.insert(ex.id.clone(), ex.clone());
    }

    // 3 separate exposures of push_up separated by 24h with no rep/load progress
    let now = 1_700_000_000_000_i64;
    let day_ms = 86_400_000_i64;
    let logs = vec![
        SetLog {
            timestamp: now - 2 * day_ms,
            session_number: 1,
            block_index: 0,
            exercise_id: "push_up".to_string(),
            reps_or_seconds: 12,
            added_weight_kg: 0.0,
            reps_from_failure: 1,
        },
        SetLog {
            timestamp: now - day_ms,
            session_number: 1,
            block_index: 0,
            exercise_id: "push_up".to_string(),
            reps_or_seconds: 12,
            added_weight_kg: 0.0,
            reps_from_failure: 1,
        },
        SetLog {
            timestamp: now,
            session_number: 1,
            block_index: 0,
            exercise_id: "push_up".to_string(),
            reps_or_seconds: 12,
            added_weight_kg: 0.0,
            reps_from_failure: 1,
        },
    ];

    assert!(detect_stall_from_all_logs("push_up", &logs));
    let stall_warnings = evaluate_stall_warnings(&plan, &ex_map, &logs);
    assert!(
        stall_warnings.iter().any(|w| w.code == "exercise_stall" && w.muscle == Some(Muscle::Chest)),
        "Should emit an exercise_stall warning for Muscle::Chest"
    );
}

#[test]
fn test_apply_progression_preserves_set_volume_and_reorders() {
    let exercises = load_embedded_exercises();
    let settings = Settings {
        sets_per_day: 4,
        days_per_week: 3.0,
        priority_muscles: vec![Muscle::Chest],
        ..Default::default()
    };
    let profile = Profile::default();
    let mut plan = generate_plan(
        &settings,
        &profile,
        &exercises,
        HashMap::new(),
        HashMap::new(),
    );

    let original_sets = plan.sessions[0].blocks[0].sets;
    assert_eq!(original_sets, 4);

    // Mutate block 0: upgrade variation to feet_elevated_push_up
    let session = &mut plan.sessions[0];
    let block = &mut session.blocks[0];
    block.exercise_id = "feet_elevated_push_up".to_string();
    block.added_weight_kg = 0.0;
    block.tempo_cue = "Controlled 2-3s negative".to_string();
    // Invariant check: sets MUST be strictly untouched
    assert_eq!(block.sets, original_sets);

    // Re-run sort_session_blocks and verify order
    sort_session_blocks(&mut session.blocks, &exercises);
    assert_eq!(session.blocks[0].sets, original_sets);
    assert_eq!(session.blocks[0].exercise_id, "feet_elevated_push_up");
}

#[test]
fn test_history_fallback_clustering_multi_week() {
    use muscle_growth_planner_lib::models::SetLog;

    // Simulate 2 distinct workouts across different weeks with session_number = 1
    let ts_week_1 = 1_000_000_000_000_i64;
    let ts_week_2 = ts_week_1 + 7 * 86_400_000;

    let mut set_logs = vec![
        SetLog {
            timestamp: ts_week_1,
            session_number: 1,
            block_index: 0,
            exercise_id: "push_up".to_string(),
            reps_or_seconds: 15,
            added_weight_kg: 0.0,
            reps_from_failure: 2,
        },
        SetLog {
            timestamp: ts_week_1 + 180_000,
            session_number: 1,
            block_index: 0,
            exercise_id: "push_up".to_string(),
            reps_or_seconds: 14,
            added_weight_kg: 0.0,
            reps_from_failure: 1,
        },
        SetLog {
            timestamp: ts_week_2,
            session_number: 1,
            block_index: 0,
            exercise_id: "push_up".to_string(),
            reps_or_seconds: 16,
            added_weight_kg: 0.0,
            reps_from_failure: 2,
        },
    ];

    set_logs.sort_by_key(|l| l.timestamp);

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

    assert_eq!(session_clusters.len(), 2, "Expected 2 distinct session clusters across 2 weeks");
    assert_eq!(session_clusters[0].len(), 2, "Week 1 cluster should have 2 sets");
    assert_eq!(session_clusters[1].len(), 1, "Week 2 cluster should have 1 set");
}

#[test]
fn test_update_completed_session_purges_old_timestamp_sets() {
    use muscle_growth_planner_lib::models::SetLog;

    let ts_old = 1_000_000_000_000_i64;
    let ts_new = ts_old + 2 * 86_400_000; // shifted by 2 days

    let mut all_logs = vec![
        SetLog {
            timestamp: ts_old,
            session_number: 1,
            block_index: 0,
            exercise_id: "push_up".to_string(),
            reps_or_seconds: 12,
            added_weight_kg: 0.0,
            reps_from_failure: 2,
        },
    ];

    let old_timestamp = Some(ts_old);
    let session_timestamp = ts_new;
    let session_number = 1;

    all_logs.retain(|l| {
        let matches_new = l.session_number == session_number
            && (l.timestamp - session_timestamp).abs() < 43_200_000;
        let matches_old = if let Some(old_ts) = old_timestamp {
            l.session_number == session_number
                && (l.timestamp - old_ts).abs() < 43_200_000
        } else {
            false
        };
        !(matches_new || matches_old)
    });

    assert!(all_logs.is_empty(), "Old sets from shifted date must be successfully purged");
}

#[test]
fn test_average_reps_increase_across_sets_counts_as_progress() {
    use muscle_growth_planner_lib::models::SetLog;

    // Trainee achieves 10 reps on top set in all 3 sessions,
    // but increases work capacity on subsequent sets:
    // Session 1: 10, 8, 8 -> avg 8.67
    // Session 2: 10, 9, 8 -> avg 9.00
    // Session 3: 10, 9, 9 -> avg 9.33
    let s1 = vec![
        SetLog { timestamp: 100, session_number: 1, block_index: 0, exercise_id: "pull_up".into(), reps_or_seconds: 10, added_weight_kg: 0.0, reps_from_failure: 1 },
        SetLog { timestamp: 101, session_number: 1, block_index: 0, exercise_id: "pull_up".into(), reps_or_seconds: 8, added_weight_kg: 0.0, reps_from_failure: 1 },
        SetLog { timestamp: 102, session_number: 1, block_index: 0, exercise_id: "pull_up".into(), reps_or_seconds: 8, added_weight_kg: 0.0, reps_from_failure: 1 },
    ];
    let s2 = vec![
        SetLog { timestamp: 200, session_number: 2, block_index: 0, exercise_id: "pull_up".into(), reps_or_seconds: 10, added_weight_kg: 0.0, reps_from_failure: 1 },
        SetLog { timestamp: 201, session_number: 2, block_index: 0, exercise_id: "pull_up".into(), reps_or_seconds: 9, added_weight_kg: 0.0, reps_from_failure: 1 },
        SetLog { timestamp: 202, session_number: 2, block_index: 0, exercise_id: "pull_up".into(), reps_or_seconds: 8, added_weight_kg: 0.0, reps_from_failure: 1 },
    ];
    let s3 = vec![
        SetLog { timestamp: 300, session_number: 3, block_index: 0, exercise_id: "pull_up".into(), reps_or_seconds: 10, added_weight_kg: 0.0, reps_from_failure: 1 },
        SetLog { timestamp: 301, session_number: 3, block_index: 0, exercise_id: "pull_up".into(), reps_or_seconds: 9, added_weight_kg: 0.0, reps_from_failure: 1 },
        SetLog { timestamp: 302, session_number: 3, block_index: 0, exercise_id: "pull_up".into(), reps_or_seconds: 9, added_weight_kg: 0.0, reps_from_failure: 1 },
    ];

    let history = vec![s1, s2, s3];
    assert!(
        !detect_stall("pull_up", &history),
        "Average reps increased (8.67 -> 9.33) despite top set staying at 10; must count as progress!"
    );
}

#[test]
fn test_stall_detected_independently_per_exercise() {
    use muscle_growth_planner_lib::models::SetLog;

    let day = 86_400_000_i64;
    let base = 1_700_000_000_000_i64;

    // Pull-ups progressing: 8 -> 9 -> 10 reps
    // Bicep curls stalled: 12 -> 12 -> 12 reps
    let logs = vec![
        // Day 1
        SetLog { timestamp: base, session_number: 1, block_index: 0, exercise_id: "pull_up".into(), reps_or_seconds: 8, added_weight_kg: 0.0, reps_from_failure: 1 },
        SetLog { timestamp: base + 1000, session_number: 1, block_index: 1, exercise_id: "db_curl".into(), reps_or_seconds: 12, added_weight_kg: 0.0, reps_from_failure: 1 },
        // Day 2
        SetLog { timestamp: base + day, session_number: 2, block_index: 0, exercise_id: "pull_up".into(), reps_or_seconds: 9, added_weight_kg: 0.0, reps_from_failure: 1 },
        SetLog { timestamp: base + day + 1000, session_number: 2, block_index: 1, exercise_id: "db_curl".into(), reps_or_seconds: 12, added_weight_kg: 0.0, reps_from_failure: 1 },
        // Day 3
        SetLog { timestamp: base + 2 * day, session_number: 3, block_index: 0, exercise_id: "pull_up".into(), reps_or_seconds: 10, added_weight_kg: 0.0, reps_from_failure: 1 },
        SetLog { timestamp: base + 2 * day + 1000, session_number: 3, block_index: 1, exercise_id: "db_curl".into(), reps_or_seconds: 12, added_weight_kg: 0.0, reps_from_failure: 1 },
    ];

    assert!(!detect_stall_from_all_logs("pull_up", &logs), "Pull-up is progressing, must not stall");
    assert!(detect_stall_from_all_logs("db_curl", &logs), "Bicep curl is flat across 3 sessions, must stall");
}

#[test]
fn test_load_increase_prevents_false_stall() {
    use muscle_growth_planner_lib::models::SetLog;

    let day = 86_400_000_i64;
    let base = 1_700_000_000_000_i64;

    // Day 1: 12 reps at bodyweight (0kg)
    // Day 2: Added 2.5kg backpack -> reps drop to 8 (expected due to heavier load)
    // Day 3: 2.5kg backpack -> 9 reps
    let logs = vec![
        SetLog { timestamp: base, session_number: 1, block_index: 0, exercise_id: "push_up".into(), reps_or_seconds: 12, added_weight_kg: 0.0, reps_from_failure: 1 },
        SetLog { timestamp: base + day, session_number: 2, block_index: 0, exercise_id: "push_up".into(), reps_or_seconds: 8, added_weight_kg: 2.5, reps_from_failure: 1 },
        SetLog { timestamp: base + 2 * day, session_number: 3, block_index: 0, exercise_id: "push_up".into(), reps_or_seconds: 9, added_weight_kg: 2.5, reps_from_failure: 1 },
    ];

    assert!(
        !detect_stall_from_all_logs("push_up", &logs),
        "Load increased from 0kg to 2.5kg; must not be flagged as a stall"
    );
}

#[test]
fn test_time_based_exercise_progression_uses_seconds_target_max() {
    let exercises = load_embedded_exercises();
    let dead_hang = exercises.iter().find(|e| e.id == "dead_hang").unwrap();

    let block = Block {
        exercise_id: "dead_hang".to_string(),
        sets: 3,
        rep_target_min: 0,
        rep_target_max: 0,
        seconds_target_min: Some(20),
        seconds_target_max: Some(60),
        effort_target: "0–1 RIR".to_string(),
        tempo_cue: "Controlled hold".to_string(),
        rest_cue: "1-2 min between sets".to_string(),
        added_weight_kg: 0.0,
    };
    let settings = Settings::default();

    // Trainee logs 25s holds at 1 RIR (well above 15, but below 60s target)
    let logs_25s = vec![
        SetLog { timestamp: 1, session_number: 1, block_index: 0, exercise_id: "dead_hang".into(), reps_or_seconds: 25, added_weight_kg: 0.0, reps_from_failure: 1 },
        SetLog { timestamp: 2, session_number: 1, block_index: 0, exercise_id: "dead_hang".into(), reps_or_seconds: 25, added_weight_kg: 0.0, reps_from_failure: 1 },
    ];
    let sugg_submax = evaluate_progression(1, 0, &block, dead_hang, &logs_25s, &settings).unwrap();
    assert_eq!(sugg_submax.action, "add_reps");
    assert!(sugg_submax.message.contains("60 seconds"), "Message should prescribe working towards 60 seconds: {}", sugg_submax.message);

    // Trainee logs 60s holds at 1 RIR (hits top target window)
    let logs_60s = vec![
        SetLog { timestamp: 3, session_number: 1, block_index: 0, exercise_id: "dead_hang".into(), reps_or_seconds: 60, added_weight_kg: 0.0, reps_from_failure: 1 },
        SetLog { timestamp: 4, session_number: 1, block_index: 0, exercise_id: "dead_hang".into(), reps_or_seconds: 60, added_weight_kg: 0.0, reps_from_failure: 1 },
    ];
    let sugg_top = evaluate_progression(1, 0, &block, dead_hang, &logs_60s, &settings).unwrap();
    assert_eq!(sugg_top.action, "intensify_execution");
    assert!(sugg_top.message.contains("Focus on full-body tension"));
}

#[test]
fn test_top_rep_mastery_is_never_overwritten_by_stall() {
    let exercises = load_embedded_exercises();
    let mut ex_map = HashMap::new();
    for ex in &exercises {
        ex_map.insert(ex.id.clone(), ex.clone());
    }

    let settings = Settings {
        sets_per_day: 3,
        days_per_week: 3.0,
        priority_muscles: vec![Muscle::Chest],
        ..Default::default()
    };
    let profile = Profile::default();
    let plan = generate_plan(&settings, &profile, &exercises, HashMap::new(), HashMap::new());

    let day = 86_400_000_i64;
    let base = 1_700_000_000_000_i64;

    let target_ex_id = plan.sessions[0].blocks[0].exercise_id.clone();
    let target_ex = ex_map.get(&target_ex_id).unwrap();

    // 3 consecutive exposures hitting 15, 15, 15 reps (hitting rep_target_max = 15)
    let logs = vec![
        SetLog { timestamp: base, session_number: 1, block_index: 0, exercise_id: target_ex_id.clone(), reps_or_seconds: 15, added_weight_kg: 0.0, reps_from_failure: 1 },
        SetLog { timestamp: base + day, session_number: 1, block_index: 0, exercise_id: target_ex_id.clone(), reps_or_seconds: 15, added_weight_kg: 0.0, reps_from_failure: 1 },
        SetLog { timestamp: base + 2 * day, session_number: 1, block_index: 0, exercise_id: target_ex_id.clone(), reps_or_seconds: 15, added_weight_kg: 0.0, reps_from_failure: 1 },
    ];

    // 1. evaluate_stall_warnings must not flag target_ex as stalled because top target was hit
    let stall_warnings = evaluate_stall_warnings(&plan, &ex_map, &logs);
    assert!(
        !stall_warnings.iter().any(|w| w.code == "exercise_stall" && w.muscle == Some(target_ex.primary_muscle)),
        "Top-rep mastery (15 reps) must not be flagged as a stall warning"
    );

    // 2. evaluate_progression on latest session sets returns intensify_execution or advance_variation
    let block = &plan.sessions[0].blocks[0];
    let session_sets = vec![
        SetLog { timestamp: base + 2 * day, session_number: 1, block_index: 0, exercise_id: target_ex_id.clone(), reps_or_seconds: 15, added_weight_kg: 0.0, reps_from_failure: 1 },
    ];
    let sugg = evaluate_progression(1, 0, block, target_ex, &session_sets, &settings).unwrap();
    assert_ne!(sugg.action, "stall_detected");
    assert!(sugg.action == "intensify_execution" || sugg.action == "advance_variation");
}

#[test]
fn test_swap_exercise_during_deload_preserves_swap_on_restore() {
    use muscle_growth_planner_lib::scheduler::{effort_target_for_exercise, rest_cue_for_exercise};

    let exercises = load_embedded_exercises();
    let settings = Settings {
        sets_per_day: 4,
        days_per_week: 3.0,
        priority_muscles: vec![Muscle::Chest],
        ..Default::default()
    };
    let profile = Profile::default();
    let mut plan = generate_plan(&settings, &profile, &exercises, HashMap::new(), HashMap::new());

    // Apply deload (is_deload == true)
    plan = apply_deload(&plan);
    assert!(plan.is_deload);
    assert!(plan.pre_deload_sessions.is_some());

    // Swap block 0 in Session 1 from push_up to feet_elevated_push_up
    let new_ex = exercises.iter().find(|e| e.id == "feet_elevated_push_up").unwrap();
    let block = &mut plan.sessions[0].blocks[0];
    block.exercise_id = new_ex.id.clone();
    block.effort_target = effort_target_for_exercise(new_ex);
    block.rest_cue = rest_cue_for_exercise(new_ex);

    // Sync to pre_deload_sessions
    if let Some(ref mut pre_sessions) = plan.pre_deload_sessions {
        let pre_block = &mut pre_sessions[0].blocks[0];
        pre_block.exercise_id = new_ex.id.clone();
        pre_block.effort_target = effort_target_for_exercise(new_ex);
        pre_block.rest_cue = rest_cue_for_exercise(new_ex);
    }

    // Restore from deload
    let restored = restore_from_deload(&plan);
    assert!(!restored.is_deload);
    assert_eq!(restored.sessions[0].blocks[0].exercise_id, "feet_elevated_push_up");
    assert_eq!(restored.sessions[0].blocks[0].effort_target, "1–2 RIR (0–1 RIR on final set)");
    // Restored session retains original pre-deload volume (4 sets)
    assert_eq!(restored.sessions[0].blocks[0].sets, 4);
}

#[test]
fn test_rebuild_profile_maxes_reverts_typo_or_deletion() {
    use muscle_growth_planner_lib::progression::rebuild_profile_maxes_from_logs;

    let mut profile = Profile::default();
    profile.estimated_max_reps.insert("push_up".to_string(), 102); // Accidental typo (100 reps + 2 RIR)

    let typo_logs = vec![
        SetLog { timestamp: 1, session_number: 1, block_index: 0, exercise_id: "push_up".into(), reps_or_seconds: 100, added_weight_kg: 0.0, reps_from_failure: 2 },
    ];
    let remaining_valid_logs = vec![
        SetLog { timestamp: 2, session_number: 2, block_index: 0, exercise_id: "push_up".into(), reps_or_seconds: 12, added_weight_kg: 0.0, reps_from_failure: 2 },
    ];

    rebuild_profile_maxes_from_logs(&mut profile, &typo_logs, &remaining_valid_logs);
    assert_eq!(profile.estimated_max_reps.get("push_up").copied(), Some(14)); // 12 reps + 2 RIR
}

#[test]
fn test_fatigue_aware_double_progression_triggers_on_realistic_set_dropoff() {
    let exercises = load_embedded_exercises();
    let push_up = exercises.iter().find(|e| e.id == "push_up").unwrap();
    let settings = Settings::default();

    let block = Block {
        exercise_id: "push_up".to_string(),
        sets: 3,
        rep_target_min: 8,
        rep_target_max: 15,
        seconds_target_min: None,
        seconds_target_max: None,
        effort_target: "1–2 RIR".to_string(),
        tempo_cue: "Controlled 2-3s negative".to_string(),
        rest_cue: "2–3 min".to_string(),
        added_weight_kg: 0.0,
    };

    // Realistic fatigue drop-off: 16, 15, 13 at 1 RIR (Set 1 >= 15, all sets >= 8, avg 14.67 >= 13.5)
    let logs_mastered = vec![
        SetLog { timestamp: 1, session_number: 1, block_index: 0, exercise_id: "push_up".into(), reps_or_seconds: 16, added_weight_kg: 0.0, reps_from_failure: 1 },
        SetLog { timestamp: 2, session_number: 1, block_index: 0, exercise_id: "push_up".into(), reps_or_seconds: 15, added_weight_kg: 0.0, reps_from_failure: 1 },
        SetLog { timestamp: 3, session_number: 1, block_index: 0, exercise_id: "push_up".into(), reps_or_seconds: 13, added_weight_kg: 0.0, reps_from_failure: 1 },
    ];

    let sugg = evaluate_progression(1, 0, &block, push_up, &logs_mastered, &settings);
    assert!(sugg.is_some());
    let s = sugg.unwrap();
    assert!(s.action == "intensify_execution" || s.action == "advance_variation");

    // Sub-target logs: 12, 11, 10 at 1 RIR (should keep working towards top reps)
    let logs_in_progress = vec![
        SetLog { timestamp: 4, session_number: 1, block_index: 0, exercise_id: "push_up".into(), reps_or_seconds: 12, added_weight_kg: 0.0, reps_from_failure: 1 },
        SetLog { timestamp: 5, session_number: 1, block_index: 0, exercise_id: "push_up".into(), reps_or_seconds: 11, added_weight_kg: 0.0, reps_from_failure: 1 },
        SetLog { timestamp: 6, session_number: 1, block_index: 0, exercise_id: "push_up".into(), reps_or_seconds: 10, added_weight_kg: 0.0, reps_from_failure: 1 },
    ];

    let sugg_sub = evaluate_progression(1, 0, &block, push_up, &logs_in_progress, &settings);
    assert!(sugg_sub.is_some());
    assert_eq!(sugg_sub.unwrap().action, "add_reps");
}

#[test]
fn test_no_duplicate_exercise_blocks_in_single_session() {
    let exercises = load_embedded_exercises();
    let settings = Settings {
        sets_per_day: 5,
        days_per_week: 3.5,
        priority_muscles: vec![Muscle::Chest],
        maintenance_on: false,
        ..Default::default()
    };
    let profile = Profile::default();

    let plan = generate_plan(
        &settings,
        &profile,
        &exercises,
        HashMap::new(),
        HashMap::new(),
    );

    for session in &plan.sessions {
        let mut seen = std::collections::HashSet::new();
        for block in &session.blocks {
            assert!(
                seen.insert(&block.exercise_id),
                "Found duplicate exercise_id '{}' in session {}",
                block.exercise_id,
                session.session_number
            );
        }
        let total_sets: u32 = session.blocks.iter().map(|b| b.sets).sum();
        assert_eq!(total_sets, 5, "Total sets in session {} must equal 5", session.session_number);
    }
}





