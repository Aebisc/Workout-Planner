import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { Exercise, Muscle } from '../../types';
import { BottomSheet } from './BottomSheet';

interface MobileExerciseSwapSheetProps {
  isOpen: boolean;
  onClose: () => void;
  muscle: Muscle;
  currentExerciseId: string;
  onSwapSelected: (newExerciseId: string) => void;
}

export const MobileExerciseSwapSheet: React.FC<MobileExerciseSwapSheetProps> = ({
  isOpen,
  onClose,
  muscle,
  currentExerciseId,
  onSwapSelected,
}) => {
  const [candidates, setCandidates] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    api.getExercises()
      .then((list) => {
        setCandidates(
          list.filter((ex) => ex.primary_muscle === muscle && ex.id !== currentExerciseId)
        );
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isOpen, muscle, currentExerciseId]);

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={`Swap Exercise (${muscle})`}
      id="swap-sheet"
    >
      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--m-text-muted)' }}>
          Loading variations...
        </div>
      ) : candidates.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--m-text-muted)' }}>
          No alternate exercises available for this muscle with your equipment.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {candidates.map((ex) => (
            <div
              key={ex.id}
              className="m-list-row m-list-row-clickable"
              style={{
                borderRadius: 'var(--m-radius-md)',
                background: 'var(--m-bg-card)',
                border: '1px solid var(--m-border)',
              }}
              onClick={() => {
                onSwapSelected(ex.id);
                onClose();
              }}
            >
              <div className="m-row-left">
                <span className="m-row-icon">🔄</span>
                <div>
                  <div className="m-row-label">{ex.name}</div>
                  <div className="m-row-sublabel">
                    Ladder: {ex.ladder.replace(/_/g, ' ')} • {ex.equipment.join(', ') || 'Bodyweight'}
                  </div>
                </div>
              </div>
              <span className="m-row-value">Select ›</span>
            </div>
          ))}
        </div>
      )}
    </BottomSheet>
  );
};
