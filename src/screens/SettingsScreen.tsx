import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { ExperienceLevel, LanSyncStatus, Muscle, Settings, Units } from '../types';
import { toDisplayHeight, toMetricHeight, CM_TO_IN } from '../utils/units';
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
  applyClientMeta,
  collectClientMeta,
} from '../utils/sync';
import {
  ALL_EQUIPMENT_OPTIONS,
  getActiveEquipmentList,
  formatActiveEquipmentSummary,
} from '../utils/equipment';

interface SettingsScreenProps {
  initialSettings: Settings;
  onSaved: (newSettings: Settings) => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  initialSettings,
  onSaved,
}) => {
  const [units, setUnits] = useState<Units>(initialSettings.units);
  const [enabledEquipment, setEnabledEquipment] = useState<string[]>(() =>
    getActiveEquipmentList(initialSettings)
  );
  const [backpack, setBackpack] = useState<boolean>(
    initialSettings.backpack || initialSettings.enabled_equipment?.includes('backpack') || false
  );
  const [weightVest, setWeightVest] = useState<boolean>(
    initialSettings.weight_vest || initialSettings.enabled_equipment?.includes('weight_vest') || false
  );
  const [showEquipmentModal, setShowEquipmentModal] = useState<boolean>(false);
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
  const [restTimerSound, setRestTimerSound] = useState<boolean>(
    initialSettings.rest_timer_sound ?? true
  );

  const [saving, setSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Cross-Device Sync State
  const [activeSyncTab, setActiveSyncTab] = useState<'lan' | 'cloud' | 'offline'>('lan');
  const [syncLoading, setSyncLoading] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [pasteSyncCode, setPasteSyncCode] = useState<string>('');

  // LAN Server State
  const [lanStatus, setLanStatus] = useState<LanSyncStatus>({
    running: false,
    ip: '127.0.0.1',
    port: 7878,
    pin: '0000',
  });
  const [clientIp, setClientIp] = useState<string>(() => localStorage.getItem('mgp_lan_client_ip') || '');
  const [clientPort, setClientPort] = useState<number>(7878);
  const [clientPin, setClientPin] = useState<string>('');

  // GitHub Gist Cloud Sync State
  const [gistToken, setGistToken] = useState<string>(() => localStorage.getItem('mgp_gist_token') || '');
  const [gistId, setGistId] = useState<string>(() => localStorage.getItem('mgp_gist_id') || '');
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(() => localStorage.getItem('mgp_last_synced'));
  const [showToken, setShowToken] = useState<boolean>(false);

  useEffect(() => {
    api.getLanSyncStatus().then(setLanStatus).catch(console.error);
  }, []);

  const handleStartLanServer = async () => {
    setSyncLoading(true);
    setSyncMessage(null);
    try {
      const status = await api.startLanSyncServer(collectClientMeta());
      setLanStatus(status);
      setSyncMessage({ text: `📡 Wi-Fi sync server listening on ${status.ip}:${status.port} (PIN: ${status.pin})` });
    } catch (e: any) {
      setSyncMessage({ text: `Failed to start server: ${e?.message || e}`, isError: true });
    } finally {
      setSyncLoading(false);
    }
  };

  const handleStopLanServer = async () => {
    setSyncLoading(true);
    setSyncMessage(null);
    try {
      const status = await api.stopLanSyncServer();
      setLanStatus(status);
      setSyncMessage({ text: '🛑 Wi-Fi sync server stopped.' });
    } catch (e: any) {
      setSyncMessage({ text: `Failed to stop server: ${e?.message || e}`, isError: true });
    } finally {
      setSyncLoading(false);
    }
  };

  const handleRefreshFromPhonePush = async () => {
    setSyncLoading(true);
    setSyncMessage(null);
    try {
      const meta = await api.getLanClientMeta();
      applyClientMeta(meta);
      const newSettings = await api.getSettings();
      onSaved(newSettings);
      setSyncMessage({ text: '✓ Successfully refreshed and applied latest phone data!' });
    } catch (e: any) {
      setSyncMessage({ text: `Failed to refresh: ${e?.message || e}`, isError: true });
    } finally {
      setSyncLoading(false);
    }
  };

  const handleClientPull = async () => {
    if (!clientIp || !clientPin) return;
    setSyncLoading(true);
    setSyncMessage(null);
    try {
      localStorage.setItem('mgp_lan_client_ip', clientIp);
      const payload = await pullFromLanServer(clientIp, clientPort, clientPin);
      onSaved(payload.settings);
      setSyncMessage({ text: `✓ Pulled all data from ${clientIp}:${clientPort} successfully!` });
    } catch (e: any) {
      setSyncMessage({ text: `Wi-Fi pull failed: ${e?.message || e}`, isError: true });
    } finally {
      setSyncLoading(false);
    }
  };

  const handleClientPush = async () => {
    if (!clientIp || !clientPin) return;
    setSyncLoading(true);
    setSyncMessage(null);
    try {
      localStorage.setItem('mgp_lan_client_ip', clientIp);
      await pushToLanServer(clientIp, clientPort, clientPin);
      setSyncMessage({ text: `✓ Pushed all data to ${clientIp}:${clientPort} successfully!` });
    } catch (e: any) {
      setSyncMessage({ text: `Wi-Fi push failed: ${e?.message || e}`, isError: true });
    } finally {
      setSyncLoading(false);
    }
  };

  const handleGistPush = async () => {
    if (!gistToken.trim()) return;
    setSyncLoading(true);
    setSyncMessage(null);
    try {
      const res = await pushToGitHubGist(gistToken, gistId);
      setGistId(res.gistId);
      const now = Date.now().toString();
      setLastSyncedTime(now);
      setSyncMessage({ text: `✓ Successfully pushed to GitHub Secret Gist (ID: ${res.gistId})!` });
    } catch (e: any) {
      setSyncMessage({ text: `Cloud push failed: ${e?.message || e}`, isError: true });
    } finally {
      setSyncLoading(false);
    }
  };

  const handleGistPull = async () => {
    if (!gistToken.trim()) return;
    setSyncLoading(true);
    setSyncMessage(null);
    try {
      const payload = await pullFromGitHubGist(gistToken, gistId);
      onSaved(payload.settings);
      const now = Date.now().toString();
      setLastSyncedTime(now);
      setSyncMessage({ text: '✓ Successfully pulled and applied state from GitHub Gist!' });
    } catch (e: any) {
      setSyncMessage({ text: `Cloud pull failed: ${e?.message || e}`, isError: true });
    } finally {
      setSyncLoading(false);
    }
  };

  const handleExportJsonFile = async () => {
    setSyncLoading(true);
    setSyncMessage(null);
    try {
      const payload = await exportBackupWithMeta();
      downloadBackupJsonFile(payload);
      setSyncMessage({ text: '✓ Exported backup file to downloads folder!' });
    } catch (e: any) {
      setSyncMessage({ text: `Export failed: ${e?.message || e}`, isError: true });
    } finally {
      setSyncLoading(false);
    }
  };

  const handleImportJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
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
        setSyncMessage({ text: '✓ Successfully imported backup file!' });
      } catch (err: any) {
        setSyncMessage({ text: `Import failed: ${err?.message || err}`, isError: true });
      } finally {
        setSyncLoading(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCopySyncCode = async () => {
    setSyncLoading(true);
    setSyncMessage(null);
    try {
      const payload = await exportBackupWithMeta();
      const code = encodeSyncString(payload);
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 3000);
      setSyncMessage({ text: '✓ Copied sync code to clipboard! You can paste it on your phone.' });
    } catch (e: any) {
      setSyncMessage({ text: `Copy failed: ${e?.message || e}`, isError: true });
    } finally {
      setSyncLoading(false);
    }
  };

  const handleRestoreSyncCode = async () => {
    if (!pasteSyncCode.trim()) return;
    setSyncLoading(true);
    setSyncMessage(null);
    try {
      const payload = decodeSyncString(pasteSyncCode);
      const imported = await importBackupAndApply(payload);
      onSaved(imported.settings);
      setPasteSyncCode('');
      setSyncMessage({ text: '✓ Successfully restored state from sync code!' });
    } catch (e: any) {
      setSyncMessage({ text: `Restore failed: ${e?.message || e}`, isError: true });
    } finally {
      setSyncLoading(false);
    }
  };

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

  const handleToggleEquipment = (eqId: string) => {
    setEnabledEquipment((prev) => {
      const exists = prev.includes(eqId);
      const updated = exists ? prev.filter((id) => id !== eqId) : [...prev, eqId];
      if (eqId === 'backpack') setBackpack(!exists);
      if (eqId === 'weight_vest') setWeightVest(!exists);
      return updated;
    });
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
      rest_timer_sound: restTimerSound,
      enabled_equipment: enabledEquipment,
      weight_vest: weightVest,
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
    <>
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
          <label>Rest Timer Completion Sound</label>
          <div className="toggle-container">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={restTimerSound}
                onChange={(e) => setRestTimerSound(e.target.checked)}
              />
              <span className="slider"></span>
            </label>
            <span className="toggle-label">
              {restTimerSound
                ? 'Unmuted (plays a gentle audio chime when your rest timer reaches 0:00)'
                : 'Muted (visual countdown only, no audio chime)'}
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

      {/* Cross-Device Sync & Backup Hub Card */}
      <div className="card settings-card" style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.4rem' }}>🔄 Cross-Device Sync & Backup Hub</h2>
            <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted, #94a3b8)', fontSize: '0.9rem' }}>
              Seamlessly sync your complete workouts, custom ladder levels, set logs, and settings between PC and Mobile.
            </p>
          </div>
          {lastSyncedTime && (
            <span className="badge badge-info" style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
              🕒 Last synced: {new Date(Number(lastSyncedTime)).toLocaleString()}
            </span>
          )}
        </div>

        {/* Global Hub Feedback Message */}
        {syncMessage && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              marginBottom: '1rem',
              fontSize: '0.9rem',
              fontWeight: 600,
              background: syncMessage.isError ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
              border: `1px solid ${syncMessage.isError ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
              color: syncMessage.isError ? '#ef4444' : '#10b981',
            }}
          >
            {syncMessage.text}
          </div>
        )}

        {/* Sync Navigation Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.1))', paddingBottom: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn ${activeSyncTab === 'lan' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
            onClick={() => { setActiveSyncTab('lan'); setSyncMessage(null); }}
          >
            📡 Local Wi-Fi Direct (PC ↔ Phone)
          </button>
          <button
            type="button"
            className={`btn ${activeSyncTab === 'cloud' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
            onClick={() => { setActiveSyncTab('cloud'); setSyncMessage(null); }}
          >
            ☁️ 1-Tap Cloud Sync (GitHub Gist)
          </button>
          <button
            type="button"
            className={`btn ${activeSyncTab === 'offline' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
            onClick={() => { setActiveSyncTab('offline'); setSyncMessage(null); }}
          >
            📋 File & Sync Code (Offline)
          </button>
        </div>

        {/* Tab 2: Local Wi-Fi Direct Sync */}
        {activeSyncTab === 'lan' && (
          <div>
            <div style={{ background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', color: 'var(--primary, #6366f1)' }}>
                🖥️ Host Wi-Fi Sync on this PC
              </h3>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-muted, #94a3b8)', margin: '0 0 1rem 0', lineHeight: 1.5 }}>
                Start the local Wi-Fi server, then on your phone (connected to the same Wi-Fi router), open <strong>Settings › Wi-Fi Direct Sync</strong>, enter this PC's IP and 4-digit PIN, and tap <strong>Pull from PC</strong> or <strong>Push to PC</strong>!
              </p>

              {lanStatus.running ? (
                <div>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
                    <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '8px', padding: '0.75rem 1.25rem' }}>
                      <div style={{ fontSize: '0.75rem', color: '#10b981', textTransform: 'uppercase', fontWeight: 800 }}>Server IP Address</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#f8fafc', letterSpacing: '0.05em' }}>{lanStatus.ip}</div>
                    </div>
                    <div style={{ background: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.4)', borderRadius: '8px', padding: '0.75rem 1.25rem' }}>
                      <div style={{ fontSize: '0.75rem', color: '#818cf8', textTransform: 'uppercase', fontWeight: 800 }}>Port</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#f8fafc' }}>{lanStatus.port}</div>
                    </div>
                    <div style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: '8px', padding: '0.75rem 1.25rem' }}>
                      <div style={{ fontSize: '0.75rem', color: '#f59e0b', textTransform: 'uppercase', fontWeight: 800 }}>4-Digit PIN</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#f59e0b', letterSpacing: '0.15em' }}>{lanStatus.pin}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleRefreshFromPhonePush}
                      disabled={syncLoading}
                    >
                      🔄 Refresh UI from Phone Push
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                      onClick={handleStopLanServer}
                      disabled={syncLoading}
                    >
                      🛑 Stop Wi-Fi Sync Server
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleStartLanServer}
                  disabled={syncLoading}
                >
                  {syncLoading ? 'Starting Server...' : '📡 Start Wi-Fi Sync Server'}
                </button>
              )}
            </div>

            {/* Client Mode: in case syncing between two PCs */}
            <details className="sync-client-panel">
              <summary className="sync-client-summary">
                💻 Connect to Another Computer / Server as Client (Optional)
              </summary>
              <div className="sync-client-form">
                <div className="sync-client-inputs-row">
                  <div className="sync-field-wrap">
                    <label>Remote IP Address</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="192.168.1.XX"
                      value={clientIp}
                      onChange={(e) => setClientIp(e.target.value)}
                    />
                  </div>
                  <div className="sync-field-wrap">
                    <label>Port</label>
                    <input
                      type="number"
                      className="form-control"
                      value={clientPort}
                      onChange={(e) => setClientPort(Number(e.target.value) || 7878)}
                    />
                  </div>
                  <div className="sync-field-wrap">
                    <label>PIN</label>
                    <input
                      type="text"
                      maxLength={4}
                      className="form-control sync-pin-input"
                      placeholder="1234"
                      value={clientPin}
                      onChange={(e) => setClientPin(e.target.value)}
                    />
                  </div>
                </div>

                <div className="sync-client-actions-row">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleClientPull}
                    disabled={syncLoading || !clientIp || !clientPin}
                  >
                    ⬇️ Pull from Remote
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleClientPush}
                    disabled={syncLoading || !clientIp || !clientPin}
                  >
                    ⬆️ Push to Remote
                  </button>
                </div>
              </div>
            </details>
          </div>
        )}

        {/* Tab 3: Cloud Sync (GitHub Gist) */}
        {activeSyncTab === 'cloud' && (
          <div>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted, #94a3b8)', margin: '0 0 1.25rem 0', lineHeight: 1.5 }}>
              Store your workouts and configuration securely in a private, secret GitHub Gist (<code>mgp_sync_state.json</code>). Tap <strong>Push to Cloud</strong> to save your state, and <strong>Pull from Cloud</strong> on any device to restore it with 1 tap!
            </p>

            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                GitHub Personal Access Token (classic or fine-grained with <code>gist</code> scope)
              </label>
              <div className="token-input-group" style={{ marginTop: '0.4rem' }}>
                <input
                  type={showToken ? 'text' : 'password'}
                  className="form-control"
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={gistToken}
                  onChange={(e) => {
                    setGistToken(e.target.value);
                    localStorage.setItem('mgp_gist_token', e.target.value);
                  }}
                />
                <button
                  type="button"
                  className="token-toggle-btn"
                  onClick={() => setShowToken(!showToken)}
                  title={showToken ? 'Hide token' : 'Show token'}
                >
                  {showToken ? '🙈 Hide' : '👁️ Show'}
                </button>
              </div>
              <small style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '0.45rem', display: 'block', lineHeight: 1.4 }}>
                Generate on GitHub: Settings › Developer Settings › Personal Access Tokens › Generate token with <code>gist</code> checked.
              </small>
            </div>

            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                Secret Gist ID (Optional — auto-discovered if left blank)
              </label>
              <div style={{ marginTop: '0.4rem' }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Auto-discovered or leave blank"
                  value={gistId}
                  onChange={(e) => {
                    setGistId(e.target.value);
                    localStorage.setItem('mgp_gist_id', e.target.value);
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleGistPush}
                disabled={syncLoading || !gistToken.trim()}
              >
                ☁️ Push to Cloud (Save)
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleGistPull}
                disabled={syncLoading || !gistToken.trim()}
              >
                ☁️ Pull from Cloud (Restore)
              </button>
            </div>
          </div>
        )}

        {/* Tab 1: File & Sync Code (Offline) */}
        {activeSyncTab === 'offline' && (
          <div>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted, #94a3b8)', margin: '0 0 1rem 0', lineHeight: 1.5 }}>
              Zero-cloud, completely offline data transfer. Export or import an exact JSON backup file, or copy/paste a compact sync code.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              {/* File Export/Import */}
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color, rgba(255,255,255,0.08))' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem' }}>📁 JSON Backup File</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 0.75rem 0' }}>
                  Save your complete database to disk or restore from an existing <code>.json</code> file.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                    onClick={handleExportJsonFile}
                    disabled={syncLoading}
                  >
                    📥 Export .json File
                  </button>
                  <label className="btn btn-secondary" style={{ flex: 1, margin: 0, textAlign: 'center', cursor: 'pointer' }}>
                    📤 Import .json File
                    <input
                      type="file"
                      accept=".json"
                      style={{ display: 'none' }}
                      onChange={handleImportJsonFile}
                    />
                  </label>
                </div>
              </div>

              {/* Sync Code */}
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color, rgba(255,255,255,0.08))' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem' }}>📋 Clipboard Sync Code</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 0.75rem 0' }}>
                  Copy an encoded string to your clipboard and paste it into your mobile phone or another device.
                </p>
                <button
                  type="button"
                  className="btn btn-secondary btn-block"
                  onClick={handleCopySyncCode}
                  disabled={syncLoading}
                >
                  {copiedCode ? '✓ Copied to Clipboard!' : '📋 Copy Sync Code'}
                </button>
              </div>
            </div>

            {/* Paste Sync Code Box */}
            <div className="sync-paste-box">
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>📥 Paste & Restore Sync Code</h4>
              <textarea
                className="form-control"
                rows={3}
                placeholder="Paste MGP1: sync code here..."
                value={pasteSyncCode}
                onChange={(e) => setPasteSyncCode(e.target.value)}
              />
              <div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleRestoreSyncCode}
                  disabled={syncLoading || !pasteSyncCode.trim()}
                  style={{ padding: '0.65rem 1.5rem', fontWeight: 700 }}
                >
                  ✓ Restore from Code
                </button>
              </div>
            </div>
          </div>
        )}
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
