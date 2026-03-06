/**
 * Shared Network Resilience Layer
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides a unified `requestWithPolicy` wrapper for all network calls.
 *
 * Features:
 *   - Configurable timeout (AbortController)
 *   - Exponential backoff with jitter for transient failures
 *   - Retries on 5xx, network errors, and timeouts (NOT on 4xx)
 *   - Clean abort on component unmount / navigation
 *
 * Usage:
 *   import { requestWithPolicy } from './networkPolicy';
 *
 *   const data = await requestWithPolicy(() => fetch(url, opts));
 *   const data = await requestWithPolicy(() => supabase.functions.invoke(...));
 *   const data = await requestWithPolicy(fn, { timeout: 30000, retries: 2 });
 * ─────────────────────────────────────────────────────────────────────────────
 */

const DEFAULT_TIMEOUT = 15000; // 15 seconds
const DEFAULT_RETRIES = 2; // 2 retries = 3 total attempts
const BASE_DELAY = 1000; // 1 second base for exponential backoff
const MAX_DELAY = 8000; // 8 second cap

/**
 * Determines if an error is transient and worth retrying.
 * @param {Error} error
 * @returns {boolean}
 */
function isTransient(error) {
  if (!error) return false;

  // Abort/timeout
  if (error.name === 'AbortError' || error.name === 'TimeoutError' || error.code === 'ETIMEDOUT') {
    return true;
  }

  // Network errors (fetch failures, DNS, etc.)
  const msg = (error.message || '').toLowerCase();
  if (
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('aborted') ||
    msg.includes('failed to fetch') ||
    msg.includes('econnreset') ||
    msg.includes('enotfound')
  ) {
    return true;
  }

  // HTTP 5xx from Supabase functions (error.status or parsed)
  if (error.status >= 500) return true;

  return false;
}

/**
 * Calculates delay with exponential backoff + jitter.
 * @param {number} attempt - Current attempt (0-indexed)
 * @returns {number} Delay in ms
 */
function getDelay(attempt) {
  const exponential = BASE_DELAY * Math.pow(2, attempt);
  const jitter = Math.random() * BASE_DELAY;
  return Math.min(exponential + jitter, MAX_DELAY);
}

function createTimeoutError(timeout, label) {
  const err = new Error(`[${label}] Request timed out after ${timeout}ms`);
  err.name = 'TimeoutError';
  err.code = 'ETIMEDOUT';
  err.timeout = timeout;
  return err;
}

/**
 * Sleep helper that can be aborted.
 * @param {number} ms
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        },
        { once: true }
      );
    }
  });
}

/**
 * Execute an async function with timeout, retry, and abort support.
 *
 * @param {Function} fn - Async function to execute. Receives { signal } as argument
 *   so callers can forward the AbortSignal to fetch() or other APIs.
 * @param {Object} [options]
 * @param {number} [options.timeout=15000] - Timeout per attempt in ms
 * @param {number} [options.retries=2] - Number of retries (0 = no retry)
 * @param {AbortSignal} [options.signal] - External abort signal (e.g. from component unmount)
 * @param {string} [options.label] - Label for logging (e.g. 'aiService.chat')
 * @returns {Promise<*>} Result of fn()
 * @throws {Error} Last error after all attempts exhausted
 */
export async function requestWithPolicy(fn, options = {}) {
  const {
    timeout = DEFAULT_TIMEOUT,
    retries = DEFAULT_RETRIES,
    signal: externalSignal,
    label = 'request',
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    let timeoutId;
    let timedOut = false;

    if (externalSignal?.aborted) {
      throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
    }
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

    try {
      // Hard-timeout works even when downstream clients ignore AbortSignal.
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(createTimeoutError(timeout, label));
        }, timeout);
      });

      const requestPromise = Promise.resolve().then(() => fn({ signal: controller.signal }));
      const result = await Promise.race([requestPromise, timeoutPromise]);
      return result;
    } catch (error) {
      const normalizedError =
        timedOut && error?.name === 'AbortError' ? createTimeoutError(timeout, label) : error;
      lastError = normalizedError;

      // Don't retry if externally aborted
      if (externalSignal?.aborted) {
        throw error;
      }

      // Don't retry non-transient errors (4xx, auth, etc.)
      if (!isTransient(normalizedError) || attempt >= retries) {
        throw normalizedError;
      }

      // Backoff before retry
      const delay = getDelay(attempt);
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log(
          `[networkPolicy] ${label} attempt ${attempt + 1} failed, retrying in ${Math.round(delay)}ms...`
        );
      }
      await sleep(delay, externalSignal);
    } finally {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }
  }

  throw lastError;
}

/**
 * Wraps a fetch() call with the network policy.
 * Convenience for plain HTTP calls (weather, etc.).
 *
 * @param {string} url
 * @param {RequestInit} [fetchOptions]
 * @param {Object} [policyOptions] - Same as requestWithPolicy options
 * @returns {Promise<Response>} fetch Response (caller must check .ok / .json())
 */
export async function fetchWithPolicy(url, fetchOptions = {}, policyOptions = {}) {
  return requestWithPolicy(
    ({ signal }) => {
      return fetch(url, { ...fetchOptions, signal });
    },
    { label: url.split('?')[0].split('/').pop(), ...policyOptions }
  );
}
