import { savePlantToSupabase, fetchPlants } from '../plantService';
import { supabase } from '../../supabase';

jest.mock('../../supabase', () => ({
  supabase: {
    from: jest.fn()
  }
}));

describe('plantService', () => {
  const mockFrom = supabase.from;
  const mockInsert = jest.fn();
  const mockSelect = jest.fn();
  const mockEq = jest.fn();
  const mockOrder = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockReturnValue({
      insert: mockInsert,
      select: mockSelect,
      eq: mockEq,
      order: mockOrder,
    });
  });

  describe('savePlantToSupabase', () => {
    it('inserts plant with correct values', async () => {
      const expectedData = [{ id: 1 }];
      mockInsert.mockResolvedValue({ data: expectedData, error: null });

      const input = { name: 'Tomate', note: 'Rot', image: 'img.jpg', user_id: 42 };
      const data = await savePlantToSupabase(input);

      expect(mockFrom).toHaveBeenCalledWith('plants');
      expect(mockInsert).toHaveBeenCalledWith([
        { name: input.name, note: input.note, image_url: input.image, user_id: input.user_id }
      ]);
      expect(data).toEqual(expectedData);
    });

    it('throws error when insert fails', async () => {
      const error = { message: 'failed' };
      mockInsert.mockResolvedValue({ data: null, error });

      await expect(savePlantToSupabase({})).rejects.toThrow(error.message);
    });
  });

  describe('fetchPlants', () => {
    beforeEach(() => {
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ order: mockOrder });
    });

    it('fetches plants for user', async () => {
      const expectedData = [{ id: 1 }];
      mockOrder.mockResolvedValue({ data: expectedData, error: null });

      const data = await fetchPlants(99);

      expect(mockFrom).toHaveBeenCalledWith('plants');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockEq).toHaveBeenCalledWith('user_id', 99);
      expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(data).toEqual(expectedData);
    });

    it('throws error when fetch fails', async () => {
      const error = new Error('fetch error');
      mockOrder.mockResolvedValue({ data: null, error });

      await expect(fetchPlants(1)).rejects.toBe(error);
    });
  });
});
