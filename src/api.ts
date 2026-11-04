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

  updateProfile: (profile: Profile) =>
    invoke<Profile>('update_profile', { profile }),

  calibrate: (answers: CalibrationAnswers) =>
    invoke<[Profile, string, number]>('calibrate', { answers }),

  getPlan: () => invoke<Plan | null>('get_plan'),

  generatePlan: () => invoke<Plan>('generate_plan'),

  getSession: (sessionNumber: number) =>
    invoke<Session | null>('get_session', { sessionNumber }),

  swapExercise: (
    sessionNumber: number,
    blockIndex: number,
    newExerciseId: string,
    addedWeightKg?: number
  ) =>
    invoke<Session>('swap_exercise', {
      sessionNumber,
      blockIndex,
      newExerciseId,
      addedWeightKg: addedWeightKg ?? 0.0,
    }),

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

  startRestTimerNotification: (
    title: string,
    text: string,
    targetEpochMillis: number
  ) =>
    invoke<void>('start_rest_timer_notification', {
      title,
      text,
      targetEpochMillis,
    }),

  cancelRestTimerNotification: () =>
    invoke<void>('cancel_rest_timer_notification'),

  adjustRestTimerNotification: (
    targetEpochMillis: number,
    text?: string
  ) =>
    invoke<void>('adjust_rest_timer_notification', {
      targetEpochMillis,
      text,
    }),

  getRestTimerStatus: () =>
    invoke<{
      is_active: boolean;
      target_epoch_millis: number;
      last_action?: string | null;
    }>('get_rest_timer_status'),
};
