use crate::models::{CompletedSession, Plan, Profile, SetLog, Settings};
use std::fs;
use std::path::{Path, PathBuf};

pub struct StorageManager {
    base_dir: PathBuf,
}

impl StorageManager {
    pub fn new<P: AsRef<Path>>(base_dir: P) -> Self {
        let base_dir = base_dir.as_ref().to_path_buf();
        if !base_dir.exists() {
            let _ = fs::create_dir_all(&base_dir);
        }
        Self { base_dir }
    }

    fn settings_path(&self) -> PathBuf {
        self.base_dir.join("settings.json")
    }

    fn profile_path(&self) -> PathBuf {
        self.base_dir.join("profile.json")
    }

    fn plan_path(&self) -> PathBuf {
        self.base_dir.join("plan.json")
    }

    fn set_log_path(&self) -> PathBuf {
        self.base_dir.join("set_log.json")
    }

    fn session_history_path(&self) -> PathBuf {
        self.base_dir.join("session_history.json")
    }

    pub fn load_settings(&self) -> Result<Settings, String> {
        let path = self.settings_path();
        if !path.exists() {
            return Ok(Settings::default());
        }
        let content =
            fs::read_to_string(&path).map_err(|e| format!("Failed to read settings: {}", e))?;
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse settings: {}", e))
    }

    pub fn save_settings(&self, settings: &Settings) -> Result<(), String> {
        let path = self.settings_path();
        let json = serde_json::to_string_pretty(settings)
            .map_err(|e| format!("Failed to serialize settings: {}", e))?;
        fs::write(&path, json).map_err(|e| format!("Failed to write settings: {}", e))
    }

    pub fn load_profile(&self) -> Result<Profile, String> {
        let path = self.profile_path();
        if !path.exists() {
            return Ok(Profile::default());
        }
        let content =
            fs::read_to_string(&path).map_err(|e| format!("Failed to read profile: {}", e))?;
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse profile: {}", e))
    }

    pub fn save_profile(&self, profile: &Profile) -> Result<(), String> {
        let path = self.profile_path();
        let json = serde_json::to_string_pretty(profile)
            .map_err(|e| format!("Failed to serialize profile: {}", e))?;
        fs::write(&path, json).map_err(|e| format!("Failed to write profile: {}", e))
    }

    pub fn load_plan(&self) -> Result<Option<Plan>, String> {
        let path = self.plan_path();
        if !path.exists() {
            return Ok(None);
        }
        let content =
            fs::read_to_string(&path).map_err(|e| format!("Failed to read plan: {}", e))?;
        let plan: Plan =
            serde_json::from_str(&content).map_err(|e| format!("Failed to parse plan: {}", e))?;
        Ok(Some(plan))
    }

    pub fn save_plan(&self, plan: &Plan) -> Result<(), String> {
        let path = self.plan_path();
        let json = serde_json::to_string_pretty(plan)
            .map_err(|e| format!("Failed to serialize plan: {}", e))?;
        fs::write(&path, json).map_err(|e| format!("Failed to write plan: {}", e))
    }

    pub fn load_set_logs(&self) -> Result<Vec<SetLog>, String> {
        let path = self.set_log_path();
        if !path.exists() {
            return Ok(Vec::new());
        }
        let content =
            fs::read_to_string(&path).map_err(|e| format!("Failed to read set log: {}", e))?;
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse set log: {}", e))
    }

    pub fn append_set_log(&self, entry: &SetLog) -> Result<(), String> {
        let mut logs = self.load_set_logs()?;
        logs.push(entry.clone());
        let path = self.set_log_path();
        let json = serde_json::to_string_pretty(&logs)
            .map_err(|e| format!("Failed to serialize set log: {}", e))?;
        fs::write(&path, json).map_err(|e| format!("Failed to write set log: {}", e))
    }

    pub fn load_session_history(&self) -> Result<Vec<CompletedSession>, String> {
        let path = self.session_history_path();
        if !path.exists() {
            return Ok(Vec::new());
        }
        let content =
            fs::read_to_string(&path).map_err(|e| format!("Failed to read session history: {}", e))?;
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse session history: {}", e))
    }

    pub fn append_completed_session(&self, entry: &CompletedSession) -> Result<(), String> {
        let mut history = self.load_session_history()?;
        history.push(entry.clone());
        let path = self.session_history_path();
        let json = serde_json::to_string_pretty(&history)
            .map_err(|e| format!("Failed to serialize session history: {}", e))?;
        fs::write(&path, json).map_err(|e| format!("Failed to write session history: {}", e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Cycle, Muscle, Session};
    use std::collections::HashMap;

    #[test]
    fn test_storage_lifecycle() {
        let temp_dir = std::env::temp_dir().join("workout_test_storage_lifecycle");
        let _ = fs::remove_dir_all(&temp_dir);

        let storage = StorageManager::new(&temp_dir);

        // 1. Settings default & save
        let default_settings = storage.load_settings().unwrap();
        assert_eq!(default_settings.sets_per_day, 4);

        let mut custom_settings = default_settings;
        custom_settings.sets_per_day = 6;
        storage.save_settings(&custom_settings).unwrap();
        let loaded_settings = storage.load_settings().unwrap();
        assert_eq!(loaded_settings.sets_per_day, 6);

        // 2. Profile default & save
        let mut profile = storage.load_profile().unwrap();
        assert_eq!(profile.body_weight_kg, 75.0);
        profile.body_weight_kg = 82.5;
        storage.save_profile(&profile).unwrap();
        let loaded_profile = storage.load_profile().unwrap();
        assert_eq!(loaded_profile.body_weight_kg, 82.5);

        // 3. Plan save & load
        assert!(storage.load_plan().unwrap().is_none());
        let plan = Plan {
            cycle: Cycle {
                length_days: 3,
                sessions_count: 2,
                effective_weekly_rate: 4.67,
                description: "2 on / 1 off".to_string(),
                is_adjusted: false,
                adjusted_message: None,
            },
            sessions: vec![Session {
                session_number: 1,
                focus: vec![Muscle::Chest],
                blocks: vec![],
            }],
            maintenance_deficits: HashMap::new(),
            cumulative_effective_sets: HashMap::new(),
            maintenance_dropped: false,
        };
        storage.save_plan(&plan).unwrap();
        let loaded_plan = storage.load_plan().unwrap().unwrap();
        assert_eq!(loaded_plan.cycle.length_days, 3);

        // 4. Set logs append & load
        assert_eq!(storage.load_set_logs().unwrap().len(), 0);
        let log = SetLog {
            timestamp: 123456789,
            session_number: 1,
            block_index: 0,
            exercise_id: "push_up".to_string(),
            reps_or_seconds: 15,
            added_weight_kg: 0.0,
            reps_from_failure: 1,
        };
        storage.append_set_log(&log).unwrap();
        let loaded_logs = storage.load_set_logs().unwrap();
        assert_eq!(loaded_logs.len(), 1);
        assert_eq!(loaded_logs[0].exercise_id, "push_up");

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
