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

async function runDirectMessagesMigration() {
  console.log('Connecting to PostgreSQL database to execute 1-to-1 Direct Messaging migration...');
  const client = new Client({
    connectionString: envConnectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected successfully to database!');

    const sqlPath = path.resolve('supabase/migrations/003_create_direct_messages_system.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf-8');

    console.log('Executing direct messages migration SQL...');
    await client.query(sqlContent);
    console.log('Direct messaging tables, indexes, triggers, RLS policies, and realtime publication updated successfully!');

    // Verify created tables
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('direct_conversations', 'direct_messages')
      ORDER BY table_name;
    `);

    console.log('\nVerified Direct Messaging Tables in Database:');
    console.table(res.rows);

    // Verify indexes
    const idxRes = await client.query(`
      SELECT tablename, indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
        AND tablename IN ('direct_conversations', 'direct_messages')
      ORDER BY tablename, indexname;
    `);

    console.log('\nVerified Indexes:');
    console.table(idxRes.rows);

    // Verify RLS is enabled
    const rlsRes = await client.query(`
      SELECT relname, relrowsecurity 
      FROM pg_class 
      WHERE relname IN ('direct_conversations', 'direct_messages');
    `);
    console.log('\nVerified Row Level Security (RLS):');
    console.table(rlsRes.rows);

  } catch (err) {
    console.error('Migration failed with error:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runDirectMessagesMigration();
