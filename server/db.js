import pg from 'pg';
import fs from 'fs';

const { Pool } = pg;

const DEFAULT_SUPABASE_URL = 'postgresql://postgres.tuhkdblelsgjmcxiwyid:Y18mDguasYjVj5ue@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres';

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

// Fallback to live Supabase connection for serverless/hosted environments
connectionString = connectionString || DEFAULT_SUPABASE_URL;

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
