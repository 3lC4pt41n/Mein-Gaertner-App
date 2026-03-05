-- Fix: plant_healthchecks.id hat keinen DEFAULT → Insert ohne id schlägt fehl
-- Fehler: "null value in column 'id' of relation 'plant_healthchecks' violates not-null constraint"

ALTER TABLE public.plant_healthchecks
  ALTER COLUMN id SET DEFAULT gen_random_uuid();
