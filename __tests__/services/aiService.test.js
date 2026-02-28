import { supabase } from '../../supabase';

// We need to mock auth.getSession before importing aiService
supabase.auth.getSession = jest.fn().mockResolvedValue({
  data: { session: { access_token: 'mock-token' } },
});

const { recognizePlant, generatePlantDetails, performHealthcheck, chatWithBen } = require('../../services/aiService');

describe('aiService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'mock-token' } },
    });
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
      });
      expect(result).toEqual({ reply: 'Hello!' });
    });

    it('throws if not logged in', async () => {
      supabase.auth.getSession.mockResolvedValue({
        data: { session: null },
      });

      await expect(chatWithBen('Hi', null, 'de')).rejects.toThrow('Nicht eingeloggt');
    });
  });
});
