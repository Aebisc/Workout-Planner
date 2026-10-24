import React, { useState, useEffect, useRef } from 'react';
import { Plan, Settings } from '../types';
import { MobileHeader } from './components/MobileHeader';
import { MobileBottomNav, MobileTab } from './components/MobileBottomNav';
import { MobilePlanScreen } from './screens/MobilePlanScreen';
import { MobileSessionScreen } from './screens/MobileSessionScreen';
import { MobileDashboardScreen } from './screens/MobileDashboardScreen';
import { MobileHistoryScreen } from './screens/MobileHistoryScreen';
import { MobileSettingsScreen } from './screens/MobileSettingsScreen';
import { MobileOnboardingScreen } from './screens/MobileOnboardingScreen';
import { popModalBackHandler } from '../utils/androidBack';
import './mobile.css';

interface MobileAppProps {
  plan: Plan | null;
  settings: Settings | null;
  refreshState: (silent?: boolean) => Promise<void>;
  initialTab?: 'overview' | 'session' | 'dashboard' | 'history' | 'settings' | 'onboarding';
  onNavigate?: (tab: 'overview' | 'session' | 'dashboard' | 'history' | 'settings' | 'onboarding') => void;
}

export const MobileApp: React.FC<MobileAppProps> = ({
  plan,
  settings,
  refreshState,
  initialTab,
  onNavigate,
}) => {
  // Mobile active view: bottom tabs or stack screen
  const [activeTab, setActiveTab] = useState<MobileTab>(() => {
    if (initialTab === 'dashboard') return 'analytics';
    if (initialTab === 'history') return 'history';
    if (initialTab === 'settings') return 'settings';
    return 'workouts';
  });
  const [activeStack, setActiveStack] = useState<'session' | 'onboarding' | null>(() => {
    if (initialTab === 'onboarding') return 'onboarding';
    if (initialTab === 'session') return 'session';
    return null;
  });
  const [selectedSessionNumber, setSelectedSessionNumber] = useState<number>(1);

  // Sync initialTab changes from parent
  useEffect(() => {
    if (initialTab === 'onboarding') {
      setActiveStack('onboarding');
    } else if (initialTab === 'session') {
      setActiveStack('session');
    } else if (initialTab === 'dashboard') {
      setActiveStack(null);
      setActiveTab('analytics');
    } else if (initialTab === 'history') {
      setActiveStack(null);
      setActiveTab('history');
    } else if (initialTab === 'settings') {
      setActiveStack(null);
      setActiveTab('settings');
    } else if (initialTab === 'overview') {
      setActiveStack(null);
      setActiveTab('workouts');
    }
  }, [initialTab]);

  // Handle hardware / gesture back button
  useEffect(() => {
    const handlePopState = () => {
      // 1. Check if a bottom sheet or modal was open
      if (popModalBackHandler()) {
        // Re-push current screen so back doesn't pop the screen
        window.history.pushState(
          { mobileTab: activeTab, mobileStack: activeStack, sessionNumber: selectedSessionNumber },
          ''
        );
        return;
      }

      // 2. If inside a stacked view (session or onboarding), return to workouts
      if (activeStack) {
        if (activeStack === 'session' && sessionBackInterceptRef.current) {
          const intercepted = sessionBackInterceptRef.current();
          if (intercepted) {
            window.history.pushState(
              { mobileStack: 'session', sessionNumber: selectedSessionNumber },
              ''
            );
            return;
          }
        }
        setActiveStack(null);
        onNavigate?.('overview');
        return;
      }

      // 3. If on analytics or settings, return to workouts tab
      if (activeTab !== 'workouts') {
        setActiveTab('workouts');
        onNavigate?.('overview');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeStack, activeTab, selectedSessionNumber, onNavigate]);

  const sessionBackInterceptRef = useRef<(() => boolean) | null>(null);

  const handleStartSession = (sessNum: number) => {
    setSelectedSessionNumber(sessNum);
    window.history.pushState({ mobileStack: 'session', sessionNumber: sessNum }, '');
    setActiveStack('session');
    onNavigate?.('session');
  };

  const handleBackToWorkouts = async (forceExit = false) => {
    if (!forceExit && activeStack === 'session' && sessionBackInterceptRef.current) {
      const intercepted = sessionBackInterceptRef.current();
      if (intercepted) return;
    }
    sessionBackInterceptRef.current = null;
    await refreshState(true);
    setActiveStack(null);
    onNavigate?.('overview');
  };

  // Header Title derivation
  const getHeaderTitle = () => {
    if (activeStack === 'session') return `Session ${selectedSessionNumber}`;
    if (activeStack === 'onboarding') return 'Strength Calibration';
    if (activeTab === 'workouts') return 'Workout Planner';
    if (activeTab === 'analytics') return 'Volume Analytics';
    if (activeTab === 'history') return 'Workout History';
    if (activeTab === 'settings') return 'Settings';
    return 'Workout Planner';
  };

  return (
    <div className="mobile-app-shell">
      {/* Top Header */}
      <MobileHeader
        title={getHeaderTitle()}
        showBack={!!activeStack}
        onBack={() => handleBackToWorkouts(false)}
        rightAction={
          activeStack === 'session' ? (
            <button
              type="button"
              className="m-btn m-btn-secondary"
              onClick={() => handleBackToWorkouts(false)}
              style={{
                height: '32px',
                fontSize: '0.78rem',
                padding: '0 0.65rem',
                borderRadius: 'var(--m-radius-sm)',
                border: '1px solid var(--m-primary)',
                color: 'var(--m-cyan)',
              }}
            >
              ⏸ Pause
            </button>
          ) : undefined
        }
      />

      {/* Screen Views */}
      {activeStack === 'onboarding' && (
        <MobileOnboardingScreen
          onComplete={async () => {
            await refreshState(true);
            setActiveStack(null);
            setActiveTab('workouts');
            onNavigate?.('overview');
          }}
        />
      )}

      {activeStack === 'session' && settings && (
        <MobileSessionScreen
          sessionNumber={selectedSessionNumber}
          settings={settings}
          onBackToOverview={() => handleBackToWorkouts(true)}
          registerBackIntercept={(fn) => {
            sessionBackInterceptRef.current = fn;
          }}
        />
      )}

      {!activeStack && activeTab === 'workouts' && plan && settings && (
        <MobilePlanScreen
          plan={plan}
          settings={settings}
          onSelectSession={handleStartSession}
          onRefreshPlan={() => refreshState(true)}
          onOpenSettings={() => {
            setActiveTab('settings');
            onNavigate?.('settings');
          }}
        />
      )}

      {!activeStack && activeTab === 'workouts' && (!plan || !settings) && (
        <div className="mobile-view-container" style={{ padding: '2rem 1rem', textAlign: 'center' }}>
          <div className="m-card" style={{ padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '3rem' }}>🎯</span>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, color: 'var(--m-text-main)' }}>No Training Plan Found</h2>
            <p style={{ color: 'var(--m-text-muted)', fontSize: '0.9rem', lineHeight: 1.5, margin: 0 }}>
              Complete the quick baseline calibration to generate your scientific hypertrophy training plan.
            </p>
            <button
              type="button"
              className="m-btn m-btn-primary"
              style={{ width: '100%', marginTop: '0.5rem' }}
              onClick={() => {
                setActiveStack('onboarding');
                onNavigate?.('onboarding');
              }}
            >
              Start Strength Calibration ›
            </button>
          </div>
        </div>
      )}

      {!activeStack && activeTab === 'analytics' && settings && (
        <MobileDashboardScreen
          plan={plan}
          settings={settings}
          onPlanUpdated={() => refreshState(true)}
        />
      )}

      {!activeStack && activeTab === 'history' && (
        <MobileHistoryScreen
          plan={plan}
          settings={settings}
          onPlanUpdated={() => refreshState(true)}
        />
      )}

      {!activeStack && activeTab === 'settings' && settings && (
        <MobileSettingsScreen
          initialSettings={settings}
          onSaved={async () => {
            await refreshState(true);
          }}
          onNavigateToOnboarding={() => {
            window.history.pushState({ mobileStack: 'onboarding' }, '');
            setActiveStack('onboarding');
            onNavigate?.('onboarding');
          }}
        />
      )}

      {/* Bottom Navigation Bar (Hidden when inside a workout or onboarding) */}
      {!activeStack && (
        <MobileBottomNav
          activeTab={activeTab}
          onTabChange={(tab) => {
            window.history.pushState({ mobileTab: tab }, '');
            setActiveTab(tab);
            if (tab === 'workouts') onNavigate?.('overview');
            else if (tab === 'analytics') onNavigate?.('dashboard');
            else if (tab === 'history') onNavigate?.('history');
            else if (tab === 'settings') onNavigate?.('settings');
          }}
        />
      )}
    </div>
  );
};
