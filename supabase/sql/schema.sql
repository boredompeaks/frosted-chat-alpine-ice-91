


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."add_user_to_default_conversation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Add the new user to the default conversation
  INSERT INTO public.conversation_participants (conversation_id, user_id, joined_at)
  VALUES (
    'fe3c8988-ad9a-4c01-add1-7326ec8b4b91', -- The default conversation ID
    NEW.user_id,
    NOW()
  );
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."add_user_to_default_conversation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_stale_typing_indicators"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Delete stale typing indicators on insert (older than 2 minutes for typing indicators)
    DELETE FROM typing_indicators 
    WHERE updated_at < NOW() - INTERVAL '2 minutes';
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."cleanup_stale_typing_indicators"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    'online'
  ) ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_user_in_chat"("_user_id" "uuid", "_chat_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_participants WHERE user_id = _user_id AND chat_id = _chat_id);
$$;


ALTER FUNCTION "public"."is_user_in_chat"("_user_id" "uuid", "_chat_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_conversation_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE conversations
  SET last_message_at = NEW.created_at,
      updated_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_conversation_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_profile_presence"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE profiles 
    SET 
        last_seen = NEW.updated_at,
        is_online = (NEW.status = 'online'),
        connection_quality = NEW.connection_quality,
        updated_at = NEW.updated_at
    WHERE user_id = NEW.user_id;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_profile_presence"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_typing_indicators_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_typing_indicators_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."chat_participants" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "chat_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text",
    "joined_at" timestamp with time zone DEFAULT "now"(),
    "last_read_at" timestamp with time zone DEFAULT "now"(),
    "muted" boolean DEFAULT false
);


ALTER TABLE "public"."chat_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chats" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text",
    "is_group" boolean DEFAULT false,
    "avatar_url" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_message_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."chats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "is_admin" boolean DEFAULT false,
    "joined_at" timestamp with time zone DEFAULT "now"(),
    "last_read_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."conversation_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."conversation_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "name" "text",
    "is_group" boolean DEFAULT false,
    "created_by" "uuid",
    "avatar_url" "text",
    "last_message_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."encrypted_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_id" "text" NOT NULL,
    "recipient_id" "text" NOT NULL,
    "content_encrypted" "text" NOT NULL,
    "message_type" "text" DEFAULT 'text'::"text",
    "timestamp" timestamp with time zone DEFAULT "now"(),
    "is_read" boolean DEFAULT false,
    "expires_at" timestamp with time zone
);


ALTER TABLE "public"."encrypted_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."encryption_keys" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "chat_id" "uuid" NOT NULL,
    "key_value" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "initiator_id" "uuid" NOT NULL,
    "sender_acknowledged" boolean DEFAULT false,
    "receiver_acknowledged" boolean DEFAULT false,
    "last_rotation" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."encryption_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hidden_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "hidden_by_user_id" "uuid" NOT NULL,
    "hidden_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."hidden_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_status" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "is_delivered" boolean DEFAULT false,
    "is_read" boolean DEFAULT false,
    "delivered_at" timestamp with time zone,
    "read_at" timestamp with time zone
);


ALTER TABLE "public"."message_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "chat_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "content_type" "text" DEFAULT 'text'::"text",
    "media_url" "text",
    "is_encrypted" boolean DEFAULT false,
    "is_one_time_view" boolean DEFAULT false,
    "viewed_at" timestamp with time zone,
    "disappear_after" integer,
    "disappears_at" timestamp with time zone,
    "reply_to_id" "uuid",
    "read_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."presence_updates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "connection_quality" "text" DEFAULT 'unknown'::"text",
    "device_info" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "presence_updates_connection_quality_check" CHECK (("connection_quality" = ANY (ARRAY['excellent'::"text", 'good'::"text", 'poor'::"text", 'unknown'::"text"]))),
    CONSTRAINT "presence_updates_status_check" CHECK (("status" = ANY (ARRAY['online'::"text", 'offline'::"text", 'away'::"text"])))
);


ALTER TABLE "public"."presence_updates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "display_name" "text",
    "avatar_url" "text",
    "status" "text" DEFAULT 'offline'::"text",
    "bio" "text",
    "public_key" "text",
    "last_seen" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reactions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "emoji" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."read_receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."read_receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."starred_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "message_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."starred_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."typing_indicators" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "is_typing" boolean DEFAULT true,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."typing_indicators" OWNER TO "postgres";


