-- =============================================================
-- Migration: Task-Engine v2 – Recurring Tasks & State-Fix
-- Datum: 2026-02-26
-- Beschreibung:
--   1. Neue Tabelle task_templates (wiederkehrende Aufgaben)
--   2. tasks-Tabelle um template_id + dedupe_key erweitern
--   3. PENDING → DUE State-Fix (UI erwartet DUE)
--   4. RLS-Policies für task_templates
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 1. Tabelle: task_templates (ein Template pro Pflanze+Typ)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plant_id uuid NOT NULL,
  type text NOT NULL,
  interval_days int NOT NULL CHECK (interval_days > 0),
  next_due_at timestamptz NOT NULL,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  -- Pro User+Pflanze+Typ max. 1 aktives Template
  UNIQUE (user_id, plant_id, type)
);

CREATE INDEX IF NOT EXISTS idx_task_templates_user_active
  ON public.task_templates (user_id) WHERE active = true;

-- RLS für task_templates
ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own templates"
  ON public.task_templates FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- -------------------------------------------------------------
-- 2. tasks-Tabelle erweitern
-- -------------------------------------------------------------
-- Verknüpfung zu Template (NULL = einmalige Aufgabe)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.task_templates(id) ON DELETE SET NULL;

-- Dedupe-Key verhindert doppelte Recurring-Tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS dedupe_key text;

-- Unique-Constraint für dedupe (nur wenn nicht NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_dedupe_key
  ON public.tasks (dedupe_key) WHERE dedupe_key IS NOT NULL;

-- Index für Template-Lookup (offene Tasks pro Template)
CREATE INDEX IF NOT EXISTS idx_tasks_template_state
  ON public.tasks (template_id, state) WHERE template_id IS NOT NULL;

-- -------------------------------------------------------------
-- 3. State-Fix: PENDING → DUE
-- Begründung: createTask() setzt 'PENDING', aber die UI
-- zeigt Buttons nur bei state='DUE'. Tasks waren nie klickbar.
-- -------------------------------------------------------------
UPDATE public.tasks SET state = 'DUE' WHERE state = 'PENDING';

COMMIT;
