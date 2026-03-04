-- =============================================================
-- Migration: Leaderboard Plant & Health Bonus
-- Datum: 2026-03-04
-- Beschreibung: Erweitert den Gärtner-Score um:
--   1. Pflanzen-Bonus: 0.5 Punkte pro aktive Pflanze
--   2. Health-Multiplikator: avg(latest_healthscore) / 80
--      (clamped 0.25 … 1.25, default 0 wenn kein Healthcheck)
--   Formel: (gardening_points + plant_bonus) × health_multiplier
-- =============================================================

BEGIN;

-- Drop existing view and dependent RPCs
DROP FUNCTION IF EXISTS public.get_my_rank(text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_my_neighbors(text, uuid, int) CASCADE;
DROP VIEW IF EXISTS public.leaderboard_public CASCADE;

-- Recreate leaderboard_public with plant & health bonus
CREATE OR REPLACE VIEW public.leaderboard_public AS
WITH gardening_scores AS (
  SELECT
    user_id,
    COALESCE(SUM(points) FILTER (WHERE created_at > now() - interval '7 days'), 0) as gardener_score_week,
    COALESCE(SUM(points) FILTER (WHERE created_at > now() - interval '30 days'), 0) as gardener_score_month,
    COALESCE(SUM(points), 0) as gardener_score_all
  FROM public.gardening_events
  GROUP BY user_id
),
discovery_scores AS (
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
),
plant_counts AS (
  -- Anzahl aktiver Pflanzen pro User
  SELECT user_id, COUNT(*) as plant_count
  FROM public.plants
  GROUP BY user_id
),
latest_healthscores AS (
  -- Letzter Healthcheck-Score pro Pflanze (via DISTINCT ON)
  SELECT DISTINCT ON (plant_id)
    plant_id, user_id, healthscore
  FROM public.plant_healthchecks
  ORDER BY plant_id, created_at DESC
),
avg_health AS (
  -- Durchschnittlicher Health-Score pro User (nur Pflanzen mit Healthcheck)
  -- Pflanzen ohne Healthcheck zählen als 0
  SELECT
    pl.user_id,
    -- Zähle alle Pflanzen, aber nur gecheckte haben einen Score > 0
    COALESCE(
      SUM(COALESCE(lh.healthscore, 0))::numeric / NULLIF(COUNT(pl.id), 0),
      0
    ) as avg_healthscore
  FROM public.plants pl
  LEFT JOIN latest_healthscores lh ON lh.plant_id = pl.id
  GROUP BY pl.user_id
),
health_multiplier AS (
  -- Multiplikator: avg_health / 80, clamped 0.25 … 1.25
  -- Kein Healthcheck → avg = 0 → multiplier = 0.25
  SELECT
    user_id,
    LEAST(1.25, GREATEST(0.25, COALESCE(avg_healthscore, 0) / 80.0)) as multiplier
  FROM avg_health
)
SELECT
  p.id as user_id,
  COALESCE(p.public_display_name, p.username) as display_name,
  NULL::text as avatar_url,
  -- Gardener Scores mit Plant-Bonus & Health-Multiplikator
  ROUND(
    (COALESCE(gs.gardener_score_week, 0) + COALESCE(pc.plant_count, 0) * 0.5)
    * COALESCE(hm.multiplier, 0.25)
  , 1)::numeric as gardener_score_week,
  ROUND(
    (COALESCE(gs.gardener_score_month, 0) + COALESCE(pc.plant_count, 0) * 0.5)
    * COALESCE(hm.multiplier, 0.25)
  , 1)::numeric as gardener_score_month,
  ROUND(
    (COALESCE(gs.gardener_score_all, 0) + COALESCE(pc.plant_count, 0) * 0.5)
    * COALESCE(hm.multiplier, 0.25)
  , 1)::numeric as gardener_score_all,
  -- Discovery Scores (unverändert)
  COALESCE(ds.discovery_points_week, 0) as discovery_points_week,
  COALESCE(ds.discovery_points_month, 0) as discovery_points_month,
  COALESCE(ds.discovery_points_all, 0) as discovery_points_all,
  -- Neue Bonus-Spalten für Transparenz im UI
  COALESCE(pc.plant_count, 0) as plant_count,
  ROUND(COALESCE(ah.avg_healthscore, 0), 1)::numeric as avg_health,
  ROUND(COALESCE(hm.multiplier, 0.25), 2)::numeric as health_multiplier
FROM public.profiles p
LEFT JOIN gardening_scores gs ON gs.user_id = p.id
LEFT JOIN discovery_scores ds ON ds.user_id = p.id
LEFT JOIN plant_counts pc ON pc.user_id = p.id
LEFT JOIN avg_health ah ON ah.user_id = p.id
LEFT JOIN health_multiplier hm ON hm.user_id = p.id
WHERE p.leaderboard_opt_in = true;

-- Grant access
GRANT SELECT ON public.leaderboard_public TO authenticated;

-- =============================================================
-- Recreate RPC functions (same logic, updated allowed_columns)
-- =============================================================

CREATE OR REPLACE FUNCTION public.get_my_rank(
  p_score_column text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  result jsonb;
  allowed_columns text[] := ARRAY[
    'gardener_score_week', 'gardener_score_month', 'gardener_score_all',
    'discovery_points_week', 'discovery_points_month', 'discovery_points_all'
  ];
BEGIN
  IF NOT (p_score_column = ANY(allowed_columns)) THEN
    RAISE EXCEPTION 'Invalid score column: %', p_score_column;
  END IF;

  EXECUTE format(
    $q$
    WITH ranked AS (
      SELECT
        user_id,
        %I AS score,
        dense_rank() OVER (ORDER BY %I DESC) AS rank
      FROM public.leaderboard_public
    ),
    total AS (
      SELECT count(*) AS cnt FROM public.leaderboard_public
    )
    SELECT jsonb_build_object(
      'rank', r.rank,
      'score', r.score,
      'total', t.cnt
    )
    FROM ranked r, total t
    WHERE r.user_id = $1
    LIMIT 1
    $q$,
    p_score_column, p_score_column
  ) INTO result USING p_user_id;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_neighbors(
  p_score_column text,
  p_user_id uuid,
  p_range int DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  result jsonb;
  allowed_columns text[] := ARRAY[
    'gardener_score_week', 'gardener_score_month', 'gardener_score_all',
    'discovery_points_week', 'discovery_points_month', 'discovery_points_all'
  ];
BEGIN
  IF NOT (p_score_column = ANY(allowed_columns)) THEN
    RAISE EXCEPTION 'Invalid score column: %', p_score_column;
  END IF;

  EXECUTE format(
    $q$
    WITH ranked AS (
      SELECT
        user_id,
        display_name,
        %I AS score,
        dense_rank() OVER (ORDER BY %I DESC) AS rank,
        row_number() OVER (ORDER BY %I DESC) AS rn
      FROM public.leaderboard_public
    ),
    me AS (
      SELECT rn FROM ranked WHERE user_id = $1 LIMIT 1
    )
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'user_id', r.user_id,
        'display_name', r.display_name,
        'score', r.score,
        'rank', r.rank,
        'isMe', (r.user_id = $1)
      ) ORDER BY r.rn
    ), '[]'::jsonb)
    FROM ranked r, me m
    WHERE r.rn BETWEEN (m.rn - $2) AND (m.rn + $2)
    $q$,
    p_score_column, p_score_column, p_score_column
  ) INTO result USING p_user_id, p_range;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_rank(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_neighbors(text, uuid, int) TO authenticated;

COMMIT;
