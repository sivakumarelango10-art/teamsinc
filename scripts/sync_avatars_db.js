import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.tuhkdblelsgjmcxiwyid:Y18mDguasYjVj5ue@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log('Connected to database.');

  // 1. Ensure avatar_url column exists
  await client.query(`
    ALTER TABLE public.profiles 
    ADD COLUMN IF NOT EXISTS avatar_url TEXT;
  `);
  console.log('1. Checked avatar_url column on public.profiles.');

  // 2. Sync Google OAuth avatars from auth.users to public.profiles where currently null or empty
  const updateResult = await client.query(`
    UPDATE public.profiles p
    SET avatar_url = COALESCE(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture'),
        updated_at = now()
    FROM auth.users u
    WHERE (p.auth_user_id = u.id OR LOWER(p.email) = LOWER(u.email))
      AND (p.avatar_url IS NULL OR TRIM(p.avatar_url) = '')
      AND (u.raw_user_meta_data->>'avatar_url' IS NOT NULL OR u.raw_user_meta_data->>'picture' IS NOT NULL)
    RETURNING p.id, p.full_name, p.email, p.avatar_url;
  `);
  console.log(`2. Updated ${updateResult.rowCount} profiles with Google avatars:`);
  console.log(JSON.stringify(updateResult.rows, null, 2));

  // 3. Update handle_new_user trigger to preserve / assign avatar_url on auth signup
  await client.query(`
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS trigger AS $$
    DECLARE
        reg_profile public.profiles%ROWTYPE;
        google_avatar TEXT;
    BEGIN
        google_avatar := COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture');

        -- Check if email exists in registered profiles
        SELECT * INTO reg_profile FROM public.profiles WHERE LOWER(email) = LOWER(NEW.email);

        -- Special Exception: If profile is marked as FOUNDER or no profile yet for designated founder
        IF reg_profile.id IS NOT NULL AND reg_profile.role = 'FOUNDER' THEN
            UPDATE public.profiles
            SET auth_user_id = NEW.id,
                is_active = true,
                avatar_url = COALESCE(profiles.avatar_url, google_avatar),
                updated_at = now()
            WHERE id = reg_profile.id;
            RETURN NEW;
        END IF;

        -- For all other users: They MUST be pre-registered in profiles!
        IF reg_profile.id IS NULL THEN
            RAISE EXCEPTION 'Access Denied: Your email % is not registered by the Founder.', NEW.email;
        END IF;

        IF NOT reg_profile.is_active THEN
            RAISE EXCEPTION 'Access Denied: Account % has been deactivated by the Founder.', NEW.email;
        END IF;

        -- Link auth_user_id and avatar to the pre-registered profile
        UPDATE public.profiles
        SET auth_user_id = NEW.id,
            avatar_url = COALESCE(profiles.avatar_url, google_avatar),
            updated_at = now()
        WHERE id = reg_profile.id;

        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
  `);
  console.log('3. Updated handle_new_user trigger function.');

  // 4. Verify all profiles now
  const allProfiles = await client.query('SELECT id, full_name, email, role, avatar_url FROM public.profiles ORDER BY full_name ASC');
  console.log('4. All profiles in database:');
  console.log(JSON.stringify(allProfiles.rows, null, 2));

  await client.end();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
