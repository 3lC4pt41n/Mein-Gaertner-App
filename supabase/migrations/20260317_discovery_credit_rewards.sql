-- Credit-Belohnung für Neuentdeckungen
-- 25 CR für Welt-Erstentdeckung, 5 CR für persönliche Erstentdeckung
-- Sichere RPC-Funktion: prüft dass discovery_event existiert und noch nicht belohnt wurde

-- Spalte um doppelte Belohnung zu verhindern
ALTER TABLE public.discovery_events
  ADD COLUMN IF NOT EXISTS credits_awarded INTEGER DEFAULT 0;

-- Sichere Funktion: nur echte, noch nicht belohnte Entdeckungen werden belohnt
CREATE OR REPLACE FUNCTION public.award_discovery_credits(
  p_user_id UUID,
  p_species_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_first BOOLEAN;
  v_already_awarded INTEGER;
  v_reward INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- 1. Discovery-Event prüfen (muss existieren und dem User gehören)
  SELECT is_first, credits_awarded
  INTO v_is_first, v_already_awarded
  FROM public.discovery_events
  WHERE user_id = p_user_id
    AND species_id = p_species_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_DISCOVERY_EVENT';
  END IF;

  -- 2. Bereits belohnt? → Abbrechen
  IF v_already_awarded > 0 THEN
    RETURN v_already_awarded;
  END IF;

  -- 3. Belohnung berechnen
  v_reward := CASE WHEN v_is_first THEN 25 ELSE 5 END;

  -- 4. Credits gutschreiben
  UPDATE public.credit_balances
  SET balance = balance + v_reward,
      updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_new_balance;

  -- Falls kein credit_balances-Eintrag existiert, anlegen
  IF NOT FOUND THEN
    INSERT INTO public.credit_balances (user_id, balance)
    VALUES (p_user_id, v_reward)
    RETURNING balance INTO v_new_balance;
  END IF;

  -- 5. Als belohnt markieren
  UPDATE public.discovery_events
  SET credits_awarded = v_reward
  WHERE user_id = p_user_id
    AND species_id = p_species_id;

  RETURN v_reward;
END;
$$;

-- Authenticated Users dürfen die Funktion aufrufen
GRANT EXECUTE ON FUNCTION public.award_discovery_credits(UUID, UUID) TO authenticated;
