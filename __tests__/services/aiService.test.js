import { supabase } from '../../supabase';
const { SUPABASE_PUBLISHABLE_KEY } = require('../../supabase');

// We need to mock auth.getSession before importing aiService
supabase.auth.getSession = jest.fn().mockResolvedValue({
  data: { session: { access_token: 'mock-token' } },
});
supabase.auth.signOut = jest.fn().mockResolvedValue({});

const {
  recognizePlant,
  generatePlantDetails,
  performHealthcheck,
  chatWithBen,
} = require('../../services/aiService');

describe('aiService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'mock-token' } },
    });
    supabase.auth.signOut.mockResolvedValue({});
  });

  describe('recognizePlant', () => {
    it('calls ai-plant-scan edge function with base64 and language', async () => {
      supabase.functions.invoke.mockResolvedValue({
        data: { name: 'Monstera', note: 'Tropical plant' },
        error: null,
      });

      const result = await recognizePlant('base64data', 'de');
      expect(supabase.functions.invoke).toHaveBeenCalledWith('ai-plant-scan', {
        body: { base64: 'base64data', language: 'de' },
        headers: { Authorization: 'Bearer mock-token', apikey: SUPABASE_PUBLISHABLE_KEY },
      });
      expect(result).toEqual({ name: 'Monstera', note: 'Tropical plant' });
    });

    it('throws on error from edge function', async () => {
      supabase.functions.invoke.mockResolvedValue({
        data: null,
        error: { message: 'Server error' },
      });

      await expect(recognizePlant('base64data', 'en')).rejects.toThrow('Server error');
    });

    it('throws INSUFFICIENT_CREDITS error on 402', async () => {
      supabase.functions.invoke.mockResolvedValue({
        data: null,
        error: {
          message: '402',
          context: JSON.stringify({
            code: 'INSUFFICIENT_CREDITS',
            error: 'Not enough credits',
            balance: 0,
            required: 5,
          }),
        },
      });

      try {
        await recognizePlant('base64data', 'de');
        fail('Should have thrown');
      } catch (e) {
        expect(e.code).toBe('INSUFFICIENT_CREDITS');
        expect(e.balance).toBe(0);
        expect(e.required).toBe(5);
      }
    });
  });

  describe('generatePlantDetails', () => {
    it('calls ai-plant-details edge function', async () => {
      supabase.functions.invoke.mockResolvedValue({
        data: { details: {} },
        error: null,
      });

      await generatePlantDetails('Monstera', 'Care note', 'de');
      expect(supabase.functions.invoke).toHaveBeenCalledWith('ai-plant-details', {
        body: { name: 'Monstera', note: 'Care note', language: 'de' },
        headers: { Authorization: 'Bearer mock-token', apikey: SUPABASE_PUBLISHABLE_KEY },
      });
    });
  });

  describe('performHealthcheck', () => {
    it('calls ai-healthcheck edge function', async () => {
      supabase.functions.invoke.mockResolvedValue({
        data: { score: 85 },
        error: null,
      });

      const result = await performHealthcheck('https://image.url', 'Rose', 'en');
      expect(supabase.functions.invoke).toHaveBeenCalledWith('ai-healthcheck', {
        body: { image_url: 'https://image.url', plant_name: 'Rose', language: 'en' },
        headers: { Authorization: 'Bearer mock-token', apikey: SUPABASE_PUBLISHABLE_KEY },
      });
      expect(result).toEqual({ score: 85 });
    });
  });

  describe('chatWithBen', () => {
    it('calls ai-chat edge function with text', async () => {
      supabase.functions.invoke.mockResolvedValue({
        data: { reply: 'Hello!' },
        error: null,
      });

      const result = await chatWithBen('Hi Ben', null, 'de');
      expect(supabase.functions.invoke).toHaveBeenCalledWith('ai-chat', {
        body: { text: 'Hi Ben', image_url: undefined, language: 'de' },
        headers: { Authorization: 'Bearer mock-token', apikey: SUPABASE_PUBLISHABLE_KEY },
      });
      expect(result).toEqual({ reply: 'Hello!' });
    });

    it('throws if not logged in', async () => {
      supabase.auth.getSession.mockResolvedValue({
        data: { session: null },
      });
      supabase.functions.invoke.mockResolvedValue({
        data: null,
        error: { message: '401 Unauthorized', status: 401 },
      });

      await expect(chatWithBen('Hi', null, 'de')).rejects.toThrow('Nicht eingeloggt');
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
      expect(supabase.auth.signOut).not.toHaveBeenCalled();
    });

    it('refreshes token and retries once on 401', async () => {
      supabase.functions.invoke
        .mockResolvedValueOnce({
          data: null,
          error: { message: '401 Unauthorized', status: 401 },
        })
        .mockResolvedValueOnce({
          data: { reply: 'Recovered' },
          error: null,
        });

      const result = await chatWithBen('Hi Ben', null, 'de');
      expect(result).toEqual({ reply: 'Recovered' });
      expect(supabase.auth.getSession).toHaveBeenCalledTimes(2);
      expect(supabase.functions.invoke).toHaveBeenNthCalledWith(1, 'ai-chat', {
        body: { text: 'Hi Ben', image_url: undefined, language: 'de' },
        headers: { Authorization: 'Bearer mock-token', apikey: SUPABASE_PUBLISHABLE_KEY },
      });
      expect(supabase.functions.invoke).toHaveBeenNthCalledWith(2, 'ai-chat', {
        body: { text: 'Hi Ben', image_url: undefined, language: 'de' },
        headers: { Authorization: 'Bearer mock-token', apikey: SUPABASE_PUBLISHABLE_KEY },
      });
      expect(supabase.auth.signOut).not.toHaveBeenCalled();
    });

    it('uses a newer token for explicit retry when session changed', async () => {
      supabase.auth.getSession
        .mockResolvedValueOnce({
          data: { session: { access_token: 'mock-token' } },
        })
        .mockResolvedValueOnce({
          data: { session: { access_token: 'refreshed-token' } },
        });

      supabase.functions.invoke
        .mockResolvedValueOnce({
          data: null,
          error: { message: '401 Unauthorized', status: 401 },
        })
        .mockResolvedValueOnce({
          data: { reply: 'Recovered with new token' },
          error: null,
        });

      const result = await chatWithBen('Hi Ben', null, 'de');
      expect(result).toEqual({ reply: 'Recovered with new token' });
      expect(supabase.functions.invoke).toHaveBeenNthCalledWith(2, 'ai-chat', {
        body: { text: 'Hi Ben', image_url: undefined, language: 'de' },
        headers: { Authorization: 'Bearer refreshed-token', apikey: SUPABASE_PUBLISHABLE_KEY },
      });
    });

    it('retries when auth error is wrapped in non-2xx context payload', async () => {
      supabase.functions.invoke
        .mockResolvedValueOnce({
          data: null,
          error: {
            message: 'Edge Function returned a non-2xx status code',
            context: JSON.stringify({ error: 'Nicht authentifiziert', status: 401 }),
          },
        })
        .mockResolvedValueOnce({
          data: { reply: 'Recovered from wrapped auth error' },
          error: null,
        });

      const result = await chatWithBen('Hi Ben', null, 'de');
      expect(result).toEqual({ reply: 'Recovered from wrapped auth error' });
      expect(supabase.functions.invoke).toHaveBeenCalledTimes(2);
      expect(supabase.functions.invoke).toHaveBeenNthCalledWith(1, 'ai-chat', {
        body: { text: 'Hi Ben', image_url: undefined, language: 'de' },
        headers: { Authorization: 'Bearer mock-token', apikey: SUPABASE_PUBLISHABLE_KEY },
      });
      expect(supabase.functions.invoke).toHaveBeenNthCalledWith(2, 'ai-chat', {
        body: { text: 'Hi Ben', image_url: undefined, language: 'de' },
        headers: { Authorization: 'Bearer mock-token', apikey: SUPABASE_PUBLISHABLE_KEY },
      });
      expect(supabase.auth.signOut).not.toHaveBeenCalled();
    });

    it('falls back to sdk-managed headers when explicit retries fail', async () => {
      supabase.functions.invoke
        .mockResolvedValueOnce({
          data: null,
          error: {
            message: 'Edge Function returned a non-2xx status code',
            context: JSON.stringify({ error: 'Nicht authentifiziert', status: 401 }),
          },
        })
        .mockResolvedValueOnce({
          data: null,
          error: {
            message: 'Edge Function returned a non-2xx status code',
            context: JSON.stringify({ error: 'Nicht authentifiziert', status: 401 }),
          },
        })
        .mockResolvedValueOnce({
          data: { reply: 'Recovered by SDK headers' },
          error: null,
        });

      const result = await chatWithBen('Hi Ben', null, 'de');
      expect(result).toEqual({ reply: 'Recovered by SDK headers' });
      expect(supabase.functions.invoke).toHaveBeenNthCalledWith(1, 'ai-chat', {
        body: { text: 'Hi Ben', image_url: undefined, language: 'de' },
        headers: { Authorization: 'Bearer mock-token', apikey: SUPABASE_PUBLISHABLE_KEY },
      });
      expect(supabase.functions.invoke).toHaveBeenNthCalledWith(2, 'ai-chat', {
        body: { text: 'Hi Ben', image_url: undefined, language: 'de' },
        headers: { Authorization: 'Bearer mock-token', apikey: SUPABASE_PUBLISHABLE_KEY },
      });
      expect(supabase.functions.invoke).toHaveBeenNthCalledWith(3, 'ai-chat', {
        body: { text: 'Hi Ben', image_url: undefined, language: 'de' },
      });
    });
  });
});
