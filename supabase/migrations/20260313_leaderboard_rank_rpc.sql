-- =============================================================
-- Migration: Leaderboard Rank RPC Functions
-- Datum: 2026-03-13
-- Beschreibung: Server-seitige dense_rank Berechnung statt
--               Full-Table-Scan im Client.
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 1. get_my_rank(score_column, p_user_id)
--    Returns: { rank, score, total }
--    Uses dense_rank() window function – no full table scan needed
--    on the client.
--    SECURITY: SET search_path = '' prevents search_path hijacking
--    in SECURITY DEFINER context (CWE-340 / Supabase best practice).
-- -------------------------------------------------------------
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
  -- Guard against SQL injection: only allow known column names
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

  RETURN result;  -- NULL if user not found
END;
$$;

-- -------------------------------------------------------------
-- 2. get_my_neighbors(score_column, p_user_id, p_range)
--    Returns: array of { user_id, display_name, score, rank, is_me }
--    Fetches ±range rows around the caller's position.
--    SECURITY: SET search_path = '' (same rationale as get_my_rank).
-- -------------------------------------------------------------
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

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_my_rank(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_neighbors(text, uuid, int) TO authenticated;

COMMIT;
