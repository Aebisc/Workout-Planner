import { Session, SetLog } from '../types';

/**
 * Remaps block-index-keyed draft sets onto a session's current block order,
 * matching by exercise id. Blocks get re-sorted when an exercise is swapped or
 * a variation is advanced, which would otherwise leave draft sets attached to
 * whatever exercise now occupies the old index.
 */
export function remapDraftSets(
  sets: Record<number, SetLog[]>,
  oldSession: Session | null | undefined,
  newSession: Session
): Record<number, SetLog[]> {
  if (!oldSession) return sets;

  const byExercise = new Map<string, SetLog[]>();
  Object.entries(sets).forEach(([key, logs]) => {
    const oldBlock = oldSession.blocks[Number(key)];
    if (!oldBlock || !logs || logs.length === 0) return;
    const existing = byExercise.get(oldBlock.exercise_id);
    if (existing) {
      existing.push(...logs);
    } else {
      byExercise.set(oldBlock.exercise_id, [...logs]);
    }
  });

  const next: Record<number, SetLog[]> = {};
  newSession.blocks.forEach((block, idx) => {
    const logs = byExercise.get(block.exercise_id);
    if (logs && logs.length > 0) {
      next[idx] = logs.map((l) => (l.block_index === idx ? l : { ...l, block_index: idx }));
    }
  });
  return next;
}
