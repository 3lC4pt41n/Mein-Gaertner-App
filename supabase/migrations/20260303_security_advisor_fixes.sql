-- =============================================================
-- Migration: Fix ALL Supabase Security Advisor findings
-- Datum: 2026-03-03
-- Beschreibung:
--   3 Errors:  Security Definer Views → security_invoker = on
--   10 Warnings: Function search_path mutable → SET search_path = ''
--   (Leaked Password Protection is an Auth setting, not SQL)
-- =============================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- 1. FIX FUNCTION SEARCH PATH (10 functions)
--    Setting search_path = '' forces fully-qualified table names
--    and prevents search_path hijacking (CWE-340).
-- ═══════════════════════════════════════════════════════════════

-- Credit system functions
ALTER FUNCTION public.deduct_credits(UUID, INTEGER)
  SET search_path = '';

ALTER FUNCTION public.refund_credits(UUID, INTEGER)
  SET search_path = '';

ALTER FUNCTION public.credit_purchase(UUID, TEXT, TEXT, INTEGER, NUMERIC, TEXT)
  SET search_path = '';

ALTER FUNCTION public.update_credit_balance_timestamp()
  SET search_path = '';

ALTER FUNCTION public.handle_new_user_credits()
  SET search_path = '';

-- Auth/profile trigger function
ALTER FUNCTION public.handle_new_user()
  SET search_path = '';

-- Admin helper
ALTER FUNCTION public.is_admin()
  SET search_path = '';

-- Leaderboard RPC functions (may already have search_path = public,
-- upgrading to '' for stricter security)
ALTER FUNCTION public.get_my_rank(TEXT, UUID)
  SET search_path = '';

ALTER FUNCTION public.get_my_neighbors(TEXT, UUID, INT)
  SET search_path = '';

-- Dex discoverer count trigger
ALTER FUNCTION public.update_species_discoverer_count()
  SET search_path = '';


-- ═══════════════════════════════════════════════════════════════
-- 2. FIX SECURITY DEFINER VIEWS (3 views)
--    Convert to security_invoker = on so RLS of the querying
--    user applies instead of the view creator's permissions.
--    Requires PostgreSQL 15+ (Supabase default).
-- ═══════════════════════════════════════════════════════════════

-- 2a. Add admin-bypass RLS policies for admin analytics views
--     (daily_stats, user_economics query tables with user-only RLS)
DO $$ BEGIN
  CREATE POLICY "admin_read_usage_log" ON public.usage_log
    FOR SELECT USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admin_read_credit_balances" ON public.credit_balances
    FOR SELECT USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admin_read_transactions" ON public.transactions
    FOR SELECT USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admin_read_subscriptions" ON public.subscriptions
    FOR SELECT USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2b. Add authenticated-read RLS policies for leaderboard aggregation
--     (leaderboard_public needs to read across all opted-in users)
DO $$ BEGIN
  CREATE POLICY "authenticated_read_gardening_events" ON public.gardening_events
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "authenticated_read_discovery_events" ON public.discovery_events
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Ensure profiles are readable for leaderboard display names
DO $$ BEGIN
  CREATE POLICY "authenticated_read_profiles" ON public.profiles
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2c. Convert views to SECURITY INVOKER
ALTER VIEW public.leaderboard_public SET (security_invoker = on);
ALTER VIEW public.daily_stats SET (security_invoker = on);
ALTER VIEW public.user_economics SET (security_invoker = on);

COMMIT;
