-- Fix: PostgREST kann die Beziehung tasks → plants nicht auflösen,
-- weil der FK-Constraint bei der ursprünglichen Migration nicht angelegt wurde
-- (CREATE TABLE IF NOT EXISTS hat übersprungen, da Tabelle schon existierte).

-- 1. FK-Constraint nachholen (nur wenn noch nicht vorhanden)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tasks_plant_id_fkey'
      AND table_name = 'tasks'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_plant_id_fkey
      FOREIGN KEY (plant_id) REFERENCES public.plants(id) ON DELETE CASCADE;
    RAISE NOTICE 'FK tasks_plant_id_fkey angelegt';
  ELSE
    RAISE NOTICE 'FK tasks_plant_id_fkey existiert bereits';
  END IF;
END $$;

-- 2. PostgREST Schema-Cache neu laden
NOTIFY pgrst, 'reload schema';
