import pg from 'pg';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf-8');
let conn = '';
for (const line of envContent.split('\n')) {
  if (line.trim().startsWith('DIRECT_URL=')) {
    conn = line.trim().replace(/^DIRECT_URL=/, '').replace(/^["']|["']$/g, '');
  }
}

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

async function run() {
  await client.connect();
  console.log('Connected to PostgreSQL!');

  console.log('Creating department_members table...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.department_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT unique_dept_user UNIQUE (department_id, user_id)
    );
  `);

  console.log('Enabling RLS on department_members...');
  await client.query(`ALTER TABLE public.department_members ENABLE ROW LEVEL SECURITY;`);

  console.log('Setting up RLS policies...');
  await client.query(`
    DROP POLICY IF EXISTS "Anyone authenticated can view department members" ON public.department_members;
    CREATE POLICY "Anyone authenticated can view department members"
      ON public.department_members FOR SELECT
      TO authenticated
      USING (true);

    DROP POLICY IF EXISTS "Leadership can manage department members" ON public.department_members;
    CREATE POLICY "Leadership can manage department members"
      ON public.department_members FOR ALL
      TO authenticated
      USING (public.is_admin_or_founder())
      WITH CHECK (public.is_admin_or_founder());
  `);

  console.log('Adding performance indexes...');
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_dept_members_dept ON public.department_members(department_id);
    CREATE INDEX IF NOT EXISTS idx_dept_members_user ON public.department_members(user_id);
  `);

  console.log('Adding to Supabase Realtime publication...');
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'department_members'
      ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.department_members;
      END IF;
    END $$;
  `);

  console.log('department_members table and realtime publication successfully configured!');
  await client.end();
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
