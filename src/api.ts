import { invoke } from '@tauri-apps/api/core';
import {
  CalibrationAnswers,
  CompletedSession,
  Exercise,
  Plan,
  Profile,
  ProgressionSuggestion,
  Session,
  SetLog,
  Settings,
  Warning,
} from './types';

export const api = {
  getSettings: () => invoke<Settings>('get_settings'),

  updateSettings: (settings: Settings) =>
    invoke<Plan>('update_settings', { settings }),

  getProfile: () => invoke<Profile>('get_profile'),

  calibrate: (answers: CalibrationAnswers) =>
    invoke<[Profile, string, number]>('calibrate', { answers }),

  getPlan: () => invoke<Plan | null>('get_plan'),

  generatePlan: () => invoke<Plan>('generate_plan'),

  getSession: (sessionNumber: number) =>
    invoke<Session | null>('get_session', { sessionNumber }),

  swapExercise: (
    sessionNumber: number,
    blockIndex: number,
    newExerciseId: string
  ) =>
    invoke<Session>('swap_exercise', {
      sessionNumber,
      blockIndex,
      newExerciseId,
    }),

  logSet: (log: SetLog) =>
    invoke<ProgressionSuggestion | null>('log_set', { log }),

  completeSession: (session: CompletedSession, sets: SetLog[]) =>
    invoke<ProgressionSuggestion[]>('complete_session', { session, sets }),

  getSessionHistory: () =>
    invoke<CompletedSession[]>('get_session_history'),

  getWarnings: () => invoke<Warning[]>('get_warnings'),

  getExercises: () => invoke<Exercise[]>('get_exercises'),

  getSetLogs: () => invoke<SetLog[]>('get_set_logs'),

  triggerDeload: () => invoke<Plan>('trigger_deload'),

  calibrateDumbbell: (reps: number) =>
    invoke<Profile>('calibrate_dumbbell', { reps }),
};
