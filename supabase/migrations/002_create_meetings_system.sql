-- =============================================================================
-- Migration: 002_create_meetings_system.sql
-- Purpose: Complete Founder Meeting Hub schema with series, occurrences,
--          participants, notifications, high-performance indexes, RLS policies,
--          and Supabase Realtime publication.
-- =============================================================================

-- 1. Meeting Series Table (reusable and recurring schedule templates)
CREATE TABLE IF NOT EXISTS public.meeting_series (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    meeting_link TEXT NOT NULL,
    meeting_type TEXT NOT NULL CHECK (meeting_type IN ('GENERAL', 'STANDUP', 'SYNC', 'REVIEW', 'STRATEGY', '1ON1', 'ALL_HANDS')) DEFAULT 'GENERAL',
    location TEXT,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    recurrence_rule JSONB NOT NULL DEFAULT '{"type": "NONE"}'::jsonb,
    visibility TEXT NOT NULL CHECK (visibility IN ('ALL', 'LEADERSHIP', 'DEPARTMENT', 'INVITED')) DEFAULT 'ALL',
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Meeting Occurrences Table (Actual scheduled sessions with absolute UTC timestamps)
CREATE TABLE IF NOT EXISTS public.meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    series_id UUID REFERENCES public.meeting_series(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    agenda TEXT,
    additional_notes TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    meeting_link TEXT NOT NULL,
    meeting_type TEXT NOT NULL CHECK (meeting_type IN ('GENERAL', 'STANDUP', 'SYNC', 'REVIEW', 'STRATEGY', '1ON1', 'ALL_HANDS')) DEFAULT 'GENERAL',
    location TEXT,
    status TEXT NOT NULL CHECK (status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED')) DEFAULT 'SCHEDULED',
    cancellation_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    visibility TEXT NOT NULL CHECK (visibility IN ('ALL', 'LEADERSHIP', 'DEPARTMENT', 'INVITED')) DEFAULT 'ALL',
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reminder_preferences JSONB NOT NULL DEFAULT '{"reminder24h": true, "reminder1h": true, "reminder15m": true}'::jsonb,
    attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT meeting_time_order CHECK (end_time > start_time)
);

-- 3. Meeting Participants Table
CREATE TABLE IF NOT EXISTS public.meeting_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('INVITED', 'ACCEPTED', 'DECLINED', 'TENTATIVE', 'ATTENDED')) DEFAULT 'INVITED',
    response_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_meeting_participant UNIQUE (meeting_id, profile_id)
);

