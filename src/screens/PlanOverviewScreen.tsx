import React, { useState } from 'react';
import { api } from '../api';
import { Plan, Settings } from '../types';

interface PlanOverviewScreenProps {
  plan: Plan;
  settings: Settings;
  onSelectSession: (sessionNumber: number) => void;
  onRefreshPlan: () => void;
  onOpenSettings: () => void;
}

export const PlanOverviewScreen: React.FC<PlanOverviewScreenProps> = ({
  plan,
  settings,
  onSelectSession,
  onRefreshPlan,
  onOpenSettings,
}) => {
  const [regenerating, setRegenerating] = useState(false);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await api.generatePlan();
      onRefreshPlan();
    } catch (err) {
      alert(`Regeneration failed: ${err}`);
    } finally {
      setRegenerating(false);
    }
  };

  // Build calendar days mapping when calendar_view is active
  const L = plan.cycle.length_days;
  const S = plan.cycle.sessions_count;
  const sessionDayMap = new Map<number, typeof plan.sessions[0]>();

  if (settings.calendar_view && S > 0) {
    plan.sessions.forEach((session, sIdx) => {
      const dayIndex = Math.floor((sIdx * L) / S);
      sessionDayMap.set(dayIndex, session);
    });
  }

  const calendarDays = Array.from({ length: L }, (_, dIdx) => {
    const session = sessionDayMap.get(dIdx);
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
