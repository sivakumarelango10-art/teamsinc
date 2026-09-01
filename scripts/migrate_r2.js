import pg from 'pg';
const { Client } = pg;

const connectionString = "postgresql://postgres.tuhkdblelsgjmcxiwyid:Y18mDguasYjVj5ue@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres";

async function runR2Migration() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to Supabase PostgreSQL database...');
    await client.connect();
    console.log('Connected!');

    // 1. Update messages table with R2 storage key and flag
    console.log('1. Adding storage_key and is_r2 to public.messages...');
    await client.query(`
      ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS storage_key TEXT;
      ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_r2 BOOLEAN DEFAULT true;
      CREATE INDEX IF NOT EXISTS idx_messages_storage_key ON public.messages(storage_key);
    `);
    console.log('✓ Messages columns updated');

    // 2. Create task_attachments table
    console.log('2. Creating public.task_attachments table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.task_attachments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
        uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
        storage_key TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_size BIGINT NOT NULL,
        mime_type TEXT NOT NULL,
        attachment_type TEXT NOT NULL DEFAULT 'document',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id ON public.task_attachments(task_id);
      CREATE INDEX IF NOT EXISTS idx_task_attachments_uploaded_by ON public.task_attachments(uploaded_by);

      ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS "Task attachments view policy" ON public.task_attachments;
      CREATE POLICY "Task attachments view policy"
        ON public.task_attachments FOR SELECT
        TO authenticated
        USING (
          public.is_admin_or_founder()
          OR public.is_founding_advisor()
          OR task_id IN (
            SELECT id FROM public.tasks 
            WHERE assigned_to IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
          )
        );

      DROP POLICY IF EXISTS "Task attachments insert policy" ON public.task_attachments;
      CREATE POLICY "Task attachments insert policy"
        ON public.task_attachments FOR INSERT
        TO authenticated
        WITH CHECK (
          public.is_admin_or_founder()
          OR task_id IN (
            SELECT id FROM public.tasks 
            WHERE assigned_to IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
          )
        );

      DROP POLICY IF EXISTS "Task attachments delete policy" ON public.task_attachments;
      CREATE POLICY "Task attachments delete policy"
        ON public.task_attachments FOR DELETE
        TO authenticated
        USING (
          public.is_admin_or_founder()
          OR uploaded_by IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
        );
    `);
    console.log('✓ Task attachments table & RLS policies created');

    // 3. Add task_attachments to Realtime publication
    console.log('3. Adding task_attachments to Realtime publication...');
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_publication_tables 
          WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'task_attachments'
        ) THEN
          ALTER PUBLICATION supabase_realtime ADD TABLE public.task_attachments;
        END IF;
      END $$;
    `);
    console.log('✓ Realtime publication updated');

    console.log('\n✅ R2 DATABASE MIGRATION APPLIED SUCCESSFULLY!');
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runR2Migration();
