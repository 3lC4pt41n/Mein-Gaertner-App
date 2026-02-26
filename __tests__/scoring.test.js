/**
 * Tests für die Scoring-Logik des Leaderboard-Systems.
 *
 * Diese Tests prüfen die reinen Berechnungen (keine DB-Abhängigkeit):
 * - Task-Gewichtung & Punkte
 * - Healthcheck-Bonus
 * - Discovery-Score-Berechnung
 * - Streak-Berechnung
 */

// ── Task-Gewichtung (aus taskService.js extrahiert) ────────

const TASK_WEIGHTS = {
  watering: 1,
  fertilizing: 2,
  repotting: 3,
};

function getTaskWeight(taskType) {
  return TASK_WEIGHTS[taskType] || 1;
}

function calcTaskPoints(taskType, isLate) {
  const weight = getTaskWeight(taskType);
  return isLate ? 0.4 * weight : 1.0 * weight;
}

function calcSkipPoints(taskType) {
  const weight = getTaskWeight(taskType);
  return -0.6 * weight;
}

// ── Healthcheck-Bonus (aus plantService.js extrahiert) ─────

function calcHealthcheckPoints(currentScore, prevScore) {
  const delta = prevScore !== null ? currentScore - prevScore : 0;
  return 0.2 + 0.05 * Math.max(0, delta);
}

// ── Discovery-Score (aus leaderboard_public View-Logik) ────

function calcDiscoveryScore(events) {
  return events.length + 5 * events.filter(e => e.is_first).length;
}

// ── Streak-Berechnung (aus leaderboardService.js) ──────────

function calcStreak(dates) {
  const uniqueDates = [...new Set(dates.map(d => new Date(d).toISOString().slice(0, 10)))]
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

// ═══════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════

describe('Task-Gewichtung', () => {
  test('watering = Gewicht 1', () => {
    expect(getTaskWeight('watering')).toBe(1);
  });

  test('fertilizing = Gewicht 2', () => {
    expect(getTaskWeight('fertilizing')).toBe(2);
  });

  test('repotting = Gewicht 3', () => {
    expect(getTaskWeight('repotting')).toBe(3);
  });

  test('unbekannter Typ = Fallback 1', () => {
    expect(getTaskWeight('pruning')).toBe(1);
    expect(getTaskWeight(undefined)).toBe(1);
  });
});

describe('Task-Punkte', () => {
  test('pünktlich erledigt: volle Punkte', () => {
    expect(calcTaskPoints('watering', false)).toBe(1.0);
    expect(calcTaskPoints('fertilizing', false)).toBe(2.0);
    expect(calcTaskPoints('repotting', false)).toBe(3.0);
  });

  test('verspätet erledigt: 40% der Punkte', () => {
    expect(calcTaskPoints('watering', true)).toBeCloseTo(0.4);
    expect(calcTaskPoints('fertilizing', true)).toBeCloseTo(0.8);
    expect(calcTaskPoints('repotting', true)).toBeCloseTo(1.2);
  });

  test('übersprungen: negative Punkte (-60%)', () => {
    expect(calcSkipPoints('watering')).toBeCloseTo(-0.6);
    expect(calcSkipPoints('fertilizing')).toBeCloseTo(-1.2);
    expect(calcSkipPoints('repotting')).toBeCloseTo(-1.8);
  });

  test('Punkte-Balance: complete > skip (netto positiv)', () => {
    const complete = calcTaskPoints('watering', false);
    const skip = calcSkipPoints('watering');
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
    const events = [
      { is_first: false },
      { is_first: false },
      { is_first: false },
    ];
    expect(calcDiscoveryScore(events)).toBe(3);
  });

  test('Erstentdeckung: 1 + 5 Bonus = 6 Punkte', () => {
    const events = [{ is_first: true }];
    expect(calcDiscoveryScore(events)).toBe(6);
  });

  test('Mix aus normalen und Erstentdeckungen', () => {
    const events = [
      { is_first: true },   // 1 + 5 = 6
      { is_first: false },  // 1
      { is_first: true },   // 1 + 5 = 6
    ];
    // 3 (Anzahl) + 5*2 (Erstentdeckungen) = 13
    expect(calcDiscoveryScore(events)).toBe(13);
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
