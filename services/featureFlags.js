/**
 * Centralized Feature Flags
 * ─────────────────────────────────────────────────────────────────────────────
 * All gated product features are controlled from this single file.
 * This avoids scattered hardcoded booleans in individual screens.
 *
 * To enable a feature: set its flag to `true` and implement the required
 * backend/migration support before shipping.
 *
 * To add a new flag: add it here and import from this module.
 */

// ── Account Deletion ─────────────────────────────────────────────────────────
// Requires: profiles.deleted_at column migration, backend cascade-delete or
// recovery flow, session cleanup, and a proper UX confirmation dialog.
// Status: NOT IMPLEMENTED — intentionally removed in v1.0 to avoid
// shipping a half-baked destructive action.
// Ticket: n/a (re-evaluate post-launch)

// ── Terms of Service Link ────────────────────────────────────────────────────
// Published at: https://3lc4pt41n.github.io/Mein-Gaertner-App/terms.html
// Status: LIVE — enabled for store submission.
export const SHOW_TERMS_LINK = true;
