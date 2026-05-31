import { supabase } from '../../supabase';

const { getLeaderboard, getMyRank, getMyNeighbors } = require('../../services/leaderboardService');

describe('leaderboardService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getLeaderboard', () => {
    it('normalizes string score columns, sorts entries and assigns dense ranks', async () => {
      supabase.rpc.mockResolvedValue({
        data: [
          { user_id: 'olga', display_name: 'olga', discovery_points_all: '17' },
          { user_id: 'captain', display_name: 'ElCaptain', discovery_points_all: '718' },
          { user_id: 'genix', display_name: 'Genix', discovery_points_all: 126 },
        ],
        error: null,
      });

      const result = await getLeaderboard('all', 'discovery', 50);

      expect(supabase.rpc).toHaveBeenCalledWith('get_leaderboard_public', {
        p_score_column: 'discovery_points_all',
        p_limit: 50,
      });
      expect(result.map(({ user_id, score, rank }) => ({ user_id, score, rank }))).toEqual([
        { user_id: 'captain', score: 718, rank: 1 },
        { user_id: 'genix', score: 126, rank: 2 },
        { user_id: 'olga', score: 17, rank: 3 },
      ]);
    });

    it('falls back to a generic score field for older RPC payloads', async () => {
      supabase.rpc.mockResolvedValue({
        data: [
          { user_id: 'a', display_name: 'A', score: '0' },
          { user_id: 'b', display_name: 'B', score: '42' },
        ],
        error: null,
      });

      const result = await getLeaderboard('all', 'discovery', 50);

      expect(result.map(({ user_id, score, rank }) => ({ user_id, score, rank }))).toEqual([
        { user_id: 'b', score: 42, rank: 1 },
        { user_id: 'a', score: 0, rank: 2 },
      ]);
    });

    it('does NOT fall back to leaderboard_public when the public RPC is unavailable', async () => {
      supabase.rpc.mockResolvedValue({
        data: null,
        error: { code: 'PGRST202', message: 'function not found' },
      });

      await expect(getLeaderboard('all', 'discovery', 50)).rejects.toThrow(
        'Leaderboard RPC is not available'
      );
      expect(supabase.from).not.toHaveBeenCalled();
    });
  });

  describe('getMyRank', () => {
    it('calls supabase.rpc with get_my_rank and correct params', async () => {
      supabase.rpc.mockResolvedValue({
        data: { rank: 3, score: 120, total: 50 },
        error: null,
      });

      const result = await getMyRank('user-123', 'week', 'gardener');

      expect(supabase.rpc).toHaveBeenCalledWith('get_my_rank', {
        p_score_column: 'gardener_score_week',
        p_user_id: 'user-123',
      });
      expect(result).toEqual({ rank: 3, score: 120, total: 50 });
    });

    it('does NOT query leaderboard_public via .from() for my-rank', async () => {
      supabase.rpc.mockResolvedValue({
        data: { rank: 1, score: 200, total: 10 },
        error: null,
      });

      await getMyRank('user-123', 'month', 'discovery');

      // Ensure no full-table-scan via .from('leaderboard_public')
      expect(supabase.from).not.toHaveBeenCalled();
      expect(supabase.rpc).toHaveBeenCalledWith('get_my_rank', {
        p_score_column: 'discovery_points_month',
        p_user_id: 'user-123',
      });
    });

    it('returns null when user is not found in leaderboard', async () => {
      supabase.rpc.mockResolvedValue({ data: null, error: null });

      const result = await getMyRank('unknown-user', 'all', 'gardener');
      expect(result).toBeNull();
    });

    it('throws on RPC error', async () => {
      supabase.rpc.mockResolvedValue({
        data: null,
        error: { message: 'DB error' },
      });

      await expect(getMyRank('user-123')).rejects.toMatchObject({ message: 'DB error' });
    });
  });

  describe('getMyNeighbors', () => {
    it('calls supabase.rpc with get_my_neighbors and correct params', async () => {
      const neighbors = [
        { user_id: 'a', display_name: 'Alice', score: 100, rank: 1, isMe: false },
        { user_id: 'user-123', display_name: 'Me', score: 90, rank: 2, isMe: true },
      ];
      supabase.rpc.mockResolvedValue({ data: neighbors, error: null });

      const result = await getMyNeighbors('user-123', 'week', 'gardener', 3);

      expect(supabase.rpc).toHaveBeenCalledWith('get_my_neighbors', {
        p_score_column: 'gardener_score_week',
        p_user_id: 'user-123',
        p_range: 3,
      });
      expect(result).toEqual(neighbors);
    });

    it('does NOT query leaderboard_public via .from() for neighbors', async () => {
      supabase.rpc.mockResolvedValue({ data: [], error: null });

      await getMyNeighbors('user-123', 'all', 'discovery');
      expect(supabase.from).not.toHaveBeenCalled();
    });
  });
});
