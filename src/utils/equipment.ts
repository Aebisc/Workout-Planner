import { Settings } from '../types';

export interface EquipmentItem {
  id: string;
  name: string;
  icon: string;
  scope: 'pull' | 'push' | 'general';
  scopeBadge: string;
  description: string;
}

export const ALL_EQUIPMENT_OPTIONS: EquipmentItem[] = [
  {
    id: 'weight_vest',
    name: '10kg Weight Vest',
    icon: '🦺',
    scope: 'pull',
    scopeBadge: 'Pull Only',
    description: '10kg fixed vest. Applied strictly to vertical pulling movements (Pull-ups, Chin-ups, Pause Pull-ups).',
  },
  {
    id: 'backpack',
    name: 'Weighted Backpack',
    icon: '🎒',
    scope: 'push',
    scopeBadge: 'Push & Increments',
    description: 'Allows progressive overload with water bottle increments (+1.5kg / 5L) when reps exceed 20.',
  },
  {
    id: 'pull_bar',
    name: 'Pull-up Bar',
    icon: '🚪',
    scope: 'pull',
    scopeBadge: 'Pull & Core',
    description: 'Required for Pull-ups, Chin-ups, Dead Hangs, and Hanging Knee/Leg Raises.',
  },
  {
    id: 'dumbbell',
    name: 'Dumbbells',
    icon: '🏋️',
    scope: 'general',
    scopeBadge: 'Arms & Support',
    description: 'Enables Bicep Curls, Dumbbell Rows, One-Arm Floor Press, Pullovers, and Skull-Crushers.',
  },
  {
    id: 'parallettes',
    name: 'Parallettes',
    icon: '🤸',
    scope: 'push',
    scopeBadge: 'Push Deficit',
    description: 'Enables Deep Parallette Push-ups (chest stretch deficit), Pseudo-Planche Push-ups, and L-Sits.',
  },
  {
    id: 'bed',
    name: 'Bed / Elevation',
    icon: '🛏️',
    scope: 'push',
    scopeBadge: 'Push Leverage',
    description: 'Used for bed height angle leverage (Incline & Feet-Elevated Push-ups) and supported dumbbell rows.',
  },
];

export const DEFAULT_EQUIPMENT_IDS = ['pull_bar', 'parallettes', 'bed', 'dumbbell'];

/**
 * Returns a deduplicated array of currently enabled equipment IDs.
 */
export function getActiveEquipmentList(settings?: Partial<Settings> | null): string[] {
  if (!settings) return [...DEFAULT_EQUIPMENT_IDS];
  const list = new Set<string>(
    settings.enabled_equipment && settings.enabled_equipment.length > 0
      ? settings.enabled_equipment
      : DEFAULT_EQUIPMENT_IDS
  );

  if (settings.backpack) list.add('backpack');
  if (settings.weight_vest) list.add('weight_vest');

  return Array.from(list);
}

/**
 * Formats a user-friendly summary string of active equipment (e.g. "5 of 6 enabled (Pull-up Bar, Dumbbells...)")
 */
export function formatActiveEquipmentSummary(activeIds: string[]): string {
  const count = activeIds.filter((id) => id !== 'none').length;
  const names = ALL_EQUIPMENT_OPTIONS.filter((eq) => activeIds.includes(eq.id)).map((eq) => eq.name);

  if (count === 0) return 'No equipment (pure bodyweight floor)';
  if (count === ALL_EQUIPMENT_OPTIONS.length) return 'All equipment enabled (6 of 6)';

  const preview = names.slice(0, 3).join(', ');
  const remaining = names.length > 3 ? `, +${names.length - 3} more` : '';
  return `${count} of ${ALL_EQUIPMENT_OPTIONS.length} enabled (${preview}${remaining})`;
}
