-- Fix: Trigger function needs SECURITY DEFINER to bypass RLS on species table.
-- The species table only has SELECT and INSERT policies for authenticated users,
-- but the trigger needs to UPDATE total_discoverers.
-- Without SECURITY DEFINER, the trigger silently failed and all counts stayed 0.

CREATE OR REPLACE FUNCTION public.update_species_discoverer_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Backfill: correct all existing total_discoverers counts
UPDATE public.species s
SET total_discoverers = (
  SELECT COUNT(DISTINCT de.user_id)
  FROM public.discovery_events de
  WHERE de.species_id = s.id
);
