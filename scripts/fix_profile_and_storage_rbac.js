import { pool } from '../server/db.js';

async function fixProfileAndStorage() {
  console.log('=== Step 1: Fixing public.profiles RLS policies & immutability triggers ===');

  await pool.query(`
    -- 1. Ensure RLS is enabled on public.profiles
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

    -- 2. Drop the defective policy with the broken scalar subquery
    DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

    -- 3. Create the clean, secure update policy using authenticated user id or email without scalar subqueries
    CREATE POLICY "Users can update own profile"
      ON public.profiles FOR UPDATE
      TO authenticated
      USING (
        (auth_user_id IS NOT NULL AND auth_user_id = auth.uid()) 
        OR (auth.jwt()->>'email' IS NOT NULL AND LOWER(email) = LOWER(auth.jwt()->>'email'))
      )
      WITH CHECK (
        (auth_user_id IS NOT NULL AND auth_user_id = auth.uid()) 
        OR (auth.jwt()->>'email' IS NOT NULL AND LOWER(email) = LOWER(auth.jwt()->>'email'))
      );

    -- 4. Create trigger to enforce field immutability (role, email, id) safely at the database level
    CREATE OR REPLACE FUNCTION public.protect_profile_immutable_fields()
    RETURNS trigger AS $$
    BEGIN
      -- Primary Key ID is always immutable
      IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Profile ID is immutable.';
      END IF;

      -- Standard members cannot modify their assigned role, status, or email
      IF NOT public.is_admin_or_founder() THEN
        IF NEW.role IS DISTINCT FROM OLD.role THEN
          RAISE EXCEPTION 'Access Denied: You cannot modify your own assigned role.';
        END IF;
        IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
          RAISE EXCEPTION 'Access Denied: You cannot modify your own account status.';
        END IF;
        IF NEW.email IS DISTINCT FROM OLD.email THEN
          RAISE EXCEPTION 'Access Denied: Email address cannot be modified.';
        END IF;
      END IF;

      -- Founder account cannot be demoted or deactivated even by admins
      IF LOWER(OLD.email) = 'sivakumarelango10@gmail.com' THEN
        IF NEW.role IS DISTINCT FROM 'FOUNDER' THEN
          RAISE EXCEPTION 'The primary Founder role cannot be modified.';
        END IF;
        IF NEW.is_active = false THEN
          RAISE EXCEPTION 'The primary Founder account cannot be deactivated.';
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

    DROP TRIGGER IF EXISTS trg_protect_profile_immutable_fields ON public.profiles;
    CREATE TRIGGER trg_protect_profile_immutable_fields
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_profile_immutable_fields();
  `);

  console.log('✓ public.profiles RLS and triggers updated successfully');

  console.log('=== Step 2: Ensuring storage buckets & policies for avatars ===');
  await pool.query(`
    -- Create avatars bucket if not existing
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
    ON CONFLICT (id) DO UPDATE 
    SET public = true,
        file_size_limit = 5242880,
        allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

    -- Ensure chat-attachments is also public and configured
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('chat-attachments', 'chat-attachments', true)
    ON CONFLICT (id) DO UPDATE SET public = true;

    -- Avatar storage policies
    DROP POLICY IF EXISTS "Public can view avatars" ON storage.objects;
    CREATE POLICY "Public can view avatars"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'avatars');

    DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
    CREATE POLICY "Authenticated users can upload avatars"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'avatars' OR bucket_id = 'chat-attachments');

    DROP POLICY IF EXISTS "Users can update own avatar objects" ON storage.objects;
    CREATE POLICY "Users can update own avatar objects"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'avatars' OR bucket_id = 'chat-attachments');

    DROP POLICY IF EXISTS "Users can delete own avatar objects" ON storage.objects;
    CREATE POLICY "Users can delete own avatar objects"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'avatars' OR bucket_id = 'chat-attachments');
  `);

  console.log('✓ storage.buckets and storage.objects policies updated successfully');

  await pool.end();
}

fixProfileAndStorage().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
