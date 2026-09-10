/**
 * ============================================================
 * TEAMSYNC LIVE API CONTRACT VERIFICATION
 * ============================================================
 *
 * SAFETY NOTICE:
 *   This script sends real HTTP requests including a ticket creation (TEST 4)
 *   to the production TeamSync API. It MUTATES PRODUCTION DATA.
 *   It MUST NOT be run as part of `npm test`, CI, or local dev.
 *
 * TO RUN THIS SCRIPT:
 *   You must explicitly pass: --production-confirmed=YES_I_UNDERSTAND
 *   You must set environment variables (never hardcoded here):
 *     TEAMSYNC_API_KEY
 *     TEAMSYNC_BASE_URL
 *
 * EXAMPLE (opt-in only):
 *   TEAMSYNC_API_KEY=... TEAMSYNC_BASE_URL=... node tests/verify_live_api.mjs --production-confirmed=YES_I_UNDERSTAND
 *
 * NOTE: Tests 1-3 are read-only (auth checks / validation rejections).
 *       Tests 4-6 create real production tickets.
 *       All tests require the explicit opt-in flag.
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
const BASE_URL = process.env.TEAMSYNC_BASE_URL;
const VALID_KEY = process.env.TEAMSYNC_API_KEY;
const INVALID_KEY = 'invalid_key_forged_12345';  // This is safe — it's deliberately wrong

if (!BASE_URL || !VALID_KEY) {
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
const SYNTHETIC_REPORTER = {
  id: 'synthetic-api-verify-bot-001',
  name: 'API Contract Verification Bot',
  email: 'verification.bot@kalvilearn.test',
  role: 'STUDENT'
};
assertSyntheticIdentity(SYNTHETIC_REPORTER.email, 'SYNTHETIC_REPORTER');

// ─────────────────────────────────────────────────────────────────────────────
// MAIN VERIFICATION SUITE
// ─────────────────────────────────────────────────────────────────────────────
async function verifyLiveApi() {
  console.log('========================================================================');
  console.log('🔍 VERIFYING LIVE API ENDPOINT ON DEPLOYED TEAMSYNC');
  console.log('========================================================================');
  console.log('Target:', `${BASE_URL}/api/v1/tickets`);
  console.log('NOTE: Tests 4-6 create SYNTHETIC production tickets.');

  const uniqueId = Date.now();
  const testRef = `VERIFY-SYNTH-${uniqueId}`;

  // 1. Missing API Key -> 401 (read-only: auth rejection)
  const resMissing = await fetch(`${BASE_URL}/api/v1/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Test' })
  });
  console.log(`1. Missing API Key: HTTP ${resMissing.status} (Expected 401)`, resMissing.status === 401 ? '✅ PASS' : '❌ FAIL');

  // 2. Invalid API Key -> 401 (read-only: auth rejection)
  const resInvalid = await fetch(`${BASE_URL}/api/v1/tickets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${INVALID_KEY}`
    },
    body: JSON.stringify({ title: 'Test' })
  });
  console.log(`2. Invalid API Key: HTTP ${resInvalid.status} (Expected 401)`, resInvalid.status === 401 ? '✅ PASS' : '❌ FAIL');

  // 3. Invalid Payload -> 400 (read-only: validation rejection)
  const resBadPayload = await fetch(`${BASE_URL}/api/v1/tickets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VALID_KEY}`
    },
    body: JSON.stringify({
      source: 'KALVILEARN',
      title: 'Missing description',
      priority: 'NON_EXISTENT_PRIORITY'
    })
  });
  console.log(`3. Invalid Payload: HTTP ${resBadPayload.status} (Expected 400)`, resBadPayload.status === 400 ? '✅ PASS' : '❌ FAIL');

  // 4. Valid API Key -> 201 Ticket Created (MUTATES PRODUCTION — uses synthetic identity)
  const validPayload = {
    source: 'KALVILEARN',
    sourceReferenceId: testRef,
    type: 'BUG',
    title: 'Live Endpoint Contract Verification',
    description: 'Automated synthetic verification of live API contract compliance and response structure.',
    priority: 'LOW',
    portal: 'student',
    user: SYNTHETIC_REPORTER
  };

  const resValid = await fetch(`${BASE_URL}/api/v1/tickets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VALID_KEY}`,
      'Idempotency-Key': `SYNTH-IDEM-${uniqueId}`
    },
    body: JSON.stringify(validPayload)
  });
  const dataValid = await resValid.json();
  console.log(`4. Valid API Key: HTTP ${resValid.status} (Expected 201)`, resValid.status === 201 ? '✅ PASS' : '❌ FAIL');
  console.log('   Ticket Created (synthetic):', { id: dataValid.id, ticketNumber: dataValid.ticketNumber });

  // 5. Duplicate Idempotency-Key -> 200 with same ticket
  const resDuplicateIdem = await fetch(`${BASE_URL}/api/v1/tickets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VALID_KEY}`,
      'Idempotency-Key': `SYNTH-IDEM-${uniqueId}`
    },
    body: JSON.stringify({
      ...validPayload,
      sourceReferenceId: `DIFFERENT-REF-${Date.now()}`
    })
  });
  const dataDuplicateIdem = await resDuplicateIdem.json();
  const isSameIdem = dataDuplicateIdem.ticketNumber === dataValid.ticketNumber;
  console.log(`5. Duplicate Idempotency-Key: HTTP ${resDuplicateIdem.status} (Expected 200), same ticket: ${isSameIdem}`, (resDuplicateIdem.status === 200 && isSameIdem) ? '✅ PASS' : '❌ FAIL');

  // 6. Duplicate sourceReferenceId -> 200 with same ticket
  const resDuplicateRef = await fetch(`${BASE_URL}/api/v1/tickets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VALID_KEY}`,
      'Idempotency-Key': `NEW-SYNTH-IDEM-${Date.now()}`
    },
    body: JSON.stringify(validPayload)
  });
  const dataDuplicateRef = await resDuplicateRef.json();
  const isSameRef = dataDuplicateRef.ticketNumber === dataValid.ticketNumber;
  console.log(`6. Duplicate sourceReferenceId: HTTP ${resDuplicateRef.status} (Expected 200), same ticket: ${isSameRef}`, (resDuplicateRef.status === 200 && isSameRef) ? '✅ PASS' : '❌ FAIL');

  console.log('========================================================================');
  console.log('Reporter used: SYNTHETIC identity (no real user data)');
  console.log('========================================================================\n');
}

verifyLiveApi().catch(console.error);
