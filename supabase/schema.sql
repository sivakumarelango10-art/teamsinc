-- =============================================================================
-- TeamSync: Complete PostgreSQL Database Schema & Security Definition
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Clean drop of existing objects to ensure 100% clean slate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP TABLE IF EXISTS public.daily_assignments CASCADE;
DROP TABLE IF EXISTS public.daily_plans CASCADE;
DROP TABLE IF EXISTS public.tasks CASCADE;
DROP TABLE IF EXISTS public.departments CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- -----------------------------------------------------------------------------
-- 1. PROFILES TABLE (Pre-registered Team Members & Access Control)
-- -----------------------------------------------------------------------------
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('FOUNDER', 'ADMIN', 'MEMBER')) DEFAULT 'MEMBER',
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_seen_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2. DEPARTMENTS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 3. TASKS TABLE (Clean Slate)
-- -----------------------------------------------------------------------------
CREATE TABLE public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL CHECK (status IN ('TODO', 'IN_PROGRESS', 'COMPLETED')) DEFAULT 'TODO',
    priority TEXT NOT NULL CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')) DEFAULT 'MEDIUM',
    deadline DATE NOT NULL,
    assigned_to UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 4. DAILY PLANS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE public.daily_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_date DATE NOT NULL UNIQUE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 5. DAILY ASSIGNMENTS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE public.daily_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES public.daily_plans(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_user_dept_per_plan UNIQUE (plan_id, user_id, department_id)
);

-- -----------------------------------------------------------------------------
-- INDEXES
-- -----------------------------------------------------------------------------
CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_email ON public.profiles(email);
CREATE INDEX idx_profiles_auth_user_id ON public.profiles(auth_user_id);
CREATE INDEX idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX idx_tasks_department ON public.tasks(department_id);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_daily_plans_date ON public.daily_plans(plan_date);
CREATE INDEX idx_daily_assignments_plan ON public.daily_assignments(plan_id);
CREATE INDEX idx_daily_assignments_user ON public.daily_assignments(user_id);

-- -----------------------------------------------------------------------------
-- AUTOMATED UPDATED_AT TRIGGER
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_update_tasks_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- AUTHENTICATION TRIGGER: LINK ON SIGN IN & REJECT UNREGISTERED
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    reg_profile public.profiles%ROWTYPE;
BEGIN
    -- Check if email exists in registered profiles
    SELECT * INTO reg_profile FROM public.profiles WHERE LOWER(email) = LOWER(NEW.email);

    -- Special Exception: Founder is always registered
    IF LOWER(NEW.email) = 'sivakumarelango10@gmail.com' THEN
        IF reg_profile.id IS NULL THEN
            INSERT INTO public.profiles (auth_user_id, full_name, email, role, is_active)
            VALUES (NEW.id, 'Sivakumar Elango', LOWER(NEW.email), 'FOUNDER', true);
        ELSE
            UPDATE public.profiles
            SET auth_user_id = NEW.id, role = 'FOUNDER', is_active = true
            WHERE id = reg_profile.id;
        END IF;
        RETURN NEW;
    END IF;

    -- For all other users: They MUST be pre-registered in profiles!
    IF reg_profile.id IS NULL THEN
        RAISE EXCEPTION 'Access Denied: Your email % is not registered by the Founder.', NEW.email;
    END IF;

    IF NOT reg_profile.is_active THEN
        RAISE EXCEPTION 'Access Denied: Account % has been deactivated by the Founder.', NEW.email;
    END IF;

    -- Link auth_user_id to the pre-registered profile
    UPDATE public.profiles
    SET auth_user_id = NEW.id
    WHERE id = reg_profile.id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_assignments ENABLE ROW LEVEL SECURITY;

-- Helper security functions
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
    SELECT role FROM public.profiles WHERE auth_user_id = auth.uid() OR LOWER(email) = LOWER(auth.jwt()->>'email');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_founder()
RETURNS BOOLEAN AS $$
    SELECT (LOWER(auth.jwt()->>'email') = 'sivakumarelango10@gmail.com') OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE (auth_user_id = auth.uid() OR LOWER(email) = LOWER(auth.jwt()->>'email'))
          AND role = 'FOUNDER'
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin_or_founder()
RETURNS BOOLEAN AS $$
    SELECT (LOWER(auth.jwt()->>'email') = 'sivakumarelango10@gmail.com') OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE (auth_user_id = auth.uid() OR LOWER(email) = LOWER(auth.jwt()->>'email'))
          AND role IN ('FOUNDER', 'ADMIN')
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Enable Realtime Publication for profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;

-- PROFILES POLICIES
CREATE POLICY "Anyone authenticated can view active profiles"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (is_active = true OR auth_user_id = auth.uid() OR public.is_founder());

CREATE POLICY "Founder can manage all profiles"
    ON public.profiles FOR ALL
    TO authenticated
    USING (public.is_founder());

-- Allow anon to read profile by email for registration validation before signin
CREATE POLICY "Public can check email registration"
    ON public.profiles FOR SELECT
    TO anon
    USING (true);

-- DEPARTMENTS POLICIES
CREATE POLICY "All authenticated view departments"
    ON public.departments FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Founder and Admin manage departments"
    ON public.departments FOR ALL
    TO authenticated
    USING (public.is_admin_or_founder());

-- TASKS POLICIES
CREATE POLICY "Founder and Admin manage tasks"
    ON public.tasks FOR ALL
    TO authenticated
    USING (public.is_admin_or_founder());

CREATE POLICY "Members view assigned tasks"
    ON public.tasks FOR SELECT
    TO authenticated
    USING (
        assigned_to IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    );

CREATE POLICY "Members update assigned task status"
    ON public.tasks FOR UPDATE
    TO authenticated
    USING (
        assigned_to IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    )
    WITH CHECK (
        assigned_to IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    );

