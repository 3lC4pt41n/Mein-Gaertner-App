import { supabase } from '../../supabase';
import { fetchMessages } from '../../services/chatService';

function mockMessagesQueryResult(rows) {
  const queryResult = { data: rows, error: null };
  const queryBuilder = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    then: (resolve, reject) => Promise.resolve(queryResult).then(resolve, reject),
  };
  supabase.from.mockReturnValue(queryBuilder);
  return queryBuilder;
}

describe('chatService.fetchMessages', () => {
  let warnSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('resolves chat image paths in a single createSignedUrls batch call', async () => {
    mockMessagesQueryResult([
      { id: '2', created_at: '2026-03-02T10:00:00.000Z', image_path: 'new.jpg', image_url: null },
      { id: '1', created_at: '2026-03-01T10:00:00.000Z', image_path: 'old.jpg', image_url: null },
    ]);

    const createSignedUrls = jest.fn().mockResolvedValue({
      data: [
        { signedUrl: 'https://cdn.example.com/old.jpg' },
        { signedUrl: 'https://cdn.example.com/new.jpg' },
      ],
      error: null,
    });
    const createSignedUrl = jest.fn();
    supabase.storage.from.mockReturnValue({ createSignedUrls, createSignedUrl });

    const { messages } = await fetchMessages('user-1');

    expect(createSignedUrls).toHaveBeenCalledWith(['old.jpg', 'new.jpg'], 60 * 60);
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(messages.map((msg) => msg.image_url)).toEqual([
      'https://cdn.example.com/old.jpg',
      'https://cdn.example.com/new.jpg',
    ]);
  });

  it('falls back to per-image signing when createSignedUrls fails', async () => {
    mockMessagesQueryResult([
      {
        id: '3',
        created_at: '2026-03-03T10:00:00.000Z',
        image_path: 'photo-a.jpg',
        image_url: null,
      },
      {
        id: '2',
        created_at: '2026-03-02T10:00:00.000Z',
        image_path: 'photo-b.jpg',
        image_url: 'https://legacy.example.com/photo-b.jpg',
      },
      {
        id: '1',
        created_at: '2026-03-01T10:00:00.000Z',
        image_path: 'photo-a.jpg',
        image_url: null,
      },
    ]);

    const createSignedUrls = jest.fn().mockResolvedValue({
      data: null,
      error: new Error('Batch signing unavailable'),
    });
    const createSignedUrl = jest.fn().mockImplementation((path) => {
      if (path === 'photo-b.jpg') {
        return Promise.resolve({ data: null, error: new Error('Missing object') });
      }
      return Promise.resolve({
        data: { signedUrl: `https://cdn.example.com/${path}` },
        error: null,
      });
    });
    supabase.storage.from.mockReturnValue({ createSignedUrls, createSignedUrl });

    const { messages } = await fetchMessages('user-1');

    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrl).toHaveBeenCalledTimes(2); // deduped unique paths
    expect(messages.map((msg) => msg.image_url)).toEqual([
      'https://cdn.example.com/photo-a.jpg',
      'https://legacy.example.com/photo-b.jpg',
      'https://cdn.example.com/photo-a.jpg',
    ]);
  });
});
