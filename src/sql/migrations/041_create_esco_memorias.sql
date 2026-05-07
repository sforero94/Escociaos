-- Migration 041: Create esco_memorias table for Esco's user-triggered long-term memory.
--
-- Owner saves a fact via "Guarda esto" → Esco proposes → user confirms via inline
-- buttons → row is inserted here. At the start of subsequent conversations the
-- handler loads active rows for the user (archived_at IS NULL, ordered DESC,
-- capped at 50) and injects them into the system prompt as `MEMORIAS GUARDADAS`.
--
-- Forget flow soft-deletes by setting archived_at; rows are never hard-deleted
-- so an "olvida X" decision can be reverted if it was a mistake.

CREATE TABLE IF NOT EXISTS esco_memorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) <= 1000),
  source_message_id uuid,
  source_channel text NOT NULL CHECK (source_channel IN ('web', 'telegram')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS esco_memorias_user_active_idx
  ON esco_memorias (user_id, created_at DESC)
  WHERE archived_at IS NULL;

ALTER TABLE esco_memorias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS esco_memorias_owner_all ON esco_memorias;
CREATE POLICY esco_memorias_owner_all ON esco_memorias
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
