import { CompletedSession, Plan, Session } from '../types';

export function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Builds the repeating cycle template array of length L.
 * For example, a 2-session, 3-day cycle produces [Session 1, Session 2, null].
 */
export function buildCyclePattern(plan: Plan): Array<Session | null> {
  const L = Math.max(1, plan.cycle.length_days);
  const S = plan.cycle.sessions_count;
  const cyclePattern: Array<Session | null> = Array(L).fill(null);

  if (S > 0) {
    plan.sessions.forEach((sess, sIdx) => {
      const dayIndex = Math.floor((sIdx * L) / S);
      cyclePattern[dayIndex] = sess;
    });
  }
  return cyclePattern;
}

/**
 * Dynamically derives the Day 0 start date (anchor) of the active cycle
 * from the most recently logged workout session.
 */
export function deriveCycleAnchorFromHistory(
  history: CompletedSession[],
  cyclePattern: Array<Session | null>
): string | null {
  if (!history || history.length === 0) return null;

  // Sort descending by timestamp to find the most recent completed session
  const sorted = history.slice().sort((a, b) => b.timestamp - a.timestamp);
  const latest = sorted[0];
  const latestDate = new Date(latest.timestamp);
  latestDate.setHours(0, 0, 0, 0);

  // Find which day index in cyclePattern corresponds to this session
  let dayIdx = cyclePattern.findIndex((s) => s?.session_number === latest.session_number);
  if (dayIdx < 0) {
    dayIdx = 0;
  }

  // Anchor is the date of Day 0 of this cycle: latestDate - dayIdx days
  const anchorDate = new Date(latestDate);
  anchorDate.setDate(latestDate.getDate() - dayIdx);
  return toLocalDateKey(anchorDate);
}

/**
 * Resolves the effective cycle anchor date (YYYY-MM-DD), giving priority to
 * explicit manual calibration if set by the user, then falling back to
 * dynamically derived anchor from workout history, and finally defaulting to today.
 */
export function resolveEffectiveAnchorKey({
  anchorKey,
  isManual,
  history,
  cyclePattern,
}: {
  anchorKey?: string;
  isManual: boolean;
  history: CompletedSession[];
  cyclePattern: Array<Session | null>;
}): string {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

  // 1. If user explicitly calibrated a start date manually, honor it
  if (isManual && anchorKey && dateRegex.test(anchorKey)) {
    return anchorKey;
  }

  // 2. If workouts are logged, dynamically anchor to the active cycle
  if (history.length > 0) {
    const derived = deriveCycleAnchorFromHistory(history, cyclePattern);
    if (derived) {
      return derived;
    }
  }

  // 3. Fall back to saved anchor if valid
  if (anchorKey && dateRegex.test(anchorKey)) {
    return anchorKey;
  }

  // 4. Default to today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return toLocalDateKey(today);
}
