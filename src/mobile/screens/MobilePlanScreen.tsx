import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { CompletedSession, Plan, Settings } from '../../types';
import {
  buildCyclePattern,
  deriveCycleAnchorFromHistory,
  resolveEffectiveAnchorKey,
  toLocalDateKey,
} from '../../utils/cycle';
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
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    api.getSessionHistory().then(setHistory).catch(console.error);
  }, [plan]);

  const cyclePattern = buildCyclePattern(plan);
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

  // Build 10-day ribbon (-3 to +6)
  const ribbonOffsets = [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6];
  const ribbonDays = ribbonOffsets.map((offset) => {
    const d = new Date(todayMidnight);
    d.setDate(d.getDate() + offset);
    const dateKey = toLocalDateKey(d);

    const diffDays = Math.floor(
      (d.getTime() - anchorMidnight.getTime()) / (1000 * 60 * 60 * 24)
    );
    const cycleDayIndex = ((diffDays % cyclePattern.length) + cyclePattern.length) % cyclePattern.length;
    const scheduledSess = cyclePattern[cycleDayIndex];
    const scheduledSessNum = scheduledSess ? scheduledSess.session_number : null;
    const logged = historyByDate.get(dateKey) || [];

    const isToday = offset === 0;
    const isCompleted = logged.length > 0;
    const isRest = scheduledSess === null;

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
    };
  });

  // Selected day details
  const selectedDay = ribbonDays.find((r) => r.offset === selectedDayOffset) || ribbonDays[3];

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

  return (
    <div className="mobile-view-container">
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

      {/* 10-Day Touch Ribbon */}
      <div className="m-grouped-section" style={{ marginBottom: '1rem' }}>
        <div className="m-section-title">Schedule & History</div>
        <div className="m-ribbon-strip">
          {ribbonDays.map((node) => (
            <div
              key={node.offset}
              className={`m-ribbon-node ${node.isToday ? 'today' : ''} ${
                node.offset === selectedDayOffset ? 'selected' : ''
              }`}
              onClick={() => setSelectedDayOffset(node.offset)}
            >
              <span className="m-node-day">{node.dayName}</span>
              <span className="m-node-num">{node.dayNum}</span>
              <div
                className={`m-node-status-dot ${
                  node.isCompleted ? 'completed' : node.isRest ? 'rest' : 'workout'
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

        {selectedDay.scheduledSessNum !== null ? (
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

                <button
                  type="button"
                  className="m-btn m-btn-primary"
                  onClick={() => onSelectSession(sessNumber)}
                >
                  ▶ Start Session {sessNumber}
                </button>
              </div>
            );
          })()
        ) : (
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
                  <span className="m-row-value">Start ›</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent History Section */}
      {history.length > 0 && (
        <div className="m-grouped-section">
          <div className="m-section-title">Recent Completed Workouts</div>
          <div className="m-inset-list">
            {history.slice(0, 5).map((sess) => {
              const d = new Date(sess.timestamp);
              return (
                <div
                  key={sess.id}
                  className="m-list-row m-list-row-clickable"
                  onClick={() => {
                    setEditingSession(sess);
                    setEditSheetOpen(true);
                  }}
                >
                  <div className="m-row-left">
                    <span className="m-row-icon" style={{ color: 'var(--m-green)' }}>✓</span>
                    <div>
                      <div className="m-row-label">
                        Session {sess.session_number}
                      </div>
                      <div className="m-row-sublabel">
                        {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} • {sess.total_sets} sets logged
                      </div>
                    </div>
                  </div>
                  <div className="m-row-right">
                    <span style={{ fontSize: '0.8rem', color: 'var(--m-text-muted)' }}>Edit</span>
                    <span className="m-row-chevron">›</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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

      {/* Edit Session Sheet */}
      <MobileEditSessionSheet
        isOpen={editSheetOpen}
        onClose={() => setEditSheetOpen(false)}
        sessionToEdit={editingSession}
        onSaved={() => {
          api.getSessionHistory().then(setHistory).catch(console.error);
          onRefreshPlan();
        }}
      />
    </div>
  );
};
