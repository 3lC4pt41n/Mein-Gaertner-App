import { supabase } from '../../supabase';

const { getMyRank, getMyNeighbors } = require('../../services/leaderboardService');

describe('leaderboardService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
