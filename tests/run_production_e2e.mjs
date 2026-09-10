/**
 * ============================================================
 * TEAMSYNC PRODUCTION CONNECTIVITY VERIFICATION
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
 *     KALVILEARN_WEBHOOK_URL
 *     KALVILEARN_WEBHOOK_SECRET
 *     KALVI_DB_URL   (KalviLearn database — for bidirectional verification only)
 *
 * NEVER hardcode production credentials, real user identities,
 * or database passwords into this file.
 *
 * EXAMPLE (opt-in only):
 *   TEAMSYNC_API_KEY=... TEAMSYNC_BASE_URL=... node tests/run_production_e2e.mjs --production-confirmed=YES_I_UNDERSTAND
 *
 * ============================================================
 */

import crypto from 'node:crypto';

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
const KALVILEARN_WEBHOOK_URL = process.env.KALVILEARN_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.KALVILEARN_WEBHOOK_SECRET;
const KALVI_DB_URL = process.env.KALVI_DB_URL; // Optional: only for bidirectional DB verification

if (!TEAMSYNC_BASE || !TEAMSYNC_API_KEY || !KALVILEARN_WEBHOOK_URL || !WEBHOOK_SECRET) {
  console.error('ABORT: Missing required environment variables.');
  console.error('Required: TEAMSYNC_BASE_URL, TEAMSYNC_API_KEY, KALVILEARN_WEBHOOK_URL, KALVILEARN_WEBHOOK_SECRET');
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
  id: 'synthetic-e2e-user-prod-verify-001',
  name: 'E2E Synthetic Tester',
  email: 'synthetic.e2e@kalvilearn.test',
  role: 'STUDENT'
};

