import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import { CompletedSession, Exercise, SetLog } from '../../types';
import { BottomSheet } from './BottomSheet';

interface MobileEditSessionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  sessionToEdit: CompletedSession | null;
  onSaved: () => void;
}

export const MobileEditSessionSheet: React.FC<MobileEditSessionSheetProps> = ({
  isOpen,
  onClose,
  sessionToEdit,
  onSaved,
}) => {
  const [editedSession, setEditedSession] = useState<CompletedSession | null>(null);
  const [exercisesMap, setExercisesMap] = useState<Record<string, Exercise>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sessionToEdit) {
      setEditedSession(JSON.parse(JSON.stringify(sessionToEdit)));
    }
  }, [sessionToEdit]);

  useEffect(() => {
    api.getExercises().then((list) => {
      const map: Record<string, Exercise> = {};
      list.forEach((e) => {
        map[e.id] = e;
      });
      setExercisesMap(map);
    }).catch(console.error);
  }, []);

  if (!editedSession) return null;

  const handleUpdateReps = (exIdx: number, repIdx: number, val: number) => {
    setEditedSession((prev) => {
      if (!prev) return null;
      const clone = { ...prev };
      const ex = clone.exercises_summary[exIdx];
      ex.reps_or_seconds[repIdx] = Math.max(1, val);
      return clone;
    });
  };

  const handleRemoveSet = (exIdx: number, repIdx: number) => {
    setEditedSession((prev) => {
      if (!prev) return null;
      const clone = { ...prev };
      const ex = clone.exercises_summary[exIdx];
      ex.reps_or_seconds.splice(repIdx, 1);
      ex.sets_completed = ex.reps_or_seconds.length;
      clone.total_sets = clone.exercises_summary.reduce((acc, e) => acc + e.sets_completed, 0);
      return clone;
    });
  };

  const handleSave = async () => {
    if (!editedSession) return;
    setSaving(true);

    // Reconstruct flat SetLog array
    const reconstructedSets: SetLog[] = [];
    editedSession.exercises_summary.forEach((exSummary, bIdx) => {
      exSummary.reps_or_seconds.forEach((reps) => {
        reconstructedSets.push({
          timestamp: editedSession.timestamp,
          session_number: editedSession.session_number,
          block_index: bIdx,
          exercise_id: exSummary.exercise_id,
          reps_or_seconds: reps,
          added_weight_kg: exSummary.added_weight_kg,
          reps_from_failure: Math.round(exSummary.avg_rir),
        });
      });
    });

    try {
      await api.updateCompletedSession(editedSession, reconstructedSets);
      onSaved();
      onClose();
    } catch (err) {
      alert(`Failed to save edits: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editedSession) return;
    if (!confirm('Are you sure you want to delete this completed workout from your history?')) return;
    setSaving(true);
    try {
      await api.deleteCompletedSession(editedSession.id);
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
      title={`Edit Session ${editedSession.session_number}`}
      id="edit-session-sheet"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {editedSession.exercises_summary.map((ex, exIdx) => {
          const exMeta = exercisesMap[ex.exercise_id];
          return (
            <div key={ex.exercise_id} className="m-card" style={{ padding: '0.85rem' }}>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', color: 'var(--m-text-main)' }}>
                {exMeta ? exMeta.name : ex.exercise_name || ex.exercise_id.replace(/_/g, ' ')}
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {ex.reps_or_seconds.map((reps, rIdx) => (
                  <div
                    key={rIdx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(0, 0, 0, 0.25)',
                      padding: '0.4rem 0.6rem',
                      borderRadius: 'var(--m-radius-sm)',
                    }}
                  >
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--m-text-muted)' }}>
                      Set {rIdx + 1}
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <button
                          type="button"
                          style={{
                            width: '28px',
                            height: '28px',
                            background: 'rgba(255, 255, 255, 0.1)',
                            border: 'none',
                            color: '#fff',
                            borderRadius: '4px',
                          }}
                          onClick={() => handleUpdateReps(exIdx, rIdx, reps - 1)}
                        >
                          −
                        </button>
                        <span style={{ minWidth: '32px', textAlign: 'center', fontWeight: 800 }}>
                          {reps}
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
                          }}
                          onClick={() => handleUpdateReps(exIdx, rIdx, reps + 1)}
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--m-red)',
                          fontSize: '1rem',
                          cursor: 'pointer',
                          padding: '0 0.3rem',
                        }}
                        onClick={() => handleRemoveSet(exIdx, rIdx)}
                        title="Delete set"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button
            type="button"
            className="m-btn m-btn-danger"
            style={{ width: '40%' }}
            onClick={handleDelete}
            disabled={saving}
          >
            Delete
          </button>
          <button
            type="button"
            className="m-btn m-btn-primary"
            style={{ width: '60%' }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
};
