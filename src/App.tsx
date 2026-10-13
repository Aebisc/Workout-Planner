import { useEffect, useState } from 'react';
import { api } from './api';
import { DashboardScreen } from './screens/DashboardScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { PlanOverviewScreen } from './screens/PlanOverviewScreen';
import { SessionScreen } from './screens/SessionScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { Plan, Settings } from './types';
import './App.css';

type ActiveTab = 'overview' | 'session' | 'dashboard' | 'settings' | 'onboarding';

export function App() {
  const [tab, setTab] = useState<ActiveTab>('overview');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selectedSessionNumber, setSelectedSessionNumber] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshState = async () => {
    setLoading(true);
    try {
      const [currentSettings, currentPlan, profile] = await Promise.all([
        api.getSettings(),
        api.getPlan(),
        api.getProfile(),
      ]);

      setSettings(currentSettings);
      setPlan(currentPlan);

      // If no estimated max reps recorded yet and no plan, start on onboarding
      const hasCalibrated = Object.keys(profile.estimated_max_reps).length > 0;
      if (!hasCalibrated || !currentPlan) {
        setTab('onboarding');
      }
    } catch (err) {
      console.error('Failed to load initial app state:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshState();
  }, []);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner"></div>
        <p>Loading Muscle Growth Planner...</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Top Desktop Navigation Bar */}
      <header className="app-header">
        <div className="app-brand" onClick={() => setTab('overview')}>
          <img src="/app-icon.png" alt="Icon" className="brand-icon-img" />
          <h1>Muscle Growth Planner</h1>
        </div>

        {tab !== 'onboarding' && (
          <nav className="nav-tabs">
            <button
              className={`nav-tab ${tab === 'overview' ? 'active' : ''}`}
              onClick={() => setTab('overview')}
            >
              📋 Schedule
            </button>
            <button
              className={`nav-tab ${tab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setTab('dashboard')}
            >
              📊 Volume & Warnings
            </button>
            <button
              className={`nav-tab ${tab === 'settings' ? 'active' : ''}`}
              onClick={() => setTab('settings')}
            >
              ⚙ Settings
            </button>
            <button
              className="nav-tab nav-tab-subtle"
              onClick={() => setTab('onboarding')}
              title="Recalibrate 1RM baselines"
            >
              🎯 Recalibrate
            </button>
          </nav>
        )}
      </header>

      {/* Main Screen Content */}
      <main className="main-content">
        {tab === 'onboarding' && (
          <OnboardingScreen
            onComplete={async () => {
              await refreshState();
              setTab('overview');
            }}
          />
        )}

        {tab === 'overview' && plan && settings && (
          <PlanOverviewScreen
            plan={plan}
            settings={settings}
            onSelectSession={(sessNum) => {
              setSelectedSessionNumber(sessNum);
              setTab('session');
            }}
            onRefreshPlan={refreshState}
            onOpenSettings={() => setTab('settings')}
          />
        )}

        {tab === 'session' && settings && (
          <SessionScreen
            sessionNumber={selectedSessionNumber}
            settings={settings}
            onBackToOverview={() => setTab('overview')}
          />
        )}

        {tab === 'dashboard' && settings && (
          <DashboardScreen
            plan={plan}
            settings={settings}
            onPlanUpdated={refreshState}
          />
        )}

        {tab === 'settings' && settings && (
          <SettingsScreen
            initialSettings={settings}
            onSaved={(updated) => {
              setSettings(updated);
              refreshState();
            }}
          />
        )}
      </main>
    </div>
  );
}

export default App;
