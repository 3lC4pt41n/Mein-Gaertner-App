/**
 * Pure scoring calculation helpers (no DB dependencies).
 * Used by leaderboardService and tests.
 */

// ── Task-Gewichte für Punkteberechnung ─────────────────────
// Schlüssel = die deutschen Strings, die in der DB gespeichert werden
export const TASK_WEIGHTS = {
  Gießen: 1,
  Düngen: 2,
  Umtopfen: 3,
  Healthcheck: 1,
  Sonstiges: 1,
};

/**
 * Gibt das Gewicht für einen Task-Typ zurück.
 * @param {string} taskType - Task-Typ (z.B. 'Gießen', 'Düngen')
 * @returns {number} Gewicht (Standard: 1)
 */
export function getTaskWeight(taskType) {
  return TASK_WEIGHTS[taskType] || 1;
}

/**
 * Berechnet Punkte für einen abgeschlossenen Task.
 * @param {string} taskType - Task-Typ
 * @param {boolean} isLate - Ob Task verspätet erledigt wurde
 * @returns {number} Punkte (1.0 * Gewicht pünktlich, 0.4 * Gewicht verspätet)
 */
export function calcTaskPoints(taskType, isLate) {
  const weight = getTaskWeight(taskType);
  return isLate ? 0.4 * weight : 1.0 * weight;
}

/**
 * Berechnet Strafpunkte für übersprungene Tasks.
 * @param {string} taskType - Task-Typ
 * @returns {number} Negative Punkte (-0.6 * Gewicht)
 */
export function calcSkipPoints(taskType) {
  const weight = getTaskWeight(taskType);
  return -0.6 * weight;
}

/**
 * Berechnet Healthcheck-Bonus basierend auf Score-Entwicklung.
 * @param {number} currentScore - Aktueller Health-Score
 * @param {number|null} prevScore - Vorheriger Health-Score (oder null)
 * @returns {number} Bonus-Punkte
 */
export function calcHealthcheckPoints(currentScore, prevScore) {
  const delta = prevScore !== null ? currentScore - prevScore : 0;
  return 0.2 + 0.05 * Math.max(0, delta);
}

/**
 * Berechnet Discovery-Score aus Events.
 * @param {Array} events - Array of discovery events
 * @param {boolean} events[].is_first - Ob es eine Erstentdeckung war
 * @returns {number} Discovery-Score (1 Punkt pro Event + 5 Bonus für is_first)
 */
export function calcDiscoveryScore(events) {
  return events.length + 5 * events.filter((e) => e.is_first).length;
}

/**
 * Berechnet den Aktivitäts-Streak (aufeinanderfolgende Tage mit Aktivität).
 * Setzt Streak auf 0, wenn letzte Aktivität älter als gestern ist.
 * @param {Array<string>} dates - Array von ISO-Datums-Strings
 * @returns {number} Streak-Länge (Anzahl aufeinanderfolgender Tage)
 */
/**
 * Berechnet das nächste Fälligkeitsdatum basierend auf Basis-Datum und Intervall.
 * Wenn das Basis-Datum in der Vergangenheit liegt, wird ab jetzt gerechnet.
 * @param {string} baseDueAt - ISO-Datums-String des Basis-Datums
 * @param {number} intervalDays - Intervall in Tagen
 * @returns {Date} Nächstes Fälligkeitsdatum
 */
export function computeNextDueAt(baseDueAt, intervalDays) {
  const base = new Date(Math.max(new Date(baseDueAt).getTime(), Date.now()));
  return new Date(base.getTime() + intervalDays * 86400000);
}

export function calcStreak(dates) {
  const uniqueDates = [...new Set(dates.map((d) => new Date(d).toISOString().slice(0, 10)))]
    .sort()
    .reverse();

  if (uniqueDates.length === 0) return 0;

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  if (uniqueDates[0] !== today && uniqueDates[0] !== yesterday) return 0;

  let streak = 1;
  for (let i = 1; i < uniqueDates.length; i++) {
    const prev = new Date(uniqueDates[i - 1]);
    const curr = new Date(uniqueDates[i]);
    const diff = (prev - curr) / 86400000;
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}
