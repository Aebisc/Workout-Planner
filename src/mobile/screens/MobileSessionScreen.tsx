import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import {
  CompletedSession,
  Exercise,
  Muscle,
  ProgressionSuggestion,
  Session,
  SessionExerciseSummary,
  SetLog,
  Settings,
} from '../../types';
import { formatBackpackLoad } from '../../utils/units';
import {
  getOptimalRestSeconds,
  playRestCompleteChime,
} from '../../utils/restTimer';
import { BottomSheet } from '../components/BottomSheet';
import { MobileExerciseSwapSheet } from '../components/MobileExerciseSwapSheet';
import { MobileNumberPicker } from '../components/MobileNumberPicker';
import { MobileRestTimerBar, MobileRestTimerState } from '../components/MobileRestTimerBar';

interface MobileSessionScreenProps {
  sessionNumber: number;
  settings: Settings;
  onBackToOverview: () => void;
  registerBackIntercept?: (fn: () => boolean) => void;
}

export const MobileSessionScreen: React.FC<MobileSessionScreenProps> = ({
  sessionNumber,
  settings,
  onBackToOverview,
  registerBackIntercept,
}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [exercises, setExercises] = useState<Record<string, Exercise>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [activeBlockIndex, setActiveBlockIndex] = useState<number>(0);
  const [exitGuardSheetOpen, setExitGuardSheetOpen] = useState<boolean>(false);
  const pillRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const [soundEnabled, setSoundEnabled] = useState<boolean>(
    settings.rest_timer_sound ?? true
  );

  const [restTimer, setRestTimer] = useState<MobileRestTimerState | null>(null);

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
  const [swapSheet, setSwapSheet] = useState<{
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
  const [progressionSuggestions, setProgressionSuggestions] = useState<ProgressionSuggestion[]>([]);
  const [appliedSuggestions, setAppliedSuggestions] = useState<Record<string, boolean>>({});
  const [restoredDeload, setRestoredDeload] = useState<boolean>(false);
  const [completedSummary, setCompletedSummary] = useState<{
    sessionNumber: number;
    totalSets: number;
    exercises: SessionExerciseSummary[];
    deloadCycleCompleted?: boolean;
  } | null>(null);

  // Drift-free countdown timer effect (prevents infinite chime loop)
  useEffect(() => {
    if (!restTimer || !restTimer.isActive) return;

    const interval = window.setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((restTimer.endTimeMs - now) / 1000));

      if (remaining <= 0) {
        playRestCompleteChime(soundEnabled);
        try {
          navigator.vibrate?.([200, 100, 200]);
        } catch {
          // Ignore vibration if unsupported
        }
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
          prev
            ? {
                ...prev,
                remainingSeconds: remaining,
              }
            : null
        );
      }
    }, 250);

    return () => window.clearInterval(interval);
  }, [restTimer?.isActive, restTimer?.endTimeMs, soundEnabled]);

  // Auto-scroll exercise pill into view when active block changes
  useEffect(() => {
    pillRefs.current[activeBlockIndex]?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [activeBlockIndex]);

  const loadData = async () => {
    try {
      const [plan, exList] = await Promise.all([api.getPlan(), api.getExercises()]);
      const exMap: Record<string, Exercise> = {};
      exList.forEach((e) => {
        exMap[e.id] = e;
      });
      setExercises(exMap);

      if (plan) {
        const found = plan.sessions.find((s) => s.session_number === sessionNumber);
        if (found) {
          setSession(found);
          // Initialize active input defaults
          const initInput: Record<number, { reps: number; rir: number }> = {};
          found.blocks.forEach((b, idx) => {
            const ex = exMap[b.exercise_id];
            const defaultReps = ex && ex.time_based ? b.seconds_target_min || 20 : b.rep_target_min || 10;
            initInput[idx] = { reps: defaultReps, rir: 2 };
          });
          setActiveInput((prev) => {
            const next = { ...initInput };
            Object.keys(prev).forEach((k) => {
              const idx = Number(k);
              if (currentSessionSets[idx] && currentSessionSets[idx].length > 0) {
                next[idx] = prev[idx];
              }
            });
            return next;
          });
        }
      }
    } catch (err) {
      console.error('Failed to load session:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [sessionNumber]);

  // Intercept back actions if there are unsaved sets
  useEffect(() => {
    if (!registerBackIntercept) return;
    registerBackIntercept(() => {
      const hasLoggedSets = Object.values(currentSessionSets).some(
        (arr) => arr && arr.length > 0
      );
      if (hasLoggedSets && !completedSummary) {
        setExitGuardSheetOpen(true);
        return true; // Stop navigation
      }
      return false; // Proceed with navigation
    });
  }, [registerBackIntercept, currentSessionSets, completedSummary]);

  // Persist active session sets to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(
        `mgp_active_session_${sessionNumber}`,
        JSON.stringify(currentSessionSets)
      );
    } catch (e) {
      console.error(e);
    }
  }, [currentSessionSets, sessionNumber]);

  if (loading) {
    return (
      <div className="mobile-view-container no-nav" style={{ padding: '3rem 1rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--m-text-muted)' }}>Loading session...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mobile-view-container no-nav" style={{ padding: '3rem 1rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--m-red)' }}>Session not found in cycle plan.</p>
        <button type="button" className="m-btn m-btn-secondary" onClick={onBackToOverview}>
          ‹ Return to Schedule
        </button>
      </div>
    );
  }

  const activeBlock = session.blocks[activeBlockIndex] || session.blocks[0];
  const activeEx = exercises[activeBlock.exercise_id];
  const blockLogs = currentSessionSets[activeBlockIndex] || [];
  const currentInput = activeInput[activeBlockIndex] || {
    reps: activeEx && activeEx.time_based ? 30 : 10,
    rir: 2,
  };

  const handleAddSet = (blockIdx: number, exerciseId: string) => {
    const input = activeInput[blockIdx] || { reps: 10, rir: 2 };
    if (input.reps <= 0) return;

    const newLog: SetLog = {
      timestamp: Date.now(),
      session_number: session.session_number,
      block_index: blockIdx,
      exercise_id: exerciseId,
      reps_or_seconds: input.reps,
      added_weight_kg: activeBlock.added_weight_kg || 0,
      reps_from_failure: input.rir,
    };

    setCurrentSessionSets((prev) => ({
      ...prev,
      [blockIdx]: [...(prev[blockIdx] || []), newLog],
    }));

    // Trigger Rest Timer
    const ex = exercises[exerciseId];
    const { seconds, label, reason } = getOptimalRestSeconds(ex, activeBlock, input.rir);
    setRestTimer({
      isActive: true,
      isFinished: false,
      blockIndex: blockIdx,
      exerciseName: ex ? ex.name : exerciseId.replace(/_/g, ' '),
      totalSeconds: seconds,
      remainingSeconds: seconds,
      endTimeMs: Date.now() + seconds * 1000,
      label,
      reason,
    });
  };

  const handleRemoveSet = (blockIdx: number, setIdx: number) => {
    setCurrentSessionSets((prev) => {
      const list = [...(prev[blockIdx] || [])];
      list.splice(setIdx, 1);
      return { ...prev, [blockIdx]: list };
    });
  };

  const handleAdjustTimer = (delta: number) => {
    if (!restTimer) return;
    const currentRemaining = restTimer.isActive
      ? Math.max(0, Math.ceil((restTimer.endTimeMs - Date.now()) / 1000))
      : restTimer.remainingSeconds;
    const newRemaining = Math.max(5, currentRemaining + delta);
    setRestTimer({
      ...restTimer,
      isActive: true,
      isFinished: false,
      remainingSeconds: newRemaining,
      endTimeMs: Date.now() + newRemaining * 1000,
    });
  };

  const handleFinishWorkout = async () => {
    const allLoggedSets: SetLog[] = Object.values(currentSessionSets).flat();
    if (allLoggedSets.length === 0) {
      alert('Please log at least one completed set before finishing the workout.');
      return;
    }

    setSubmittingSession(true);

    const summaries: SessionExerciseSummary[] = session.blocks
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

    const completedSess: CompletedSession = {
      id: `sess-${session.session_number}-${Date.now()}`,
      timestamp: Date.now(),
      session_number: session.session_number,
      focus: session.focus,
      total_sets: allLoggedSets.length,
      exercises_summary: summaries,
    };

    try {
      const response = await api.completeSession(completedSess, allLoggedSets);
      setProgressionSuggestions(response.suggestions || []);
      sessionStorage.removeItem(`mgp_active_session_${sessionNumber}`);
      setCurrentSessionSets({});
      setRestTimer(null);
      setCompletedSummary({
        sessionNumber: session.session_number,
        totalSets: allLoggedSets.length,
        exercises: summaries,
        deloadCycleCompleted: response.deload_cycle_completed,
      });
    } catch (err) {
      alert(`Failed to save session: ${err}`);
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
      await loadData();
    } catch (err) {
      alert(`Failed to apply progression: ${err}`);
    }
  };

  const handleRestoreDeload = async () => {
    try {
      await api.restoreDeloadPlan();
      setRestoredDeload(true);
      await loadData();
    } catch (err) {
      alert(`Failed to restore deload plan: ${err}`);
    }
  };

  const handleSwapSelected = async (newExId: string) => {
    try {
      await api.swapExercise(session.session_number, swapSheet.blockIndex, newExId);
      await loadData();
    } catch (err) {
      alert(`Swap failed: ${err}`);
    }
  };

  const totalSessionSets = session.blocks.reduce((acc, b) => acc + b.sets, 0);
  const completedSessionSets = Object.values(currentSessionSets).reduce(
    (acc, list) => acc + list.length,
    0
  );

  return (
    <div className="mobile-view-container no-nav">
      {/* Top Session Progress Bar */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--m-text-muted)', marginBottom: '0.35rem' }}>
          <span>
            Set {completedSessionSets} of {totalSessionSets} Completed
          </span>
          <span style={{ fontWeight: 700, color: 'var(--m-cyan)' }}>
            {Math.round((completedSessionSets / Math.max(1, totalSessionSets)) * 100)}%
          </span>
        </div>
        <div className="m-vol-bar-track">
          <div
            className="m-vol-bar-fill"
            style={{
              width: `${(completedSessionSets / Math.max(1, totalSessionSets)) * 100}%`,
              background: 'linear-gradient(90deg, var(--m-primary), var(--m-cyan))',
            }}
          />
        </div>
      </div>

      {/* Horizontal Exercise Selector Pills */}
      <div className="m-exercise-nav">
        {session.blocks.map((b, idx) => {
          const ex = exercises[b.exercise_id];
          const setsCount = (currentSessionSets[idx] || []).length;
          const isDone = setsCount >= b.sets;
          return (
            <button
              key={idx}
              ref={(el) => {
                pillRefs.current[idx] = el;
              }}
              type="button"
              className={`m-ex-pill ${activeBlockIndex === idx ? 'active' : ''} ${isDone ? 'completed' : ''}`}
              onClick={() => setActiveBlockIndex(idx)}
            >
              <span>{isDone ? '✓' : `${idx + 1}.`}</span>
              <span>{ex ? ex.name : b.exercise_id.replace(/_/g, ' ')}</span>
              <span style={{ opacity: 0.75, fontSize: '0.75rem' }}>
                ({setsCount}/{b.sets})
              </span>
            </button>
          );
        })}
      </div>

      {/* Current Active Exercise Card */}
      <div className="m-card" style={{ border: '1px solid var(--m-border-active)', padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, paddingRight: '0.5rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--m-primary)', textTransform: 'uppercase' }}>
              Exercise {activeBlockIndex + 1} of {session.blocks.length}
            </span>
            <h3 style={{ fontSize: '1.35rem', fontWeight: 800, margin: '0.2rem 0' }}>
              {activeEx ? activeEx.name : activeBlock.exercise_id.replace(/_/g, ' ')}
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.4rem' }}>
              <span style={{ fontSize: '0.75rem', background: 'rgba(99, 102, 241, 0.2)', color: 'var(--m-primary)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 700 }}>
                {activeBlock.sets} sets • {activeEx && activeEx.time_based ? `${activeBlock.seconds_target_min}-${activeBlock.seconds_target_max}s` : `${activeBlock.rep_target_min}-${activeBlock.rep_target_max} reps`}
              </span>
              <span style={{ fontSize: '0.75rem', background: 'rgba(255, 255, 255, 0.08)', color: 'var(--m-text-muted)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                {activeBlock.tempo_cue}
              </span>
            </div>

            {/* Rest Target and Form Cues */}
            {activeBlock.rest_cue && (
              <div style={{ fontSize: '0.78rem', color: 'var(--m-cyan)', marginTop: '0.45rem', fontWeight: 600 }}>
                ⏱️ Rest: {activeBlock.rest_cue}
              </div>
            )}
            {activeEx && activeEx.cues && (
              <div style={{ fontSize: '0.78rem', color: 'var(--m-text-muted)', marginTop: '0.35rem', fontStyle: 'italic', lineHeight: 1.35 }}>
                💡 {activeEx.cues}
              </div>
            )}
          </div>

          <button
            type="button"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              color: 'var(--m-cyan)',
              fontSize: '0.78rem',
              fontWeight: 700,
              padding: '0.4rem 0.65rem',
              borderRadius: 'var(--m-radius-sm)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            onClick={() =>
              setSwapSheet({
                isOpen: true,
                muscle: activeEx ? activeEx.primary_muscle : 'chest',
                exerciseId: activeBlock.exercise_id,
                blockIndex: activeBlockIndex,
              })
            }
          >
            Swap 🔄
          </button>
        </div>

        {activeBlock.added_weight_kg > 0 && (
          <div
            style={{
              margin: '0.85rem 0',
              padding: '0.5rem 0.75rem',
              borderRadius: 'var(--m-radius-sm)',
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: 'var(--m-green)',
              fontSize: '0.85rem',
              fontWeight: 700,
            }}
          >
            {activeBlock.added_weight_kg === 10.0 && activeEx?.primary_muscle === 'back' ? '🦺' : '🎒'} Added Load:{' '}
            {formatBackpackLoad(
              activeBlock.added_weight_kg,
              settings.units,
              activeEx?.primary_muscle === 'back'
            )}
          </div>
        )}

        {/* Set Logger Controls */}
        <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--m-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--m-text-main)' }}>
              Set {blockLogs.length + 1} of {activeBlock.sets}
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--m-text-subtle)' }}>
              Target: {activeBlock.effort_target}
            </span>
          </div>

          <MobileNumberPicker
            label={activeEx && activeEx.time_based ? 'Seconds Held' : 'Reps Completed'}
            value={currentInput.reps}
            unit={activeEx && activeEx.time_based ? 's' : 'reps'}
            min={1}
            max={300}
            step={1}
            quickStep={5}
            onChange={(val) =>
              setActiveInput((prev) => ({
                ...prev,
                [activeBlockIndex]: { ...currentInput, reps: val },
              }))
            }
            id={`reps-${activeBlockIndex}`}
          />

          <div style={{ marginTop: '1rem' }}>
            <label className="m-picker-label">Proximity to Failure (RIR)</label>
            <div className="m-rir-group">
              {[
                { rir: 0, label: '0 RIR', sub: 'Max' },
                { rir: 1, label: '1 RIR', sub: 'Hard' },
                { rir: 2, label: '2 RIR', sub: 'Solid' },
                { rir: 3, label: '3 RIR', sub: 'Mod' },
                { rir: 4, label: '4+ RIR', sub: 'Easy' },
              ].map((opt) => (
                <button
                  key={opt.rir}
                  type="button"
                  className={`m-rir-btn ${currentInput.rir === opt.rir ? 'active' : ''}`}
                  onClick={() =>
                    setActiveInput((prev) => ({
                      ...prev,
                      [activeBlockIndex]: { ...currentInput, rir: opt.rir },
                    }))
                  }
                >
                  <span>{opt.label}</span>
                  <span className="m-rir-sub">{opt.sub}</span>
                </button>
              ))}
            </div>

            {/* 4+ RIR Notice */}
            {currentInput.rir >= 4 && (
              <div
                style={{
                  marginTop: '0.65rem',
                  padding: '0.45rem 0.75rem',
                  borderRadius: 'var(--m-radius-sm)',
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  color: 'var(--m-amber)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  lineHeight: 1.35,
                }}
              >
                ⚠️ Sets at 4+ RIR do not count toward effective hypertrophy volume.
              </div>
            )}
          </div>

          <button
            type="button"
            className="m-btn m-btn-primary"
            style={{ marginTop: '1.25rem', height: '54px', fontSize: '1.05rem' }}
            onClick={() => handleAddSet(activeBlockIndex, activeBlock.exercise_id)}
          >
            ✓ Log Set {blockLogs.length + 1}
          </button>
        </div>

        {/* Logged Sets List for this Exercise */}
        {blockLogs.length > 0 && (
          <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {blockLogs.map((log, lIdx) => (
              <span
                key={lIdx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.35rem 0.65rem',
                  borderRadius: '999px',
                  background: log.reps_from_failure <= 3 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                  color: log.reps_from_failure <= 3 ? '#34d399' : '#fbbf24',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                }}
              >
                Set {lIdx + 1}: {log.reps_or_seconds} {activeEx && activeEx.time_based ? 's' : 'r'} (RIR {log.reps_from_failure})
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    padding: '0 0.15rem',
                    fontSize: '0.9rem',
                  }}
                  onClick={() => handleRemoveSet(activeBlockIndex, lIdx)}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Next Exercise Quick Transition Button */}
        {blockLogs.length >= activeBlock.sets && activeBlockIndex < session.blocks.length - 1 && (
          <button
            type="button"
            className="m-btn m-btn-secondary"
            style={{
              marginTop: '1rem',
              width: '100%',
              height: '48px',
              fontWeight: 800,
              border: '1px solid var(--m-primary)',
              color: 'var(--m-cyan)',
              background: 'rgba(99, 102, 241, 0.15)',
            }}
            onClick={() => setActiveBlockIndex((prev) => prev + 1)}
          >
            Next Exercise: {exercises[session.blocks[activeBlockIndex + 1]?.exercise_id]?.name || session.blocks[activeBlockIndex + 1]?.exercise_id.replace(/_/g, ' ')} →
          </button>
        )}
      </div>

      {/* Finish Workout Action */}
      <div style={{ marginTop: '1.5rem', marginBottom: restTimer ? '6.5rem' : '2.5rem' }}>
        <button
          type="button"
          className="m-btn m-btn-success"
          style={{ height: '54px' }}
          onClick={handleFinishWorkout}
          disabled={submittingSession}
        >
          {submittingSession ? 'Saving Workout...' : '✓ Finish & Complete Workout'}
        </button>
      </div>

      {/* Floating Rest Timer */}
      <MobileRestTimerBar
        timer={restTimer}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((prev) => !prev)}
        onAdjustTimer={handleAdjustTimer}
        onDismiss={() => setRestTimer(null)}
      />

      {/* Exercise Swap Sheet */}
      <MobileExerciseSwapSheet
        isOpen={swapSheet.isOpen}
        onClose={() => setSwapSheet((prev) => ({ ...prev, isOpen: false }))}
        muscle={swapSheet.muscle}
        currentExerciseId={swapSheet.exerciseId}
        onSwapSelected={handleSwapSelected}
        backpackEnabled={settings.backpack}
      />

      {/* Exit Guard Bottom Sheet */}
      <BottomSheet
        isOpen={exitGuardSheetOpen}
        onClose={() => setExitGuardSheetOpen(false)}
        title="Workout In Progress ⏸"
        id="session-exit-guard-sheet"
      >
        <div style={{ textAlign: 'center', margin: '0.5rem 0 1.25rem' }}>
          <p style={{ color: 'var(--m-text-main)', fontSize: '0.95rem', margin: '0 0 0.5rem' }}>
            You have <strong>{completedSessionSets}</strong> sets logged in Session {session.session_number}.
          </p>
          <p style={{ color: 'var(--m-text-muted)', fontSize: '0.85rem', margin: 0 }}>
            Would you like to finish and save now, pause and keep your draft, or discard this session?
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button
            type="button"
            className="m-btn m-btn-success"
            style={{ height: '48px', fontSize: '0.95rem' }}
            onClick={async () => {
              setExitGuardSheetOpen(false);
              await handleFinishWorkout();
            }}
          >
            ✓ Finish & Save Session
          </button>
          <button
            type="button"
            className="m-btn m-btn-primary"
            style={{ height: '48px', fontSize: '0.95rem' }}
            onClick={() => {
              setExitGuardSheetOpen(false);
              onBackToOverview();
            }}
          >
            ⏸ Pause Workout (Keep Draft)
          </button>
          <button
            type="button"
            className="m-btn m-btn-secondary"
            style={{ height: '44px', fontSize: '0.88rem', color: 'var(--m-red)' }}
            onClick={() => {
              try {
                sessionStorage.removeItem(`mgp_active_session_${sessionNumber}`);
              } catch {}
              setCurrentSessionSets({});
              setExitGuardSheetOpen(false);
              onBackToOverview();
            }}
          >
            🗑 Discard Draft Sets
          </button>
          <button
            type="button"
            className="m-btn m-btn-secondary"
            style={{ height: '44px', fontSize: '0.88rem' }}
            onClick={() => setExitGuardSheetOpen(false)}
          >
            Continue Workout
          </button>
        </div>
      </BottomSheet>

      {/* Completion Celebration Bottom Sheet */}
      <BottomSheet
        isOpen={!!completedSummary}
        onClose={onBackToOverview}
        title="Workout Complete! 🎉"
        id="completion-sheet"
      >
        <div style={{ textAlign: 'center', margin: '1rem 0' }}>
          <div style={{ fontSize: '3rem' }}>🏆</div>
          <h3 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0.5rem 0' }}>
            Great Session!
          </h3>
          <p style={{ color: 'var(--m-text-muted)', fontSize: '0.9rem' }}>
            You completed {completedSummary?.totalSets} hypertrophy sets across {completedSummary?.exercises.length} exercises.
          </p>
        </div>

        {/* Deload Completed Notification & Restore Action */}
        {completedSummary?.deloadCycleCompleted && (
          <div
            className="m-card"
            style={{
              background: 'rgba(6, 182, 212, 0.15)',
              border: '1px solid rgba(6, 182, 212, 0.4)',
              marginBottom: '1rem',
              padding: '1rem',
            }}
          >
            <h4 style={{ color: 'var(--m-cyan)', margin: '0 0 0.5rem' }}>
              Deload Cycle Complete! 🔄
            </h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--m-text-main)', margin: '0 0 0.75rem' }}>
              You have completed your lighter recovery cycle. Ready to return to full training volume?
            </p>
            {restoredDeload ? (
              <span style={{ color: 'var(--m-green)', fontWeight: 700, fontSize: '0.85rem' }}>
                ✓ Full Volume Plan Restored!
              </span>
            ) : (
              <button
                type="button"
                className="m-btn m-btn-primary"
                style={{ width: '100%', height: '42px', fontSize: '0.88rem' }}
                onClick={handleRestoreDeload}
              >
                Restore Full Volume Plan
              </button>
            )}
          </div>
        )}

        {/* Progression Suggestions with 1-Click Interactive Buttons */}
        {progressionSuggestions.length > 0 && (
          <div className="m-card" style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', marginBottom: '1rem' }}>
            <h4 style={{ color: 'var(--m-green)', margin: '0 0 0.5rem' }}>
              Progression Earned! 🚀
            </h4>
            {progressionSuggestions.map((sug, sIdx) => {
              const tempoKey = `${sug.session_number}-${sug.block_index}-tempo`;
              const advanceKey = `${sug.session_number}-${sug.block_index}-advance`;
              const backpackKey = `${sug.session_number}-${sug.block_index}-backpack`;
              const targetBlock = session.blocks[sug.block_index];
              const targetEx = targetBlock ? exercises[targetBlock.exercise_id] : undefined;
              const exName = targetEx?.name || targetBlock?.exercise_id?.replace(/_/g, ' ') || 'Exercise';

              return (
                <div key={sIdx} style={{ padding: '0.65rem 0', borderBottom: sIdx < progressionSuggestions.length - 1 ? '1px solid var(--m-border)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--m-cyan)' }}>
                      {exName}
                    </span>
                    <span style={{ fontSize: '0.72rem', background: 'rgba(99, 102, 241, 0.2)', color: 'var(--m-primary)', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 700 }}>
                      Block {sug.block_index + 1}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.85rem', margin: '0 0 0.5rem', color: 'var(--m-text-main)' }}>
                    • <strong>{sug.action.replace(/_/g, ' ')}:</strong> {sug.message}
                  </p>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {(sug.action === 'intensify_execution' || sug.action === 'add_intensifiers') && (
                      <>
                        {appliedSuggestions[tempoKey] ? (
                          <span style={{ color: 'var(--m-green)', fontWeight: 700, fontSize: '0.8rem' }}>✓ Applied Tempo Cue</span>
                        ) : (
                          <button
                            type="button"
                            className="m-btn m-btn-secondary"
                            style={{ height: '36px', fontSize: '0.78rem', padding: '0 0.75rem' }}
                            onClick={() =>
                              handleApplyProgression(
                                sug,
                                { newTempoCue: sug.new_tempo_cue },
                                tempoKey
                              )
                            }
                          >
                            Apply 3–4s Tempo & Pause Cue
                          </button>
                        )}
                        {sug.next_exercise_id && (
                          appliedSuggestions[advanceKey] ? (
                            <span style={{ color: 'var(--m-green)', fontWeight: 700, fontSize: '0.8rem' }}>✓ Advanced Variation</span>
                          ) : (
                            <button
                              type="button"
                              className="m-btn m-btn-primary"
                              style={{ height: '36px', fontSize: '0.78rem', padding: '0 0.75rem' }}
                              onClick={() =>
                                handleApplyProgression(
                                  sug,
                                  { newExerciseId: sug.next_exercise_id },
                                  advanceKey
                                )
                              }
                            >
                              ⬆ Advance to {sug.next_exercise_id.replace(/_/g, ' ')}
                            </button>
                          )
                        )}
                      </>
                    )}

                    {sug.action === 'advance_variation' && sug.next_exercise_id && (
                      appliedSuggestions[advanceKey] ? (
                        <span style={{ color: 'var(--m-green)', fontWeight: 700, fontSize: '0.8rem' }}>✓ Advanced Variation</span>
                      ) : (
                        <button
                          type="button"
                          className="m-btn m-btn-primary"
                          style={{ height: '36px', fontSize: '0.78rem', padding: '0 0.75rem' }}
                          onClick={() =>
                            handleApplyProgression(
                              sug,
                              { newExerciseId: sug.next_exercise_id },
                              advanceKey
                            )
                          }
                        >
                          ⬆ Advance to {sug.next_exercise_id.replace(/_/g, ' ')}
                        </button>
                      )
                    )}

                    {sug.action === 'add_weight_vest' && sug.new_added_weight_kg !== null && (
                      appliedSuggestions[backpackKey] ? (
                        <span style={{ color: 'var(--m-green)', fontWeight: 700, fontSize: '0.8rem' }}>✓ Equipped 10kg Vest</span>
                      ) : (
                        <button
                          type="button"
                          className="m-btn m-btn-primary"
                          style={{ height: '36px', fontSize: '0.78rem', padding: '0 0.75rem' }}
                          onClick={() =>
                            handleApplyProgression(
                              sug,
                              {
                                newAddedWeightKg: sug.new_added_weight_kg,
                                newTempoCue: sug.new_tempo_cue,
                              },
                              backpackKey
                            )
                          }
                        >
                          🦺 Equip 10kg Weight Vest (+10 kg)
                        </button>
                      )
                    )}

                    {sug.action === 'add_backpack_weight' && sug.new_added_weight_kg !== null && (
                      appliedSuggestions[backpackKey] ? (
                        <span style={{ color: 'var(--m-green)', fontWeight: 700, fontSize: '0.8rem' }}>✓ Added Weight</span>
                      ) : (
                        <button
                          type="button"
                          className="m-btn m-btn-primary"
                          style={{ height: '36px', fontSize: '0.78rem', padding: '0 0.75rem' }}
                          onClick={() =>
                            handleApplyProgression(
                              sug,
                              { newAddedWeightKg: sug.new_added_weight_kg },
                              backpackKey
                            )
                          }
                        >
                          🎒 Add Backpack Load (+1.5 kg)
                        </button>
                      )
                    )}

                    {sug.action === 'stall_detected' && (
                      <>
                        {appliedSuggestions[tempoKey] ? (
                          <span style={{ color: 'var(--m-green)', fontWeight: 700, fontSize: '0.8rem' }}>✓ Applied Intensifier Cue</span>
                        ) : (
                          <button
                            type="button"
                            className="m-btn m-btn-secondary"
                            style={{ height: '36px', fontSize: '0.78rem', padding: '0 0.75rem' }}
                            onClick={() =>
                              handleApplyProgression(
                                sug,
                                { newTempoCue: sug.new_tempo_cue },
                                tempoKey
                              )
                            }
                          >
                            ⏱ Apply Intensifier Cue
                          </button>
                        )}
                        {sug.next_exercise_id && (
                          appliedSuggestions[advanceKey] ? (
                            <span style={{ color: 'var(--m-green)', fontWeight: 700, fontSize: '0.8rem' }}>✓ Swapped Exercise</span>
                          ) : (
                            <button
                              type="button"
                              className="m-btn m-btn-primary"
                              style={{ height: '36px', fontSize: '0.78rem', padding: '0 0.75rem' }}
                              onClick={() =>
                                handleApplyProgression(
                                  sug,
                                  { newExerciseId: sug.next_exercise_id },
                                  advanceKey
                                )
                              }
                            >
                              🔄 Swap to {sug.next_exercise_id.replace(/_/g, ' ')}
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
        )}

        <button
          type="button"
          className="m-btn m-btn-primary"
          style={{ marginTop: '1rem', width: '100%', height: '48px' }}
          onClick={onBackToOverview}
        >
          Back to Workouts ›
        </button>
      </BottomSheet>
    </div>
  );
};
