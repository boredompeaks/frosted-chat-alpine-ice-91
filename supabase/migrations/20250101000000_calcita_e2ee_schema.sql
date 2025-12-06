-- =============================================================================
-- CalcIta - End-to-End Encrypted Messaging Application
-- Database Schema Migration
-- Version: 1.0.0
-- Date: 2025-01-01
-- =============================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- PROFILES TABLE
-- Extends Supabase auth.users with additional user information
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'away', 'offline', 'busy')),
  bio TEXT,
  public_key TEXT, -- RSA-2048 public key for key exchange
  private_key_encrypted TEXT, -- Encrypted private key (client-side)
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON public.profiles(last_seen);

-- =============================================================================
-- CHATS TABLE
-- Represents individual or group conversations
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.chats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT, -- For group chats
  is_group BOOLEAN DEFAULT false,
  avatar_url TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chats indexes
CREATE INDEX IF NOT EXISTS idx_chats_created_by ON public.chats(created_by);
CREATE INDEX IF NOT EXISTS idx_chats_last_message ON public.chats(last_message_at DESC);

-- =============================================================================
-- CHAT PARTICIPANTS TABLE
-- Links users to chats with role information
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.chat_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  muted BOOLEAN DEFAULT false,
  UNIQUE(chat_id, user_id)
);

-- Chat participants indexes
CREATE INDEX IF NOT EXISTS idx_chat_participants_chat ON public.chat_participants(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_participants_user ON public.chat_participants(user_id);

-- =============================================================================
-- ENCRYPTION KEYS TABLE
-- Manages E2EE keys for chats with automatic rotation
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.encryption_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  key_value TEXT NOT NULL, -- AES-256 key (encrypted at rest)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'received', 'active', 'expired', 'revoked')),
  initiator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_acknowledged BOOLEAN DEFAULT false,
  receiver_acknowledged BOOLEAN DEFAULT false,
  last_rotation TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Encryption keys indexes
CREATE INDEX IF NOT EXISTS idx_encryption_keys_chat ON public.encryption_keys(chat_id);
CREATE INDEX IF NOT EXISTS idx_encryption_keys_status ON public.encryption_keys(status);
CREATE INDEX IF NOT EXISTS idx_encryption_keys_expires ON public.encryption_keys(expires_at);

-- =============================================================================
-- KEY TRANSFERS TABLE
-- Fallback mechanism for key exchange via database
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.key_transfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  encrypted_key TEXT NOT NULL, -- Key encrypted with recipient's public key
  transfer_method TEXT DEFAULT 'database' CHECK (transfer_method IN ('turn', 'database', 'manual')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'received', 'failed', 'expired')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  received_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour'
);

-- Key transfers indexes
CREATE INDEX IF NOT EXISTS idx_key_transfers_recipient ON public.key_transfers(recipient_id, status);
CREATE INDEX IF NOT EXISTS idx_key_transfers_chat ON public.key_transfers(chat_id);

-- =============================================================================
-- MESSAGES TABLE
-- Stores encrypted messages with metadata
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL, -- Encrypted content (JSON with ciphertext, iv, tag)
  content_type TEXT DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'video', 'audio', 'file', 'location', 'contact')),
  media_url TEXT,
  media_size INTEGER,
  media_mime_type TEXT,
  thumbnail_url TEXT,
  is_encrypted BOOLEAN DEFAULT true,
  is_one_time_view BOOLEAN DEFAULT false,
  viewed_at TIMESTAMPTZ,
  viewed_by UUID REFERENCES public.profiles(id),
  disappear_after INTEGER, -- Seconds after read
  disappears_at TIMESTAMPTZ,
  reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  forwarded_from UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages indexes
CREATE INDEX IF NOT EXISTS idx_messages_chat ON public.messages(chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_reply ON public.messages(reply_to_id);
CREATE INDEX IF NOT EXISTS idx_messages_disappear ON public.messages(disappears_at) WHERE disappears_at IS NOT NULL;

-- =============================================================================
-- REACTIONS TABLE
-- Emoji reactions to messages
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji)
);

-- Reactions indexes
CREATE INDEX IF NOT EXISTS idx_reactions_message ON public.reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_reactions_user ON public.reactions(user_id);

