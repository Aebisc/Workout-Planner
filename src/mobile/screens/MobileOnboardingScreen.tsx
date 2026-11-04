import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { CalibrationAnswers, ExperienceLevel, Muscle, Units } from '../../types';
import { formatBackpackLoad, toDisplayWeight, KG_TO_LB } from '../../utils/units';
import {
  ALL_EQUIPMENT_OPTIONS,
  getActiveEquipmentList,
  formatActiveEquipmentSummary,
} from '../../utils/equipment';
import { BottomSheet } from '../components/BottomSheet';
import { MobileNumberPicker } from '../components/MobileNumberPicker';

interface MobileOnboardingScreenProps {
  onComplete: () => void;
}

export const MobileOnboardingScreen: React.FC<MobileOnboardingScreenProps> = ({
  onComplete,
}) => {
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
  const [showEquipmentSheet, setShowEquipmentSheet] = useState<boolean>(false);
  const [freqSheetOpen, setFreqSheetOpen] = useState(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<{
    startingPush: string;
    addedWeight: number;
  } | null>(null);

  const allMuscles: Muscle[] = ['chest', 'back', 'biceps', 'triceps', 'forearms', 'abs'];

  const presets = [
    { label: 'Every other day (3.5 days/wk)', val: 3.5 },
    { label: '3 days / wk (3.0)', val: 3.0 },
    { label: '4 days / wk (4.0)', val: 4.0 },
    { label: '5 days / wk (5.0)', val: 5.0 },
    { label: '3 on / 1 off (5.25 days/wk)', val: 5.25 },
    { label: '2 on / 1 off (4.67 days/wk)', val: 4.67 },
    { label: 'Every day (7.0 days/wk)', val: 7.0 },
    { label: '1 on / 2 off (2.33 days/wk)', val: 2.33 },
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

  const currentPresetLabel =
    presets.find((p) => Math.abs(p.val - daysPerWeek) < 0.05)?.label ||
    `${daysPerWeek} days/wk`;

  useEffect(() => {
    api.getSettings()
      .then((s) => {
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
      })
      .catch(console.error);
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
      // 1. Persist user preferences like units, schedule, equipment, and priority muscles FIRST
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
      // 2. Calibrate (calculates initial profile, sets up progression ladders, and generates plan)
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
          <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px solid var(--m-border)', fontSize: '0.82rem', color: 'var(--m-text-muted)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-around', gap: '0.5rem' }}>
            <span>📅 {daysPerWeek} d/wk</span>
            <span>🔢 {setsPerDay} sets</span>
            <span>⭐ {priorityMuscles.join(', ')}</span>
            <span>🏋️ {enabledEquipment.length} gears</span>
          </div>
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
          <div className="m-card">
            <MobileNumberPicker
              label="Body Weight"
              value={weightDisplay}
              unit={units === 'metric' ? 'kg' : 'lb'}
              min={units === 'metric' ? 30 : 66}
              max={units === 'metric' ? 250 : 550}
              step={1}
              quickStep={5}
              onChange={(val) => {
                setWeightDisplay(val);
                setWeightKg(units === 'imperial' ? val / KG_TO_LB : val);
              }}
              id="weight"
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
          </div>
        </div>

        {/* Equipment Available */}
        <div className="m-grouped-section">
          <div className="m-section-title">Equipment Available</div>
          <div className="m-inset-list">
            <div
              className="m-list-row m-list-row-clickable"
              onClick={() => setShowEquipmentSheet(true)}
            >
              <div className="m-row-left">
                <span className="m-row-icon">🏋️</span>
                <div>
                  <div className="m-row-label">Available Equipment</div>
                  <div className="m-row-sublabel">
                    {formatActiveEquipmentSummary(enabledEquipment)}
                  </div>
                </div>
              </div>
              <span className="m-row-chevron">›</span>
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

        {/* Training Schedule Preferences */}
        <div className="m-grouped-section">
          <div className="m-section-title">Schedule & Volume Targets</div>
          <div className="m-inset-list">
            {/* Frequency Row */}
            <div
              className="m-list-row m-list-row-clickable"
              onClick={() => setFreqSheetOpen(true)}
            >
              <div className="m-row-left">
                <span className="m-row-icon">📅</span>
                <div>
                  <div className="m-row-label">Training Frequency</div>
                  <div className="m-row-sublabel">{currentPresetLabel}</div>
                </div>
              </div>
              <span className="m-row-chevron">›</span>
            </div>

            {/* Target Sets Per Workout with MobileNumberPicker */}
            <div className="m-list-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div className="m-row-left" style={{ marginBottom: '0.5rem' }}>
                <span className="m-row-icon">🔢</span>
                <div>
                  <div className="m-row-label">Target Sets Per Workout</div>
                  <div className="m-row-sublabel">Strict volume invariance: 1–20 sets per session</div>
                </div>
              </div>
              <MobileNumberPicker
                value={setsPerDay}
                unit="sets"
                min={1}
                max={20}
                step={1}
                quickStep={2}
                onChange={setSetsPerDay}
                id="onboarding-sets-per-day"
              />
            </div>
          </div>
        </div>

        {/* Priority Muscles */}
        <div className="m-grouped-section">
          <div className="m-section-title">Priority Muscles</div>
          <div className="m-card">
            <p style={{ fontSize: '0.82rem', color: 'var(--m-text-muted)', margin: '0 0 0.75rem' }}>
              Select target muscles for optimal growth (MAV volume allocation). Tap to toggle.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              {allMuscles.map((m) => {
                const isSelected = priorityMuscles.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    className={`m-btn ${isSelected ? 'm-btn-primary' : 'm-btn-secondary'}`}
                    style={{ height: '44px', textTransform: 'capitalize', fontSize: '0.88rem' }}
                    onClick={() => togglePriorityMuscle(m)}
                  >
                    {isSelected ? '★ ' : ''} {m}
                  </button>
                );
              })}
            </div>
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

      {/* Frequency Bottom Sheet */}
      <BottomSheet
        isOpen={freqSheetOpen}
        onClose={() => setFreqSheetOpen(false)}
        title="Select Training Frequency"
        id="onboarding-freq-sheet"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {presets.map((p) => (
            <div
              key={p.val}
              className="m-list-row m-list-row-clickable"
              style={{
                borderRadius: 'var(--m-radius-md)',
                background: Math.abs(daysPerWeek - p.val) < 0.05 ? 'rgba(99, 102, 241, 0.2)' : 'var(--m-bg-card)',
                border: Math.abs(daysPerWeek - p.val) < 0.05 ? '1px solid var(--m-primary)' : '1px solid var(--m-border)',
              }}
              onClick={() => {
                setDaysPerWeek(p.val);
                setFreqSheetOpen(false);
              }}
            >
              <span className="m-row-label">{p.label}</span>
              {Math.abs(daysPerWeek - p.val) < 0.05 && <span style={{ color: 'var(--m-cyan)' }}>✓</span>}
            </div>
          ))}
        </div>
      </BottomSheet>

      {/* Equipment Bottom Sheet */}
      <BottomSheet
        isOpen={showEquipmentSheet}
        onClose={() => setShowEquipmentSheet(false)}
        title="Available Equipment"
        id="onboarding-equipment-sheet"
      >
        <div style={{ padding: '0 0.25rem 1rem 0.25rem' }}>
          <p style={{ fontSize: '0.82rem', color: 'var(--m-text-subtle)', margin: '0 0 1rem 0', lineHeight: 1.45 }}>
            Toggle your available equipment on or off. Workout Planner will automatically adapt exercise selections and double-progressions to only use gear you have.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1.25rem' }}>
            {ALL_EQUIPMENT_OPTIONS.map((item) => {
              const isChecked = enabledEquipment.includes(item.id);
              return (
                <div
                  key={item.id}
                  className="m-list-row"
                  style={{
                    background: isChecked ? 'rgba(99, 102, 241, 0.08)' : 'var(--m-bg-card)',
                    border: isChecked ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid var(--m-border)',
                    borderRadius: 'var(--m-radius-md)',
                    padding: '0.85rem 1rem',
                  }}
                  onClick={() => handleToggleEquipment(item.id)}
                >
                  <div className="m-row-left" style={{ flex: 1, paddingRight: '0.75rem' }}>
                    <span className="m-row-icon" style={{ fontSize: '1.4rem' }}>{item.icon}</span>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--m-text-primary)' }}>
                          {item.name}
                        </span>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.45rem',
                            borderRadius: '999px',
                            background: item.scope === 'pull' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(168, 85, 247, 0.2)',
                            color: item.scope === 'pull' ? '#93c5fd' : '#d8b4fe',
                            border: item.scope === 'pull' ? '1px solid rgba(59, 130, 246, 0.35)' : '1px solid rgba(168, 85, 247, 0.35)',
                          }}
                        >
                          {item.scopeBadge}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--m-text-muted)', marginTop: '0.25rem', lineHeight: 1.35 }}>
                        {item.description}
                      </div>
                    </div>
                  </div>
                  <label className="m-switch" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleEquipment(item.id)}
                    />
                    <span className="m-slider" />
                  </label>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className="m-btn m-btn-primary"
            style={{ width: '100%', height: '48px', fontWeight: 800 }}
            onClick={() => setShowEquipmentSheet(false)}
          >
            ✓ Done
          </button>
        </div>
      </BottomSheet>
    </div>
  );
};
