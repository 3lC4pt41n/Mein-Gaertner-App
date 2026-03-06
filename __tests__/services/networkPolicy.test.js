import { requestWithPolicy } from '../../services/networkPolicy';

describe('networkPolicy.requestWithPolicy', () => {
  it('enforces timeout when a request ignores AbortSignal', async () => {
    await expect(
      requestWithPolicy(() => new Promise(() => {}), {
        timeout: 30,
        retries: 0,
        label: 'timeout-test',
      })
    ).rejects.toMatchObject({ name: 'TimeoutError', code: 'ETIMEDOUT' });
  });

  it('does not retry non-transient errors', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('Validation failed'));

    await expect(
      requestWithPolicy(fn, {
        timeout: 100,
        retries: 2,
        label: 'validation-test',
      })
    ).rejects.toThrow('Validation failed');

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
