-- =============================================================================
-- Migration: 005_create_weekly_meeting_attendance.sql
-- Purpose: Weekly Meeting Attendance Management System
--          Includes explicit weekly meeting classification, attendance records,
--          audit history trail, high-performance indexes, RLS policies,
--          and Realtime publication.
-- =============================================================================

-- 1. Add explicit weekly meeting classification to meetings & meeting_series
ALTER TABLE public.meetings 
ADD COLUMN IF NOT EXISTS is_weekly_meeting BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.meeting_series 
ADD COLUMN IF NOT EXISTS is_weekly_meeting BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing weekly meetings if series had weekly recurrence
UPDATE public.meeting_series
SET is_weekly_meeting = true
WHERE recurrence_rule->>'frequency' = 'WEEKLY' 
   OR recurrence_rule->>'type' = 'WEEKLY';

UPDATE public.meetings m
SET is_weekly_meeting = true
WHERE m.series_id IN (
    SELECT id FROM public.meeting_series WHERE is_weekly_meeting = true
);

-- Index for instant lookup of weekly attendance-eligible meetings
CREATE INDEX IF NOT EXISTS idx_meetings_is_weekly 
ON public.meetings(is_weekly_meeting) 
WHERE is_weekly_meeting = true;

-- 2. Meeting Attendance Records Table
CREATE TABLE IF NOT EXISTS public.meeting_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('PRESENT', 'ABSENT', 'UNMARKED')) DEFAULT 'UNMARKED',
    marked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    marked_at TIMESTAMPTZ,
    correction_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_meeting_attendance_per_user UNIQUE (meeting_id, user_id)
);

-- Indexes for meeting_attendance
CREATE INDEX IF NOT EXISTS idx_meeting_attendance_meeting ON public.meeting_attendance(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendance_user ON public.meeting_attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendance_status ON public.meeting_attendance(status);
CREATE INDEX IF NOT EXISTS idx_meeting_attendance_composite ON public.meeting_attendance(meeting_id, user_id, status);

-- 3. Meeting Attendance Audit History Table
CREATE TABLE IF NOT EXISTS public.meeting_attendance_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attendance_id UUID REFERENCES public.meeting_attendance(id) ON DELETE CASCADE,
    meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    previous_status TEXT CHECK (previous_status IN ('PRESENT', 'ABSENT', 'UNMARKED')),
    new_status TEXT NOT NULL CHECK (new_status IN ('PRESENT', 'ABSENT', 'UNMARKED')),
    changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    correction_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for audit history lookups
CREATE INDEX IF NOT EXISTS idx_attendance_history_lookup 
ON public.meeting_attendance_history(meeting_id, user_id, created_at DESC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.meeting_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_attendance_history ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for meeting_attendance
-- A. View Policy: Founder & Admin see all; Members see ONLY their own records
DROP POLICY IF EXISTS "Attendance View Policy" ON public.meeting_attendance;
CREATE POLICY "Attendance View Policy" ON public.meeting_attendance
    FOR SELECT TO authenticated
    USING (
        public.is_admin_or_founder()
        OR user_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    );

-- B. Modify Policy: Strictly Founder & Admin only (Members cannot mark/edit)
DROP POLICY IF EXISTS "Attendance Modify Policy" ON public.meeting_attendance;
CREATE POLICY "Attendance Modify Policy" ON public.meeting_attendance
    FOR ALL TO authenticated
    USING (
        public.is_admin_or_founder()
    )
    WITH CHECK (
        public.is_admin_or_founder()
    );

-- 6. RLS Policies for meeting_attendance_history
DROP POLICY IF EXISTS "Attendance History View Policy" ON public.meeting_attendance_history;
CREATE POLICY "Attendance History View Policy" ON public.meeting_attendance_history
    FOR SELECT TO authenticated
    USING (
        public.is_admin_or_founder()
        OR user_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Attendance History Modify Policy" ON public.meeting_attendance_history;
CREATE POLICY "Attendance History Modify Policy" ON public.meeting_attendance_history
    FOR ALL TO authenticated
    USING (
        public.is_admin_or_founder()
    )
    WITH CHECK (
        public.is_admin_or_founder()
    );

-- 7. Register meeting_attendance with Supabase Realtime Publication
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'meeting_attendance'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_attendance;
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Publication might not exist in local testing environment
    NULL;
END $$;

