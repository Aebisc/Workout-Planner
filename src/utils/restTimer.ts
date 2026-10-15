import { Block, Exercise } from '../types';

export interface RestRecommendation {
  seconds: number;
  label: string;
  reason: string;
}

/**
 * Computes the optimal hypertrophy rest duration in seconds after logging a set.
 */
export function getOptimalRestSeconds(
  exercise: Exercise | undefined,
  block: Block | undefined,
  loggedRir: number
): RestRecommendation {
  // Submaximal / warm-up sets (4+ RIR) require minimal recovery
  if (loggedRir >= 4) {
    return {
      seconds: 60,
      label: 'Warm-up / Submax Rest',
      reason: 'Set was logged at 4+ RIR (low fatigue); 60s is sufficient before your next working set.',
    };
  }

  // True failure (0 RIR) adds extra CNS/peripheral recovery time
  const failureBonus = loggedRir === 0 ? 15 : 0;

  if (!exercise) {
    const isLongRest = block?.rest_cue?.includes('2-3') ?? true;
    return {
      seconds: (isLongRest ? 150 : 90) + failureBonus,
      label: isLongRest ? 'Compound Recovery' : 'Isolation Recovery',
      reason: block?.rest_cue || 'Standard hypertrophy rest interval.',
    };
  }

  switch (exercise.ladder) {
    case 'push':
    case 'pull':
    case 'pull_biceps_branch': {
      const bonus = loggedRir === 0 ? 30 : 0;
      return {
        seconds: 150 + bonus, // 2:30 default, 3:00 on 0 RIR
        label: 'Multi-Joint Compound Rest',
        reason:
          loggedRir === 0
            ? '3:00 rest after 0 RIR failure on a compound movement maximizes rep retention.'
            : '2:30 rest restores motor unit recruitment & force output on multi-joint compounds.',
      };
    }

    case 'chest_unilateral':
    case 'lat_stretch':
    case 'back_row':
    case 'triceps_bodyweight': {
      return {
        seconds: 120 + failureBonus, // 2:00 default, 2:15 on 0 RIR
        label: 'Supported Compound Rest',
        reason: '2:00–2:15 clears peripheral fatigue on unilateral/supported compound movements.',
      };
    }

    case 'biceps':
    case 'triceps_stretch':
    case 'triceps_isolation': {
      return {
        seconds: 90 + failureBonus, // 1:30 default, 1:45 on 0 RIR
        label: 'Isolation Hypertrophy Rest',
        reason: '90–105s clears local metabolic fatigue in single-joint arm isolations.',
      };
    }

    case 'forearms_isolation':
    case 'forearms_grip':
    case 'abs':
    case 'abs_floor': {
      return {
        seconds: 75 + failureBonus, // 1:15 default, 1:30 on 0 RIR
        label: 'Core & Grip Recovery',
        reason: '75–90s matches the faster recovery kinetics of forearm and abdominal musculature.',
      };
    }

    default: {
      const isCompound =
        exercise.primary_muscle === 'chest' || exercise.primary_muscle === 'back';
      return {
        seconds: (isCompound ? 150 : 90) + failureBonus,
        label: isCompound ? 'Compound Recovery' : 'Isolation Recovery',
        reason: isCompound
          ? '2–3 min for multi-joint movements.'
          : '1–2 min for single-joint isolation movements.',
      };
    }
  }
}

export function formatTimerMMSS(totalSeconds: number): string {
  const clamped = Math.max(0, Math.ceil(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Plays a gentle two-tone chime via Web Audio API when rest finishes.
 * Respects the user's `soundEnabled` setting.
 */
export function playRestCompleteChime(soundEnabled: boolean = true): void {
  if (!soundEnabled) return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const notes = [587.33, 880]; // D5 -> A5
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.14);

      gain.gain.setValueAtTime(0.0001, now + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.18, now + idx * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.14 + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.14);
      osc.stop(now + idx * 0.14 + 0.36);
    });
  } catch {
    // Ignore audio errors if blocked by OS/webview
  }
}
