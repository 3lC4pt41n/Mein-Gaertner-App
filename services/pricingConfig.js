// pricingConfig.js — Single source of truth for AI credit costs
// ────────────────────────────────────────────────────────────
// All screens and services that display or check AI costs MUST
// import from here. Never hardcode credit amounts elsewhere.

export const AI_COSTS = {
  scan: 12,
  details: 15,
  healthcheck: 8,
  chat: 3,
};
