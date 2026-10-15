export type Muscle = 'chest' | 'back' | 'biceps' | 'triceps' | 'forearms' | 'abs';

export type Units = 'metric' | 'imperial';

export type ExperienceLevel = 'under_6_months' | 'six_to_24_months' | 'over_2_years';

export type WarningSeverity = 'info' | 'notice' | 'warning' | 'alert';

export interface MuscleWeights {
  chest: number;
  back: number;
  biceps: number;
  triceps: number;
  forearms: number;
  abs: number;
}

export interface BwAnchor {
  height_cm: number;
  fraction: number;
}

export interface Exercise {
  id: string;
  name: string;
  primary_muscle: Muscle;
  contribution_weights: MuscleWeights;
  equipment: string[];
  ladder: string;
  rung: number;
  easier_id: string | null;
  harder_id: string | null;
  bw_fraction: number | null;
  bw_anchors: BwAnchor[] | null;
  time_based: boolean;
  stretched_position: boolean;
  cues: string;
}

export interface Settings {
  units: Units;
  backpack: boolean;
  bed_height_cm: number;
  priority_muscles: Muscle[];
  maintenance_on: boolean;
  experience: ExperienceLevel;
  sets_per_day: number;
  days_per_week: number;
  calendar_view: boolean;
}

export interface CalibrationAnswers {
  body_weight_kg: number;
  bed_height_cm: number;
  push_ups_4_set_avg: number;
  pull_ups_4_set_avg: number;
  sets_close_to_failure: boolean;
  experience: ExperienceLevel;
}

export interface Profile {
  body_weight_kg: number;
  estimated_max_reps: Record<string, number>;
}

export interface Block {
  exercise_id: string;
  sets: number;
  rep_target_min: number;
  rep_target_max: number;
  seconds_target_min: number | null;
  seconds_target_max: number | null;
  effort_target: string;
  tempo_cue: string;
  rest_cue: string;
  added_weight_kg: number;
}

export interface Session {
  session_number: number;
  focus: Muscle[];
  blocks: Block[];
}

export interface Cycle {
  length_days: number;
  sessions_count: number;
  effective_weekly_rate: number;
  description: string;
  is_adjusted: boolean;
  adjusted_message: string | null;
}

export interface Plan {
  cycle: Cycle;
  sessions: Session[];
  maintenance_deficits: Record<Muscle, number>;
  cumulative_effective_sets: Record<Muscle, number>;
  maintenance_dropped: boolean;
  is_deload?: boolean;
  pre_deload_sessions?: Session[] | null;
}

export interface SetLog {
  timestamp: number;
  session_number: number;
  block_index: number;
  exercise_id: string;
  reps_or_seconds: number;
  added_weight_kg: number;
  reps_from_failure: number;
}

export interface Warning {
  code: string;
  muscle: Muscle | null;
  severity: WarningSeverity;
  message: string;
  lower_evidence: boolean;
}

export interface ProgressionSuggestion {
  session_number: number;
  block_index: number;
  exercise_id: string;
  action: string;
  message: string;
  new_added_weight_kg: number | null;
  next_exercise_id: string | null;
  new_tempo_cue: string | null;
}

export interface CompleteSessionResponse {
  suggestions: ProgressionSuggestion[];
  deload_cycle_completed: boolean;
}

export interface SessionExerciseSummary {
  exercise_id: string;
  exercise_name: string;
  sets_completed: number;
  reps_or_seconds: number[];
  added_weight_kg: number;
  avg_rir: number;
}

export interface CompletedSession {
  id: string;
  timestamp: number;
  session_number: number;
  focus: Muscle[];
  total_sets: number;
  exercises_summary: SessionExerciseSummary[];
}
