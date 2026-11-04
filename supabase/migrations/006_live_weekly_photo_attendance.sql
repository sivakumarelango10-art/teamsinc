-- =============================================================================
-- 006_live_weekly_photo_attendance.sql
-- Five-minute, server-timed photo attendance sessions for weekly occurrences.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.meeting_attendance_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL UNIQUE REFERENCES public.meetings(id) ON DELETE CASCADE,
  started_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'CANCELLED')),
  verification_method TEXT NOT NULL DEFAULT 'SUPABASE_TOTP_MFA',
  verified_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attendance_session_window CHECK (expires_at = started_at + interval '5 minutes')
);

ALTER TABLE public.meeting_attendance
  ADD COLUMN IF NOT EXISTS attendance_session_id UUID REFERENCES public.meeting_attendance_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS photo_path TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submission_method TEXT;

-- Existing attendance status checks already allow PRESENT, ABSENT and UNMARKED.
-- The expiry worker records non-submitters as ABSENT with an explanatory audit note.

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_open_expiry
  ON public.meeting_attendance_sessions(status, expires_at)
  WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_attendance_session_records
  ON public.meeting_attendance(attendance_session_id, user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_submitted
  ON public.meeting_attendance(meeting_id, submitted_at DESC)
  WHERE submitted_at IS NOT NULL;

ALTER TABLE public.meeting_attendance_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Attendance session participants can view own session" ON public.meeting_attendance_sessions;
CREATE POLICY "Attendance session participants can view own session"
  ON public.meeting_attendance_sessions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.auth_user_id = auth.uid()
        AND p.role = 'FOUNDER'
    )
    OR EXISTS (
      SELECT 1
      FROM public.meeting_attendance a
      JOIN public.profiles p ON p.id = a.user_id
      WHERE a.attendance_session_id = meeting_attendance_sessions.id
        AND p.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Founder manages attendance sessions" ON public.meeting_attendance_sessions;
CREATE POLICY "Founder manages attendance sessions"
  ON public.meeting_attendance_sessions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.auth_user_id = auth.uid()
        AND p.role = 'FOUNDER'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.auth_user_id = auth.uid()
        AND p.role = 'FOUNDER'
    )
  );

-- The bucket is private. The API verifies the session deadline and participant.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'weekly-attendance-photos',
  'weekly-attendance-photos',
  false,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS "Weekly attendance owners upload own photo" ON storage.objects;
CREATE POLICY "Weekly attendance owners upload own photo"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'weekly-attendance-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Weekly attendance owners and Founder read photos" ON storage.objects;
CREATE POLICY "Weekly attendance owners and Founder read photos"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'weekly-attendance-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.auth_user_id = auth.uid()
          AND p.role = 'FOUNDER'
      )
    )
  );

DROP POLICY IF EXISTS "Weekly attendance owners delete own photo" ON storage.objects;
CREATE POLICY "Weekly attendance owners delete own photo"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'weekly-attendance-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Notify eligible participants when their five-minute window opens.
ALTER TABLE public.meeting_notifications
  DROP CONSTRAINT IF EXISTS meeting_notifications_type_check;
ALTER TABLE public.meeting_notifications
  ADD CONSTRAINT meeting_notifications_type_check
  CHECK (type IN (
    'NEW_MEETING', 'TIME_CHANGED', 'LINK_CHANGED', 'CANCELLED',
    'STARTING_SOON', 'STARTED', 'INVITATION', 'ATTENDANCE_OPENED'
  ));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'meeting_attendance_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_attendance_sessions;
  END IF;
EXCEPTION WHEN undefined_object THEN
  RAISE NOTICE 'supabase_realtime publication not available in this environment';
END $$;
