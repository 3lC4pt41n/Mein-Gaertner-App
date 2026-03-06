-- F3a: Location data for world heatmap
-- Adds GPS coordinates to discovery_events and heatmap opt-in to profiles.
-- Coordinates are captured at the moment of plant discovery (foreground only).
-- Privacy: raw coords are never exposed to other users; only grid-aggregated data.

-- 1. Extend discovery_events with location
ALTER TABLE public.discovery_events
  ADD COLUMN IF NOT EXISTS latitude  numeric(9,6),
  ADD COLUMN IF NOT EXISTS longitude numeric(9,6);

COMMENT ON COLUMN public.discovery_events.latitude  IS 'GPS lat at time of discovery (nullable — old or permission-denied entries)';
COMMENT ON COLUMN public.discovery_events.longitude IS 'GPS lon at time of discovery (nullable — old or permission-denied entries)';

-- 2. Heatmap opt-in on profiles (DSGVO: default OFF)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS heatmap_opt_in boolean DEFAULT false;

COMMENT ON COLUMN public.profiles.heatmap_opt_in IS 'User consent to show anonymised discovery locations on world heatmap';

-- 3. Privacy-safe aggregated view (grid ~1.1 km cells)
-- floor(lat/0.01)*0.01 groups into ~1.1 km N-S strips
CREATE OR REPLACE VIEW public.heatmap_grid AS
SELECT
  floor(de.latitude  / 0.01)::int * 0.01 AS grid_lat,
  floor(de.longitude / 0.01)::int * 0.01 AS grid_lon,
  count(*)::int                           AS discovery_count,
  count(DISTINCT de.species_id)::int      AS species_count,
  count(*) FILTER (WHERE de.is_first)::int AS first_discoveries
FROM public.discovery_events de
JOIN public.profiles p ON p.id = de.user_id
WHERE de.latitude IS NOT NULL
  AND de.longitude IS NOT NULL
  AND p.heatmap_opt_in = true
GROUP BY grid_lat, grid_lon;

-- 4. RLS: heatmap_grid is a view on top of already-protected tables.
--    Grant read access to authenticated users only.
GRANT SELECT ON public.heatmap_grid TO authenticated;

-- 5. Index for spatial queries on discovery_events
CREATE INDEX IF NOT EXISTS idx_discovery_events_location
  ON public.discovery_events (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
