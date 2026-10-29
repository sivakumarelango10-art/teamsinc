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

async function runMeetingsMigration() {
  console.log('Connecting to PostgreSQL database to execute Founder Meeting Hub migration...');
  const client = new Client({
    connectionString: envConnectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected successfully!');

    const sqlPath = path.resolve('supabase/migrations/002_create_meetings_system.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf-8');

    console.log('Executing meetings migration SQL...');
    await client.query(sqlContent);
    console.log('Meetings tables, indexes, RLS policies, and realtime publication updated successfully!');

    // Verify created tables
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('meeting_series', 'meetings', 'meeting_participants', 'meeting_notifications')
      ORDER BY table_name;
    `);

    console.log('\nVerified Meeting Hub Tables in Database:');
    console.table(res.rows);

    // Verify indexes
    const idxRes = await client.query(`
      SELECT tablename, indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
        AND tablename IN ('meeting_series', 'meetings', 'meeting_participants', 'meeting_notifications')
      ORDER BY tablename, indexname;
    `);

    console.log('\nVerified Indexes:');
    console.table(idxRes.rows);

    // Verify realtime publication tables
    const pubRes = await client.query(`
      SELECT pubname, tablename 
      FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
        AND tablename IN ('meetings', 'meeting_participants', 'meeting_notifications');
    `);

    console.log('\nVerified Supabase Realtime Publication:');
    console.table(pubRes.rows);

  } catch (err) {
    console.error('Meetings migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMeetingsMigration();

