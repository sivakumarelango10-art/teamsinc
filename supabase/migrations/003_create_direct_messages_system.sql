-- =============================================================================
-- TeamSync: 1-to-1 Private Direct Messaging System Migration
-- Migration 003: Creates direct_conversations and direct_messages with
-- strict participant isolation, canonical pair indexing, and real-time support.
-- =============================================================================

-- 1. Helper function to reliably get the current authenticated user's profile ID
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS UUID AS $$
    SELECT id FROM public.profiles 
    WHERE (auth_user_id = auth.uid() OR LOWER(email) = LOWER(auth.jwt()->>'email'))
    LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- 2. DIRECT CONVERSATIONS TABLE
-- Tracks distinct 1-to-1 conversations between two unique profiles.
CREATE TABLE IF NOT EXISTS public.direct_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_one_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    participant_two_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_message_preview TEXT DEFAULT '',
    last_message_sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Enforce canonical ordering: participant_one_id must be strictly less than participant_two_id
    CONSTRAINT chk_canonical_participants CHECK (participant_one_id < participant_two_id),
    CONSTRAINT uq_direct_participants UNIQUE (participant_one_id, participant_two_id)
);

-- Indexes for lightning-fast queries
CREATE INDEX IF NOT EXISTS idx_direct_conv_p1 ON public.direct_conversations(participant_one_id);
CREATE INDEX IF NOT EXISTS idx_direct_conv_p2 ON public.direct_conversations(participant_two_id);
CREATE INDEX IF NOT EXISTS idx_direct_conv_last_msg ON public.direct_conversations(last_message_at DESC);

-- 3. DIRECT MESSAGES TABLE
-- Stores private 1-to-1 messages with sender, recipient, read receipts, and attachments.
CREATE TABLE IF NOT EXISTS public.direct_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.direct_conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL DEFAULT '',
    file_url TEXT,
    file_name TEXT,
    file_size BIGINT,
    file_type TEXT,
    is_read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for direct message retrieval & unread count
CREATE INDEX IF NOT EXISTS idx_direct_msg_conv_created ON public.direct_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_direct_msg_sender ON public.direct_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_direct_msg_recipient_unread ON public.direct_messages(recipient_id, is_read) WHERE is_read = false;

-- 4. Trigger to automatically update conversation preview & timestamp on new message
CREATE OR REPLACE FUNCTION public.handle_direct_message_inserted()
RETURNS trigger AS $$
BEGIN
    UPDATE public.direct_conversations
    SET last_message_at = NEW.created_at,
        last_message_preview = SUBSTRING(
            COALESCE(NULLIF(TRIM(NEW.content), ''), NEW.file_name, 'Attachment') 
            FROM 1 FOR 120
        ),
        last_message_sender_id = NEW.sender_id,
        updated_at = now()
    WHERE id = NEW.conversation_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_direct_message_inserted ON public.direct_messages;
CREATE TRIGGER trg_direct_message_inserted
AFTER INSERT ON public.direct_messages
FOR EACH ROW EXECUTE FUNCTION public.handle_direct_message_inserted();

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.direct_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

-- Conversations RLS
DROP POLICY IF EXISTS "direct_conversations_select" ON public.direct_conversations;
CREATE POLICY "direct_conversations_select"
    ON public.direct_conversations FOR SELECT
    TO authenticated
    USING (
        participant_one_id = public.current_profile_id() 
        OR participant_two_id = public.current_profile_id()
    );

DROP POLICY IF EXISTS "direct_conversations_insert" ON public.direct_conversations;
CREATE POLICY "direct_conversations_insert"
    ON public.direct_conversations FOR INSERT
    TO authenticated
    WITH CHECK (
        participant_one_id = public.current_profile_id() 
        OR participant_two_id = public.current_profile_id()
    );

DROP POLICY IF EXISTS "direct_conversations_update" ON public.direct_conversations;
CREATE POLICY "direct_conversations_update"
    ON public.direct_conversations FOR UPDATE
    TO authenticated
    USING (
        participant_one_id = public.current_profile_id() 
        OR participant_two_id = public.current_profile_id()
    );

-- Messages RLS
DROP POLICY IF EXISTS "direct_messages_select" ON public.direct_messages;
CREATE POLICY "direct_messages_select"
    ON public.direct_messages FOR SELECT
    TO authenticated
    USING (
        sender_id = public.current_profile_id() 
        OR recipient_id = public.current_profile_id()
    );

DROP POLICY IF EXISTS "direct_messages_insert" ON public.direct_messages;
CREATE POLICY "direct_messages_insert"
    ON public.direct_messages FOR INSERT
    TO authenticated
    WITH CHECK (
        sender_id = public.current_profile_id()
    );

DROP POLICY IF EXISTS "direct_messages_update" ON public.direct_messages;
CREATE POLICY "direct_messages_update"
    ON public.direct_messages FOR UPDATE
    TO authenticated
    USING (
        recipient_id = public.current_profile_id() 
        OR sender_id = public.current_profile_id()
    );

DROP POLICY IF EXISTS "direct_messages_delete" ON public.direct_messages;
CREATE POLICY "direct_messages_delete"
    ON public.direct_messages FOR DELETE
    TO authenticated
    USING (
        sender_id = public.current_profile_id()
    );

-- 6. Add both tables to Supabase Realtime publication
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'direct_conversations'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_conversations;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'direct_messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Notice adding to realtime publication: %', SQLERRM;
END $$;
