-- ============================================================
-- Fix: Zones RLS Policy reparieren
-- Problem: INSERT wird durch fehlende/fehlerhafte Policy blockiert
-- ============================================================

-- 1) Alle bestehenden Policies auf zones entfernen
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'zones' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.zones', pol.policyname);
  END LOOP;
END $$;

-- 2) RLS sicher aktiviert
ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;

-- 3) Separate Policies für jede Operation (robuster als FOR ALL)

-- SELECT: User darf Zonen sehen, die zu eigenen Locations gehören
CREATE POLICY "zones_select_own"
  ON public.zones FOR SELECT
  USING (
    location_id IN (
      SELECT id FROM public.locations WHERE user_id = auth.uid()
    )
  );

-- INSERT: User darf Zonen nur für eigene Locations anlegen
CREATE POLICY "zones_insert_own"
  ON public.zones FOR INSERT
  WITH CHECK (
    location_id IN (
      SELECT id FROM public.locations WHERE user_id = auth.uid()
    )
  );

-- UPDATE: User darf eigene Zonen bearbeiten
CREATE POLICY "zones_update_own"
  ON public.zones FOR UPDATE
  USING (
    location_id IN (
      SELECT id FROM public.locations WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    location_id IN (
      SELECT id FROM public.locations WHERE user_id = auth.uid()
    )
  );

-- DELETE: User darf eigene Zonen löschen
CREATE POLICY "zones_delete_own"
  ON public.zones FOR DELETE
  USING (
    location_id IN (
      SELECT id FROM public.locations WHERE user_id = auth.uid()
    )
  );
