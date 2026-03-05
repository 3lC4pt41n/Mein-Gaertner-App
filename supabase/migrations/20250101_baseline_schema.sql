-- =============================================================
-- BASELINE SCHEMA: Core tables that predate the migration system
-- =============================================================
-- These tables were created via Supabase Dashboard before
-- migrations were adopted. This file ensures a clean
-- `supabase db reset` can recreate the full schema.
--
-- All statements are idempotent (IF NOT EXISTS / DO $$ ... $$).
-- =============================================================

-- ── 1. profiles ─────────────────────────────────────────────
-- Created by Supabase's handle_new_user trigger on auth.users.
-- Extended later by many migrations (admin, leaderboard, etc.)
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username      TEXT,
  first_name    TEXT,
  last_name     TEXT,
  language      TEXT DEFAULT 'de',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read/update their own profile
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'profiles_self_select' AND tablename = 'profiles'
  ) THEN
    CREATE POLICY profiles_self_select ON public.profiles
      FOR SELECT USING (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'profiles_self_update' AND tablename = 'profiles'
  ) THEN
    CREATE POLICY profiles_self_update ON public.profiles
      FOR UPDATE USING (auth.uid() = id);
  END IF;
END $$;

-- handle_new_user: auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, language)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data ->> 'language', 'de')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 2. plants ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  note        TEXT,
  image_url   TEXT,
  details     JSONB,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.plants ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'plants_self_all' AND tablename = 'plants'
  ) THEN
    CREATE POLICY plants_self_all ON public.plants
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_plants_user_id ON public.plants(user_id);

-- ── 3. tasks ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plant_id    UUID,
  type        TEXT NOT NULL,
  title       TEXT,
  note        TEXT,
  due_at      TIMESTAMPTZ,
  state       TEXT DEFAULT 'DUE',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'tasks_self_all' AND tablename = 'tasks'
  ) THEN
    CREATE POLICY tasks_self_all ON public.tasks
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_plant_id ON public.tasks(plant_id);

-- ── 4. messages (chat history) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content     TEXT,
  image_url   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'messages_self_all' AND tablename = 'messages'
  ) THEN
    CREATE POLICY messages_self_all ON public.messages
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_messages_user_id ON public.messages(user_id);

-- ── 5. plant_healthchecks ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plant_healthchecks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id        UUID NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  healthscore     INTEGER,
  summary         TEXT,
  table_json      JSONB,
  recommendation  TEXT,
  image_url       TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.plant_healthchecks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'healthchecks_self_all' AND tablename = 'plant_healthchecks'
  ) THEN
    CREATE POLICY healthchecks_self_all ON public.plant_healthchecks
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_healthchecks_plant_id ON public.plant_healthchecks(plant_id);
CREATE INDEX IF NOT EXISTS idx_healthchecks_user_id ON public.plant_healthchecks(user_id);

-- =============================================================
-- END BASELINE
-- =============================================================
