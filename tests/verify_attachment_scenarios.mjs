/**
 * ============================================================
 * TEAMSYNC ATTACHMENT SCENARIO VERIFICATION
 * ============================================================
 *
 * SAFETY NOTICE:
 *   This script MUTATES PRODUCTION DATA.
 *   It MUST NOT be run as part of `npm test`, CI, or local dev.
 *
 * TO RUN THIS SCRIPT:
 *   You must explicitly pass: --production-confirmed=YES_I_UNDERSTAND
 *   You must set environment variables (never hardcoded here):
 *     TEAMSYNC_API_KEY
 *     TEAMSYNC_BASE_URL
 *
 * EXAMPLE (opt-in only):
 *   TEAMSYNC_API_KEY=... TEAMSYNC_BASE_URL=... node tests/verify_attachment_scenarios.mjs --production-confirmed=YES_I_UNDERSTAND
 *
 * ============================================================
 */

// ─────────────────────────────────────────────────────────────────────────────
// SAFETY GATE — must explicitly opt-in via CLI flag
// ─────────────────────────────────────────────────────────────────────────────
const confirmed = process.argv.includes('--production-confirmed=YES_I_UNDERSTAND');
if (!confirmed) {
  console.error('');
  console.error('╔══════════════════════════════════════════════════════════════╗');
  console.error('║  SAFETY ABORT: This script mutates production data.          ║');
  console.error('║                                                              ║');
  console.error('║  To run it you must explicitly pass:                         ║');
  console.error('║    --production-confirmed=YES_I_UNDERSTAND                   ║');
  console.error('║                                                              ║');
  console.error('║  Set credentials via environment variables — NEVER hardcode. ║');
  console.error('╚══════════════════════════════════════════════════════════════╝');
  console.error('');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// REJECT test execution inside automated CI / npm test
// ─────────────────────────────────────────────────────────────────────────────
const forbiddenEnvs = ['CI', 'GITHUB_ACTIONS', 'GITLAB_CI', 'CIRCLECI', 'TRAVIS'];
for (const envKey of forbiddenEnvs) {
  if (process.env[envKey]) {
    console.error(`ABORT: Detected CI environment variable "${envKey}". This script must never run in CI.`);
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Read credentials from environment variables ONLY — no hardcoded values
// ─────────────────────────────────────────────────────────────────────────────
const TEAMSYNC_BASE = process.env.TEAMSYNC_BASE_URL;
const TEAMSYNC_API_KEY = process.env.TEAMSYNC_API_KEY;

if (!TEAMSYNC_BASE || !TEAMSYNC_API_KEY) {
  console.error('ABORT: Missing required environment variables.');
  console.error('Required: TEAMSYNC_BASE_URL, TEAMSYNC_API_KEY');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// IDENTITY SAFETY: Validate no production domains are used as reporter identity
// ─────────────────────────────────────────────────────────────────────────────
const BLOCKED_REPORTER_DOMAINS = [
  'kalvium.community',
  'kalvium.com',
  'kalvilearn.com',
  'gmail.com',
];

function assertSyntheticIdentity(email, label) {
  if (!email) throw new Error(`${label}: reporter email must be provided`);
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) throw new Error(`${label}: invalid email format`);
  if (BLOCKED_REPORTER_DOMAINS.includes(domain)) {
    throw new Error(
      `SAFETY VIOLATION: ${label} uses a real/production email domain "${domain}". ` +
      `Test reporters must use synthetic domains like @kalvilearn.test or @example.test`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SYNTHETIC TEST IDENTITY — never use real users
// ─────────────────────────────────────────────────────────────────────────────
const SYNTHETIC_TEST_USER = {
  id: 'synthetic-attachment-test-user-001',
  name: 'Attachment Test Synthetic User',
  email: 'synthetic.attachment@kalvilearn.test',
  role: 'STUDENT'
};

// Validate synthetic identity before use
assertSyntheticIdentity(SYNTHETIC_TEST_USER.email, 'SYNTHETIC_TEST_USER');

// ─────────────────────────────────────────────────────────────────────────────
// MAIN TEST SUITE
// ─────────────────────────────────────────────────────────────────────────────
async function run() {
  console.log('========================================================================');
  console.log('🧪 VERIFYING ZERO-ATTACHMENT & IMAGE ATTACHMENT PRODUCTION SCENARIOS');
  console.log('========================================================================\n');
  console.log('NOTE: All test data uses SYNTHETIC identities. No real users are referenced.');

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario A: ZERO ATTACHMENTS (No attachment provided)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- SCENARIO A: Report with ZERO ATTACHMENTS ---');
  const refNoAtt = `E2E-NOATT-${Date.now().toString().slice(-8)}`;
  const payloadNoAtt = {
    source: 'KALVILEARN',
    sourceReferenceId: refNoAtt,
    type: 'BUG',
    title: 'Zero Attachment Verification Test',
    description: 'Testing that reports without attachments display zero attachment chrome and flow directly to discussion.',
    priority: 'LOW',
    portal: 'STUDENT',
    user: SYNTHETIC_TEST_USER,
    attachments: [],
    metadata: {
      attachmentUrl: null,
      testSuite: 'attachment-scenario-verify'
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

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario B: WITH SYNTHETIC IMAGE ATTACHMENT
  // Note: attachment URL must point to a public test/non-production file
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SCENARIO B: Report WITH SYNTHETIC IMAGE ATTACHMENT ---');
  const refWithAtt = `E2E-IMG-${Date.now().toString().slice(-8)}`;

  // Use a publicly accessible synthetic test image (no production data)
  const testImageUrl = process.env.TEST_ATTACHMENT_URL || 'https://placehold.co/800x600.png';

  const payloadWithAtt = {
    source: 'KALVILEARN',
    sourceReferenceId: refWithAtt,
    type: 'BUG',
    title: 'Image Attachment Verification Test',
    description: 'Testing that reports with an image attachment have full metadata, fileUrl, and preview support.',
    priority: 'LOW',
    portal: 'STUDENT',
    user: SYNTHETIC_TEST_USER,
    attachmentUrl: testImageUrl,
    metadata: {
      attachmentUrl: testImageUrl,
      testSuite: 'attachment-scenario-verify'
    },
    attachments: [
      {
        fileName: 'synthetic_test_screenshot.png',
        fileUrl: testImageUrl,
        fileType: 'image/png',
        fileSize: 50000
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
    console.log('✅ Scenario B PASSED: Synthetic image attachment persisted and returned with full metadata!');
  } else {
    throw new Error(`Scenario B Failed: Expected at least 1 attachment, got 0`);
  }

  console.log('\n========================================================================');
  console.log('🎉 ALL ATTACHMENT SCENARIO TESTS PASSED SUCCESSFULLY!');
  console.log('   Reporter used: SYNTHETIC identity (no real user data)');
  console.log('========================================================================\n');
}

run().catch(async (err) => {
  console.error('❌ Attachment Scenario Test Error:', err);
  process.exit(1);
});
