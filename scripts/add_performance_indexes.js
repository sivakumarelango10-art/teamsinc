import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pg;

// Read .env directly
let envConnectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!envConnectionString && fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('DIRECT_URL=')) {
      envConnectionString = trimmed.replace(/^DIRECT_URL=/, '').replace(/^["']|["']$/g, '');
      break;
    }
  }
}

const connectionString = envConnectionString;

if (!connectionString) {
  console.error('ERROR: DIRECT_URL or DATABASE_URL environment variable is required to run index migration.');
  process.exit(1);
}

const indexes = [
  // 1. Tasks performance indexes
  {
    name: 'idx_tasks_assigned_to',
    sql: 'CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);'
  },
  {
    name: 'idx_tasks_assigned_by',
    sql: 'CREATE INDEX IF NOT EXISTS idx_tasks_assigned_by ON public.tasks(assigned_by);'
  },
  {
    name: 'idx_tasks_department_id',
    sql: 'CREATE INDEX IF NOT EXISTS idx_tasks_department_id ON public.tasks(department_id);'
  },
  {
    name: 'idx_tasks_status',
    sql: 'CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);'
  },
  {
    name: 'idx_tasks_created_at_desc',
    sql: 'CREATE INDEX IF NOT EXISTS idx_tasks_created_at_desc ON public.tasks(created_at DESC);'
  },
  {
    name: 'idx_tasks_deadline',
    sql: 'CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON public.tasks(deadline);'
  },

  // 2. Messages chat stream index
  {
    name: 'idx_messages_channel_created_at',
    sql: 'CREATE INDEX IF NOT EXISTS idx_messages_channel_created_at ON public.messages(channel, created_at DESC);'
  },

  // 3. Bug reports triage & status indexes
  {
    name: 'idx_bug_reports_status',
    sql: 'CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON public.bug_reports(status);'
  },
  {
    name: 'idx_bug_reports_severity',
    sql: 'CREATE INDEX IF NOT EXISTS idx_bug_reports_severity ON public.bug_reports(severity);'
  },
  {
    name: 'idx_bug_reports_reported_by',
    sql: 'CREATE INDEX IF NOT EXISTS idx_bug_reports_reported_by ON public.bug_reports(reported_by);'
  },
  {
    name: 'idx_bug_reports_created_at_desc',
    sql: 'CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at_desc ON public.bug_reports(created_at DESC);'
  },

  // 4. Daily plans & allocations indexes
  {
    name: 'idx_daily_plans_plan_date',
    sql: 'CREATE INDEX IF NOT EXISTS idx_daily_plans_plan_date ON public.daily_plans(plan_date);'
  },
  {
    name: 'idx_daily_assignments_plan_id',
    sql: 'CREATE INDEX IF NOT EXISTS idx_daily_assignments_plan_id ON public.daily_assignments(plan_id);'
  },
  {
    name: 'idx_daily_assignments_user_id',
    sql: 'CREATE INDEX IF NOT EXISTS idx_daily_assignments_user_id ON public.daily_assignments(user_id);'
  },
  {
    name: 'idx_daily_assignments_department_id',
    sql: 'CREATE INDEX IF NOT EXISTS idx_daily_assignments_department_id ON public.daily_assignments(department_id);'
  },

  // 5. Profiles lookup indexes
  {
    name: 'idx_profiles_email_lower',
    sql: 'CREATE INDEX IF NOT EXISTS idx_profiles_email_lower ON public.profiles(LOWER(email));'
  },
  {
    name: 'idx_profiles_role',
    sql: 'CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);'
  },
  {
    name: 'idx_profiles_is_active',
    sql: 'CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON public.profiles(is_active);'
  }
];

async function runIndexMigration() {
  console.log('Connecting to PostgreSQL database to apply performance indexes...');
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected successfully! Applying indexes...');

    for (const item of indexes) {
      process.stdout.write(`Creating index ${item.name}... `);
      await client.query(item.sql);
      console.log('OK');
    }

    console.log('\nAll 16 performance indexes applied successfully!');
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runIndexMigration();
