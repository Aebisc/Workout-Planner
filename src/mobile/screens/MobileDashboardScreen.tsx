import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { CompletedSession, Exercise, Muscle, Plan, Settings, Warning } from '../../types';
import { BottomSheet } from '../components/BottomSheet';
import { MobileEditSessionSheet } from '../components/MobileEditSessionSheet';

interface MobileDashboardScreenProps {
  plan: Plan | null;
  settings: Settings;
  onPlanUpdated: () => Promise<void>;
}

export const MobileDashboardScreen: React.FC<MobileDashboardScreenProps> = ({
  plan,
  settings,
  onPlanUpdated,
}) => {
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [history, setHistory] = useState<CompletedSession[]>([]);
  const [editingSession, setEditingSession] = useState<CompletedSession | null>(null);
  const [editSheetOpen, setEditSheetOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [deloadLoading, setDeloadLoading] = useState(false);
  const [deloadSuccess, setDeloadSuccess] = useState<string | null>(null);
  const [showDeloadConfirmSheet, setShowDeloadConfirmSheet] = useState(false);

  const fetchHistory = () => {
    api.getSessionHistory().then(setHistory).catch(console.error);
  };

  useEffect(() => {
    fetchHistory();
    Promise.all([api.getWarnings(), api.getExercises()])
      .then(([w, ex]) => {
        setWarnings(w);
        setExercises(ex);
      })
      .finally(() => setLoading(false));
  }, [plan]);

  const handleTriggerDeload = async () => {
    setDeloadLoading(true);
    try {
      await api.triggerDeload();
      await onPlanUpdated();
      setDeloadSuccess('Lighter cycle applied! All session set counts halved.');
    } catch (err) {
      alert(`Failed to trigger deload: ${err}`);
    } finally {
      setDeloadLoading(false);
    }
  };

  const handleRestoreDeload = async () => {
    setDeloadLoading(true);
    try {
      await api.restoreDeloadPlan();
      await onPlanUpdated();
      setDeloadSuccess('Full volume restored! All session set counts restored.');
    } catch (err) {
      alert(`Failed to restore volume: ${err}`);
    } finally {
      setDeloadLoading(false);
    }
  };

  const muscles: Muscle[] = ['chest', 'back', 'biceps', 'triceps', 'forearms', 'abs'];
  const factor = settings.experience === 'under_6_months' ? 0.7 : 1.0;
  const cycleLen = plan ? Math.max(1, plan.cycle.length_days) : 7;
  const weeklyRate = 7.0 / cycleLen;

  const volumeBreakdown = muscles.map((m) => {
    let directSets = 0;
    let indirectSets = 0;

    if (plan) {
      plan.sessions.forEach((s) => {
        s.blocks.forEach((b) => {
          const ex = exercises.find((e) => e.id === b.exercise_id);
          if (ex) {
            if (ex.primary_muscle === m) {
              directSets += b.sets;
            } else {
              const weight = ex.contribution_weights[m] || 0;
              if (weight > 0) {
                indirectSets += b.sets * weight;
              }
            }
          }
        });
      });
    }

    const weeklyDirect = directSets * weeklyRate;
    const weeklyIndirect = indirectSets * weeklyRate;
    const weeklyTotal = weeklyDirect + weeklyIndirect;

    let tier = 'Optimal Growth';
    let badgeClass = 'm-badge-mav';
    let tierColor = 'var(--m-green)';

    if (plan?.is_deload) {
      tier = 'Deload (~50%)';
      badgeClass = 'm-badge-mev';
      tierColor = 'var(--m-cyan)';
    } else if (weeklyTotal < 1.0 * factor) {
      tier = 'Muscle Loss Risk';
      badgeClass = 'm-badge-danger';
      tierColor = 'var(--m-red)';
    } else if (weeklyTotal < 5.0 * factor) {
      tier = 'Maintenance Only';
      badgeClass = 'm-badge-mrv';
      tierColor = 'var(--m-amber)';
    } else if (weeklyTotal < 10.0 * factor) {
      tier = 'Small Growth';
      badgeClass = 'm-badge-mev';
      tierColor = 'var(--m-cyan)';
    } else if (weeklyTotal <= 20.0 * factor) {
      tier = 'Optimal Growth';
      badgeClass = 'm-badge-mav';
      tierColor = 'var(--m-green)';
    } else {
      tier = 'Diminishing Returns';
      badgeClass = 'm-badge-mrv';
      tierColor = '#a855f7';
    }

    const maxScale = Math.max(25, weeklyTotal);
    const directPct = Math.min(100, (weeklyDirect / maxScale) * 100);
    const indirectPct = Math.min(100 - directPct, (weeklyIndirect / maxScale) * 100);

    return {
      muscle: m,
      weeklyDirect,
      weeklyIndirect,
      weeklyTotal,
      tier,
      badgeClass,
      tierColor,
      directPct,
      indirectPct,
      maxScale,
    };
  });

  if (loading) {
    return (
      <div className="mobile-view-container" style={{ padding: '3rem 1rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--m-text-muted)' }}>Calculating volume analytics...</p>
      </div>
    );
  }

  const isDeload = !!plan?.is_deload;

  return (
    <div className="mobile-view-container">
      {/* Deload / Recovery Card */}
      <div
        className="m-card"
        style={{
          border: isDeload ? '1px solid var(--m-amber)' : '1px solid var(--m-border)',
          background: isDeload ? 'rgba(245, 158, 11, 0.1)' : 'var(--m-bg-card)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--m-cyan)', textTransform: 'uppercase' }}>
              Fatigue Management
            </span>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0.2rem 0' }}>
              {isDeload ? 'Lighter Cycle Active' : 'Normal Hypertrophy Cycle'}
            </h3>
          </div>
          <button
            type="button"
            className="m-btn"
            style={{
              height: '38px',
              width: 'auto',
              padding: '0 0.85rem',
              fontSize: '0.82rem',
              background: isDeload ? 'var(--m-green)' : 'rgba(245, 158, 11, 0.2)',
              color: isDeload ? '#fff' : 'var(--m-amber)',
              border: 'none',
            }}
            onClick={isDeload ? handleRestoreDeload : () => setShowDeloadConfirmSheet(true)}
            disabled={deloadLoading}
          >
            {isDeload ? 'Restore Full Volume' : 'Trigger Deload'}
          </button>
        </div>

        {deloadSuccess && (
          <p style={{ fontSize: '0.8rem', color: 'var(--m-green)', marginTop: '0.5rem', marginBottom: 0 }}>
            ✓ {deloadSuccess}
          </p>
        )}
      </div>

      {/* Warnings Banner if any */}
      {warnings.length > 0 && (
        <div className="m-grouped-section">
          <div className="m-section-title">Recovery Alerts</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {warnings.map((w, idx) => (
              <div
                key={idx}
                style={{
                  background: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--m-radius-md)',
                  fontSize: '0.85rem',
                  color: 'var(--m-amber)',
                  display: 'flex',
                  gap: '0.5rem',
                }}
              >
                <span>⚠️</span>
                <span>{w.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hypertrophy Muscle Cards */}
      <div className="m-grouped-section">
        <div className="m-section-title">Weekly Volume Stimulus (7-Day Extrapolated)</div>
        {volumeBreakdown.map((vb) => (
          <div key={vb.muscle} className="m-muscle-card">
            <div className="m-muscle-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span className="m-muscle-name" style={{ textTransform: 'capitalize' }}>{vb.muscle}</span>
                {settings.priority_muscles.includes(vb.muscle) && (
                  <span
                    style={{
                      fontSize: '0.68rem',
                      padding: '0.15rem 0.45rem',
                      borderRadius: '999px',
                      background: 'rgba(99, 102, 241, 0.25)',
                      color: 'var(--m-primary)',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                    }}
                  >
                    Priority
                  </span>
                )}
              </div>
              <span className={`m-muscle-badge ${vb.badgeClass}`} style={{ color: vb.tierColor, borderColor: vb.tierColor }}>
                {vb.tier}
              </span>
            </div>

            {/* Two-tone Stacked Bar with target markers */}
            <div className="m-vol-bar-track" style={{ position: 'relative', overflow: 'hidden' }}>
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${vb.directPct}%`,
                  background: 'var(--m-primary)',
                  transition: 'width 0.3s ease',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: `${vb.directPct}%`,
                  top: 0,
                  bottom: 0,
                  width: `${vb.indirectPct}%`,
                  background: 'var(--m-cyan)',
                  transition: 'left 0.3s ease, width 0.3s ease',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: `${(10 * factor / vb.maxScale) * 100}%`,
                  top: 0,
                  bottom: 0,
                  width: '2px',
                  background: 'rgba(255, 255, 255, 0.35)',
                  zIndex: 2,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: `${(20 * factor / vb.maxScale) * 100}%`,
                  top: 0,
                  bottom: 0,
                  width: '2px',
                  background: 'rgba(255, 255, 255, 0.35)',
                  zIndex: 2,
                }}
              />
            </div>

            <div className="m-vol-meta">
              <span>
                <strong style={{ color: 'var(--m-text-main)' }}>{vb.weeklyTotal.toFixed(1)}</strong> sets/wk ({vb.weeklyDirect.toFixed(1)} dir + {vb.weeklyIndirect.toFixed(1)} ind)
              </span>
              <span style={{ color: 'var(--m-text-subtle)' }}>
                Target: {Math.round(10 * factor)}–{Math.round(20 * factor)}s
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Past Sessions History Section */}
      <div className="m-grouped-section" style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
        <div className="m-section-title">Workout History ({history.length})</div>
        {history.length === 0 ? (
          <div className="m-card" style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
            <p style={{ color: 'var(--m-text-muted)', fontSize: '0.88rem', margin: 0 }}>
              No completed workouts logged yet. Finish a workout to track volume history!
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {history.slice(0, 15).map((sess) => {
              const dateStr = new Date(sess.timestamp).toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              });
              return (
                <div
                  key={sess.id}
                  className="m-card"
                  style={{
                    padding: '0.85rem 1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--m-cyan)' }}>
                          Session {sess.session_number}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--m-text-muted)' }}>
                          • {dateStr}
                        </span>
                      </div>
                      <h4 style={{ margin: '0.15rem 0', fontSize: '0.95rem', color: 'var(--m-text-main)' }}>
                        {sess.focus.join(' & ')}
                      </h4>
                    </div>
                    <button
                      type="button"
                      style={{
                        background: 'rgba(99, 102, 241, 0.15)',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                        color: 'var(--m-cyan)',
                        borderRadius: '4px',
                        padding: '0.25rem 0.55rem',
                        fontSize: '0.78rem',
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

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {sess.exercises_summary.map((ex) => (
                      <span
                        key={ex.exercise_id}
                        style={{
                          fontSize: '0.72rem',
                          background: 'rgba(255, 255, 255, 0.06)',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          color: 'var(--m-text-muted)',
                        }}
                      >
                        {ex.exercise_name} ({ex.sets_completed}s)
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Deload Confirmation Bottom Sheet */}
      <BottomSheet
        isOpen={showDeloadConfirmSheet}
        onClose={() => setShowDeloadConfirmSheet(false)}
        title="Confirm Lighter Cycle"
        id="deload-confirm-sheet"
      >
        <div style={{ padding: '0.75rem 0' }}>
          <p style={{ color: 'var(--m-text-muted)', fontSize: '0.9rem', lineHeight: 1.5, margin: 0 }}>
            Apply a lighter recovery cycle? All session set counts will be halved for one cycle to facilitate systemic and local fatigue dissipation.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button
              type="button"
              className="m-btn m-btn-secondary"
              style={{ flex: 1 }}
              onClick={() => setShowDeloadConfirmSheet(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="m-btn m-btn-primary"
              style={{ flex: 1, background: 'var(--m-amber)', borderColor: 'var(--m-amber)', color: '#000' }}
              onClick={async () => {
                setShowDeloadConfirmSheet(false);
                await handleTriggerDeload();
              }}
            >
              Confirm Deload
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* Edit Session BottomSheet */}
      <MobileEditSessionSheet
        isOpen={editSheetOpen}
        onClose={() => setEditSheetOpen(false)}
        sessionToEdit={editingSession}
        plan={plan || undefined}
        units={settings.units}
        onSaved={async () => {
          fetchHistory();
          await onPlanUpdated();
        }}
      />
    </div>
  );
};