-- 4. Meeting In-App Notifications & Reminders Table
CREATE TABLE IF NOT EXISTS public.meeting_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('NEW_MEETING', 'TIME_CHANGED', 'LINK_CHANGED', 'CANCELLED', 'STARTING_SOON', 'STARTED', 'INVITATION')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. High-Performance Indexes for Ultra-Responsive Queries
CREATE INDEX IF NOT EXISTS idx_meetings_start_time ON public.meetings(start_time ASC);
CREATE INDEX IF NOT EXISTS idx_meetings_end_time ON public.meetings(end_time ASC);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON public.meetings(status);
CREATE INDEX IF NOT EXISTS idx_meetings_created_by ON public.meetings(created_by);
CREATE INDEX IF NOT EXISTS idx_meetings_visibility ON public.meetings(visibility);
CREATE INDEX IF NOT EXISTS idx_meetings_department_id ON public.meetings(department_id);
CREATE INDEX IF NOT EXISTS idx_meetings_series_id ON public.meetings(series_id);
CREATE INDEX IF NOT EXISTS idx_meetings_idempotency ON public.meetings(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_meetings_composite_lookup ON public.meetings(status, start_time ASC);

CREATE INDEX IF NOT EXISTS idx_meeting_series_created_by ON public.meeting_series(created_by);
CREATE INDEX IF NOT EXISTS idx_meeting_participants_lookup ON public.meeting_participants(meeting_id, profile_id);
CREATE INDEX IF NOT EXISTS idx_meeting_participants_profile ON public.meeting_participants(profile_id);
CREATE INDEX IF NOT EXISTS idx_meeting_notifications_recipient ON public.meeting_notifications(recipient_id, is_read, created_at DESC);

-- 6. Enable Row Level Security
ALTER TABLE public.meeting_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_notifications ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for Meeting Series
DROP POLICY IF EXISTS "Series View Policy" ON public.meeting_series;
CREATE POLICY "Series View Policy" ON public.meeting_series
    FOR SELECT TO authenticated
    USING (
        public.is_admin_or_founder()
        OR public.is_founding_advisor()
        OR visibility = 'ALL'
        OR (visibility = 'DEPARTMENT' AND department_id IN (
            SELECT department_id FROM public.department_members WHERE user_id = auth.uid()
        ))
        OR created_by IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Series Modify Policy" ON public.meeting_series;
CREATE POLICY "Series Modify Policy" ON public.meeting_series
    FOR ALL TO authenticated
    USING (
        public.is_admin_or_founder()
        OR created_by IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    )
    WITH CHECK (
        public.is_admin_or_founder()
        OR created_by IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    );

-- 8. RLS Policies for Meetings Occurrences
DROP POLICY IF EXISTS "Meetings View Policy" ON public.meetings;
CREATE POLICY "Meetings View Policy" ON public.meetings
    FOR SELECT TO authenticated
    USING (
        public.is_admin_or_founder()
        OR (visibility = 'LEADERSHIP' AND (public.is_admin_or_founder() OR public.is_founding_advisor()))
        OR visibility = 'ALL'
        OR (visibility = 'DEPARTMENT' AND department_id IN (
            SELECT department_id FROM public.department_members WHERE user_id = auth.uid()
        ))
        OR (visibility = 'INVITED' AND id IN (
            SELECT meeting_id FROM public.meeting_participants WHERE profile_id IN (
                SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()
            )
        ))
        OR created_by IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Meetings Insert Policy" ON public.meetings;
CREATE POLICY "Meetings Insert Policy" ON public.meetings
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_admin_or_founder()
        OR created_by IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Meetings Update Policy" ON public.meetings;
CREATE POLICY "Meetings Update Policy" ON public.meetings
    FOR UPDATE TO authenticated
    USING (
        public.is_admin_or_founder()
        OR created_by IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    )
    WITH CHECK (
        public.is_admin_or_founder()
        OR created_by IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Meetings Delete Policy" ON public.meetings;
CREATE POLICY "Meetings Delete Policy" ON public.meetings
    FOR DELETE TO authenticated
    USING (
        public.is_admin_or_founder()
        OR created_by IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    );

-- 9. RLS Policies for Participants
DROP POLICY IF EXISTS "Participants View Policy" ON public.meeting_participants;
CREATE POLICY "Participants View Policy" ON public.meeting_participants
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Participants Modify Policy" ON public.meeting_participants;
CREATE POLICY "Participants Modify Policy" ON public.meeting_participants
    FOR ALL TO authenticated
    USING (
        public.is_admin_or_founder()
        OR profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    )
    WITH CHECK (
        public.is_admin_or_founder()
        OR profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    );

-- 10. RLS Policies for In-App Notifications
DROP POLICY IF EXISTS "Notifications View Policy" ON public.meeting_notifications;
CREATE POLICY "Notifications View Policy" ON public.meeting_notifications
    FOR SELECT TO authenticated
    USING (
        recipient_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
        OR public.is_admin_or_founder()
    );

DROP POLICY IF EXISTS "Notifications Modify Policy" ON public.meeting_notifications;
CREATE POLICY "Notifications Modify Policy" ON public.meeting_notifications
    FOR ALL TO authenticated
    USING (
        recipient_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
        OR public.is_admin_or_founder()
    )
    WITH CHECK (
        recipient_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
        OR public.is_admin_or_founder()
    );

-- 11. Supabase Realtime Publication
-- Safely add tables to supabase_realtime publication
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'meetings'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'meeting_notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_notifications;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'meeting_participants'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_participants;
    END IF;
END $$;

