import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { EditSessionModal } from '../components/EditSessionModal';
import { CompletedSession, Exercise, Plan, Settings } from '../types';
import { formatWeight } from '../utils/units';

interface HistoryScreenProps {
  settings: Settings;
  plan?: Plan | null;
  onPlanUpdated?: () => Promise<void>;
}

export const HistoryScreen: React.FC<HistoryScreenProps> = ({
  settings,
  plan: _plan,
  onPlanUpdated,
}) => {
  const [sessionHistory, setSessionHistory] = useState<CompletedSession[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [editingSession, setEditingSession] = useState<CompletedSession | null>(null);

  const loadHistoryData = () => {
    Promise.all([api.getExercises(), api.getSessionHistory()])
      .then(([ex, history]) => {
        setExercises(ex);
        setSessionHistory(history);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadHistoryData();
  }, []);

  const totalCompletedSets = sessionHistory.reduce((acc, s) => acc + s.total_sets, 0);

  return (
    <div className="history-screen-container">
      {/* Header and Summary Metrics */}
      <div className="section-header-row" style={{ marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>Workout History</h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Review, modify, or inspect past completed workouts and logged hypertrophy sets.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span className="badge badge-primary">
            {sessionHistory.length} Workout{sessionHistory.length === 1 ? '' : 's'} Logged
          </span>
          <span className="badge badge-outline">
            {totalCompletedSets} Total Sets
          </span>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
          Loading workout history...
        </div>
      ) : sessionHistory.length === 0 ? (
        <div className="card">
          <div className="empty-history-box" style={{ padding: '3.5rem 1rem', textAlign: 'center' }}>
            <span className="empty-history-icon" style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>
              🏋️
            </span>
            <p className="empty-history-title" style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
              No completed sessions logged yet
            </p>
            <p className="empty-history-desc" style={{ color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto' }}>
              Complete your planned workout in the Schedule tab and tap the <strong>Done</strong> button to log your workout here.
            </p>
          </div>
        </div>
      ) : (
        <div className="sessions-history-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {sessionHistory.map((s) => {
            const dateStr = new Date(s.timestamp).toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });
            const timeStr = new Date(s.timestamp).toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div key={s.id} className="session-history-item card">
                <div className="session-history-item-header">
                  <div className="session-history-title-group">
                    <h4>Session {s.session_number}</h4>
                    <span className="session-history-date">
                      {dateStr} • {timeStr}
                    </span>
                  </div>

                  <div className="session-history-badges">
                    <div className="focus-pills">
                      {s.focus.map((m) => (
                        <span key={m} className="pill pill-focus">
                          {m.toUpperCase()}
                        </span>
                      ))}
                    </div>
                    <span className="badge badge-primary">{s.total_sets} Sets Completed</span>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm ml-2"
                      onClick={() => setEditingSession(s)}
                      title="Modify accurate workout numbers"
                    >
                      ✏️ Modify Numbers
                    </button>
                  </div>
                </div>

                <div className="session-history-exercises-table">
                  {s.exercises_summary.map((ex, idx) => {
                    const isTimeBased = exercises.find((e) => e.id === ex.exercise_id)?.time_based ?? false;
                    return (
                      <div key={idx} className="history-exercise-line">
                        <div className="history-ex-name-col">
                          <strong>{ex.exercise_name}</strong>
                          <span className="history-ex-load">
                            {formatWeight(ex.added_weight_kg, settings.units)}
                          </span>
                        </div>
                        <div className="history-ex-reps-col">
                          {ex.reps_or_seconds.map((r, rIdx) => (
                            <span key={rIdx} className="history-rep-pill">
                              Set {rIdx + 1}: {r}{isTimeBased ? 's' : ' reps'}
                            </span>
                          ))}
                        </div>
                        <div className="history-ex-rir-col">
                          Avg RIR {ex.avg_rir.toFixed(1)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Session Modal */}
      <EditSessionModal
        isOpen={editingSession !== null}
        onClose={() => setEditingSession(null)}
        sessionToEdit={editingSession}
        onSaved={async () => {
          loadHistoryData();
          if (onPlanUpdated) {
            await onPlanUpdated();
          }
        }}
        units={settings.units}
      />
    </div>
  );
};
