// utils/errorMessages.js – User-friendly error message helper
// Categorises raw API / network errors into localised, human-readable messages.

import { t } from '../i18n';

/**
 * Maps a raw error (string, Error, or object) to a user-friendly i18n message.
 *
 * @param {Error|string|object} error – The caught error
 * @returns {string} A localised, user-facing message
 */
export function friendlyError(error) {
  const msg = typeof error === 'string' ? error : (error?.message ?? '');
  const code = error?.code ?? error?.statusCode ?? error?.status ?? null;
  const lower = msg.toLowerCase();

  // ── Network / timeout ───────────────────────
  if (
    lower.includes('network') ||
    lower.includes('fetch') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('dns') ||
    lower.includes('internet') ||
    lower.includes('failed to send a request to the edge function')
  ) {
    return t('common.networkError');
  }

  if (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('aborted') ||
    code === 'ECONNABORTED'
  ) {
    return t('common.timeoutError');
  }

  // ── Auth ────────────────────────────────────
  if (
    code === 401 ||
    code === 'AUTH_REQUIRED' ||
    code === 'PGRST301' ||
    lower.includes('jwt') ||
    lower.includes('token expired') ||
    lower.includes('invalid token') ||
    lower.includes('refresh token') ||
    lower.includes('access token') ||
    lower.includes('unauthorized') ||
    lower.includes('not authenticated') ||
    lower.includes('session')
  ) {
    return t('common.authError');
  }

  // ── Permission ──────────────────────────────
  if (code === 403 || lower.includes('forbidden') || lower.includes('permission')) {
    return t('common.permissionError');
  }

  // ── Validation / input ─────────────────────
  if (
    code === 400 ||
    lower.includes('ungültige eingabe') ||
    lower.includes('invalid input') ||
    lower.includes('base64') ||
    lower.includes('image_url')
  ) {
    return msg || t('common.unknownError');
  }

  // ── Rate limit ─────────────────────────────
  if (code === 429 || lower.includes('rate limit') || lower.includes('zu viele anfragen')) {
    return msg || t('common.timeoutError');
  }

  // ── Not found ───────────────────────────────
  if (code === 404 || lower.includes('not found') || lower.includes('does not exist')) {
    return t('common.notFoundError');
  }

  // ── Server error ────────────────────────────
  if (
    (typeof code === 'number' && code >= 500) ||
    lower.includes('server') ||
    lower.includes('internal') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('504')
  ) {
    return t('common.serverError');
  }

  // ── Credits ─────────────────────────────────
  if (code === 'INSUFFICIENT_CREDITS' || lower.includes('insufficient credits')) {
    return t('common.insufficientCredits');
  }

  // ── Fallback ────────────────────────────────
  if (msg && !lower.includes('non-2xx') && !lower.includes('[object object]')) {
    return msg;
  }
  return t('common.unknownError');
}
