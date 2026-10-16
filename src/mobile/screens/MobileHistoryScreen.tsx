import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { CompletedSession, Exercise, Plan, Settings } from '../../types';
import { MobileEditSessionSheet } from '../components/MobileEditSessionSheet';

interface MobileHistoryScreenProps {
  plan?: Plan | null;
  settings?: Settings | null;
  onPlanUpdated?: () => Promise<void>;
}

export const MobileHistoryScreen: React.FC<MobileHistoryScreenProps> = ({
  plan,
  settings,
  onPlanUpdated,
}) => {
  const [history, setHistory] = useState<CompletedSession[]>([]);
  const [exercisesMap, setExercisesMap] = useState<Record<string, Exercise>>({});
  const [editingSession, setEditingSession] = useState<CompletedSession | null>(null);
  const [editSheetOpen, setEditSheetOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchHistoryData = () => {
    Promise.all([api.getSessionHistory(), api.getExercises()])
      .then(([hist, exList]) => {
        setHistory(hist);
        const map: Record<string, Exercise> = {};
        exList.forEach((e) => {
          map[e.id] = e;
        });
        setExercisesMap(map);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchHistoryData();
  }, [plan]);

  const totalSetsLogged = history.reduce((acc, s) => acc + s.total_sets, 0);

  return (
    <div className="mobile-view-container">
      {/* Top Overview Card */}
      <div className="m-card" style={{ marginBottom: '1rem', padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--m-cyan)', letterSpacing: '0.05em' }}>
              Training Log
            </span>
            <h2 style={{ margin: '0.2rem 0 0', fontSize: '1.35rem', fontWeight: 800, color: 'var(--m-text-main)' }}>
              Workout History
            </h2>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--m-cyan)', display: 'block', lineHeight: 1.1 }}>
              {history.length}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--m-text-muted)' }}>
              Completed
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid var(--m-border)' }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--m-text-muted)', display: 'block' }}>Total Volume</span>
            <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--m-text-main)' }}>
              {totalSetsLogged} <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--m-text-muted)' }}>Sets</span>
            </span>
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--m-text-muted)', display: 'block' }}>Unit System</span>
            <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--m-text-main)' }}>
              {settings?.units === 'imperial' ? 'Imperial (lb)' : 'Metric (kg)'}
            </span>
          </div>
        </div>
      </div>

      {/* History List Section */}
      <div className="m-grouped-section">
        <div className="m-section-title">All Completed Workouts ({history.length})</div>

        {loading ? (
          <div className="m-card" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <p style={{ color: 'var(--m-text-muted)', fontSize: '0.9rem', margin: 0 }}>
              Loading workout history...
            </p>
          </div>
        ) : history.length === 0 ? (
          <div className="m-card" style={{ textAlign: 'center', padding: '2.5rem 1.25rem' }}>
            <span style={{ fontSize: '3rem', display: 'block', marginBottom: '0.75rem' }}>🏋️</span>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0 0 0.5rem', color: 'var(--m-text-main)' }}>
              No Workouts Logged Yet
            </h3>
            <p style={{ color: 'var(--m-text-muted)', fontSize: '0.85rem', lineHeight: 1.5, margin: 0 }}>
              Complete your scheduled workouts from the Workouts tab. Every set and RIR you log will be safely recorded here.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {history.map((sess) => {
              const d = new Date(sess.timestamp);
              const dateStr = d.toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              });
              const timeStr = d.toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={sess.id}
                  className="m-card"
                  style={{
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                  }}
                >
                  {/* Card Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--m-cyan)' }}>
                          Session {sess.session_number}
                        </span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--m-text-muted)' }}>
                          • {dateStr} at {timeStr}
                        </span>
                      </div>
                      <h4 style={{ margin: '0.25rem 0 0', fontSize: '1.05rem', color: 'var(--m-text-main)', fontWeight: 800 }}>
                        {sess.focus.join(' & ')}
                      </h4>
                    </div>

                    <button
                      type="button"
                      style={{
                        background: 'rgba(99, 102, 241, 0.15)',
                        border: '1px solid rgba(99, 102, 241, 0.35)',
                        color: 'var(--m-cyan)',
                        borderRadius: 'var(--m-radius-sm)',
                        padding: '0.35rem 0.75rem',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                      onClick={() => {
                        setEditingSession(sess);
                        setEditSheetOpen(true);
                      }}
                    >
                      ✏️ Edit
                    </button>
                  </div>

                  {/* Badges Row */}
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: 'var(--m-green)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                      }}
                    >
                      ✓ {sess.total_sets} Sets Completed
                    </span>
                    {sess.focus.map((m) => (
                      <span
                        key={m}
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: 'rgba(255, 255, 255, 0.06)',
                          color: 'var(--m-text-muted)',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          textTransform: 'uppercase',
                        }}
                      >
                        {m}
                      </span>
                    ))}
                  </div>

                  {/* Exercises Details */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '0.6rem' }}>
                    {sess.exercises_summary.map((ex) => {
                      const exMeta = exercisesMap[ex.exercise_id];
                      const isTimeBased = exMeta?.time_based ?? false;
                      const hasLoad = (ex.added_weight_kg || 0) > 0;
                      const loadFormatted = settings?.units === 'imperial'
                        ? `${((ex.added_weight_kg || 0) * 2.20462).toFixed(1)}lb`
                        : `${(ex.added_weight_kg || 0).toFixed(1)}kg`;

                      return (
                        <div
                          key={ex.exercise_id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '0.8rem',
                            padding: '0.25rem 0',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ color: 'var(--m-text-main)', fontWeight: 600 }}>
                              {ex.exercise_name}
                            </span>
                            {hasLoad && (
                              <span style={{ fontSize: '0.7rem', color: 'var(--m-cyan)', fontWeight: 700, background: 'rgba(6, 182, 212, 0.12)', padding: '0.1rem 0.35rem', borderRadius: '3px' }}>
                                +{loadFormatted}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ color: 'var(--m-text-muted)', fontSize: '0.75rem' }}>
                              {ex.sets_completed}s • {ex.reps_or_seconds.join(', ')}{isTimeBased ? 's' : ''}
                            </span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--m-green)', fontWeight: 700 }}>
                              {ex.avg_rir.toFixed(1)} RIR
                            </span>
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
      </div>

      {/* Edit Session Bottom Sheet */}
      <MobileEditSessionSheet
        isOpen={editSheetOpen}
        onClose={() => {
          setEditSheetOpen(false);
          setEditingSession(null);
        }}
        sessionToEdit={editingSession}
        plan={plan ?? undefined}
        units={settings?.units}
        onSaved={async () => {
          fetchHistoryData();
          if (onPlanUpdated) {
            await onPlanUpdated();
          }
        }}
      />
    </div>
  );
};
