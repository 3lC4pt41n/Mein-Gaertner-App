-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Convert German task type strings to language-neutral codes
-- ═══════════════════════════════════════════════════════════════════════════
-- Old values: 'Gießen', 'Düngen', 'Umtopfen', 'Healthcheck', 'Sonstiges'
-- New values: 'watering', 'fertilizing', 'repotting', 'healthcheck', 'other'
--
-- This migration:
--   1. Backfills existing rows in tasks + task_templates
--   2. Backfills gardening_events.event_type where applicable
--   3. Does NOT drop the old values (backward compatible)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Backfill tasks table ──────────────────────────────────────────────
UPDATE public.tasks SET type = 'watering'    WHERE type = 'Gießen';
UPDATE public.tasks SET type = 'fertilizing' WHERE type = 'Düngen';
UPDATE public.tasks SET type = 'repotting'   WHERE type = 'Umtopfen';
UPDATE public.tasks SET type = 'healthcheck' WHERE type = 'Healthcheck';
UPDATE public.tasks SET type = 'other'       WHERE type = 'Sonstiges';

-- ── 2. Backfill task_templates table (if exists) ─────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'task_templates') THEN
    UPDATE public.task_templates SET type = 'watering'    WHERE type = 'Gießen';
    UPDATE public.task_templates SET type = 'fertilizing' WHERE type = 'Düngen';
    UPDATE public.task_templates SET type = 'repotting'   WHERE type = 'Umtopfen';
    UPDATE public.task_templates SET type = 'healthcheck' WHERE type = 'Healthcheck';
    UPDATE public.task_templates SET type = 'other'       WHERE type = 'Sonstiges';
  END IF;
END $$;

-- ── 3. Backfill gardening_events.event_type ──────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'gardening_events') THEN
    UPDATE public.gardening_events SET event_type = 'task_watering'    WHERE event_type = 'task_Gießen';
    UPDATE public.gardening_events SET event_type = 'task_fertilizing' WHERE event_type = 'task_Düngen';
    UPDATE public.gardening_events SET event_type = 'task_repotting'   WHERE event_type = 'task_Umtopfen';
    UPDATE public.gardening_events SET event_type = 'task_healthcheck' WHERE event_type = 'task_Healthcheck';
    UPDATE public.gardening_events SET event_type = 'task_other'       WHERE event_type = 'task_Sonstiges';
  END IF;
END $$;
