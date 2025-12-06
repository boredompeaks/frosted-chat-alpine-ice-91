-- =====================================================================
-- CalcIta - Complete Working Database Schema (RLS Fixed)
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='username') THEN
    ALTER TABLE public.profiles ADD COLUMN username TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='display_name') THEN
    ALTER TABLE public.profiles ADD COLUMN display_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='avatar_url') THEN
    ALTER TABLE public.profiles ADD COLUMN avatar_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='status') THEN
    ALTER TABLE public.profiles ADD COLUMN status TEXT DEFAULT 'offline';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='bio') THEN
    ALTER TABLE public.profiles ADD COLUMN bio TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='public_key') THEN
    ALTER TABLE public.profiles ADD COLUMN public_key TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='last_seen') THEN
    ALTER TABLE public.profiles ADD COLUMN last_seen TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

UPDATE public.profiles SET username = 'user_' || substr(id::text, 1, 8) WHERE username IS NULL;
ALTER TABLE public.profiles ALTER COLUMN username SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_idx ON public.profiles(username);

-- CHATS TABLE
DROP TABLE IF EXISTS public.chats CASCADE;
CREATE TABLE public.chats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT,
  is_group BOOLEAN DEFAULT false,
  avatar_url TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_chats_created_by ON public.chats(created_by);

-- CHAT_PARTICIPANTS TABLE
DROP TABLE IF EXISTS public.chat_participants CASCADE;
CREATE TABLE public.chat_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  muted BOOLEAN DEFAULT false,
  UNIQUE(chat_id, user_id)
);
CREATE INDEX idx_chat_participants_chat ON public.chat_participants(chat_id);
CREATE INDEX idx_chat_participants_user ON public.chat_participants(user_id);

-- MESSAGES TABLE
DROP TABLE IF EXISTS public.messages CASCADE;
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  content_type TEXT DEFAULT 'text',
  media_url TEXT,
  is_encrypted BOOLEAN DEFAULT true,
  is_one_time_view BOOLEAN DEFAULT false,
  viewed_at TIMESTAMPTZ,
  disappear_after INTEGER,
  disappears_at TIMESTAMPTZ,
  reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  read_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_messages_chat ON public.messages(chat_id, created_at DESC);

-- REACTIONS TABLE
DROP TABLE IF EXISTS public.reactions CASCADE;
CREATE TABLE public.reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji)
);

-- ENCRYPTION_KEYS TABLE
DROP TABLE IF EXISTS public.encryption_keys CASCADE;
CREATE TABLE public.encryption_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  key_value TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  initiator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_acknowledged BOOLEAN DEFAULT false,
  receiver_acknowledged BOOLEAN DEFAULT false,
  last_rotation TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HELPER FUNCTION
CREATE OR REPLACE FUNCTION public.is_user_in_chat(_user_id UUID, _chat_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_participants WHERE user_id = _user_id AND chat_id = _chat_id);
$$;

-- TRIGGER FOR NEW USERS
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    'online'
  ) ON CONFLICT (id) DO UPDATE SET username = COALESCE(EXCLUDED.username, profiles.username);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ROW LEVEL SECURITY
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encryption_keys ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public') LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON public.' || r.tablename;
  END LOOP;
END $$;

-- PROFILES POLICIES
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- CHATS POLICIES (FIXED)
CREATE POLICY "chats_select" ON public.chats FOR SELECT TO authenticated USING (public.is_user_in_chat(auth.uid(), id));
CREATE POLICY "chats_insert" ON public.chats FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() OR created_by IS NULL OR auth.uid() IS NOT NULL);
CREATE POLICY "chats_update" ON public.chats FOR UPDATE TO authenticated USING (created_by = auth.uid() OR public.is_user_in_chat(auth.uid(), id));

-- CHAT_PARTICIPANTS POLICIES (FIXED)
CREATE POLICY "participants_select" ON public.chat_participants FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_user_in_chat(auth.uid(), chat_id));
CREATE POLICY "participants_insert" ON public.chat_participants FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "participants_delete" ON public.chat_participants FOR DELETE TO authenticated USING (user_id = auth.uid());

-- MESSAGES POLICIES (FIXED)
CREATE POLICY "messages_select" ON public.messages FOR SELECT TO authenticated USING (public.is_user_in_chat(auth.uid(), chat_id));
CREATE POLICY "messages_insert" ON public.messages FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid());
CREATE POLICY "messages_update" ON public.messages FOR UPDATE TO authenticated USING (sender_id = auth.uid());

-- REACTIONS POLICIES
CREATE POLICY "reactions_select" ON public.reactions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND public.is_user_in_chat(auth.uid(), m.chat_id)));
CREATE POLICY "reactions_insert" ON public.reactions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ENCRYPTION_KEYS POLICIES (FIXED)
CREATE POLICY "keys_select" ON public.encryption_keys FOR SELECT TO authenticated USING (public.is_user_in_chat(auth.uid(), chat_id));
CREATE POLICY "keys_insert" ON public.encryption_keys FOR INSERT TO authenticated WITH CHECK (initiator_id = auth.uid());

-- GRANT PERMISSIONS
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
