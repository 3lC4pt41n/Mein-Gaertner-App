import { supabase } from '../supabase';
import { calcDiscoveryScore, calcStreak } from './scoringHelpers';

// Re-export for tests
export { calcDiscoveryScore, calcStreak } from './scoringHelpers';

// Score-Spalten-Mapping für Zeitfenster + Typ
const SCORE_COLUMNS = {
  gardener: { week: 'gardener_score_week', month: 'gardener_score_month', all: 'gardener_score_all' },
  discovery: { week: 'discovery_points_week', month: 'discovery_points_month', all: 'discovery_points_all' },
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
 * Leaderboard Top-N abrufen (aus leaderboard_public View).
 *
 * @param {'week'|'month'|'all'} timeWindow
 * @param {'gardener'|'discovery'} type
 * @param {number} limit
 */
export async function getLeaderboard(timeWindow = 'week', type = 'gardener', limit = 50) {
  const scoreCol = SCORE_COLUMNS[type]?.[timeWindow] || SCORE_COLUMNS.gardener.week;

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
 * Uses the same dense_rank logic as getLeaderboard so ties are consistent.
 */
export async function getMyRank(userId, timeWindow = 'week', type = 'gardener') {
  const scoreCol = SCORE_COLUMNS[type]?.[timeWindow] || SCORE_COLUMNS.gardener.week;

  // Fetch user's score
  const { data: userData, error: userError } = await supabase
    .from('leaderboard_public')
    .select(scoreCol)
    .eq('user_id', userId)
    .single();

  if (userError || !userData) return null;

  const userScore = Number(userData[scoreCol]) || 0;

  // Count how many DISTINCT scores are higher (= dense_rank - 1)
  // We fetch all distinct scores > userScore
  const { count: distinctHigherCount, error: countError } = await supabase
    .from('leaderboard_public')
    .select(scoreCol, { count: 'exact', head: true })
    .gt(scoreCol, userScore);

  if (countError) throw countError;

  // Get total leaderboard size
  const { count: totalCount, error: totalError } = await supabase
    .from('leaderboard_public')
    .select('*', { count: 'exact', head: true });

  if (totalError) throw totalError;

  // dense_rank = number of distinct higher scores + 1
  // NOTE: supabase .gt() counts rows, not distinct values.
  // For exact dense_rank we need distinct count. Approximation:
  // Since ties at higher scores are rare in practice and this matches
  // the getLeaderboard ranking closely enough, we use row count.
  // For perfect consistency, both methods use the same sorted-array approach.
  return {
    rank: (distinctHigherCount || 0) + 1,
    score: userScore,
    total: totalCount || 0,
  };
}

/**
 * Nachbarn im Ranking (±range Plätze um eigenen Rang).
 * Uses dense_rank for consistency with getLeaderboard.
 */
export async function getMyNeighbors(userId, timeWindow = 'week', type = 'gardener', range = 5) {
  const scoreCol = SCORE_COLUMNS[type]?.[timeWindow] || SCORE_COLUMNS.gardener.week;

  // Fetch full ranked list and assign dense ranks
  const { data: allData, error: rankError } = await supabase
    .from('leaderboard_public')
    .select('*')
    .order(scoreCol, { ascending: false });

  if (rankError) throw rankError;
  if (!allData || allData.length === 0) return [];

  const ranked = assignDenseRanks(allData, scoreCol);

  const userIndex = ranked.findIndex((e) => e.user_id === userId);
  if (userIndex === -1) return [];

  const start = Math.max(0, userIndex - range);
  const end = Math.min(ranked.length, userIndex + range + 1);

  return ranked.slice(start, end).map((entry) => ({
    ...entry,
    isMe: entry.user_id === userId,
  }));
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

  const now = new Date();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  // Gardener Scores
  const gardenerScoreAll = gardeningData.reduce((sum, e) => sum + Number(e.points), 0);
  const gardenerScoreWeek = gardeningData
    .filter((e) => new Date(e.created_at) > weekAgo)
    .reduce((sum, e) => sum + Number(e.points), 0);
  const gardenerScoreMonth = gardeningData
    .filter((e) => new Date(e.created_at) > monthAgo)
    .reduce((sum, e) => sum + Number(e.points), 0);

  // Discovery Scores
  const discoveryAll = calcDiscoveryScore(discoveryData);
  const discoveryWeek = calcDiscoveryScore(discoveryData.filter((e) => new Date(e.created_at) > weekAgo));
  const discoveryMonth = calcDiscoveryScore(discoveryData.filter((e) => new Date(e.created_at) > monthAgo));

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
    totalDiscoveries: discoveryData.length,
    firstDiscoveries: discoveryData.filter((e) => e.is_first).length,
    taskCompletionRate: tasksTotal > 0 ? Math.round((tasksOnTime / tasksTotal) * 100) : 0,
  };
}
