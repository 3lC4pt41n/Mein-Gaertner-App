-- =============================================================
-- DSGVO: Cascade-Delete bei Account-Löschung
-- Datum: 2026-03-02
-- Wenn ein User gelöscht wird, werden alle zugehörigen Events
-- und Discovery-Daten automatisch mitgelöscht.
-- =============================================================

-- 1. gardening_events: ON DELETE CASCADE
ALTER TABLE public.gardening_events
  DROP CONSTRAINT IF EXISTS gardening_events_user_id_fkey;
ALTER TABLE public.gardening_events
  ADD CONSTRAINT gardening_events_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. discovery_events: ON DELETE CASCADE
ALTER TABLE public.discovery_events
  DROP CONSTRAINT IF EXISTS discovery_events_user_id_fkey;
ALTER TABLE public.discovery_events
  ADD CONSTRAINT discovery_events_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. species.first_discovered_by: SET NULL bei Löschung (Species bleiben erhalten)
ALTER TABLE public.species
  DROP CONSTRAINT IF EXISTS species_first_discovered_by_fkey;
ALTER TABLE public.species
  ADD CONSTRAINT species_first_discovered_by_fkey
  FOREIGN KEY (first_discovered_by) REFERENCES auth.users(id) ON DELETE SET NULL;
