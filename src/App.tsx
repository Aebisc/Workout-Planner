import { useEffect, useState } from 'react';
import { api } from './api';
import { DashboardScreen } from './screens/DashboardScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { PlanOverviewScreen } from './screens/PlanOverviewScreen';
import { SessionScreen } from './screens/SessionScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { Plan, Settings } from './types';
import { popModalBackHandler } from './utils/androidBack';
import { useIsMobile } from './utils/useIsMobile';
import { MobileApp } from './mobile/MobileApp';
import './App.css';

type ActiveTab = 'overview' | 'session' | 'dashboard' | 'history' | 'settings' | 'onboarding';

export function App() {
  const [tab, setTab] = useState<ActiveTab>('overview');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selectedSessionNumber, setSelectedSessionNumber] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);

  const navigateTo = (newTab: ActiveTab, sessNum?: number) => {
    if (sessNum !== undefined) {
      setSelectedSessionNumber(sessNum);
    }
    if (newTab !== tab) {
      window.history.pushState(
        { tab: newTab, sessionNumber: sessNum ?? selectedSessionNumber },
        ''
      );
      setTab(newTab);
    }
  };

  useEffect(() => {
    if (!window.history.state) {
      window.history.replaceState({ tab: 'overview' }, '');
    }

    const handlePopState = (e: PopStateEvent) => {
      // On mobile, MobileApp handles back navigation
      if (window.innerWidth <= 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        return;
      }

      // 1. If an open modal was closed by back button, consume event
      if (popModalBackHandler()) {
        return;
      }

      // 2. Otherwise navigate to the tab from history state
      const targetTab: ActiveTab = e.state?.tab || 'overview';
      if (e.state?.sessionNumber) {
        setSelectedSessionNumber(e.state.sessionNumber);
      }
      setTab(targetTab);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const refreshState = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [currentSettings, currentPlan, profile] = await Promise.all([
        api.getSettings(),
        api.getPlan(),
        api.getProfile(),
      ]);

      setSettings(currentSettings);
      setPlan(currentPlan);

      // Only route to onboarding if never calibrated and no plan exists
      const hasCalibrated = Object.keys(profile.estimated_max_reps).length > 0;
      if (!hasCalibrated && !currentPlan) {
        setTab('onboarding');
      }
    } catch (err) {
      console.error('Failed to load initial app state:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    refreshState();
  }, []);

  const isMobile = useIsMobile();

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner"></div>
        <p>Loading Muscle Growth Planner...</p>
      </div>
    );
  }

  if (isMobile) {
    return (
      <MobileApp
        plan={plan}
        settings={settings}
        refreshState={refreshState}
        initialTab={tab}
        onNavigate={(newTab) => setTab(newTab)}
      />
    );
  }

  return (
    <div className="app-container">
      {/* Top Desktop Navigation Bar */}
      <header className="app-header">
        <div className="app-brand" onClick={() => navigateTo('overview')}>
          <img src="/app-icon.png" alt="Icon" className="brand-icon-img" />
          <h1>Muscle Growth Planner</h1>
        </div>

        {tab !== 'onboarding' && (
          <nav className="nav-tabs">
            <button
              className={`nav-tab ${tab === 'overview' ? 'active' : ''}`}
              onClick={() => navigateTo('overview')}
            >
              📋 Schedule
            </button>
            <button
              className={`nav-tab ${tab === 'dashboard' ? 'active' : ''}`}
              onClick={() => navigateTo('dashboard')}
            >
              📊 Volume & Warnings
            </button>
            <button
              className={`nav-tab ${tab === 'history' ? 'active' : ''}`}
              onClick={() => navigateTo('history')}
            >
              📜 History
            </button>
            <button
              className={`nav-tab ${tab === 'settings' ? 'active' : ''}`}
              onClick={() => navigateTo('settings')}
            >
              ⚙ Settings
            </button>
            <button
              className="nav-tab nav-tab-subtle"
              onClick={() => navigateTo('onboarding')}
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
              navigateTo('overview');
            }}
          />
        )}

        {tab === 'overview' && plan && settings && (
          <PlanOverviewScreen
            plan={plan}
            settings={settings}
            onSelectSession={(sessNum) => {
              navigateTo('session', sessNum);
            }}
            onRefreshPlan={refreshState}
            onOpenSettings={() => navigateTo('settings')}
          />
        )}

        {tab === 'session' && settings && (
          <SessionScreen
            sessionNumber={selectedSessionNumber}
            settings={settings}
            onBackToOverview={async () => {
              await refreshState();
              if (window.history.state?.tab === 'session') {
                window.history.back();
              } else {
                navigateTo('overview');
              }
            }}
          />
        )}

        {tab === 'dashboard' && settings && (
          <DashboardScreen
            plan={plan}
            settings={settings}
            onPlanUpdated={refreshState}
          />
        )}

        {tab === 'history' && settings && (
          <HistoryScreen
            settings={settings}
            plan={plan}
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
