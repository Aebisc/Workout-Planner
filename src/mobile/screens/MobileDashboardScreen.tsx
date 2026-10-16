import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { Exercise, Muscle, Plan, Settings, Warning } from '../../types';

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
  const [loading, setLoading] = useState(true);
  const [deloadLoading, setDeloadLoading] = useState(false);
  const [deloadSuccess, setDeloadSuccess] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getWarnings(), api.getExercises()])
      .then(([w, ex]) => {
        setWarnings(w);
        setExercises(ex);
      })
      .finally(() => setLoading(false));
  }, [plan]);

  const handleTriggerDeload = async () => {
    if (!confirm('Apply a lighter cycle (deload)? All session set counts will be halved to facilitate fatigue recovery.')) return;
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

    const totalEquiv = directSets + indirectSets;
    const mev = Math.round(8 * factor);
    const mavMin = Math.round(12 * factor);
    const mavMax = Math.round(18 * factor);
    const mrv = Math.round(22 * factor);

    let tier = 'MEV';
    let badgeClass = 'm-badge-mev';
    let fillPercent = Math.min(100, Math.round((totalEquiv / mrv) * 100));
    let fillColor = 'var(--m-cyan)';

    if (totalEquiv < mev) {
      tier = 'Below MEV';
      badgeClass = 'm-badge-danger';
      fillColor = 'var(--m-red)';
    } else if (totalEquiv <= mavMax) {
      tier = 'MAV (Optimal)';
      badgeClass = 'm-badge-mav';
      fillColor = 'var(--m-green)';
    } else if (totalEquiv <= mrv) {
      tier = 'High (Near MRV)';
      badgeClass = 'm-badge-mrv';
      fillColor = 'var(--m-amber)';
    } else {
      tier = 'Above MRV';
      badgeClass = 'm-badge-danger';
      fillColor = 'var(--m-red)';
    }

    return {
      muscle: m,
      directSets,
      indirectSets: Math.round(indirectSets * 10) / 10,
      totalEquiv: Math.round(totalEquiv * 10) / 10,
      mev,
      mavMin,
      mavMax,
      mrv,
      tier,
      badgeClass,
      fillPercent,
      fillColor,
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
            onClick={isDeload ? handleRestoreDeload : handleTriggerDeload}
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
        <div className="m-section-title">Weekly Volume Breakdown</div>
        {volumeBreakdown.map((vb) => (
          <div key={vb.muscle} className="m-muscle-card">
            <div className="m-muscle-header">
              <span className="m-muscle-name">{vb.muscle}</span>
              <span className={`m-muscle-badge ${vb.badgeClass}`}>{vb.tier}</span>
            </div>

            <div className="m-vol-bar-track">
              <div
                className="m-vol-bar-fill"
                style={{
                  width: `${vb.fillPercent}%`,
                  background: vb.fillColor,
                }}
              />
            </div>

            <div className="m-vol-meta">
              <span>
                <strong>{vb.totalEquiv}</strong> total sets ({vb.directSets} direct + {vb.indirectSets} ind)
              </span>
              <span>Target: {vb.mavMin}–{vb.mavMax}s</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
