-- =============================================================
-- Migration: Scores & Leaderboard (v3)
-- Datum: 2026-03-02
-- Beschreibung: Event-basiertes Scoring + DSGVO-Opt-in Leaderboard
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 1. Tabelle: species (Referenztabelle fuer Pflanzenarten)
-- -------------------------------------------------------------
CREATE TABLE public.species (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text UNIQUE NOT NULL,
  first_discovered_by uuid REFERENCES auth.users(id),
  first_discovered_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.species ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read species" ON public.species FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert species" ON public.species FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- -------------------------------------------------------------
-- 2. Tabelle: discovery_events (Append-only Event-Log)
-- -------------------------------------------------------------
CREATE TABLE public.discovery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  species_id uuid NOT NULL REFERENCES public.species(id),
  plant_id uuid,
  is_first boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Max 1 Discovery pro Species/User
CREATE UNIQUE INDEX idx_discovery_user_species
  ON public.discovery_events (user_id, species_id);

ALTER TABLE public.discovery_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert own discoveries" ON public.discovery_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own discoveries" ON public.discovery_events FOR SELECT USING (auth.uid() = user_id);

-- -------------------------------------------------------------
-- 3. Tabelle: gardening_events (Append-only Event-Log)
-- -------------------------------------------------------------
CREATE TABLE public.gardening_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  event_type text NOT NULL CHECK (event_type IN (
    'task_completed_on_time', 'task_completed_late',
    'task_skipped', 'healthcheck_logged', 'plant_added'
  )),
  plant_id uuid,
  task_id uuid,
  points numeric NOT NULL,
  meta jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_gardening_user_created ON public.gardening_events (user_id, created_at);
ALTER TABLE public.gardening_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert own events" ON public.gardening_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own events" ON public.gardening_events FOR SELECT USING (auth.uid() = user_id);

-- -------------------------------------------------------------
-- 4. Erweiterung: profiles (Leaderboard-Opt-in)
-- -------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS leaderboard_opt_in boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS public_display_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS leaderboard_visibility text DEFAULT 'private'
  CHECK (leaderboard_visibility IN ('global', 'friends', 'private'));

-- -------------------------------------------------------------
-- 5. View: leaderboard_public (nur Opt-in-User, aggregiert)
-- -------------------------------------------------------------
CREATE OR REPLACE VIEW public.leaderboard_public AS
SELECT
  p.id as user_id,
  COALESCE(p.public_display_name, p.username) as display_name,
  NULL::text as avatar_url,
  COALESCE(SUM(g.points) FILTER (WHERE g.created_at > now() - interval '7 days'), 0) as gardener_score_week,
  COALESCE(SUM(g.points) FILTER (WHERE g.created_at > now() - interval '30 days'), 0) as gardener_score_month,
  COALESCE(SUM(g.points), 0) as gardener_score_all,
  COUNT(d.id) FILTER (WHERE d.created_at > now() - interval '7 days')
    + 5 * COUNT(d.id) FILTER (WHERE d.is_first AND d.created_at > now() - interval '7 days') as discovery_points_week,
  COUNT(d.id) FILTER (WHERE d.created_at > now() - interval '30 days')
    + 5 * COUNT(d.id) FILTER (WHERE d.is_first AND d.created_at > now() - interval '30 days') as discovery_points_month,
  COUNT(d.id) + 5 * COUNT(d.id) FILTER (WHERE d.is_first) as discovery_points_all
FROM public.profiles p
LEFT JOIN public.gardening_events g ON g.user_id = p.id
LEFT JOIN public.discovery_events d ON d.user_id = p.id
WHERE p.leaderboard_opt_in = true
GROUP BY p.id, p.public_display_name, p.username;

-- Leaderboard-View ist fuer authentifizierte User lesbar
GRANT SELECT ON public.leaderboard_public TO authenticated;

COMMIT;
