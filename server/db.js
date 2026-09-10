import pg from 'pg';
import fs from 'fs';

const { Pool } = pg;

function cleanString(str) {
  if (!str || typeof str !== 'string') return null;
  return str.trim().replace(/^["']|["']$/g, '');
}

// Read .env directly if process.env is not yet populated
let rawConn = cleanString(process.env.DIRECT_URL) || cleanString(process.env.DATABASE_URL);

if (!rawConn && fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('DIRECT_URL=')) {
      rawConn = cleanString(trimmed.replace(/^DIRECT_URL=/, ''));
      break;
    } else if (trimmed.startsWith('DATABASE_URL=') && !rawConn) {
      rawConn = cleanString(trimmed.replace(/^DATABASE_URL=/, ''));
    }
  }
}

if (!rawConn) {
  // No hardcoded fallback — a missing connection string is a deployment misconfiguration
  console.error('[TeamSync] FATAL: No database connection string found. Set DIRECT_URL or DATABASE_URL environment variable.');
}

const connectionString = rawConn || '';

export const pool = new Pool({
  connectionString,
  ssl: connectionString?.includes('supabase') || connectionString?.includes('pooler')
    ? { rejectUnauthorized: false }
    : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export const query = (text, params) => pool.query(text, params);

export default { pool, query };
