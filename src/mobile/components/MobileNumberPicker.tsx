import React, { useState } from 'react';
import { BottomSheet } from './BottomSheet';

interface MobileNumberPickerProps {
  label?: string;
  value: number;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  quickStep?: number;
  onChange: (val: number) => void;
  id?: string;
}

export const MobileNumberPicker: React.FC<MobileNumberPickerProps> = ({
  label,
  value,
  unit,
  min = 0,
  max = 999,
  step = 1,
  quickStep = 5,
  onChange,
  id = 'numpad',
}) => {
  const [padOpen, setPadOpen] = useState(false);
  const [padVal, setPadVal] = useState<string>(String(value));
  const [isFreshOpen, setIsFreshOpen] = useState(false);

  React.useEffect(() => {
    if (!padOpen) {
      setPadVal(String(value));
    }
  }, [value, padOpen]);

  const handleOpenPad = () => {
    setPadVal(String(value));
    setIsFreshOpen(true);
    setPadOpen(true);
  };

  const handleKeyTap = (digit: string) => {
    if (isFreshOpen || padVal === '0') {
      setPadVal(digit);
      setIsFreshOpen(false);
    } else {
      if (padVal.length < 4) {
        setPadVal(padVal + digit);
      }
    }
  };

  const handleBackspace = () => {
    if (padVal.length <= 1) {
      setPadVal('0');
    } else {
      setPadVal(padVal.slice(0, -1));
    }
  };

  const handleSavePad = () => {
    const parsed = parseInt(padVal, 10);
    const valid = isNaN(parsed) ? value : parsed;
    const clamped = Math.min(max, Math.max(min, valid));
    onChange(clamped);
    setPadOpen(false);
  };

  const handleIncrement = (amount: number) => {
    const next = Math.min(max, Math.max(min, value + amount));
    onChange(next);
  };

  const rawPresets: number[] =
    unit === 's'
      ? [20, 30, 45, 60, 90]
      : unit === 'reps'
      ? [6, 8, 10, 12, 15, 20]
      : unit === 'sets'
      ? [2, 3, 4, 5, 6, 8]
      : [];
  const quickPresets = rawPresets.filter((p) => p >= min && p <= max);

  return (
    <div className="m-number-picker">
      {label && <label className="m-picker-label">{label}</label>}

      <div className="m-picker-controls-row">
        {quickStep > 1 && (
          <button
            type="button"
            className="m-picker-btn m-picker-btn-quick"
            onClick={() => handleIncrement(-quickStep)}
            title={`Subtract ${quickStep}`}
          >
            -{quickStep}
          </button>
        )}
        <button
          type="button"
          className="m-picker-btn"
          onClick={() => handleIncrement(-step)}
          title={`Subtract ${step}`}
        >
          −
        </button>

        <div className="m-picker-val-box" onClick={handleOpenPad}>
          <span className="m-picker-val-text">{value}</span>
          {unit && <span className="m-picker-val-unit">{unit}</span>}
        </div>

        <button
          type="button"
          className="m-picker-btn"
          onClick={() => handleIncrement(step)}
          title={`Add ${step}`}
        >
          +
        </button>
        {quickStep > 1 && (
          <button
            type="button"
            className="m-picker-btn m-picker-btn-quick"
            onClick={() => handleIncrement(quickStep)}
            title={`Add ${quickStep}`}
          >
            +{quickStep}
          </button>
        )}
      </div>

      {/* Built-in Custom Numpad Bottom Sheet (no keyboard popup) */}
      <BottomSheet
        isOpen={padOpen}
        onClose={() => setPadOpen(false)}
        title={label ? `Enter ${label}` : 'Enter Value'}
        id={`sheet-${id}`}
      >
        <div style={{ textAlign: 'center', margin: '0.5rem 0 1rem' }}>
          <div
            style={{
              fontSize: '2.5rem',
              fontWeight: 800,
              color: 'var(--m-cyan)',
              letterSpacing: '-0.02em',
            }}
          >
            {padVal} {unit}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--m-text-subtle)' }}>
            Range: {min} – {max} {unit}
          </div>
        </div>

        {quickPresets.length > 0 && (
          <div className="m-numpad-presets">
            {quickPresets.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`m-numpad-preset-chip ${Number(padVal) === preset ? 'active' : ''}`}
                onClick={() => {
                  onChange(preset);
                  setPadOpen(false);
                }}
              >
                {preset}{unit === 's' ? 's' : ''}
              </button>
            ))}
          </div>
        )}

        <div className="m-numpad-grid">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              className="m-numpad-key"
              onClick={() => handleKeyTap(digit)}
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            className="m-numpad-key subtle"
            onClick={handleBackspace}
          >
            ⌫
          </button>
          <button
            type="button"
            className="m-numpad-key"
            onClick={() => handleKeyTap('0')}
          >
            0
          </button>
          <button
            type="button"
            className="m-numpad-key accent"
            onClick={handleSavePad}
          >
            ✓ Done
          </button>
        </div>
      </BottomSheet>
    </div>
  );
};
