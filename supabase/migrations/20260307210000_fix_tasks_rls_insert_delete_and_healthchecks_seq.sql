-- Fix 1: Add missing INSERT policy for tasks
-- Users can create tasks for themselves (user_id must match auth.uid())
CREATE POLICY "User can insert own tasks"
  ON public.tasks
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Fix 2: Add missing DELETE policy for tasks
-- Users can delete their own tasks
CREATE POLICY "User can delete own tasks"
  ON public.tasks
  FOR DELETE
  USING (user_id = auth.uid());

-- Fix 3: Reset plant_healthchecks sequence to match actual max id
-- Prevents "duplicate key value violates unique constraint" errors
SELECT setval('plant_healthchecks_id_seq', (SELECT COALESCE(MAX(id), 0) FROM public.plant_healthchecks));
