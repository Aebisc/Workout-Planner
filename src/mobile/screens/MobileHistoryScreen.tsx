import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../../api';
import { CompletedSession, Exercise, Muscle, Plan, Settings } from '../../types';
import { MobileEditSessionSheet } from '../components/MobileEditSessionSheet';

interface MobileHistoryScreenProps {
  plan?: Plan | null;
  settings?: Settings | null;
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
  const day = d.getDay(); // 0 is Sunday, 1 is Monday...
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
  const [selectedMuscle, setSelectedMuscle] = useState<'all' | Muscle>('all');
  const [collapsedWeeks, setCollapsedWeeks] = useState<Record<string, boolean>>({});

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

  // Muscle workout counts for filter chips
  const muscleCounts = useMemo(() => {
    const counts: Record<string, number> = { all: history.length };
    MUSCLE_FILTER_OPTIONS.forEach((opt) => {
      if (opt.key === 'all') return;
      const m = opt.key;
      counts[m] = history.filter((sess) => {
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
  }, [history, exercisesMap]);

  // Filtered sessions
  const filteredHistory = useMemo(() => {
    if (selectedMuscle === 'all') return history;
    return history.filter((sess) => {
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
  }, [history, selectedMuscle, exercisesMap]);

  // Group filtered sessions by week
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
    <div className="mobile-view-container">
      {/* Top Overview Card */}
      <div className="m-card" style={{ marginBottom: '0.85rem', padding: '1.25rem' }}>
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

      {/* Quick Muscle Filter Chips */}
      {history.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '0.45rem',
            overflowX: 'auto',
            padding: '0 0 0.85rem',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
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
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.35rem 0.75rem',
                  borderRadius: 'var(--m-radius-full)',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  border: isActive
                    ? '1px solid var(--m-cyan)'
                    : '1px solid rgba(255, 255, 255, 0.1)',
                  background: isActive
                    ? 'rgba(6, 182, 212, 0.16)'
                    : 'rgba(255, 255, 255, 0.04)',
                  color: isActive ? 'var(--m-cyan)' : 'var(--m-text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  flexShrink: 0,
                }}
              >
                <span>{opt.label}</span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    padding: '0.05rem 0.35rem',
                    borderRadius: '10px',
                    background: isActive
                      ? 'rgba(6, 182, 212, 0.25)'
                      : 'rgba(255, 255, 255, 0.08)',
                    color: isActive ? '#fff' : 'var(--m-text-muted)',
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* History List Section with Week Grouping */}
      <div className="m-grouped-section">
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
        ) : filteredHistory.length === 0 ? (
          <div className="m-card" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>🔍</span>
            <h4 style={{ margin: '0 0 0.4rem', fontSize: '1rem', color: 'var(--m-text-main)' }}>
              No {selectedMuscle.toUpperCase()} Workouts Found
            </h4>
            <p style={{ color: 'var(--m-text-muted)', fontSize: '0.82rem', margin: '0 0 1rem' }}>
              None of your completed sessions targeted {selectedMuscle}.
            </p>
            <button
              type="button"
              className="m-btn m-btn-secondary"
              style={{ fontSize: '0.82rem', padding: '0.4rem 0.9rem' }}
              onClick={() => setSelectedMuscle('all')}
            >
              Show All Workouts
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {weekGroups.map((week) => {
              const isCollapsed = collapsedWeeks[week.id] ?? false;

              return (
                <div key={week.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {/* Week Header Row with Volume Summary Pill */}
                  <div
                    onClick={() => toggleWeek(week.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.2rem 0.25rem',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--m-text-muted)', width: '12px' }}>
                        {isCollapsed ? '▸' : '▾'}
                      </span>
                      <span style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--m-text-main)' }}>
                        {week.title}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--m-text-muted)', fontWeight: 600 }}>
                        ({week.dateRange})
                      </span>
                    </div>

                    {/* Volume Summary Pill */}
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        color: 'var(--m-cyan)',
                        background: 'rgba(6, 182, 212, 0.12)',
                        border: '1px solid rgba(6, 182, 212, 0.28)',
                        padding: '0.2rem 0.6rem',
                        borderRadius: 'var(--m-radius-full)',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {week.totalSets} Sets • {week.totalWorkouts} {week.totalWorkouts === 1 ? 'Workout' : 'Workouts'}
                    </span>
                  </div>

                  {/* Week Sessions Cards */}
                  {!isCollapsed && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {week.sessions.map((sess) => {
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
                                      alignItems: 'baseline',
                                      fontSize: '0.8rem',
                                      padding: '0.25rem 0',
                                      gap: '0.5rem',
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flex: 1, minWidth: 0 }}>
                                      <span style={{ color: 'var(--m-text-main)', fontWeight: 600, wordBreak: 'break-word' }}>
                                        {ex.exercise_name}
                                      </span>
                                      {hasLoad && (
                                        <span style={{ fontSize: '0.7rem', color: 'var(--m-cyan)', fontWeight: 700, background: 'rgba(6, 182, 212, 0.12)', padding: '0.1rem 0.35rem', borderRadius: '3px', whiteSpace: 'nowrap' }}>
                                          +{loadFormatted}
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0, whiteSpace: 'nowrap' }}>
                                      <span style={{ color: 'var(--m-text-muted)', fontSize: '0.75rem' }}>
                                        {ex.sets_completed} sets • {ex.reps_or_seconds.join(', ')}{isTimeBased ? 's' : ''}
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
