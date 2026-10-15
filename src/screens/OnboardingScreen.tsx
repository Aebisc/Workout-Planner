import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { CalibrationAnswers, ExperienceLevel, Units } from '../types';
import { formatBackpackLoad, KG_TO_LB, CM_TO_IN } from '../utils/units';

interface OnboardingScreenProps {
  onComplete: () => void;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete }) => {
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
    api.getSettings().then((s) => {
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
    }).catch(console.error);
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

    // Convert to metric if user input imperial
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
      const currentSettings = await api.getSettings();
      await api.updateSettings({
        ...currentSettings,
        units,
        experience,
      });

      const [, startingPush, addedWeight] = await api.calibrate(answers);
      setResult({ startingPush, addedWeight });
    } catch (err) {
      alert(`Calibration failed: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="card onboarding-card text-center">
        <h2 className="title-success">Calibration Complete!</h2>
        <p className="subtitle">
          Your initial baseline has been calculated using the evidence-based bodyweight load model.
        </p>

        <div className="highlight-box">
          <p>
            <strong>Recommended Starting Push Variation:</strong>
          </p>
          <h3 className="badge-highlight">{result.startingPush.replace(/_/g, ' ').toUpperCase()}</h3>
          {result.addedWeight > 0 ? (
            <p className="text-muted">
              Prescribed backpack load: {formatBackpackLoad(result.addedWeight, units)}
            </p>
          ) : (
            <p className="text-muted">Starting with bodyweight load (8–20 reps target window).</p>
          )}
          {pullUpsAvg === 0 && (
            <p className="text-info mt-2">
              Note: Because pull-up average is 0, your pull progression begins on the assisted/eccentric path.
            </p>
          )}
        </div>

        <button className="btn btn-primary btn-lg mt-4" onClick={onComplete}>
          View Workout Plan →
        </button>
      </div>
    );
  }

  return (
    <div className="card onboarding-card">
      <div className="onboarding-header">
        <div className="onboarding-badge">Step 1 of 1 • Calibration</div>
        <h2>First-Launch Baseline Calibration</h2>
        <p className="subtitle">
          Configure your baseline physical metrics and strength levels to calculate your personalized bodyweight load fractions, Epley 1RMs, and starting progression ladder rungs.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="form-grid">
        <div className="form-group">
          <label>Units Preference</label>
          <div className="segmented-control">
            <button
              type="button"
              className={`segmented-btn ${units === 'metric' ? 'active' : ''}`}
              onClick={() => handleUnitsChange('metric')}
            >
              Metric (kg, cm)
            </button>
            <button
              type="button"
              className={`segmented-btn ${units === 'imperial' ? 'active' : ''}`}
              onClick={() => handleUnitsChange('imperial')}
            >
              Imperial (lb, in)
            </button>
          </div>
        </div>

        <div className="form-row-2col">
          <div className="form-group">
            <label>Body Weight ({units === 'metric' ? 'kg' : 'lb'})</label>
            <input
              type="number"
              step="0.5"
              min="30"
              max="600"
              value={weight}
              onChange={(e) => setWeight(parseFloat(e.target.value) || 0)}
              required
            />
          </div>

          <div className="form-group">
            <label>Bed Height ({units === 'metric' ? 'cm' : 'in'})</label>
            <span className="help-text">
              For incline & feet-elevated push-up leverage (default {units === 'metric' ? '50 cm' : '20 in'}).
            </span>
            <input
              type="number"
              step="1"
              min={units === 'metric' ? "20" : "8"}
              max={units === 'metric' ? "120" : "48"}
              value={bedHeight}
              onChange={(e) => setBedHeight(parseFloat(e.target.value) || 0)}
              required
            />
          </div>
        </div>

        <div className="form-row-2col">
          <div className="form-group">
            <label>Push-ups (Average reps over 4 sets)</label>
            <input
              type="number"
              step="1"
              min="0"
              max="100"
              value={pushUpsAvg}
              onChange={(e) => setPushUpsAvg(parseInt(e.target.value) || 0)}
              required
            />
          </div>

          <div className="form-group">
            <label>Pull-ups or Chin-ups (Average reps over 4 sets)</label>
            <span className="help-text">Enter 0 to start on assisted/eccentric pull-up progression.</span>
            <input
              type="number"
              step="1"
              min="0"
              max="60"
              value={pullUpsAvg}
              onChange={(e) => setPullUpsAvg(parseInt(e.target.value) || 0)}
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label>Were those sets taken close to failure?</label>
          <span className="help-text">
            "Close to failure" means stopping with 0–3 reps left before technical failure.
          </span>
          <div className="choice-cards-grid">
            <div
              className={`choice-card ${closeToFailure ? 'active' : ''}`}
              onClick={() => setCloseToFailure(true)}
            >
              <div className="choice-card-header">
                <span className="choice-card-icon">🔥</span>
                <span className="choice-card-title">Yes (Within 0–3 reps of failure)</span>
                <span className="choice-card-radio">{closeToFailure ? '●' : '○'}</span>
              </div>
              <p className="choice-card-desc">
                High-stimulus sets. App applies standard 4-set drop-off factor (avg ÷ 0.80).
              </p>
            </div>
            <div
              className={`choice-card ${!closeToFailure ? 'active' : ''}`}
              onClick={() => setCloseToFailure(false)}
            >
              <div className="choice-card-header">
                <span className="choice-card-icon">⚡</span>
                <span className="choice-card-title">No (4+ reps left in reserve)</span>
                <span className="choice-card-radio">{!closeToFailure ? '●' : '○'}</span>
              </div>
              <p className="choice-card-desc">
                Submaximal effort. App restores unused reps using milder drop-off (avg ÷ 0.90 + 4).
              </p>
            </div>
          </div>
        </div>

        <div className="form-group">
          <label>Training Experience Level</label>
          <div className="experience-cards-grid">
            {[
              {
                id: 'under_6_months',
                label: 'Under 6 Months',
                badge: 'Beginner',
                desc: 'Volume tiers scale down ~30% for early neurological hypertrophy adaptation.',
              },
              {
                id: 'six_to_24_months',
                label: '6 to 24 Months',
                badge: 'Intermediate',
                desc: 'Standard evidence-based hypertrophy tiers (10–20 weekly effective sets).',
              },
              {
                id: 'over_2_years',
                label: 'Over 2 Years',
                badge: 'Experienced',
                desc: 'Advanced resistance profile requiring evidence-based volume tracking.',
              },
            ].map((item) => (
              <div
                key={item.id}
                className={`experience-card ${experience === item.id ? 'active' : ''}`}
                onClick={() => setExperience(item.id as ExperienceLevel)}
              >
                <div className="exp-card-header">
                  <span className="exp-badge">{item.badge}</span>
                  {experience === item.id && <span className="exp-check">✓</span>}
                </div>
                <strong className="exp-label">{item.label}</strong>
                <p className="exp-desc">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="form-actions mt-4">
          <button type="submit" className="btn btn-primary btn-lg btn-block btn-glow" disabled={loading}>
            {loading ? 'Calibrating Baseline...' : '🚀 Calculate Baseline & Build Plan'}
          </button>
        </div>
      </form>
    </div>
  );
};
