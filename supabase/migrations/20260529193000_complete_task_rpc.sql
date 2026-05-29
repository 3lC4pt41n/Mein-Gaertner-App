-- =============================================================
-- Migration: Task-Completion als zentrale RPC
-- Datum: 2026-05-29
-- Beschreibung:
--   1. task_run-Tabelle fuer Completion-Historie absichern
--   2. complete_task_rpc(task_id) mit UI-Paritaet bereitstellen
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 1. Task-Run-Historie
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.task_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('completed', 'skipped')),
  details jsonb DEFAULT '{}',
  ts timestamptz DEFAULT now()
);

ALTER TABLE public.task_run
  ADD COLUMN IF NOT EXISTS details jsonb DEFAULT '{}';

ALTER TABLE public.task_run
  ADD COLUMN IF NOT EXISTS ts timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_task_run_task_id ON public.task_run(task_id);
CREATE INDEX IF NOT EXISTS idx_task_run_user_id ON public.task_run(user_id);

ALTER TABLE public.task_run ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own task runs"
    ON public.task_run FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own task runs"
    ON public.task_run FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role full access task runs"
    ON public.task_run FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -------------------------------------------------------------
-- 2. Atomare Task-Completion
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_task_rpc(p_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_task public.tasks%ROWTYPE;
  v_template public.task_templates%ROWTYPE;
  v_weight numeric := 1;
  v_late boolean := false;
  v_points numeric := 1;
  v_event_type text := 'task_completed_on_time';
  v_next_due timestamptz;
  v_dedupe_key text;
  v_recurring_created boolean := false;
BEGIN
  SELECT *
    INTO v_task
    FROM public.tasks
   WHERE id = p_task_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task not found.');
  END IF;

  IF coalesce(auth.role(), '') <> 'service_role' AND v_task.user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task not found.');
  END IF;

  IF v_task.state <> 'DUE' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_completed', true,
      'task_id', v_task.id,
      'state', v_task.state
    );
  END IF;

  UPDATE public.tasks
     SET state = 'COMPLETED',
         updated_at = now()
   WHERE id = p_task_id
     AND state = 'DUE'
   RETURNING *
    INTO v_task;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_completed', true,
      'task_id', p_task_id
    );
  END IF;

  INSERT INTO public.task_run (task_id, action, user_id)
  VALUES (v_task.id, 'completed', v_task.user_id);

  v_weight := CASE lower(v_task.type)
    WHEN 'fertilizing' THEN 2
    WHEN 'düngen' THEN 2
    WHEN 'dungen' THEN 2
    WHEN 'repotting' THEN 3
    WHEN 'umtopfen' THEN 3
    ELSE 1
  END;

  v_late := v_task.due_at IS NOT NULL AND v_task.due_at < now();
  v_event_type := CASE WHEN v_late THEN 'task_completed_late' ELSE 'task_completed_on_time' END;
  v_points := CASE WHEN v_late THEN 0.4 * v_weight ELSE 1.0 * v_weight END;

  INSERT INTO public.gardening_events (
    user_id,
    event_type,
    plant_id,
    task_id,
    points,
    meta
  )
  VALUES (
    v_task.user_id,
    v_event_type,
    v_task.plant_id,
    v_task.id,
    v_points,
    jsonb_build_object('task_type', v_task.type, 'weight', v_weight, 'late', v_late)
  );

  IF v_task.plant_id IS NOT NULL THEN
    INSERT INTO public.plant_diary (
      plant_id,
      user_id,
      type,
      title,
      note,
      meta
    )
    VALUES (
      v_task.plant_id,
      v_task.user_id,
      'task',
      'Aufgabe erledigt: ' || v_task.type,
      v_task.note,
      jsonb_build_object('task_type', v_task.type, 'late', v_late)
    );
  END IF;

  IF v_task.template_id IS NOT NULL THEN
    SELECT *
      INTO v_template
      FROM public.task_templates
     WHERE id = v_task.template_id
       AND active = true;

    IF FOUND THEN
      v_next_due := greatest(coalesce(v_task.due_at, now()), now())
        + make_interval(days => v_template.interval_days);
      v_dedupe_key := v_template.id::text || ':' || to_char(v_next_due AT TIME ZONE 'UTC', 'YYYY-MM-DD');

      BEGIN
        INSERT INTO public.tasks (
          user_id,
          plant_id,
          type,
          due_at,
          state,
          template_id,
          dedupe_key,
          note
        )
        VALUES (
          v_task.user_id,
          v_template.plant_id,
          v_template.type,
          v_next_due,
          'DUE',
          v_template.id,
          v_dedupe_key,
          'Alle ' || v_template.interval_days::text || ' Tage'
        );
        v_recurring_created := true;
      EXCEPTION WHEN unique_violation THEN
        v_recurring_created := false;
      END;

      UPDATE public.task_templates
         SET next_due_at = v_next_due
       WHERE id = v_template.id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'task_id', v_task.id,
    'points', v_points,
    'event_type', v_event_type,
    'late', v_late,
    'recurring_next_due_at', v_next_due,
    'recurring_task_created', v_recurring_created
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_task_rpc(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_task_rpc(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.complete_task_rpc(uuid)
  IS 'Markiert einen DUE-Task atomar als erledigt und erzeugt Run-Log, Score, Diary sowie ggf. den naechsten Recurring-Task.';

COMMIT;
