-- Atomare Credit-Lastschrift: check + deduct in einem Statement
-- Verhindert Race Conditions bei parallelen Requests
CREATE OR REPLACE FUNCTION public.deduct_credits(
  p_user_id UUID,
  p_amount INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  UPDATE public.credit_balances
  SET balance = balance - p_amount,
      updated_at = now()
  WHERE user_id = p_user_id
    AND balance >= p_amount
  RETURNING balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS:%',
      COALESCE(
        (SELECT balance::text FROM public.credit_balances WHERE user_id = p_user_id),
        '0'
      );
  END IF;

  RETURN v_new_balance;
END;
$$;

-- Credits zurueckgeben (Refund bei fehlgeschlagenem API-Call)
CREATE OR REPLACE FUNCTION public.refund_credits(
  p_user_id UUID,
  p_amount INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  UPDATE public.credit_balances
  SET balance = balance + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_new_balance;

  RETURN COALESCE(v_new_balance, 0);
END;
$$;
