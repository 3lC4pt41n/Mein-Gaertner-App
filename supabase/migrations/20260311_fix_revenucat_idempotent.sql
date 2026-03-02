-- ============================================================
-- Migration: Fix RevenueCat webhook idempotency
-- Datum: 2026-03-11
-- ============================================================
-- Full UNIQUE constraint on provider_transaction_id (non-null)
-- RETURNING-based idempotency (no time-window heuristic)

-- 1) Drop the partial index if it exists, replace with a proper UNIQUE constraint
--    A full UNIQUE constraint works with ON CONFLICT (column) DO NOTHING.
--    NULL values are always unique in PostgreSQL, so this is safe.
DROP INDEX IF EXISTS transactions_provider_transaction_id_unique;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_provider_transaction_id_key
  UNIQUE (provider_transaction_id);

-- 2) Create RPC function for idempotent credit purchase (RETURNING-based)
CREATE OR REPLACE FUNCTION public.credit_purchase(
  p_user_id UUID,
  p_provider_transaction_id TEXT,
  p_package TEXT,
  p_credits INTEGER,
  p_amount_eur NUMERIC,
  p_type TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_new_id UUID;
BEGIN
  -- INSERT ... RETURNING id: v_new_id is NULL when ON CONFLICT fires
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

  -- Only update balance when the INSERT actually created a new row
  IF v_new_id IS NOT NULL THEN
    -- Upsert credit balance: insert or increment
    INSERT INTO public.credit_balances (user_id, balance)
    VALUES (p_user_id, p_credits)
    ON CONFLICT (user_id)
    DO UPDATE SET balance = credit_balances.balance + EXCLUDED.balance;

    RETURN TRUE;
  ELSE
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3) Lookup index (the UNIQUE constraint already provides one, but keep
--    an explicit partial index for queries that filter IS NOT NULL)
CREATE INDEX IF NOT EXISTS idx_transactions_provider_transaction_id
ON public.transactions(provider_transaction_id)
WHERE provider_transaction_id IS NOT NULL;
