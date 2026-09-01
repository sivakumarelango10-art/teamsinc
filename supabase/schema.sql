-- =============================================================================
-- TeamSync: Complete PostgreSQL Database Schema & Security Definition
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. PROFILES TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('FOUNDER', 'ADMIN', 'MEMBER')) DEFAULT 'MEMBER',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2. DEPARTMENTS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 3. TASKS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL CHECK (status IN ('TODO', 'IN_PROGRESS', 'COMPLETED')) DEFAULT 'TODO',
    priority TEXT NOT NULL CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')) DEFAULT 'MEDIUM',
    deadline DATE NOT NULL,
    assigned_to UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    assigned_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 4. DAILY PLANS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_date DATE NOT NULL UNIQUE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 5. DAILY ASSIGNMENTS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES public.daily_plans(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_user_dept_per_plan UNIQUE (plan_id, user_id, department_id)
);

-- -----------------------------------------------------------------------------
-- INDEXES FOR MAXIMUM QUERY PERFORMANCE
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_by ON public.tasks(assigned_by);
CREATE INDEX IF NOT EXISTS idx_tasks_department ON public.tasks(department_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON public.tasks(deadline);
CREATE INDEX IF NOT EXISTS idx_daily_plans_date ON public.daily_plans(plan_date);
CREATE INDEX IF NOT EXISTS idx_daily_assignments_plan ON public.daily_assignments(plan_id);
CREATE INDEX IF NOT EXISTS idx_daily_assignments_user ON public.daily_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_assignments_department ON public.daily_assignments(department_id);

-- -----------------------------------------------------------------------------
-- AUTOMATED TIMESTAMPS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_update_tasks_updated_at ON public.tasks;
CREATE TRIGGER trg_update_tasks_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- AUTHENTICATION TRIGGER: STRICT WHITELIST & FOUNDER ACCESS ENFORCEMENT
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    user_role TEXT;
    is_whitelisted BOOLEAN;
    pre_existing_profile public.profiles%ROWTYPE;
BEGIN
    -- Check if user is in authorized whitelist
    is_whitelisted := LOWER(NEW.email) IN (
        'sivakumarelango10@gmail.com',
        'alinasyedali786@gmail.com',
        'yashas1325143@gmail.com',
        'kavyaramesh293@gmail.com',
        'prajith.p.dev.1@gmail.com',
        'sgjitbros@gmail.com'
    );

    SELECT * INTO pre_existing_profile FROM public.profiles WHERE LOWER(email) = LOWER(NEW.email);

    -- Reject new users not authorized in whitelist and not invited by Founder
    IF NOT is_whitelisted AND pre_existing_profile.id IS NULL THEN
        RAISE EXCEPTION 'Access denied. Only authorized team members invited by the Founder can sign in.';
    END IF;

    -- Special Rule: sivakumarelango10@gmail.com is strictly FOUNDER
    IF LOWER(NEW.email) = 'sivakumarelango10@gmail.com' THEN
        user_role := 'FOUNDER';
    ELSE
        user_role := COALESCE(pre_existing_profile.role, NEW.raw_user_meta_data->>'role', 'MEMBER');
    END IF;

    INSERT INTO public.profiles (id, full_name, email, role, is_active)
    VALUES (
        NEW.id,
        COALESCE(pre_existing_profile.full_name, NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        NEW.email,
        user_role,
        COALESCE(pre_existing_profile.is_active, true)
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
        role = CASE
            WHEN LOWER(EXCLUDED.email) = 'sivakumarelango10@gmail.com' THEN 'FOUNDER'
            ELSE profiles.role
        END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
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

-- Helper security functions (SECURITY DEFINER eliminates recursion)
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_founder()
RETURNS BOOLEAN AS $$
    SELECT public.current_user_role() = 'FOUNDER';
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin_or_founder()
RETURNS BOOLEAN AS $$
    SELECT public.current_user_role() IN ('FOUNDER', 'ADMIN');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- PROFILES POLICIES
DROP POLICY IF EXISTS "Founder full access on profiles" ON public.profiles;
CREATE POLICY "Founder full access on profiles"
    ON public.profiles FOR ALL
    USING (public.is_founder());

DROP POLICY IF EXISTS "Admin view profiles" ON public.profiles;
CREATE POLICY "Admin view profiles"
    ON public.profiles FOR SELECT
    USING (public.current_user_role() = 'ADMIN' AND is_active = true);

DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
CREATE POLICY "Users view own profile"
    ON public.profiles FOR SELECT
    USING (id = auth.uid());

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile"
    ON public.profiles FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- DEPARTMENTS POLICIES
DROP POLICY IF EXISTS "All authenticated view departments" ON public.departments;
CREATE POLICY "All authenticated view departments"
    ON public.departments FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Founder manage departments" ON public.departments;
CREATE POLICY "Founder manage departments"
    ON public.departments FOR ALL
    USING (public.is_founder());

-- TASKS POLICIES
DROP POLICY IF EXISTS "Founder full access tasks" ON public.tasks;
CREATE POLICY "Founder full access tasks"
    ON public.tasks FOR ALL
    USING (public.is_founder());

DROP POLICY IF EXISTS "Admin view tasks" ON public.tasks;
CREATE POLICY "Admin view tasks"
    ON public.tasks FOR SELECT
    USING (public.current_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "Admin insert tasks" ON public.tasks;
CREATE POLICY "Admin insert tasks"
    ON public.tasks FOR INSERT
    WITH CHECK (public.current_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "Admin update tasks" ON public.tasks;
CREATE POLICY "Admin update tasks"
    ON public.tasks FOR UPDATE
    USING (public.current_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "Admin delete tasks" ON public.tasks;
CREATE POLICY "Admin delete tasks"
    ON public.tasks FOR DELETE
    USING (public.current_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "Members view assigned tasks" ON public.tasks;
CREATE POLICY "Members view assigned tasks"
    ON public.tasks FOR SELECT
    USING (assigned_to = auth.uid());

DROP POLICY IF EXISTS "Members update assigned task status" ON public.tasks;
CREATE POLICY "Members update assigned task status"
    ON public.tasks FOR UPDATE
    USING (assigned_to = auth.uid())
    WITH CHECK (assigned_to = auth.uid());

-- DAILY PLANS POLICIES
DROP POLICY IF EXISTS "Founder full access daily plans" ON public.daily_plans;
CREATE POLICY "Founder full access daily plans"
    ON public.daily_plans FOR ALL
    USING (public.is_founder());

DROP POLICY IF EXISTS "Admin full access daily plans" ON public.daily_plans;
CREATE POLICY "Admin full access daily plans"
    ON public.daily_plans FOR ALL
    USING (public.current_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "Members view daily plans with assignment" ON public.daily_plans;
CREATE POLICY "Members view daily plans with assignment"
    ON public.daily_plans FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.daily_assignments
            WHERE daily_assignments.plan_id = daily_plans.id
              AND daily_assignments.user_id = auth.uid()
        )
    );

-- DAILY ASSIGNMENTS POLICIES
DROP POLICY IF EXISTS "Founder full access daily assignments" ON public.daily_assignments;
CREATE POLICY "Founder full access daily assignments"
    ON public.daily_assignments FOR ALL
    USING (public.is_founder());

DROP POLICY IF EXISTS "Admin full access daily assignments" ON public.daily_assignments;
CREATE POLICY "Admin full access daily assignments"
    ON public.daily_assignments FOR ALL
    USING (public.current_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "Members view own assignments" ON public.daily_assignments;
CREATE POLICY "Members view own assignments"
    ON public.daily_assignments FOR SELECT
    USING (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- SEED INITIAL CORE DEPARTMENTS
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
-- PURGE UNAPPROVED PROFILES (Keep only Founder + 5 Authorized Team Members)
-- -----------------------------------------------------------------------------
DELETE FROM public.profiles
WHERE LOWER(email) NOT IN (
    'sivakumarelango10@gmail.com',
    'alinasyedali786@gmail.com',
    'yashas1325143@gmail.com',
    'kavyaramesh293@gmail.com',
    'prajith.p.dev.1@gmail.com',
    'sgjitbros@gmail.com'
);
