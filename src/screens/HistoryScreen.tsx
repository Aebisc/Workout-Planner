import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../api';
import { EditSessionModal } from '../components/EditSessionModal';
import { CompletedSession, Exercise, Muscle, Plan, Settings } from '../types';
import { formatWeight } from '../utils/units';

interface HistoryScreenProps {
  settings: Settings;
  plan?: Plan | null;
  onPlanUpdated?: () => Promise<void>;
}

const MUSCLE_FILTER_OPTIONS: Array<{ key: 'all' | Muscle; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'chest', label: 'Chest' },
  { key: 'back', label: 'Back' },
  { key: 'biceps', label: 'Biceps' },
  { key: 'triceps', label: 'Triceps' },
  { key: 'forearms', label: 'Forearms' },
  { key: 'abs', label: 'Abs' },
];

interface WeekGroup {
  id: string;
  title: string;
  dateRange: string;
  totalSets: number;
  totalWorkouts: number;
  sessions: CompletedSession[];
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - (day === 0 ? 6 : day - 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function formatDateRange(start: Date, end: Date): string {
  const startMonth = start.toLocaleDateString(undefined, { month: 'short' });
  const startDay = start.getDate();
  const endMonth = end.toLocaleDateString(undefined, { month: 'short' });
  const endDay = end.getDate();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay} – ${endDay}`;
  }
  return `${startMonth} ${startDay} – ${endMonth} ${endDay}`;
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
  const [selectedMuscle, setSelectedMuscle] = useState<'all' | Muscle>('all');
  const [collapsedWeeks, setCollapsedWeeks] = useState<Record<string, boolean>>({});

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

  const exercisesMap = useMemo(() => {
    const map: Record<string, Exercise> = {};
    exercises.forEach((e) => {
      map[e.id] = e;
    });
    return map;
  }, [exercises]);

  const muscleCounts = useMemo(() => {
    const counts: Record<string, number> = { all: sessionHistory.length };
    MUSCLE_FILTER_OPTIONS.forEach((opt) => {
      if (opt.key === 'all') return;
      const m = opt.key;
      counts[m] = sessionHistory.filter((sess) => {
        if (sess.focus.includes(m)) return true;
        return sess.exercises_summary.some((ex) => {
          const meta = exercisesMap[ex.exercise_id];
          return (
            meta &&
            (meta.primary_muscle === m ||
              (meta.contribution_weights && meta.contribution_weights[m] > 0))
          );
        });
      }).length;
    });
    return counts;
  }, [sessionHistory, exercisesMap]);

  const filteredHistory = useMemo(() => {
    if (selectedMuscle === 'all') return sessionHistory;
    return sessionHistory.filter((sess) => {
      if (sess.focus.includes(selectedMuscle)) return true;
      return sess.exercises_summary.some((ex) => {
        const meta = exercisesMap[ex.exercise_id];
        return (
          meta &&
          (meta.primary_muscle === selectedMuscle ||
            (meta.contribution_weights && meta.contribution_weights[selectedMuscle] > 0))
        );
      });
    });
  }, [sessionHistory, selectedMuscle, exercisesMap]);

  const weekGroups = useMemo((): WeekGroup[] => {
    if (filteredHistory.length === 0) return [];

    const now = new Date();
    const currentWeekMonday = getStartOfWeek(now);
    const lastWeekMonday = new Date(currentWeekMonday.getTime() - 7 * 24 * 60 * 60 * 1000);

    const groupsMap = new Map<number, CompletedSession[]>();

    for (const sess of filteredHistory) {
      const sessDate = new Date(sess.timestamp);
      const monday = getStartOfWeek(sessDate);
      const timeKey = monday.getTime();

      if (!groupsMap.has(timeKey)) {
        groupsMap.set(timeKey, []);
      }
      groupsMap.get(timeKey)!.push(sess);
    }

    const sortedMondayKeys = Array.from(groupsMap.keys()).sort((a, b) => b - a);

    return sortedMondayKeys.map((mondayKey) => {
      const monday = new Date(mondayKey);
      const sunday = new Date(mondayKey + 6 * 24 * 60 * 60 * 1000);
      const weekSessions = groupsMap.get(mondayKey)!;
      weekSessions.sort((a, b) => b.timestamp - a.timestamp);

      let title = '';
      if (mondayKey === currentWeekMonday.getTime()) {
        title = 'This Week';
      } else if (mondayKey === lastWeekMonday.getTime()) {
        title = 'Last Week';
      } else {
        title = 'Earlier';
      }

      const dateRange = formatDateRange(monday, sunday);
      const totalSets = weekSessions.reduce((sum, s) => sum + s.total_sets, 0);

      return {
        id: `week-${mondayKey}`,
        title,
        dateRange,
        totalSets,
        totalWorkouts: weekSessions.length,
        sessions: weekSessions,
      };
    });
  }, [filteredHistory]);

  const toggleWeek = (id: string) => {
    setCollapsedWeeks((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <div className="history-screen-container">
      {/* Header and Summary Metrics */}
      <div className="section-header-row" style={{ marginBottom: '1rem' }}>
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

      {/* Quick Muscle Filter Chips */}
      {sessionHistory.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            overflowX: 'auto',
            paddingBottom: '1rem',
            marginBottom: '0.5rem',
          }}
        >
          {MUSCLE_FILTER_OPTIONS.map((opt) => {
            const count = muscleCounts[opt.key] ?? 0;
            const isActive = selectedMuscle === opt.key;

            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSelectedMuscle(opt.key)}
                className={`btn ${isActive ? 'btn-primary' : 'btn-outline'}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.35rem 0.85rem',
                  borderRadius: '20px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <span>{opt.label}</span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    padding: '0.1rem 0.4rem',
                    borderRadius: '10px',
                    background: isActive ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.1)',
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

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
      ) : filteredHistory.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.5rem' }}>🔍</span>
          <h4 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem' }}>
            No {selectedMuscle.toUpperCase()} Workouts Found
          </h4>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
            None of your recorded sessions targeted {selectedMuscle}.
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setSelectedMuscle('all')}
          >
            Show All Workouts
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {weekGroups.map((week) => {
            const isCollapsed = collapsedWeeks[week.id] ?? false;

            return (
              <div key={week.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {/* Week Header Row with Volume Summary Pill */}
                <div
                  onClick={() => toggleWeek(week.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.25rem 0.5rem',
                    cursor: 'pointer',
                    userSelect: 'none',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                    paddingBottom: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {isCollapsed ? '▸' : '▾'}
                    </span>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
                      {week.title}
                    </h3>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      ({week.dateRange})
                    </span>
                  </div>

                  {/* Volume Summary Pill */}
                  <span className="badge badge-primary" style={{ fontSize: '0.78rem', padding: '0.25rem 0.65rem' }}>
                    {week.totalSets} Sets • {week.totalWorkouts} {week.totalWorkouts === 1 ? 'Workout' : 'Workouts'}
                  </span>
                </div>

                {/* Week Sessions List */}
                {!isCollapsed && (
                  <div className="sessions-history-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {week.sessions.map((s) => {
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
