-- =============================================================================
-- Migration: 004_create_collaboration_system.sql
-- Description: Collaboration System for TeamSync / SINC Platform
-- Includes: Polls, Poll Options, Poll Votes, Notes, To-Do Items,
--           Task Progress Reports, Task Transfers, Transfer History,
--           Collaboration Notifications, and message metadata columns.
-- =============================================================================

-- 1. Extend tasks table with progress_percentage and updated status constraint
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS progress_percentage INT DEFAULT 0;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check 
  CHECK (status IN ('TODO', 'IN_PROGRESS', 'ON_HOLD', 'BLOCKED', 'UNDER_REVIEW', 'COMPLETED', 'CANCELLED'));

-- 2. Extend messages and direct_messages with metadata column
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 3. POLLS TABLE
CREATE TABLE IF NOT EXISTS public.polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES public.direct_conversations(id) ON DELETE CASCADE,
    channel TEXT,
    question TEXT NOT NULL,
    description TEXT,
    is_multiple_choice BOOLEAN NOT NULL DEFAULT false,
    is_anonymous BOOLEAN NOT NULL DEFAULT false,
    allow_vote_change BOOLEAN NOT NULL DEFAULT true,
    closes_at TIMESTAMPTZ,
    is_closed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_polls_channel ON public.polls(channel);
CREATE INDEX IF NOT EXISTS idx_polls_conversation ON public.polls(conversation_id);
CREATE INDEX IF NOT EXISTS idx_polls_creator ON public.polls(creator_id);

-- 4. POLL OPTIONS TABLE
CREATE TABLE IF NOT EXISTS public.poll_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    option_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON public.poll_options(poll_id, option_order ASC);

