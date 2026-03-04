/**
 * Tests für die Scoring-Logik des Leaderboard-Systems.
 *
 * Diese Tests prüfen die reinen Berechnungen (keine DB-Abhängigkeit):
 * - Task-Gewichtung & Punkte
 * - Healthcheck-Bonus
 * - Discovery-Score-Berechnung
 * - Streak-Berechnung
 *
 * WICHTIG: Die Funktionen werden aus den Production-Modulen importiert.
 * Das garantiert, dass die Tests die echte Logik testen, nicht kopierte Logik.
 */

import {
  getTaskWeight,
  calcTaskPoints,
  calcSkipPoints,
  calcHealthcheckPoints,
  calcDiscoveryScore,
  calcStreak,
  calcPlantCountBonus,
  calcHealthMultiplier,
  calcCombinedGardenerScore,
} from '../services/scoringHelpers';

// ═══════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════

describe('Task-Gewichtung', () => {
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
});

describe('Task-Punkte', () => {
  test('pünktlich erledigt: volle Punkte', () => {
    expect(calcTaskPoints('Gießen', false)).toBe(1.0);
    expect(calcTaskPoints('Düngen', false)).toBe(2.0);
    expect(calcTaskPoints('Umtopfen', false)).toBe(3.0);
  });

  test('verspätet erledigt: 40% der Punkte', () => {
    expect(calcTaskPoints('Gießen', true)).toBeCloseTo(0.4);
    expect(calcTaskPoints('Düngen', true)).toBeCloseTo(0.8);
    expect(calcTaskPoints('Umtopfen', true)).toBeCloseTo(1.2);
  });

  test('übersprungen: negative Punkte (-60%)', () => {
    expect(calcSkipPoints('Gießen')).toBeCloseTo(-0.6);
    expect(calcSkipPoints('Düngen')).toBeCloseTo(-1.2);
    expect(calcSkipPoints('Umtopfen')).toBeCloseTo(-1.8);
  });

  test('Punkte-Balance: complete > skip (netto positiv)', () => {
    const complete = calcTaskPoints('Gießen', false);
    const skip = calcSkipPoints('Gießen');
    expect(complete + skip).toBeGreaterThan(0);
  });
});

describe('Healthcheck-Bonus', () => {
  test('ohne Vorgänger: 0.2 Basispunkte', () => {
    expect(calcHealthcheckPoints(80, null)).toBe(0.2);
  });

  test('Score gestiegen: Bonus proportional', () => {
    // 80 -> 90 = +10, Bonus = 0.2 + 0.05*10 = 0.7
    expect(calcHealthcheckPoints(90, 80)).toBeCloseTo(0.7);
  });

  test('Score gleich geblieben: nur Basispunkte', () => {
    expect(calcHealthcheckPoints(80, 80)).toBeCloseTo(0.2);
  });

  test('Score gesunken: kein Abzug, nur Basispunkte', () => {
    // 90 -> 70 = -20, aber max(0, delta) = 0
    expect(calcHealthcheckPoints(70, 90)).toBeCloseTo(0.2);
  });

  test('maximaler Bonus: 0 -> 100', () => {
    // delta = 100, Bonus = 0.2 + 0.05*100 = 5.2
    expect(calcHealthcheckPoints(100, 0)).toBeCloseTo(5.2);
  });
});

describe('Discovery-Score', () => {
  test('keine Events: 0 Punkte', () => {
    expect(calcDiscoveryScore([])).toBe(0);
  });

  test('nur normale Entdeckungen: 1 Punkt pro Event', () => {
    const events = [{ is_first: false }, { is_first: false }, { is_first: false }];
    expect(calcDiscoveryScore(events)).toBe(3);
  });

  test('Erstentdeckung: 1 + 5 Bonus = 6 Punkte', () => {
    const events = [{ is_first: true }];
    expect(calcDiscoveryScore(events)).toBe(6);
  });

  test('Mix aus normalen und Erstentdeckungen', () => {
    const events = [
      { is_first: true }, // 1 + 5 = 6
      { is_first: false }, // 1
      { is_first: true }, // 1 + 5 = 6
    ];
    // 3 (Anzahl) + 5*2 (Erstentdeckungen) = 13
    expect(calcDiscoveryScore(events)).toBe(13);
  });
});

