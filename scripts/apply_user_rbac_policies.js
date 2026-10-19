import { pool } from '../server/db.js';

async function runRbacMigration() {
  console.log('--- Applying RBAC RLS policies on public.profiles ---');

  await pool.query(`
    -- 1. Ensure RLS is enabled on public.profiles
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

    -- 2. Allow all authenticated users (both Admins and Members) to view the user directory
    DROP POLICY IF EXISTS "Anyone authenticated can view active profiles" ON public.profiles;
    DROP POLICY IF EXISTS "Anyone authenticated can view profiles" ON public.profiles;
    CREATE POLICY "Anyone authenticated can view profiles"
      ON public.profiles FOR SELECT
      TO authenticated
      USING (true);

    -- 3. Allow Administrators and Founders to manage user accounts (Add, Edit, Role, Status, Delete)
    DROP POLICY IF EXISTS "Founder can manage all profiles" ON public.profiles;
    DROP POLICY IF EXISTS "Admins and Founders can manage profiles" ON public.profiles;
    CREATE POLICY "Admins and Founders can manage profiles"
      ON public.profiles FOR ALL
      TO authenticated
      USING (public.is_admin_or_founder())
      WITH CHECK (public.is_admin_or_founder());

    -- 4. Allow individual users to update only their own profile details (excluding role changes)
    DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
    CREATE POLICY "Users can update own profile"
      ON public.profiles FOR UPDATE
      TO authenticated
      USING (auth_user_id = auth.uid() OR LOWER(email) = LOWER(auth.jwt()->>'email'))
      WITH CHECK (
        (auth_user_id = auth.uid() OR LOWER(email) = LOWER(auth.jwt()->>'email'))
        AND role = (SELECT role FROM public.profiles WHERE id = profiles.id)
      );
  `);

  console.log('✓ Successfully applied RBAC policies on public.profiles');

  // Verify policies
  const res = await pool.query(`
    SELECT polname, polcmd, polroles::regrole[], pg_get_expr(polqual, polrelid) as polqual
    FROM pg_policy 
    WHERE polrelid = 'public.profiles'::regclass;
  `);
  console.log('Current public.profiles policies:');
  console.table(res.rows);

  await pool.end();
}

runRbacMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
