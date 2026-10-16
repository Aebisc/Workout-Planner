import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { ExerciseSwapModal } from '../components/ExerciseSwapModal';
import {
  CompletedSession,
  Exercise,
  Muscle,
  ProgressionSuggestion,
  Session,
  SessionExerciseSummary,
  SetLog,
  Settings,
} from '../types';
import { formatBackpackLoad } from '../utils/units';
import { registerModalBackHandler } from '../utils/androidBack';
import {
  formatTimerMMSS,
  getOptimalRestSeconds,
  playRestCompleteChime,
} from '../utils/restTimer';

interface SessionScreenProps {
  sessionNumber: number;
  settings: Settings;
  onBackToOverview: () => void;
}

export const SessionScreen: React.FC<SessionScreenProps> = ({
  sessionNumber,
  settings,
  onBackToOverview,
}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [exercises, setExercises] = useState<Record<string, Exercise>>({});
  const [loading, setLoading] = useState<boolean>(true);

  const [soundEnabled, setSoundEnabled] = useState<boolean>(
    settings.rest_timer_sound ?? true
  );

  useEffect(() => {
    setSoundEnabled(settings.rest_timer_sound ?? true);
  }, [settings.rest_timer_sound]);

  const [restTimer, setRestTimer] = useState<{
    isActive: boolean;
    isFinished: boolean;
    blockIndex: number;
    exerciseName: string;
    totalSeconds: number;
    remainingSeconds: number;
    endTimeMs: number;
    label: string;
    reason: string;
  } | null>(null);

  // Active workout session's sets: Record<blockIndex, SetLog[]>
  const [currentSessionSets, setCurrentSessionSets] = useState<Record<number, SetLog[]>>(() => {
    try {
      const saved = sessionStorage.getItem(`mgp_active_session_${sessionNumber}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Inputs for logging active set per block
  const [activeInput, setActiveInput] = useState<
    Record<number, { reps: number; rir: number }>
  >({});

  // Swap modal state
  const [swapModal, setSwapModal] = useState<{
    isOpen: boolean;
    muscle: Muscle;
    exerciseId: string;
    blockIndex: number;
  }>({
    isOpen: false,
    muscle: 'chest',
    exerciseId: '',
    blockIndex: 0,
  });

  // Finishing session state
  const [submittingSession, setSubmittingSession] = useState<boolean>(false);

  // Drift-free countdown timer effect
  useEffect(() => {
    if (!restTimer || !restTimer.isActive) return;

    const interval = window.setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((restTimer.endTimeMs - now) / 1000));

      if (remaining <= 0) {
        playRestCompleteChime(soundEnabled);
        setRestTimer((prev) =>
          prev
            ? {
                ...prev,
                isActive: false,
                isFinished: true,
                remainingSeconds: 0,
              }
            : null
        );
      } else {
        setRestTimer((prev) =>
          prev ? { ...prev, remainingSeconds: remaining } : null
        );
      }
    }, 250);

    return () => window.clearInterval(interval);
  }, [restTimer?.isActive, restTimer?.endTimeMs, soundEnabled]);

  const handleAdjustRestTimer = (deltaSeconds: number) => {
    setRestTimer((prev) => {
      if (!prev) return null;
      const now = Date.now();
      const currentRem = prev.isActive
        ? Math.max(0, Math.ceil((prev.endTimeMs - now) / 1000))
        : prev.remainingSeconds;
      const nextRem = Math.max(5, currentRem + deltaSeconds);
      const nextTotal = Math.max(prev.totalSeconds, nextRem);
      return {
        ...prev,
        isActive: true,
        isFinished: false,
        totalSeconds: nextTotal,
        remainingSeconds: nextRem,
        endTimeMs: now + nextRem * 1000,
      };
    });
  };

  const handleDismissRestTimer = () => {
    setRestTimer(null);
  };
  const [sessionCompletedSummary, setSessionCompletedSummary] = useState<{
    completedSession: CompletedSession;
    suggestions: ProgressionSuggestion[];
    deloadCycleCompleted: boolean;
  } | null>(null);

  useEffect(() => {
    if (sessionCompletedSummary) {
      return registerModalBackHandler('session-completed', () => setSessionCompletedSummary(null));
    }
  }, [sessionCompletedSummary]);

  const [appliedSuggestions, setAppliedSuggestions] = useState<Record<string, boolean>>({});
  const [restoredDeload, setRestoredDeload] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sess, allEx] = await Promise.all([
        api.getSession(sessionNumber),
        api.getExercises(),
      ]);
      setSession(sess);

      const exMap: Record<string, Exercise> = {};
      allEx.forEach((e) => (exMap[e.id] = e));
      setExercises(exMap);

      // Initialize inputs: seconds_target_min ?? rep_target_min
      if (sess) {
        const initial: Record<number, { reps: number; rir: number }> = {};
        sess.blocks.forEach((block, idx) => {
          const defaultVal = block.seconds_target_min ?? block.rep_target_min;
          initial[idx] = { reps: defaultVal, rir: 2 };
        });
        setActiveInput(initial);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`mgp_active_session_${sessionNumber}`);
      setCurrentSessionSets(saved ? JSON.parse(saved) : {});
    } catch {
      setCurrentSessionSets({});
    }
    loadData();
  }, [sessionNumber]);

  useEffect(() => {
    const key = `mgp_active_session_${sessionNumber}`;
    try {
      const allSets = Object.values(currentSessionSets).flat();
      if (allSets.length > 0) {
        if (allSets.every((s) => s.session_number === sessionNumber)) {
          sessionStorage.setItem(key, JSON.stringify(currentSessionSets));
        }
      } else {
        sessionStorage.removeItem(key);
      }
    } catch (e) {
      console.error('Failed to sync active session sets to sessionStorage', e);
    }
  }, [currentSessionSets, sessionNumber]);

  const handleAddSet = (blockIndex: number, exerciseId: string) => {
    const input = activeInput[blockIndex] || { reps: 10, rir: 2 };
    const block = session?.blocks[blockIndex];
    const ex = exercises[exerciseId];

    const newLog: SetLog = {
      timestamp: Date.now(),
      session_number: sessionNumber,
      block_index: blockIndex,
      exercise_id: exerciseId,
      reps_or_seconds: input.reps,
      added_weight_kg: block?.added_weight_kg || 0.0,
      reps_from_failure: input.rir,
    };

    setCurrentSessionSets((prev) => {
      const existing = prev[blockIndex] || [];
      return { ...prev, [blockIndex]: [...existing, newLog] };
    });

    const rec = getOptimalRestSeconds(ex, block, input.rir);
    const exName = ex ? ex.name : exerciseId.replace(/_/g, ' ');
    setRestTimer({
      isActive: true,
      isFinished: false,
      blockIndex,
      exerciseName: exName,
      totalSeconds: rec.seconds,
      remainingSeconds: rec.seconds,
      endTimeMs: Date.now() + rec.seconds * 1000,
      label: rec.label,
      reason: rec.reason,
    });
  };

  const handleRemoveSet = (blockIndex: number, setIndex: number) => {
    setCurrentSessionSets((prev) => {
      const existing = prev[blockIndex] || [];
      const updated = existing.filter((_, idx) => idx !== setIndex);
      return { ...prev, [blockIndex]: updated };
    });
  };

  const handleFinishSession = async () => {
    if (!session) return;

    const allLoggedSets: SetLog[] = Object.values(currentSessionSets).flat();
    if (allLoggedSets.length === 0) {
      alert('Please log at least one completed set before marking the session as done.');
      return;
    }

    setSubmittingSession(true);
    try {
      const exercisesSummary: SessionExerciseSummary[] = session.blocks
        .map((b, bIdx) => {
          const bLogs = currentSessionSets[bIdx] || [];
          const ex = exercises[b.exercise_id];
          const avgRir =
            bLogs.length > 0
              ? bLogs.reduce((acc, l) => acc + l.reps_from_failure, 0) / bLogs.length
              : 2.0;

          return {
            exercise_id: b.exercise_id,
            exercise_name: ex?.name || b.exercise_id.replace(/_/g, ' '),
            sets_completed: bLogs.length,
            reps_or_seconds: bLogs.map((l) => l.reps_or_seconds),
            added_weight_kg: b.added_weight_kg,
            avg_rir: avgRir,
          };
        })
        .filter((s) => s.sets_completed > 0);

      const completedSession: CompletedSession = {
        id: `sess-${session.session_number}-${Date.now()}`,
        timestamp: Date.now(),
        session_number: session.session_number,
        focus: session.focus,
        total_sets: allLoggedSets.length,
        exercises_summary: exercisesSummary,
      };

      const response = await api.completeSession(completedSession, allLoggedSets);

      try {
        sessionStorage.removeItem(`mgp_active_session_${session.session_number}`);
      } catch (e) {
        console.error('Failed to remove active session from sessionStorage', e);
      }
      setCurrentSessionSets({});
      setRestTimer(null);

      setSessionCompletedSummary({
        completedSession,
        suggestions: response.suggestions,
        deloadCycleCompleted: response.deload_cycle_completed,
      });
    } catch (err) {
      alert(`Failed to save session: ${err}`);
    } finally {
      setSubmittingSession(false);
    }
  };

  const handleApplyProgression = async (
    sugg: ProgressionSuggestion,
    params: {
      newExerciseId?: string | null;
      newAddedWeightKg?: number | null;
      newTempoCue?: string | null;
    },
    actionKey: string
  ) => {
    try {
      await api.applyProgression({
        sessionNumber: sugg.session_number,
        blockIndex: sugg.block_index,
        ...params,
      });
      setAppliedSuggestions((prev) => ({ ...prev, [actionKey]: true }));
      loadData();
    } catch (err) {
      alert(`Failed to apply progression: ${err}`);
    }
  };

  const handleRestoreDeload = async () => {
    try {
      await api.restoreDeloadPlan();
      setRestoredDeload(true);
      loadData();
    } catch (err) {
      alert(`Failed to restore deload plan: ${err}`);
    }
  };

  if (loading) {
    return <div className="card text-center">Loading session {sessionNumber}...</div>;
  }

  if (!session) {
    return (
      <div className="card text-center">
        <h3>Session {sessionNumber} not found.</h3>
        <button className="btn btn-primary mt-3" onClick={onBackToOverview}>
          Return to Plan Overview
        </button>
      </div>
    );
  }

  const totalSessionSets = session.blocks.reduce((acc, b) => acc + b.sets, 0);
  const completedSessionSets = Object.values(currentSessionSets).reduce(
    (acc, logs) => acc + logs.length,
    0
  );
  const progressPercent =
    totalSessionSets > 0
      ? Math.min(100, Math.round((completedSessionSets / totalSessionSets) * 100))
      : 0;

  return (
    <div className="session-screen-container">
      {/* Upgraded Modern Header */}
      <div className="session-header-card card">
        <div className="session-header-top">
          <div className="session-header-left">
            <button className="btn btn-outline btn-sm session-back-btn" onClick={onBackToOverview}>
              ← Back to Schedule
            </button>
            <div className="session-title-wrapper">
              <h2 className="session-title">Session {session.session_number}</h2>
              <div className="focus-pills">
                <span className="focus-label">Focus:</span>
                {session.focus.map((m) => (
                  <span key={m} className="pill pill-focus">
                    {m.toUpperCase()}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="session-header-actions">
            <button
              className="btn btn-primary btn-sm btn-header-done"
              onClick={handleFinishSession}
              disabled={submittingSession || completedSessionSets === 0}
            >
              {submittingSession ? 'Saving...' : '✓ Done'}
            </button>
          </div>
        </div>

        <div className="session-progress-bar-wrapper">
          <div className="session-progress-label">
            <span>
              {completedSessionSets} of {totalSessionSets} Total Sets Completed
            </span>
            <span>{progressPercent}%</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </div>

      {/* Active Hypertrophy Rest Timer Banner */}
      {restTimer && (
        <div
          className={`card rest-timer-banner ${
            restTimer.isFinished ? 'rest-timer-finished' : ''
          }`}
        >
          <div className="rest-timer-main">
            <div className="rest-timer-clock-wrap">
              <span className="rest-timer-icon">
                {restTimer.isFinished ? '🔔' : '⏱️'}
              </span>
              <span className="rest-timer-digits">
                {formatTimerMMSS(restTimer.remainingSeconds)}
              </span>
            </div>

            <div className="rest-timer-info">
              <div className="rest-timer-title-row">
                <strong>{restTimer.exerciseName}</strong>
                <span className="badge badge-primary">{restTimer.label}</span>
              </div>
              <p className="rest-timer-reason">
                {restTimer.isFinished
                  ? 'Recovery complete! You are ready for your next hard set.'
                  : restTimer.reason}
              </p>
            </div>

            <div className="rest-timer-actions">
              <button
                type="button"
                className="btn btn-outline btn-xs"
                onClick={() => setSoundEnabled((prev) => !prev)}
                title={soundEnabled ? 'Mute timer chime' : 'Unmute timer chime'}
              >
                {soundEnabled ? '🔊' : '🔇'}
              </button>
              <button
                type="button"
                className="btn btn-outline btn-xs"
                onClick={() => handleAdjustRestTimer(-15)}
                title="Subtract 15 seconds"
              >
                -15s
              </button>
              <button
                type="button"
                className="btn btn-outline btn-xs"
                onClick={() => handleAdjustRestTimer(15)}
                title="Add 15 seconds"
              >
                +15s
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={handleDismissRestTimer}
              >
                {restTimer.isFinished ? 'Dismiss' : 'Skip Rest'}
              </button>
            </div>
          </div>

          <div className="rest-timer-progress-track">
            <div
              className="rest-timer-progress-fill"
              style={{
                width: `${
                  restTimer.totalSeconds > 0
                    ? Math.min(
                        100,
                        ((restTimer.totalSeconds - restTimer.remainingSeconds) /
                          restTimer.totalSeconds) *
                          100
                      )
                    : 100
                }%`,
              }}
            />
          </div>
        </div>
      )}

      <div className="blocks-list">
        {session.blocks.map((block, bIdx) => {
          const ex = exercises[block.exercise_id];
          const exName = ex ? ex.name : block.exercise_id.replace(/_/g, ' ');
          const blockLogs = currentSessionSets[bIdx] || [];
          const currentInput = activeInput[bIdx] || { reps: 10, rir: 2 };
          const isBlockFinished = blockLogs.length >= block.sets;

          return (
            <div key={bIdx} className="card block-card">
              <div className="block-card-header">
                <div>
                  <h3 className="block-title">{exName}</h3>
                  <div className="block-badges">
                    <span className="badge badge-primary">{block.sets} Sets</span>
                    {block.seconds_target_min ? (
                      <span className="badge badge-info">
                        Target: {block.seconds_target_min}–{block.seconds_target_max} seconds
                      </span>
                    ) : (
                      <span className="badge badge-secondary">
                        Target: {block.rep_target_min}–{block.rep_target_max} reps
                      </span>
                    )}
                    {ex && ex.stretched_position && (
                      <span className="badge badge-accent">Stretch overload</span>
                    )}
                  </div>
                </div>

                <button
                  className="btn btn-sm btn-outline"
                  onClick={() =>
                    setSwapModal({
                      isOpen: true,
                      muscle: ex?.primary_muscle || 'chest',
                      exerciseId: block.exercise_id,
                      blockIndex: bIdx,
                    })
                  }
                >
                  ⇄ Swap Exercise
                </button>
              </div>

              {ex && <p className="block-cues"><strong>Cue:</strong> {ex.cues}</p>}

              <div className="block-instructions-grid">
                <div className="instruction-item">
                  <span className="instr-label">Effort Target:</span>
                  <span className="instr-val">{block.effort_target}</span>
                </div>
                <div className="instruction-item">
                  <span className="instr-label">Tempo:</span>
                  <span className="instr-val">{block.tempo_cue}</span>
                </div>
                <div className="instruction-item">
                  <span className="instr-label">Rest:</span>
                  <span className="instr-val">{block.rest_cue}</span>
                </div>
                {block.added_weight_kg > 0 && (
                  <div className="instruction-item highlight-weight">
                    <span className="instr-label">Added Load:</span>
                    <span className="instr-val">
                      {formatBackpackLoad(block.added_weight_kg, settings.units)}
                    </span>
                  </div>
                )}
              </div>

              {/* Set Logger Section */}
              <div className="logger-section mt-3">
                <div className="logger-header">
                  <h4>
                    Log Set ({blockLogs.length} of {block.sets} Completed)
                    {isBlockFinished && (
                      <span className="badge badge-success ml-2">✓ Prescribed Sets Met</span>
                    )}
                  </h4>
                </div>

                <div className="log-input-row">
                  <div className="input-field">
                    <label>{block.seconds_target_min ? 'Seconds Held' : 'Reps Completed'}</label>
                    <div className="stepper-group">
                      <button
                        type="button"
                        className="btn-stepper"
                        onClick={() =>
                          setActiveInput((prev) => ({
                            ...prev,
                            [bIdx]: {
                              ...currentInput,
                              reps: Math.max(1, currentInput.reps - 1),
                            },
                          }))
                        }
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min="1"
                        max="300"
                        className="stepper-input"
                        value={currentInput.reps}
                        onChange={(e) =>
                          setActiveInput((prev) => ({
                            ...prev,
                            [bIdx]: {
                              ...currentInput,
                              reps: parseInt(e.target.value) || 0,
                            },
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="btn-stepper"
                        onClick={() =>
                          setActiveInput((prev) => ({
                            ...prev,
                            [bIdx]: {
                              ...currentInput,
                              reps: currentInput.reps + 1,
                            },
                          }))
                        }
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="input-field">
                    <label>Proximity to Failure (RIR)</label>
                    <div className="segmented-control">
                      {[
                        { rir: 0, label: '0 RIR' },
                        { rir: 1, label: '1 RIR' },
                        { rir: 2, label: '2 RIR' },
                        { rir: 3, label: '3 RIR' },
                        { rir: 4, label: '4+ Easy' },
                      ].map((opt) => (
                        <button
                          key={opt.rir}
                          type="button"
                          className={`segmented-btn ${currentInput.rir === opt.rir ? 'active' : ''}`}
                          onClick={() =>
                            setActiveInput((prev) => ({
                              ...prev,
                              [bIdx]: {
                                ...currentInput,
                                rir: opt.rir,
                              },
                            }))
                          }
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {currentInput.rir >= 4 && (
                      <span className="amber-warning-text">
                        ⚠️ Sets at 4+ RIR do not count toward effective hypertrophy volume
                      </span>
                    )}
                  </div>

                  <button
                    className="btn btn-primary btn-log"
                    onClick={() => handleAddSet(bIdx, block.exercise_id)}
                  >
                    ✓ Log Set
                  </button>
                </div>

                {/* Logged Sets Badges with remove capability */}
                {blockLogs.length > 0 && (
                  <div className="logged-chips mt-2">
                    {blockLogs.map((log, lIdx) => (
                      <span
                        key={lIdx}
                        className={`chip ${
                          log.reps_from_failure <= 3 ? 'chip-success' : 'chip-warning'
                        }`}
                      >
                        Set {lIdx + 1}: {log.reps_or_seconds} {block.seconds_target_min ? 's' : 'reps'} (RIR {log.reps_from_failure})
                        <button
                          type="button"
                          className="chip-remove-btn"
                          title="Remove this set"
                          onClick={() => handleRemoveSet(bIdx, lIdx)}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Done Button Footer Section at the bottom */}
      <div className="session-finish-card card">
        <div className="session-finish-content">
          <div className="session-finish-info">
            <h3>Ready to Finish Session {session.session_number}?</h3>
            <p>
              {completedSessionSets === 0
                ? 'Log your sets above as you work out, then press Done to save this session to your history.'
                : `You have logged ${completedSessionSets} set${completedSessionSets > 1 ? 's' : ''}. Press Done to officially log this workout to your Sessions History.`}
            </p>
          </div>
          <button
            className="btn btn-primary btn-lg btn-finish-done"
            disabled={submittingSession || completedSessionSets === 0}
            onClick={handleFinishSession}
          >
            {submittingSession ? 'Saving Session...' : '✓ Done — Complete Workout'}
          </button>
        </div>
      </div>

      {/* Celebration Modal upon completing the session */}
      {sessionCompletedSummary && (
        <div className="completion-modal-overlay">
          <div className="completion-modal-card">
            <span className="completion-icon">🎉</span>
            <h2 className="completion-title">Workout Completed!</h2>
            <p className="completion-subtitle">
              Session {session.session_number} has been recorded into your Sessions History.
            </p>

            <div className="completion-summary-box">
              <div className="completion-summary-row">
                <strong>Total Sets Logged:</strong>
                <span>{sessionCompletedSummary.completedSession.total_sets} Sets</span>
              </div>
              <div className="completion-summary-row">
                <strong>Muscles Stimulated:</strong>
                <span>{sessionCompletedSummary.completedSession.focus.join(', ').toUpperCase()}</span>
              </div>
              <div className="completion-summary-row">
                <strong>Exercises Completed:</strong>
                <span>{sessionCompletedSummary.completedSession.exercises_summary.length} movements</span>
              </div>
            </div>

            {/* Deload Cycle Completion Prompt */}
            {sessionCompletedSummary.deloadCycleCompleted && (
              <div className="card mb-4 deload-complete-card">
                <div className="deload-complete-header">
                  <span className="deload-icon">🌿</span>
                  <div>
                    <h4>Lighter Cycle (Deload) Complete!</h4>
                    <p className="deload-complete-desc">
                      You've completed all scheduled sessions for your lighter deload cycle. Ready to restore your full training volume for the next cycle?
                    </p>
                  </div>
                </div>
                {restoredDeload ? (
                  <div className="badge badge-success p-2 text-center w-full mt-2">
                    ✓ Full Volume Plan Restored!
                  </div>
                ) : (
                  <button
                    className="btn btn-primary btn-sm mt-3"
                    onClick={handleRestoreDeload}
                  >
                    ⚡ Restore Full Volume Plan
                  </button>
                )}
              </div>
            )}

            {/* Structured Progression Suggestions */}
            {sessionCompletedSummary.suggestions.length > 0 && (
              <div className="progression-suggestions-section mb-4">
                <h4 className="section-title text-left mb-2">💡 Progression & Stall Guidance</h4>
                <div className="suggestions-cards-list">
                  {sessionCompletedSummary.suggestions.map((sugg, sIdx) => {
                    const exName = exercises[sugg.exercise_id]?.name || sugg.exercise_id.replace(/_/g, ' ');
                    const isStall = sugg.action === 'stall_detected';
                    const tempoKey = `${sugg.block_index}-${sugg.action}-tempo`;
                    const advanceKey = `${sugg.block_index}-${sugg.action}-advance`;
                    const backpackKey = `${sugg.block_index}-${sugg.action}-backpack`;

                    return (
                      <div
                        key={sIdx}
                        className={`card suggestion-card ${isStall ? 'stall-suggestion-card' : ''}`}
                      >
                        <div className="suggestion-card-header">
                          <strong>{exName}</strong>
                          {isStall ? (
                            <span className="badge badge-warning">⚠️ Stall Detected (3 Sessions)</span>
                          ) : (
                            <span className="badge badge-info">{sugg.action.replace(/_/g, ' ')}</span>
                          )}
                        </div>
                        <p className="suggestion-message">{sugg.message}</p>

                        <div className="suggestion-actions-row">
                          {sugg.action === 'intensify_execution' && (
                            <>
                              {appliedSuggestions[tempoKey] ? (
                                <span className="badge badge-success">✓ Applied Tempo Cue</span>
                              ) : (
                                <button
                                  className="btn btn-outline btn-sm"
                                  onClick={() =>
                                    handleApplyProgression(
                                      sugg,
                                      { newTempoCue: sugg.new_tempo_cue },
                                      tempoKey
                                    )
                                  }
                                >
                                  ⏱ Apply 3–4s Tempo & Pause Cue
                                </button>
                              )}
                              {sugg.next_exercise_id && (
                                appliedSuggestions[advanceKey] ? (
                                  <span className="badge badge-success">✓ Advanced Variation</span>
                                ) : (
                                  <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() =>
                                      handleApplyProgression(
                                        sugg,
                                        { newExerciseId: sugg.next_exercise_id },
                                        advanceKey
                                      )
                                    }
                                  >
                                    ⬆ Advance to {sugg.next_exercise_id.replace(/_/g, ' ')}
                                  </button>
                                )
                              )}
                            </>
                          )}

                          {sugg.action === 'advance_variation' && sugg.next_exercise_id && (
                            appliedSuggestions[advanceKey] ? (
                              <span className="badge badge-success">✓ Advanced Variation</span>
                            ) : (
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() =>
                                  handleApplyProgression(
                                    sugg,
                                    { newExerciseId: sugg.next_exercise_id },
                                    advanceKey
                                  )
                                }
                              >
                                ⬆ Advance to {sugg.next_exercise_id.replace(/_/g, ' ')}
                              </button>
                            )
                          )}

                          {sugg.action === 'add_backpack_weight' && sugg.new_added_weight_kg !== null && (
                            appliedSuggestions[backpackKey] ? (
                              <span className="badge badge-success">✓ Added Weight</span>
                            ) : (
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() =>
                                  handleApplyProgression(
                                    sugg,
                                    { newAddedWeightKg: sugg.new_added_weight_kg },
                                    backpackKey
                                  )
                                }
                              >
                                🎒 Add Backpack Load (+1.5 kg)
                              </button>
                            )
                          )}

                          {sugg.action === 'stall_detected' && (
                            <>
                              {appliedSuggestions[tempoKey] ? (
                                <span className="badge badge-success">✓ Applied Intensifier Cue</span>
                              ) : (
                                <button
                                  className="btn btn-outline btn-sm"
                                  onClick={() =>
                                    handleApplyProgression(
                                      sugg,
                                      { newTempoCue: sugg.new_tempo_cue },
                                      tempoKey
                                    )
                                  }
                                >
                                  ⏱ Apply Intensifier Cue
                                </button>
                              )}
                              {sugg.next_exercise_id && (
                                appliedSuggestions[advanceKey] ? (
                                  <span className="badge badge-success">✓ Swapped Exercise</span>
                                ) : (
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() =>
                                      handleApplyProgression(
                                        sugg,
                                        { newExerciseId: sugg.next_exercise_id },
                                        advanceKey
                                      )
                                    }
                                  >
                                    🔄 Swap to {sugg.next_exercise_id.replace(/_/g, ' ')}
                                  </button>
                                )
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <button className="btn btn-primary btn-block btn-lg" onClick={onBackToOverview}>
              Return to Schedule →
            </button>
          </div>
        </div>
      )}

      <ExerciseSwapModal
        isOpen={swapModal.isOpen}
        onClose={() => setSwapModal((prev) => ({ ...prev, isOpen: false }))}
        targetMuscle={swapModal.muscle}
        currentExerciseId={swapModal.exerciseId}
        sessionNumber={sessionNumber}
        blockIndex={swapModal.blockIndex}
        onSwapped={loadData}
        backpackEnabled={settings.backpack}
      />
    </div>
  );
};
