import { Exercise, Units } from '../types';

export interface DifficultyMetrics {
  level: number;
  effectiveLoadKg: number;
  effectiveLoadLb: number;
  pctBw: number;
  levelText: string;
  loadText: string;
  pctText: string;
  fullBadgeText: string;
  isDumbbell: boolean;
}

/**
 * Returns true if the exercise utilizes dumbbells.
 */
export function isDumbbellExercise(exercise: Exercise | undefined): boolean {
  if (!exercise) return false;
  return Boolean(
    exercise.equipment?.some((eq) => eq.toLowerCase().includes('dumbbell')) ||
    exercise.id.startsWith('db_') ||
    exercise.name?.toLowerCase().includes('dumbbell')
  );
}

/**
 * Returns true if the exercise supports wearing a 10kg weight vest.
 * Strictly applied to vertical pulling movements (Pull-up, Chin-up, Pause Pull-up).
 */
export function supportsWeightVest(exercise: Exercise | undefined): boolean {
  if (!exercise) return false;
  return (
    (exercise.ladder === 'pull' || exercise.ladder === 'pull_biceps_branch') &&
    (exercise.rung ?? 0) >= 3
  );
}

/**
 * Interpolates effective bodyweight fraction from bed height anchors (e.g. for incline or feet-elevated push-ups).
 */
function interpolateBwAnchors(
  anchors: Array<{ height_cm: number; fraction: number }>,
  heightCm: number
): number {
  if (!anchors || anchors.length === 0) return 0.64;
  if (anchors.length === 1) return anchors[0].fraction;

  const sorted = [...anchors].sort((a, b) => a.height_cm - b.height_cm);
  if (heightCm <= sorted[0].height_cm) return sorted[0].fraction;
  if (heightCm >= sorted[sorted.length - 1].height_cm)
    return sorted[sorted.length - 1].fraction;

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (heightCm >= a.height_cm && heightCm <= b.height_cm) {
      const range = b.height_cm - a.height_cm;
      const t = range === 0 ? 0 : (heightCm - a.height_cm) / range;
      return a.fraction + t * (b.fraction - a.fraction);
    }
  }

  return sorted[0].fraction;
}

/**
 * Calculates biomechanical Effective System Load (ESL), Level, and % of Bodyweight.
 */
