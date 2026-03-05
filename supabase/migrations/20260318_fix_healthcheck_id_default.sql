-- Fix: plant_healthchecks.id hat keinen DEFAULT → Insert ohne id schlägt fehl
-- Fehler: "null value in column 'id' of relation 'plant_healthchecks' violates not-null constraint"
--
-- Die Spalte kann je nach DB-Stand entweder UUID oder BIGINT sein.
-- Wir prüfen den Typ und setzen den passenden Default.

DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'plant_healthchecks'
     AND column_name   = 'id';

  IF col_type = 'uuid' THEN
    ALTER TABLE public.plant_healthchecks
      ALTER COLUMN id SET DEFAULT gen_random_uuid();
  ELSIF col_type = 'bigint' THEN
    -- Für bigint: Sequence erstellen falls nötig, dann als Default setzen
    IF NOT EXISTS (
      SELECT 1 FROM pg_class WHERE relname = 'plant_healthchecks_id_seq'
    ) THEN
      CREATE SEQUENCE public.plant_healthchecks_id_seq
        AS bigint OWNED BY public.plant_healthchecks.id;
      -- Setze den Startwert auf den aktuell höchsten Wert + 1
      PERFORM setval(
        'public.plant_healthchecks_id_seq',
        COALESCE((SELECT MAX(id) FROM public.plant_healthchecks), 0)
      );
    END IF;
    ALTER TABLE public.plant_healthchecks
      ALTER COLUMN id SET DEFAULT nextval('public.plant_healthchecks_id_seq');
  END IF;
END $$;
