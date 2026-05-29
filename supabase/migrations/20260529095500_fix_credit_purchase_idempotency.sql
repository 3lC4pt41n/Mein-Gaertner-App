-- =============================================================
-- Migration: Repair credit_purchase idempotency
-- Datum: 2026-05-29
-- =============================================================
-- Production had credit_purchase() using ON CONFLICT(provider_transaction_id)
-- without a matching unique constraint, so RevenueCat/manual credit grants
-- failed before updating balances. This migration restores the constraint
-- and makes the RPC reject missing provider transaction ids.
-- =============================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transactions_provider_transaction_id_key'
      AND conrelid = 'public.transactions'::regclass
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_provider_transaction_id_key
      UNIQUE (provider_transaction_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_provider_transaction_id
ON public.transactions(provider_transaction_id)
WHERE provider_transaction_id IS NOT NULL;

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
  IF p_provider_transaction_id IS NULL OR btrim(p_provider_transaction_id) = '' THEN
    RAISE EXCEPTION 'PROVIDER_TRANSACTION_ID_REQUIRED';
  END IF;

  INSERT INTO public.transactions (
    user_id,
    type,
    package_name,
    credits_added,
    amount_eur,
    provider_transaction_id
  ) VALUES (
    p_user_id,
    p_type,
    p_package,
    p_credits,
    p_amount_eur,
    p_provider_transaction_id
  )
  ON CONFLICT (provider_transaction_id) DO NOTHING
  RETURNING id INTO v_new_id;

  IF v_new_id IS NOT NULL THEN
    INSERT INTO public.credit_balances (user_id, balance)
    VALUES (p_user_id, p_credits)
    ON CONFLICT (user_id)
    DO UPDATE SET
      balance = public.credit_balances.balance + EXCLUDED.balance,
      updated_at = now();

    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

COMMIT;
