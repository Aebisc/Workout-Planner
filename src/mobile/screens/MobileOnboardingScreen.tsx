import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { CalibrationAnswers, ExperienceLevel, Units } from '../../types';
import { formatBackpackLoad, KG_TO_LB, CM_TO_IN } from '../../utils/units';
import { MobileNumberPicker } from '../components/MobileNumberPicker';

interface MobileOnboardingScreenProps {
  onComplete: () => void;
}

export const MobileOnboardingScreen: React.FC<MobileOnboardingScreenProps> = ({
  onComplete,
}) => {
  const [units, setUnits] = useState<Units>('metric');
  const [weight, setWeight] = useState<number>(75);
  const [bedHeight, setBedHeight] = useState<number>(50);
  const [pushUpsAvg, setPushUpsAvg] = useState<number>(12);
  const [pullUpsAvg, setPullUpsAvg] = useState<number>(4);
  const [closeToFailure, setCloseToFailure] = useState<boolean>(true);
  const [experience, setExperience] = useState<ExperienceLevel>('six_to_24_months');

  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<{
    startingPush: string;
    addedWeight: number;
  } | null>(null);

  useEffect(() => {
    api.getSettings()
      .then((s) => {
        if (s) {
          if (s.units && s.units !== 'metric') {
            setUnits(s.units);
            setWeight(Math.round(75 * KG_TO_LB));
            setBedHeight(Math.round(50 * CM_TO_IN));
          }
          if (s.experience) {
            setExperience(s.experience);
          }
        }
      })
      .catch(console.error);
  }, []);

  const handleUnitsChange = (newUnits: Units) => {
    if (newUnits !== units) {
      if (newUnits === 'imperial') {
        setWeight(Math.round(weight * KG_TO_LB));
        setBedHeight(Math.round(bedHeight * CM_TO_IN));
      } else {
        setWeight(Math.round(weight / KG_TO_LB));
        setBedHeight(Math.round(bedHeight / CM_TO_IN));
      }
      setUnits(newUnits);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const weightKg = units === 'imperial' ? weight / KG_TO_LB : weight;
    const bedHeightCm = units === 'imperial' ? bedHeight / CM_TO_IN : bedHeight;

    const answers: CalibrationAnswers = {
      body_weight_kg: weightKg,
      bed_height_cm: bedHeightCm,
      push_ups_4_set_avg: pushUpsAvg,
      pull_ups_4_set_avg: pullUpsAvg,
      sets_close_to_failure: closeToFailure,
      experience,
    };

    try {
      // 1. Calibrate FIRST (calculates initial profile, sets up progression ladders, and generates plan)
      const [, startingPush, addedWeight] = await api.calibrate(answers);

      // 2. Persist user preferences like units
      try {
        const currentSettings = await api.getSettings();
        await api.updateSettings({
          ...currentSettings,
          units,
          experience,
          bed_height_cm: bedHeightCm,
        });
      } catch (settingsErr) {
        console.warn('Settings sync after calibration:', settingsErr);
      }

      setResult({ startingPush, addedWeight });
    } catch (err) {
      alert(`Calibration failed: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="mobile-view-container no-nav" style={{ textAlign: 'center', paddingTop: '2rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🎯</div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--m-green)' }}>
          Calibration Complete!
        </h2>
        <p style={{ color: 'var(--m-text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Your bodyweight load profile and progression ladder rungs have been calculated.
        </p>

        <div className="m-card" style={{ padding: '1.5rem', border: '1px solid var(--m-border-active)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--m-text-muted)', textTransform: 'uppercase' }}>
            Recommended Starting Push
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--m-cyan)', margin: '0.5rem 0' }}>
            {result.startingPush.replace(/_/g, ' ').toUpperCase()}
          </div>
          {result.addedWeight > 0 ? (
            <div style={{ fontSize: '0.9rem', color: 'var(--m-green)', fontWeight: 600 }}>
              🎒 Starting with {formatBackpackLoad(result.addedWeight, units)} backpack load
            </div>
          ) : (
            <div style={{ fontSize: '0.85rem', color: 'var(--m-text-subtle)' }}>
              Bodyweight baseline variation
            </div>
          )}
        </div>

        <button
          type="button"
          className="m-btn m-btn-primary"
          style={{ marginTop: '2rem' }}
          onClick={onComplete}
        >
          View My Training Schedule ›
        </button>
      </div>
    );
  }

  return (
    <div className="mobile-view-container no-nav">
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: '0 0 0.35rem' }}>
          Baseline Strength Calibration
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--m-text-muted)', margin: 0 }}>
          Set your baseline metrics to calculate personalized bodyweight load fractions and progression ladders.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Units Switcher */}
        <div className="m-grouped-section">
          <div className="m-section-title">Units Preference</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <button
              type="button"
              className={`m-btn ${units === 'metric' ? 'm-btn-primary' : 'm-btn-secondary'}`}
              style={{ height: '44px', fontSize: '0.88rem' }}
              onClick={() => handleUnitsChange('metric')}
            >
              Metric (kg, cm)
            </button>
            <button
              type="button"
              className={`m-btn ${units === 'imperial' ? 'm-btn-primary' : 'm-btn-secondary'}`}
              style={{ height: '44px', fontSize: '0.88rem' }}
              onClick={() => handleUnitsChange('imperial')}
            >
              Imperial (lb, in)
            </button>
          </div>
        </div>

        {/* Body Metrics with MobileNumberPicker */}
        <div className="m-grouped-section">
          <div className="m-section-title">Body Metrics</div>
          <div className="m-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <MobileNumberPicker
              label="Body Weight"
              value={weight}
              unit={units === 'metric' ? 'kg' : 'lb'}
              min={30}
              max={300}
              step={1}
              quickStep={5}
              onChange={setWeight}
              id="weight"
            />

            <MobileNumberPicker
              label="Bed / Incline Height"
              value={bedHeight}
              unit={units === 'metric' ? 'cm' : 'in'}
              min={10}
              max={120}
              step={1}
              quickStep={5}
              onChange={setBedHeight}
              id="bed-height"
            />
          </div>
        </div>

        {/* Strength Benchmarks with MobileNumberPicker */}
        <div className="m-grouped-section">
          <div className="m-section-title">Strength Benchmarks</div>
          <div className="m-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <MobileNumberPicker
              label="Push-ups (Avg over 4 sets)"
              value={pushUpsAvg}
              unit="reps"
              min={0}
              max={100}
              step={1}
              quickStep={5}
              onChange={setPushUpsAvg}
              id="pushups"
            />

            <MobileNumberPicker
              label="Pull-ups or Chin-ups (Avg)"
              value={pullUpsAvg}
              unit="reps"
              min={0}
              max={60}
              step={1}
              quickStep={2}
              onChange={setPullUpsAvg}
              id="pullups"
            />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.5rem', borderTop: '1px solid var(--m-border)' }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--m-text-main)' }}>
                  Sets Taken Close to Failure (0–2 RIR)
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--m-text-muted)' }}>
                  Calibration requires hard sets
                </div>
              </div>
              <label className="m-switch">
                <input
                  type="checkbox"
                  checked={closeToFailure}
                  onChange={(e) => setCloseToFailure(e.target.checked)}
                />
                <span className="m-slider" />
              </label>
            </div>
          </div>
        </div>

        {/* Experience Level */}
        <div className="m-grouped-section">
          <div className="m-section-title">Lifting Experience</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[
              { id: 'under_6_months' as ExperienceLevel, label: 'Beginner', sub: 'Under 6 months' },
              { id: 'six_to_24_months' as ExperienceLevel, label: 'Intermediate', sub: '6 to 24 months' },
              { id: 'over_2_years' as ExperienceLevel, label: 'Advanced', sub: 'Over 2 years' },
            ].map((exp) => (
              <div
                key={exp.id}
                className="m-list-row m-list-row-clickable"
                style={{
                  borderRadius: 'var(--m-radius-md)',
                  background: experience === exp.id ? 'rgba(99, 102, 241, 0.15)' : 'var(--m-bg-card)',
                  border: experience === exp.id ? '1px solid var(--m-primary)' : '1px solid var(--m-border)',
                }}
                onClick={() => setExperience(exp.id)}
              >
                <div className="m-row-left">
                  <span className="m-row-icon">{experience === exp.id ? '🔘' : '⚪'}</span>
                  <div>
                    <div className="m-row-label">{exp.label}</div>
                    <div className="m-row-sublabel">{exp.sub}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          type="submit"
          className="m-btn m-btn-primary"
          style={{ height: '54px', fontSize: '1.05rem', margin: '0.5rem 0 2rem' }}
          disabled={loading}
        >
          {loading ? 'Calculating Plan...' : 'Calculate My Training Plan ›'}
        </button>
      </form>
    </div>
  );
};
