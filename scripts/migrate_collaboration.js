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
    } else if (trimmed.startsWith('DATABASE_URL=') && !envConnectionString) {
      envConnectionString = trimmed.replace(/^DATABASE_URL=/, '').replace(/^["']|["']$/g, '');
    }
  }
}

if (!envConnectionString) {
  console.error('ERROR: DIRECT_URL or DATABASE_URL is required to execute migration.');
  process.exit(1);
}

async function runCollaborationMigration() {
  console.log('Connecting to PostgreSQL database to execute Collaboration System migration...');
  const client = new Client({
    connectionString: envConnectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected successfully!');

    const sqlPath = path.resolve('supabase/migrations/004_create_collaboration_system.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf-8');

    console.log('Executing collaboration migration SQL...');
    await client.query(sqlContent);
    console.log('Collaboration tables, columns, indexes, RLS policies, and realtime publication updated successfully!');

    // Verify created tables
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN (
          'polls', 'poll_options', 'poll_votes',
          'notes', 'todo_items',
          'task_progress_reports', 'task_transfers', 'task_transfer_history',
          'collaboration_notifications'
        )
      ORDER BY table_name;
    `);

    console.log('\nVerified Created Tables in public schema:');
    console.log(res.rows.map(r => r.table_name));

    if (res.rows.length === 9) {
      console.log('✅ ALL 9 COLLABORATION TABLES CREATED AND VERIFIED!');
    } else {
      console.warn(`⚠️ Expected 9 tables, found ${res.rows.length}`);
    }

  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runCollaborationMigration();
