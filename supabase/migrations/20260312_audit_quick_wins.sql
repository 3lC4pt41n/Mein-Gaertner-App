-- Audit Quick Wins Migration
-- 1.1: Profile skip flag
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_setup_skipped boolean DEFAULT false;

-- 1.8: Notification preference persistence
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notifications_enabled boolean DEFAULT true;
