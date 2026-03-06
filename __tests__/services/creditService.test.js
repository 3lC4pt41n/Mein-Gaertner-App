import { supabase } from '../../supabase';
import { fetchBalance, fetchUsageHistory, fetchCreditHistory } from '../../services/creditService';

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

  describe('fetchCreditHistory', () => {
    it('returns merged and date-sorted history entries when all sources succeed', async () => {
      supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-789' } },
      });

      const usageLimitMock = jest.fn().mockResolvedValue({
        data: [
          { id: 'u1', action: 'chat', cost_credits: 3, created_at: '2026-03-01T10:00:00.000Z' },
        ],
        error: null,
      });
      const txLimitMock = jest.fn().mockResolvedValue({
        data: [
          {
            id: 't1',
            type: 'purchase',
            package_name: 'starter',
            credits_added: 100,
            created_at: '2026-03-02T10:00:00.000Z',
          },
        ],
        error: null,
      });
      const discoveryLimitMock = jest.fn().mockResolvedValue({
        data: [
          {
            id: 'd1',
            is_first: false,
            credits_awarded: 5,
            created_at: '2026-03-03T10:00:00.000Z',
            species: { canonical_name: 'monstera deliciosa' },
          },
        ],
        error: null,
      });

      supabase.from.mockImplementation((table) => {
        if (table === 'usage_log') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                order: jest.fn().mockReturnValue({
                  limit: usageLimitMock,
                }),
              }),
            }),
          };
        }
        if (table === 'transactions') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                order: jest.fn().mockReturnValue({
                  limit: txLimitMock,
                }),
              }),
            }),
          };
        }
        if (table === 'discovery_events') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                gt: jest.fn().mockReturnValue({
                  order: jest.fn().mockReturnValue({
                    limit: discoveryLimitMock,
                  }),
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      });

      const history = await fetchCreditHistory(30);

      expect(history).toHaveLength(3);
      expect(history[0]).toMatchObject({ id: 'd1', type: 'discovery', credits: 5 });
      expect(history[1]).toMatchObject({ id: 't1', type: 'purchase', credits: 100 });
      expect(history[2]).toMatchObject({ id: 'u1', type: 'usage', credits: -3 });
    });

    it('throws CREDIT_HISTORY_INCOMPLETE and includes partial entries when one source fails', async () => {
      supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-789' } },
      });

      const usageLimitMock = jest.fn().mockResolvedValue({
        data: [
          { id: 'u1', action: 'chat', cost_credits: 3, created_at: '2026-03-01T10:00:00.000Z' },
        ],
        error: null,
      });
      const txLimitMock = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'permission denied' },
      });
      const discoveryLimitMock = jest.fn().mockResolvedValue({
        data: [],
        error: null,
      });

      supabase.from.mockImplementation((table) => {
        if (table === 'usage_log') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                order: jest.fn().mockReturnValue({
                  limit: usageLimitMock,
                }),
              }),
            }),
          };
        }
        if (table === 'transactions') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                order: jest.fn().mockReturnValue({
                  limit: txLimitMock,
                }),
              }),
            }),
          };
        }
        if (table === 'discovery_events') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                gt: jest.fn().mockReturnValue({
                  order: jest.fn().mockReturnValue({
                    limit: discoveryLimitMock,
                  }),
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      });

      try {
        await fetchCreditHistory(30);
        throw new Error('Expected fetchCreditHistory to throw');
      } catch (error) {
        expect(error).toMatchObject({ code: 'CREDIT_HISTORY_INCOMPLETE' });
        expect(error.partialEntries).toEqual([
          expect.objectContaining({ id: 'u1', type: 'usage', credits: -3 }),
        ]);
      }
    });
  });
});