ALTER TABLE ONLY "public"."chat_participants"
    ADD CONSTRAINT "chat_participants_chat_id_user_id_key" UNIQUE ("chat_id", "user_id");



ALTER TABLE ONLY "public"."chat_participants"
    ADD CONSTRAINT "chat_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_members_conversation_id_user_id_key" UNIQUE ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_participants"
    ADD CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."encrypted_messages"
    ADD CONSTRAINT "encrypted_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."encryption_keys"
    ADD CONSTRAINT "encryption_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hidden_messages"
    ADD CONSTRAINT "hidden_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hidden_messages"
    ADD CONSTRAINT "hidden_messages_user_message_unique" UNIQUE ("message_id", "user_id");



ALTER TABLE ONLY "public"."message_status"
    ADD CONSTRAINT "message_status_message_id_user_id_key" UNIQUE ("message_id", "user_id");



ALTER TABLE ONLY "public"."message_status"
    ADD CONSTRAINT "message_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."presence_updates"
    ADD CONSTRAINT "presence_updates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."reactions"
    ADD CONSTRAINT "reactions_message_id_user_id_emoji_key" UNIQUE ("message_id", "user_id", "emoji");



ALTER TABLE ONLY "public"."reactions"
    ADD CONSTRAINT "reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."read_receipts"
    ADD CONSTRAINT "read_receipts_message_id_user_id_key" UNIQUE ("message_id", "user_id");



ALTER TABLE ONLY "public"."read_receipts"
    ADD CONSTRAINT "read_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."starred_messages"
    ADD CONSTRAINT "starred_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."starred_messages"
    ADD CONSTRAINT "starred_messages_user_id_message_id_key" UNIQUE ("user_id", "message_id");



ALTER TABLE ONLY "public"."typing_indicators"
    ADD CONSTRAINT "typing_indicators_conversation_id_user_id_key" UNIQUE ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."typing_indicators"
    ADD CONSTRAINT "typing_indicators_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_conversation_members_conversation_id" ON "public"."conversation_members" USING "btree" ("conversation_id");



CREATE INDEX "idx_conversation_members_user_id" ON "public"."conversation_members" USING "btree" ("user_id");



CREATE INDEX "idx_conversations_last_message_at" ON "public"."conversations" USING "btree" ("last_message_at" DESC);



CREATE INDEX "idx_hidden_messages_conversation_id" ON "public"."hidden_messages" USING "btree" ("conversation_id");



CREATE INDEX "idx_hidden_messages_created_at" ON "public"."hidden_messages" USING "btree" ("created_at");



CREATE INDEX "idx_hidden_messages_message_id" ON "public"."hidden_messages" USING "btree" ("message_id");



CREATE INDEX "idx_hidden_messages_user_id" ON "public"."hidden_messages" USING "btree" ("user_id");



CREATE INDEX "idx_message_status_message_id" ON "public"."message_status" USING "btree" ("message_id");



CREATE INDEX "idx_message_status_user_id" ON "public"."message_status" USING "btree" ("user_id");



CREATE INDEX "idx_presence_updates_updated_at" ON "public"."presence_updates" USING "btree" ("updated_at");



CREATE INDEX "idx_presence_updates_user_id" ON "public"."presence_updates" USING "btree" ("user_id");



CREATE INDEX "idx_read_receipts_conversation" ON "public"."read_receipts" USING "btree" ("conversation_id", "read_at");



CREATE INDEX "idx_read_receipts_message_user" ON "public"."read_receipts" USING "btree" ("message_id", "user_id");



CREATE INDEX "idx_read_receipts_user_read_at" ON "public"."read_receipts" USING "btree" ("user_id", "read_at");



CREATE INDEX "idx_starred_messages_created_at" ON "public"."starred_messages" USING "btree" ("created_at");



CREATE INDEX "idx_starred_messages_message_id" ON "public"."starred_messages" USING "btree" ("message_id");



CREATE INDEX "idx_starred_messages_user_id" ON "public"."starred_messages" USING "btree" ("user_id");



CREATE INDEX "idx_typing_indicators_conversation_id" ON "public"."typing_indicators" USING "btree" ("conversation_id");



CREATE INDEX "idx_typing_indicators_updated_at" ON "public"."typing_indicators" USING "btree" ("updated_at");