describe('Pflanzen-Bonus', () => {
  test('0 Pflanzen: 0 Bonus', () => {
    expect(calcPlantCountBonus(0)).toBe(0);
  });

  test('1 Pflanze: 0.5 Bonus', () => {
    expect(calcPlantCountBonus(1)).toBe(0.5);
  });

  test('10 Pflanzen: 5.0 Bonus', () => {
    expect(calcPlantCountBonus(10)).toBe(5.0);
  });

  test('negative Werte: 0', () => {
    expect(calcPlantCountBonus(-3)).toBe(0);
  });
});

describe('Health-Multiplikator', () => {
  test('null/undefined: 0.25 (kein Healthcheck = Health 0)', () => {
    expect(calcHealthMultiplier(null)).toBe(0.25);
    expect(calcHealthMultiplier(undefined)).toBe(0.25);
  });

  test('Health 0: minimaler Multiplikator 0.25', () => {
    expect(calcHealthMultiplier(0)).toBe(0.25);
  });

  test('Health 80: neutraler Multiplikator 1.0', () => {
    expect(calcHealthMultiplier(80)).toBe(1.0);
  });

  test('Health 100: Multiplikator 1.25 (max)', () => {
    expect(calcHealthMultiplier(100)).toBe(1.25);
  });

  test('Health 60: Multiplikator 0.75', () => {
    expect(calcHealthMultiplier(60)).toBe(0.75);
  });

  test('Health 40: Multiplikator 0.5', () => {
    expect(calcHealthMultiplier(40)).toBe(0.5);
  });

  test('extrem hoch (120): capped bei 1.25', () => {
    expect(calcHealthMultiplier(120)).toBe(1.25);
  });
});

describe('Kombinierter Gärtner-Score', () => {
  test('10 Punkte + 2 Pflanzen + Health 80 = (10+1)*1.0 = 11', () => {
    expect(calcCombinedGardenerScore(10, 2, 80)).toBe(11);
  });

  test('10 Punkte + 0 Pflanzen + Health 0 = (10+0)*0.25 = 2.5', () => {
    expect(calcCombinedGardenerScore(10, 0, 0)).toBe(2.5);
  });

  test('20 Punkte + 4 Pflanzen + Health 100 = (20+2)*1.25 = 27.5', () => {
    expect(calcCombinedGardenerScore(20, 4, 100)).toBe(27.5);
  });

  test('0 Punkte + 0 Pflanzen + null Health = 0', () => {
    expect(calcCombinedGardenerScore(0, 0, null)).toBe(0);
  });
});

describe('Streak-Berechnung', () => {
  test('keine Aktivität: 0', () => {
    expect(calcStreak([])).toBe(0);
  });

  test('nur heute: Streak = 1', () => {
    const today = new Date().toISOString();
    expect(calcStreak([today])).toBe(1);
  });

  test('heute + gestern: Streak = 2', () => {
    const today = new Date();
    const yesterday = new Date(Date.now() - 86400000);
    expect(calcStreak([today.toISOString(), yesterday.toISOString()])).toBe(2);
  });

  test('3 aufeinanderfolgende Tage bis heute: Streak = 3', () => {
    const dates = [
      new Date().toISOString(),
      new Date(Date.now() - 1 * 86400000).toISOString(),
      new Date(Date.now() - 2 * 86400000).toISOString(),
    ];
    expect(calcStreak(dates)).toBe(3);
  });

  test('Lücke bricht Streak', () => {
    const dates = [
      new Date().toISOString(),
      new Date(Date.now() - 1 * 86400000).toISOString(),
      // Lücke: -2 Tage fehlt
      new Date(Date.now() - 3 * 86400000).toISOString(),
    ];
    expect(calcStreak(dates)).toBe(2);
  });

  test('nur vorgestern: Streak = 0 (nicht heute/gestern)', () => {
    const dates = [new Date(Date.now() - 2 * 86400000).toISOString()];
    expect(calcStreak(dates)).toBe(0);
  });

  test('Duplikate am selben Tag werden dedupliziert', () => {
    const today = new Date().toISOString();
    expect(calcStreak([today, today, today])).toBe(1);
  });
});
