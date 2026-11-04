import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { Exercise, Muscle, Profile, Settings } from '../../types';
import { BottomSheet } from './BottomSheet';
import { getActiveEquipmentList } from '../../utils/equipment';
import { calculateDifficultyMetrics, isDumbbellExercise, supportsWeightVest } from '../../utils/difficulty';

interface MobileExerciseSwapSheetProps {
  isOpen: boolean;
  onClose: () => void;
  muscle: Muscle;
  currentExerciseId: string;
  currentAddedWeightKg?: number;
  backpackEnabled?: boolean;
  onSwapSelected: (newExerciseId: string, addedWeightKg?: number) => void;
  /** Return false to cancel the swap (e.g. when draft sets would be discarded). */
  confirmSwap?: () => boolean;
}

interface SwapOption {
  key: string;
  exercise: Exercise;
  addedWeightKg: number;
  displayName: string;
  isWeightedVest: boolean;
}

export const MobileExerciseSwapSheet: React.FC<MobileExerciseSwapSheetProps> = ({
  isOpen,
  onClose,
  muscle,
  currentExerciseId,
  currentAddedWeightKg,
  backpackEnabled,
  onSwapSelected,
  confirmSwap,
}) => {
  const [candidates, setCandidates] = useState<SwapOption[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    Promise.all([
      api.getExercises(),
      api.getSettings().catch(() => null),
      api.getProfile().catch(() => null),
    ])
      .then(([list, userSettings, userProfile]) => {
        setSettings(userSettings);
        setProfile(userProfile);
        const availableEquipment = getActiveEquipmentList(userSettings);
        const hasWeightVest = availableEquipment.includes('weight_vest') || Boolean(userSettings?.weight_vest);

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

        const options: SwapOption[] = [];
        eligible.forEach((ex) => {
          // 1. Standard bodyweight variation
          options.push({
            key: `${ex.id}_0`,
            exercise: ex,
            addedWeightKg: 0,
            displayName: ex.name,
            isWeightedVest: false,
          });

          // 2. 10kg vest variant if supported and enabled
          if (supportsWeightVest(ex) && hasWeightVest) {
            const vestWeightStr = userSettings?.units === 'imperial' ? '22 lb' : '10kg';
            options.push({
              key: `${ex.id}_10`,
              exercise: ex,
              addedWeightKg: 10.0,
              displayName: `${ex.name} (+${vestWeightStr} Vest)`,
              isWeightedVest: true,
            });
          }
        });

        setCandidates(options);
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
          {candidates.map((opt) => {
            const isCurrent =
              opt.exercise.id === currentExerciseId &&
              ((opt.isWeightedVest && (currentAddedWeightKg ?? 0) >= 10.0) ||
                (!opt.isWeightedVest && (currentAddedWeightKg ?? 0) < 10.0));
            return (
              <div
                key={opt.key}
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
                    if (confirmSwap && !confirmSwap()) return;
                    onSwapSelected(opt.exercise.id, opt.addedWeightKg);
                    onClose();
                  }
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '1rem' }}>{opt.isWeightedVest ? '🦺' : isCurrent ? '📌' : '🔄'}</span>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--m-text-main)' }}>
                      {opt.displayName}
                    </span>
                    {opt.isWeightedVest && (
                      <span
                        style={{
                          fontSize: '0.65rem',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          background: 'rgba(234, 88, 12, 0.25)',
                          color: '#fb923c',
                          fontWeight: 800,
                        }}
                      >
                        10kg Vest
                      </span>
                    )}
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
                    <span style={{ fontSize: '0.82rem', color: 'var(--m-cyan)', fontWeight: 700, flexShrink: 0 }}>
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
                    Ladder: {opt.exercise.ladder.replace(/_/g, ' ')} (Rung {opt.exercise.rung})
                  </span>
                  {!isDumbbellExercise(opt.exercise) && (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        background: 'rgba(99, 102, 241, 0.2)',
                        color: '#818cf8',
                        border: '1px solid rgba(99, 102, 241, 0.4)',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px',
                        fontWeight: 700,
                      }}
                    >
                      ⚡ {calculateDifficultyMetrics(opt.exercise, profile?.body_weight_kg, opt.addedWeightKg, settings?.units ?? 'metric').fullBadgeText}
                    </span>
                  )}
                  {opt.exercise.stretched_position && (
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
                  {opt.exercise.equipment.length > 0 && (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        background: 'rgba(255, 255, 255, 0.05)',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px',
                        color: 'var(--m-text-subtle)',
                      }}
                    >
                      {opt.isWeightedVest ? `${opt.exercise.equipment.join(', ')}, weight_vest` : opt.exercise.equipment.join(', ')}
                    </span>
                  )}
                </div>

                <div style={{ fontSize: '0.76rem', color: 'var(--m-text-muted)', fontStyle: 'italic', marginTop: '0.2rem', lineHeight: 1.3 }}>
                  💡 {opt.isWeightedVest ? `Controlled 2-3s negative with 10kg vest. ${opt.exercise.cues}` : opt.exercise.cues}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </BottomSheet>
  );
};