-- DAILY PLANS POLICIES
CREATE POLICY "Founder and Admin manage daily plans"
    ON public.daily_plans FOR ALL
    TO authenticated
    USING (public.is_admin_or_founder());

CREATE POLICY "All authenticated view daily plans"
    ON public.daily_plans FOR SELECT
    TO authenticated
    USING (true);

-- DAILY ASSIGNMENTS POLICIES
CREATE POLICY "Founder and Admin manage daily assignments"
    ON public.daily_assignments FOR ALL
    TO authenticated
    USING (public.is_admin_or_founder());

CREATE POLICY "All authenticated view daily assignments"
    ON public.daily_assignments FOR SELECT
    TO authenticated
    USING (true);

-- -----------------------------------------------------------------------------
-- SEED INITIAL DEPARTMENTS
-- -----------------------------------------------------------------------------
INSERT INTO public.departments (name, description) VALUES
    ('Designing', 'UI/UX design, visual identities, wireframing, and interactive prototyping'),
    ('Development', 'Web, mobile, API, and cloud infrastructure engineering'),
    ('Marketing', 'Digital marketing, SEO, social campaigns, and brand growth'),
    ('Testing', 'QA automation, manual verification, and release quality assurance'),
    ('Content', 'Technical copywriting, marketing copy, and documentation'),
    ('Management', 'Scrum management, product roadmap, and strategic planning')
ON CONFLICT (name) DO NOTHING;

-- -----------------------------------------------------------------------------
-- SEED REGISTERED PROFILES (Founder + 5 Authorized Team Members)
-- -----------------------------------------------------------------------------
INSERT INTO public.profiles (full_name, email, role, is_active) VALUES
    ('Sivakumar Elango', 'sivakumarelango10@gmail.com', 'FOUNDER', true),
    ('Alina Syed Ali', 'alinasyedali786@gmail.com', 'MEMBER', true),
    ('Yashas', 'yashas1325143@gmail.com', 'MEMBER', true),
    ('Kavya Ramesh', 'kavyaramesh293@gmail.com', 'MEMBER', true),
    ('Prajith P', 'prajith.p.dev.1@gmail.com', 'MEMBER', true),
    ('SG Jitbros', 'sgjitbros@gmail.com', 'MEMBER', true)
ON CONFLICT (email) DO UPDATE
SET full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    is_active = true;

-- -----------------------------------------------------------------------------
-- 6. COMPANY-WIDE TEAM CHAT MESSAGES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    sender_name TEXT NOT NULL,
    sender_email TEXT NOT NULL,
    sender_role TEXT NOT NULL DEFAULT 'MEMBER',
    content TEXT NOT NULL DEFAULT '',
    file_url TEXT,
    file_name TEXT,
    file_size BIGINT,
    file_type TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS file_type TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at ASC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can view messages" ON public.messages;
CREATE POLICY "Anyone authenticated can view messages"
    ON public.messages FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Anyone authenticated can insert messages" ON public.messages;
CREATE POLICY "Anyone authenticated can insert messages"
    ON public.messages FOR INSERT
    TO authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Founder or author can delete messages" ON public.messages;
CREATE POLICY "Founder or author can delete messages"
    ON public.messages FOR DELETE
    TO authenticated
    USING (
        public.is_founder() OR
        sender_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid() OR LOWER(email) = LOWER(auth.jwt()->>'email'))
    );

-- -----------------------------------------------------------------------------
-- 7. GROUP CALL SESSIONS & CALL HISTORY
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.call_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id TEXT NOT NULL DEFAULT 'general',
    room_title TEXT NOT NULL DEFAULT 'TeamSync HQ General Call',
    call_type TEXT NOT NULL DEFAULT 'video',
    caller_name TEXT NOT NULL,
    caller_email TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER DEFAULT 0,
    participants JSONB DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'ended',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_history_room_id ON public.call_history(room_id);
CREATE INDEX IF NOT EXISTS idx_call_history_created_at ON public.call_history(created_at DESC);

ALTER TABLE public.call_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can view call_history" ON public.call_history;
CREATE POLICY "Anyone authenticated can view call_history"
    ON public.call_history FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Anyone authenticated can insert call_history" ON public.call_history;
CREATE POLICY "Anyone authenticated can insert call_history"
    ON public.call_history FOR INSERT
    TO authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone authenticated can update call_history" ON public.call_history;
CREATE POLICY "Anyone authenticated can update call_history"
    ON public.call_history FOR UPDATE
    TO authenticated
    USING (true);

-- -----------------------------------------------------------------------------
-- 8. COMPOSITE PERFORMANCE INDEXES
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_messages_created_at_desc ON public.messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_history_room_status ON public.call_history(room_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status ON public.tasks(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_profiles_active_email ON public.profiles(email, is_active);

-- -----------------------------------------------------------------------------
-- 9. PUSH NOTIFICATION SUBSCRIPTIONS
--    Supports multiple subscriptions per user (one per device/browser).
--    The VAPID private key NEVER lives here — it lives in Edge Function secrets.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    device_id   TEXT        NOT NULL,
    endpoint    TEXT        NOT NULL,
    p256dh      TEXT        NOT NULL,
    auth        TEXT        NOT NULL,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_user_device UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON public.push_subscriptions(endpoint);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own push subscriptions
DROP POLICY IF EXISTS "Users manage own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users manage own push subscriptions"
    ON public.push_subscriptions FOR ALL
    TO authenticated
    USING (
        user_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    )
    WITH CHECK (
        user_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    );

-- Service role (Edge Functions) can read all subscriptions to send pushes
-- (No RLS policy needed for service_role — it bypasses RLS by design)

