
-- 1. Drop all SELECT policies on chat_participants to ensure clean slate
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT policyname FROM pg_policies WHERE tablename = 'chat_participants' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s" ON public.chat_participants;', rec.policyname);
  END LOOP;
END $$;

-- 2. (Re-)create helper function using SECURITY DEFINER and STABLE
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

-- 3. Create just ONE correct RLS policy for SELECT
CREATE POLICY "Users can view participants in their chats"
ON public.chat_participants
FOR SELECT
USING (
  public.is_user_in_chat(auth.uid(), chat_id)
);

-- 4. Optionally, re-apply INSERT policy if needed
DROP POLICY IF EXISTS "Authenticated users can add participants" ON public.chat_participants;
CREATE POLICY "Authenticated users can add participants"
ON public.chat_participants
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);
