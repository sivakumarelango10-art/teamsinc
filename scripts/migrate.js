import pg from 'pg';
const { Client } = pg;

// Read connection string securely from environment variable
const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;

if (!connectionString) {
  console.error('ERROR: DATABASE_URL environment variable is required to run migrations.');
  console.error('Usage: DATABASE_URL="postgresql://..." node scripts/migrate.js');
  process.exit(1);
}

async function runMigration() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to Supabase PostgreSQL database...');
    await client.connect();
    console.log('Connected successfully!');

    // 1. Update profiles role check constraint
    console.log('1. Updating profiles role check constraint...');
    await client.query(`
      ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
      ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
        CHECK (role IN ('FOUNDER', 'ADMIN', 'MEMBER', 'FOUNDING_ADVISOR'));
    `);

    // 2. Add security definer helper functions
    console.log('2. Creating security definer helper functions...');
    await client.query(`
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
    `);

    // 3. Update Tasks SELECT Policy to allow Founding Advisor
    console.log('3. Updating Tasks RLS policies...');
    await client.query(`
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
    `);

    // 4. Ensure push_subscriptions columns and constraints exist
    console.log('4. Ensuring push_subscriptions columns and constraints exist...');
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

    // 5. Add channel column to messages and update RLS
    console.log('5. Updating messages channel column and RLS policies...');
    await client.query(`
      ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'general';
      CREATE INDEX IF NOT EXISTS idx_messages_channel ON public.messages(channel);

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
    `);

    // 6. Provision Aaditya RM as Founding Advisor
    console.log('6. Provisioning Aaditya RM (aaditya.rm@kalvium.com) as Founding Advisor...');
    const res = await client.query(`
      INSERT INTO public.profiles (full_name, email, role, is_active)
      VALUES ('Aaditya RM', 'aaditya.rm@kalvium.com', 'FOUNDING_ADVISOR', true)
      ON CONFLICT (email) DO UPDATE
      SET role = 'FOUNDING_ADVISOR',
          is_active = true
      RETURNING *;
    `);

    console.log('Aaditya RM profile in database:', res.rows[0]);

    // 7. Verify all profiles
    const allProfiles = await client.query(`SELECT id, full_name, email, role, is_active FROM public.profiles ORDER BY created_at ASC;`);
    console.log('\nAll registered team profiles in database:');
    console.table(allProfiles.rows);

    console.log('\n✅ ALL DATABASE MIGRATIONS EXECUTED AND VERIFIED SUCCESSFULLY!');
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
