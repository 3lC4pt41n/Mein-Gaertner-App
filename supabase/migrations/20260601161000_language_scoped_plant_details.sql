-- ============================================================
-- Language-scoped plant details
-- ============================================================
-- User-visible plant details must not leak across app languages.
-- `species_details` remains the shared species cache. `plant_details`
-- stores the user's per-plant snapshot per language.

BEGIN;

-- The app supports Turkish; older species_details constraints predate that locale.
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.species_details'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%language%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.species_details DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.species_details
  ADD CONSTRAINT species_details_language_check
  CHECK (language IN ('de','en','fr','it','es','ru','tr'));

CREATE TABLE IF NOT EXISTS public.plant_details (
  plant_id      UUID NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  language      TEXT NOT NULL CHECK (language IN ('de','en','fr','it','es','ru','tr')),
  species_id    UUID REFERENCES public.species(id) ON DELETE SET NULL,
  details       JSONB NOT NULL,
  source        TEXT NOT NULL DEFAULT 'ai'
    CHECK (source IN ('ai','species_cache','backfill','manual')),
  model         TEXT,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (plant_id, language)
);

ALTER TABLE public.plant_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plant_details_self_select ON public.plant_details;
CREATE POLICY plant_details_self_select
  ON public.plant_details FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS plant_details_self_insert ON public.plant_details;
CREATE POLICY plant_details_self_insert
  ON public.plant_details FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS plant_details_self_update ON public.plant_details;
CREATE POLICY plant_details_self_update
  ON public.plant_details FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS plant_details_self_delete ON public.plant_details;
CREATE POLICY plant_details_self_delete
  ON public.plant_details FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_plant_details_user_language
  ON public.plant_details(user_id, language);

CREATE INDEX IF NOT EXISTS idx_plant_details_species_language
  ON public.plant_details(species_id, language)
  WHERE species_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.update_plant_details_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_plant_details_updated_at ON public.plant_details;
CREATE TRIGGER trg_plant_details_updated_at
  BEFORE UPDATE ON public.plant_details
  FOR EACH ROW EXECUTE FUNCTION public.update_plant_details_updated_at();

-- Best-effort legacy backfill from plants.details. Language is inferred from
-- localized schema keys first and from the current profile language only as a fallback.
INSERT INTO public.plant_details (
  plant_id,
  user_id,
  language,
  species_id,
  details,
  source,
  generated_at,
  updated_at
)
SELECT
  p.id,
  p.user_id,
  CASE
    WHEN (p.details->'overview') ? 'Deutscher Name'
      OR (p.details->'overview') ? 'Botanischer Name' THEN 'de'
    WHEN (p.details->'overview') ? 'Common Name'
      OR (p.details->'overview') ? 'Botanical Name' THEN 'en'
    WHEN (p.details->'overview') ? 'Nom commun'
      OR (p.details->'overview') ? 'Nom botanique' THEN 'fr'
    WHEN (p.details->'overview') ? 'Nome comune'
      OR (p.details->'overview') ? 'Nome botanico' THEN 'it'
    WHEN (p.details->'overview') ? 'Nombre común'
      OR (p.details->'overview') ? 'Nombre comun'
      OR (p.details->'overview') ? 'Nombre botánico' THEN 'es'
    WHEN (p.details->'overview') ? 'Народное название'
      OR (p.details->'overview') ? 'Ботаническое название' THEN 'ru'
    WHEN (p.details->'overview') ? 'Yaygın Ad'
      OR (p.details->'overview') ? 'Yaygın ad'
      OR (p.details->'overview') ? 'Botanik Ad' THEN 'tr'
    WHEN lower(trim(coalesce(prof.language, ''))) IN ('de','deutsch','german') THEN 'de'
    WHEN lower(trim(coalesce(prof.language, ''))) IN ('en','english','englisch') THEN 'en'
    WHEN lower(trim(coalesce(prof.language, ''))) IN ('fr','francais','français','french','franzoesisch','französisch') THEN 'fr'
    WHEN lower(trim(coalesce(prof.language, ''))) IN ('it','italian','italiano','italienisch') THEN 'it'
    WHEN lower(trim(coalesce(prof.language, ''))) IN ('es','espanol','español','spanish','spanisch') THEN 'es'
    WHEN lower(trim(coalesce(prof.language, ''))) IN ('ru','russian','русский','russisch') THEN 'ru'
    WHEN lower(trim(coalesce(prof.language, ''))) IN ('tr','turkish','türkçe','türkisch') THEN 'tr'
    ELSE 'de'
  END,
  p.species_id,
  p.details,
  'backfill',
  coalesce(p.created_at, now()),
  coalesce(p.created_at, now())
FROM public.plants p
LEFT JOIN public.profiles prof ON prof.id = p.user_id
WHERE p.details IS NOT NULL
  AND p.details != 'null'::jsonb
  AND p.details != '{}'::jsonb
  AND EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = p.user_id
  )
ON CONFLICT (plant_id, language) DO NOTHING;

COMMIT;
