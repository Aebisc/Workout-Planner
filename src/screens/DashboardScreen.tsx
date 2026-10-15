import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { EditSessionModal } from '../components/EditSessionModal';
import { CompletedSession, Exercise, Muscle, Plan, Settings, Warning } from '../types';
import { formatWeight } from '../utils/units';

interface DashboardScreenProps {
  plan: Plan | null;
  settings: Settings;
  onPlanUpdated: () => Promise<void>;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  plan,
  settings,
  onPlanUpdated,
}) => {
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [sessionHistory, setSessionHistory] = useState<CompletedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingDeload, setConfirmingDeload] = useState<boolean>(false);
  const [deloadSuccess, setDeloadSuccess] = useState<string | null>(null);
  const [deloadLoading, setDeloadLoading] = useState<boolean>(false);
  const [editingSession, setEditingSession] = useState<CompletedSession | null>(null);

  const loadDashboardData = () => {
    Promise.all([api.getWarnings(), api.getExercises(), api.getSessionHistory()])
      .then(([w, ex, history]) => {
        setWarnings(w);
        setExercises(ex);
        setSessionHistory(history);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDashboardData();
  }, [plan]);

  const handleTriggerDeload = async () => {
    setDeloadLoading(true);
    try {
      await api.triggerDeload();
      await onPlanUpdated();
      setConfirmingDeload(false);
      setDeloadSuccess('Lighter cycle (deload) applied successfully! All session set counts are halved for this cycle.');
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
      setDeloadSuccess('Full volume restored! All session set counts have been restored to pre-deload levels.');
    } catch (err) {
      alert(`Failed to restore full volume: ${err}`);
    } finally {
      setDeloadLoading(false);
    }
  };

  // Compute weekly volume breakdown per muscle
  const muscles: Muscle[] = ['chest', 'back', 'biceps', 'triceps', 'forearms', 'abs'];

  const factor = settings.experience === 'under_6_months' ? 0.7 : 1.0;

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

    const cycleLen = plan ? plan.cycle.length_days : 7;
    const weeklyRate = 7.0 / cycleLen;
    const weeklyDirect = directSets * weeklyRate;
    const weeklyIndirect = indirectSets * weeklyRate;
    const weeklyTotal = weeklyDirect + weeklyIndirect;

    let preDeloadTotal: number | undefined = undefined;
    if (plan?.is_deload && plan.pre_deload_sessions) {
      let preDirect = 0;
      let preIndirect = 0;
      plan.pre_deload_sessions.forEach((s) => {
        s.blocks.forEach((b) => {
          const ex = exercises.find((e) => e.id === b.exercise_id);
          if (ex) {
            if (ex.primary_muscle === m) {
              preDirect += b.sets;
            } else {
              const weight = ex.contribution_weights[m] || 0;
              if (weight > 0) {
                preIndirect += b.sets * weight;
              }
            }
          }
        });
      });
      preDeloadTotal = (preDirect + preIndirect) * weeklyRate;
    }

    // Determine Tier
    let tier = 'Optimal Growth';
    let tierClass = 'tier-growth';

    if (plan?.is_deload) {
      tier = 'Deload Recovery (~50%)';
      tierClass = 'badge-info';
    } else if (weeklyTotal < 1.0 * factor) {
      tier = 'Muscle Loss Risk';
      tierClass = 'tier-loss';
    } else if (weeklyTotal < 5.0 * factor) {
      tier = 'Maintenance Only';
      tierClass = 'tier-maint';
    } else if (weeklyTotal < 10.0 * factor) {
      tier = 'Small Growth';
      tierClass = 'tier-small';
    } else if (weeklyTotal > 20.0 * factor) {
      tier = 'Diminishing Returns';
      tierClass = 'tier-diminishing';
    }

    return {
      muscle: m,
      direct: weeklyDirect,
      indirect: weeklyIndirect,
      total: weeklyTotal,
      preDeloadTotal,
      tier,
      tierClass,
      isPriority: settings.priority_muscles.includes(m),
      isLowEvidence: m === 'abs' || m === 'forearms',
    };
  });

  if (loading) {
    return <div className="card text-center">Loading volume metrics...</div>;
  }

  return (
    <div className="dashboard-container">
      <h2>Volume & Hypertrophy Dashboard</h2>
      <p className="subtitle">
        Weekly effective volume calculated as direct sets + indirect weighted stimulus across rolling 7-day cycles.
      </p>

      {settings.experience === 'under_6_months' && (
        <div className="alert alert-info">
          ℹ <strong>Beginner Heuristic Applied:</strong> Volume thresholds are scaled down by ~30% for trainees with under 6 months of experience.
        </div>
      )}

      {/* Warnings Callout */}
      {warnings.length > 0 && (
        <div className="warnings-section">
          <h3>System Warnings & Notices</h3>
          {warnings.map((w, idx) => (
            <div key={idx} className={`alert alert-${w.severity}`}>
              <div className="alert-content">
                <strong>{w.code.replace(/_/g, ' ').toUpperCase()}:</strong> {w.message}
                {w.lower_evidence && (
                  <span className="badge badge-accent ml-2">Lower scientific evidence</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Volume Visualizer Cards */}
      <h3 className="section-title">Weekly Effective Volume by Muscle Group</h3>
      <div className="volume-grid">
        {volumeBreakdown.map((item) => (
          <div
            key={item.muscle}
            className={`card volume-card ${item.isPriority ? 'priority-card' : ''}`}
          >
            <div className="volume-card-header">
              <h4>
                {item.muscle.toUpperCase()}
                {item.isPriority && <span className="badge badge-primary ml-2">Priority</span>}
                {item.isLowEvidence && (
                  <span className="badge badge-outline ml-1">Lower evidence</span>
                )}
              </h4>
              <span className={`badge ${item.tierClass}`}>{item.tier}</span>
            </div>

            <div className="volume-number">
              <span className="val">{item.total.toFixed(1)}</span>
              <span className="unit">
                sets/week {plan?.is_deload && item.preDeloadTotal ? `(Full plan: ${item.preDeloadTotal.toFixed(1)})` : ''}
              </span>
            </div>

            {/* Volume Breakdown Bar with Tier Boundary Markers */}
            <div className="volume-bar-container">
              <div className="volume-track">
                <div
                  className="volume-bar-direct"
                  style={{ width: `${Math.min(100, (item.direct / 25) * 100)}%` }}
                  title={`Direct: ${item.direct.toFixed(1)} sets`}
                />
                <div
                  className="volume-bar-indirect"
                  style={{ width: `${Math.min(100, (item.indirect / 25) * 100)}%` }}
                  title={`Indirect: ${item.indirect.toFixed(1)} sets`}
                />
              </div>
              <div
                className="volume-tick volume-tick-min"
                style={{ left: `${40 * factor}%` }}
                title={`Optimal Growth Min: ${(10 * factor).toFixed(0)} sets`}
              />
              <div
                className="volume-tick volume-tick-max"
                style={{ left: `${80 * factor}%` }}
                title={`Optimal Growth Max: ${(20 * factor).toFixed(0)} sets`}
              />
            </div>

            <div className="volume-legend">
              <span>Direct: {item.direct.toFixed(1)}</span>
              <span className="target-marker-hint">
                Target: {(10 * factor).toFixed(0)}–{(20 * factor).toFixed(0)}
              </span>
              <span>Indirect: {item.indirect.toFixed(1)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Deload Card */}
      <div className="card mt-4">
        {plan?.is_deload ? (
          <div className="overview-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h3 className="mb-0">Recovery & Deload (Lighter Cycle)</h3>
                <span className="badge badge-success">Active Deload Cycle</span>
              </div>
              <p className="subtitle mb-0 mt-1">
                Set volume is currently reduced by 50% for fatigue recovery. You can restore full volume at any time once you feel refreshed.
              </p>
            </div>
            <button
              className="btn btn-primary mt-2"
              disabled={deloadLoading}
              onClick={handleRestoreDeload}
            >
              {deloadLoading ? 'Restoring...' : '⚡ End Deload & Restore Full Volume'}
            </button>
          </div>
        ) : (
          <>
            <div className="overview-header">
              <div>
                <h3>Recovery & Deload (Lighter Cycle)</h3>
                <p className="subtitle mb-0">
                  Every 6–8 weeks or after periods of high fatigue, run a lighter cycle. Cuts session set count by 50% (floor 1) and suspends block size minimums for one cycle.
                </p>
              </div>
              {!confirmingDeload && (
                <button
                  className="btn btn-secondary mt-2"
                  onClick={() => {
                    setDeloadSuccess(null);
                    setConfirmingDeload(true);
                  }}
                >
                  🌙 Trigger Lighter Cycle (Deload)
                </button>
              )}
            </div>

            {confirmingDeload && (
              <div className="deload-confirm-box">
                <p><strong>Apply a lighter deload cycle?</strong></p>
                <p className="help-text">
                  This cuts set counts by 50% (floor of 1) across all sessions for the upcoming cycle to allow fatigue to dissipate.
                </p>
                <div className="deload-confirm-actions">
                  <button
                    className="btn btn-warning btn-sm"
                    disabled={deloadLoading}
                    onClick={handleTriggerDeload}
                  >
                    {deloadLoading ? 'Applying...' : '✓ Yes, Apply Deload'}
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={deloadLoading}
                    onClick={() => setConfirmingDeload(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {deloadSuccess && (
          <div className="alert alert-success mt-3">
            ✓ {deloadSuccess}
          </div>
        )}
      </div>

      {/* Scientific Evidence Base & Honest Limits */}
      <div className="card mt-4">
        <h3>Scientific Evidence Base & Honest Limits</h3>
        <p className="subtitle">
          Hypertrophy planning principles are grounded in peer-reviewed exercise science, with transparent heuristic limits:
        </p>
        <ul className="evidence-list">
          <li>
            <strong>Dose-Response Hypertrophy:</strong> Derived from Schoenfeld et al. (2017) and Pelland et al. (2024). The 10–20 weekly effective set tier represents the evidence-supported optimal zone.
          </li>
          <li>
            <strong>Failure Proximity:</strong> Hard sets are defined within 0–3 reps in reserve (Refalo et al., 2023). Sets stopped 4+ reps short do not count toward effective volume.
          </li>
          <li>
            <strong>Stretched Position:</strong> Exercises like Deep Parallettes, Pullovers, and Overhead Triceps Extensions provide stretch-mediated hypertrophy (Maeo et al., 2021, 2022).
          </li>
          <li>
            <strong>Heuristic Models:</strong> Height-based push-up leverage (Ebben et al., 2011 anchors), 48h recovery spacing, 8 direct sets/session cap, and beginner ~30% volume scaling are heuristic approximations rather than hard biological constants.
          </li>
          <li>
            <strong>Lower Evidence:</strong> Direct isolation volume for Abs and Forearms carries weaker comparative hypertrophy literature than major upper-body muscle groups.
          </li>
        </ul>
      </div>

      {/* Sessions History Section */}
      <div className="card mt-4 sessions-history-section">
        <div className="section-header-row">
          <h3>Sessions History</h3>
          <span className="badge badge-outline">
            {sessionHistory.length} Completed Session{sessionHistory.length === 1 ? '' : 's'}
          </span>
        </div>

        {sessionHistory.length === 0 ? (
          <div className="empty-history-box">
            <span className="empty-history-icon">🏋️</span>
            <p className="empty-history-title">No completed sessions logged yet</p>
            <p className="empty-history-desc">
              Complete your planned workout in the Schedule tab and tap the <strong>Done</strong> button to log your workout here.
            </p>
          </div>
        ) : (
          <div className="sessions-history-list">
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
      </div>

      <EditSessionModal
        isOpen={editingSession !== null}
        onClose={() => setEditingSession(null)}
        sessionToEdit={editingSession}
        onSaved={loadDashboardData}
        units={settings.units}
      />
    </div>
  );
};
