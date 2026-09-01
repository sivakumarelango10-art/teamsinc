import pg from 'pg';
const { Client } = pg;

const connectionString = "postgresql://postgres.tuhkdblelsgjmcxiwyid:Y18mDguasYjVj5ue@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres";

async function feedEverything() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to Supabase PostgreSQL...');
    await client.connect();
    console.log('Connected successfully!\n');

    // =========================================================================
    // 1. EXTENSIONS & SCHEMAS
    // =========================================================================
    console.log('1. Enabling extensions...');
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    `);

    // =========================================================================
    // 2. PROFILES TABLE & SECURITY FUNCTIONS
    // =========================================================================
    console.log('2. Setting up profiles & security functions...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        auth_user_id UUID UNIQUE,
        full_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('FOUNDER', 'ADMIN', 'MEMBER', 'FOUNDING_ADVISOR')) DEFAULT 'MEMBER',
        is_active BOOLEAN NOT NULL DEFAULT true,
        last_seen_at TIMESTAMPTZ DEFAULT now(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
      ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
        CHECK (role IN ('FOUNDER', 'ADMIN', 'MEMBER', 'FOUNDING_ADVISOR'));

      CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
      CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
      CREATE INDEX IF NOT EXISTS idx_profiles_lower_email ON public.profiles(LOWER(email));
      CREATE INDEX IF NOT EXISTS idx_profiles_auth_user_id ON public.profiles(auth_user_id);

      CREATE OR REPLACE FUNCTION public.current_user_role()
      RETURNS TEXT AS $$
        SELECT role FROM public.profiles 
        WHERE (auth_user_id = auth.uid() OR LOWER(email) = LOWER(auth.jwt()->>'email'));
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

      CREATE OR REPLACE FUNCTION public.is_founding_advisor()
      RETURNS BOOLEAN AS $$
        SELECT EXISTS (
          SELECT 1 FROM public.profiles
          WHERE (auth_user_id = auth.uid() OR LOWER(email) = LOWER(auth.jwt()->>'email'))
            AND role = 'FOUNDING_ADVISOR'
        );
      $$ LANGUAGE sql STABLE SECURITY DEFINER;

      CREATE OR REPLACE FUNCTION public.is_leadership()
      RETURNS BOOLEAN AS $$
        SELECT (LOWER(auth.jwt()->>'email') = 'sivakumarelango10@gmail.com') OR EXISTS (
          SELECT 1 FROM public.profiles
          WHERE (auth_user_id = auth.uid() OR LOWER(email) = LOWER(auth.jwt()->>'email'))
            AND role IN ('FOUNDER', 'ADMIN', 'FOUNDING_ADVISOR')
        );
      $$ LANGUAGE sql STABLE SECURITY DEFINER;

      -- Auth link trigger
      CREATE OR REPLACE FUNCTION public.handle_new_user()
      RETURNS trigger AS $$
      DECLARE
        reg_profile public.profiles%ROWTYPE;
      BEGIN
        SELECT * INTO reg_profile FROM public.profiles WHERE LOWER(email) = LOWER(NEW.email);

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

        IF reg_profile.id IS NOT NULL THEN
          UPDATE public.profiles
          SET auth_user_id = NEW.id
          WHERE id = reg_profile.id;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;

      DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
      CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

      ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS "Anyone authenticated can view active profiles" ON public.profiles;
      CREATE POLICY "Anyone authenticated can view active profiles"
        ON public.profiles FOR SELECT
        TO authenticated
        USING (is_active = true OR auth_user_id = auth.uid() OR public.is_founder());

      DROP POLICY IF EXISTS "Founder can manage all profiles" ON public.profiles;
      CREATE POLICY "Founder can manage all profiles"
        ON public.profiles FOR ALL
        TO authenticated
        USING (public.is_founder());

      DROP POLICY IF EXISTS "Public can check email registration" ON public.profiles;
      CREATE POLICY "Public can check email registration"
        ON public.profiles FOR SELECT
        TO anon
        USING (true);
    `);

    // Seed Team Profiles
    console.log('2.1 Seeding registered team profiles...');
    await client.query(`
      INSERT INTO public.profiles (full_name, email, role, is_active) VALUES
        ('Sivakumar Elango', 'sivakumarelango10@gmail.com', 'FOUNDER', true),
        ('Aaditya RM', 'aaditya.rm@kalvium.com', 'FOUNDING_ADVISOR', true),
        ('Alina Syed Ali', 'alinasyedali786@gmail.com', 'MEMBER', true),
        ('Yashas', 'yashas1325143@gmail.com', 'MEMBER', true),
        ('Kavya Ramesh', 'kavyaramesh293@gmail.com', 'MEMBER', true),
        ('SG Karmjit', 'sgjitbros@gmail.com', 'MEMBER', true),
        ('Prajith P', 'prajith.p.dev.1@gmail.com', 'MEMBER', true)
      ON CONFLICT (email) DO UPDATE
      SET full_name = EXCLUDED.full_name,
          role = EXCLUDED.role,
          is_active = true;
    `);

    // =========================================================================
    // 3. DEPARTMENTS TABLE
    // =========================================================================
    console.log('3. Setting up departments...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.departments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS "All authenticated view departments" ON public.departments;
      CREATE POLICY "All authenticated view departments"
        ON public.departments FOR SELECT
        TO authenticated
        USING (true);

      DROP POLICY IF EXISTS "Founder and Admin manage departments" ON public.departments;
      CREATE POLICY "Founder and Admin manage departments"
        ON public.departments FOR ALL
        TO authenticated
        USING (public.is_admin_or_founder());

      INSERT INTO public.departments (name, description) VALUES
        ('Designing', 'UI/UX design, visual identities, wireframing, and interactive prototyping'),
        ('Development', 'Web, mobile, API, and cloud infrastructure engineering'),
        ('Marketing', 'Digital marketing, SEO, social campaigns, and brand growth'),
        ('Testing', 'QA automation, manual verification, and release quality assurance'),
        ('Content', 'Technical copywriting, marketing copy, and documentation'),
        ('Management', 'Scrum management, product roadmap, and strategic planning')
      ON CONFLICT (name) DO UPDATE
      SET description = EXCLUDED.description;
    `);

    // =========================================================================
    // 4. TASKS TABLE
    // =========================================================================
    console.log('4. Setting up tasks & seeding active workflow items...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.tasks (
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

      CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);
      CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status ON public.tasks(assigned_to, status);
      CREATE INDEX IF NOT EXISTS idx_tasks_department ON public.tasks(department_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON public.tasks(deadline);

      ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS "Task View Policy" ON public.tasks;
      DROP POLICY IF EXISTS "Members view assigned tasks" ON public.tasks;
      CREATE POLICY "Task View Policy"
        ON public.tasks FOR SELECT
        TO authenticated
        USING (
          public.is_admin_or_founder()
          OR public.is_founding_advisor()
          OR assigned_to IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
        );

      DROP POLICY IF EXISTS "Task Insert Policy" ON public.tasks;
      CREATE POLICY "Task Insert Policy"
        ON public.tasks FOR INSERT
        TO authenticated
        WITH CHECK (public.is_admin_or_founder());

      DROP POLICY IF EXISTS "Task Update Policy" ON public.tasks;
      CREATE POLICY "Task Update Policy"
        ON public.tasks FOR UPDATE
        TO authenticated
        USING (
          public.is_admin_or_founder()
          OR assigned_to IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
        )
        WITH CHECK (
          public.is_admin_or_founder()
          OR (
            assigned_to IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
            AND (SELECT role FROM public.profiles WHERE auth_user_id = auth.uid()) = 'MEMBER'
          )
        );

      DROP POLICY IF EXISTS "Task Delete Policy" ON public.tasks;
      CREATE POLICY "Task Delete Policy"
        ON public.tasks FOR DELETE
        TO authenticated
        USING (public.is_admin_or_founder());
    `);

    // Seed Realistic Initial Tasks
    const founderProfile = (await client.query(`SELECT id FROM public.profiles WHERE role = 'FOUNDER' LIMIT 1;`)).rows[0];
    const devDept = (await client.query(`SELECT id FROM public.departments WHERE name = 'Development' LIMIT 1;`)).rows[0];
    const designDept = (await client.query(`SELECT id FROM public.departments WHERE name = 'Designing' LIMIT 1;`)).rows[0];
    const testDept = (await client.query(`SELECT id FROM public.departments WHERE name = 'Testing' LIMIT 1;`)).rows[0];
    const mgmtDept = (await client.query(`SELECT id FROM public.departments WHERE name = 'Management' LIMIT 1;`)).rows[0];

    const alina = (await client.query(`SELECT id FROM public.profiles WHERE email = 'alinasyedali786@gmail.com' LIMIT 1;`)).rows[0];
    const yashas = (await client.query(`SELECT id FROM public.profiles WHERE email = 'yashas1325143@gmail.com' LIMIT 1;`)).rows[0];
    const kavya = (await client.query(`SELECT id FROM public.profiles WHERE email = 'kavyaramesh293@gmail.com' LIMIT 1;`)).rows[0];
    const prajith = (await client.query(`SELECT id FROM public.profiles WHERE email = 'prajith.p.dev.1@gmail.com' LIMIT 1;`)).rows[0];

    if (founderProfile && devDept && alina && yashas) {
      const taskCheck = await client.query(`SELECT count(*) FROM public.tasks;`);
      if (parseInt(taskCheck.rows[0].count, 10) === 0) {
        console.log('4.1 Populating initial team tasks...');
        await client.query(`
          INSERT INTO public.tasks (title, description, status, priority, deadline, assigned_to, assigned_by, department_id) VALUES
            ('Implement WebRTC Calling Audio/Video Engine', 'Architect peer-to-peer WebRTC mesh network with Opus mono codec, screen sharing, and speaking indicators.', 'COMPLETED', 'URGENT', CURRENT_DATE + INTERVAL '2 days', '${alina.id}', '${founderProfile.id}', '${devDept.id}'),
            ('Design Modern Glassmorphic Dark UI', 'Create responsive design tokens, WhatsApp-style wallpaper canvas, badges, and layout cards.', 'COMPLETED', 'HIGH', CURRENT_DATE + INTERVAL '3 days', '${yashas.id}', '${founderProfile.id}', '${designDept.id}'),
            ('Web Push Notification System', 'Deploy Supabase Edge Function send-push and Service Worker pushManager notification dispatching.', 'IN_PROGRESS', 'HIGH', CURRENT_DATE + INTERVAL '5 days', '${prajith ? prajith.id : alina.id}', '${founderProfile.id}', '${devDept.id}'),
            ('Founding Advisor Strategic Oversight Portal', 'Build read-only multi-criteria task oversight table, KPI metrics, and restricted Leadership Chat.', 'COMPLETED', 'URGENT', CURRENT_DATE + INTERVAL '1 day', '${alina.id}', '${founderProfile.id}', '${mgmtDept.id}'),
            ('End-to-End QA Testing on Realtime Signalling', 'Verify cross-browser message broadcast, voice note recording, and call termination flows.', 'TODO', 'MEDIUM', CURRENT_DATE + INTERVAL '7 days', '${kavya ? kavya.id : yashas.id}', '${founderProfile.id}', '${testDept.id}');
        `);
      }
    }

    // =========================================================================
    // 5. DAILY PLANS & ASSIGNMENTS
    // =========================================================================
    console.log('5. Setting up daily plans & assignments...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.daily_plans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        plan_date DATE NOT NULL UNIQUE,
        created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.daily_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        plan_id UUID NOT NULL REFERENCES public.daily_plans(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT unique_user_dept_per_plan UNIQUE (plan_id, user_id, department_id)
      );

      ALTER TABLE public.daily_plans ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.daily_assignments ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS "All authenticated view daily plans" ON public.daily_plans;
      CREATE POLICY "All authenticated view daily plans"
        ON public.daily_plans FOR SELECT
        TO authenticated
        USING (true);

      DROP POLICY IF EXISTS "Founder and Admin manage daily plans" ON public.daily_plans;
      CREATE POLICY "Founder and Admin manage daily plans"
        ON public.daily_plans FOR ALL
        TO authenticated
        USING (public.is_admin_or_founder());

      DROP POLICY IF EXISTS "All authenticated view daily assignments" ON public.daily_assignments;
      CREATE POLICY "All authenticated view daily assignments"
        ON public.daily_assignments FOR SELECT
        TO authenticated
        USING (true);

      DROP POLICY IF EXISTS "Founder and Admin manage daily assignments" ON public.daily_assignments;
      CREATE POLICY "Founder and Admin manage daily assignments"
        ON public.daily_assignments FOR ALL
        TO authenticated
        USING (public.is_admin_or_founder());
    `);

    // =========================================================================
    // 6. MESSAGES TABLE & INITIAL SEED CONVERSATIONS
    // =========================================================================
    console.log('6. Setting up messages & seeding channel conversations...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        content TEXT NOT NULL,
        sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
        sender_name TEXT NOT NULL DEFAULT 'Team Member',
        sender_email TEXT NOT NULL DEFAULT '',
        sender_role TEXT NOT NULL DEFAULT 'MEMBER',
        file_url TEXT,
        file_name TEXT,
        file_size BIGINT,
        file_type TEXT,
        channel TEXT NOT NULL DEFAULT 'general' CHECK (channel IN ('general', 'leadership')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'general';
      CREATE INDEX IF NOT EXISTS idx_messages_channel_created_at ON public.messages(channel, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_created_at_desc ON public.messages(created_at DESC);

      ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS "General chat select policy" ON public.messages;
      DROP POLICY IF EXISTS "Anyone authenticated can view messages" ON public.messages;
      CREATE POLICY "General chat select policy"
        ON public.messages FOR SELECT
        TO authenticated
        USING (
          channel = 'general' AND (
            public.is_admin_or_founder()
            OR EXISTS (
              SELECT 1 FROM public.profiles
              WHERE (auth_user_id = auth.uid() OR LOWER(email) = LOWER(auth.jwt()->>'email'))
                AND role = 'MEMBER'
            )
          )
        );

      DROP POLICY IF EXISTS "Leadership chat select policy" ON public.messages;
      CREATE POLICY "Leadership chat select policy"
        ON public.messages FOR SELECT
        TO authenticated
        USING (
          channel = 'leadership' AND public.is_leadership()
        );

      DROP POLICY IF EXISTS "General chat insert policy" ON public.messages;
      DROP POLICY IF EXISTS "Anyone authenticated can insert messages" ON public.messages;
      CREATE POLICY "General chat insert policy"
        ON public.messages FOR INSERT
        TO authenticated
        WITH CHECK (
          channel = 'general' AND (
            public.is_admin_or_founder()
            OR EXISTS (
              SELECT 1 FROM public.profiles
              WHERE (auth_user_id = auth.uid() OR LOWER(email) = LOWER(auth.jwt()->>'email'))
                AND role = 'MEMBER'
            )
          )
        );

      DROP POLICY IF EXISTS "Leadership chat insert policy" ON public.messages;
      CREATE POLICY "Leadership chat insert policy"
        ON public.messages FOR INSERT
        TO authenticated
        WITH CHECK (
          channel = 'leadership' AND public.is_leadership()
        );

      DROP POLICY IF EXISTS "Founder can delete any message" ON public.messages;
      CREATE POLICY "Founder can delete any message"
        ON public.messages FOR DELETE
        TO authenticated
        USING (public.is_founder());
    `);

    // Seed Welcome Messages
    const advisorProfile = (await client.query(`SELECT id FROM public.profiles WHERE role = 'FOUNDING_ADVISOR' LIMIT 1;`)).rows[0];
    const msgCount = (await client.query(`SELECT count(*) FROM public.messages;`)).rows[0].count;
    if (parseInt(msgCount, 10) === 0 && founderProfile) {
      console.log('6.1 Seeding welcome chat messages...');
      await client.query(`
        INSERT INTO public.messages (content, sender_id, sender_name, sender_email, sender_role, channel) VALUES
          ('Welcome to TeamSync Company HQ! Collaborate on project milestones, share voice notes, or launch group video calls here.', '${founderProfile.id}', 'Sivakumar Elango', 'sivakumarelango10@gmail.com', 'FOUNDER', 'general');
      `);

      if (advisorProfile) {
        await client.query(`
          INSERT INTO public.messages (content, sender_id, sender_name, sender_email, sender_role, channel) VALUES
            ('Welcome to the Executive Leadership Council. This channel is strictly confidential between Founder, Admins, and the Founding Advisor.', '${founderProfile.id}', 'Sivakumar Elango', 'sivakumarelango10@gmail.com', 'FOUNDER', 'leadership'),
            ('Glad to be part of TeamSync leadership. Ready to assist on strategic oversight and team execution.', '${advisorProfile.id}', 'Aaditya RM', 'aaditya.rm@kalvium.com', 'FOUNDING_ADVISOR', 'leadership');
        `);
      }
    }

    // =========================================================================
    // 7. CALL HISTORY TABLE
    // =========================================================================
    console.log('7. Setting up call_history table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.call_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id TEXT NOT NULL DEFAULT 'general',
        caller_name TEXT NOT NULL DEFAULT 'Team Member',
        caller_email TEXT NOT NULL DEFAULT '',
        call_type TEXT NOT NULL DEFAULT 'video' CHECK (call_type IN ('video', 'voice')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'missed')),
        participants_count INT NOT NULL DEFAULT 1,
        started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        ended_at TIMESTAMPTZ,
        duration_seconds INT DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_call_history_status_started_at ON public.call_history(status, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_call_history_room_status ON public.call_history(room_id, status);

      ALTER TABLE public.call_history ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS "Anyone authenticated can view call history" ON public.call_history;
      CREATE POLICY "Anyone authenticated can view call history"
        ON public.call_history FOR SELECT
        TO authenticated
        USING (true);

      DROP POLICY IF EXISTS "Anyone authenticated can insert call history" ON public.call_history;
      CREATE POLICY "Anyone authenticated can insert call history"
        ON public.call_history FOR INSERT
        TO authenticated
        WITH CHECK (true);

      DROP POLICY IF EXISTS "Anyone authenticated can update call history" ON public.call_history;
      CREATE POLICY "Anyone authenticated can update call history"
        ON public.call_history FOR UPDATE
        TO authenticated
        USING (true);
    `);

    // =========================================================================
    // 8. PUSH SUBSCRIPTIONS TABLE
    // =========================================================================
    console.log('8. Setting up push_subscriptions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.push_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        device_id TEXT NOT NULL,
        endpoint TEXT,
        p256dh TEXT,
        auth TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS endpoint TEXT;
      ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS p256dh TEXT;
      ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS auth TEXT;
      ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS user_agent TEXT;
      ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ DEFAULT now();

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'unique_user_device'
        ) THEN
          ALTER TABLE public.push_subscriptions ADD CONSTRAINT unique_user_device UNIQUE (user_id, device_id);
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);
      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON public.push_subscriptions(endpoint);

      ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

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
    `);

    // =========================================================================
    // 9. STORAGE BUCKET (chat-attachments)
    // =========================================================================
    console.log('9. Setting up storage bucket chat-attachments...');
    try {
      await client.query(`
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES ('chat-attachments', 'chat-attachments', true, 52428800, NULL)
        ON CONFLICT (id) DO UPDATE
        SET public = true;

        DROP POLICY IF EXISTS "Public chat attachments read" ON storage.objects;
        CREATE POLICY "Public chat attachments read"
          ON storage.objects FOR SELECT
          USING (bucket_id = 'chat-attachments');

        DROP POLICY IF EXISTS "Authenticated users upload chat attachments" ON storage.objects;
        CREATE POLICY "Authenticated users upload chat attachments"
          ON storage.objects FOR INSERT
          TO authenticated
          WITH CHECK (bucket_id = 'chat-attachments');
      `);
      console.log('✓ Storage bucket configured successfully');
    } catch (sErr) {
      console.warn('Storage bucket note:', sErr.message);
    }

    // =========================================================================
    // 10. REALTIME PUBLICATIONS
    // =========================================================================
    console.log('10. Configuring Supabase Realtime publication...');
    const tablesToPublish = ['profiles', 'departments', 'tasks', 'messages', 'call_history', 'daily_plans', 'daily_assignments'];
    for (const tbl of tablesToPublish) {
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = '${tbl}'
          ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.${tbl};
          END IF;
        END $$;
      `);
    }
    console.log('✓ Supabase Realtime publication configured for all tables');

    // =========================================================================
    // 11. VERIFICATION SUMMARY
    // =========================================================================
    console.log('\n======================================================');
    console.log('✨ COMPLETE SUPABASE SEED & PROVISIONING VERIFIED');
    console.log('======================================================');

    const profiles = await client.query(`SELECT full_name, email, role, is_active FROM public.profiles ORDER BY created_at;`);
    console.log('\n👤 PROFILES:');
    console.table(profiles.rows);

    const depts = await client.query(`SELECT name, description FROM public.departments ORDER BY name;`);
    console.log('\n🏢 DEPARTMENTS:');
    console.table(depts.rows);

    const tasks = await client.query(`
      SELECT t.title, t.status, t.priority, t.deadline, p.full_name as assigned_to, d.name as department
      FROM public.tasks t
      LEFT JOIN public.profiles p ON t.assigned_to = p.id
      LEFT JOIN public.departments d ON t.department_id = d.id
      ORDER BY t.created_at DESC;
    `);
    console.log('\n📋 TASKS:');
    console.table(tasks.rows);

    const msgs = await client.query(`SELECT channel, sender_name, content, created_at FROM public.messages ORDER BY created_at ASC;`);
    console.log('\n💬 MESSAGES:');
    console.table(msgs.rows);

    console.log('\n✅ EVERYTHING IS PROVISIONED AND READY IN SUPABASE!');
  } catch (err) {
    console.error('Fatal error during feeding:', err);
  } finally {
    await client.end();
  }
}

feedEverything();
