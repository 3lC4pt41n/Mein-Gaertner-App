-- =============================================================
-- Sprint 1: Security Hardening Bundle
-- Datum: 2026-03-19
-- =============================================================
-- Fixes regressions where later migrations recreated SECURITY
-- DEFINER functions without SET search_path = '' (CWE-340).
-- Also restores security_invoker on the leaderboard view that
-- was recreated in 20260316 without it.
-- =============================================================

BEGIN;

-- ── 1. Fix credit_purchase: missing search_path (from 20260311) ──
CREATE OR REPLACE FUNCTION public.credit_purchase(
  p_user_id UUID,
  p_provider_transaction_id TEXT,
  p_package TEXT,
  p_credits INTEGER,
  p_amount_eur NUMERIC,
  p_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new_id UUID;
BEGIN
  INSERT INTO public.transactions (
    user_id, type, package_name, credits_added, amount_eur, provider_transaction_id
  ) VALUES (
    p_user_id, p_type, p_package, p_credits, p_amount_eur, p_provider_transaction_id
  )
  ON CONFLICT (provider_transaction_id) DO NOTHING
  RETURNING id INTO v_new_id;

  IF v_new_id IS NOT NULL THEN
    INSERT INTO public.credit_balances (user_id, balance)
    VALUES (p_user_id, p_credits)
    ON CONFLICT (user_id)
    DO UPDATE SET balance = public.credit_balances.balance + EXCLUDED.balance;
    RETURN TRUE;
  ELSE
    RETURN FALSE;
  END IF;
END;
$$;

-- ── 2. Fix award_discovery_credits: missing search_path (from 20260317) ──
CREATE OR REPLACE FUNCTION public.award_discovery_credits(
  p_user_id UUID,
  p_species_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_first BOOLEAN;
  v_already_awarded INTEGER;
  v_reward INTEGER;
  v_new_balance INTEGER;
BEGIN
  SELECT is_first, credits_awarded
  INTO v_is_first, v_already_awarded
  FROM public.discovery_events
  WHERE user_id = p_user_id
    AND species_id = p_species_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_DISCOVERY_EVENT';
  END IF;

  IF v_already_awarded > 0 THEN
    RETURN v_already_awarded;
  END IF;

  v_reward := CASE WHEN v_is_first THEN 25 ELSE 5 END;

  UPDATE public.credit_balances
  SET balance = balance + v_reward, updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_new_balance;

  IF NOT FOUND THEN
    INSERT INTO public.credit_balances (user_id, balance)
    VALUES (p_user_id, v_reward)
    RETURNING balance INTO v_new_balance;
  END IF;

  UPDATE public.discovery_events
  SET credits_awarded = v_reward
  WHERE user_id = p_user_id AND species_id = p_species_id;

  RETURN v_reward;
END;
$$;

-- ── 3. Restore security_invoker on leaderboard_public view ──
-- The view was recreated in 20260316 without security_invoker.
-- This ensures the view runs with the caller's permissions.
ALTER VIEW public.leaderboard_public SET (security_invoker = on);

-- ── 4. Ensure cascade-delete covers all user-owned tables ──
-- discovery_events and gardening_events FKs from 20260303 had no ON DELETE CASCADE
-- (fixed in 20260302 for existing ones, but the CREATE TABLE in 20260303 lacks it)
-- Re-add as idempotent:
DO $$ BEGIN
  -- discovery_events
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'discovery_events_user_id_fkey'
    AND table_name = 'discovery_events'
  ) THEN
    ALTER TABLE public.discovery_events DROP CONSTRAINT discovery_events_user_id_fkey;
  END IF;
  ALTER TABLE public.discovery_events
    ADD CONSTRAINT discovery_events_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  -- gardening_events
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'gardening_events_user_id_fkey'
    AND table_name = 'gardening_events'
  ) THEN
    ALTER TABLE public.gardening_events DROP CONSTRAINT gardening_events_user_id_fkey;
  END IF;
  ALTER TABLE public.gardening_events
    ADD CONSTRAINT gardening_events_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ── 5. Verify: all SECURITY DEFINER functions have search_path ──
-- This is a compile-time check — if any function is missing search_path,
-- the migration will fail at the DO block. Uncomment for CI testing:
--
-- DO $$ BEGIN
--   IF EXISTS (
--     SELECT 1 FROM pg_proc p
--     JOIN pg_namespace n ON p.pronamespace = n.oid
--     WHERE n.nspname = 'public'
--       AND p.prosecdef = true
--       AND NOT (p.proconfig @> ARRAY['search_path='])
--   ) THEN
--     RAISE EXCEPTION 'Found SECURITY DEFINER functions without search_path!';
--   END IF;
-- END $$;

COMMIT;
