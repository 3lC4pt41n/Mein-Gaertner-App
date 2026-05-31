-- ================================================================
-- Migration: Admin-Flag + RLS auf Analytics-Views
-- ================================================================

-- 1) is_admin Spalte in profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Dein Account als Admin setzen (per E-Mail Lookup)
UPDATE profiles
SET is_admin = true
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'tim.mergenthaler@florascout.app'
);

-- 2) daily_stats und user_economics absichern
--    Views durch sichere Views ersetzen, die nur Admins lesen können.

-- Hilfsfunktion: Ist der aktuelle User Admin?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

-- daily_stats: Drop + Recreate mit RLS-fähiger Tabelle
-- (Views unterstützen kein RLS direkt, deshalb nutzen wir
--  SECURITY DEFINER Functions oder prüfen in der View selbst)

-- Option: Views mit eingebautem Admin-Check
DROP VIEW IF EXISTS daily_stats;
CREATE VIEW daily_stats AS
SELECT
  DATE(ul.created_at) AS day,
  COUNT(DISTINCT ul.user_id) AS active_users,
  SUM(ul.cost_credits) AS credits_consumed,
  SUM(ul.openai_cost_usd) AS openai_cost_usd,
  COUNT(*) FILTER (WHERE ul.action = 'plant_scan') AS scans,
  COUNT(*) FILTER (WHERE ul.action = 'chat') AS chats,
  COUNT(*) FILTER (WHERE ul.action = 'healthcheck') AS healthchecks
FROM usage_log ul
WHERE public.is_admin()  -- gibt nur Daten zurück wenn der User Admin ist
GROUP BY DATE(ul.created_at)
ORDER BY day DESC;

DROP VIEW IF EXISTS user_economics;
CREATE VIEW user_economics AS
SELECT
  cb.user_id,
  cb.balance AS current_balance,
  COALESCE(s.plan, 'none') AS current_plan,
  COALESCE(s.status, 'inactive') AS plan_status,
  COALESCE(rev.total_revenue_eur, 0) AS total_revenue_eur,
  COALESCE(cost.total_openai_cost_usd, 0) AS total_openai_cost_usd,
  COALESCE(cost.total_credits_used, 0) AS total_credits_used
FROM credit_balances cb
LEFT JOIN subscriptions s ON s.user_id = cb.user_id
LEFT JOIN (
  SELECT user_id, SUM(amount_eur) AS total_revenue_eur
  FROM transactions
  GROUP BY user_id
) rev ON rev.user_id = cb.user_id
LEFT JOIN (
  SELECT user_id,
         SUM(openai_cost_usd) AS total_openai_cost_usd,
         SUM(cost_credits) AS total_credits_used
  FROM usage_log
  GROUP BY user_id
) cost ON cost.user_id = cb.user_id
WHERE public.is_admin();  -- gibt nur Daten zurück wenn der User Admin ist
