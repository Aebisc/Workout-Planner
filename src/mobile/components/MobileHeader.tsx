import React from 'react';

interface MobileHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  title,
  subtitle,
  showBack,
  onBack,
  rightAction,
}) => {
  return (
    <header className="mobile-header">
      <div className="mobile-header-left">
        {showBack ? (
          <button
            type="button"
            className="mobile-header-back-btn"
            onClick={onBack}
            aria-label="Back"
          >
            <span className="mobile-back-arrow">←</span>
            <span>Back</span>
          </button>
        ) : (
          <img src="/app-icon.png" alt="MGP" className="mobile-header-logo" />
        )}
        <div className="mobile-header-titles">
          <h1 className="mobile-header-title">{title}</h1>
          {subtitle && <span className="mobile-header-subtitle">{subtitle}</span>}
        </div>
      </div>
      <div className="mobile-header-right">{rightAction}</div>
    </header>
  );
};
