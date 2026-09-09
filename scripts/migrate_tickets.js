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

async function runTicketsMigration() {
  console.log('Connecting to PostgreSQL database to execute KalviLearn tickets migration...');
  const client = new Client({
    connectionString: envConnectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected successfully!');

    const sqlPath = path.resolve('supabase/migrations/001_create_tickets_system.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf-8');

    console.log('Executing tickets migration SQL...');
    await client.query(sqlContent);
    console.log('Tickets tables, sequence, constraints, indexes, and RLS policies created successfully!');

    // Verify created tables
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('tickets', 'ticket_comments', 'ticket_activities', 'ticket_attachments', 'webhook_deliveries')
      ORDER BY table_name;
    `);

    console.log('Verified tables in database:');
    console.table(res.rows);

  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runTicketsMigration();
