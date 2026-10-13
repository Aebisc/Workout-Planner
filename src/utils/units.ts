import { Units } from '../types';

export const KG_TO_LB = 2.20462;
export const CM_TO_IN = 0.393701;

export function formatWeight(kg: number, units: Units): string {
  if (kg <= 0) return 'Bodyweight';
  return units === 'imperial'
    ? `+${(kg * KG_TO_LB).toFixed(1)} lb`
    : `+${kg.toFixed(1)} kg`;
}

export function formatBackpackLoad(kg: number, units: Units): string {
  if (kg <= 0) return 'Bodyweight only';
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
