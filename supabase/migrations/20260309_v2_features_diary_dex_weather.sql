-- ═══════════════════════════════════════════════════════════════════════════
-- V2 Features: Diary, Dex, Weather Location
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Plant Diary Table
-- Tracks user activities and observations for each plant
CREATE TABLE IF NOT EXISTS public.plant_diary (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plant_id UUID REFERENCES public.plants(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL DEFAULT 'manual' CHECK (type IN ('manual', 'healthcheck', 'task', 'discovery')),
  title TEXT,
  note TEXT,
  image_url TEXT,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient diary queries
CREATE INDEX IF NOT EXISTS idx_plant_diary_plant_id ON public.plant_diary(plant_id);
CREATE INDEX IF NOT EXISTS idx_plant_diary_user_id ON public.plant_diary(user_id);
CREATE INDEX IF NOT EXISTS idx_plant_diary_created_at ON public.plant_diary(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plant_diary_type ON public.plant_diary(type);

-- Enable Row Level Security for plant_diary
ALTER TABLE public.plant_diary ENABLE ROW LEVEL SECURITY;

-- Users can view their own diary entries
DO $$ BEGIN
  CREATE POLICY "Users can view own diary entries"
    ON public.plant_diary FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users can insert their own diary entries
DO $$ BEGIN
  CREATE POLICY "Users can insert own diary entries"
    ON public.plant_diary FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users can update their own diary entries
DO $$ BEGIN
  CREATE POLICY "Users can update own diary entries"
    ON public.plant_diary FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users can delete their own diary entries
DO $$ BEGIN
  CREATE POLICY "Users can delete own diary entries"
    ON public.plant_diary FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role bypass for edge functions
DO $$ BEGIN
  CREATE POLICY "Service role full access diary"
    ON public.plant_diary FOR ALL
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Extend species table for Dex features
-- ═══════════════════════════════════════════════════════════════════════════

-- Add image for Dex cards
ALTER TABLE public.species ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add description for Dex details
ALTER TABLE public.species ADD COLUMN IF NOT EXISTS description TEXT;

-- Add care summary (watering, light, temperature, etc.)
ALTER TABLE public.species ADD COLUMN IF NOT EXISTS care_summary JSONB DEFAULT '{}';

-- Track number of unique discoverers
ALTER TABLE public.species ADD COLUMN IF NOT EXISTS total_discoverers INTEGER DEFAULT 0;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Add location fields to profiles for weather features
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location_lat DOUBLE PRECISION;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location_lon DOUBLE PRECISION;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Update total_discoverers counter via trigger
-- ═══════════════════════════════════════════════════════════════════════════

-- Function to update the discoverer count whenever a discovery event is recorded
CREATE OR REPLACE FUNCTION public.update_species_discoverer_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.species
  SET total_discoverers = (
    SELECT COUNT(DISTINCT user_id)
    FROM public.discovery_events
    WHERE species_id = NEW.species_id
  )
  WHERE id = NEW.species_id;
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists and create new one
DROP TRIGGER IF EXISTS trg_update_discoverer_count ON public.discovery_events;
CREATE TRIGGER trg_update_discoverer_count
  AFTER INSERT ON public.discovery_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_species_discoverer_count();
