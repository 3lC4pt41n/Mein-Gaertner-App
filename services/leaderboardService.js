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

  // Rang hinzufügen
  return (data || []).map((entry, index) => ({
    ...entry,
    rank: index + 1,
    score: entry[scoreCol],
  }));
}

/**
 * Eigenen Rang ermitteln.
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

  const userScore = userData[scoreCol];

  // Count how many users have a higher score
  const { count, error: countError } = await supabase
    .from('leaderboard_public')
    .select('*', { count: 'exact' })
    .gt(scoreCol, userScore);

  if (countError) throw countError;

  // Get total leaderboard size
  const { count: totalCount, error: totalError } = await supabase
    .from('leaderboard_public')
    .select('*', { count: 'exact' });

  if (totalError) throw totalError;

  return {
    rank: (count || 0) + 1,
    score: userScore,
    total: totalCount || 0,
  };
}

/**
 * Nachbarn im Ranking (±range Plätze um eigenen Rang).
 */
export async function getMyNeighbors(userId, timeWindow = 'week', type = 'gardener', range = 5) {
  const scoreCol = SCORE_COLUMNS[type]?.[timeWindow] || SCORE_COLUMNS.gardener.week;

  // Get user's rank first (with offset-based approach)
  // Fetch a large window and find the user's position
  const { data: rankedData, error: rankError } = await supabase
    .from('leaderboard_public')
    .select('user_id, ' + scoreCol)
    .order(scoreCol, { ascending: false })
    .limit(10000); // Get enough to find user position

  if (rankError) throw rankError;
  if (!rankedData || rankedData.length === 0) return [];

  const userIndex = rankedData.findIndex(e => e.user_id === userId);
  if (userIndex === -1) return [];

  const start = Math.max(0, userIndex - range);
  const end = Math.min(rankedData.length, userIndex + range + 1);

  // Now fetch the neighbor window with full data
  const { data: neighbors, error: neighborsError } = await supabase
    .from('leaderboard_public')
    .select('*')
    .order(scoreCol, { ascending: false })
    .range(start, end - 1);

  if (neighborsError) throw neighborsError;

  return (neighbors || []).map((entry, i) => ({
    ...entry,
    rank: start + i + 1,
    score: entry[scoreCol],
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
    .filter(e => new Date(e.created_at) > weekAgo)
    .reduce((sum, e) => sum + Number(e.points), 0);
  const gardenerScoreMonth = gardeningData
    .filter(e => new Date(e.created_at) > monthAgo)
    .reduce((sum, e) => sum + Number(e.points), 0);

  // Discovery Scores
  const discoveryAll = calcDiscoveryScore(discoveryData);
  const discoveryWeek = calcDiscoveryScore(discoveryData.filter(e => new Date(e.created_at) > weekAgo));
  const discoveryMonth = calcDiscoveryScore(discoveryData.filter(e => new Date(e.created_at) > monthAgo));

  // Streak berechnen (aufeinanderfolgende Tage mit Aktivität)
  const allDates = [
    ...gardeningData.map(e => e.created_at),
    ...discoveryData.map(e => e.created_at),
  ];

  const streak = calcStreak(allDates);

  // Task-Quote
  const tasksTotal = gardeningData.filter(e =>
    ['task_completed_on_time', 'task_completed_late', 'task_skipped'].includes(e.event_type)
  ).length;

  const tasksOnTime = gardeningData.filter(e =>
    ['task_completed_on_time', 'task_completed_late'].includes(e.event_type)
  ).length;

  return {
    gardenerScore: { week: gardenerScoreWeek, month: gardenerScoreMonth, all: gardenerScoreAll },
    discoveryScore: { week: discoveryWeek, month: discoveryMonth, all: discoveryAll },
    streak,
    totalDiscoveries: discoveryData.length,
    firstDiscoveries: discoveryData.filter(e => e.is_first).length,
    taskCompletionRate: tasksTotal > 0 ? Math.round((tasksOnTime / tasksTotal) * 100) : 0,
  };
}
