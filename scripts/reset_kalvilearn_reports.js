/**
 * scripts/reset_kalvilearn_reports.js
 *
 * Completely resets KalviLearn Integration Hub reports by permanently
 * deleting report records in an atomic PostgreSQL transaction.
 *
 * Scope:
 * - public.tickets (source = 'KALVILEARN')
 * - public.ticket_comments (FK ON DELETE CASCADE)
 * - public.ticket_activities (FK ON DELETE CASCADE)
 * - public.ticket_attachments (FK ON DELETE CASCADE)
 * - public.webhook_deliveries (outbound KalviLearn ticket events)
 * - ticket_seq sequence reset to 1001
 *
 * Preserves:
 * - public.profiles (all users, authentication, roles, avatars)
 * - public.tasks (internal engineering tasks)
 * - public.departments & department_members
 * - public.channels & messages
 * - public.push_subscriptions
 * - public.bug_reports
 * - All schemas, RLS policies, tables, and integrations
 */

import { pool } from '../server/db.js';

export async function executeReset() {
  const client = await pool.connect();
  console.log('Connected to PostgreSQL database for KalviLearn reset.');

  try {
    await client.query('BEGIN;');
    console.log('Transaction started (BEGIN).');

    // 1. Audit pre-deletion counts
    const preTickets = await client.query("SELECT COUNT(*) as count FROM public.tickets WHERE source = 'KALVILEARN';");
    const preComments = await client.query("SELECT COUNT(*) as count FROM public.ticket_comments tc JOIN public.tickets t ON tc.ticket_id = t.id WHERE t.source = 'KALVILEARN';");
    const preActivities = await client.query("SELECT COUNT(*) as count FROM public.ticket_activities ta JOIN public.tickets t ON ta.ticket_id = t.id WHERE t.source = 'KALVILEARN';");
    const preAttachments = await client.query("SELECT COUNT(*) as count FROM public.ticket_attachments att JOIN public.tickets t ON att.ticket_id = t.id WHERE t.source = 'KALVILEARN';");
    const preWebhooks = await client.query("SELECT COUNT(*) as count FROM public.webhook_deliveries;");

    console.log('\n--- Pre-Deletion Counts ---');
    console.log(`Tickets (source='KALVILEARN'): ${preTickets.rows[0].count}`);
    console.log(`Ticket Comments:               ${preComments.rows[0].count}`);
    console.log(`Ticket Activities:             ${preActivities.rows[0].count}`);
    console.log(`Ticket Attachments:            ${preAttachments.rows[0].count}`);
    console.log(`Webhook Deliveries:            ${preWebhooks.rows[0].count}`);

    // 2. Perform deletion in foreign-key safe order
    // Note: ticket_comments, ticket_activities, ticket_attachments cascade automatically,
    // but explicit deletion ensures verifiable record reporting.
    const delAttachments = await client.query(`
      DELETE FROM public.ticket_attachments
      WHERE ticket_id IN (SELECT id FROM public.tickets WHERE source = 'KALVILEARN');
    `);
    console.log(`Deleted ticket_attachments: ${delAttachments.rowCount}`);

    const delComments = await client.query(`
      DELETE FROM public.ticket_comments
      WHERE ticket_id IN (SELECT id FROM public.tickets WHERE source = 'KALVILEARN');
    `);
    console.log(`Deleted ticket_comments: ${delComments.rowCount}`);

    const delActivities = await client.query(`
      DELETE FROM public.ticket_activities
      WHERE ticket_id IN (SELECT id FROM public.tickets WHERE source = 'KALVILEARN');
    `);
    console.log(`Deleted ticket_activities: ${delActivities.rowCount}`);

    const delWebhooks = await client.query(`
      DELETE FROM public.webhook_deliveries
      WHERE target_url LIKE '%kalvilearn%'
         OR payload->>'source' = 'KALVILEARN'
         OR payload->'data'->>'ticketNumber' IS NOT NULL
         OR payload->'ticket'->>'source' = 'KALVILEARN'
         OR event_type IN ('TICKET_CREATED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'ASSIGNED', 'RESOLVED', 'CLOSED', 'REOPENED', 'COMMENT_CREATED', 'TICKET_DELETED');
    `);
    console.log(`Deleted webhook_deliveries: ${delWebhooks.rowCount}`);

    const delTickets = await client.query(`
      DELETE FROM public.tickets
      WHERE source = 'KALVILEARN';
    `);
    console.log(`Deleted tickets: ${delTickets.rowCount}`);

    // 3. Reset ticket number sequence to 1001
    await client.query('ALTER SEQUENCE ticket_seq RESTART WITH 1001;');
    console.log('Reset ticket_seq to 1001.');

    // 4. Verify post-deletion counts inside transaction
    const postTickets = await client.query('SELECT COUNT(*) as count FROM public.tickets;');
    const postComments = await client.query('SELECT COUNT(*) as count FROM public.ticket_comments;');
    const postActivities = await client.query('SELECT COUNT(*) as count FROM public.ticket_activities;');
    const postAttachments = await client.query('SELECT COUNT(*) as count FROM public.ticket_attachments;');
    const postWebhooks = await client.query('SELECT COUNT(*) as count FROM public.webhook_deliveries;');

    // Verify non-ticket tables remain intact
    const profilesCount = await client.query('SELECT COUNT(*) as count FROM public.profiles;');
    const tasksCount = await client.query('SELECT COUNT(*) as count FROM public.tasks;');

    if (parseInt(postTickets.rows[0].count, 10) !== 0) {
      throw new Error(`Integrity check failed: Expected 0 tickets, found ${postTickets.rows[0].count}`);
    }

    console.log('\n--- Post-Deletion Verification ---');
    console.log(`Remaining Tickets:             ${postTickets.rows[0].count}`);
    console.log(`Remaining Ticket Comments:     ${postComments.rows[0].count}`);
    console.log(`Remaining Ticket Activities:   ${postActivities.rows[0].count}`);
    console.log(`Remaining Ticket Attachments:  ${postAttachments.rows[0].count}`);
    console.log(`Remaining Webhook Deliveries:  ${postWebhooks.rows[0].count}`);
    console.log(`Preserved User Profiles:       ${profilesCount.rows[0].count}`);
    console.log(`Preserved TeamSync Tasks:      ${tasksCount.rows[0].count}`);

    await client.query('COMMIT;');
    console.log('\nTransaction successfully committed (COMMIT).');

    return {
      success: true,
      deleted: {
        tickets: delTickets.rowCount,
        comments: delComments.rowCount,
        activities: delActivities.rowCount,
        attachments: delAttachments.rowCount,
        webhooks: delWebhooks.rowCount
      },
      preserved: {
        profiles: parseInt(profilesCount.rows[0].count, 10),
        tasks: parseInt(tasksCount.rows[0].count, 10)
      }
    };
  } catch (err) {
    await client.query('ROLLBACK;');
    console.error('Transaction rolled back due to error:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Allow CLI execution
if (process.argv[1]?.endsWith('reset_kalvilearn_reports.js')) {
  executeReset()
    .then((res) => {
      console.log('\nReset completed successfully:', JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('\nReset failed:', err.message);
      process.exit(1);
    });
}

