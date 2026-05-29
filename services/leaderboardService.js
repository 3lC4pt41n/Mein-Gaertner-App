/**
 * Leaderboard Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Architecture decision (2026-03-13):
 *   getMyRank() and getMyNeighbors() now use server-side RPCs with
 *   dense_rank() window functions instead of fetching the full
 *   leaderboard_public view and ranking client-side.
 *
 *   Rationale: The previous approach performed a full-table-scan on the
 *   leaderboard_public view for every "my rank" request. With RPC, only
 *   a single-row result (or a small neighborhood) is returned.
 *
 *   getLeaderboard() uses a bounded SECURITY DEFINER RPC so public ranking
 *   data stays aggregated and raw discovery rows remain protected by RLS.
 *
 *   The RPCs use SECURITY DEFINER + SET search_path = public to prevent
 *   search_path hijacking (Supabase best practice).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { supabase } from '../supabase';
import {
  calcDiscoveryScore,
  calcStreak,
  calcHealthMultiplier,
  calcCombinedGardenerScore,
} from './scoringHelpers';

// Re-export for tests
export { calcDiscoveryScore, calcStreak, calcCombinedGardenerScore } from './scoringHelpers';

// Score-Spalten-Mapping für Zeitfenster + Typ
const SCORE_COLUMNS = {
  gardener: {
    week: 'gardener_score_week',
    month: 'gardener_score_month',
    all: 'gardener_score_all',
  },
  discovery: {
    week: 'discovery_points_week',
    month: 'discovery_points_month',
    all: 'discovery_points_all',
  },
};

/**
 * Assign dense_rank to a sorted array of entries (descending by score).
 * Ties get the same rank; the next distinct score gets rank = previous + 1.
 */
function assignDenseRanks(entries, scoreCol) {
  let rank = 0;
  let prevScore = null;
  return entries.map((entry) => {
    const score = Number(entry[scoreCol]) || 0;
    if (score !== prevScore) {
      rank += 1;
      prevScore = score;
    }
    return { ...entry, rank, score };
  });
}

/**
 * Leaderboard Top-N abrufen (aggregiert per SECURITY DEFINER RPC).
 *
 * @param {'week'|'month'|'all'} timeWindow
 * @param {'gardener'|'discovery'} type
 * @param {number} limit
 */
export async function getLeaderboard(timeWindow = 'week', type = 'gardener', limit = 50) {
  const scoreCol = SCORE_COLUMNS[type]?.[timeWindow] || SCORE_COLUMNS.gardener.week;

  const { data: rpcData, error: rpcError } = await supabase.rpc('get_leaderboard_public', {
    p_score_column: scoreCol,
    p_limit: limit,
  });

  if (!rpcError) return assignDenseRanks(rpcData || [], scoreCol);

  // Fallback for app bundles that reach users before the migration deploys.
  if (rpcError.code !== '42883' && rpcError.code !== 'PGRST202') throw rpcError;

  const { data, error } = await supabase
    .from('leaderboard_public')
    .select('*')
    .order(scoreCol, { ascending: false })
    .limit(limit);

  if (error) throw error;

  return assignDenseRanks(data || [], scoreCol);
}

/**
 * Eigenen Rang ermitteln.
 * Uses a server-side RPC with dense_rank() — no full-table-scan.
 */
export async function getMyRank(userId, timeWindow = 'week', type = 'gardener') {
  const scoreCol = SCORE_COLUMNS[type]?.[timeWindow] || SCORE_COLUMNS.gardener.week;

  const { data, error } = await supabase.rpc('get_my_rank', {
    p_score_column: scoreCol,
    p_user_id: userId,
  });

  if (error) throw error;
  if (!data) return null;

  return {
    rank: data.rank,
    score: data.score,
    total: data.total,
  };
}

/**
 * Nachbarn im Ranking (±range Plätze um eigenen Rang).
 * Uses a server-side RPC with dense_rank() — no full-table-scan.
 */
export async function getMyNeighbors(userId, timeWindow = 'week', type = 'gardener', range = 5) {
  const scoreCol = SCORE_COLUMNS[type]?.[timeWindow] || SCORE_COLUMNS.gardener.week;

  const { data, error } = await supabase.rpc('get_my_neighbors', {
    p_score_column: scoreCol,
    p_user_id: userId,
    p_range: range,
  });

  if (error) throw error;
  return data || [];
}

