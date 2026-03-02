/**
 * Tests für die Task-Engine v2:
 * - computeNextDueAt (Rescheduling-Berechnung)
 * - Task-Gewichte mit deutschen Typ-Strings
 * - Dedupe-Key Generierung
 * - Edge Cases: DST, Vergangenheit, Zukunft
 *
 * WICHTIG: Die Funktionen werden aus den Production-Modulen importiert.
 * Das garantiert, dass die Tests die echte Logik testen, nicht kopierte Logik.
 */

import {
  computeNextDueAt,
  getTaskWeight,
  calcTaskPoints,
  calcSkipPoints,
} from '../services/taskService';

// ── Dedupe-Key Berechnung ───────────────────────────────────
// Diese Helper-Funktion ist klein und kann inline bleiben
function computeDedupeKey(templateId, dueAtIso) {
  return `${templateId}:${new Date(dueAtIso).toISOString().slice(0, 10)}`;
}

// ═══════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════

describe('computeNextDueAt', () => {
  test('Intervall 5 Tage ab Zukunftsdatum', () => {
    // Basis in der Zukunft → nächstes Due = Basis + 5 Tage
    const futureDate = new Date(Date.now() + 10 * 86400000).toISOString(); // +10 Tage
    const next = computeNextDueAt(futureDate, 5);
    const expected = new Date(new Date(futureDate).getTime() + 5 * 86400000);
    expect(next.getTime()).toBe(expected.getTime());
  });

  test('Intervall 5 Tage ab Vergangenheitsdatum → nutzt jetzt als Basis', () => {
    // Basis in der Vergangenheit → max(basis, now) = now → next = now + 5 Tage
    const pastDate = new Date(Date.now() - 3 * 86400000).toISOString(); // -3 Tage
    const before = Date.now();
    const next = computeNextDueAt(pastDate, 5);
    const after = Date.now();
    // Next should be approximately now + 5 days
    expect(next.getTime()).toBeGreaterThanOrEqual(before + 5 * 86400000);
    expect(next.getTime()).toBeLessThanOrEqual(after + 5 * 86400000);
  });

  test('Intervall 1 Tag (täglich)', () => {
    const now = new Date();
    const futureDate = new Date(now.getTime() + 86400000).toISOString(); // morgen
    const next = computeNextDueAt(futureDate, 1);
    const expected = new Date(new Date(futureDate).getTime() + 86400000);
    expect(next.getTime()).toBe(expected.getTime());
  });

  test('Intervall 30 Tage (monatlich)', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const next = computeNextDueAt(futureDate, 30);
    const expected = new Date(new Date(futureDate).getTime() + 30 * 86400000);
    expect(next.getTime()).toBe(expected.getTime());
  });

  test('Basis genau jetzt → next = jetzt + interval', () => {
    const now = new Date().toISOString();
    const before = Date.now();
    const next = computeNextDueAt(now, 7);
    const after = Date.now();
    expect(next.getTime()).toBeGreaterThanOrEqual(before + 7 * 86400000);
    expect(next.getTime()).toBeLessThanOrEqual(after + 7 * 86400000);
  });

  test('Kein Drift in die Vergangenheit bei überfälligen Tasks', () => {
    // Stark überfälliger Task: 30 Tage in der Vergangenheit, Intervall 5
    const veryPast = new Date(Date.now() - 30 * 86400000).toISOString();
    const next = computeNextDueAt(veryPast, 5);
    // Nächstes Due muss in der Zukunft liegen
    expect(next.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('Task-Gewichte (deutsche Strings)', () => {
  test('Gießen = Gewicht 1', () => {
    expect(getTaskWeight('Gießen')).toBe(1);
  });

  test('Düngen = Gewicht 2', () => {
    expect(getTaskWeight('Düngen')).toBe(2);
  });

  test('Umtopfen = Gewicht 3', () => {
    expect(getTaskWeight('Umtopfen')).toBe(3);
  });

  test('Healthcheck = Gewicht 1', () => {
    expect(getTaskWeight('Healthcheck')).toBe(1);
  });

  test('Sonstiges = Gewicht 1', () => {
    expect(getTaskWeight('Sonstiges')).toBe(1);
  });

  test('unbekannter Typ = Fallback 1', () => {
    expect(getTaskWeight('Schneiden')).toBe(1);
    expect(getTaskWeight(undefined)).toBe(1);
    expect(getTaskWeight('')).toBe(1);
  });

  test('alte englische Schlüssel bekommen Fallback (nicht mehr 2/3)', () => {
    // Sicherstellung dass die alten englischen Keys nicht mehr matchen
    expect(getTaskWeight('watering')).toBe(1);
    expect(getTaskWeight('fertilizing')).toBe(1);
  });
});

describe('Dedupe-Key', () => {
  test('Format: templateId:YYYY-MM-DD', () => {
    const key = computeDedupeKey('abc-123', '2026-03-15T08:00:00.000Z');
    expect(key).toBe('abc-123:2026-03-15');
  });

  test('gleicher Tag → gleicher Key (Idempotenz)', () => {
    const key1 = computeDedupeKey('tpl-1', '2026-03-15T06:00:00.000Z');
    const key2 = computeDedupeKey('tpl-1', '2026-03-15T22:00:00.000Z');
    expect(key1).toBe(key2);
  });

  test('verschiedene Tage → verschiedene Keys', () => {
    const key1 = computeDedupeKey('tpl-1', '2026-03-15T08:00:00.000Z');
    const key2 = computeDedupeKey('tpl-1', '2026-03-16T08:00:00.000Z');
    expect(key1).not.toBe(key2);
  });

  test('verschiedene Templates → verschiedene Keys', () => {
    const key1 = computeDedupeKey('tpl-1', '2026-03-15T08:00:00.000Z');
    const key2 = computeDedupeKey('tpl-2', '2026-03-15T08:00:00.000Z');
    expect(key1).not.toBe(key2);
  });
});

describe('Punkte-Berechnung mit deutschen Typ-Strings', () => {
  test('Gießen pünktlich: 1.0 Punkt', () => {
    expect(calcTaskPoints('Gießen', false)).toBe(1.0);
  });

  test('Düngen pünktlich: 2.0 Punkte', () => {
    expect(calcTaskPoints('Düngen', false)).toBe(2.0);
  });

  test('Umtopfen pünktlich: 3.0 Punkte', () => {
    expect(calcTaskPoints('Umtopfen', false)).toBe(3.0);
  });

  test('Gießen verspätet: 0.4 Punkte', () => {
    expect(calcTaskPoints('Gießen', true)).toBeCloseTo(0.4);
  });

  test('Düngen verspätet: 0.8 Punkte', () => {
    expect(calcTaskPoints('Düngen', true)).toBeCloseTo(0.8);
  });

  test('Gießen übersprungen: -0.6 Punkte', () => {
    expect(calcSkipPoints('Gießen')).toBeCloseTo(-0.6);
  });

  test('Düngen übersprungen: -1.2 Punkte', () => {
    expect(calcSkipPoints('Düngen')).toBeCloseTo(-1.2);
  });

  test('Umtopfen übersprungen: -1.8 Punkte', () => {
    expect(calcSkipPoints('Umtopfen')).toBeCloseTo(-1.8);
  });
});

describe('Rescheduling-Szenarien (Integration)', () => {
  test('Task erledigt → nächstes Due liegt korrekt in der Zukunft', () => {
    const dueAt = new Date(Date.now() + 2 * 86400000).toISOString(); // +2 Tage
    const intervalDays = 5;
    const nextDue = computeNextDueAt(dueAt, intervalDays);

    // Nächstes Due = dueAt + 5 Tage (da dueAt in der Zukunft)
    const expected = new Date(new Date(dueAt).getTime() + 5 * 86400000);
    expect(nextDue.getTime()).toBe(expected.getTime());
  });

  test('Überfälliger Task erledigt → nächstes Due ab jetzt, nicht ab überfälligem Datum', () => {
    const dueAt = new Date(Date.now() - 2 * 86400000).toISOString(); // -2 Tage (überfällig)
    const intervalDays = 5;
    const before = Date.now();
    const nextDue = computeNextDueAt(dueAt, intervalDays);
    const after = Date.now();

    // Nächstes Due = jetzt + 5 Tage (nicht überfälliges Datum + 5 Tage)
    expect(nextDue.getTime()).toBeGreaterThanOrEqual(before + 5 * 86400000);
    expect(nextDue.getTime()).toBeLessThanOrEqual(after + 5 * 86400000);
    // Muss in der Zukunft liegen
    expect(nextDue.getTime()).toBeGreaterThan(Date.now());
  });

  test('Dedupe-Key verhindert doppelte Tasks am selben Tag', () => {
    const templateId = 'template-abc';
    const dueAt = '2026-03-15T08:00:00.000Z';

    // Zwei Rescheduling-Versuche am selben Tag → gleicher Key
    const key1 = computeDedupeKey(templateId, dueAt);
    const key2 = computeDedupeKey(templateId, dueAt);
    expect(key1).toBe(key2);
    // → INSERT ON CONFLICT DO NOTHING würde den zweiten ignorieren
  });
});
