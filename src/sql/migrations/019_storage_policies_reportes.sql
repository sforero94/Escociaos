-- Migration 019: Fix storage RLS policies for reportes-semanales bucket
-- Uses DROP IF EXISTS to avoid errors when re-running

-- Drop existing policies (if any) to avoid conflicts
DROP POLICY IF EXISTS "Authenticated users can upload reports" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read reports" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update reports" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete reports" ON storage.objects;

-- Allow authenticated users to upload reports
CREATE POLICY "Authenticated users can upload reports"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'reportes-semanales');

-- Allow authenticated users to read/download reports
CREATE POLICY "Authenticated users can read reports"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'reportes-semanales');

-- Allow authenticated users to update (upsert) reports
CREATE POLICY "Authenticated users can update reports"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'reportes-semanales');

-- Allow authenticated users to delete old reports
CREATE POLICY "Authenticated users can delete reports"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'reportes-semanales');
