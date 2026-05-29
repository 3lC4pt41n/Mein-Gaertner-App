-- Fix heatmap visibility across users without exposing raw discovery rows.
--
-- The heatmap views can be affected by caller RLS semantics. These RPCs run as
-- SECURITY DEFINER and return only opt-in, grid-aggregated data.

BEGIN;

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
  WHERE de.latitude IS NOT NULL
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
  WHERE de.species_id = p_species_id
    AND de.latitude IS NOT NULL
    AND de.longitude IS NOT NULL
    AND p.heatmap_opt_in = true
  GROUP BY 1, 2
  ORDER BY 3 DESC, 1, 2;
$$;

REVOKE ALL ON FUNCTION public.get_heatmap_grid() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_heatmap_species_grid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_heatmap_grid() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_heatmap_species_grid(uuid) TO authenticated;

COMMIT;
