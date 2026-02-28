-- Rolling Conversation Summary fuer Ben-Chat
CREATE TABLE IF NOT EXISTS public.chat_memory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  summary       TEXT NOT NULL,
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Ein Summary pro User (rolling)
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_memory_user
  ON public.chat_memory(user_id);

ALTER TABLE public.chat_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_memory_user_self" ON public.chat_memory
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
