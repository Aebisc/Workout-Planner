import React from 'react';

interface MobileHeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  title,
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
            ‹ Back
          </button>
        ) : (
          <div className="mobile-header-logo-wrap">
            <img src="/app-icon.png" alt="MGP" className="mobile-header-logo" />
            <h1 className="mobile-header-title">{title}</h1>
          </div>
        )}
      </div>

      {showBack && <h2 className="mobile-header-title">{title}</h2>}

      <div className="mobile-header-right">{rightAction}</div>
    </header>
  );
};