export function calculateDifficultyMetrics(
  exercise: Exercise | undefined,
  bodyweightKg: number | undefined,
  addedWeightKg: number = 0,
  units: Units = 'metric',
  tempoCue?: string,
  bedHeightCm: number = 35.0
): DifficultyMetrics {
  const userBw = bodyweightKg && bodyweightKg > 0 ? bodyweightKg : 75.0;

  if (!exercise) {
    const effectiveLoadKg = Math.max(0, addedWeightKg);
    const effectiveLoadLb = effectiveLoadKg * 2.20462;
    const pctBw = Math.round((effectiveLoadKg / userBw) * 100);
    const loadText =
      units === 'imperial'
        ? `≈ ${Math.round(effectiveLoadLb)} lb`
        : `≈ ${effectiveLoadKg.toFixed(1)} kg`;
    return {
      level: 1.0,
      effectiveLoadKg,
      effectiveLoadLb,
      pctBw,
      levelText: 'Lvl 1.0',
      loadText,
      pctText: `${pctBw}% BW`,
      fullBadgeText: `Lvl 1.0 • ${loadText} (${pctBw}% BW)`,
      isDumbbell: false,
    };
  }

  // 1. Resolve moving bodyweight fraction
  let bwFrac = 0.0;
  if (exercise.bw_fraction !== null && exercise.bw_fraction !== undefined) {
    bwFrac = exercise.bw_fraction;
  } else if (exercise.bw_anchors && exercise.bw_anchors.length > 0) {
    bwFrac = interpolateBwAnchors(exercise.bw_anchors, bedHeightCm);
  } else if (exercise.ladder === 'push') {
    bwFrac = 0.64;
  } else if (exercise.ladder === 'pull' || exercise.ladder === 'pull_biceps_branch') {
    bwFrac = 0.93;
  } else if (exercise.ladder === 'abs' || exercise.ladder === 'forearms_grip') {
    bwFrac = 0.70;
  } else {
    // Pure dumbbell isolation or dumbbell movements
    bwFrac = 0.0;
  }

  // 2. Resolve tempo & execution multiplier
  let tempoMult = 1.0;
  const isPauseExercise = exercise.id === 'pause_pull_up';
  if (isPauseExercise) {
    // pause_pull_up already has 1.05 bw_fraction (0.93 * 1.13) baked in
    tempoMult = 1.0;
  } else if (
    tempoCue &&
    (tempoCue.toLowerCase().includes('pause') ||
      tempoCue.toLowerCase().includes('dead-stop') ||
      tempoCue.toLowerCase().includes('3-4s'))
  ) {
    tempoMult = 1.12;
  }

  // 3. Resolve external load leverage efficiency
  // Push-ups have pivot at toes, so a weight vest on upper torso distributes ~70% to hands
  const isPushMovement = exercise.ladder === 'push' || exercise.id === 'diamond_push_up';
  const loadEfficiency = isPushMovement ? 0.70 : 1.00;

  // 4. Calculate Effective System Load
  const movingBwKg = userBw * bwFrac * tempoMult;
  const addedContributionKg = Math.max(0, addedWeightKg) * loadEfficiency;
  const effectiveLoadKg = movingBwKg + addedContributionKg;
  const effectiveLoadLb = effectiveLoadKg * 2.20462;

  // 5. Calculate Relative % vs Bodyweight
  const pctBw = Math.round((effectiveLoadKg / userBw) * 100);

  // 6. Calculate Continuous Decimal Difficulty Level
  let level = 1.0;
  const isVerticalPull =
    (exercise.ladder === 'pull' || exercise.ladder === 'pull_biceps_branch') &&
    (exercise.rung ?? 0) >= 3;

  if (isVerticalPull) {
    // Normalized continuous vertical pulling scale:
    // Base bodyweight pull-up / chin-up is Lvl 3.0 (93% BW).
    // Pause pull-up (dead-stop peak contraction) sits at Lvl 3.7 (~+12% difficulty).
    // Each 10kg added load adds +1.0 Lvl, so Pull-up + 10kg vest reaches Lvl 4.0 (harder than Pause Pull-up).
    const baseStandardPullLoad = userBw * 0.93;
    const basePullRung = exercise.id === 'pause_pull_up' ? 3.7 : 3.0;
    const addedLoadRatio = (addedContributionKg) / baseStandardPullLoad;
    level = Number((basePullRung + addedLoadRatio * 7.0).toFixed(1));
  } else {
    const baseRung = Math.max(1, exercise.rung || 1);
    const baseStandardLoad = userBw * bwFrac;

    if (baseStandardLoad > 0) {
      const overloadRatio = (effectiveLoadKg - baseStandardLoad) / baseStandardLoad;
      level = Number((baseRung + overloadRatio * 4.0).toFixed(1));
    } else {
      // Dumbbell movements: 5kg = Lvl 2.0, 10kg = Lvl 3.0, 15kg = Lvl 4.0, etc.
      level = Number((1.0 + (addedWeightKg / 5.0)).toFixed(1));
    }
  }

  const levelText = `Lvl ${level.toFixed(1)}`;
  const loadText =
    units === 'imperial'
      ? `≈ ${Math.round(effectiveLoadLb)} lb`
      : `≈ ${effectiveLoadKg.toFixed(1)} kg`;
  const pctText = `${pctBw}% BW`;
  const fullBadgeText = `${levelText} • ${loadText} (${pctText})`;

  const isDumbbell = isDumbbellExercise(exercise);

  return {
    level,
    effectiveLoadKg,
    effectiveLoadLb,
    pctBw,
    levelText,
    loadText,
    pctText,
    fullBadgeText,
    isDumbbell,
  };
}
