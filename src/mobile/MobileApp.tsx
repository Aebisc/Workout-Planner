import React, { useState, useEffect } from 'react';
import { Plan, Settings } from '../types';
import { MobileHeader } from './components/MobileHeader';
import { MobileBottomNav, MobileTab } from './components/MobileBottomNav';
import { MobilePlanScreen } from './screens/MobilePlanScreen';
import { MobileSessionScreen } from './screens/MobileSessionScreen';
import { MobileDashboardScreen } from './screens/MobileDashboardScreen';
import { MobileSettingsScreen } from './screens/MobileSettingsScreen';
import { MobileOnboardingScreen } from './screens/MobileOnboardingScreen';
import { popModalBackHandler } from '../utils/androidBack';
import './mobile.css';

interface MobileAppProps {
  plan: Plan | null;
  settings: Settings | null;
  refreshState: (silent?: boolean) => Promise<void>;
  initialTab?: 'overview' | 'session' | 'dashboard' | 'settings' | 'onboarding';
  onNavigate?: (tab: 'overview' | 'session' | 'dashboard' | 'settings' | 'onboarding') => void;
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
    if (initialTab === 'settings') return 'settings';
    return 'workouts';
  });
  const [activeStack, setActiveStack] = useState<'session' | 'onboarding' | null>(() => {
    if (initialTab === 'onboarding') return 'onboarding';
    if (initialTab === 'session') return 'session';
    return null;
  });
  const [selectedSessionNumber, setSelectedSessionNumber] = useState<number>(1);

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

  const handleStartSession = (sessNum: number) => {
    setSelectedSessionNumber(sessNum);
    window.history.pushState({ mobileStack: 'session', sessionNumber: sessNum }, '');
    setActiveStack('session');
    onNavigate?.('session');
  };

  const handleBackToWorkouts = async () => {
    await refreshState(true);
    setActiveStack(null);
    onNavigate?.('overview');
  };

  // Header Title derivation
  const getHeaderTitle = () => {
    if (activeStack === 'session') return `Session ${selectedSessionNumber}`;
    if (activeStack === 'onboarding') return 'Strength Calibration';
    if (activeTab === 'workouts') return 'Muscle Growth Planner';
    if (activeTab === 'analytics') return 'Volume Analytics';
    if (activeTab === 'settings') return 'Settings';
    return 'Muscle Growth Planner';
  };

  return (
    <div className="mobile-app-shell">
      {/* Top Header */}
      <MobileHeader
        title={getHeaderTitle()}
        showBack={!!activeStack}
        onBack={handleBackToWorkouts}
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
          onBackToOverview={handleBackToWorkouts}
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

      {!activeStack && activeTab === 'analytics' && settings && (
        <MobileDashboardScreen
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
            else if (tab === 'settings') onNavigate?.('settings');
          }}
        />
      )}
    </div>
  );
};
