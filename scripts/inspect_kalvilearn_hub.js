import { query, pool } from '../server/db.js';

async function runInspection() {
  console.log('=== KALVILEARN INTEGRATION HUB DATABASE INSPECTION ===\n');

  // 1. Check all tables with ticket or report in name
  const tablesRes = await query(`
    SELECT table_schema, table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND (table_name LIKE '%ticket%' OR table_name LIKE '%report%' OR table_name LIKE '%kalvi%')
    ORDER BY table_name;
  `);
  console.log('1. Matching Tables:');
  console.table(tablesRes.rows);

  // 2. Foreign keys referencing public.tickets
  const fkRes = await query(`
    SELECT
      tc.table_schema, 
      tc.constraint_name, 
      tc.table_name, 
      kcu.column_name, 
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name,
      rc.delete_rule
    FROM information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints AS rc
      ON rc.constraint_name = tc.constraint_name
    WHERE ccu.table_name = 'tickets' OR tc.table_name = 'tickets';
  `);
  console.log('\n2. Foreign Key Relationships with tickets:');
  console.table(fkRes.rows);

  // 3. Triggers on tickets and related tables
  const trigRes = await query(`
    SELECT event_object_table, trigger_name, event_manipulation, action_statement, action_timing
    FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table IN ('tickets', 'ticket_comments', 'ticket_activities', 'ticket_attachments', 'webhook_deliveries');
  `);
  console.log('\n3. Triggers on Ticket Tables:');
  console.table(trigRes.rows);

  // 4. Views referencing tickets
  const viewsRes = await query(`
    SELECT table_name, view_definition
    FROM information_schema.views
    WHERE table_schema = 'public'
      AND view_definition ILIKE '%tickets%';
  `);
  console.log('\n4. Views referencing tickets:');
  console.table(viewsRes.rows);

  // 5. Total counts across report tables
  const [ticketsCount, commentsCount, activitiesCount, attachmentsCount, webhooksCount] = await Promise.all([
    query('SELECT count(*) as count FROM public.tickets'),
    query('SELECT count(*) as count FROM public.ticket_comments'),
    query('SELECT count(*) as count FROM public.ticket_activities'),
    query('SELECT count(*) as count FROM public.ticket_attachments'),
    query('SELECT count(*) as count FROM public.webhook_deliveries')
  ]);
  console.log('\n5. Current Record Counts:');
  console.table([
    { table: 'public.tickets', count: parseInt(ticketsCount.rows[0].count, 10) },
    { table: 'public.ticket_comments', count: parseInt(commentsCount.rows[0].count, 10) },
    { table: 'public.ticket_activities', count: parseInt(activitiesCount.rows[0].count, 10) },
    { table: 'public.ticket_attachments', count: parseInt(attachmentsCount.rows[0].count, 10) },
    { table: 'public.webhook_deliveries', count: parseInt(webhooksCount.rows[0].count, 10) }
  ]);

  // 6. Breakdown by source
  const sourceBreakdown = await query(`
    SELECT source, count(*) as count
    FROM public.tickets
    GROUP BY source
    ORDER BY count DESC;
  `);
  console.log('\n6. Breakdown by Source:');
  console.table(sourceBreakdown.rows);

  // 7. Breakdown by type
  const typeBreakdown = await query(`
    SELECT type, count(*) as count
    FROM public.tickets
    GROUP BY type
    ORDER BY count DESC;
  `);
  console.log('\n7. Breakdown by Type:');
  console.table(typeBreakdown.rows);

  // 8. Breakdown by status
  const statusBreakdown = await query(`
    SELECT status, count(*) as count
    FROM public.tickets
    GROUP BY status
    ORDER BY count DESC;
  `);
  console.log('\n8. Breakdown by Status:');
  console.table(statusBreakdown.rows);

  // 9. Breakdown by priority
  const priorityBreakdown = await query(`
    SELECT priority, count(*) as count
    FROM public.tickets
    GROUP BY priority
    ORDER BY count DESC;
  `);
  console.log('\n9. Breakdown by Priority:');
  console.table(priorityBreakdown.rows);

  // 10. Check if any tickets have attachments stored in Supabase storage or external URLs
  const attachmentsSample = await query(`
    SELECT file_name, file_url, file_type, file_size
    FROM public.ticket_attachments
    LIMIT 10;
  `);
  console.log('\n10. Attachments Sample:');
  console.table(attachmentsSample.rows);

  // 11. Check if public.tickets sequence
  const seqRes = await query(`
    SELECT last_value, is_called FROM ticket_seq;
  `);
  console.log('\n11. Sequence status (ticket_seq):');
  console.table(seqRes.rows);

  // 12. Check if other tables mention ticket_id or ticket_number
  const otherRefs = await query(`
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN ('ticket_id', 'ticket_number')
      AND table_name NOT IN ('tickets', 'ticket_comments', 'ticket_activities', 'ticket_attachments')
    ORDER BY table_name;
  `);
  console.log('\n12. Other tables with ticket_id or ticket_number columns:');
  console.table(otherRefs.rows);

  await pool.end();
}

runInspection().catch(err => {
  console.error('Inspection error:', err);
  process.exit(1);
});