-- =============================================================================
-- ATTACHMENTS TABLE
-- Stores file metadata for message attachments
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_url TEXT NOT NULL,
  thumbnail_url TEXT,
  encrypted BOOLEAN DEFAULT true,
  encryption_iv TEXT,
  encryption_tag TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attachments indexes
CREATE INDEX IF NOT EXISTS idx_attachments_message ON public.attachments(message_id);

-- =============================================================================
-- CALL LOGS TABLE
-- Records voice and video call history
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.call_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  initiator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  call_type TEXT NOT NULL CHECK (call_type IN ('audio', 'video')),
  status TEXT NOT NULL CHECK (status IN ('initiated', 'ringing', 'connected', 'ended', 'rejected', 'missed', 'failed')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  connected_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration INTEGER, -- Seconds
  end_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Call logs indexes
CREATE INDEX IF NOT EXISTS idx_call_logs_chat ON public.call_logs(chat_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_initiator ON public.call_logs(initiator_id);

-- =============================================================================
-- PRESENCE TABLE
-- Real-time user presence and typing indicators
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.presence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chat_id UUID REFERENCES public.chats(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'away', 'offline', 'busy')),
  is_typing BOOLEAN DEFAULT false,
  last_active TIMESTAMPTZ DEFAULT NOW(),
  device_info JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Presence indexes
CREATE INDEX IF NOT EXISTS idx_presence_user ON public.presence(user_id);
CREATE INDEX IF NOT EXISTS idx_presence_chat ON public.presence(chat_id);
CREATE INDEX IF NOT EXISTS idx_presence_typing ON public.presence(chat_id, is_typing) WHERE is_typing = true;

-- =============================================================================
-- NOTIFICATIONS TABLE
-- Push notification queue
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('message', 'call', 'reaction', 'mention', 'system')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB,
  read BOOLEAN DEFAULT false,
  sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, read, created_at DESC);

-- =============================================================================
-- BLOCKED USERS TABLE
-- User blocking functionality
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.blocked_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id)
);

-- Blocked users indexes
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON public.blocked_users(blocker_id);

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to check if user is in chat
CREATE OR REPLACE FUNCTION public.is_user_in_chat(_user_id UUID, _chat_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_participants
    WHERE user_id = _user_id AND chat_id = _chat_id
  );
$$;

-- Function to get unread message count
CREATE OR REPLACE FUNCTION public.get_unread_count(_user_id UUID, _chat_id UUID)
RETURNS INTEGER
LANGUAGE SQL
STABLE
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.messages m
  JOIN public.chat_participants cp ON cp.chat_id = m.chat_id
  WHERE m.chat_id = _chat_id
    AND m.sender_id != _user_id
    AND m.created_at > cp.last_read_at
    AND m.deleted_at IS NULL;
$$;

-- Function to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email)
  );
  RETURN NEW;
END;
$$;

-- Trigger to create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_chats_updated_at BEFORE UPDATE ON public.chats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Function to auto-delete disappearing messages
CREATE OR REPLACE FUNCTION public.cleanup_disappearing_messages()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.messages
  WHERE disappears_at IS NOT NULL
    AND disappears_at < NOW()
    AND deleted_at IS NULL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Function to expire old keys
CREATE OR REPLACE FUNCTION public.expire_old_keys()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE public.encryption_keys
  SET status = 'expired'
  WHERE expires_at < NOW()
    AND status IN ('pending', 'sent', 'received', 'active');

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encryption_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.key_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Chats policies
CREATE POLICY "Users can view their chats"
  ON public.chats FOR SELECT
  USING (public.is_user_in_chat(auth.uid(), id));

CREATE POLICY "Authenticated users can create chats"
  ON public.chats FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Chat creators can update their chats"
  ON public.chats FOR UPDATE
  USING (created_by = auth.uid() OR public.is_user_in_chat(auth.uid(), id));

-- Chat participants policies
CREATE POLICY "Users can view participants in their chats"
  ON public.chat_participants FOR SELECT
  USING (public.is_user_in_chat(auth.uid(), chat_id));

CREATE POLICY "Users can add participants to their chats"
  ON public.chat_participants FOR INSERT
  WITH CHECK (public.is_user_in_chat(auth.uid(), chat_id));

CREATE POLICY "Users can remove themselves from chats"
  ON public.chat_participants FOR DELETE
  USING (user_id = auth.uid());

-- Encryption keys policies
CREATE POLICY "Users can view keys for their chats"
  ON public.encryption_keys FOR SELECT
  USING (public.is_user_in_chat(auth.uid(), chat_id));