-- 5. POLL VOTES TABLE
CREATE TABLE IF NOT EXISTS public.poll_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
    option_id UUID NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
    voter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    voter_name TEXT,
    voter_email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_poll_voter_option UNIQUE (poll_id, option_id, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON public.poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_voter ON public.poll_votes(voter_id);

-- 6. NOTES TABLE
CREATE TABLE IF NOT EXISTS public.notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES public.direct_conversations(id) ON DELETE SET NULL,
    channel TEXT,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL CHECK (category IN ('GENERAL', 'TODO', 'TASK_LINKED')) DEFAULT 'GENERAL',
    visibility TEXT NOT NULL CHECK (visibility IN ('PERSONAL', 'SHARED')) DEFAULT 'PERSONAL',
    is_archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notes_author ON public.notes(author_id);
CREATE INDEX IF NOT EXISTS idx_notes_task ON public.notes(task_id);
CREATE INDEX IF NOT EXISTS idx_notes_visibility ON public.notes(visibility);

-- 7. TO-DO ITEMS TABLE (Checklists)
CREATE TABLE IF NOT EXISTS public.todo_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID REFERENCES public.notes(id) ON DELETE CASCADE,
    task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    is_completed BOOLEAN NOT NULL DEFAULT false,
    assignee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    due_date DATE,
    priority TEXT CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')) DEFAULT 'MEDIUM',
    item_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_todo_items_note ON public.todo_items(note_id, item_order ASC);
CREATE INDEX IF NOT EXISTS idx_todo_items_task ON public.todo_items(task_id);

-- 8. TASK PROGRESS REPORTS TABLE
CREATE TABLE IF NOT EXISTS public.task_progress_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    progress_percentage INT DEFAULT 0,
    summary TEXT NOT NULL,
    work_completed TEXT,
    work_in_progress TEXT,
    blockers TEXT,
    assistance_required TEXT,
    next_steps TEXT,
    expected_completion_date DATE,
    attachments JSONB DEFAULT '[]'::jsonb,
    conversation_id UUID REFERENCES public.direct_conversations(id) ON DELETE SET NULL,
    channel TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_reports_task ON public.task_progress_reports(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_reports_reporter ON public.task_progress_reports(reporter_id);

-- 9. TASK TRANSFERS TABLE
CREATE TABLE IF NOT EXISTS public.task_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    from_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    to_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED')) DEFAULT 'PENDING',
    rejection_reason TEXT,
    work_completed TEXT,
    remaining_work TEXT,
    blockers TEXT,
    handover_notes TEXT,
    suggested_next_steps TEXT,
    conversation_id UUID REFERENCES public.direct_conversations(id) ON DELETE SET NULL,
    channel TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_transfers_task ON public.task_transfers(task_id);
CREATE INDEX IF NOT EXISTS idx_transfers_from_user ON public.task_transfers(from_user_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to_user ON public.task_transfers(to_user_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON public.task_transfers(status);

-- 10. TASK TRANSFER HISTORY TABLE
CREATE TABLE IF NOT EXISTS public.task_transfer_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    transfer_id UUID REFERENCES public.task_transfers(id) ON DELETE SET NULL,
    from_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    to_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL, -- 'REQUESTED', 'ACCEPTED', 'REJECTED', 'CANCELLED'
    reason TEXT,
    notes TEXT,
    performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transfer_hist_task ON public.task_transfer_history(task_id, created_at ASC);

-- 11. COLLABORATION NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.collaboration_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    reference_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collab_notif_recipient ON public.collaboration_notifications(recipient_id, is_read, created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_progress_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_transfer_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaboration_notifications ENABLE ROW LEVEL SECURITY;

-- Permissive RLS Policies for authenticated users
DO $$
BEGIN
  -- Polls
  DROP POLICY IF EXISTS "Polls access policy" ON public.polls;
  CREATE POLICY "Polls access policy" ON public.polls FOR ALL TO authenticated USING (true) WITH CHECK (true);

  -- Poll Options
  DROP POLICY IF EXISTS "Poll options access policy" ON public.poll_options;
  CREATE POLICY "Poll options access policy" ON public.poll_options FOR ALL TO authenticated USING (true) WITH CHECK (true);

  -- Poll Votes
  DROP POLICY IF EXISTS "Poll votes access policy" ON public.poll_votes;
  CREATE POLICY "Poll votes access policy" ON public.poll_votes FOR ALL TO authenticated USING (true) WITH CHECK (true);

  -- Notes (Personal notes only viewable by author, shared notes viewable by all authenticated)
  DROP POLICY IF EXISTS "Notes access policy" ON public.notes;
  CREATE POLICY "Notes access policy" ON public.notes FOR ALL TO authenticated 
    USING (visibility = 'SHARED' OR author_id = auth.uid() OR author_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()))
    WITH CHECK (true);

  -- To-do items
  DROP POLICY IF EXISTS "Todo items access policy" ON public.todo_items;
  CREATE POLICY "Todo items access policy" ON public.todo_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

  -- Task Progress Reports
  DROP POLICY IF EXISTS "Task progress reports policy" ON public.task_progress_reports;
  CREATE POLICY "Task progress reports policy" ON public.task_progress_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);

  -- Task Transfers
  DROP POLICY IF EXISTS "Task transfers access policy" ON public.task_transfers;
  CREATE POLICY "Task transfers access policy" ON public.task_transfers FOR ALL TO authenticated USING (true) WITH CHECK (true);

  -- Task Transfer History
  DROP POLICY IF EXISTS "Task transfer history access policy" ON public.task_transfer_history;
  CREATE POLICY "Task transfer history access policy" ON public.task_transfer_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

  -- Collaboration Notifications
  DROP POLICY IF EXISTS "Collab notifications access policy" ON public.collaboration_notifications;
  CREATE POLICY "Collab notifications access policy" ON public.collaboration_notifications FOR ALL TO authenticated 
    USING (recipient_id = auth.uid() OR recipient_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()))
    WITH CHECK (true);
END $$;

-- Enable Realtime for the new collaboration tables if publication exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.polls;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.poll_options;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.poll_votes;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.todo_items;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_progress_reports;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_transfers;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.collaboration_notifications;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
