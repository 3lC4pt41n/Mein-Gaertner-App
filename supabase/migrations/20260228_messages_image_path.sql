-- Neue Spalte image_path: stabiler Objektpfad statt temporaerer Signed URL
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS image_path TEXT;

-- Backfill: Pfad aus bestehenden Signed URLs extrahieren
-- Pattern: .../chat-images/FILENAME?token=...
UPDATE public.messages
SET image_path = regexp_replace(
  image_url,
  '^.*/chat-images/([^?]+).*$',
  '\1'
)
WHERE image_url IS NOT NULL
  AND image_url LIKE '%/chat-images/%'
  AND image_path IS NULL;
