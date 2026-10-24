import { invoke } from '@tauri-apps/api/core';
import {
  CalibrationAnswers,
  ClientSyncMeta,
  CompleteSessionResponse,
  CompletedSession,
  Exercise,
  FullBackupPayload,
  LanSyncStatus,
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
    invoke<CompleteSessionResponse>('complete_session', { session, sets }),

  applyProgression: (params: {
    sessionNumber: number;
    blockIndex: number;
    newExerciseId?: string | null;
    newAddedWeightKg?: number | null;
    newTempoCue?: string | null;
  }) => invoke<Plan>('apply_progression', params),

  restoreDeloadPlan: () => invoke<Plan>('restore_deload_plan'),

  getSessionHistory: () =>
    invoke<CompletedSession[]>('get_session_history'),

  getWarnings: () => invoke<Warning[]>('get_warnings'),

  getExercises: () => invoke<Exercise[]>('get_exercises'),

  getSetLogs: () => invoke<SetLog[]>('get_set_logs'),

  triggerDeload: () => invoke<Plan>('trigger_deload'),

  updateCompletedSession: (session: CompletedSession, sets: SetLog[]) =>
    invoke<void>('update_completed_session', { session, sets }),

  deleteCompletedSession: (id: string) =>
    invoke<void>('delete_completed_session', { id }),

  exportFullBackup: (clientMeta?: ClientSyncMeta | null) =>
    invoke<FullBackupPayload>('export_full_backup', { clientMeta }),

  importFullBackup: (payload: FullBackupPayload) =>
    invoke<FullBackupPayload>('import_full_backup', { payload }),

  startLanSyncServer: (clientMeta?: ClientSyncMeta | null) =>
    invoke<LanSyncStatus>('start_lan_sync_server', { clientMeta }),

  stopLanSyncServer: () => invoke<LanSyncStatus>('stop_lan_sync_server'),

  getLanSyncStatus: () => invoke<LanSyncStatus>('get_lan_sync_status'),

  getLanClientMeta: () => invoke<ClientSyncMeta | null>('get_lan_client_meta'),
};
