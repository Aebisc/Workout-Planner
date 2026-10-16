import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Exercise, Muscle } from '../types';
import { registerModalBackHandler } from '../utils/androidBack';

interface ExerciseSwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetMuscle: Muscle;
  currentExerciseId: string;
  sessionNumber: number;
  blockIndex: number;
  onSwapped: () => void;
  backpackEnabled: boolean;
}

export const ExerciseSwapModal: React.FC<ExerciseSwapModalProps> = ({
  isOpen,
  onClose,
  targetMuscle,
  currentExerciseId,
  sessionNumber,
  blockIndex,
  onSwapped,
  backpackEnabled,
}) => {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      return registerModalBackHandler('exercise-swap', onClose);
    }
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      api.getExercises().then(setExercises).catch(console.error);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Filter exercises that target the same primary muscle or provide significant stimulus
  const eligible = exercises.filter((ex) => {
    const matchesMuscle =
      ex.primary_muscle === targetMuscle ||
      (ex.contribution_weights[targetMuscle] ?? 0) >= 0.5;
    const hasEquipment =
      backpackEnabled || !ex.equipment.includes('backpack');
    return matchesMuscle && hasEquipment;
  });

  const handleSelect = async (newExId: string) => {
    setLoading(true);
    setError(null);
    try {
      await api.swapExercise(sessionNumber, blockIndex, newExId);
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
          {eligible.map((ex) => {
            const isCurrent = ex.id === currentExerciseId;
            return (
              <div
                key={ex.id}
                className={`swap-item ${isCurrent ? 'selected' : ''}`}
              >
                <div className="swap-info">
                  <strong>{ex.name}</strong>
                  <div className="swap-meta">
                    <span className="badge badge-secondary">{ex.ladder} (Rung {ex.rung})</span>
                    {ex.stretched_position && (
                      <span className="badge badge-accent">Stretch focus</span>
                    )}
                    {ex.time_based && (
                      <span className="badge badge-info">Time-based</span>
                    )}
                    <span className="badge badge-outline">
                      Eq: {ex.equipment.join(', ')}
                    </span>
                  </div>
                  <p className="swap-cue">{ex.cues}</p>
                </div>
                <button
                  className="btn btn-sm btn-primary"
                  disabled={isCurrent || loading}
                  onClick={() => handleSelect(ex.id)}
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
