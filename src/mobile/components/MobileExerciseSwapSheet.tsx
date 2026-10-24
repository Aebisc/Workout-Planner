import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { Exercise, Muscle } from '../../types';
import { BottomSheet } from './BottomSheet';
import { getActiveEquipmentList } from '../../utils/equipment';

interface MobileExerciseSwapSheetProps {
  isOpen: boolean;
  onClose: () => void;
  muscle: Muscle;
  currentExerciseId: string;
  backpackEnabled?: boolean;
  onSwapSelected: (newExerciseId: string) => void;
}

export const MobileExerciseSwapSheet: React.FC<MobileExerciseSwapSheetProps> = ({
  isOpen,
  onClose,
  muscle,
  currentExerciseId,
  backpackEnabled,
  onSwapSelected,
}) => {
  const [candidates, setCandidates] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    Promise.all([api.getExercises(), api.getSettings().catch(() => null)])
      .then(([list, settings]) => {
        const availableEquipment = getActiveEquipmentList(settings);
        const eligible = list.filter((ex) => {
          const matchesMuscle =
            ex.primary_muscle === muscle ||
            (ex.contribution_weights[muscle] ?? 0) >= 0.5;
          const hasEquipment =
            availableEquipment.length === 0
              ? backpackEnabled !== false || !ex.equipment.includes('backpack')
              : ex.equipment.every((eq) => eq === 'none' || availableEquipment.includes(eq));
          return matchesMuscle && hasEquipment;
        });
        setCandidates(eligible);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isOpen, muscle, currentExerciseId, backpackEnabled]);

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
          {candidates.map((ex) => {
            const isCurrent = ex.id === currentExerciseId;
            return (
              <div
                key={ex.id}
                className="m-list-row m-list-row-clickable"
                style={{
                  borderRadius: 'var(--m-radius-md)',
                  background: isCurrent ? 'rgba(99, 102, 241, 0.12)' : 'var(--m-bg-card)',
                  border: isCurrent ? '1px solid var(--m-primary)' : '1px solid var(--m-border)',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  gap: '0.4rem',
                  padding: '0.85rem 1rem',
                }}
                onClick={() => {
                  if (!isCurrent) {
                    onSwapSelected(ex.id);
                    onClose();
                  }
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1rem' }}>{isCurrent ? '📌' : '🔄'}</span>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--m-text-main)' }}>
                      {ex.name}
                    </span>
                    {isCurrent && (
                      <span
                        style={{
                          fontSize: '0.65rem',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '999px',
                          background: 'rgba(99, 102, 241, 0.25)',
                          color: 'var(--m-primary)',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                        }}
                      >
                        Current
                      </span>
                    )}
                  </div>
                  {!isCurrent && (
                    <span style={{ fontSize: '0.82rem', color: 'var(--m-cyan)', fontWeight: 700 }}>
                      Select ›
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.2rem' }}>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      background: 'rgba(255, 255, 255, 0.08)',
                      padding: '0.15rem 0.45rem',
                      borderRadius: '4px',
                      color: 'var(--m-text-muted)',
                    }}
                  >
                    Ladder: {ex.ladder.replace(/_/g, ' ')} (Rung {ex.rung})
                  </span>
                  {ex.stretched_position && (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        background: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px',
                        color: 'var(--m-green)',
                        fontWeight: 600,
                      }}
                    >
                      Stretched Position 📐
                    </span>
                  )}
                  {ex.equipment.length > 0 && (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        background: 'rgba(255, 255, 255, 0.05)',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px',
                        color: 'var(--m-text-subtle)',
                      }}
                    >
                      {ex.equipment.join(', ')}
                    </span>
                  )}
                </div>

                {ex.cues && (
                  <div style={{ fontSize: '0.76rem', color: 'var(--m-text-muted)', fontStyle: 'italic', marginTop: '0.2rem', lineHeight: 1.3 }}>
                    💡 {ex.cues}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </BottomSheet>
  );
};
