import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { CompletedSession, Exercise, Plan, SessionExerciseSummary, SetLog, Units } from '../types';
import { registerModalBackHandler } from '../utils/androidBack';
import { KG_TO_LB } from '../utils/units';

interface ExerciseFormState {
  exercise_id: string;
  exercise_name: string;
  added_weight_kg: number;
  sets: Array<{
    reps: number;
    rir: number;
  }>;
}

interface EditSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionToEdit: CompletedSession | null;
  initialDate?: string; // YYYY-MM-DD
  initialSessionNumber?: number;
  plan?: Plan;
  onSaved: () => void;
  units?: Units;
}

function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const EditSessionModal: React.FC<EditSessionModalProps> = ({
  isOpen,
  onClose,
  sessionToEdit,
  initialDate,
  initialSessionNumber,
  plan,
  onSaved,
  units = 'metric',
}) => {
  const [workoutDate, setWorkoutDate] = useState<string>('');
  const [sessionNum, setSessionNum] = useState<number>(1);
  const [exerciseForms, setExerciseForms] = useState<ExerciseFormState[]>([]);
  const [saving, setSaving] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [exercisesMap, setExercisesMap] = useState<Record<string, Exercise>>({});

  useEffect(() => {
    if (isOpen) {
      return registerModalBackHandler('edit-session', onClose);
    }
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    api
      .getExercises()
      .then((list) => {
        const map: Record<string, Exercise> = {};
        list.forEach((e) => (map[e.id] = e));
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

      // Load specific set logs if available
      api.getSetLogs()
        .then((allLogs) => {
          const sessionLogs = allLogs.filter(
            (l) =>
              l.session_number === sessionToEdit.session_number &&
              Math.abs(l.timestamp - sessionToEdit.timestamp) < 43_200_000
          );

          if (sessionLogs.length > 0) {
            // Sort by block_index first so sets appear in correct sequence
            sessionLogs.sort((a, b) => a.block_index - b.block_index);

            // Group by exercise_id while recording block appearance order
            const grouped: Record<string, SetLog[]> = {};
            const exerciseOrder: string[] = [];
            sessionLogs.forEach((l) => {
              if (!grouped[l.exercise_id]) {
                grouped[l.exercise_id] = [];
                exerciseOrder.push(l.exercise_id);
              }
              grouped[l.exercise_id].push(l);
            });

            // Prefer sequence from sessionToEdit.exercises_summary, then any additional exercises
            const summaryOrder = sessionToEdit.exercises_summary.map((s) => s.exercise_id);
            const orderedIds = [
              ...summaryOrder.filter((id) => grouped[id]),
              ...exerciseOrder.filter((id) => !summaryOrder.includes(id)),
            ];

            const forms: ExerciseFormState[] = orderedIds.map((exId) => {
              const logs = grouped[exId];
              const summary = sessionToEdit.exercises_summary.find((s) => s.exercise_id === exId);
              return {
                exercise_id: exId,
                exercise_name: summary?.exercise_name || exId.replace(/_/g, ' '),
                added_weight_kg: logs[0]?.added_weight_kg ?? 0,
                sets: logs.map((l) => ({
                  reps: l.reps_or_seconds,
                  rir: l.reps_from_failure,
                })),
              };
            });
            setExerciseForms(forms);
          } else {
            // Fall back to exercises_summary
            const forms: ExerciseFormState[] = sessionToEdit.exercises_summary.map((summary) => ({
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
          // Fall back to exercises_summary on error
          const forms: ExerciseFormState[] = sessionToEdit.exercises_summary.map((summary) => ({
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
      // New log for a scheduled day
      const targetDate = initialDate || toLocalDateKey(new Date());
      setWorkoutDate(targetDate);
      setSessionNum(initialSessionNumber);

      const targetSession = plan.sessions.find((s) => s.session_number === initialSessionNumber);
      if (targetSession) {
        const forms: ExerciseFormState[] = targetSession.blocks.map((b) => {
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

  const handleUpdateSetReps = (exIdx: number, setIdx: number, reps: number) => {
    setExerciseForms((prev) => {
      const copy = [...prev];
      copy[exIdx].sets[setIdx].reps = Math.max(0, reps);
      return copy;
    });
  };

  const handleUpdateSetRir = (exIdx: number, setIdx: number, rir: number) => {
    setExerciseForms((prev) => {
      const copy = [...prev];
      copy[exIdx].sets[setIdx].rir = Math.max(0, Math.min(10, rir));
      return copy;
    });
  };

  const handleUpdateAddedWeight = (exIdx: number, weight: number) => {
    setExerciseForms((prev) => {
      const copy = [...prev];
      copy[exIdx].added_weight_kg = Math.max(0, weight);
      return copy;
    });
  };

  const handleAddSet = (exIdx: number) => {
    setExerciseForms((prev) => {
      const copy = [...prev];
      const lastSet = copy[exIdx].sets[copy[exIdx].sets.length - 1];
      copy[exIdx].sets.push({
        reps: lastSet ? lastSet.reps : 10,
        rir: lastSet ? lastSet.rir : 2,
      });
      return copy;
    });
  };

  const handleRemoveSet = (exIdx: number, setIdx: number) => {
    setExerciseForms((prev) => {
      const copy = [...prev];
      if (copy[exIdx].sets.length > 1) {
        copy[exIdx].sets.splice(setIdx, 1);
      }
      return copy;
    });
  };

  const handleSave = async () => {
    if (!workoutDate) return;
    setSaving(true);
    try {
      const [y, m, d] = workoutDate.split('-').map(Number);
      const timestamp = new Date(y, (m || 1) - 1, d || 1, 12, 0, 0).getTime();

      const exercisesSummary: SessionExerciseSummary[] = exerciseForms.map((ex) => {
        const totalRir = ex.sets.reduce((acc, s) => acc + s.rir, 0);
        return {
          exercise_id: ex.exercise_id,
          exercise_name: ex.exercise_name,
          sets_completed: ex.sets.length,
          reps_or_seconds: ex.sets.map((s) => s.reps),
          added_weight_kg: ex.added_weight_kg,
          avg_rir: ex.sets.length > 0 ? totalRir / ex.sets.length : 2,
        };
      });

      const totalSets = exerciseForms.reduce((acc, ex) => acc + ex.sets.length, 0);

      const targetSession = plan?.sessions.find((s) => s.session_number === sessionNum);
      const focus = targetSession?.focus || sessionToEdit?.focus || ['chest'];

      const sets: SetLog[] = exerciseForms.flatMap((ex, bIdx) =>
        ex.sets.map((s) => ({
          timestamp,
          session_number: sessionNum,
          block_index: bIdx,
          exercise_id: ex.exercise_id,
          reps_or_seconds: s.reps,
          added_weight_kg: ex.added_weight_kg,
          reps_from_failure: s.rir,
        }))
      );

      const completedSession: CompletedSession = {
        id: sessionToEdit?.id || `sess-${sessionNum}-${timestamp}`,
        timestamp,
        session_number: sessionNum,
        focus,
        total_sets: totalSets,
        exercises_summary: exercisesSummary,
      };

      await api.updateCompletedSession(completedSession, sets);
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
    if (!confirm('Are you sure you want to delete this workout log?')) return;
    setDeleting(true);
    try {
      await api.deleteCompletedSession(sessionToEdit.id);
      onSaved();
      onClose();
    } catch (err) {
      alert(`Failed to delete session: ${err}`);
    } finally {
      setDeleting(false);
    }
  };

  const totalSetsCount = exerciseForms.reduce((acc, ex) => acc + ex.sets.length, 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content edit-session-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="edit-session-header">
          <div>
            <div className="edit-session-title-row">
              <span className="edit-session-badge">Session {sessionNum}</span>
              <h3 style={{ margin: 0 }}>
                {sessionToEdit ? 'Modify Workout History' : 'Log Past Workout'}
              </h3>
            </div>
            <p className="edit-session-subtitle">
              Input or correct the exact reps, backpack load, and RIR for this workout.
            </p>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        {/* Date Row */}
        <div className="edit-session-meta-row">
          <div className="edit-meta-item">
            <label className="edit-meta-label">Workout Date:</label>
            <input
              type="date"
              value={workoutDate}
              onChange={(e) => setWorkoutDate(e.target.value)}
              className="calib-date-field"
            />
          </div>
          <div className="edit-meta-item">
            <label className="edit-meta-label">Total Volume:</label>
            <span className="badge badge-primary">{totalSetsCount} Sets Completed</span>
          </div>
        </div>

        {/* Exercises List */}
        <div className="edit-exercises-container">
          {exerciseForms.map((ex, exIdx) => (
            <div key={ex.exercise_id + exIdx} className="card edit-exercise-card">
              <div className="edit-ex-header">
                <div>
                  <h4 className="edit-ex-title">{ex.exercise_name}</h4>
                  <span className="edit-ex-sub">{ex.sets.length} sets logged</span>
                </div>
                <div className="edit-weight-input-group">
                  <label className="edit-weight-label">+ Load ({units === 'imperial' ? 'lb' : 'kg'}):</label>
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
                      handleUpdateAddedWeight(exIdx, weightKg);
                    }}
                    className="edit-num-input"
                  />
                </div>
              </div>

              {/* Sets Table */}
              <div className="edit-sets-table">
                <div className="edit-sets-head">
                  <span>Set</span>
                  <span>{exercisesMap[ex.exercise_id]?.time_based ? 'Seconds' : 'Reps'}</span>
                  <span>RIR (Proximity)</span>
                  <span style={{ textAlign: 'right' }}>Action</span>
                </div>
                {ex.sets.map((s, sIdx) => (
                  <div key={sIdx} className="edit-set-row">
                    <span className="edit-set-idx">Set {sIdx + 1}</span>
                    <input
                      type="number"
                      min="1"
                      max={exercisesMap[ex.exercise_id]?.time_based ? "600" : "100"}
                      value={s.reps}
                      onChange={(e) => handleUpdateSetReps(exIdx, sIdx, parseInt(e.target.value) || 0)}
                      className="edit-num-input edit-reps-input"
                    />
                    <select
                      value={s.rir}
                      onChange={(e) => handleUpdateSetRir(exIdx, sIdx, parseInt(e.target.value) || 0)}
                      className="edit-select-input"
                    >
                      <option value={0}>0 RIR (Failure)</option>
                      <option value={1}>1 RIR (1 rep in reserve)</option>
                      <option value={2}>2 RIR (2 reps in reserve)</option>
                      <option value={3}>3 RIR (3 reps in reserve)</option>
                      <option value={4}>4+ RIR (Submaximal)</option>
                    </select>
                    <div style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn-remove-set"
                        title="Remove set"
                        onClick={() => handleRemoveSet(exIdx, sIdx)}
                        disabled={ex.sets.length <= 1}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="btn btn-outline btn-sm mt-2"
                onClick={() => handleAddSet(exIdx)}
              >
                + Add Set
              </button>
            </div>
          ))}
        </div>

        {/* Actions Footer */}
        <div className="edit-session-footer">
          <div>
            {sessionToEdit && (
              <button
                type="button"
                className="btn btn-outline btn-sm btn-delete-log"
                disabled={deleting || saving}
                onClick={handleDelete}
              >
                {deleting ? 'Deleting...' : '🗑️ Delete Workout'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.65rem' }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={onClose}
              disabled={saving || deleting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleSave}
              disabled={saving || deleting}
            >
              {saving ? 'Saving...' : '✓ Save Accurate Numbers'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
