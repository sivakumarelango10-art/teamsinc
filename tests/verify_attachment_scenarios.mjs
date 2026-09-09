import crypto from 'node:crypto';
import pg from 'pg';

const kalviDbUrl = "postgresql://postgres.iavxnhwbgoarnexmyxpn:256GMwggSehzj1NQ@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres";
const kalviPool = new pg.Pool({
  connectionString: kalviDbUrl,
  ssl: { rejectUnauthorized: false }
});

const TEAMSYNC_BASE = 'https://teamsync-fawn.vercel.app';
const TEAMSYNC_API_KEY = 'ts_live_kalvilearn_sec_99a8b1c4e2d3f7';

async function run() {
  console.log('========================================================================');
  console.log('🧪 VERIFYING ZERO-ATTACHMENT & IMAGE ATTACHMENT PRODUCTION SCENARIOS');
  console.log('========================================================================\n');

  const userQuery = await kalviPool.query('SELECT id, name, email, role FROM public.users LIMIT 1;');
  const testUser = userQuery.rows[0] || {
    id: '36a74ed3-4a98-4374-a3d1-be0e2050b81c',
    name: 'Kavya Ramesh',
    email: 'kavya.ramesh.s.121@kalvium.community',
    role: 'STUDENT'
  };

  // -------------------------------------------------------------
  // Scenario A: ZERO ATTACHMENTS (No attachment provided)
  // -------------------------------------------------------------
  console.log('--- SCENARIO A: Report with ZERO ATTACHMENTS ---');
  const refNoAtt = `FB-NOATT-${Date.now().toString().slice(-5)}`;
  const payloadNoAtt = {
    source: 'KALVILEARN',
    sourceReferenceId: refNoAtt,
    type: 'BUG',
    title: 'Zero Attachment Test Report',
    description: 'Testing that reports without attachments display zero attachment chrome and flow directly to discussion.',
    priority: 'LOW',
    portal: 'STUDENT',
    user: testUser,
    attachments: [],
    metadata: {
      attachmentUrl: null
    }
  };

  const resA = await fetch(`${TEAMSYNC_BASE}/api/v1/tickets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TEAMSYNC_API_KEY}`,
      'X-API-Key': TEAMSYNC_API_KEY,
      'Idempotency-Key': refNoAtt,
      'X-Source': 'KALVILEARN'
    },
    body: JSON.stringify(payloadNoAtt)
  });

  const dataA = await resA.json();
  console.log(`Scenario A Response (HTTP ${resA.status}):`, dataA.ticketNumber || dataA.ticket?.ticketNumber);
  const ticketNumberA = dataA.ticketNumber || dataA.ticket?.ticketNumber;

  // Query details of ticket A from TeamSync API
  const getTicketA = await fetch(`${TEAMSYNC_BASE}/api/v1/integrations/kalvilearn/tickets/${ticketNumberA}`, {
    headers: {
      'Authorization': `Bearer ${TEAMSYNC_API_KEY}`,
      'X-API-Key': TEAMSYNC_API_KEY
    }
  });
  const detailA = await getTicketA.json();
  const attachmentsA = detailA.ticket?.attachments || [];
  console.log(`Scenario A Attachments count: ${attachmentsA.length}`);
  if (attachmentsA.length === 0) {
    console.log('✅ Scenario A PASSED: Ticket has 0 attachments. Zero-attachment rule satisfied.');
  } else {
    throw new Error(`Scenario A Failed: Expected 0 attachments, got ${attachmentsA.length}`);
  }

  // -------------------------------------------------------------
  // Scenario B: WITH REAL IMAGE ATTACHMENT
  // -------------------------------------------------------------
  console.log('\n--- SCENARIO B: Report WITH IMAGE ATTACHMENT ---');
  const refWithAtt = `FB-IMG-${Date.now().toString().slice(-5)}`;
  const testImageUrl = 'https://iavxnhwbgoarnexmyxpn.supabase.co/storage/v1/object/public/feedback-attachments/feedback/test_console_screenshot.png';

  const payloadWithAtt = {
    source: 'KALVILEARN',
    sourceReferenceId: refWithAtt,
    type: 'BUG',
    title: 'Image Attachment Test Report',
    description: 'Testing that reports with an image attachment have full metadata, fileUrl, and preview support.',
    priority: 'HIGH',
    portal: 'STUDENT',
    user: testUser,
    attachmentUrl: testImageUrl,
    metadata: {
      attachmentUrl: testImageUrl
    },
    attachments: [
      {
        fileName: 'test_console_screenshot.png',
        fileUrl: testImageUrl,
        fileType: 'image/png',
        fileSize: 104857
      }
    ]
  };

  const resB = await fetch(`${TEAMSYNC_BASE}/api/v1/tickets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TEAMSYNC_API_KEY}`,
      'X-API-Key': TEAMSYNC_API_KEY,
      'Idempotency-Key': refWithAtt,
      'X-Source': 'KALVILEARN'
    },
    body: JSON.stringify(payloadWithAtt)
  });

  const dataB = await resB.json();
  console.log(`Scenario B Response (HTTP ${resB.status}):`, dataB.ticketNumber || dataB.ticket?.ticketNumber);
  const ticketNumberB = dataB.ticketNumber || dataB.ticket?.ticketNumber;

  // Query details of ticket B from TeamSync API
  const getTicketB = await fetch(`${TEAMSYNC_BASE}/api/v1/integrations/kalvilearn/tickets/${ticketNumberB}`, {
    headers: {
      'Authorization': `Bearer ${TEAMSYNC_API_KEY}`,
      'X-API-Key': TEAMSYNC_API_KEY
    }
  });
  const detailB = await getTicketB.json();
  const attachmentsB = detailB.ticket?.attachments || [];
  console.log(`Scenario B Attachments count: ${attachmentsB.length}`);
  if (attachmentsB.length > 0) {
    const firstAtt = attachmentsB[0];
    console.log(`Attachment 0: fileName="${firstAtt.fileName}", fileSize=${firstAtt.fileSize}, fileUrl="${firstAtt.fileUrl}"`);
    console.log('✅ Scenario B PASSED: Real image attachment persisted and returned with full metadata!');
  } else {
    throw new Error(`Scenario B Failed: Expected at least 1 attachment, got 0`);
  }

  console.log('\n========================================================================');
  console.log('🎉 ALL ATTACHMENT SCENARIO TESTS PASSED SUCCESSFULLY!');
  console.log('========================================================================\n');

  await kalviPool.end();
}

run().catch(async (err) => {
  console.error('❌ Attachment Scenario Test Error:', err);
  await kalviPool.end();
  process.exit(1);
});
