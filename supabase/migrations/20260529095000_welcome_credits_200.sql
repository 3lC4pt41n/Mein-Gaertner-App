-- =============================================================
-- Migration: Increase beta welcome credits to 200
-- Datum: 2026-05-29
-- =============================================================
-- Existing users are intentionally not topped up here. This migration
-- changes the signup trigger for future users only.
-- =============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user_credits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.credit_balances (user_id, balance)
  VALUES (NEW.id, 200)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.subscriptions (user_id, plan, status)
  VALUES (NEW.id, 'none', 'inactive')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.transactions (user_id, type, package_name, credits_added, amount_eur)
  VALUES (NEW.id, 'beta_welcome', 'welcome_200', 200, 0);

  RETURN NEW;
END;
$$;

COMMIT;
