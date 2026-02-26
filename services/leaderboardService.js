import { supabase } from '../supabase';

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

  // Alle Einträge absteigend sortiert holen und Position suchen
  const { data, error } = await supabase
    .from('leaderboard_public')
    .select('user_id, ' + scoreCol)
    .order(scoreCol, { ascending: false });

  if (error) throw error;

  const index = (data || []).findIndex(e => e.user_id === userId);
  if (index === -1) return null;

  return {
    rank: index + 1,
    score: data[index][scoreCol],
    total: data.length,
  };
}

/**
 * Nachbarn im Ranking (±range Plätze um eigenen Rang).
 */
export async function getMyNeighbors(userId, timeWindow = 'week', type = 'gardener', range = 5) {
  const scoreCol = SCORE_COLUMNS[type]?.[timeWindow] || SCORE_COLUMNS.gardener.week;

  const { data, error } = await supabase
    .from('leaderboard_public')
    .select('*')
    .order(scoreCol, { ascending: false });

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const index = data.findIndex(e => e.user_id === userId);
  if (index === -1) return [];

  const start = Math.max(0, index - range);
  const end = Math.min(data.length, index + range + 1);

  return data.slice(start, end).map((entry, i) => ({
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
    .select('points, created_at')
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
  const calcDiscovery = (events) =>
    events.length + 5 * events.filter(e => e.is_first).length;

  const discoveryAll = calcDiscovery(discoveryData);
  const discoveryWeek = calcDiscovery(discoveryData.filter(e => new Date(e.created_at) > weekAgo));
  const discoveryMonth = calcDiscovery(discoveryData.filter(e => new Date(e.created_at) > monthAgo));

  // Streak berechnen (aufeinanderfolgende Tage mit Aktivität)
  const allDates = [
    ...gardeningData.map(e => e.created_at),
    ...discoveryData.map(e => e.created_at),
  ]
    .map(d => new Date(d).toISOString().slice(0, 10))
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort()
    .reverse();

  let streak = 0;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  if (allDates[0] === today || allDates[0] === yesterday) {
    streak = 1;
    for (let i = 1; i < allDates.length; i++) {
      const prev = new Date(allDates[i - 1]);
      const curr = new Date(allDates[i]);
      const diff = (prev - curr) / 86400000;
      if (diff === 1) streak++;
      else break;
    }
  }

  // Task-Quote
  const tasksTotal = gardeningData.filter(e =>
    ['task_completed_on_time', 'task_completed_late', 'task_skipped'].includes(
      // points > 0 = completed, points < 0 = skipped (vereinfacht)
    )
  ).length;

  const tasksOnTime = gardeningData.filter(e => Number(e.points) > 0).length;

  return {
    gardenerScore: { week: gardenerScoreWeek, month: gardenerScoreMonth, all: gardenerScoreAll },
    discoveryScore: { week: discoveryWeek, month: discoveryMonth, all: discoveryAll },
    streak,
    totalDiscoveries: discoveryData.length,
    firstDiscoveries: discoveryData.filter(e => e.is_first).length,
    taskCompletionRate: tasksTotal > 0 ? Math.round((tasksOnTime / tasksTotal) * 100) : 0,
  };
}
