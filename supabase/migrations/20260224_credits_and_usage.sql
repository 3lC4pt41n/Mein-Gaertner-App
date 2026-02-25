-- ============================================================
-- Migration: Credit-System, Usage-Tracking, Transactions, Subscriptions
-- Datum: 2026-02-24
-- ============================================================

-- 1) Credit-Guthaben pro User
CREATE TABLE IF NOT EXISTS public.credit_balances (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  balance     INTEGER NOT NULL DEFAULT 0,  -- Credits (1 Credit ≈ 1 Cent OpenAI-Kosten)
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.credit_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit_balances_self" ON public.credit_balances
  FOR SELECT USING (auth.uid() = user_id);

-- Trigger: updated_at automatisch setzen
CREATE OR REPLACE FUNCTION update_credit_balance_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_credit_balances_updated
  BEFORE UPDATE ON public.credit_balances
  FOR EACH ROW EXECUTE FUNCTION update_credit_balance_timestamp();

-- 2) Usage-Log: Jede AI-Nutzung wird geloggt
CREATE TABLE IF NOT EXISTS public.usage_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action            TEXT NOT NULL,          -- 'plant_scan', 'plant_details', 'healthcheck', 'chat'
  prompt_tokens     INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens      INTEGER DEFAULT 0,
  cost_credits      INTEGER NOT NULL,       -- Credits die dem User abgezogen wurden
  openai_cost_usd   NUMERIC(10,6) DEFAULT 0, -- Tatsächliche OpenAI-Kosten in USD
  model             TEXT DEFAULT 'gpt-4o',
  metadata          JSONB DEFAULT '{}',     -- Zusätzliche Infos (plant_id, etc.)
  created_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usage_log_self" ON public.usage_log
  FOR SELECT USING (auth.uid() = user_id);

-- 3) Transaktionen (Käufe)
CREATE TABLE IF NOT EXISTS public.transactions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type                    TEXT NOT NULL,     -- 'one_time', 'subscription_renewal', 'beta_welcome'
  package_name            TEXT,              -- 'starter', 'standard', 'pro', 'hobby', 'gaertner', 'profi'
  credits_added           INTEGER NOT NULL,
  amount_eur              NUMERIC(10,2) DEFAULT 0,
  provider_transaction_id TEXT,              -- RevenueCat Transaction ID
  created_at              TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transactions_self" ON public.transactions
  FOR SELECT USING (auth.uid() = user_id);

-- 4) Abo-Status
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  plan                    TEXT NOT NULL DEFAULT 'none', -- 'none', 'hobby', 'gaertner', 'profi'
  status                  TEXT DEFAULT 'inactive',      -- 'active', 'cancelled', 'expired', 'inactive'
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  revenucat_subscriber_id TEXT,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_self" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- 5) Bei neuer User-Registrierung: Automatisch credit_balance + subscription anlegen
--    UND 100 Willkommens-Credits gutschreiben
CREATE OR REPLACE FUNCTION handle_new_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.credit_balances (user_id, balance)
  VALUES (NEW.id, 100)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.subscriptions (user_id, plan, status)
  VALUES (NEW.id, 'none', 'inactive')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.transactions (user_id, type, package_name, credits_added, amount_eur)
  VALUES (NEW.id, 'beta_welcome', 'welcome_100', 100, 0);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger auf auth.users (nach Insert)
DROP TRIGGER IF EXISTS on_auth_user_created_credits ON auth.users;
CREATE TRIGGER on_auth_user_created_credits
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_credits();

-- 6) Für bestehende User: Credits nachträglich anlegen
INSERT INTO public.credit_balances (user_id, balance)
SELECT id, 100 FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.credit_balances)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.subscriptions (user_id, plan, status)
SELECT id, 'none', 'inactive' FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.subscriptions)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.transactions (user_id, type, package_name, credits_added, amount_eur)
SELECT id, 'beta_welcome', 'welcome_100', 100, 0 FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.transactions WHERE type = 'beta_welcome');

-- 7) Analytics Views
CREATE OR REPLACE VIEW public.daily_stats AS
SELECT
  DATE(created_at) AS day,
  COUNT(DISTINCT user_id) AS active_users,
  SUM(cost_credits) AS credits_consumed,
  SUM(openai_cost_usd) AS openai_cost_usd,
  COUNT(*) FILTER (WHERE action = 'plant_scan') AS scans,
  COUNT(*) FILTER (WHERE action = 'plant_details') AS details,
  COUNT(*) FILTER (WHERE action = 'healthcheck') AS healthchecks,
  COUNT(*) FILTER (WHERE action = 'chat') AS chats
FROM public.usage_log
GROUP BY DATE(created_at)
ORDER BY day DESC;

CREATE OR REPLACE VIEW public.user_economics AS
SELECT
  cb.user_id,
  cb.balance AS current_balance,
  COALESCE(t.total_revenue, 0) AS total_revenue_eur,
  COALESCE(u.total_cost, 0) AS total_openai_cost_usd,
  COALESCE(u.total_credits_used, 0) AS total_credits_used,
  s.plan AS current_plan,
  s.status AS plan_status
FROM public.credit_balances cb
LEFT JOIN (
  SELECT user_id, SUM(amount_eur) AS total_revenue
  FROM public.transactions
  WHERE type != 'beta_welcome'
  GROUP BY user_id
) t ON t.user_id = cb.user_id
LEFT JOIN (
  SELECT user_id, SUM(openai_cost_usd) AS total_cost, SUM(cost_credits) AS total_credits_used
  FROM public.usage_log
  GROUP BY user_id
) u ON u.user_id = cb.user_id
LEFT JOIN public.subscriptions s ON s.user_id = cb.user_id;

-- 8) Indexes für Performance
CREATE INDEX IF NOT EXISTS idx_usage_log_user_id ON public.usage_log(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_log_created_at ON public.usage_log(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