CREATE INDEX "idx_typing_indicators_user_id" ON "public"."typing_indicators" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "cleanup_stale_typing_indicators" BEFORE INSERT ON "public"."typing_indicators" FOR EACH STATEMENT EXECUTE FUNCTION "public"."cleanup_stale_typing_indicators"();



CREATE OR REPLACE TRIGGER "trigger_update_profile_presence" AFTER INSERT OR UPDATE ON "public"."presence_updates" FOR EACH ROW EXECUTE FUNCTION "public"."update_profile_presence"();



CREATE OR REPLACE TRIGGER "update_read_receipts_updated_at" BEFORE UPDATE ON "public"."read_receipts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_typing_indicators_updated_at" BEFORE UPDATE ON "public"."typing_indicators" FOR EACH ROW EXECUTE FUNCTION "public"."update_typing_indicators_updated_at"();



ALTER TABLE ONLY "public"."chat_participants"
    ADD CONSTRAINT "chat_participants_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_participants"
    ADD CONSTRAINT "chat_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."encryption_keys"
    ADD CONSTRAINT "encryption_keys_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."encryption_keys"
    ADD CONSTRAINT "encryption_keys_initiator_id_fkey" FOREIGN KEY ("initiator_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hidden_messages"
    ADD CONSTRAINT "hidden_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reactions"
    ADD CONSTRAINT "reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reactions"
    ADD CONSTRAINT "reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."read_receipts"
    ADD CONSTRAINT "read_receipts_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."read_receipts"
    ADD CONSTRAINT "read_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."typing_indicators"
    ADD CONSTRAINT "typing_indicators_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE "public"."conversation_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversation_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hidden_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_status" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."presence_updates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."read_receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."starred_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."typing_indicators" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."conversation_participants";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."conversations";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."hidden_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."presence_updates";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."read_receipts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."starred_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."typing_indicators";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."add_user_to_default_conversation"() TO "anon";
GRANT ALL ON FUNCTION "public"."add_user_to_default_conversation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_user_to_default_conversation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_stale_typing_indicators"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_stale_typing_indicators"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_stale_typing_indicators"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_user_in_chat"("_user_id" "uuid", "_chat_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_user_in_chat"("_user_id" "uuid", "_chat_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_user_in_chat"("_user_id" "uuid", "_chat_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_conversation_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_conversation_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_conversation_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_profile_presence"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_profile_presence"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_profile_presence"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_typing_indicators_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_typing_indicators_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_typing_indicators_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















GRANT ALL ON TABLE "public"."chat_participants" TO "anon";
GRANT ALL ON TABLE "public"."chat_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_participants" TO "service_role";



GRANT ALL ON TABLE "public"."chats" TO "anon";
GRANT ALL ON TABLE "public"."chats" TO "authenticated";
GRANT ALL ON TABLE "public"."chats" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_members" TO "anon";
GRANT ALL ON TABLE "public"."conversation_members" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_members" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_participants" TO "anon";
GRANT ALL ON TABLE "public"."conversation_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_participants" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."encrypted_messages" TO "anon";
GRANT ALL ON TABLE "public"."encrypted_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."encrypted_messages" TO "service_role";



GRANT ALL ON TABLE "public"."encryption_keys" TO "anon";
GRANT ALL ON TABLE "public"."encryption_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."encryption_keys" TO "service_role";



GRANT ALL ON TABLE "public"."hidden_messages" TO "anon";
GRANT ALL ON TABLE "public"."hidden_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."hidden_messages" TO "service_role";



GRANT ALL ON TABLE "public"."message_status" TO "anon";
GRANT ALL ON TABLE "public"."message_status" TO "authenticated";
GRANT ALL ON TABLE "public"."message_status" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."presence_updates" TO "anon";
GRANT ALL ON TABLE "public"."presence_updates" TO "authenticated";
GRANT ALL ON TABLE "public"."presence_updates" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."reactions" TO "anon";
GRANT ALL ON TABLE "public"."reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."reactions" TO "service_role";



GRANT ALL ON TABLE "public"."read_receipts" TO "anon";
GRANT ALL ON TABLE "public"."read_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."read_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."starred_messages" TO "anon";
GRANT ALL ON TABLE "public"."starred_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."starred_messages" TO "service_role";



GRANT ALL ON TABLE "public"."typing_indicators" TO "anon";
GRANT ALL ON TABLE "public"."typing_indicators" TO "authenticated";
GRANT ALL ON TABLE "public"."typing_indicators" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































