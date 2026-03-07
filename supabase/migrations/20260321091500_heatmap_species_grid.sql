-- P2 / FEAT-3: Species-specific heatmap aggregation for Dex detail view.
-- Privacy-safe: only opt-in users, only grid-level coordinates.

BEGIN;

CREATE OR REPLACE VIEW public.heatmap_species_grid AS
SELECT
  de.species_id,
  floor(de.latitude / 0.01)::int * 0.01 AS grid_lat,
  floor(de.longitude / 0.01)::int * 0.01 AS grid_lon,
  count(*)::int AS discovery_count,
  count(*) FILTER (WHERE de.is_first)::int AS first_discoveries
FROM public.discovery_events de
JOIN public.profiles p ON p.id = de.user_id
WHERE de.latitude IS NOT NULL
  AND de.longitude IS NOT NULL
  AND p.heatmap_opt_in = true
GROUP BY de.species_id, grid_lat, grid_lon;

ALTER VIEW public.heatmap_species_grid SET (security_invoker = on);
GRANT SELECT ON public.heatmap_species_grid TO authenticated;

CREATE INDEX IF NOT EXISTS idx_discovery_events_species_location
  ON public.discovery_events (species_id, latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

COMMIT;
