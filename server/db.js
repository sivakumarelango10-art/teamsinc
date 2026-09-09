import pg from 'pg';
import fs from 'fs';

const { Pool } = pg;

// Read .env directly if process.env is not yet populated
let connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!connectionString && fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('DIRECT_URL=')) {
      connectionString = trimmed.replace(/^DIRECT_URL=/, '').replace(/^["']|["']$/g, '');
      break;
    } else if (trimmed.startsWith('DATABASE_URL=') && !connectionString) {
      connectionString = trimmed.replace(/^DATABASE_URL=/, '').replace(/^["']|["']$/g, '');
    }
  }
}

export const pool = new Pool({
  connectionString: connectionString || 'postgresql://postgres:postgres@localhost:5432/postgres',
  ssl: connectionString?.includes('supabase') || connectionString?.includes('pooler')
    ? { rejectUnauthorized: false }
    : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

export const query = (text, params) => pool.query(text, params);

export default { pool, query };
