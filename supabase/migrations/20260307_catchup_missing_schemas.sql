-- =============================================================
-- Catch-up Migration: Fehlende Schemas idempotent nachholen
-- Einige Migrations wurden durch den kaputten Repair-Loop als
-- "applied" markiert ohne tatsaechlich ausgefuehrt zu werden.
-- Diese Migration erstellt alles idempotent (IF NOT EXISTS / CREATE OR REPLACE).
-- =============================================================

-- 1. chat_memory Tabelle (Rolling Summary fuer Ben-Chat)
CREATE TABLE IF NOT EXISTS public.chat_memory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  summary       TEXT NOT NULL,
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_memory_user
  ON public.chat_memory(user_id);
ALTER TABLE public.chat_memory ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "chat_memory_user_self" ON public.chat_memory
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Atomare Credit-Funktionen (deduct + refund)
CREATE OR REPLACE FUNCTION public.deduct_credits(
  p_user_id UUID,
  p_amount INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

CREATE OR REPLACE FUNCTION public.refund_credits(
  p_user_id UUID,
  p_amount INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

-- 3. messages.image_path Spalte (stabiler Pfad statt Signed URL)
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS image_path TEXT;

-- Backfill: Pfad aus bestehenden Signed URLs extrahieren
UPDATE public.messages
SET image_path = regexp_replace(
  image_url,
  '^.*/chat-images/([^?]+).*$',
  '\1'
)
WHERE image_url IS NOT NULL
  AND image_url LIKE '%/chat-images/%'
  AND image_path IS NULL;
