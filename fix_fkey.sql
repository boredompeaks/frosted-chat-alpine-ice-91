-- Drop the foreign key constraint
ALTER TABLE public.chats DROP CONSTRAINT IF EXISTS chats_created_by_fkey;

-- Make created_by nullable
ALTER TABLE public.chats ALTER COLUMN created_by DROP NOT NULL;

-- Ensure profiles exist for all auth users
INSERT INTO public.profiles (id, username, display_name, status)
SELECT 
  id,
  COALESCE(raw_user_meta_data->>'username', 'user_' || substr(id::text, 1, 8)),
  COALESCE(raw_user_meta_data->>'display_name', email),
  'online'
FROM auth.users
ON CONFLICT (id) DO NOTHING;
