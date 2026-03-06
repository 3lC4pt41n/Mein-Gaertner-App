-- Add plant_type column to species for Dex category filtering
ALTER TABLE public.species
  ADD COLUMN IF NOT EXISTS plant_type text DEFAULT 'other';

COMMENT ON COLUMN public.species.plant_type IS 'Category: flower, tree, shrub, herb, succulent, vegetable, fruit, other';
