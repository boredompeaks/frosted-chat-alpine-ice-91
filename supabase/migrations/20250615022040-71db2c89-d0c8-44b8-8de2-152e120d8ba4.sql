
-- 1. Create SECURITY DEFINER helper function
CREATE OR REPLACE FUNCTION public.is_user_in_chat(_user_id uuid, _chat_id uuid)
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

-- 2. Remove broken/recursive RLS policy if it exists
DROP POLICY IF EXISTS "Users can view participants in their chats" ON public.chat_participants;

-- 3. Add a proper RLS policy using the helper function
CREATE POLICY "Users can view participants in their chats"
ON public.chat_participants
FOR SELECT
USING (
  public.is_user_in_chat(auth.uid(), chat_id)
);

-- Optionally reapply other policies in case they were broken:
DROP POLICY IF EXISTS "Authenticated users can add participants" ON public.chat_participants;
CREATE POLICY "Authenticated users can add participants"
ON public.chat_participants
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);
