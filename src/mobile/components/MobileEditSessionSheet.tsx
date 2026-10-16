import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import { CompletedSession, Exercise, Plan, SessionExerciseSummary, SetLog, Units } from '../../types';
import { toLocalDateKey } from '../../utils/cycle';
import { BottomSheet } from './BottomSheet';

const KG_TO_LB = 2.20462;

interface ExerciseFormItem {
  exercise_id: string;
  exercise_name: string;
  added_weight_kg: number;
  sets: Array<{
    reps: number;
    rir: number;
  }>;
}

interface MobileEditSessionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  sessionToEdit: CompletedSession | null;
  initialDate?: string;
  initialSessionNumber?: number;
  plan?: Plan;
  units?: Units;
  onSaved: () => void;
}

export const MobileEditSessionSheet: React.FC<MobileEditSessionSheetProps> = ({
  isOpen,
  onClose,
  sessionToEdit,
  initialDate,
  initialSessionNumber,
  plan,
  units = 'metric',
  onSaved,
}) => {
  const [workoutDate, setWorkoutDate] = useState<string>('');
  const [sessionNum, setSessionNum] = useState<number>(1);
  const [exerciseForms, setExerciseForms] = useState<ExerciseFormItem[]>([]);
  const [exercisesMap, setExercisesMap] = useState<Record<string, Exercise>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    api.getExercises()
      .then((list) => {
        const map: Record<string, Exercise> = {};
        list.forEach((e) => {
          map[e.id] = e;
        });
        setExercisesMap(map);
      })
      .catch(console.error);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    if (sessionToEdit) {
      const d = new Date(sessionToEdit.timestamp);
      setWorkoutDate(toLocalDateKey(d));
      setSessionNum(sessionToEdit.session_number);

      // Attempt to load exact set logs for accurate per-set RIR and added_weight_kg
      api.getSetLogs()
        .then((allLogs) => {
          const sessionLogs = allLogs.filter(
            (l) =>
              l.session_number === sessionToEdit.session_number &&
              Math.abs(l.timestamp - sessionToEdit.timestamp) < 43_200_000
          );

          if (sessionLogs.length > 0) {
            sessionLogs.sort((a, b) => a.block_index - b.block_index);
            const grouped: Record<string, SetLog[]> = {};
            const exerciseOrder: string[] = [];
            sessionLogs.forEach((l) => {
              if (!grouped[l.exercise_id]) {
                grouped[l.exercise_id] = [];
                exerciseOrder.push(l.exercise_id);
              }
              grouped[l.exercise_id].push(l);
            });

            const summaryOrder = sessionToEdit.exercises_summary.map((s) => s.exercise_id);
            const orderedIds = [
              ...summaryOrder.filter((id) => grouped[id]),
              ...exerciseOrder.filter((id) => !summaryOrder.includes(id)),
            ];

            const forms: ExerciseFormItem[] = orderedIds.map((exId) => {
              const logs = grouped[exId];
              const summary = sessionToEdit.exercises_summary.find((s) => s.exercise_id === exId);
              return {
                exercise_id: exId,
                exercise_name: summary?.exercise_name || exId.replace(/_/g, ' '),
                added_weight_kg: logs[0]?.added_weight_kg ?? summary?.added_weight_kg ?? 0,
                sets: logs.map((l) => ({
                  reps: l.reps_or_seconds,
                  rir: l.reps_from_failure,
                })),
              };
            });
            setExerciseForms(forms);
          } else {
            // Fall back to exercises_summary
            const forms: ExerciseFormItem[] = sessionToEdit.exercises_summary.map((summary) => ({
              exercise_id: summary.exercise_id,
              exercise_name: summary.exercise_name,
              added_weight_kg: summary.added_weight_kg || 0,
              sets: summary.reps_or_seconds.map((reps) => ({
                reps,
                rir: Math.round(summary.avg_rir || 2),
              })),
            }));
            setExerciseForms(forms);
          }
        })
        .catch(() => {
          const forms: ExerciseFormItem[] = sessionToEdit.exercises_summary.map((summary) => ({
            exercise_id: summary.exercise_id,
            exercise_name: summary.exercise_name,
            added_weight_kg: summary.added_weight_kg || 0,
            sets: summary.reps_or_seconds.map((reps) => ({
              reps,
              rir: Math.round(summary.avg_rir || 2),
            })),
          }));
          setExerciseForms(forms);
        });
    } else if (initialSessionNumber && plan) {
      // Backfill new past workout
      const targetDate = initialDate || toLocalDateKey(new Date());
      setWorkoutDate(targetDate);
      setSessionNum(initialSessionNumber);

      const targetSession = plan.sessions.find((s) => s.session_number === initialSessionNumber);
      if (targetSession) {
        const forms: ExerciseFormItem[] = targetSession.blocks.map((b) => {
          const ex = exercisesMap[b.exercise_id];
          return {
            exercise_id: b.exercise_id,
            exercise_name: ex?.name || b.exercise_id.replace(/_/g, ' '),
            added_weight_kg: b.added_weight_kg || 0,
            sets: Array.from({ length: Math.max(1, b.sets) }, () => ({
              reps: b.seconds_target_min ?? b.rep_target_min ?? 10,
              rir: 2,
            })),
          };
        });
        setExerciseForms(forms);
      }
    }
  }, [isOpen, sessionToEdit, initialDate, initialSessionNumber, plan, exercisesMap]);

  if (!isOpen) return null;

  const handleUpdateReps = (exIdx: number, setIdx: number, val: number) => {
    setExerciseForms((prev) => {
      const clone = JSON.parse(JSON.stringify(prev)) as ExerciseFormItem[];
      if (clone[exIdx] && clone[exIdx].sets[setIdx]) {
        clone[exIdx].sets[setIdx].reps = Math.max(1, val);
      }
      return clone;
    });
  };

  const handleCycleRir = (exIdx: number, setIdx: number) => {
    setExerciseForms((prev) => {
      const clone = JSON.parse(JSON.stringify(prev)) as ExerciseFormItem[];
      if (clone[exIdx] && clone[exIdx].sets[setIdx]) {
        const currentRir = clone[exIdx].sets[setIdx].rir;
        clone[exIdx].sets[setIdx].rir = (currentRir + 1) % 5; // 0, 1, 2, 3, 4
      }
      return clone;
    });
  };

  const handleAddSet = (exIdx: number) => {
    setExerciseForms((prev) => {
      const clone = JSON.parse(JSON.stringify(prev)) as ExerciseFormItem[];
      if (clone[exIdx]) {
        const lastSet = clone[exIdx].sets[clone[exIdx].sets.length - 1];
        clone[exIdx].sets.push({
          reps: lastSet ? lastSet.reps : 10,
          rir: lastSet ? lastSet.rir : 2,
        });
      }
      return clone;
    });
  };

  const handleRemoveSet = (exIdx: number, setIdx: number) => {
    setExerciseForms((prev) => {
      const clone = JSON.parse(JSON.stringify(prev)) as ExerciseFormItem[];
      if (clone[exIdx] && clone[exIdx].sets.length > 1) {
        clone[exIdx].sets.splice(setIdx, 1);
      }
      return clone;
    });
  };

  const handleSave = async () => {
    setSaving(true);

    const [y, m, d] = (workoutDate || toLocalDateKey(new Date())).split('-').map(Number);
    const dateTimestamp = new Date(y, (m || 1) - 1, d || 1, 12, 0, 0).getTime();

    // Reconstruct exercises summary and SetLog flat list
    const reconstructedSets: SetLog[] = [];
    const summaries: SessionExerciseSummary[] = [];

    exerciseForms.forEach((exForm, bIdx) => {
      if (exForm.sets.length === 0) return;
      const repsList = exForm.sets.map((s) => s.reps);
      const avgRir = exForm.sets.reduce((acc, s) => acc + s.rir, 0) / exForm.sets.length;

      summaries.push({
        exercise_id: exForm.exercise_id,
        exercise_name: exForm.exercise_name,
        sets_completed: exForm.sets.length,
        reps_or_seconds: repsList,
        added_weight_kg: exForm.added_weight_kg,
        avg_rir: avgRir,
      });

      exForm.sets.forEach((s) => {
        reconstructedSets.push({
          timestamp: dateTimestamp,
          session_number: sessionNum,
          block_index: bIdx,
          exercise_id: exForm.exercise_id,
          reps_or_seconds: s.reps,
          added_weight_kg: exForm.added_weight_kg,
          reps_from_failure: s.rir,
        });
      });
    });

    const targetSession = plan?.sessions.find((s) => s.session_number === sessionNum);
    const focus = sessionToEdit?.focus || targetSession?.focus || ['chest'];

    const targetCompletedSession: CompletedSession = {
      id: sessionToEdit ? sessionToEdit.id : `sess-${sessionNum}-${dateTimestamp}`,
      timestamp: dateTimestamp,
      session_number: sessionNum,
      focus,
      total_sets: reconstructedSets.length,
      exercises_summary: summaries,
    };

    try {
      if (sessionToEdit) {
        await api.updateCompletedSession(targetCompletedSession, reconstructedSets);
      } else {
        await api.completeSession(targetCompletedSession, reconstructedSets);
      }
      onSaved();
      onClose();
    } catch (err) {
      alert(`Failed to save session: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!sessionToEdit) return;
    if (!confirm('Are you sure you want to delete this completed workout from your history?')) return;
    setSaving(true);
    try {
      await api.deleteCompletedSession(sessionToEdit.id);
      onSaved();
      onClose();
    } catch (err) {
      alert(`Failed to delete session: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={sessionToEdit ? `Edit Session ${sessionNum}` : `Log Session ${sessionNum}`}
      id="edit-session-sheet"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Date Selector */}
        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--m-text-muted)', display: 'block', marginBottom: '0.35rem' }}>
            Workout Date
          </label>
          <input
            type="date"
            value={workoutDate}
            onChange={(e) => setWorkoutDate(e.target.value)}
            style={{
              width: '100%',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid var(--m-border)',
              borderRadius: 'var(--m-radius-sm)',
              padding: '0.65rem',
              color: 'var(--m-text-main)',
              fontSize: '0.9rem',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {exerciseForms.map((ex, exIdx) => {
          const exMeta = exercisesMap[ex.exercise_id];
          return (
            <div key={ex.exercise_id} className="m-card" style={{ padding: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--m-text-main)' }}>
                  {exMeta ? exMeta.name : ex.exercise_name || ex.exercise_id.replace(/_/g, ' ')}
                </h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--m-text-muted)' }}>
                      + Load ({units === 'imperial' ? 'lb' : 'kg'}):
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={
                        units === 'imperial'
                          ? Number(((ex.added_weight_kg || 0) * KG_TO_LB).toFixed(1))
                          : Number((ex.added_weight_kg || 0).toFixed(1))
                      }
                      onChange={(e) => {
                        const rawVal = parseFloat(e.target.value) || 0;
                        const weightKg = units === 'imperial' ? rawVal / KG_TO_LB : rawVal;
                        setExerciseForms((prev) => {
                          const clone = JSON.parse(JSON.stringify(prev));
                          if (clone[exIdx]) {
                            clone[exIdx].added_weight_kg = Math.max(0, weightKg);
                          }
                          return clone;
                        });
                      }}
                      style={{
                        width: '54px',
                        padding: '0.2rem 0.35rem',
                        borderRadius: '4px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid var(--m-border)',
                        color: 'var(--m-text-main)',
                        fontSize: '0.8rem',
                        textAlign: 'center',
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    style={{
                      background: 'rgba(99, 102, 241, 0.15)',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      color: 'var(--m-cyan)',
                      borderRadius: '4px',
                      padding: '0.2rem 0.5rem',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                    onClick={() => handleAddSet(exIdx)}
                  >
                    + Add Set
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {ex.sets.map((setObj, sIdx) => (
                  <div
                    key={sIdx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(0, 0, 0, 0.25)',
                      padding: '0.45rem 0.65rem',
                      borderRadius: 'var(--m-radius-sm)',
                    }}
                  >
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--m-text-muted)' }}>
                      Set {sIdx + 1}
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      {/* Reps stepper */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <button
                          type="button"
                          style={{
                            width: '28px',
                            height: '28px',
                            background: 'rgba(255, 255, 255, 0.1)',
                            border: 'none',
                            color: '#fff',
                            borderRadius: '4px',
                            fontWeight: 800,
                          }}
                          onClick={() => handleUpdateReps(exIdx, sIdx, setObj.reps - 1)}
                        >
                          −
                        </button>
                        <span style={{ minWidth: '32px', textAlign: 'center', fontWeight: 800, fontSize: '0.9rem' }}>
                          {setObj.reps}
                        </span>
                        <button
                          type="button"
                          style={{
                            width: '28px',
                            height: '28px',
                            background: 'rgba(255, 255, 255, 0.1)',
                            border: 'none',
                            color: '#fff',
                            borderRadius: '4px',
                            fontWeight: 800,
                          }}
                          onClick={() => handleUpdateReps(exIdx, sIdx, setObj.reps + 1)}
                        >
                          +
                        </button>
                      </div>

                      {/* RIR pill selector */}
                      <button
                        type="button"
                        style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '999px',
                          border: 'none',
                          background: setObj.rir <= 3 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                          color: setObj.rir <= 3 ? 'var(--m-green)' : 'var(--m-amber)',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                        onClick={() => handleCycleRir(exIdx, sIdx)}
                        title="Tap to cycle RIR"
                      >
                        {setObj.rir} RIR
                      </button>

                      {/* Remove Set button */}
                      {ex.sets.length > 1 && (
                        <button
                          type="button"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--m-red)',
                            fontSize: '1rem',
                            cursor: 'pointer',
                            padding: '0 0.25rem',
                          }}
                          onClick={() => handleRemoveSet(exIdx, sIdx)}
                          title="Delete set"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          {sessionToEdit && (
            <button
              type="button"
              className="m-btn m-btn-danger"
              style={{ width: '35%' }}
              onClick={handleDelete}
              disabled={saving}
            >
              Delete
            </button>
          )}
          <button
            type="button"
            className="m-btn m-btn-primary"
            style={{ width: sessionToEdit ? '65%' : '100%' }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : sessionToEdit ? 'Save Changes' : 'Log Past Workout'}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
};
