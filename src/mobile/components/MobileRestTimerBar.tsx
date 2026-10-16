import React, { useState } from 'react';
import { formatTimerMMSS } from '../../utils/restTimer';
import { BottomSheet } from './BottomSheet';

export interface MobileRestTimerState {
  isActive: boolean;
  isFinished: boolean;
  blockIndex: number;
  exerciseName: string;
  totalSeconds: number;
  remainingSeconds: number;
  endTimeMs: number;
  label: string;
  reason: string;
}

interface MobileRestTimerBarProps {
  timer: MobileRestTimerState | null;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onAdjustTimer: (delta: number) => void;
  onDismiss: () => void;
}

export const MobileRestTimerBar: React.FC<MobileRestTimerBarProps> = ({
  timer,
  soundEnabled,
  onToggleSound,
  onAdjustTimer,
  onDismiss,
}) => {
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!timer || !timer.isActive) return null;

  return (
    <>
      <div className="m-floating-timer">
        <div className="m-timer-left" onClick={() => setSheetOpen(true)}>
          <span style={{ fontSize: '1.25rem' }}>{timer.isFinished ? '🔔' : '⏱️'}</span>
          <div>
            <div className="m-timer-digits">{formatTimerMMSS(timer.remainingSeconds)}</div>
            <div className="m-timer-sub">{timer.exerciseName}</div>
          </div>
        </div>

        <div className="m-timer-actions">
          <button
            type="button"
            className="m-timer-quick-btn"
            onClick={() => onAdjustTimer(-15)}
            title="-15s"
          >
            -15s
          </button>
          <button
            type="button"
            className="m-timer-quick-btn"
            onClick={() => onAdjustTimer(30)}
            title="+30s"
          >
            +30s
          </button>
          <button
            type="button"
            className="m-timer-quick-btn"
            style={{ color: 'var(--m-amber)' }}
            onClick={onDismiss}
          >
            {timer.isFinished ? '✓' : 'Skip'}
          </button>
        </div>
      </div>

      <BottomSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Recovery Timer"
        id="rest-sheet"
      >
        <div style={{ textAlign: 'center', margin: '1rem 0' }}>
          <div
            style={{
              fontSize: '3.5rem',
              fontWeight: 800,
              color: timer.isFinished ? 'var(--m-green)' : 'var(--m-cyan)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatTimerMMSS(timer.remainingSeconds)}
          </div>
          <h4 style={{ margin: '0.25rem 0', fontSize: '1.2rem', color: 'var(--m-text-main)' }}>
            {timer.exerciseName}
          </h4>
          <span
            style={{
              display: 'inline-block',
              padding: '0.2rem 0.65rem',
              borderRadius: '999px',
              background: 'rgba(99, 102, 241, 0.2)',
              color: 'var(--m-primary)',
              fontSize: '0.8rem',
              fontWeight: 700,
              marginTop: '0.4rem',
            }}
          >
            {timer.label}
          </span>
          <p
            style={{
              fontSize: '0.88rem',
              color: 'var(--m-text-muted)',
              marginTop: '0.75rem',
              lineHeight: 1.4,
            }}
          >
            {timer.isFinished
              ? 'Recovery target reached! You are ready for peak neuromuscular performance.'
              : timer.reason}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
          <button
            type="button"
            className="m-btn m-btn-secondary"
            onClick={onToggleSound}
            style={{ flex: 1 }}
          >
            {soundEnabled ? '🔊 Sound On' : '🔇 Muted'}
          </button>
          <button
            type="button"
            className="m-btn m-btn-primary"
            onClick={() => {
              onDismiss();
              setSheetOpen(false);
            }}
            style={{ flex: 1 }}
          >
            {timer.isFinished ? 'Done' : 'Skip Rest'}
          </button>
        </div>
      </BottomSheet>
    </>
  );
};
