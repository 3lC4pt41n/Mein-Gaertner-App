-- Web uploads may resolve/link species, but they must not count as discoveries.
-- This migration marks true discovery events by source and hardens aggregates,
-- credits, heatmaps, and leaderboard scoring to mobile discoveries only.

BEGIN;

ALTER TABLE public.discovery_events
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'mobile';

COMMENT ON COLUMN public.discovery_events.source IS
  'Discovery source: mobile events are true discoveries; web/manual are non-scoring/non-location.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'discovery_events_source_valid'
      AND conrelid = 'public.discovery_events'::regclass
  ) THEN
    ALTER TABLE public.discovery_events
      ADD CONSTRAINT discovery_events_source_valid
      CHECK (source IN ('mobile', 'web', 'manual')) NOT VALID;
  END IF;
END $$;

ALTER TABLE public.discovery_events VALIDATE CONSTRAINT discovery_events_source_valid;

-- The original unique index blocked any event source. Keep uniqueness only for
-- mobile discoveries so an accidental non-scoring web/manual event cannot block
-- a later real mobile discovery for the same user/species.
DROP INDEX IF EXISTS public.idx_discovery_user_species;
CREATE UNIQUE INDEX IF NOT EXISTS idx_discovery_user_species_mobile
  ON public.discovery_events (user_id, species_id)
  WHERE source = 'mobile';

CREATE INDEX IF NOT EXISTS idx_discovery_events_mobile_location
  ON public.discovery_events (latitude, longitude)
  WHERE source = 'mobile' AND latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sanitize_discovery_event_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_has_mobile_first boolean;
BEGIN
  NEW.source := COALESCE(NULLIF(NEW.source, ''), 'mobile');

  IF NEW.source <> 'mobile' THEN
    NEW.is_first := false;
    NEW.latitude := NULL;
    NEW.longitude := NULL;
    NEW.credits_awarded := 0;
  ELSIF NEW.is_first IS TRUE THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.discovery_events de
      WHERE de.species_id = NEW.species_id
        AND de.source = 'mobile'
        AND de.is_first IS TRUE
        AND (TG_OP = 'INSERT' OR de.id <> NEW.id)
    )
    INTO v_has_mobile_first;

    IF v_has_mobile_first THEN
      NEW.is_first := false;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sanitize_discovery_event_source ON public.discovery_events;
CREATE TRIGGER trg_sanitize_discovery_event_source
  BEFORE INSERT OR UPDATE OF source, is_first, latitude, longitude, credits_awarded
  ON public.discovery_events
  FOR EACH ROW
  EXECUTE FUNCTION public.sanitize_discovery_event_source();

CREATE OR REPLACE FUNCTION public.update_species_discoverer_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.source = 'mobile' AND NEW.is_first IS TRUE THEN
    UPDATE public.species
    SET
      first_discovered_by = COALESCE(first_discovered_by, NEW.user_id),
      first_discovered_at = COALESCE(first_discovered_at, NEW.created_at)
    WHERE id = NEW.species_id;
  END IF;

  UPDATE public.species
  SET total_discoverers = (
    SELECT COUNT(DISTINCT user_id)
    FROM public.discovery_events
    WHERE species_id = NEW.species_id
      AND source = 'mobile'
  )
  WHERE id = NEW.species_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_discoverer_count ON public.discovery_events;
CREATE TRIGGER trg_update_discoverer_count
  AFTER INSERT OR UPDATE OF source
  ON public.discovery_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_species_discoverer_count();

UPDATE public.species s
SET total_discoverers = (
  SELECT COUNT(DISTINCT de.user_id)
  FROM public.discovery_events de
  WHERE de.species_id = s.id
    AND de.source = 'mobile'
);

UPDATE public.species s
SET
  first_discovered_by = first_mobile.user_id,
  first_discovered_at = first_mobile.created_at
FROM (
  SELECT DISTINCT ON (species_id)
    species_id,
    user_id,
    created_at
  FROM public.discovery_events
  WHERE source = 'mobile'
    AND is_first IS TRUE
  ORDER BY species_id, created_at ASC
) first_mobile
WHERE s.id = first_mobile.species_id
  AND s.first_discovered_by IS NULL;

