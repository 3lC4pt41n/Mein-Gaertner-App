-- =============================================================
-- Migration: Zentraler Pflanzen-Dex – Species Details Cache
-- Datum: 2026-03-22
-- Beschreibung:
--   Phase 1 des Architektur-Umbaus (ARCHITEKTUR_ANALYSE_PFLANZEN_DEX.md §8–9).
--   Universelle Pflanzen-Details werden einmalig pro Art/Sprache generiert
--   und zentral gecacht statt pro User-Plant-Instanz redundant.
--
--   Änderungen:
--   1. Neue Tabelle `species_details` für gecachte Art-Steckbriefe
--   2. Neue Spalte `plants.species_id` → FK auf species
--   3. Backfill plants.species_id über discovery_events (robuster Pfad)
--   4. Backfill species_details aus vorhandenen plants.details
--
--   Keine bestehenden Spalten oder Tabellen werden gelöscht/geändert.
--   Vollständig additiv → kein Datenverlust, keine Breaking Changes.
-- =============================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- 1. species_details: Zentrale Art-Steckbriefe pro Sprache
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.species_details (
  species_id      UUID NOT NULL REFERENCES public.species(id) ON DELETE CASCADE,
  language        TEXT NOT NULL CHECK (language IN ('de','en','fr','it','es','ru')),
  details         JSONB NOT NULL,
  model           TEXT,                          -- z.B. 'gpt-4o-2024-08-06'
  schema_version  INTEGER NOT NULL DEFAULT 1,    -- für spätere Schema-Updates
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by    TEXT NOT NULL DEFAULT 'ai'     -- 'ai' | 'seed' | 'manual' | 'backfill'
    CHECK (generated_by IN ('ai','seed','manual','backfill')),
  PRIMARY KEY (species_id, language)
);

ALTER TABLE public.species_details ENABLE ROW LEVEL SECURITY;

-- Lesbar für alle authentifizierten User (wie species selbst)
CREATE POLICY "Anyone can read species details"
  ON public.species_details FOR SELECT
  USING (true);

-- Schreiben nur service_role (Edge Functions)
CREATE POLICY "Service role writes species details"
  ON public.species_details FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- ═══════════════════════════════════════════════════════════════
-- 2. plants.species_id: Verknüpfung User-Pflanze → Art
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS species_id UUID REFERENCES public.species(id) ON DELETE SET NULL;

-- Index für JOINs PlantDetail → species_details
CREATE INDEX IF NOT EXISTS idx_plants_species_id
  ON public.plants(species_id)
  WHERE species_id IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════
-- 3. Backfill: plants.species_id über discovery_events
--    (robuster Pfad: discovery_events hat plant_id + species_id)
-- ═══════════════════════════════════════════════════════════════

UPDATE public.plants p
SET species_id = de.species_id
FROM (
  SELECT DISTINCT ON (plant_id)
    plant_id,
    species_id
  FROM public.discovery_events
  WHERE plant_id IS NOT NULL
  ORDER BY plant_id, created_at DESC
) de
WHERE p.id = de.plant_id
  AND p.species_id IS NULL;


-- ═══════════════════════════════════════════════════════════════
-- 4. Backfill: species_details aus vorhandenen plants.details
--    Nimmt pro Species den frühesten vorhandenen Steckbrief.
--    Sprache wird aus dem Profil des Erstentdeckers abgeleitet.
-- ═══════════════════════════════════════════════════════════════

INSERT INTO public.species_details (species_id, language, details, model, schema_version, generated_at, generated_by)
SELECT
  sub.species_id,
  COALESCE(prof.language, 'de') AS language,
  sub.details,
  'gpt-4o (backfill)',
  1,
  sub.created_at,
  'backfill'
FROM (
  -- Pro Species: früheste Plant mit vorhandenen Details
  SELECT DISTINCT ON (p.species_id)
    p.species_id,
    p.details,
    p.user_id,
    p.created_at
  FROM public.plants p
  WHERE p.species_id IS NOT NULL
    AND p.details IS NOT NULL
    AND p.details != 'null'::jsonb
    AND p.details != '{}'::jsonb
  ORDER BY p.species_id, p.created_at ASC
) sub
LEFT JOIN public.profiles prof ON prof.id = sub.user_id
ON CONFLICT (species_id, language) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════
-- 5. Verifizierung (nur Log, kein Rollback)
-- ═══════════════════════════════════════════════════════════════

-- Gibt die Backfill-Ergebnisse als NOTICE aus:
DO $$
DECLARE
  v_total_plants    INTEGER;
  v_linked_plants   INTEGER;
  v_cached_species  INTEGER;
  v_total_species   INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_plants FROM public.plants;
  SELECT COUNT(*) INTO v_linked_plants FROM public.plants WHERE species_id IS NOT NULL;
  SELECT COUNT(DISTINCT species_id) INTO v_cached_species FROM public.species_details;
  SELECT COUNT(*) INTO v_total_species FROM public.species;

  RAISE NOTICE '── Species Details Cache Migration ──';
  RAISE NOTICE 'Plants total:           %', v_total_plants;
  RAISE NOTICE 'Plants mit species_id:  % (%.0f%%)',
    v_linked_plants,
    CASE WHEN v_total_plants > 0
      THEN (v_linked_plants::numeric / v_total_plants * 100)
      ELSE 0
    END;
  RAISE NOTICE 'Species mit Cache:      % / %', v_cached_species, v_total_species;
END $$;

COMMIT;
