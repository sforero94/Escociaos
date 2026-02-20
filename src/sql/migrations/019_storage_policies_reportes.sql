-- Migration 019: Add storage RLS policies for reportes-semanales bucket
-- The bucket was created manually via Supabase Dashboard.
-- This migration adds the missing RLS policies for storage.objects.

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
