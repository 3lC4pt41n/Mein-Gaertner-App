/**
 * Task Type Registry — Single Source of Truth
 * ─────────────────────────────────────────────────────────────────────────────
 * Language-neutral task type codes stored in DB. UI labels come from i18n.
 *
 * Migration path:
 *   Old (German strings): 'Gießen', 'Düngen', 'Umtopfen', 'Healthcheck', 'Sonstiges'
 *   New (neutral codes):  'watering', 'fertilizing', 'repotting', 'healthcheck', 'other'
 *
 * The `legacyKey` field maps old DB values during the transition period.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const TASK_TYPES = [
  { code: 'watering', legacyKey: 'Gießen', icon: 'water-outline', color: '#2196f3', weight: 1 },
  { code: 'fertilizing', legacyKey: 'Düngen', icon: 'leaf-outline', color: '#8BC34A', weight: 2 },
  { code: 'repotting', legacyKey: 'Umtopfen', icon: 'flower-outline', color: '#9C27B0', weight: 3 },
  {
    code: 'healthcheck',
    legacyKey: 'Healthcheck',
    icon: 'pulse-outline',
    color: '#FF9800',
    weight: 1,
  },
  { code: 'other', legacyKey: 'Sonstiges', icon: 'calendar-outline', color: '#607D8B', weight: 1 },
];

// Fast lookup maps
const _byCode = {};
const _byLegacy = {};
for (const t of TASK_TYPES) {
  _byCode[t.code] = t;
  _byLegacy[t.legacyKey] = t;
}

/**
 * Resolve a task type from either the new code or the legacy German key.
 * @param {string} typeValue - e.g. 'watering' or 'Gießen'
 * @returns {object|null} Task type definition or null
 */
export function resolveTaskType(typeValue) {
  return _byCode[typeValue] || _byLegacy[typeValue] || null;
}

/**
 * Get the Ionicons icon name for a task type.
 * @param {string} typeValue - code or legacy key
 * @returns {string} icon name
 */
export function getTaskTypeIcon(typeValue) {
  return resolveTaskType(typeValue)?.icon || 'calendar-outline';
}

/**
 * Get the i18n key for a task type label (tasks.types.<code>).
 * @param {string} typeValue - code or legacy key
 * @returns {string} i18n key path, e.g. 'tasks.types.watering'
 */
export function getTaskTypeI18nKey(typeValue) {
  const resolved = resolveTaskType(typeValue);
  return resolved ? `tasks.taskTypes.${resolved.code}` : 'tasks.taskTypes.other';
}

/**
 * Get the normalized code for a type value (handles legacy→code mapping).
 * @param {string} typeValue
 * @returns {string} normalized code
 */
export function normalizeTaskType(typeValue) {
  return resolveTaskType(typeValue)?.code || typeValue;
}

/**
 * Get the scoring weight for a task type.
 * @param {string} typeValue
 * @returns {number}
 */
export function getTaskTypeWeight(typeValue) {
  return resolveTaskType(typeValue)?.weight || 1;
}
