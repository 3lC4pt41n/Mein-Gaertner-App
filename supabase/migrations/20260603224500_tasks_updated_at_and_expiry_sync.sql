-- Keep the live tasks table aligned with the baseline schema and current RPCs.
-- complete_task_rpc writes updated_at; some live projects were missing the column.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.tasks
   SET updated_at = COALESCE(updated_at, created_at, now())
 WHERE updated_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_tasks_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON public.tasks;

CREATE TRIGGER trg_tasks_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.set_tasks_updated_at();

CREATE INDEX IF NOT EXISTS idx_tasks_user_state_due_at
  ON public.tasks (user_id, state, due_at);

NOTIFY pgrst, 'reload schema';
