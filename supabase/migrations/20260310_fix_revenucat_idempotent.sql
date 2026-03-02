-- ============================================================
-- Migration: Fix RevenueCat webhook idempotency
-- Datum: 2026-03-10
-- ============================================================
-- Add UNIQUE constraint on provider_transaction_id (for non-null values)
-- Create RPC function for atomic credit_purchase with deduplication

-- 1) Add UNIQUE constraint on provider_transaction_id
ALTER TABLE public.transactions
ADD CONSTRAINT transactions_provider_transaction_id_unique
UNIQUE (provider_transaction_id) WHERE provider_transaction_id IS NOT NULL;

-- 2) Create RPC function for idempotent credit purchase
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
  v_inserted BOOLEAN;
BEGIN
  -- Insert transaction with ON CONFLICT DO NOTHING
  -- Returns true if insert succeeded (new transaction), false if duplicate
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
  ON CONFLICT (provider_transaction_id) DO NOTHING;

  -- Check if the insert succeeded by seeing if row exists with this transaction_id
  SELECT EXISTS(
    SELECT 1 FROM public.transactions
    WHERE provider_transaction_id = p_provider_transaction_id
    AND created_at > now() - INTERVAL '1 second'
  ) INTO v_inserted;

  -- Only update balance if this was a new transaction (not a duplicate)
  IF v_inserted THEN
    -- Atomic increment: balance = balance + p_credits
    UPDATE public.credit_balances
    SET balance = balance + p_credits
    WHERE user_id = p_user_id;

    -- Ensure credit_balance exists for this user
    INSERT INTO public.credit_balances (user_id, balance)
    VALUES (p_user_id, p_credits)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN TRUE;
  ELSE
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3) Create index on provider_transaction_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_transactions_provider_transaction_id
ON public.transactions(provider_transaction_id)
WHERE provider_transaction_id IS NOT NULL;
