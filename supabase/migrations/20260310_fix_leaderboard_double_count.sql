-- =============================================================
-- Migration: Fix Leaderboard Double-Count Bug
-- Datum: 2026-03-10
-- Beschreibung: Fix Cartesian product bug in leaderboard_public view
--               by aggregating each event type separately before joining
-- =============================================================

BEGIN;

-- Drop the buggy view
DROP VIEW IF EXISTS public.leaderboard_public CASCADE;

-- Recreate leaderboard_public with proper aggregation
-- Separate CTEs for gardening and discovery events prevent Cartesian product
CREATE OR REPLACE VIEW public.leaderboard_public AS
WITH gardening_scores AS (
  -- Aggregate gardening events per user
  SELECT
    user_id,
    COALESCE(SUM(points) FILTER (WHERE created_at > now() - interval '7 days'), 0) as gardener_score_week,
    COALESCE(SUM(points) FILTER (WHERE created_at > now() - interval '30 days'), 0) as gardener_score_month,
    COALESCE(SUM(points), 0) as gardener_score_all
  FROM public.gardening_events
  GROUP BY user_id
),
discovery_scores AS (
  -- Aggregate discovery events per user
  -- 1 point per discovery + 5 bonus points for first discoveries
  SELECT
    user_id,
    COUNT(id) FILTER (WHERE created_at > now() - interval '7 days')
      + 5 * COUNT(id) FILTER (WHERE is_first AND created_at > now() - interval '7 days')
      as discovery_points_week,
    COUNT(id) FILTER (WHERE created_at > now() - interval '30 days')
      + 5 * COUNT(id) FILTER (WHERE is_first AND created_at > now() - interval '30 days')
      as discovery_points_month,
    COUNT(id) + 5 * COUNT(id) FILTER (WHERE is_first)
      as discovery_points_all
  FROM public.discovery_events
  GROUP BY user_id
)
SELECT
  p.id as user_id,
  COALESCE(p.public_display_name, p.username) as display_name,
  NULL::text as avatar_url,
  COALESCE(gs.gardener_score_week, 0) as gardener_score_week,
  COALESCE(gs.gardener_score_month, 0) as gardener_score_month,
  COALESCE(gs.gardener_score_all, 0) as gardener_score_all,
  COALESCE(ds.discovery_points_week, 0) as discovery_points_week,
  COALESCE(ds.discovery_points_month, 0) as discovery_points_month,
  COALESCE(ds.discovery_points_all, 0) as discovery_points_all
FROM public.profiles p
LEFT JOIN gardening_scores gs ON gs.user_id = p.id
LEFT JOIN discovery_scores ds ON ds.user_id = p.id
WHERE p.leaderboard_opt_in = true;

-- Leaderboard-View ist fuer authentifizierte User lesbar
GRANT SELECT ON public.leaderboard_public TO authenticated;

COMMIT;
