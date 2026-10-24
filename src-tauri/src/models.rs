use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Muscle {
    Chest,
    Back,
    Biceps,
    Triceps,
    Forearms,
    Abs,
}

impl Muscle {
    pub const ALL: [Muscle; 6] = [
        Muscle::Chest,
        Muscle::Back,
        Muscle::Biceps,
        Muscle::Triceps,
        Muscle::Forearms,
        Muscle::Abs,
    ];

    pub fn as_str(&self) -> &'static str {
        match self {
            Muscle::Chest => "chest",
            Muscle::Back => "back",
            Muscle::Biceps => "biceps",
            Muscle::Triceps => "triceps",
            Muscle::Forearms => "forearms",
            Muscle::Abs => "abs",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Units {
    #[default]
    Metric,
    Imperial,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum ExperienceLevel {
    #[serde(rename = "under_6_months", alias = "under6_months")]
    Under6Months,
    #[default]
    #[serde(rename = "six_to_24_months", alias = "six_to24_months")]
    SixTo24Months,
    #[serde(rename = "over_2_years", alias = "over2_years")]
    Over2Years,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MuscleWeights {
    #[serde(default)]
    pub chest: f64,
    #[serde(default)]
    pub back: f64,
    #[serde(default)]
    pub biceps: f64,
    #[serde(default)]
    pub triceps: f64,
    #[serde(default)]
    pub forearms: f64,
    #[serde(default)]
    pub abs: f64,
}

impl MuscleWeights {
    pub fn get(&self, muscle: Muscle) -> f64 {
        match muscle {
            Muscle::Chest => self.chest,
            Muscle::Back => self.back,
            Muscle::Biceps => self.biceps,
            Muscle::Triceps => self.triceps,
            Muscle::Forearms => self.forearms,
            Muscle::Abs => self.abs,
        }
    }

    pub fn set(&mut self, muscle: Muscle, val: f64) {
        match muscle {
            Muscle::Chest => self.chest = val,
            Muscle::Back => self.back = val,
            Muscle::Biceps => self.biceps = val,
            Muscle::Triceps => self.triceps = val,
            Muscle::Forearms => self.forearms = val,
            Muscle::Abs => self.abs = val,
        }
    }
}

impl Default for MuscleWeights {
    fn default() -> Self {
        Self {
            chest: 0.0,
            back: 0.0,
            biceps: 0.0,
            triceps: 0.0,
            forearms: 0.0,
            abs: 0.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BwAnchor {
    pub height_cm: f64,
    pub fraction: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Exercise {
    pub id: String,
    pub name: String,
    pub primary_muscle: Muscle,
    pub contribution_weights: MuscleWeights,
    pub equipment: Vec<String>,
    pub ladder: String,
    pub rung: u32,
    pub easier_id: Option<String>,
    pub harder_id: Option<String>,
    pub bw_fraction: Option<f64>,
    pub bw_anchors: Option<Vec<BwAnchor>>,
    pub time_based: bool,
    pub stretched_position: bool,
    pub cues: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MovementCategory {
    Compound = 0,
    Isolation = 1,
    Core = 2,
}

impl Exercise {
    pub fn movement_category(&self) -> MovementCategory {
        if self.primary_muscle == Muscle::Abs || self.ladder.starts_with("abs") {
            MovementCategory::Core
        } else if self.ladder == "push"
            || self.ladder == "pull"
            || self.primary_muscle == Muscle::Chest
            || self.primary_muscle == Muscle::Back
        {
            MovementCategory::Compound
        } else {
            MovementCategory::Isolation
        }
    }
}

fn default_true() -> bool {
    true
}

pub fn default_equipment() -> Vec<String> {
    vec![
        "pull_bar".to_string(),
        "parallettes".to_string(),
        "bed".to_string(),
        "dumbbell".to_string(),
    ]
}

fn default_false() -> bool {
    false
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub units: Units,
    pub backpack: bool,
    pub bed_height_cm: f64,
    pub priority_muscles: Vec<Muscle>,
    pub maintenance_on: bool,
    pub experience: ExperienceLevel,
    pub sets_per_day: u32,
    pub days_per_week: f64,
    pub calendar_view: bool,
    #[serde(default = "default_true")]
    pub rest_timer_sound: bool,
    #[serde(default = "default_equipment")]
    pub enabled_equipment: Vec<String>,
    #[serde(default = "default_false")]
    pub weight_vest: bool,
}

impl Settings {
    pub fn get_available_equipment(&self) -> Vec<String> {
        let mut eq = if self.enabled_equipment.is_empty() {
            default_equipment()
        } else {
            self.enabled_equipment.clone()
        };
        if !eq.contains(&"none".to_string()) {
            eq.push("none".to_string());
        }
        if self.backpack && !eq.contains(&"backpack".to_string()) {
            eq.push("backpack".to_string());
        }
        if self.weight_vest && !eq.contains(&"weight_vest".to_string()) {
            eq.push("weight_vest".to_string());
        }
        eq
    }

    pub fn has_equipment(&self, item: &str) -> bool {
        self.get_available_equipment().contains(&item.to_string())
    }
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            units: Units::Metric,
            backpack: false,
            bed_height_cm: 50.0,
            priority_muscles: vec![Muscle::Chest],
            maintenance_on: true,
            experience: ExperienceLevel::SixTo24Months,
            sets_per_day: 4,
            days_per_week: 3.5,
            calendar_view: false,
            rest_timer_sound: true,
            enabled_equipment: default_equipment(),
            weight_vest: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalibrationAnswers {
    pub body_weight_kg: f64,
    pub bed_height_cm: f64,
    pub push_ups_4_set_avg: f64,
    pub pull_ups_4_set_avg: f64,
    pub sets_close_to_failure: bool,
    pub experience: ExperienceLevel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub body_weight_kg: f64,
    pub estimated_max_reps: HashMap<String, u32>,
}

impl Default for Profile {
    fn default() -> Self {
        Self {
            body_weight_kg: 75.0,
            estimated_max_reps: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Block {
    pub exercise_id: String,
    pub sets: u32,
    pub rep_target_min: u32,
    pub rep_target_max: u32,
    pub seconds_target_min: Option<u32>,
    pub seconds_target_max: Option<u32>,
    pub effort_target: String,
    pub tempo_cue: String,
    pub rest_cue: String,
    pub added_weight_kg: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub session_number: u32,
    pub focus: Vec<Muscle>,
    pub blocks: Vec<Block>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Cycle {
    pub length_days: u32,
    pub sessions_count: u32,
    pub effective_weekly_rate: f64,
    pub description: String,
    pub is_adjusted: bool,
    pub adjusted_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plan {
    pub cycle: Cycle,
    pub sessions: Vec<Session>,
    pub maintenance_deficits: HashMap<Muscle, f64>,
    pub cumulative_effective_sets: HashMap<Muscle, f64>,
    pub maintenance_dropped: bool,
    #[serde(default)]
    pub is_deload: bool,
    #[serde(default)]
    pub pre_deload_sessions: Option<Vec<Session>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetLog {
    pub timestamp: i64,
    pub session_number: u32,
    pub block_index: usize,
    pub exercise_id: String,
    pub reps_or_seconds: u32,
    pub added_weight_kg: f64,
    pub reps_from_failure: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionExerciseSummary {
    pub exercise_id: String,
    pub exercise_name: String,
    pub sets_completed: u32,
    pub reps_or_seconds: Vec<u32>,
    pub added_weight_kg: f64,
    pub avg_rir: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletedSession {
    pub id: String,
    pub timestamp: i64,
    pub session_number: u32,
    pub focus: Vec<Muscle>,
    pub total_sets: u32,
    pub exercises_summary: Vec<SessionExerciseSummary>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WarningSeverity {
    Info,
    Notice,
    Warning,
    Alert,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Warning {
    pub code: String,
    pub muscle: Option<Muscle>,
    pub severity: WarningSeverity,
    pub message: String,
    pub lower_evidence: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WarningTierConfig {
    pub min: f64,
    pub max: Option<f64>,
    pub level: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineRules {
    pub per_session_muscle_ceiling: u32,
    pub diluted_plan_threshold: f64,
    pub insufficient_budget_threshold: f64,
    pub hard_set_max_reps_from_failure: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WarningTiersData {
    pub experienced: Vec<WarningTierConfig>,
    pub beginner_factor: f64,
    pub lower_evidence_muscles: Vec<String>,
    pub rules: EngineRules,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressionSuggestion {
    pub session_number: u32,
    pub block_index: usize,
    pub exercise_id: String,
    pub action: String,
    pub message: String,
    pub new_added_weight_kg: Option<f64>,
    pub next_exercise_id: Option<String>,
    pub new_tempo_cue: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompleteSessionResponse {
    pub suggestions: Vec<ProgressionSuggestion>,
    pub deload_cycle_completed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FullBackupPayload {
    pub version: u32,
    pub exported_at: i64,
    pub settings: Settings,
    pub profile: Profile,
    pub plan: Option<Plan>,
    pub set_logs: Vec<SetLog>,
    pub session_history: Vec<CompletedSession>,
    #[serde(default)]
    pub client_meta: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanSyncStatus {
    pub running: bool,
    pub ip: String,
    pub port: u16,
    pub pin: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_experience_level_serde_variants() {
        // Test frontend strings
        let under: ExperienceLevel = serde_json::from_str("\"under_6_months\"").unwrap();
        assert_eq!(under, ExperienceLevel::Under6Months);

        let mid: ExperienceLevel = serde_json::from_str("\"six_to_24_months\"").unwrap();
        assert_eq!(mid, ExperienceLevel::SixTo24Months);

        let over: ExperienceLevel = serde_json::from_str("\"over_2_years\"").unwrap();
        assert_eq!(over, ExperienceLevel::Over2Years);

        // Test aliases
        let under_alias: ExperienceLevel = serde_json::from_str("\"under6_months\"").unwrap();
        assert_eq!(under_alias, ExperienceLevel::Under6Months);

        let mid_alias: ExperienceLevel = serde_json::from_str("\"six_to24_months\"").unwrap();
        assert_eq!(mid_alias, ExperienceLevel::SixTo24Months);

        let over_alias: ExperienceLevel = serde_json::from_str("\"over2_years\"").unwrap();
        assert_eq!(over_alias, ExperienceLevel::Over2Years);

        // Test serialization output matches frontend
        assert_eq!(serde_json::to_string(&ExperienceLevel::Under6Months).unwrap(), "\"under_6_months\"");
        assert_eq!(serde_json::to_string(&ExperienceLevel::SixTo24Months).unwrap(), "\"six_to_24_months\"");
        assert_eq!(serde_json::to_string(&ExperienceLevel::Over2Years).unwrap(), "\"over_2_years\"");
    }

    #[test]
    fn test_legacy_settings_deserialization_defaults_rest_timer_sound() {
        let legacy_json = r#"{
            "units": "metric",
            "backpack": false,
            "bed_height_cm": 50.0,
            "priority_muscles": ["chest"],
            "maintenance_on": true,
            "experience": "six_to_24_months",
            "sets_per_day": 4,
            "days_per_week": 3.5,
            "calendar_view": false
        }"#;
        let settings: Settings = serde_json::from_str(legacy_json).expect("Legacy settings JSON should deserialize");
        assert!(settings.rest_timer_sound, "rest_timer_sound should default to true for legacy settings");
        assert_eq!(settings.enabled_equipment, default_equipment(), "enabled_equipment should default to default gear");
        assert!(!settings.weight_vest, "weight_vest should default to false");
    }
}
