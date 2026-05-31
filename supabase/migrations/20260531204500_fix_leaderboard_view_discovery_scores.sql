-- Fix leaderboard_public for legacy clients that still read the view directly.
--
-- Context:
-- leaderboard_public is security_invoker=true, so direct SELECTs run underlying
-- discovery_events aggregations with the caller's RLS scope. That is privacy-safe,
-- but it makes other users' discovery scores appear as 0.
--
-- Public ranking data is intended to be aggregated and opt-in only. Raw discovery
-- coordinates and user-owned rows stay protected; the SECURITY DEFINER helper below
-- returns only aggregate leaderboard fields.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_leaderboard_public_rows()
RETURNS TABLE (
  user_id uuid,
  display_name text,
  avatar_url text,
  gardener_score_week numeric,
  gardener_score_month numeric,
  gardener_score_all numeric,
  discovery_points_week bigint,
  discovery_points_month bigint,
  discovery_points_all bigint,
  plant_count bigint,
  avg_health numeric,
  health_multiplier numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  WITH gardening_scores AS (
    SELECT
      user_id,
      COALESCE(SUM(points) FILTER (WHERE created_at > now() - interval '7 days'), 0)::numeric AS gardener_score_week,
      COALESCE(SUM(points) FILTER (WHERE created_at > now() - interval '30 days'), 0)::numeric AS gardener_score_month,
      COALESCE(SUM(points), 0)::numeric AS gardener_score_all
    FROM public.gardening_events
    GROUP BY user_id
  ),
  discovery_scores AS (
    SELECT
      user_id,
      (
        COUNT(id) FILTER (WHERE created_at > now() - interval '7 days')
        + 5 * COUNT(id) FILTER (WHERE is_first AND created_at > now() - interval '7 days')
      )::bigint AS discovery_points_week,
      (
        COUNT(id) FILTER (WHERE created_at > now() - interval '30 days')
        + 5 * COUNT(id) FILTER (WHERE is_first AND created_at > now() - interval '30 days')
      )::bigint AS discovery_points_month,
      (COUNT(id) + 5 * COUNT(id) FILTER (WHERE is_first))::bigint AS discovery_points_all
    FROM public.discovery_events
    GROUP BY user_id
  ),
  plant_counts AS (
    SELECT user_id, COUNT(*)::bigint AS plant_count
    FROM public.plants
    GROUP BY user_id
  ),
  latest_healthscores AS (
    SELECT DISTINCT ON (plant_id)
      plant_id,
      user_id,
      healthscore
    FROM public.plant_healthchecks
    ORDER BY plant_id, created_at DESC
  ),
  avg_health AS (
    SELECT
      pl.user_id,
      COALESCE(
        SUM(COALESCE(lh.healthscore, 0))::numeric / NULLIF(COUNT(pl.id), 0),
        0
      ) AS avg_healthscore
    FROM public.plants pl
    LEFT JOIN latest_healthscores lh ON lh.plant_id = pl.id
    GROUP BY pl.user_id
  ),
  health_multiplier AS (
    SELECT
      user_id,
      LEAST(1.25, GREATEST(0.25, COALESCE(avg_healthscore, 0) / 80.0)) AS multiplier
    FROM avg_health
  )
  SELECT
    p.id AS user_id,
    COALESCE(p.public_display_name, p.username) AS display_name,
    NULL::text AS avatar_url,
    ROUND(
      (COALESCE(gs.gardener_score_week, 0) + COALESCE(pc.plant_count, 0) * 0.5)
      * COALESCE(hm.multiplier, 0.25),
      1
    )::numeric AS gardener_score_week,
    ROUND(
      (COALESCE(gs.gardener_score_month, 0) + COALESCE(pc.plant_count, 0) * 0.5)
      * COALESCE(hm.multiplier, 0.25),
      1
    )::numeric AS gardener_score_month,
    ROUND(
      (COALESCE(gs.gardener_score_all, 0) + COALESCE(pc.plant_count, 0) * 0.5)
      * COALESCE(hm.multiplier, 0.25),
      1
    )::numeric AS gardener_score_all,
    COALESCE(ds.discovery_points_week, 0)::bigint AS discovery_points_week,
    COALESCE(ds.discovery_points_month, 0)::bigint AS discovery_points_month,
    COALESCE(ds.discovery_points_all, 0)::bigint AS discovery_points_all,
    COALESCE(pc.plant_count, 0)::bigint AS plant_count,
    ROUND(COALESCE(ah.avg_healthscore, 0), 1)::numeric AS avg_health,
    ROUND(COALESCE(hm.multiplier, 0.25), 2)::numeric AS health_multiplier
  FROM public.profiles p
  LEFT JOIN gardening_scores gs ON gs.user_id = p.id
  LEFT JOIN discovery_scores ds ON ds.user_id = p.id
  LEFT JOIN plant_counts pc ON pc.user_id = p.id
  LEFT JOIN avg_health ah ON ah.user_id = p.id
  LEFT JOIN health_multiplier hm ON hm.user_id = p.id
  WHERE p.leaderboard_opt_in = true;
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard_public_rows() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_public_rows() TO authenticated;

CREATE OR REPLACE VIEW public.leaderboard_public AS
SELECT
  user_id,
  display_name,
  avatar_url,
  gardener_score_week,
  gardener_score_month,
  gardener_score_all,
  discovery_points_week,
  discovery_points_month,
  discovery_points_all,
  plant_count,
  avg_health,
  health_multiplier
FROM public.get_leaderboard_public_rows();

ALTER VIEW public.leaderboard_public SET (security_invoker = on);
GRANT SELECT ON public.leaderboard_public TO authenticated;

CREATE OR REPLACE FUNCTION public.get_leaderboard_public(
  p_score_column text DEFAULT 'gardener_score_week',
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  avatar_url text,
  gardener_score_week numeric,
  gardener_score_month numeric,
  gardener_score_all numeric,
  discovery_points_week numeric,
  discovery_points_month numeric,
  discovery_points_all numeric,
  plant_count numeric,
  avg_health numeric,
  health_multiplier numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  allowed_columns text[] := ARRAY[
    'gardener_score_week',
    'gardener_score_month',
    'gardener_score_all',
    'discovery_points_week',
    'discovery_points_month',
    'discovery_points_all'
  ];
  safe_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
  IF NOT (p_score_column = ANY(allowed_columns)) THEN
    RAISE EXCEPTION 'Invalid score column: %', p_score_column;
  END IF;

  RETURN QUERY EXECUTE format(
    $q$
    SELECT
      user_id,
      display_name,
      avatar_url,
      gardener_score_week,
      gardener_score_month,
      gardener_score_all,
      discovery_points_week::numeric AS discovery_points_week,
      discovery_points_month::numeric AS discovery_points_month,
      discovery_points_all::numeric AS discovery_points_all,
      plant_count::numeric AS plant_count,
      avg_health,
      health_multiplier
    FROM public.get_leaderboard_public_rows()
    ORDER BY %I DESC, display_name ASC
    LIMIT $1
    $q$,
    p_score_column
  ) USING safe_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard_public(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_public(text, integer) TO authenticated;

COMMIT;
