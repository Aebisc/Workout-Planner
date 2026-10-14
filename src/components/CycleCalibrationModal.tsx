import React, { useMemo, useState } from 'react';
import { CompletedSession, Plan } from '../types';

interface CycleCalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: Plan;
  currentAnchorDate: string; // YYYY-MM-DD
  history?: CompletedSession[];
  onSaveAnchorDate: (newDate: string) => void;
  onOpenEditSession?: (session: CompletedSession | null, dateKey?: string, sessionNum?: number) => void;
}

function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export const CycleCalibrationModal: React.FC<CycleCalibrationModalProps> = ({
  isOpen,
  onClose,
  plan,
  currentAnchorDate,
  history,
  onSaveAnchorDate,
  onOpenEditSession,
}) => {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const todayKey = useMemo(() => toLocalDateKey(today), [today]);

  const [anchorInput, setAnchorInput] = useState<string>(currentAnchorDate || todayKey);
  const [savedStatus, setSavedStatus] = useState<boolean>(false);

  // Cycle dimensions
  const L = Math.max(1, plan.cycle.length_days);
  const S = plan.cycle.sessions_count;

  // Build cycle pattern array (length L)
  const cyclePattern = useMemo(() => {
    const pattern: Array<typeof plan.sessions[0] | null> = Array(L).fill(null);
    if (S > 0) {
      plan.sessions.forEach((sess, sIdx) => {
        const dayIndex = Math.floor((sIdx * L) / S);
        pattern[dayIndex] = sess;
      });
    }
    return pattern;
  }, [plan.sessions, L, S]);

  // Derive preview based on currently selected anchorInput
  const { todayCycleDay, todaySession, previewDays, daysFromToday } = useMemo(() => {
    const [aY, aM, aD] = (anchorInput || todayKey).split('-').map(Number);
    const anchorMidnight = new Date(aY, (aM || 1) - 1, aD || 1, 0, 0, 0, 0);

    const diffDays = Math.round((today.getTime() - anchorMidnight.getTime()) / 86_400_000);
    const todayCycleIdx = ((diffDays % L) + L) % L;
    const sess = cyclePattern[todayCycleIdx];

    // Mini 4-day forecast starting Today
    const forecast = [0, 1, 2, 3].map((offset) => {
      const d = new Date(today);
      d.setDate(today.getDate() + offset);
      const dDiff = Math.round((d.getTime() - anchorMidnight.getTime()) / 86_400_000);
      const cIdx = ((dDiff % L) + L) % L;
      const scheduled = cyclePattern[cIdx];
      return {
        offset,
        date: d,
        isToday: offset === 0,
        cycleDayNum: cIdx + 1,
        scheduled,
      };
    });

    return {
      todayCycleDay: todayCycleIdx + 1,
      todaySession: sess,
      previewDays: forecast,
      daysFromToday: diffDays,
    };
  }, [anchorInput, todayKey, today, L, cyclePattern]);

  const sessionOnAnchor = useMemo(() => {
    return history?.find((s) => toLocalDateKey(new Date(s.timestamp)) === anchorInput);
  }, [history, anchorInput]);

  if (!isOpen) return null;

  // Quick preset options
  const presets = [
    {
      label: 'Today',
      sub: 'Day 1 is Today',
      getKey: () => todayKey,
    },
    {
      label: 'Yesterday',
      sub: 'Started yesterday',
      getKey: () => {
        const d = new Date(today);
        d.setDate(d.getDate() - 1);
        return toLocalDateKey(d);
      },
    },
    {
      label: '2 Days Ago',
      sub: 'Started 2d ago',
      getKey: () => {
        const d = new Date(today);
        d.setDate(d.getDate() - 2);
        return toLocalDateKey(d);
      },
    },
    {
      label: 'Start of Week',
      sub: 'Most recent Monday',
      getKey: () => {
        const d = new Date(today);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        return toLocalDateKey(d);
      },
    },
  ];

  const handleApply = () => {
    if (!anchorInput) return;
    onSaveAnchorDate(anchorInput);
    setSavedStatus(true);
    setTimeout(() => {
      setSavedStatus(false);
      onClose();
    }, 600);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modern-calib-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modern-calib-header">
          <div className="calib-header-badge">
            <span className="calib-icon-spark">⚡</span>
            <div>
              <h3 className="calib-modal-title">Cycle Calibration</h3>
              <p className="calib-modal-subtitle">
                Align <strong>Day 1 (Session 1)</strong> with your calendar to sync workouts and rest days
              </p>
            </div>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Close modal">✕</button>
        </div>

        <div className="modern-calib-body">
          {/* Cycle Architecture Pill */}
          <div className="calib-cycle-banner">
            <div className="calib-cycle-info">
              <span className="calib-cycle-label">Active Training Cycle</span>
              <span className="calib-cycle-val">
                {plan.cycle.sessions_count} Workouts / {plan.cycle.length_days} Days
              </span>
            </div>
            <span className="badge badge-primary">
              {Math.round((plan.cycle.sessions_count / plan.cycle.length_days) * 100)}% Density
            </span>
          </div>

          {/* Quick Presets */}
          <div className="calib-section-box">
            <label className="calib-input-label">Quick Anchor Presets</label>
            <div className="calib-presets-grid">
              {presets.map((preset) => {
                const pKey = preset.getKey();
                const isActive = anchorInput === pKey;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    className={`calib-preset-card ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      setAnchorInput(pKey);
                      setSavedStatus(false);
                    }}
                  >
                    <span className="preset-title">{preset.label}</span>
                    <span className="preset-sub">{preset.sub}</span>
                    {isActive && <span className="preset-active-dot" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date Picker Input */}
          <div className="calib-section-box">
            <div className="calib-label-row">
              <label className="calib-input-label" htmlFor="anchor-date-input">
                Custom Cycle Start Date (Day 1)
              </label>
              <span className="calib-formatted-date">
                {formatDateDisplay(anchorInput)}
              </span>
            </div>
            <div className="calib-date-input-wrap">
              <span className="calib-calendar-icon">📅</span>
              <input
                id="anchor-date-input"
                type="date"
                value={anchorInput}
                onChange={(e) => {
                  setAnchorInput(e.target.value);
                  setSavedStatus(false);
                }}
                className="calib-modern-date-input"
              />
            </div>
            {daysFromToday !== 0 && (
              <p className="calib-date-rel-hint">
                {daysFromToday > 0
                  ? `Cycle started ${daysFromToday} day${daysFromToday > 1 ? 's' : ''} ago`
                  : `Cycle will start in ${Math.abs(daysFromToday)} day${Math.abs(daysFromToday) > 1 ? 's' : ''}`}
              </p>
            )}
          </div>

          {/* Anchor Date Session Calibration Card */}
          {sessionOnAnchor ? (
            <div className="calib-anchor-session-card">
              <div className="calib-anchor-sess-info">
                <span className="calib-sess-badge">✓ Logged Workout on this Date</span>
                <span className="calib-sess-title">
                  Session {sessionOnAnchor.session_number}:{' '}
                  {sessionOnAnchor.exercises_summary.map((e) => e.exercise_name).join(', ')} ({sessionOnAnchor.total_sets} sets)
                </span>
                <span className="calib-sess-sub">
                  This workout marks this day with a checkmark on your adherence timeline. You can adjust the exact reps, backpack load, and RIR anytime.
                </span>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  onOpenEditSession?.(sessionOnAnchor, anchorInput, sessionOnAnchor.session_number);
                }}
              >
                ✏️ Modify Workout Numbers
              </button>
            </div>
          ) : anchorInput <= todayKey ? (
            <div className="calib-anchor-session-card calib-anchor-empty">
              <div className="calib-anchor-sess-info">
                <span className="calib-sess-badge calib-badge-neutral">Day 1 Workout Not Logged</span>
                <span className="calib-sess-sub">
                  If you trained on {formatDateDisplay(anchorInput)}, you can input your accurate workout numbers now.
                </span>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  onOpenEditSession?.(null, anchorInput, 1);
                }}
              >
                + Input Workout Numbers
              </button>
            </div>
          ) : null}

          {/* Dynamic Live Preview for Today */}
          <div className={`calib-live-preview ${todaySession ? 'preview-workout' : 'preview-rest'}`}>
            <div className="preview-top-row">
              <span className="preview-tag">
                {todaySession ? '🎯 SCHEDULED TODAY' : '🌙 REST DAY TODAY'}
              </span>
              <span className="preview-cycle-pos">
                Cycle Day {todayCycleDay} of {L}
              </span>
            </div>
            {todaySession ? (
              <div className="preview-content">
                <div className="preview-session-name">
                  Session {todaySession.session_number}:{' '}
                  <span className="preview-muscles">{todaySession.focus.join(', ').toUpperCase()}</span>
                </div>
                <div className="preview-meta">
                  {todaySession.blocks.reduce((acc, b) => acc + b.sets, 0)} total sets across{' '}
                  {todaySession.blocks.length} exercises
                </div>
              </div>
            ) : (
              <div className="preview-content">
                <div className="preview-session-name">Active Recovery / Rest Day</div>
                <div className="preview-meta">
                  No resistance training scheduled for today. Rest, hydrate, and prepare for your next session.
                </div>
              </div>
            )}
          </div>

          {/* 4-Day Sequence Preview */}
          <div className="calib-timeline-preview">
            <span className="calib-timeline-title">Upcoming 4-Day Timeline Preview</span>
            <div className="calib-forecast-grid">
              {previewDays.map((d) => (
                <div
                  key={d.offset}
                  className={`forecast-card ${d.isToday ? 'forecast-today' : ''} ${
                    d.scheduled ? 'is-training' : 'is-rest'
                  }`}
                >
                  <span className="forecast-day-label">
                    {d.isToday ? 'TODAY' : d.date.toLocaleDateString(undefined, { weekday: 'short' })}
                  </span>
                  <span className="forecast-date-num">{d.date.getDate()}</span>
                  <div className="forecast-status-pill">
                    {d.scheduled ? `Sess ${d.scheduled.session_number}` : '🌙 Rest'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="modern-calib-footer">
          <div className="calib-status-slot">
            {savedStatus && (
              <span className="calib-saved-toast">
                ✓ Cycle start date applied!
              </span>
            )}
          </div>
          <div className="calib-btn-group">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm btn-calib-save"
              onClick={handleApply}
            >
              {savedStatus ? '✓ Applied' : 'Save & Align Cycle'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
