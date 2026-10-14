-- REVIEW CANDIDATE ONLY: apply in a separately approved release.
-- Storage request metadata restrictions; these do NOT authenticate file bytes.
BEGIN;
DO $$
DECLARE bucket storage.buckets%ROWTYPE;
BEGIN
  SELECT * INTO bucket FROM storage.buckets WHERE id='facturas' FOR UPDATE;
  IF NOT FOUND OR bucket.public IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Expected existing private invoice bucket';
  END IF;
  -- Refuse to overwrite newer administrator limits without review.
  IF bucket.file_size_limit IS NOT NULL OR bucket.allowed_mime_types IS NOT NULL THEN
    RAISE EXCEPTION 'Invoice limits changed since captured baseline';
  END IF;
  UPDATE storage.buckets SET file_size_limit=5242880,
    allowed_mime_types=ARRAY['image/jpeg','image/jpg','image/png','image/gif','application/pdf']
    WHERE id='facturas';
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='facturas' AND public=false
    AND file_size_limit=5242880 AND allowed_mime_types=
      ARRAY['image/jpeg','image/jpg','image/png','image/gif','application/pdf']) THEN
    RAISE EXCEPTION 'Invoice limits update not confirmed';
  END IF;
END $$;
COMMIT;
