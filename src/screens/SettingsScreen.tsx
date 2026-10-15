import React, { useState } from 'react';
import { api } from '../api';
import { ExperienceLevel, Muscle, Settings, Units } from '../types';
import { toDisplayHeight, toMetricHeight, CM_TO_IN } from '../utils/units';

interface SettingsScreenProps {
  initialSettings: Settings;
  onSaved: (newSettings: Settings) => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  initialSettings,
  onSaved,
}) => {
  const [units, setUnits] = useState<Units>(initialSettings.units);
  const [backpack, setBackpack] = useState<boolean>(initialSettings.backpack);
  const [bedHeightDisplay, setBedHeightDisplay] = useState<number>(
    toDisplayHeight(initialSettings.bed_height_cm, initialSettings.units)
  );
  const [priorityMuscles, setPriorityMuscles] = useState<Muscle[]>(
    initialSettings.priority_muscles
  );
  const [maintenanceOn, setMaintenanceOn] = useState<boolean>(
    initialSettings.maintenance_on
  );
  const [experience, setExperience] = useState<ExperienceLevel>(
    initialSettings.experience
  );
  const [setsPerDay, setSetsPerDay] = useState<number>(initialSettings.sets_per_day);
  const [daysPerWeek, setDaysPerWeek] = useState<number>(
    initialSettings.days_per_week
  );
  const [calendarView, setCalendarView] = useState<boolean>(
    initialSettings.calendar_view
  );

  const [saving, setSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleUnitsChange = (newUnits: Units) => {
    if (newUnits !== units) {
      if (newUnits === 'imperial') {
        // cm -> in
        setBedHeightDisplay(Math.round(bedHeightDisplay * CM_TO_IN));
      } else {
        // in -> cm
        setBedHeightDisplay(Math.round(bedHeightDisplay / CM_TO_IN));
      }
      setUnits(newUnits);
    }
  };

  const allMuscles: Muscle[] = [
    'chest',
    'back',
    'biceps',
    'triceps',
    'forearms',
    'abs',
  ];

  const presets = [
    { label: 'Every day (7.0)', val: 7.0 },
    { label: '3 on / 1 off (5.25)', val: 5.25 },
    { label: '2 on / 1 off (4.67)', val: 4.67 },
    { label: 'Every other day (3.5)', val: 3.5 },
    { label: '1 on / 2 off (2.33)', val: 2.33 },
    { label: '3 days / wk (3.0)', val: 3.0 },
    { label: '4 days / wk (4.0)', val: 4.0 },
    { label: '5 days / wk (5.0)', val: 5.0 },
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMessage(null);

    const updated: Settings = {
      units,
      backpack,
      bed_height_cm: toMetricHeight(bedHeightDisplay, units),
      priority_muscles: priorityMuscles,
      maintenance_on: maintenanceOn,
      experience,
      sets_per_day: setsPerDay,
      days_per_week: daysPerWeek,
      calendar_view: calendarView,
    };

    try {
      await api.updateSettings(updated);
      setStatusMessage('Settings saved and training plan regenerated!');
      onSaved(updated);
    } catch (err) {
      alert(`Failed to save settings: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card settings-card">
      <h2>Planner Settings</h2>
      <p className="subtitle">
        Adjust training frequency, volume targets, and equipment preferences.
      </p>

      {statusMessage && <div className="alert alert-success">{statusMessage}</div>}

      <form onSubmit={handleSave} className="form-grid">
        <div className="form-group">
          <label>Display Units</label>
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
          <label>Backpack Equipment Available</label>
          <div className="toggle-container">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={backpack}
                onChange={(e) => setBackpack(e.target.checked)}
              />
              <span className="slider"></span>
            </label>
            <span className="toggle-label">
              {backpack
                ? 'Enabled (app will prescribe water bottles when reps exceed 20)'
                : 'Disabled (bodyweight and 12.5 kg dumbbell only)'}
            </span>
          </div>
        </div>

        <div className="form-group">
          <label>Bed Height ({units === 'metric' ? 'cm' : 'in'})</label>
          <span className="help-text">
            Used for push-up incline/decline leverage interpolation. Default is {units === 'metric' ? '50 cm' : '20 in'}.
          </span>
          <input
            type="number"
            min={units === 'metric' ? '20' : '8'}
            max={units === 'metric' ? '120' : '48'}
            value={bedHeightDisplay}
            onChange={(e) => setBedHeightDisplay(parseFloat(e.target.value) || 0)}
          />
        </div>

        <div className="form-group">
          <label>Sets Per Day (Total Across All Muscles)</label>
          <span className="help-text">Strict volume invariance: all sessions will contain exactly this many sets.</span>
          <input
            type="number"
            min="1"
            max="20"
            value={setsPerDay}
            onChange={(e) => setSetsPerDay(parseInt(e.target.value) || 1)}
          />
        </div>

        <div className="form-group">
          <label>Days Per Week (Rolling Rate)</label>
          <span className="help-text">Decimal values are mapped to the closest repeating cycle (±0.15 tolerance).</span>
          <div className="presets-row mb-2">
            {presets.map((p) => (
              <button
                key={p.val}
                type="button"
                className={`btn btn-xs ${daysPerWeek === p.val ? 'btn-primary' : 'btn-outline'}`}
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
          <label>Priority Muscles (Equal Weight Target)</label>
          <span className="help-text">Cycle volume after maintenance will be distributed equally among selected muscles.</span>
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

        <div className="form-group">
          <label>Maintenance for Non-Priority Muscles</label>
          <div className="toggle-container">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={maintenanceOn}
                onChange={(e) => setMaintenanceOn(e.target.checked)}
              />
              <span className="slider"></span>
            </label>
            <span className="toggle-label">
              {maintenanceOn
                ? 'On (aims for ~3 weekly sets per non-priority muscle unless budget capped)'
                : 'Off (all volume goes directly to chosen priority muscles)'}
            </span>
          </div>
        </div>

        <div className="form-group">
          <label>Calendar View Mode</label>
          <div className="toggle-container">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={calendarView}
                onChange={(e) => setCalendarView(e.target.checked)}
              />
              <span className="slider"></span>
            </label>
            <span className="toggle-label">
              {calendarView
                ? 'Calendar mode (maps sessions to weekdays)'
                : 'Sequential queue (rolling Session N order, independent of weekdays)'}
            </span>
          </div>
        </div>

        <div className="form-group">
          <label>Experience Level</label>
          <select
            value={experience}
            onChange={(e) => setExperience(e.target.value as ExperienceLevel)}
          >
            <option value="under_6_months">Under 6 months (heuristic ~30% volume shift)</option>
            <option value="six_to_24_months">6 to 24 months (standard growth tier)</option>
            <option value="over_2_years">Over 2 years (advanced hypertrophy range)</option>
          </select>
        </div>

        <div className="form-actions mt-3">
          <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
            {saving ? 'Saving...' : '💾 Save Settings & Update Plan'}
          </button>
        </div>
      </form>
    </div>
  );
};
