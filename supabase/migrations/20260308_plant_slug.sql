-- Eindeutiger Slug fuer Pflanzen (z.B. "monstera-deliciosa-a3f2")
-- Ermoeglicht stabile IDs fuer zukuenftige Sharing-URLs
ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS slug TEXT;

-- Unique pro User (gleicher User darf keinen doppelten Slug haben)
CREATE UNIQUE INDEX IF NOT EXISTS idx_plants_user_slug
  ON public.plants(user_id, slug)
  WHERE slug IS NOT NULL;
