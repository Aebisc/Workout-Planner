import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { CompletedSession, Plan, Settings } from '../types';

interface PlanOverviewScreenProps {
  plan: Plan;
  settings: Settings;
  onSelectSession: (sessionNumber: number) => void;
  onRefreshPlan: () => void;
  onOpenSettings: () => void;
}

function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const PlanOverviewScreen: React.FC<PlanOverviewScreenProps> = ({
  plan,
  settings,
  onSelectSession,
  onRefreshPlan,
  onOpenSettings,
}) => {
  const [regenerating, setRegenerating] = useState(false);
  const [history, setHistory] = useState<CompletedSession[]>([]);

  useEffect(() => {
    api.getSessionHistory().then(setHistory).catch(console.error);
  }, [plan]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await api.generatePlan();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      localStorage.setItem('mgp_cycle_anchor_date', toLocalDateKey(today));
      onRefreshPlan();
    } catch (err) {
      alert(`Regeneration failed: ${err}`);
    } finally {
      setRegenerating(false);
    }
  };

  // Build cycle pattern array (length L)
  const L = Math.max(1, plan.cycle.length_days);
  const S = plan.cycle.sessions_count;
  const cyclePattern: Array<typeof plan.sessions[0] | null> = Array(L).fill(null);

  if (S > 0) {
    plan.sessions.forEach((sess, sIdx) => {
      const dayIndex = Math.floor((sIdx * L) / S);
      cyclePattern[dayIndex] = sess;
    });
  }

  // Group history by local date key
  const historyByDate = new Map<string, CompletedSession[]>();
  history.forEach((sess) => {
    const key = toLocalDateKey(new Date(sess.timestamp));
    const list = historyByDate.get(key) || [];
    list.push(sess);
    historyByDate.set(key, list);
  });

  // Cycle Anchor Date & Dynamic Rest Day Positioning
  let anchorKey = localStorage.getItem('mgp_cycle_anchor_date');
  if (!anchorKey) {
    if (history.length > 0) {
      const earliestTs = Math.min(...history.map((s) => s.timestamp));
      const d = new Date(earliestTs);
      d.setHours(0, 0, 0, 0);
      anchorKey = toLocalDateKey(d);
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      anchorKey = toLocalDateKey(today);
    }
    localStorage.setItem('mgp_cycle_anchor_date', anchorKey);
  }

  const [aY, aM, aD] = anchorKey.split('-').map(Number);
  const anchorMidnight = new Date(aY, aM - 1, aD, 0, 0, 0, 0);
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  // Build 14-Day Ribbon Array (offset from -10 to +3)
  const ribbonOffsets = [-10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3];
  let elapsedTrainingDays = 0;
  let completedDaysCount = 0;

  const ribbonDays = ribbonOffsets.map((offset) => {
    const date = new Date(todayMidnight);
    date.setDate(todayMidnight.getDate() + offset);

    const diffDays = Math.round((date.getTime() - anchorMidnight.getTime()) / 86_400_000);
    const cycleIdx = ((diffDays % L) + L) % L;
    const scheduledSession = cyclePattern[cycleIdx];

    const dateKey = toLocalDateKey(date);
    const completedOnDate = historyByDate.get(dateKey) || [];

    const isToday = offset === 0;
    const dow = date.toLocaleDateString(undefined, { weekday: 'short' });
    const dayOfMonth = date.getDate();
    const dateLabel = date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });

    let circleClass = '';
    let icon = '';
    let label = '';
    let tooltip = '';
    let clickable = false;
    let sessionNumber: number | undefined;

    // Track consistency for past & today days on or after anchor
    if (diffDays >= 0 && offset <= 0 && (scheduledSession !== null || completedOnDate.length > 0)) {
      elapsedTrainingDays++;
      if (completedOnDate.length > 0) {
        completedDaysCount++;
      }
    }

    if (completedOnDate.length > 0) {
      // Case A: User completed a workout on this day
      circleClass = 'icon-done';
      icon = '✓';
      label = `S${completedOnDate[0].session_number}`;
      tooltip = `${dateLabel}: Session ${completedOnDate[0].session_number} completed (${completedOnDate[0].total_sets} sets)`;
    } else if (scheduledSession === null) {
      // Case B: Scheduled Rest Day
      circleClass = 'icon-rest';
      icon = '🌙';
      label = 'Rest';
      tooltip = `${dateLabel}: Scheduled Cycle Rest & Recovery Day`;
    } else if (offset < 0) {
      // Case C: Past Scheduled Training Day with No Logged Workout
      if (diffDays < 0) {
        circleClass = 'icon-untracked';
        icon = '·';
        label = '·';
        tooltip = `${dateLabel}: Untracked`;
      } else {
        circleClass = 'icon-missed';
        icon = '✕';
        label = 'Miss';
        tooltip = `${dateLabel}: Missed Session ${scheduledSession.session_number}`;
      }
    } else if (offset === 0) {
      // Case D: Today — Workout Due
      circleClass = 'icon-today';
      icon = '🎯';
      label = `S${scheduledSession.session_number}`;
      tooltip = `Today (${dateLabel}): Session ${scheduledSession.session_number} due — click to start`;
      clickable = true;
      sessionNumber = scheduledSession.session_number;
    } else {
      // Case E: Future Scheduled Training Day
      circleClass = 'icon-upcoming';
      icon = '⏳';
      label = `S${scheduledSession.session_number}`;
      tooltip = `${dateLabel}: Upcoming Session ${scheduledSession.session_number}`;
    }

    return {
      dateKey,
      dow,
      dayOfMonth,
      isToday,
      circleClass,
      icon,
      label,
      tooltip,
      clickable,
      sessionNumber,
    };
  });

  const consistencyLabel =
    elapsedTrainingDays > 0
      ? `${Math.round((completedDaysCount / elapsedTrainingDays) * 100)}% Consistency`
      : 'New Cycle';

  const calendarDays = Array.from({ length: L }, (_, dIdx) => {
    const session = cyclePattern[dIdx];
    return {
      dayNumber: dIdx + 1,
      isTraining: !!session,
      session,
    };
  });

  return (
    <div className="plan-overview-container">
      <div className="overview-header card">
        <div className="header-details">
          <h2>Active Training Cycle</h2>
          <p className="cycle-desc">{plan.cycle.description}</p>
          <div className="cycle-stats">
            <span className="stat-pill">
              <strong>{plan.cycle.length_days}</strong> Days / Cycle
            </span>
            <span className="stat-pill">
              <strong>{plan.cycle.sessions_count}</strong> Session(s)
            </span>
            <span className="stat-pill">
              <strong>{plan.cycle.effective_weekly_rate.toFixed(2)}</strong> Days / Week (Snapped)
            </span>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-outline" onClick={onOpenSettings}>
            ⚙ Edit Settings
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleRegenerate}
            disabled={regenerating}
          >
            {regenerating ? 'Regenerating...' : '🔄 Regenerate Plan'}
          </button>
        </div>
      </div>

      {plan.cycle.is_adjusted && plan.cycle.adjusted_message && (
        <div className="alert alert-info">
          ℹ <strong>Cycle Snapping Note:</strong> {plan.cycle.adjusted_message}
        </div>
      )}

      {plan.maintenance_dropped && (
        <div className="alert alert-warning">
          ⚠ <strong>Maintenance Notice:</strong> Direct maintenance sets for non-priority muscles were omitted because they exceeded 50% of your cycle set budget. Growth volume is fully prioritized on your chosen target muscles.
        </div>
      )}

      {/* 14-Day Cycle Adherence Ribbon (Option 3) */}
      <div className="card opt3-ribbon-card">
        <div className="cal-header-row">
          <div className="cal-header-title">
            <span>⚡ 14-Day Cycle Adherence</span>
            <span className="badge badge-primary">{consistencyLabel}</span>
          </div>
          <div className="cal-legend">
            <span><span className="legend-dot dot-done" />Trained (✓)</span>
            <span><span className="legend-dot dot-missed" />Missed (✕)</span>
            <span><span className="legend-dot dot-today" />Today (🎯)</span>
            <span><span className="legend-dot dot-rest" />Rest (🌙)</span>
          </div>
        </div>

        <div className="opt3-nodes-row">
          {ribbonDays.map((day) => (
            <div
              key={day.dateKey}
              className={`opt3-node ${day.isToday ? 'today-node' : ''} ${day.clickable ? 'clickable-node' : ''}`}
              title={day.tooltip}
              onClick={() => {
                if (day.clickable && day.sessionNumber) {
                  onSelectSession(day.sessionNumber);
                }
              }}
            >
              <span className="opt3-dow">{day.isToday ? 'TODAY' : day.dow}</span>
              <span className="opt3-date-num">{day.dayOfMonth}</span>
              <div className={`opt3-circle ${day.circleClass}`}>{day.icon}</div>
              <span className="opt3-lbl">{day.label}</span>
            </div>
          ))}
        </div>
      </div>

      {settings.calendar_view ? (
        <div className="calendar-view-section">
          <div className="section-header-row">
            <h3 className="section-title">Cycle Calendar ({L}-Day Rotation)</h3>
            <span className="badge badge-outline">48h Recovery Spacing</span>
          </div>
          <div className="cycle-calendar-grid">
            {calendarDays.map(({ dayNumber, isTraining, session }) => {
              if (isTraining && session) {
                const totalSets = session.blocks.reduce((acc, b) => acc + b.sets, 0);
                return (
                  <div key={dayNumber} className="calendar-day-card training-day card">
                    <div className="calendar-day-badge">Day {dayNumber} • Training</div>
                    <div className="session-card-header">
                      <h4>Session {session.session_number}</h4>
                      <span className="badge badge-primary">{totalSets} Sets</span>
                    </div>

                    <div className="focus-pills">
                      {session.focus.map((muscle) => (
                        <span key={muscle} className="pill pill-focus">
                          {muscle.toUpperCase()}
                        </span>
                      ))}
                    </div>

                    <div className="session-blocks-summary">
                      {session.blocks.map((b, idx) => (
                        <div key={idx} className="block-summary-item">
                          <span className="block-name">{b.exercise_id.replace(/_/g, ' ')}</span>
                          <span className="block-sets">{b.sets} sets</span>
                        </div>
                      ))}
                    </div>

                    <button
                      className="btn btn-primary btn-block mt-3"
                      onClick={() => onSelectSession(session.session_number)}
                    >
                      Start Session {session.session_number} →
                    </button>
                  </div>
                );
              }

              return (
                <div key={dayNumber} className="calendar-day-card rest-day card">
                  <div className="calendar-day-badge">Day {dayNumber} • Rest</div>
                  <div className="calendar-rest-content">
                    <span className="calendar-rest-icon">😴</span>
                    <h4>Rest & Recovery</h4>
                    <p className="calendar-rest-desc">
                      Muscle protein synthesis & neural recovery (48h window).
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="queue-view-section">
          <h3 className="section-title">Sessions in Queue</h3>
          <div className="sessions-grid">
            {plan.sessions.map((session) => (
              <div key={session.session_number} className="card session-card">
                <div className="session-card-header">
                  <h4>Session {session.session_number}</h4>
                  <span className="badge badge-primary">
                    {session.blocks.reduce((acc, b) => acc + b.sets, 0)} Total Sets
                  </span>
                </div>

                <div className="focus-pills">
                  {session.focus.map((muscle) => (
                    <span key={muscle} className="pill pill-focus">
                      {muscle.toUpperCase()}
                    </span>
                  ))}
                </div>

                <div className="session-blocks-summary">
                  {session.blocks.map((b, idx) => (
                    <div key={idx} className="block-summary-item">
                      <span className="block-name">
                        {b.exercise_id.replace(/_/g, ' ')}
                      </span>
                      <span className="block-sets">{b.sets} sets</span>
                    </div>
                  ))}
                </div>

                <button
                  className="btn btn-primary btn-block mt-3"
                  onClick={() => onSelectSession(session.session_number)}
                >
                  Start Session {session.session_number} →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
