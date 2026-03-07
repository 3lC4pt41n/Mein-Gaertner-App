-- Ensure optional task note exists in all environments and refresh PostgREST schema cache.

ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS note TEXT;

-- Make PostgREST pick up the column immediately after migration deploy.
NOTIFY pgrst, 'reload schema';
