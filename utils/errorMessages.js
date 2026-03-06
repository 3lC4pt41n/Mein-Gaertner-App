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
    lower.includes('internet')
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
    code === 'PGRST301' ||
    lower.includes('jwt') ||
    lower.includes('token') ||
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
  return t('common.unknownError');
}
