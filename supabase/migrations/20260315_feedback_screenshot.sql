-- Add screenshot_path column to feedback table for image attachments
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS screenshot_path text;
