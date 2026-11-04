import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { CalibrationAnswers, ExperienceLevel, Muscle, Units } from '../types';
import { formatBackpackLoad, toDisplayWeight, KG_TO_LB } from '../utils/units';
import {
  ALL_EQUIPMENT_OPTIONS,
  getActiveEquipmentList,
  formatActiveEquipmentSummary,
} from '../utils/equipment';

interface OnboardingScreenProps {
  onComplete: () => void;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete }) => {
  const [units, setUnits] = useState<Units>('metric');
  // Metric source of truth; display values are re-derived only when the unit
  // system changes, so toggling units can never drift the entered values.
  const [weightKg, setWeightKg] = useState<number>(75);
  const [weightDisplay, setWeightDisplay] = useState<number>(75);
  const [pushUpsAvg, setPushUpsAvg] = useState<number>(12);
  const [pullUpsAvg, setPullUpsAvg] = useState<number>(4);
  const [experience, setExperience] = useState<ExperienceLevel>('six_to_24_months');
  const [daysPerWeek, setDaysPerWeek] = useState<number>(3.5);
  const [setsPerDay, setSetsPerDay] = useState<number>(4);
  const [priorityMuscles, setPriorityMuscles] = useState<Muscle[]>(['chest']);
  const [enabledEquipment, setEnabledEquipment] = useState<string[]>(() =>
    getActiveEquipmentList(null)
  );
  const [backpack, setBackpack] = useState<boolean>(false);
  const [weightVest, setWeightVest] = useState<boolean>(false);
  const [showEquipmentModal, setShowEquipmentModal] = useState<boolean>(false);

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

  const handleToggleEquipment = (eqId: string) => {
    setEnabledEquipment((prev) => {
      const exists = prev.includes(eqId);
      const updated = exists ? prev.filter((id) => id !== eqId) : [...prev, eqId];
      if (eqId === 'backpack') setBackpack(!exists);
      if (eqId === 'weight_vest') setWeightVest(!exists);
      return updated;
    });
  };

  useEffect(() => {
    api.getSettings().then((s) => {
      if (s) {
        if (s.units && s.units !== 'metric') {
          setUnits(s.units);
          setWeightDisplay(toDisplayWeight(75, s.units));
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
        if (s.enabled_equipment && s.enabled_equipment.length > 0) {
          setEnabledEquipment(s.enabled_equipment);
        }
        if (s.backpack !== undefined) {
          setBackpack(s.backpack);
        }
        if (s.weight_vest !== undefined) {
          setWeightVest(s.weight_vest);
        }
      }
    }).catch(console.error);
  }, []);

  const handleUnitsChange = (newUnits: Units) => {
    if (newUnits !== units) {
      setWeightDisplay(toDisplayWeight(weightKg, newUnits));
      setUnits(newUnits);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const answers: CalibrationAnswers = {
      body_weight_kg: weightKg,
      bed_height_cm: 35.0,
      push_ups_4_set_avg: pushUpsAvg,
      pull_ups_4_set_avg: pullUpsAvg,
      sets_close_to_failure: true,
      experience,
    };

    try {
      const currentSettings = await api.getSettings();
      await api.updateSettings({
        ...currentSettings,
        units,
        experience,
        bed_height_cm: 35.0,
        days_per_week: daysPerWeek,
        sets_per_day: setsPerDay,
        priority_muscles: priorityMuscles,
        enabled_equipment: enabledEquipment,
        backpack,
        weight_vest: weightVest,
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
            <span>📅 {daysPerWeek} days/wk</span> • <span>🔢 {setsPerDay} sets/session</span> • <span>⭐ {priorityMuscles.join(', ')}</span> • <span>🏋️ {formatActiveEquipmentSummary(enabledEquipment)}</span>
          </div>
        </div>

        <button className="btn btn-primary btn-lg mt-4" onClick={onComplete}>
          View Workout Plan →
        </button>
      </div>
    );
  }

  return (
    <>
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

          <div className="form-group">
            <label>Body Weight ({units === 'metric' ? 'kg' : 'lb'})</label>
            <input
              type="number"
              step="0.5"
              min="30"
              max="600"
              value={weightDisplay}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setWeightDisplay(val);
                setWeightKg(units === 'imperial' ? val / KG_TO_LB : val);
              }}
              required
            />
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

          {/* Unified Equipment Option */}
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Equipment Available</label>
            <div
              className="equipment-setting-card"
              onClick={() => setShowEquipmentModal(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setShowEquipmentModal(true);
                }
              }}
            >
              <div className="equipment-card-left">
                <span className="equipment-card-icon">🏋️</span>
                <div>
                  <div className="equipment-card-title">Available Equipment Configuration</div>
                  <div className="equipment-card-subtitle">
                    {formatActiveEquipmentSummary(enabledEquipment)} • Click to customize gear
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm equipment-manage-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowEquipmentModal(true);
                }}
              >
                Manage Equipment ⚙️
              </button>
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

      {/* Equipment Options Modal */}
      {showEquipmentModal && (
        <div className="modal-overlay" onClick={() => setShowEquipmentModal(false)}>
          <div
            className="modal-content equipment-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '620px', width: '92%' }}
          >
            <div className="modal-header">
              <h3>🏋️ Available Equipment</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowEquipmentModal(false)}
              >
                ✕
              </button>
            </div>
            <p className="modal-subtitle">
              Turn your available gear on or off. The planner will automatically adapt exercises, progressions, and leverage based on what you have.
            </p>

            <div className="equipment-modal-list">
              {ALL_EQUIPMENT_OPTIONS.map((item) => {
                const isChecked = enabledEquipment.includes(item.id);
                return (
                  <div
                    key={item.id}
                    className={`equipment-item-row ${isChecked ? 'active' : ''}`}
                    onClick={() => handleToggleEquipment(item.id)}
                  >
                    <div className="equipment-item-left">
                      <span className="equipment-item-icon">{item.icon}</span>
                      <div>
                        <div className="equipment-item-header">
                          <span className="equipment-item-name">{item.name}</span>
                          <span className={`equipment-scope-pill scope-${item.scope}`}>
                            {item.scopeBadge}
                          </span>
                        </div>
                        <div className="equipment-item-desc">{item.description}</div>
                      </div>
                    </div>
                    <label className="toggle-switch" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleEquipment(item.id)}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>
                );
              })}
            </div>

            <div className="modal-actions" style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowEquipmentModal(false)}
                style={{ padding: '0.6rem 1.5rem', fontWeight: 700 }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
