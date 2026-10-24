import React, { useState } from 'react';
import { api } from '../../api';
import { ExperienceLevel, Muscle, Settings, Units } from '../../types';
import { toDisplayHeight, toMetricHeight, CM_TO_IN } from '../../utils/units';
import { BottomSheet } from '../components/BottomSheet';
import { MobileNumberPicker } from '../components/MobileNumberPicker';
import {
  exportBackupWithMeta,
  downloadBackupJsonFile,
  encodeSyncString,
  decodeSyncString,
  importBackupAndApply,
  pullFromLanServer,
  pushToLanServer,
  pushToGitHubGist,
  pullFromGitHubGist,
} from '../../utils/sync';

interface MobileSettingsScreenProps {
  initialSettings: Settings;
  onSaved: (newSettings: Settings) => void;
  onNavigateToOnboarding: () => void;
}

export const MobileSettingsScreen: React.FC<MobileSettingsScreenProps> = ({
  initialSettings,
  onSaved,
  onNavigateToOnboarding,
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
  const calendarView = initialSettings.calendar_view;
  const [restTimerSound, setRestTimerSound] = useState<boolean>(
    initialSettings.rest_timer_sound ?? true
  );

  const [saving, setSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Bottom sheet states for pickers
  const [freqSheetOpen, setFreqSheetOpen] = useState(false);
  const [prioritySheetOpen, setPrioritySheetOpen] = useState(false);
  const [expSheetOpen, setExpSheetOpen] = useState(false);

  // Sync bottom sheets
  const [lanSheetOpen, setLanSheetOpen] = useState(false);
  const [cloudSheetOpen, setCloudSheetOpen] = useState(false);
  const [offlineSheetOpen, setOfflineSheetOpen] = useState(false);

  // Sync state
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [pasteSyncCode, setPasteSyncCode] = useState('');

  // Wi-Fi Direct state
  const [lanIp, setLanIp] = useState<string>(() => localStorage.getItem('mgp_lan_client_ip') || '192.168.1.');
  const [lanPort, setLanPort] = useState<number>(7878);
  const [lanPin, setLanPin] = useState<string>('');

  // Cloud Sync state
  const [gistToken, setGistToken] = useState<string>(() => localStorage.getItem('mgp_gist_token') || '');
  const [gistId, setGistId] = useState<string>(() => localStorage.getItem('mgp_gist_id') || '');
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(() => localStorage.getItem('mgp_last_synced'));

  const allMuscles: Muscle[] = ['chest', 'back', 'biceps', 'triceps', 'forearms', 'abs'];

  const presets = [
    { label: 'Every day (7.0 days/wk)', val: 7.0 },
    { label: '3 on / 1 off (5.25 days/wk)', val: 5.25 },
    { label: '2 on / 1 off (4.67 days/wk)', val: 4.67 },
    { label: 'Every other day (3.5 days/wk)', val: 3.5 },
    { label: '1 on / 2 off (2.33 days/wk)', val: 2.33 },
    { label: '3 days / wk (3.0)', val: 3.0 },
    { label: '4 days / wk (4.0)', val: 4.0 },
    { label: '5 days / wk (5.0)', val: 5.0 },
  ];

  const handleUnitsChange = (newUnits: Units) => {
    if (newUnits !== units) {
      if (newUnits === 'imperial') {
        setBedHeightDisplay(Math.round(bedHeightDisplay * CM_TO_IN));
      } else {
        setBedHeightDisplay(Math.round(bedHeightDisplay / CM_TO_IN));
      }
      setUnits(newUnits);
    }
  };

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

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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
      rest_timer_sound: restTimerSound,
    };

    try {
      await api.updateSettings(updated);
      onSaved(updated);
      setStatusMessage('Settings saved successfully!');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      alert(`Save failed: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const currentPresetLabel =
    presets.find((p) => Math.abs(p.val - daysPerWeek) < 0.05)?.label ||
    `${daysPerWeek} days/wk`;

  return (
    <div className="mobile-view-container">
      {/* Preferences Section */}
      <div className="m-grouped-section">
        <div className="m-section-title">General Preferences</div>
        <div className="m-inset-list">
          {/* Units */}
          <div className="m-list-row">
            <div className="m-row-left">
              <span className="m-row-icon">📏</span>
              <span className="m-row-label">Units</span>
            </div>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button
                type="button"
                style={{
                  padding: '0.35rem 0.65rem',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  background: units === 'metric' ? 'var(--m-primary)' : 'rgba(255,255,255,0.06)',
                  color: '#fff',
                }}
                onClick={() => handleUnitsChange('metric')}
              >
                Metric
              </button>
              <button
                type="button"
                style={{
                  padding: '0.35rem 0.65rem',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  background: units === 'imperial' ? 'var(--m-primary)' : 'rgba(255,255,255,0.06)',
                  color: '#fff',
                }}
                onClick={() => handleUnitsChange('imperial')}
              >
                Imperial
              </button>
            </div>
          </div>

          {/* Rest Timer Audio Toggle */}
          <div className="m-list-row">
            <div className="m-row-left">
              <span className="m-row-icon">{restTimerSound ? '🔊' : '🔇'}</span>
              <div>
                <div className="m-row-label">Rest Timer Audio Chime</div>
                <div className="m-row-sublabel">Plays sound upon completing rest</div>
              </div>
            </div>
            <label className="m-switch">
              <input
                type="checkbox"
                checked={restTimerSound}
                onChange={(e) => setRestTimerSound(e.target.checked)}
              />
              <span className="m-slider" />
            </label>
          </div>

          {/* Maintenance Volume Mode */}
          <div className="m-list-row">
            <div className="m-row-left">
              <span className="m-row-icon">🛡️</span>
              <div>
                <div className="m-row-label">Maintenance Volume</div>
                <div className="m-row-sublabel">Non-priority muscles held at MEV</div>
              </div>
            </div>
            <label className="m-switch">
              <input
                type="checkbox"
                checked={maintenanceOn}
                onChange={(e) => setMaintenanceOn(e.target.checked)}
              />
              <span className="m-slider" />
            </label>
          </div>
        </div>
      </div>

      {/* Equipment & Geometry Section */}
      <div className="m-grouped-section">
        <div className="m-section-title">Equipment & Geometry</div>
        <div className="m-inset-list">
          {/* Backpack Equipment Toggle */}
          <div className="m-list-row">
            <div className="m-row-left">
              <span className="m-row-icon">🎒</span>
              <div>
                <div className="m-row-label">Weighted Backpack</div>
                <div className="m-row-sublabel">Allows progressive overload with bottle loading</div>
              </div>
            </div>
            <label className="m-switch">
              <input
                type="checkbox"
                checked={backpack}
                onChange={(e) => setBackpack(e.target.checked)}
              />
              <span className="m-slider" />
            </label>
          </div>

          {/* Bed / Incline Height */}
          <div className="m-list-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div className="m-row-left" style={{ marginBottom: '0.5rem' }}>
              <span className="m-row-icon">📐</span>
              <div>
                <div className="m-row-label">Bed / Elevation Height</div>
                <div className="m-row-sublabel">For feet-elevated and incline leverage</div>
              </div>
            </div>
            <MobileNumberPicker
              value={bedHeightDisplay}
              unit={units === 'metric' ? 'cm' : 'in'}
              min={units === 'metric' ? 20 : 8}
              max={units === 'metric' ? 120 : 48}
              step={1}
              quickStep={5}
              onChange={setBedHeightDisplay}
              id="settings-bed-height"
            />
          </div>
        </div>
      </div>

      {/* Training Frequency & Priority Section */}
      <div className="m-grouped-section">
        <div className="m-section-title">Training Schedule</div>
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

          {/* Sets Per Session */}
          <div className="m-list-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div className="m-row-left" style={{ marginBottom: '0.5rem' }}>
              <span className="m-row-icon">🔢</span>
              <div>
                <div className="m-row-label">Target Sets Per Workout</div>
                <div className="m-row-sublabel">Strict volume invariance: 1–20 sets per session (default 4)</div>
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
              id="settings-sets-per-day"
            />
          </div>

          {/* Priority Muscles Row */}
          <div
            className="m-list-row m-list-row-clickable"
            onClick={() => setPrioritySheetOpen(true)}
          >
            <div className="m-row-left">
              <span className="m-row-icon">⭐</span>
              <div>
                <div className="m-row-label">Priority Muscles</div>
                <div className="m-row-sublabel">
                  {priorityMuscles.join(', ')} ({priorityMuscles.length})
                </div>
              </div>
            </div>
            <span className="m-row-chevron">›</span>
          </div>

          {/* Experience Row */}
          <div
            className="m-list-row m-list-row-clickable"
            onClick={() => setExpSheetOpen(true)}
          >
            <div className="m-row-left">
              <span className="m-row-icon">🏅</span>
              <div>
                <div className="m-row-label">Experience Level</div>
                <div className="m-row-sublabel">
                  {experience === 'under_6_months'
                    ? 'Beginner (< 6 mo)'
                    : experience === 'six_to_24_months'
                    ? 'Intermediate (6-24 mo)'
                    : 'Advanced (2+ yrs)'}
                </div>
              </div>
            </div>
            <span className="m-row-chevron">›</span>
          </div>
        </div>
      </div>

      {/* Cross-Device Data Sync Section */}
      <div className="m-grouped-section">
        <div className="m-section-title">Cross-Device Data Sync</div>
        <div className="m-inset-list">
          {/* Row 1: Wi-Fi Direct Sync */}
          <div
            className="m-list-row m-list-row-clickable"
            onClick={() => {
              setLanSheetOpen(true);
              setSyncMessage(null);
            }}
          >
            <div className="m-row-left">
              <span className="m-row-icon">📡</span>
              <div>
                <div className="m-row-label">Wi-Fi Direct Sync (PC ↔ Phone)</div>
                <div className="m-row-sublabel">Push or pull directly over your home Wi-Fi in 50ms</div>
              </div>
            </div>
            <span className="m-row-chevron">›</span>
          </div>

          {/* Row 2: 1-Tap Cloud Sync */}
          <div
            className="m-list-row m-list-row-clickable"
            onClick={() => {
              setCloudSheetOpen(true);
              setSyncMessage(null);
            }}
          >
            <div className="m-row-left">
              <span className="m-row-icon">☁️</span>
              <div>
                <div className="m-row-label">1-Tap Cloud Sync (GitHub Gist)</div>
                <div className="m-row-sublabel">
                  {lastSyncedTime
                    ? `Synced ${new Date(Number(lastSyncedTime)).toLocaleDateString()}`
                    : 'Sync across devices via private GitHub Gist'}
                </div>
              </div>
            </div>
            <span className="m-row-chevron">›</span>
          </div>

          {/* Row 3: Offline Backup */}
          <div
            className="m-list-row m-list-row-clickable"
            onClick={() => {
              setOfflineSheetOpen(true);
              setSyncMessage(null);
            }}
          >
            <div className="m-row-left">
              <span className="m-row-icon">📦</span>
              <div>
                <div className="m-row-label">Offline Backup (File / Sync Code)</div>
                <div className="m-row-sublabel">Export .json or copy/paste sync codes</div>
              </div>
            </div>
            <span className="m-row-chevron">›</span>
          </div>
        </div>
      </div>

      {/* Recalibration Button */}
      <div className="m-grouped-section">
        <button
          type="button"
          className="m-btn m-btn-secondary"
          onClick={onNavigateToOnboarding}
          style={{ marginBottom: '1rem' }}
        >
          🎯 Recalibrate Baseline Push/Pull Maxes
        </button>

        {/* Save Confirmation Message */}
        {statusMessage && (
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.2)',
              border: '1px solid var(--m-green)',
              color: 'var(--m-green)',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--m-radius-md)',
              marginBottom: '0.75rem',
              fontWeight: 700,
              fontSize: '0.9rem',
              textAlign: 'center',
            }}
          >
            ✓ {statusMessage}
          </div>
        )}

        {/* Save Settings Button */}
        <button
          type="button"
          className={`m-btn ${statusMessage ? 'm-btn-success' : 'm-btn-primary'}`}
          style={{ height: '54px', fontSize: '1.05rem', marginBottom: '2.5rem' }}
          onClick={() => handleSave()}
          disabled={saving}
        >
          {saving ? 'Saving...' : statusMessage ? '✓ Saved!' : '✓ Save Changes'}
        </button>
      </div>

      {/* Frequency Bottom Sheet */}
      <BottomSheet
        isOpen={freqSheetOpen}
        onClose={() => setFreqSheetOpen(false)}
        title="Select Training Frequency"
        id="freq-sheet"
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

      {/* Priority Muscles Bottom Sheet */}
      <BottomSheet
        isOpen={prioritySheetOpen}
        onClose={() => setPrioritySheetOpen(false)}
        title="Select Priority Muscles"
        id="priority-sheet"
      >
        <p style={{ fontSize: '0.85rem', color: 'var(--m-text-muted)', margin: '0 0 1rem' }}>
          Priority muscles receive full optimal MAV volume allocation.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          {allMuscles.map((m) => {
            const isSelected = priorityMuscles.includes(m);
            return (
              <button
                key={m}
                type="button"
                className={`m-btn ${isSelected ? 'm-btn-primary' : 'm-btn-secondary'}`}
                style={{ height: '48px', textTransform: 'capitalize', fontSize: '0.9rem' }}
                onClick={() => togglePriorityMuscle(m)}
              >
                {isSelected ? '★ ' : ''} {m}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="m-btn m-btn-primary"
          style={{ marginTop: '1.25rem' }}
          onClick={() => setPrioritySheetOpen(false)}
        >
          Done
        </button>
      </BottomSheet>

      {/* Experience Level Bottom Sheet */}
      <BottomSheet
        isOpen={expSheetOpen}
        onClose={() => setExpSheetOpen(false)}
        title="Select Experience Level"
        id="exp-sheet"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {[
            { id: 'under_6_months' as ExperienceLevel, label: 'Beginner', sub: 'Under 6 months (0.7x volume factor)' },
            { id: 'six_to_24_months' as ExperienceLevel, label: 'Intermediate', sub: '6 to 24 months (Standard MAV)' },
            { id: 'over_2_years' as ExperienceLevel, label: 'Advanced', sub: 'Over 2 years (Full volume capacity)' },
          ].map((exp) => (
            <div
              key={exp.id}
              className="m-list-row m-list-row-clickable"
              style={{
                borderRadius: 'var(--m-radius-md)',
                background: experience === exp.id ? 'rgba(99, 102, 241, 0.2)' : 'var(--m-bg-card)',
                border: experience === exp.id ? '1px solid var(--m-primary)' : '1px solid var(--m-border)',
              }}
              onClick={() => {
                setExperience(exp.id);
                setExpSheetOpen(false);
              }}
            >
              <div>
                <div className="m-row-label">{exp.label}</div>
                <div className="m-row-sublabel">{exp.sub}</div>
              </div>
              {experience === exp.id && <span style={{ color: 'var(--m-cyan)' }}>✓</span>}
            </div>
          ))}
        </div>
      </BottomSheet>

      {/* Wi-Fi Direct Sync Bottom Sheet */}
      <BottomSheet
        isOpen={lanSheetOpen}
        onClose={() => setLanSheetOpen(false)}
        title="Wi-Fi Direct Sync"
        id="lan-sync-sheet"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingBottom: '1rem' }}>
          <p style={{ fontSize: '0.82rem', color: 'var(--m-text-muted)', margin: 0, lineHeight: 1.4 }}>
            Ensure your phone and PC are connected to the same Wi-Fi. On your PC, click <strong>Start Wi-Fi Sync Server</strong> in Settings, then enter the IP and 4-digit PIN displayed on your PC screen:
          </p>

          {syncMessage && (
            <div
              style={{
                padding: '0.65rem 0.85rem',
                borderRadius: 'var(--m-radius-sm)',
                fontSize: '0.85rem',
                fontWeight: 600,
                background: syncMessage.isError ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                border: `1px solid ${syncMessage.isError ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
                color: syncMessage.isError ? 'var(--m-red)' : 'var(--m-green)',
                textAlign: 'center',
              }}
            >
              {syncMessage.text}
            </div>
          )}

          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--m-text-muted)', marginBottom: '0.35rem', display: 'block' }}>
              PC IP Address (e.g. 192.168.1.15)
            </label>
            <input
              type="text"
              className="m-input"
              value={lanIp}
              onChange={(e) => {
                setLanIp(e.target.value);
                localStorage.setItem('mgp_lan_client_ip', e.target.value);
              }}
              placeholder="192.168.1.XX"
              style={{
                width: '100%',
                height: '46px',
                background: 'var(--m-bg-card)',
                border: '1px solid var(--m-border)',
                borderRadius: 'var(--m-radius-sm)',
                color: 'var(--m-text-main)',
                fontSize: '1rem',
                padding: '0 0.85rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--m-text-muted)', marginBottom: '0.35rem', display: 'block' }}>
                4-Digit PIN
              </label>
              <input
                type="text"
                maxLength={4}
                className="m-input"
                value={lanPin}
                onChange={(e) => setLanPin(e.target.value)}
                placeholder="1234"
                style={{
                  width: '100%',
                  height: '46px',
                  background: 'var(--m-bg-card)',
                  border: '1px solid var(--m-border)',
                  borderRadius: 'var(--m-radius-sm)',
                  color: 'var(--m-cyan)',
                  fontSize: '1.25rem',
                  fontWeight: 900,
                  letterSpacing: '0.2em',
                  textAlign: 'center',
                  padding: '0 0.5rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ width: '90px' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--m-text-muted)', marginBottom: '0.35rem', display: 'block' }}>
                Port
              </label>
              <input
                type="number"
                className="m-input"
                value={lanPort}
                onChange={(e) => setLanPort(Number(e.target.value) || 7878)}
                style={{
                  width: '100%',
                  height: '46px',
                  background: 'var(--m-bg-card)',
                  border: '1px solid var(--m-border)',
                  borderRadius: 'var(--m-radius-sm)',
                  color: 'var(--m-text-main)',
                  fontSize: '0.95rem',
                  textAlign: 'center',
                  padding: '0 0.5rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              className="m-btn m-btn-primary"
              style={{ height: '48px', fontWeight: 800 }}
              disabled={syncLoading || !lanIp.trim() || !lanPin.trim()}
              onClick={async () => {
                setSyncLoading(true);
                setSyncMessage(null);
                try {
                  localStorage.setItem('mgp_lan_client_ip', lanIp.trim());
                  const payload = await pullFromLanServer(lanIp, lanPort, lanPin);
                  onSaved(payload.settings);
                  setSyncMessage({ text: '✓ Pulled all data from PC successfully!' });
                } catch (e: any) {
                  setSyncMessage({ text: `Failed: ${e?.message || e}`, isError: true });
                } finally {
                  setSyncLoading(false);
                }
              }}
            >
              {syncLoading ? 'Connecting...' : '⬇️ Pull All Data from PC'}
            </button>

            <button
              type="button"
              className="m-btn m-btn-secondary"
              style={{ height: '44px' }}
              disabled={syncLoading || !lanIp.trim() || !lanPin.trim()}
              onClick={async () => {
                setSyncLoading(true);
                setSyncMessage(null);
                try {
                  localStorage.setItem('mgp_lan_client_ip', lanIp.trim());
                  await pushToLanServer(lanIp, lanPort, lanPin);
                  setSyncMessage({ text: '✓ Pushed phone data to PC successfully!' });
                } catch (e: any) {
                  setSyncMessage({ text: `Failed: ${e?.message || e}`, isError: true });
                } finally {
                  setSyncLoading(false);
                }
              }}
            >
              {syncLoading ? 'Sending...' : '⬆️ Push All Data to PC'}
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* Cloud Sync Bottom Sheet */}
      <BottomSheet
        isOpen={cloudSheetOpen}
        onClose={() => setCloudSheetOpen(false)}
        title="1-Tap Cloud Sync (GitHub Gist)"
        id="cloud-sync-sheet"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingBottom: '1rem' }}>
          <p style={{ fontSize: '0.82rem', color: 'var(--m-text-muted)', margin: 0, lineHeight: 1.4 }}>
            Sync your workout progression across all devices via a private, secret GitHub Gist (<code>mgp_sync_state.json</code>).
          </p>

          {syncMessage && (
            <div
              style={{
                padding: '0.65rem 0.85rem',
                borderRadius: 'var(--m-radius-sm)',
                fontSize: '0.85rem',
                fontWeight: 600,
                background: syncMessage.isError ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                border: `1px solid ${syncMessage.isError ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
                color: syncMessage.isError ? 'var(--m-red)' : 'var(--m-green)',
                textAlign: 'center',
              }}
            >
              {syncMessage.text}
            </div>
          )}

          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--m-text-muted)', marginBottom: '0.35rem', display: 'block' }}>
              GitHub Personal Access Token (gist scope)
            </label>
            <input
              type="password"
              className="m-input"
              value={gistToken}
              onChange={(e) => {
                setGistToken(e.target.value);
                localStorage.setItem('mgp_gist_token', e.target.value);
              }}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              style={{
                width: '100%',
                height: '46px',
                background: 'var(--m-bg-card)',
                border: '1px solid var(--m-border)',
                borderRadius: 'var(--m-radius-sm)',
                color: 'var(--m-text-main)',
                fontSize: '0.9rem',
                padding: '0 0.85rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--m-text-muted)', marginBottom: '0.35rem', display: 'block' }}>
              Gist ID (Optional — auto-discovered if blank)
            </label>
            <input
              type="text"
              className="m-input"
              value={gistId}
              onChange={(e) => {
                setGistId(e.target.value);
                localStorage.setItem('mgp_gist_id', e.target.value);
              }}
              placeholder="Auto-discovered or paste ID"
              style={{
                width: '100%',
                height: '46px',
                background: 'var(--m-bg-card)',
                border: '1px solid var(--m-border)',
                borderRadius: 'var(--m-radius-sm)',
                color: 'var(--m-text-main)',
                fontSize: '0.9rem',
                padding: '0 0.85rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              className="m-btn m-btn-primary"
              style={{ height: '48px', fontWeight: 800 }}
              disabled={syncLoading || !gistToken.trim()}
              onClick={async () => {
                setSyncLoading(true);
                setSyncMessage(null);
                try {
                  const res = await pushToGitHubGist(gistToken, gistId);
                  setGistId(res.gistId);
                  const now = Date.now().toString();
                  setLastSyncedTime(now);
                  setSyncMessage({ text: '✓ Pushed state to GitHub Secret Gist!' });
                } catch (e: any) {
                  setSyncMessage({ text: `Failed: ${e?.message || e}`, isError: true });
                } finally {
                  setSyncLoading(false);
                }
              }}
            >
              {syncLoading ? 'Syncing...' : '⬆️ Cloud Push (Save)'}
            </button>

            <button
              type="button"
              className="m-btn m-btn-secondary"
              style={{ height: '44px' }}
              disabled={syncLoading || !gistToken.trim()}
              onClick={async () => {
                setSyncLoading(true);
                setSyncMessage(null);
                try {
                  const payload = await pullFromGitHubGist(gistToken, gistId);
                  onSaved(payload.settings);
                  const now = Date.now().toString();
                  setLastSyncedTime(now);
                  setSyncMessage({ text: '✓ Pulled and applied state from GitHub Gist!' });
                } catch (e: any) {
                  setSyncMessage({ text: `Failed: ${e?.message || e}`, isError: true });
                } finally {
                  setSyncLoading(false);
                }
              }}
            >
              {syncLoading ? 'Syncing...' : '⬇️ Cloud Pull (Restore)'}
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* Offline Backup Bottom Sheet */}
      <BottomSheet
        isOpen={offlineSheetOpen}
        onClose={() => setOfflineSheetOpen(false)}
        title="Offline Backup & Transfer"
        id="offline-sync-sheet"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingBottom: '1rem' }}>
          <p style={{ fontSize: '0.82rem', color: 'var(--m-text-muted)', margin: 0, lineHeight: 1.4 }}>
            100% offline data portability. Copy a sync code string to your clipboard or export/import a JSON file.
          </p>

          {syncMessage && (
            <div
              style={{
                padding: '0.65rem 0.85rem',
                borderRadius: 'var(--m-radius-sm)',
                fontSize: '0.85rem',
                fontWeight: 600,
                background: syncMessage.isError ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                border: `1px solid ${syncMessage.isError ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
                color: syncMessage.isError ? 'var(--m-red)' : 'var(--m-green)',
                textAlign: 'center',
              }}
            >
              {syncMessage.text}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <button
              type="button"
              className="m-btn m-btn-secondary"
              style={{ height: '46px', fontWeight: 700 }}
              disabled={syncLoading}
              onClick={async () => {
                setSyncLoading(true);
                setSyncMessage(null);
                try {
                  const payload = await exportBackupWithMeta();
                  const code = encodeSyncString(payload);
                  await navigator.clipboard.writeText(code);
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 3000);
                  setSyncMessage({ text: '✓ Sync code copied to clipboard!' });
                } catch (e: any) {
                  setSyncMessage({ text: `Copy failed: ${e?.message || e}`, isError: true });
                } finally {
                  setSyncLoading(false);
                }
              }}
            >
              {copiedCode ? '✓ Copied to Clipboard!' : '📋 Copy Sync Code to Clipboard'}
            </button>

            <button
              type="button"
              className="m-btn m-btn-secondary"
              style={{ height: '46px' }}
              disabled={syncLoading}
              onClick={async () => {
                setSyncLoading(true);
                setSyncMessage(null);
                try {
                  const payload = await exportBackupWithMeta();
                  downloadBackupJsonFile(payload);
                  setSyncMessage({ text: '✓ Backup file exported!' });
                } catch (e: any) {
                  setSyncMessage({ text: `Export failed: ${e?.message || e}`, isError: true });
                } finally {
                  setSyncLoading(false);
                }
              }}
            >
              💾 Export .json File
            </button>

            <label
              className="m-btn m-btn-secondary"
              style={{
                height: '46px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              📂 Import .json File
              <input
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = async (ev) => {
                    setSyncLoading(true);
                    setSyncMessage(null);
                    try {
                      const text = ev.target?.result as string;
                      const payload = JSON.parse(text);
                      const imported = await importBackupAndApply(payload);
                      onSaved(imported.settings);
                      setSyncMessage({ text: '✓ Successfully imported backup!' });
                    } catch (err: any) {
                      setSyncMessage({ text: `Import failed: ${err?.message || err}`, isError: true });
                    } finally {
                      setSyncLoading(false);
                    }
                  };
                  reader.readAsText(file);
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          <div style={{ borderTop: '1px solid var(--m-border)', paddingTop: '0.85rem' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--m-text-muted)', marginBottom: '0.35rem', display: 'block' }}>
              Paste Sync Code to Restore
            </label>
            <textarea
              className="m-input"
              rows={3}
              value={pasteSyncCode}
              onChange={(e) => setPasteSyncCode(e.target.value)}
              placeholder="Paste MGP1: code here..."
              style={{
                width: '100%',
                background: 'var(--m-bg-card)',
                border: '1px solid var(--m-border)',
                borderRadius: 'var(--m-radius-sm)',
                color: 'var(--m-text-main)',
                fontSize: '0.8rem',
                fontFamily: 'monospace',
                padding: '0.5rem',
                boxSizing: 'border-box',
                marginBottom: '0.5rem',
              }}
            />
            <button
              type="button"
              className="m-btn m-btn-primary"
              style={{ width: '100%', height: '44px', fontWeight: 800 }}
              disabled={syncLoading || !pasteSyncCode.trim()}
              onClick={async () => {
                setSyncLoading(true);
                setSyncMessage(null);
                try {
                  const payload = decodeSyncString(pasteSyncCode);
                  const imported = await importBackupAndApply(payload);
                  onSaved(imported.settings);
                  setPasteSyncCode('');
                  setSyncMessage({ text: '✓ Successfully restored state from code!' });
                } catch (e: any) {
                  setSyncMessage({ text: `Restore failed: ${e?.message || e}`, isError: true });
                } finally {
                  setSyncLoading(false);
                }
              }}
            >
              📥 Paste & Restore Code
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
};