CREATE POLICY "Users can create keys for their chats"
  ON public.encryption_keys FOR INSERT
  WITH CHECK (public.is_user_in_chat(auth.uid(), chat_id));

CREATE POLICY "Key initiators can update their keys"
  ON public.encryption_keys FOR UPDATE
  USING (initiator_id = auth.uid());

-- Key transfers policies
CREATE POLICY "Users can view their key transfers"
  ON public.key_transfers FOR SELECT
  USING (recipient_id = auth.uid() OR sender_id = auth.uid());

CREATE POLICY "Users can create key transfers"
  ON public.key_transfers FOR INSERT
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Recipients can update key transfer status"
  ON public.key_transfers FOR UPDATE
  USING (recipient_id = auth.uid());

-- Messages policies
CREATE POLICY "Users can view messages in their chats"
  ON public.messages FOR SELECT
  USING (public.is_user_in_chat(auth.uid(), chat_id));

CREATE POLICY "Users can send messages to their chats"
  ON public.messages FOR INSERT
  WITH CHECK (
    public.is_user_in_chat(auth.uid(), chat_id) AND
    sender_id = auth.uid()
  );

CREATE POLICY "Users can update their own messages"
  ON public.messages FOR UPDATE
  USING (sender_id = auth.uid());

CREATE POLICY "Users can delete their own messages"
  ON public.messages FOR DELETE
  USING (sender_id = auth.uid());

-- Reactions policies
CREATE POLICY "Users can view reactions in their chats"
  ON public.reactions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_id AND public.is_user_in_chat(auth.uid(), m.chat_id)
  ));

CREATE POLICY "Users can add reactions"
  ON public.reactions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own reactions"
  ON public.reactions FOR DELETE
  USING (user_id = auth.uid());

-- Attachments policies
CREATE POLICY "Users can view attachments in their chats"
  ON public.attachments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_id AND public.is_user_in_chat(auth.uid(), m.chat_id)
  ));

-- Call logs policies
CREATE POLICY "Users can view call logs in their chats"
  ON public.call_logs FOR SELECT
  USING (public.is_user_in_chat(auth.uid(), chat_id));

CREATE POLICY "Users can create call logs"
  ON public.call_logs FOR INSERT
  WITH CHECK (initiator_id = auth.uid());

-- Presence policies
CREATE POLICY "Users can view presence in their chats"
  ON public.presence FOR SELECT
  USING (true);

CREATE POLICY "Users can update their own presence"
  ON public.presence FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own presence"
  ON public.presence FOR UPDATE
  USING (user_id = auth.uid());

-- Notifications policies
CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid());

-- Blocked users policies
CREATE POLICY "Users can view their blocked list"
  ON public.blocked_users FOR SELECT
  USING (blocker_id = auth.uid());

CREATE POLICY "Users can block others"
  ON public.blocked_users FOR INSERT
  WITH CHECK (blocker_id = auth.uid());

CREATE POLICY "Users can unblock others"
  ON public.blocked_users FOR DELETE
  USING (blocker_id = auth.uid());

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Additional composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_messages_chat_sender ON public.messages(chat_id, sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON public.messages(chat_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_encryption_keys_active ON public.encryption_keys(chat_id, status) WHERE status = 'active';

-- =============================================================================
-- REALTIME PUBLICATION
-- =============================================================================

-- Enable realtime for relevant tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.presence;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_participants;

-- =============================================================================
-- CLEANUP & MAINTENANCE
-- =============================================================================

-- Schedule cleanup jobs (requires pg_cron extension)
-- Uncomment if pg_cron is available:
-- SELECT cron.schedule('cleanup-disappearing-messages', '*/5 * * * *', 'SELECT public.cleanup_disappearing_messages()');
-- SELECT cron.schedule('expire-old-keys', '0 * * * *', 'SELECT public.expire_old_keys()');

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

COMMENT ON TABLE public.profiles IS 'User profiles with E2EE key pairs';
COMMENT ON TABLE public.chats IS 'Chat conversations (individual or group)';
COMMENT ON TABLE public.messages IS 'Encrypted messages with E2EE';
COMMENT ON TABLE public.encryption_keys IS 'AES-256 keys for chat encryption with 24h rotation';
COMMENT ON TABLE public.key_transfers IS 'Fallback key exchange mechanism';

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
