import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api';
import { CompletedSession, Plan, Settings } from '../../types';
import {
  buildCyclePattern,
  deriveCycleAnchorFromHistory,
  resolveEffectiveAnchorKey,
  toLocalDateKey,
} from '../../utils/cycle';
import { BottomSheet } from '../components/BottomSheet';
import { MobileEditSessionSheet } from '../components/MobileEditSessionSheet';

interface MobilePlanScreenProps {
  plan: Plan;
  settings: Settings;
  onSelectSession: (sessionNumber: number) => void;
  onRefreshPlan: () => void;
  onOpenSettings: () => void;
}

export const MobilePlanScreen: React.FC<MobilePlanScreenProps> = ({
  plan,
  settings: _settings,
  onSelectSession,
  onRefreshPlan,
  onOpenSettings: _onOpenSettings,
}) => {
  const [history, setHistory] = useState<CompletedSession[]>([]);
  const [selectedDayOffset, setSelectedDayOffset] = useState<number>(0); // 0 = today
  const [editingSession, setEditingSession] = useState<CompletedSession | null>(null);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editSheetInitialDate, setEditSheetInitialDate] = useState<string | undefined>();
  const [editSheetInitialSessionNum, setEditSheetInitialSessionNum] = useState<number | undefined>();

  const [calibSheetOpen, setCalibSheetOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [customCalibDate, setCustomCalibDate] = useState<string>('');

  const ribbonStripRef = useRef<HTMLDivElement>(null);
  const todayNodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getSessionHistory().then(setHistory).catch(console.error);
  }, [plan]);

  // Auto-scroll ribbon strip to Today on mount
  useEffect(() => {
    if (todayNodeRef.current && ribbonStripRef.current) {
      const strip = ribbonStripRef.current;
      const node = todayNodeRef.current;
      const scrollPos = node.offsetLeft - strip.offsetWidth / 2 + node.offsetWidth / 2;
      strip.scrollTo({ left: Math.max(0, scrollPos), behavior: 'smooth' });
    }
  }, []);

  const cyclePattern = useMemo(() => buildCyclePattern(plan), [plan]);
  const isManualAnchor = localStorage.getItem('mgp_cycle_anchor_manual') === 'true';
  const effectiveAnchorKey = resolveEffectiveAnchorKey({
    anchorKey: localStorage.getItem('mgp_cycle_anchor_date') || undefined,
    isManual: isManualAnchor,
    history,
    cyclePattern,
  });

  const [aY, aM, aD] = effectiveAnchorKey.split('-').map(Number);
  const anchorMidnight = new Date(aY, (aM || 1) - 1, aD || 1, 0, 0, 0, 0);
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  // Group history by local date key
  const historyByDate = new Map<string, CompletedSession[]>();
  history.forEach((sess) => {
    const key = toLocalDateKey(new Date(sess.timestamp));
    const list = historyByDate.get(key) || [];
    list.push(sess);
    historyByDate.set(key, list);
  });

  // Build 14-day ribbon (-10 to +3)
  const ribbonOffsets = [-10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3];
  let elapsedTrainingDays = 0;
  let completedDaysCount = 0;

  const ribbonDays = ribbonOffsets.map((offset) => {
    const d = new Date(todayMidnight);
    d.setDate(d.getDate() + offset);
    const dateKey = toLocalDateKey(d);

    const diffDays = Math.round(
      (d.getTime() - anchorMidnight.getTime()) / (1000 * 60 * 60 * 24)
    );
    const cycleDayIndex = ((diffDays % cyclePattern.length) + cyclePattern.length) % cyclePattern.length;
    const scheduledSess = cyclePattern[cycleDayIndex];
    const scheduledSessNum = scheduledSess ? scheduledSess.session_number : null;
    const logged = historyByDate.get(dateKey) || [];

    const isToday = offset === 0;
    const isCompleted = logged.length > 0;
    const isRest = scheduledSess === null;
    const isMissed = offset < 0 && diffDays >= 0 && !isCompleted && !isRest;

    if (diffDays >= 0 && offset <= 0 && (!isRest || isCompleted)) {
      elapsedTrainingDays++;
      if (isCompleted) {
        completedDaysCount++;
      }
    }

    return {
      offset,
      date: d,
      dateKey,
      dayName: d.toLocaleDateString(undefined, { weekday: 'short' }),
      dayNum: d.getDate(),
      scheduledSess,
      scheduledSessNum,
      logged,
      isToday,
      isCompleted,
      isRest,
      isMissed,
      diffDays,
    };
  });

  const consistencyPct =
    elapsedTrainingDays > 0 ? Math.round((completedDaysCount / elapsedTrainingDays) * 100) : 100;

  // Selected day details
  const selectedDay = ribbonDays.find((r) => r.offset === selectedDayOffset) || ribbonDays[10];

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await api.generatePlan();
      const derived = deriveCycleAnchorFromHistory(history, cyclePattern);
      if (derived) {
        localStorage.setItem('mgp_cycle_anchor_date', derived);
      }
      onRefreshPlan();
    } catch (err) {
      alert(`Regeneration failed: ${err}`);
    } finally {
      setRegenerating(false);
    }
  };

  const handleApplyCalibrationDate = (dateKey: string, isManual: boolean) => {
    localStorage.setItem('mgp_cycle_anchor_date', dateKey);
    localStorage.setItem('mgp_cycle_anchor_manual', isManual ? 'true' : 'false');
    setCalibSheetOpen(false);
    onRefreshPlan();
  };

  const handleAutoSync = () => {
    const derived = deriveCycleAnchorFromHistory(history, cyclePattern);
    const key = derived || toLocalDateKey(todayMidnight);
    handleApplyCalibrationDate(key, false);
  };

  const getSessionDraftCount = (sessionNum: number): number => {
    try {
      const raw = sessionStorage.getItem(`mgp_active_session_${sessionNum}`);
      if (!raw) return 0;
      const parsed = JSON.parse(raw);
      return Object.values(parsed).reduce(
        (acc: number, list: any) => acc + (Array.isArray(list) ? list.length : 0),
        0
      );
    } catch {
      return 0;
    }
  };

  return (
    <div className="mobile-view-container">
      {/* Deload Active Banner & Restore Action */}
      {plan.is_deload && (
        <div
          className="m-card"
          style={{
            background: 'rgba(6, 182, 212, 0.15)',
            border: '1px solid rgba(6, 182, 212, 0.4)',
            marginBottom: '1rem',
            padding: '1rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
            <div>
              <h4 style={{ color: 'var(--m-cyan)', margin: '0 0 0.25rem', fontSize: '0.95rem' }}>
                Deload Cycle Active 🔄
              </h4>
              <p style={{ fontSize: '0.82rem', color: 'var(--m-text-muted)', margin: 0 }}>
                You are on a lighter recovery cycle. Ready to restore your full training volume?
              </p>
            </div>
            <button
              type="button"
              className="m-btn m-btn-primary"
              style={{ width: 'auto', padding: '0 0.85rem', height: '36px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
              onClick={async () => {
                await api.restoreDeloadPlan();
                onRefreshPlan();
              }}
            >
              Restore Full Plan
            </button>
          </div>
        </div>
      )}

      {/* Engine Alerts */}
      {(plan.cycle.is_adjusted || plan.maintenance_dropped) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
          {plan.cycle.is_adjusted && (
            <div
              style={{
                padding: '0.55rem 0.85rem',
                borderRadius: 'var(--m-radius-sm)',
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                color: 'var(--m-amber)',
                fontSize: '0.8rem',
                fontWeight: 600,
                lineHeight: 1.35,
              }}
            >
              ⚠️ Cycle Adjusted: A rest day was automatically inserted into the cycle to respect your recovery limits.
            </div>
          )}
          {plan.maintenance_dropped && (
            <div
              style={{
                padding: '0.55rem 0.85rem',
                borderRadius: 'var(--m-radius-sm)',
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                color: 'var(--m-amber)',
                fontSize: '0.8rem',
                fontWeight: 600,
                lineHeight: 1.35,
              }}
            >
              ⚠️ Maintenance Sets Reduced: Non-priority maintenance sets were scaled down to honor your target sets per workout limit.
            </div>
          )}
        </div>
      )}

      {/* Macrocycle Progress Pill Banner */}
      <div
        className="m-card"
        style={{
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(6, 182, 212, 0.1))',
          border: '1px solid var(--m-border-active)',
          padding: '1rem',
          marginBottom: '1rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--m-cyan)', textTransform: 'uppercase' }}>
              Cycle Overview
            </span>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0.2rem 0', color: 'var(--m-text-main)' }}>
              {plan.cycle.length_days}-Day Hypertrophy Cycle
            </h3>
          </div>
          <span
            style={{
              padding: '0.25rem 0.65rem',
              borderRadius: '999px',
              fontSize: '0.75rem',
              fontWeight: 700,
              background: plan.is_deload ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
              color: plan.is_deload ? 'var(--m-amber)' : 'var(--m-green)',
            }}
          >
            {plan.is_deload ? 'Deload Active' : 'Full Volume'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', fontSize: '0.82rem', color: 'var(--m-text-muted)' }}>
          <span>🏋️ {plan.sessions.length} Sessions</span>
          <span>📅 {plan.cycle.sessions_count} Workouts</span>
          <span>💤 {Math.max(0, plan.cycle.length_days - plan.cycle.sessions_count)} Rest Days</span>
        </div>
      </div>

      {/* 14-Day Touch Ribbon */}
      <div className="m-grouped-section" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <div className="m-section-title" style={{ margin: 0 }}>Schedule & History</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span
              style={{
                fontSize: '0.72rem',
                padding: '0.15rem 0.5rem',
                borderRadius: '999px',
                background: consistencyPct >= 80 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                color: consistencyPct >= 80 ? 'var(--m-green)' : 'var(--m-amber)',
                fontWeight: 700,
              }}
            >
              {consistencyPct}% Consistency
            </span>
            <button
              type="button"
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                borderRadius: 'var(--m-radius-sm)',
                padding: '0.2rem 0.45rem',
                fontSize: '0.82rem',
                color: 'var(--m-text-main)',
                cursor: 'pointer',
              }}
              onClick={() => {
                setCustomCalibDate(effectiveAnchorKey);
                setCalibSheetOpen(true);
              }}
              title="Calibrate Cycle Start Date"
            >
              ⚙️
            </button>
          </div>
        </div>

        <div className="m-ribbon-strip" ref={ribbonStripRef}>
          {ribbonDays.map((node) => (
            <div
              key={node.offset}
              ref={node.isToday ? todayNodeRef : undefined}
              className={`m-ribbon-node ${node.isToday ? 'today' : ''} ${
                node.offset === selectedDayOffset ? 'selected' : ''
              }`}
              onClick={() => setSelectedDayOffset(node.offset)}
            >
              <span className="m-node-day">{node.dayName}</span>
              <span className="m-node-num">{node.dayNum}</span>
              <div
                className={`m-node-status-dot ${
                  node.isCompleted
                    ? 'completed'
                    : node.isMissed
                    ? 'missed'
                    : node.isRest
                    ? 'rest'
                    : 'workout'
                }`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Selected Day Action Card */}
      <div className="m-grouped-section">
        <div className="m-section-title">
          {selectedDay.isToday ? "Today's Schedule" : `Selected: ${selectedDay.dayName}, ${selectedDay.date.toLocaleDateString()}`}
        </div>

        {/* Case A: Workout was completed on selected day */}
        {selectedDay.logged.length > 0 ? (
          (() => {
            const loggedSess = selectedDay.logged[0];
            return (
              <div className="m-card" style={{ border: '1px solid rgba(16, 185, 129, 0.4)', padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--m-green)', textTransform: 'uppercase' }}>
                      ✓ Completed Workout
                    </span>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0.2rem 0' }}>
                      Session {loggedSess.session_number}: {loggedSess.focus.join(' & ')}
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--m-text-muted)', margin: '0.25rem 0 0.75rem' }}>
                      {loggedSess.total_sets} Sets Logged Across {loggedSess.exercises_summary.length} Exercises
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', margin: '0.5rem 0 1.25rem' }}>
                  {loggedSess.exercises_summary.map((ex) => (
                    <span
                      key={ex.exercise_id}
                      style={{
                        fontSize: '0.75rem',
                        background: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                        padding: '0.25rem 0.6rem',
                        borderRadius: '6px',
                        color: 'var(--m-green)',
                      }}
                    >
                      {ex.exercise_name} ({ex.sets_completed}s • avg RIR {ex.avg_rir.toFixed(1)})
                    </span>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="m-btn m-btn-secondary"
                    style={{ flex: 1 }}
                    onClick={() => {
                      setEditingSession(loggedSess);
                      setEditSheetInitialDate(undefined);
                      setEditSheetInitialSessionNum(undefined);
                      setEditSheetOpen(true);
                    }}
                  >
                    ✏️ Edit Logged Numbers
                  </button>
                  <button
                    type="button"
                    className="m-btn m-btn-primary"
                    style={{ flex: 1 }}
                    onClick={() => onSelectSession(loggedSess.session_number)}
                  >
                    Repeat Session ›
                  </button>
                </div>
              </div>
            );
          })()
        ) : selectedDay.isMissed ? (
          /* Case B: Past scheduled training day missed */
          (() => {
            const sessNumber = selectedDay.scheduledSessNum || 1;
            const sess = plan.sessions.find((s) => s.session_number === sessNumber);
            return (
              <div className="m-card" style={{ border: '1px solid rgba(239, 68, 68, 0.4)', padding: '1.25rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--m-red)', textTransform: 'uppercase' }}>
                  ⚠️ Missed Training Day
                </span>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0.2rem 0' }}>
                  Session {sessNumber}: {sess?.focus.join(' & ') || `Session ${sessNumber}`}
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--m-text-muted)', margin: '0.25rem 0 1rem' }}>
                  This workout was scheduled on {selectedDay.dayName}, {selectedDay.date.toLocaleDateString()} but has no recorded set logs.
                </p>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="m-btn m-btn-secondary"
                    style={{ flex: 1 }}
                    onClick={() => {
                      setEditingSession(null);
                      setEditSheetInitialDate(selectedDay.dateKey);
                      setEditSheetInitialSessionNum(sessNumber);
                      setEditSheetOpen(true);
                    }}
                  >
                    📝 Log Past Workout
                  </button>
                  <button
                    type="button"
                    className="m-btn m-btn-primary"
                    style={{ flex: 1 }}
                    onClick={() => onSelectSession(sessNumber)}
                  >
                    Start Session Now ›
                  </button>
                </div>
              </div>
            );
          })()
        ) : selectedDay.scheduledSessNum !== null ? (
          /* Case C: Upcoming or today's scheduled workout */
          (() => {
            const sessNumber = selectedDay.scheduledSessNum;
            const sess = plan.sessions.find((s) => s.session_number === sessNumber);
            const totalSets = sess ? sess.blocks.reduce((acc, b) => acc + b.sets, 0) : 0;
            return (
              <div className="m-card" style={{ border: '1px solid var(--m-border-active)', padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--m-primary)', textTransform: 'uppercase' }}>
                      Session {sessNumber}
                    </span>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0.2rem 0' }}>
                      {sess ? sess.focus.join(' & ') : `Session ${sessNumber}`}
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--m-text-muted)', margin: '0.25rem 0 0.75rem' }}>
                      {sess ? sess.blocks.length : 0} Exercises • {totalSets} Total Sets
                    </p>
                  </div>
                </div>

                {sess && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', margin: '0.5rem 0 1.25rem' }}>
                    {sess.blocks.map((b) => (
                      <span
                        key={b.exercise_id}
                        style={{
                          fontSize: '0.75rem',
                          background: 'rgba(255, 255, 255, 0.06)',
                          padding: '0.25rem 0.6rem',
                          borderRadius: '6px',
                          color: 'var(--m-text-main)',
                        }}
                      >
                        {b.exercise_id.replace(/_/g, ' ')} ({b.sets}s)
                      </span>
                    ))}
                  </div>
                )}

                {(() => {
                  const draftSets = getSessionDraftCount(sessNumber);
                  return draftSets > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <button
                        type="button"
                        className="m-btn m-btn-success"
                        style={{ height: '48px', fontWeight: 800 }}
                        onClick={() => onSelectSession(sessNumber)}
                      >
                        ▶ Resume Session {sessNumber} ({draftSets} sets logged)
                      </button>
                      <button
                        type="button"
                        className="m-btn m-btn-secondary"
                        style={{ height: '38px', fontSize: '0.8rem' }}
                        onClick={() => onSelectSession(sessNumber)}
                      >
                        Restart / Edit Session
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="m-btn m-btn-primary"
                      onClick={() => onSelectSession(sessNumber)}
                    >
                      ▶ Start Session {sessNumber}
                    </button>
                  );
                })()}
              </div>
            );
          })()
        ) : (
          /* Case D: Scheduled Rest Day */
          <div className="m-card" style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
            <span style={{ fontSize: '2.5rem' }}>💤</span>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0.5rem 0 0.25rem' }}>
              Rest & Recovery Day
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--m-text-muted)', margin: 0 }}>
              No workout scheduled. Muscle protein synthesis and central fatigue recovery in progress.
            </p>
          </div>
        )}
      </div>

      {/* Cycle Sessions List */}
      <div className="m-grouped-section">
        <div className="m-section-title">All Sessions in Cycle</div>
        <div className="m-inset-list">
          {plan.sessions.map((sess) => {
            const setsCount = sess.blocks.reduce((acc, b) => acc + b.sets, 0);
            const draftSets = getSessionDraftCount(sess.session_number);
            return (
              <div
                key={sess.session_number}
                className="m-list-row m-list-row-clickable"
                onClick={() => onSelectSession(sess.session_number)}
              >
                <div className="m-row-left">
                  <span className="m-row-icon">🏋️</span>
                  <div>
                    <div className="m-row-label">
                      Session {sess.session_number}: {sess.focus.join(' & ')}
                    </div>
                    <div className="m-row-sublabel">
                      {sess.blocks.length} exercises • {setsCount} sets
                    </div>
                  </div>
                </div>
                <div className="m-row-right">
                  {draftSets > 0 ? (
                    <span style={{ color: 'var(--m-green)', fontSize: '0.78rem', fontWeight: 800 }}>
                      Resume ({draftSets}s) ›
                    </span>
                  ) : (
                    <span className="m-row-value">Start ›</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Plan Refresh / Reset button */}
      <div style={{ marginTop: '1.5rem', marginBottom: '2rem' }}>
        <button
          type="button"
          className="m-btn m-btn-secondary"
          onClick={handleRegenerate}
          disabled={regenerating}
        >
          {regenerating ? 'Regenerating...' : '🔄 Rebalance Plan Schedule'}
        </button>
      </div>

      {/* Cycle Anchor Calibration BottomSheet */}
      <BottomSheet
        isOpen={calibSheetOpen}
        onClose={() => setCalibSheetOpen(false)}
        title="Calibrate Cycle Start Date"
        id="calib-sheet"
      >
        <div style={{ padding: '0.5rem 0' }}>
          <p style={{ color: 'var(--m-text-muted)', fontSize: '0.88rem', lineHeight: 1.4, margin: '0 0 1rem' }}>
            Adjust which calendar day aligns with Cycle Day 1. This re-positions your rest days and upcoming sessions without altering your volume budget.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button
              type="button"
              className="m-btn m-btn-secondary"
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '0.75rem 1rem' }}
              onClick={handleAutoSync}
            >
              🔄 Auto-Sync with Latest Workout
            </button>
            <button
              type="button"
              className="m-btn m-btn-secondary"
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '0.75rem 1rem' }}
              onClick={() => handleApplyCalibrationDate(toLocalDateKey(todayMidnight), true)}
            >
              🎯 Start Cycle Today ({todayMidnight.toLocaleDateString()})
            </button>
            <button
              type="button"
              className="m-btn m-btn-secondary"
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '0.75rem 1rem' }}
              onClick={() => {
                const y = new Date(todayMidnight);
                y.setDate(y.getDate() - 1);
                handleApplyCalibrationDate(toLocalDateKey(y), true);
              }}
            >
              ⏮️ Started Yesterday
            </button>
            <button
              type="button"
              className="m-btn m-btn-secondary"
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '0.75rem 1rem' }}
              onClick={() => {
                const twoDays = new Date(todayMidnight);
                twoDays.setDate(twoDays.getDate() - 2);
                handleApplyCalibrationDate(toLocalDateKey(twoDays), true);
              }}
            >
              ⏮️ Started 2 Days Ago
            </button>
          </div>

          <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--m-border)' }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--m-text-muted)', display: 'block', marginBottom: '0.4rem' }}>
              Or pick specific Day 1 Anchor Date:
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="date"
                value={customCalibDate}
                onChange={(e) => setCustomCalibDate(e.target.value)}
                style={{
                  flex: 1,
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid var(--m-border)',
                  borderRadius: 'var(--m-radius-sm)',
                  padding: '0.6rem',
                  color: 'var(--m-text-main)',
                  fontSize: '0.9rem',
                }}
              />
              <button
                type="button"
                className="m-btn m-btn-primary"
                style={{ width: 'auto', padding: '0 1rem' }}
                onClick={() => {
                  if (customCalibDate) {
                    handleApplyCalibrationDate(customCalibDate, true);
                  }
                }}
              >
                Set
              </button>
            </div>
          </div>
        </div>
      </BottomSheet>

      {/* Edit Session Sheet */}
      <MobileEditSessionSheet
        isOpen={editSheetOpen}
        onClose={() => setEditSheetOpen(false)}
        sessionToEdit={editingSession}
        initialDate={editSheetInitialDate}
        initialSessionNumber={editSheetInitialSessionNum}
        plan={plan}
        units={_settings.units}
        onSaved={() => {
          api.getSessionHistory().then(setHistory).catch(console.error);
          onRefreshPlan();
        }}
      />
    </div>
  );
};
