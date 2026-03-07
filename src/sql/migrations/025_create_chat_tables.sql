-- 025_create_chat_tables.sql
-- Chat conversacional "Esco" — tablas para conversaciones y mensajes

-- ============================================================================
-- TABLAS
-- ============================================================================

CREATE TABLE IF NOT EXISTS chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- INDICES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_id ON chat_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated_at ON chat_conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created ON chat_messages(conversation_id, created_at ASC);

-- ============================================================================
-- TRIGGER: auto-update updated_at on chat_conversations
-- ============================================================================

CREATE OR REPLACE FUNCTION update_chat_conversation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chat_conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_chat_message_update_conversation
AFTER INSERT ON chat_messages
FOR EACH ROW
EXECUTE FUNCTION update_chat_conversation_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- chat_conversations: solo el owner con rol Gerencia
CREATE POLICY "chat_conversations_select" ON chat_conversations
  FOR SELECT USING (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'Gerencia')
  );

CREATE POLICY "chat_conversations_insert" ON chat_conversations
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'Gerencia')
  );

CREATE POLICY "chat_conversations_delete" ON chat_conversations
  FOR DELETE USING (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'Gerencia')
  );

-- chat_messages: acceso si es owner de la conversacion
CREATE POLICY "chat_messages_select" ON chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_conversations
      WHERE id = chat_messages.conversation_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "chat_messages_insert" ON chat_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_conversations
      WHERE id = chat_messages.conversation_id
        AND user_id = auth.uid()
    )
  );
