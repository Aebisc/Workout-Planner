import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { CalibrationAnswers, ExperienceLevel, Muscle, Units } from '../types';
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
  const [daysPerWeek, setDaysPerWeek] = useState<number>(3.5);
  const [setsPerDay, setSetsPerDay] = useState<number>(4);
  const [priorityMuscles, setPriorityMuscles] = useState<Muscle[]>(['chest']);

  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<{
    startingPush: string;
    addedWeight: number;
  } | null>(null);

  const allMuscles: Muscle[] = [
    'chest',
    'back',
    'biceps',
    'triceps',
    'forearms',
    'abs',
  ];

  const presets = [
    { label: 'Every other day (3.5)', val: 3.5 },
    { label: '3 days / wk (3.0)', val: 3.0 },
    { label: '4 days / wk (4.0)', val: 4.0 },
    { label: '5 days / wk (5.0)', val: 5.0 },
    { label: '3 on / 1 off (5.25)', val: 5.25 },
    { label: '2 on / 1 off (4.67)', val: 4.67 },
    { label: 'Every day (7.0)', val: 7.0 },
    { label: '1 on / 2 off (2.33)', val: 2.33 },
  ];

  const togglePriorityMuscle = (m: Muscle) => {
    if (priorityMuscles.includes(m)) {
      if (priorityMuscles.length === 1) {
        alert('You must have at least one priority muscle.');
        return;
      }
      setPriorityMuscles(priorityMuscles.filter((p) => p !== m));
    } else {
      setPriorityMuscles([...priorityMuscles, m]);
    }
  };

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
        if (s.days_per_week) {
          setDaysPerWeek(s.days_per_week);
        }
        if (s.sets_per_day) {
          setSetsPerDay(s.sets_per_day);
        }
        if (s.priority_muscles && s.priority_muscles.length > 0) {
          setPriorityMuscles(s.priority_muscles);
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
        bed_height_cm: bedHeightCm,
        days_per_week: daysPerWeek,
        sets_per_day: setsPerDay,
        priority_muscles: priorityMuscles,
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
          <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: '0.88rem', color: '#94a3b8' }}>
            <span>📅 {daysPerWeek} days/wk</span> • <span>🔢 {setsPerDay} sets/session</span> • <span>⭐ {priorityMuscles.join(', ')}</span>
          </div>
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

        <div className="form-group">
          <label>Training Frequency (Days Per Week)</label>
          <span className="help-text">
            How often you want to train. Cycles adapt automatically to ensure systemic recovery.
          </span>
          <div className="presets-row mb-2">
            {presets.map((p) => (
              <button
                key={p.val}
                type="button"
                className={`btn btn-xs ${Math.abs(daysPerWeek - p.val) < 0.05 ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setDaysPerWeek(p.val)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="number"
            step="0.01"
            min="1.0"
            max="7.0"
            value={daysPerWeek}
            onChange={(e) => setDaysPerWeek(parseFloat(e.target.value) || 3.5)}
          />
        </div>

        <div className="form-group">
          <label>Target Sets Per Workout</label>
          <span className="help-text">
            Strict volume invariance: each session will contain exactly this many sets (1–20 sets). Default is 4.
          </span>
          <input
            type="number"
            min="1"
            max="20"
            value={setsPerDay}
            onChange={(e) => setSetsPerDay(Math.min(20, Math.max(1, parseInt(e.target.value) || 1)))}
          />
        </div>

        <div className="form-group">
          <label>Priority Muscles (Target for Optimal Growth)</label>
          <span className="help-text">
            Cycle volume after maintenance will be distributed equally among your chosen muscles. Select at least one.
          </span>
          <div className="muscle-chips-grid">
            {allMuscles.map((m) => {
              const checked = priorityMuscles.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  className={`muscle-chip ${checked ? 'active' : ''}`}
                  onClick={() => togglePriorityMuscle(m)}
                >
                  <span className="muscle-chip-name">{m.toUpperCase()}</span>
                  <span className="muscle-chip-status">{checked ? '✓ Target' : '+ Add'}</span>
                </button>
              );
            })}
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
