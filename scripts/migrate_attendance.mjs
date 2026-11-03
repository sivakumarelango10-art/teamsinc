import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, query } from '../server/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  console.log('🚀 Running Weekly Meeting Attendance Migration (005)...');
  const sqlPath = path.resolve(__dirname, '../supabase/migrations/005_create_weekly_meeting_attendance.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  try {
    await query(sql);
    console.log('✅ Migration 005 applied successfully!');

    // Verify columns in meetings table
    const colCheck = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'meetings' AND column_name = 'is_weekly_meeting';
    `);
    console.log('✅ meetings.is_weekly_meeting column exists:', colCheck.rows.length > 0);

    // Verify tables
    const tableCheck = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('meeting_attendance', 'meeting_attendance_history');
    `);
    console.log('✅ Created tables:', tableCheck.rows.map(r => r.table_name));

  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
