
-- 1. Make sure RLS is enabled for the chats table
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

-- 2. Allow authenticated users to insert new chats
CREATE POLICY "Authenticated users can create chats"
ON public.chats
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- 3. Allow users to select (see) only chats where they are a participant
-- First, ensure the helper function exists (defined earlier!):
--   is_user_in_chat(_user_id uuid, _chat_id uuid)
-- Now use it in SELECT:
CREATE POLICY "Users can view their own chats"
ON public.chats
FOR SELECT
USING (
  public.is_user_in_chat(auth.uid(), id)
);