/**
 * Eigene Statistiken (ohne Leaderboard-Opt-in nötig).
 */
export async function getMyStats(userId) {
  // Gardening-Punkte
  const { data: gardeningData, error: gErr } = await supabase
    .from('gardening_events')
    .select('points, event_type, created_at')
    .eq('user_id', userId);

  if (gErr) throw gErr;

  // Discovery-Events
  const { data: discoveryData, error: dErr } = await supabase
    .from('discovery_events')
    .select('id, is_first, created_at')
    .eq('user_id', userId);

  if (dErr) throw dErr;

  // Pflanzen zählen
  const { count: plantCount, error: pErr } = await supabase
    .from('plants')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (pErr) throw pErr;

  // Letzter Healthcheck pro Pflanze → Durchschnitt berechnen
  const { data: plants } = await supabase.from('plants').select('id').eq('user_id', userId);

  let avgHealthScore = 0;
  if (plants && plants.length > 0) {
    // Letzten Healthcheck-Score pro Pflanze holen
    const { data: healthData } = await supabase
      .from('plant_healthchecks')
      .select('plant_id, healthscore, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    // Nur den neuesten Score pro Pflanze behalten
    const latestPerPlant = new Map();
    for (const hc of healthData || []) {
      if (!latestPerPlant.has(hc.plant_id)) {
        latestPerPlant.set(hc.plant_id, hc.healthscore);
      }
    }

    // Pflanzen ohne Healthcheck zählen als 0
    let totalHealth = 0;
    for (const p of plants) {
      totalHealth += latestPerPlant.get(p.id) ?? 0;
    }
    avgHealthScore = totalHealth / plants.length;
  }

  const now = new Date();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  // Raw Gardener Scores (ohne Bonus)
  const rawScoreAll = gardeningData.reduce((sum, e) => sum + Number(e.points), 0);
  const rawScoreWeek = gardeningData
    .filter((e) => new Date(e.created_at) > weekAgo)
    .reduce((sum, e) => sum + Number(e.points), 0);
  const rawScoreMonth = gardeningData
    .filter((e) => new Date(e.created_at) > monthAgo)
    .reduce((sum, e) => sum + Number(e.points), 0);

  // Combined Gardener Scores (mit Pflanzen-Bonus & Health-Multiplikator)
  const pc = plantCount || 0;
  const gardenerScoreWeek = calcCombinedGardenerScore(rawScoreWeek, pc, avgHealthScore);
  const gardenerScoreMonth = calcCombinedGardenerScore(rawScoreMonth, pc, avgHealthScore);
  const gardenerScoreAll = calcCombinedGardenerScore(rawScoreAll, pc, avgHealthScore);

  // Discovery Scores
  const discoveryAll = calcDiscoveryScore(discoveryData);
  const discoveryWeek = calcDiscoveryScore(
    discoveryData.filter((e) => new Date(e.created_at) > weekAgo)
  );
  const discoveryMonth = calcDiscoveryScore(
    discoveryData.filter((e) => new Date(e.created_at) > monthAgo)
  );

  // Streak berechnen (aufeinanderfolgende Tage mit Aktivität)
  const allDates = [
    ...gardeningData.map((e) => e.created_at),
    ...discoveryData.map((e) => e.created_at),
  ];

  const streak = calcStreak(allDates);

  // Task-Quote
  const tasksTotal = gardeningData.filter((e) =>
    ['task_completed_on_time', 'task_completed_late', 'task_skipped'].includes(e.event_type)
  ).length;

  const tasksOnTime = gardeningData.filter((e) =>
    ['task_completed_on_time', 'task_completed_late'].includes(e.event_type)
  ).length;

  return {
    gardenerScore: { week: gardenerScoreWeek, month: gardenerScoreMonth, all: gardenerScoreAll },
    discoveryScore: { week: discoveryWeek, month: discoveryMonth, all: discoveryAll },
    streak,
    plantCount: pc,
    avgHealthScore: Math.round(avgHealthScore),
    healthMultiplier: calcHealthMultiplier(avgHealthScore),
    totalDiscoveries: discoveryData.length,
    firstDiscoveries: discoveryData.filter((e) => e.is_first).length,
    taskCompletionRate: tasksTotal > 0 ? Math.round((tasksOnTime / tasksTotal) * 100) : 0,
  };
}
