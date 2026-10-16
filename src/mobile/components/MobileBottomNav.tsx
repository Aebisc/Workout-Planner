import React from 'react';

export type MobileTab = 'workouts' | 'analytics' | 'settings';

interface MobileBottomNavProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onTabChange,
}) => {
  return (
    <nav className="mobile-bottom-nav">
      <button
        type="button"
        className={`mobile-nav-item ${activeTab === 'workouts' ? 'active' : ''}`}
        onClick={() => onTabChange('workouts')}
      >
        <span className="mobile-nav-icon">🏋️</span>
        <span>Workouts</span>
      </button>

      <button
        type="button"
        className={`mobile-nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
        onClick={() => onTabChange('analytics')}
      >
        <span className="mobile-nav-icon">📊</span>
        <span>Volume</span>
      </button>

      <button
        type="button"
        className={`mobile-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
        onClick={() => onTabChange('settings')}
      >
        <span className="mobile-nav-icon">⚙️</span>
        <span>Settings</span>
      </button>
    </nav>
  );
};
