import { Units } from '../types';

export const KG_TO_LB = 2.20462;
export const CM_TO_IN = 0.393701;

export function formatWeight(kg: number, units: Units): string {
  if (kg <= 0) return 'Bodyweight';
  return units === 'imperial'
    ? `+${(kg * KG_TO_LB).toFixed(1)} lb`
    : `+${kg.toFixed(1)} kg`;
}

export function toDisplayWeight(kg: number, units: Units): number {
  return Math.round(units === 'imperial' ? kg * KG_TO_LB : kg);
}

export function formatBackpackLoad(kg: number, units: Units, isPull = false): string {
  if (kg <= 0) return 'Bodyweight only';

  // Vest loads are exactly 10kg, or 10kg + 1.5kg bottles (11.5, 13, ...), while
  // backpack-only loads are exact 1.5kg multiples (10.5, 12, ...) — so the two
  // are distinguishable without an explicit "vest" flag on the block.
  const modFromVestBase = (kg - 10.0) % 1.5;
  const isMultipleOfBottles = (v: number) => Math.abs(v) < 0.01 || Math.abs(v - 1.5) < 0.01;

  if (isPull && Math.abs(kg - 10.0) < 0.01) {
    return `${formatWeight(kg, units)} (10kg Weight Vest)`;
  }
  if (isPull && kg > 10.0 && isMultipleOfBottles(modFromVestBase)) {
    const extra = kg - 10.0;
    const extraBottles = Math.round(extra / 1.5);
    const extraDesc = extraBottles > 0 ? ` + ${extraBottles} × 1.5 L bottle(s)` : ` + ${extra.toFixed(1)} kg`;
    return `${formatWeight(kg, units)} (10kg Vest${extraDesc})`;
  }

  const jugs5L = Math.floor(kg / 5.0);
  const rem = kg - jugs5L * 5.0;
  const bottles1_5L = Math.round(rem / 1.5);

  const parts: string[] = [];
  if (jugs5L > 0) parts.push(`${jugs5L} × 5 L jug${jugs5L > 1 ? 's' : ''}`);
  if (bottles1_5L > 0) parts.push(`${bottles1_5L} × 1.5 L bottle${bottles1_5L > 1 ? 's' : ''}`);
  const vessels = parts.length > 0 ? parts.join(' + ') : `${Math.round(kg / 1.5)} × 1.5 L bottles`;

  return `${formatWeight(kg, units)} (${vessels})`;
}

export function toDisplayHeight(cm: number, units: Units): number {
  return units === 'imperial' ? Math.round(cm * CM_TO_IN) : Math.round(cm);
}

export function toMetricHeight(val: number, units: Units): number {
  return units === 'imperial' ? val / CM_TO_IN : val;
}
