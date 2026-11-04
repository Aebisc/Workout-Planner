import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Exercise, Muscle, Profile, Settings } from '../types';
import { calculateDifficultyMetrics, isDumbbellExercise, supportsWeightVest } from '../utils/difficulty';
import { registerModalBackHandler } from '../utils/androidBack';
import { getActiveEquipmentList } from '../utils/equipment';

interface ExerciseSwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetMuscle: Muscle;
  currentExerciseId: string;
  currentAddedWeightKg?: number;
  sessionNumber: number;
  blockIndex: number;
  onSwapped: () => void;
  backpackEnabled: boolean;
  /** Return false to cancel the swap (e.g. when draft sets would be discarded). */
  confirmSwap?: (blockIndex: number) => boolean;
}

interface SwapOption {
  key: string;
  exercise: Exercise;
  addedWeightKg: number;
  displayName: string;
  isWeightedVest: boolean;
}

export const ExerciseSwapModal: React.FC<ExerciseSwapModalProps> = ({
  isOpen,
  onClose,
  targetMuscle,
  currentExerciseId,
  currentAddedWeightKg,
  sessionNumber,
  blockIndex,
  onSwapped,
  backpackEnabled,
  confirmSwap,
}) => {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [availableEquipment, setAvailableEquipment] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      return registerModalBackHandler('exercise-swap', onClose);
    }
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      api.getExercises().then(setExercises).catch(console.error);
      api.getSettings().then((s) => {
        setSettings(s);
        setAvailableEquipment(getActiveEquipmentList(s));
      }).catch(console.error);
      api.getProfile().then(setProfile).catch(console.error);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const hasWeightVest = availableEquipment.includes('weight_vest') || Boolean(settings?.weight_vest);

  // Filter exercises that target the same primary muscle or provide significant stimulus
  const eligible = exercises.filter((ex) => {
    const matchesMuscle =
      ex.primary_muscle === targetMuscle ||
      (ex.contribution_weights[targetMuscle] ?? 0) >= 0.5;
    const hasEquipment =
      availableEquipment.length === 0
        ? backpackEnabled || !ex.equipment.includes('backpack')
        : ex.equipment.every((eq) => eq === 'none' || availableEquipment.includes(eq));
    return matchesMuscle && hasEquipment;
  });

  const options: SwapOption[] = [];
  eligible.forEach((ex) => {
    // 1. Always include standard bodyweight option
    options.push({
      key: `${ex.id}_0`,
      exercise: ex,
      addedWeightKg: 0,
      displayName: ex.name,
      isWeightedVest: false,
    });

    // 2. Include 10kg vest variant if supported and enabled
    if (supportsWeightVest(ex) && hasWeightVest) {
      const vestWeightStr = settings?.units === 'imperial' ? '22 lb' : '10kg';
      options.push({
        key: `${ex.id}_10`,
        exercise: ex,
        addedWeightKg: 10.0,
        displayName: `${ex.name} (+${vestWeightStr} Vest)`,
        isWeightedVest: true,
      });
    }
  });

  const handleSelect = async (newExId: string, addedWeightKg: number) => {
    if (confirmSwap && !confirmSwap(blockIndex)) return;
    setLoading(true);
    setError(null);
    try {
      await api.swapExercise(sessionNumber, blockIndex, newExId, addedWeightKg);
      onSwapped();
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Swap Exercise ({targetMuscle.toUpperCase()})</h3>
          <button className="btn-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        <p className="modal-desc">
          Select a replacement movement targeting {targetMuscle}. The block set count will be preserved.
        </p>

        <div className="swap-list">
          {options.map((opt) => {
            const isCurrent =
              opt.exercise.id === currentExerciseId &&
              ((opt.isWeightedVest && (currentAddedWeightKg ?? 0) >= 10.0) ||
                (!opt.isWeightedVest && (currentAddedWeightKg ?? 0) < 10.0));
            return (
              <div
                key={opt.key}
                className={`swap-item ${isCurrent ? 'selected' : ''}`}
              >
                <div className="swap-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <strong>{opt.displayName}</strong>
                    {opt.isWeightedVest && (
                      <span
                        className="badge"
                        style={{
                          background: 'rgba(234, 88, 12, 0.2)',
                          color: '#fb923c',
                          border: '1px solid rgba(234, 88, 12, 0.4)',
                          fontWeight: 700,
                        }}
                      >
                        🦺 10kg Vest
                      </span>
                    )}
                  </div>
                  <div className="swap-meta">
                    <span className="badge badge-secondary">{opt.exercise.ladder} (Rung {opt.exercise.rung})</span>
                    {!isDumbbellExercise(opt.exercise) && (
                      <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.4)', fontWeight: 700 }}>
                        ⚡ {calculateDifficultyMetrics(opt.exercise, profile?.body_weight_kg, opt.addedWeightKg, settings?.units ?? 'metric').fullBadgeText}
                      </span>
                    )}
                    {opt.exercise.stretched_position && (
                      <span className="badge badge-accent">Stretch focus</span>
                    )}
                    {opt.exercise.time_based && (
                      <span className="badge badge-info">Time-based</span>
                    )}
                    <span className="badge badge-outline">
                      Eq: {opt.isWeightedVest ? `${opt.exercise.equipment.join(', ')}, weight_vest` : opt.exercise.equipment.join(', ')}
                    </span>
                  </div>
                  <p className="swap-cue">
                    {opt.isWeightedVest ? `Controlled 2-3s negative with 10kg vest. ${opt.exercise.cues}` : opt.exercise.cues}
                  </p>
                </div>
                <button
                  className="btn btn-sm btn-primary"
                  disabled={isCurrent || loading}
                  onClick={() => handleSelect(opt.exercise.id, opt.addedWeightKg)}
                >
                  {isCurrent ? 'Current' : 'Select'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