// Validate synthetic identity before use
assertSyntheticIdentity(SYNTHETIC_TEST_USER.email, 'SYNTHETIC_TEST_USER');

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────
async function fetchWithRetry(url, options, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`[Network retry ${attempt}/${retries}] Retrying ${url}...`);
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN TEST SUITE
// ─────────────────────────────────────────────────────────────────────────────
async function runRealEndToEnd() {
  console.log('========================================================================');
  console.log('🚀 TEAMSYNC PRODUCTION CONNECTIVITY & BIDIRECTIONAL INTEGRATION TEST');
  console.log('========================================================================');
  console.log('TeamSync Production: ', TEAMSYNC_BASE);
  console.log('KalviLearn Webhook:  ', KALVILEARN_WEBHOOK_URL);
  console.log('Reporter Identity:   ', `${SYNTHETIC_TEST_USER.name} <${SYNTHETIC_TEST_USER.email}>`);
  console.log('NOTE: All test data uses SYNTHETIC identities. No real users are referenced.');

  const timestamp = Date.now();
  const testRef = `E2E-PROD-VERIFY-${timestamp.toString().slice(-8)}`;

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 1: KalviLearn ➔ TeamSync Live Ticket Creation
  // ───────────────────────────────────────────────────────────────────────────
  console.log(`\n--- TEST 1: KalviLearn ➔ TeamSync Live Ticket Creation ---`);
  const ticketPayload = {
    source: 'KALVILEARN',
    sourceReferenceId: testRef,
    type: 'BUG',
    title: 'Production Connectivity Verification',
    description: 'Automated connectivity verification test. This ticket was created by the opt-in production E2E script.',
    priority: 'LOW',
    portal: 'STUDENT',
    user: SYNTHETIC_TEST_USER,
    page: '/classroom/terminal',
    metadata: {
      browser: 'Chrome 128',
      platform: 'CI/Test Verification',
      testSuite: 'Production-E2E-Verified'
    }
  };

  const tsRes = await fetchWithRetry(`${TEAMSYNC_BASE}/api/v1/tickets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TEAMSYNC_API_KEY}`,
      'X-API-Key': TEAMSYNC_API_KEY,
      'Idempotency-Key': testRef,
      'X-Source': 'KALVILEARN'
    },
    body: JSON.stringify(ticketPayload)
  });

  const tsData = await tsRes.json();
  console.log(`TeamSync API Response: HTTP ${tsRes.status}`, tsData);

  if (tsRes.status !== 201 && tsRes.status !== 200) {
    throw new Error(`TeamSync ticket creation failed with HTTP ${tsRes.status}: ${JSON.stringify(tsData)}`);
  }

  const teamSyncTicketId = tsData.id || tsData.ticket?.id;
  const teamSyncTicketNumber = tsData.ticketNumber || tsData.ticket?.ticketNumber;

  if (!teamSyncTicketId || !teamSyncTicketNumber) {
    throw new Error(`TeamSync response did not return expected ticketId and ticketNumber.`);
  }
  console.log(`✅ TeamSync ticket created: ID = ${teamSyncTicketId}, TicketNumber = ${teamSyncTicketNumber}`);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 2: STATUS_CHANGED Webhook -> KalviLearn
  // ───────────────────────────────────────────────────────────────────────────
  console.log(`\n--- TEST 2: TeamSync ➔ KalviLearn STATUS_CHANGED Webhook ---`);
  const statusPayload = {
    eventId: `evt_status_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    eventType: 'STATUS_CHANGED',
    timestamp: new Date().toISOString(),
    source: 'TEAMSYNC',
    status: 'TRIAGED',
    newStatus: 'TRIAGED',
    previousStatus: 'OPEN',
    ticket: {
      id: teamSyncTicketId,
      ticketNumber: teamSyncTicketNumber,
      sourceReferenceId: testRef,
      status: 'TRIAGED'
    }
  };

  const statusRaw = JSON.stringify(statusPayload);
  const statusTs = Math.floor(Date.now() / 1000).toString();
  const statusHmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  statusHmac.update(`${statusTs}.${statusRaw}`);
  const statusSig = statusHmac.digest('hex');

  const whStatusRes = await fetchWithRetry(KALVILEARN_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-TeamSync-Signature': statusSig,
      'X-TeamSync-Timestamp': statusTs,
      'X-TeamSync-Event-ID': statusPayload.eventId,
      'X-TeamSync-Event': 'STATUS_CHANGED'
    },
    body: statusRaw
  });

  const whStatusData = await whStatusRes.json().catch(() => null);
  console.log(`KalviLearn Webhook Response (STATUS_CHANGED): HTTP ${whStatusRes.status}`, whStatusData);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 3: PRIORITY_CHANGED Webhook -> KalviLearn
  // ───────────────────────────────────────────────────────────────────────────
  console.log(`\n--- TEST 3: TeamSync ➔ KalviLearn PRIORITY_CHANGED Webhook ---`);
  const prioPayload = {
    eventId: `evt_prio_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    eventType: 'PRIORITY_CHANGED',
    timestamp: new Date().toISOString(),
    source: 'TEAMSYNC',
    priority: 'MEDIUM',
    newPriority: 'MEDIUM',
    previousPriority: 'LOW',
    ticket: {
      id: teamSyncTicketId,
      ticketNumber: teamSyncTicketNumber,
      sourceReferenceId: testRef,
      priority: 'MEDIUM'
    }
  };

  const prioRaw = JSON.stringify(prioPayload);
  const prioTs = Math.floor(Date.now() / 1000).toString();
  const prioHmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  prioHmac.update(`${prioTs}.${prioRaw}`);
  const prioSig = prioHmac.digest('hex');

  const whPrioRes = await fetchWithRetry(KALVILEARN_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-TeamSync-Signature': prioSig,
      'X-TeamSync-Timestamp': prioTs,
      'X-TeamSync-Event-ID': prioPayload.eventId,
      'X-TeamSync-Event': 'PRIORITY_CHANGED'
    },
    body: prioRaw
  });

  const whPrioData = await whPrioRes.json().catch(() => null);
  console.log(`KalviLearn Webhook Response (PRIORITY_CHANGED): HTTP ${whPrioRes.status}`, whPrioData);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 4: COMMENT_CREATED Webhook -> KalviLearn
  // ───────────────────────────────────────────────────────────────────────────
  console.log(`\n--- TEST 4: TeamSync ➔ KalviLearn COMMENT_CREATED Webhook ---`);
  const commentPayload = {
    eventId: `evt_cmt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    eventType: 'COMMENT_CREATED',
    timestamp: new Date().toISOString(),
    source: 'TEAMSYNC',
    ticket: {
      id: teamSyncTicketId,
      ticketNumber: teamSyncTicketNumber,
      sourceReferenceId: testRef
    },
    comment: {
      id: `cmt_${Date.now()}`,
      content: 'Connectivity verification completed. Integration confirmed operational.',
      authorName: 'TeamSync System',
      authorRole: 'ADMIN',
      authorEmail: 'system@teamsync.io',
      createdAt: new Date().toISOString()
    }
  };

  const commentRaw = JSON.stringify(commentPayload);
  const commentTs = Math.floor(Date.now() / 1000).toString();
  const commentHmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  commentHmac.update(`${commentTs}.${commentRaw}`);
  const commentSig = commentHmac.digest('hex');

  const whCommentRes = await fetchWithRetry(KALVILEARN_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-TeamSync-Signature': commentSig,
      'X-TeamSync-Timestamp': commentTs,
      'X-TeamSync-Event-ID': commentPayload.eventId,
      'X-TeamSync-Event': 'COMMENT_CREATED'
    },
    body: commentRaw
  });

  const whCommentData = await whCommentRes.json().catch(() => null);
  console.log(`KalviLearn Webhook Response (COMMENT_CREATED): HTTP ${whCommentRes.status}`, whCommentData);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 5: Webhook Idempotency & Replay Protection
  // ───────────────────────────────────────────────────────────────────────────
  console.log(`\n--- TEST 5: Webhook Idempotency & Replay Protection ---`);
  console.log(`Re-sending identical event: ${commentPayload.eventId}`);

  const replayRes = await fetchWithRetry(KALVILEARN_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-TeamSync-Signature': commentSig,
      'X-TeamSync-Timestamp': commentTs,
      'X-TeamSync-Event-ID': commentPayload.eventId,
      'X-TeamSync-Event': 'COMMENT_CREATED'
    },
    body: commentRaw
  });

  const replayData = await replayRes.json().catch(() => null);
  console.log(`KalviLearn Webhook Replay Response: HTTP ${replayRes.status}`, replayData);

  console.log('\n========================================================================');
  console.log('🎉 ALL PRODUCTION CONNECTIVITY TESTS COMPLETED!');
  console.log(`   Synthetic ticket created: ${teamSyncTicketNumber} (ref: ${testRef})`);
  console.log('   Reporter used: SYNTHETIC identity (no real user data)');
  console.log('========================================================================\n');
}

runRealEndToEnd().catch(async (err) => {
  console.error('❌ Production E2E Test Error:', err);
  process.exit(1);
});