CREATE OR REPLACE FUNCTION public.award_discovery_credits(
  p_user_id UUID,
  p_species_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_first BOOLEAN;
  v_already_awarded INTEGER;
  v_reward INTEGER;
  v_new_balance INTEGER;
BEGIN
  SELECT is_first, COALESCE(credits_awarded, 0)
  INTO v_is_first, v_already_awarded
  FROM public.discovery_events
  WHERE user_id = p_user_id
    AND species_id = p_species_id
    AND source = 'mobile';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_MOBILE_DISCOVERY_EVENT';
  END IF;

  IF v_already_awarded > 0 THEN
    RETURN v_already_awarded;
  END IF;

  v_reward := CASE WHEN v_is_first THEN 25 ELSE 5 END;

  UPDATE public.credit_balances
  SET balance = balance + v_reward, updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_new_balance;

  IF NOT FOUND THEN
    INSERT INTO public.credit_balances (user_id, balance)
    VALUES (p_user_id, v_reward)
    RETURNING balance INTO v_new_balance;
  END IF;

  UPDATE public.discovery_events
  SET credits_awarded = v_reward
  WHERE user_id = p_user_id
    AND species_id = p_species_id
    AND source = 'mobile';

  RETURN v_reward;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_heatmap_grid()
RETURNS TABLE (
  grid_lat numeric,
  grid_lon numeric,
  discovery_count integer,
  species_count integer,
  first_discoveries integer
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT
    floor(de.latitude / 0.01)::int * 0.01 AS grid_lat,
    floor(de.longitude / 0.01)::int * 0.01 AS grid_lon,
    count(*)::int AS discovery_count,
    count(DISTINCT de.species_id)::int AS species_count,
    count(*) FILTER (WHERE de.is_first)::int AS first_discoveries
  FROM public.discovery_events de
  JOIN public.profiles p ON p.id = de.user_id
  WHERE de.source = 'mobile'
    AND de.latitude IS NOT NULL
    AND de.longitude IS NOT NULL
    AND p.heatmap_opt_in = true
  GROUP BY 1, 2
  ORDER BY 3 DESC, 1, 2;
$$;

CREATE OR REPLACE FUNCTION public.get_heatmap_species_grid(p_species_id uuid)
RETURNS TABLE (
  grid_lat numeric,
  grid_lon numeric,
  discovery_count integer,
  first_discoveries integer
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT
    floor(de.latitude / 0.01)::int * 0.01 AS grid_lat,
    floor(de.longitude / 0.01)::int * 0.01 AS grid_lon,
    count(*)::int AS discovery_count,
    count(*) FILTER (WHERE de.is_first)::int AS first_discoveries
  FROM public.discovery_events de
  JOIN public.profiles p ON p.id = de.user_id
  WHERE de.source = 'mobile'
    AND de.species_id = p_species_id
    AND de.latitude IS NOT NULL
    AND de.longitude IS NOT NULL
    AND p.heatmap_opt_in = true
  GROUP BY 1, 2
  ORDER BY 3 DESC, 1, 2;
$$;

CREATE OR REPLACE VIEW public.heatmap_grid AS
SELECT
  floor(de.latitude / 0.01)::int * 0.01 AS grid_lat,
  floor(de.longitude / 0.01)::int * 0.01 AS grid_lon,
  count(*)::int AS discovery_count,
  count(DISTINCT de.species_id)::int AS species_count,
  count(*) FILTER (WHERE de.is_first)::int AS first_discoveries
FROM public.discovery_events de
JOIN public.profiles p ON p.id = de.user_id
WHERE de.source = 'mobile'
  AND de.latitude IS NOT NULL
  AND de.longitude IS NOT NULL
  AND p.heatmap_opt_in = true
GROUP BY grid_lat, grid_lon;

CREATE OR REPLACE VIEW public.heatmap_species_grid AS
SELECT
  de.species_id,
  floor(de.latitude / 0.01)::int * 0.01 AS grid_lat,
  floor(de.longitude / 0.01)::int * 0.01 AS grid_lon,
  count(*)::int AS discovery_count,
  count(*) FILTER (WHERE de.is_first)::int AS first_discoveries
FROM public.discovery_events de
JOIN public.profiles p ON p.id = de.user_id
WHERE de.source = 'mobile'
  AND de.latitude IS NOT NULL
  AND de.longitude IS NOT NULL
  AND p.heatmap_opt_in = true
GROUP BY de.species_id, grid_lat, grid_lon;

ALTER VIEW public.heatmap_grid SET (security_invoker = on);
ALTER VIEW public.heatmap_species_grid SET (security_invoker = on);
GRANT SELECT ON public.heatmap_grid TO authenticated;
GRANT SELECT ON public.heatmap_species_grid TO authenticated;

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
    WHERE source = 'mobile'
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

REVOKE ALL ON FUNCTION public.award_discovery_credits(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_heatmap_grid() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_heatmap_species_grid(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_leaderboard_public_rows() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_discovery_credits(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_heatmap_grid() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_heatmap_species_grid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_public_rows() TO authenticated;

COMMIT;
