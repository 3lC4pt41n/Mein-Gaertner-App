import { supabase } from '../../supabase';
import { fetchBalance, fetchUsageHistory } from '../../services/creditService';

describe('creditService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchBalance', () => {
    it('returns the balance for logged-in user', async () => {
      supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
      });

      // Chain mock: from().select().eq().single()
      const singleMock = jest.fn().mockResolvedValue({
        data: { balance: 42 },
        error: null,
      });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
      supabase.from.mockReturnValue({ select: selectMock });

      const balance = await fetchBalance();
      expect(balance).toBe(42);
      expect(supabase.from).toHaveBeenCalledWith('credit_balances');
      expect(selectMock).toHaveBeenCalledWith('balance');
      expect(eqMock).toHaveBeenCalledWith('user_id', 'user-123');
    });

    it('returns 0 when balance data is null', async () => {
      supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
      });

      const singleMock = jest.fn().mockResolvedValue({
        data: null,
        error: null,
      });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
      supabase.from.mockReturnValue({ select: selectMock });

      const balance = await fetchBalance();
      expect(balance).toBe(0);
    });

    it('throws when user is not logged in', async () => {
      supabase.auth.getUser.mockResolvedValue({
        data: { user: null },
      });

      await expect(fetchBalance()).rejects.toThrow('Nicht eingeloggt');
    });

    it('throws on database error', async () => {
      supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
      });

      const singleMock = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'DB error' },
      });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
      supabase.from.mockReturnValue({ select: selectMock });

      await expect(fetchBalance()).rejects.toEqual({ message: 'DB error' });
    });
  });

  describe('fetchUsageHistory', () => {
    it('returns usage history for logged-in user', async () => {
      supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-456' } },
      });

      const mockUsage = [{ id: 1, action: 'chat', credits: 1 }];
      const limitMock = jest.fn().mockResolvedValue({ data: mockUsage, error: null });
      const orderMock = jest.fn().mockReturnValue({ limit: limitMock });
      const eqMock = jest.fn().mockReturnValue({ order: orderMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
      supabase.from.mockReturnValue({ select: selectMock });

      const history = await fetchUsageHistory(10);
      expect(history).toEqual(mockUsage);
      expect(supabase.from).toHaveBeenCalledWith('usage_log');
      expect(limitMock).toHaveBeenCalledWith(10);
    });

    it('returns empty array when data is null', async () => {
      supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-456' } },
      });

      const limitMock = jest.fn().mockResolvedValue({ data: null, error: null });
      const orderMock = jest.fn().mockReturnValue({ limit: limitMock });
      const eqMock = jest.fn().mockReturnValue({ order: orderMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
      supabase.from.mockReturnValue({ select: selectMock });

      const history = await fetchUsageHistory();
      expect(history).toEqual([]);
    });
  });
});
