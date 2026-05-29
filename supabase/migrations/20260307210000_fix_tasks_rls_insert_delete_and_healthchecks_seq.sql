-- Fix 1: Add missing INSERT policy for tasks
-- Users can create tasks for themselves (user_id must match auth.uid())
DO $$ BEGIN
  CREATE POLICY "User can insert own tasks"
    ON public.tasks
    FOR INSERT
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Fix 2: Add missing DELETE policy for tasks
-- Users can delete their own tasks
DO $$ BEGIN
  CREATE POLICY "User can delete own tasks"
    ON public.tasks
    FOR DELETE
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Fix 3: Reset plant_healthchecks sequence to match actual max id
-- Prevents "duplicate key value violates unique constraint" errors
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'plant_healthchecks_id_seq') THEN
    PERFORM setval('plant_healthchecks_id_seq', (SELECT COALESCE(MAX(id), 0) FROM public.plant_healthchecks));
  END IF;
END $$;
