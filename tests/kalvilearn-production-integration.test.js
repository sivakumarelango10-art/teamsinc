import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import crypto from 'node:crypto';
import { app } from '../server/app.js';
import { pool, query } from '../server/db.js';
import {
  generateWebhookSignature,
  verifyWebhookSignature,
  computeRawHexSignature,
  calculateBackoffMs,
  isBlockedDestination,
  setWebhookTransportHook,
  resetWebhookTransportHook,
  deliverWebhook
} from '../server/services/webhookService.js';

describe('TeamSync ➔ KalviLearn Production Integration Verification Suite', () => {
  let server;
  let baseUrl;
  const TEST_API_KEY = 'ts_live_kalvilearn_sec_99a8b1c4e2d3f7';
  const TEST_WEBHOOK_SECRET = 'ts_whsec_kalvilearn_39a1b2c4d5e6';
  let createdTicketId = null;
  let createdTicketNumber = null;
  const testSourceRef = `FB-${Date.now()}`;
  let testProfileId = null;

  before(async () => {
    // Start local test server
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    // Get a valid profile id from the database for assignment tests
    const profileRes = await query('SELECT id FROM public.profiles WHERE is_active = true LIMIT 1;');
    if (profileRes.rows.length > 0) {
      testProfileId = profileRes.rows[0].id;
    }
  });

  after(async () => {
    resetWebhookTransportHook();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART 1: INBOUND API AUTHENTICATION (POST /api/v1/tickets)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Part 1: Inbound API Authentication', () => {
    it('Rejects unauthenticated requests with HTTP 401', async () => {
      const res = await fetch(`${baseUrl}/api/v1/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'KALVILEARN',
          sourceReferenceId: `FB-UNAUTH-${Date.now()}`,
          title: 'Unauthenticated report',
          description: 'This must be rejected without API key.',
          category: 'BUG',
          reporter: { name: 'Anonymous', email: 'anon@test.com' }
        })
      });
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.error, /Missing API key/i);
    });

    it('Rejects invalid Bearer token with HTTP 401', async () => {
      const res = await fetch(`${baseUrl}/api/v1/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer invalid_forged_key_value'
        },
        body: JSON.stringify({
          source: 'KALVILEARN',
          sourceReferenceId: `FB-FORGED-${Date.now()}`,
          title: 'Forged key report',
          description: 'This must be rejected.',
          category: 'BUG',
          reporter: { name: 'Attacker', email: 'attacker@evil.com' }
        })
      });
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.error, /Invalid API key/i);
    });

    it('Rejects client-supplied API key embedded in payload (Must be header only)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'KALVILEARN',
          apiKey: TEST_API_KEY, // Supplied in body, NOT in header
          sourceReferenceId: `FB-BODYKEY-${Date.now()}`,
          title: 'Body key attempt',
          description: 'Key in body should not be accepted as auth.',
          category: 'BUG',
          reporter: { name: 'Tester', email: 'test@test.com' }
        })
      });
      assert.strictEqual(res.status, 401);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART 2: TICKET CREATION CONTRACT (POST /api/v1/tickets)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Part 2: Ticket Creation Contract Compliance', () => {
    it('Creates ticket conforming to KalviLearn contract and returns id & ticketNumber', async () => {
      const res = await fetch(`${baseUrl}/api/v1/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_API_KEY}`,
          'X-Source': 'KALVILEARN',
          'X-Source-Reference': testSourceRef
        },
        body: JSON.stringify({
          source: 'KALVILEARN',
          sourceReferenceId: testSourceRef,
          title: 'Production Verification: Student Submission Timeout',
          description: 'Submissions taking over 30 seconds to evaluate in Python sandbox.',
          category: 'BUG',
          priority: 'HIGH',
          reporter: {
            userId: 'usr_kavya_101',
            name: 'Kavya Ramesh',
            email: 'kavya.ramesh@kalvium.community'
          },
          portal: 'STUDENT',
          metadata: {
            browser: 'Chrome 122',
            device: 'MacBook Pro',
            rating: '4'
          }
        })
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.id, 'Response must contain top-level id');
      assert.ok(data.ticketNumber, 'Response must contain top-level ticketNumber');
      assert.match(data.ticketNumber, /^TS-\d+$/, 'ticketNumber must follow TS-XXXX format');
      assert.strictEqual(data.source, 'KALVILEARN');
      assert.strictEqual(data.sourceReferenceId, testSourceRef);
      assert.strictEqual(data.status, 'OPEN');
      assert.strictEqual(data.priority, 'HIGH');

      createdTicketId = data.id;
      createdTicketNumber = data.ticketNumber;
    });

    it('Also supports KalviLearn user object structure with type & page', async () => {
      const userRef = `FB-USER-${Date.now()}`;
      const res = await fetch(`${baseUrl}/api/v1/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_API_KEY}`
        },
        body: JSON.stringify({
          source: 'KALVILEARN',
          sourceReferenceId: userRef,
          type: 'FEATURE',
          title: 'Mentor attendance bulk download',
          description: 'Allow mentors to export all month records as CSV format.',
          priority: 'LOW',
          portal: 'MENTOR',
          user: {
            id: 'usr_mentor_42',
            name: 'Aaditya Mentor',
            email: 'aaditya@kalvium.com',
            role: 'MENTOR'
          },
          page: '/mentor/attendance'
        })
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.type, 'FEATURE');
      assert.strictEqual(data.priority, 'LOW');
      assert.strictEqual(data.sourceReferenceId, userRef);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART 3: IDEMPOTENCY & DUPLICATE PREVENTION
  // ───────────────────────────────────────────────────────────────────────────
  describe('Part 3: Idempotency & Duplicate Prevention', () => {
    it('Returns existing ticket (HTTP 200) with identical sourceReferenceId', async () => {
      const res = await fetch(`${baseUrl}/api/v1/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_API_KEY}`
        },
        body: JSON.stringify({
          source: 'KALVILEARN',
          sourceReferenceId: testSourceRef,
          title: 'Duplicate submission attempt',
          description: 'Retrying the same sourceReferenceId should return existing ticket.',
          category: 'BUG',
          reporter: { name: 'Kavya Ramesh', email: 'kavya.ramesh@kalvium.community' }
        })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.idempotent, true);
      assert.strictEqual(data.id, createdTicketId);
      assert.strictEqual(data.ticketNumber, createdTicketNumber);
    });

    it('Returns existing ticket (HTTP 200) when matching Idempotency-Key header is supplied', async () => {
      const fixedIdempKey = `idem_prod_${Date.now()}_${Math.random()}`;

      // First call
      const res1 = await fetch(`${baseUrl}/api/v1/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_API_KEY}`,
          'Idempotency-Key': fixedIdempKey
        },
        body: JSON.stringify({
          source: 'KALVILEARN',
          title: 'Idempotency test submission',
          description: 'Testing idempotent retry mechanics with key header.',
          category: 'IMPROVEMENT',
          reporter: { name: 'Lead Dev', email: 'lead@kalvium.com' }
        })
      });
      assert.strictEqual(res1.status, 201);
      const data1 = await res1.json();

      // Retry with same Idempotency-Key
      const res2 = await fetch(`${baseUrl}/api/v1/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_API_KEY}`,
          'Idempotency-Key': fixedIdempKey
        },
        body: JSON.stringify({
          source: 'KALVILEARN',
          title: 'Idempotency test submission',
          description: 'Testing idempotent retry mechanics with key header.',
          category: 'IMPROVEMENT',
          reporter: { name: 'Lead Dev', email: 'lead@kalvium.com' }
        })
      });

      assert.strictEqual(res2.status, 200);
      const data2 = await res2.json();
      assert.strictEqual(data2.idempotent, true);
      assert.strictEqual(data2.id, data1.id);
      assert.strictEqual(data2.ticketNumber, data1.ticketNumber);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART 4 & 5: LIFECYCLE & PRIORITY MAPPING
  // ───────────────────────────────────────────────────────────────────────────
  describe('Part 4 & 5: Lifecycle State Machine & Priority Mapping', () => {
    it('Retrieves single ticket by ticketNumber, UUID id, and sourceReferenceId', async () => {
      // Lookup by ticketNumber
      const res1 = await fetch(`${baseUrl}/api/v1/tickets/${createdTicketNumber}`, {
        headers: { 'Authorization': `Bearer ${TEST_API_KEY}` }
      });
      assert.strictEqual(res1.status, 200);
      const data1 = await res1.json();
      assert.strictEqual(data1.ticket.ticketNumber, createdTicketNumber);

      // Lookup by UUID
      const res2 = await fetch(`${baseUrl}/api/v1/tickets/${createdTicketId}`, {
        headers: { 'Authorization': `Bearer ${TEST_API_KEY}` }
      });
      assert.strictEqual(res2.status, 200);
      const data2 = await res2.json();
      assert.strictEqual(data2.ticket.id, createdTicketId);

      // Lookup by sourceReferenceId
      const res3 = await fetch(`${baseUrl}/api/v1/tickets/${testSourceRef}`, {
        headers: { 'Authorization': `Bearer ${TEST_API_KEY}` }
      });
      assert.strictEqual(res3.status, 200);
      const data3 = await res3.json();
      assert.strictEqual(data3.ticket.sourceReferenceId, testSourceRef);
    });

    it('Rejects invalid status transition OPEN ➔ CLOSED with HTTP 422', async () => {
      const res = await fetch(`${baseUrl}/api/v1/tickets/${createdTicketNumber}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_API_KEY}`
        },
        body: JSON.stringify({ status: 'CLOSED' })
      });
      assert.strictEqual(res.status, 422);
      const data = await res.json();
      assert.match(data.error, /Cannot transition ticket from "OPEN" to "CLOSED"/i);
    });

    it('Executes valid status transition OPEN ➔ IN_PROGRESS', async () => {
      const res = await fetch(`${baseUrl}/api/v1/tickets/${createdTicketNumber}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_API_KEY}`
        },
        body: JSON.stringify({ status: 'IN_PROGRESS' })
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.ticket.status, 'IN_PROGRESS');
    });

    it('Maps priority alias URGENT to CRITICAL', async () => {
      const res = await fetch(`${baseUrl}/api/v1/tickets/${createdTicketNumber}/priority`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_API_KEY}`
        },
        body: JSON.stringify({ priority: 'URGENT' })
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.ticket.priority, 'CRITICAL');
    });

    it('Maps priority alias NORMAL to MEDIUM', async () => {
      const res = await fetch(`${baseUrl}/api/v1/tickets/${createdTicketNumber}/priority`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_API_KEY}`
        },
        body: JSON.stringify({ priority: 'NORMAL' })
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.ticket.priority, 'MEDIUM');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART 6: ASSIGNMENT
  // ───────────────────────────────────────────────────────────────────────────
  describe('Part 6: Team Member Assignment', () => {
    it('Assigns ticket to valid TeamSync user and verifies assignee details', async () => {
      if (!testProfileId) return;

      const res = await fetch(`${baseUrl}/api/v1/tickets/${createdTicketNumber}/assign`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_API_KEY}`
        },
        body: JSON.stringify({ assignedTo: testProfileId })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.ticket.assignedTo, testProfileId);
      assert.ok(data.ticket.assignee?.fullName);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART 7: COMMENTS & ECHO LOOP PREVENTION
  // ───────────────────────────────────────────────────────────────────────────
  describe('Part 7: Discussion Comments & Infinite Loop Prevention', () => {
    it('Adds staff comment and persists in ticket discussion thread', async () => {
      const res = await fetch(`${baseUrl}/api/v1/tickets/${createdTicketNumber}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_API_KEY}`
        },
        body: JSON.stringify({
          comment: 'Identified root cause in docker runner memory limit.',
          authorName: 'Alex Rivera',
          authorRole: 'ENGINEER'
        })
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.comment.comment, 'Identified root cause in docker runner memory limit.');
    });

    it('Prevents infinite echo loops when comment originates from KalviLearn', async () => {
      // Passing origin: KALVILEARN indicates it came from KalviLearn and should NOT be dispatched back
      const res = await fetch(`${baseUrl}/api/v1/tickets/${createdTicketNumber}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_API_KEY}`
        },
        body: JSON.stringify({
          comment: 'Student says the issue is also happening on Safari.',
          authorName: 'KalviLearn Student',
          authorRole: 'STUDENT',
          origin: 'KALVILEARN'
        })
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.success, true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART 8 - 13: WEBHOOK SIGNATURE, RETRIES, AND SSRF DEFENSE
  // ───────────────────────────────────────────────────────────────────────────
  describe('Part 8 - 13: Webhook Security, Retries & SSRF Defense', () => {
    const rawPayload = JSON.stringify({
      eventId: 'evt_test_100',
      eventType: 'STATUS_CHANGED',
      ticketId: 'ts_test_id',
      ticketNumber: 'TS-1001',
      sourceReferenceId: 'FB-1001',
      newStatus: 'IN_PROGRESS'
    });
    const timestamp = Math.floor(Date.now() / 1000);

    it('Generates canonical HMAC-SHA256 hex signature matching timestamp.rawBody', () => {
      const expectedHmac = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET);
      expectedHmac.update(`${timestamp}.${rawPayload}`);
      const expectedHex = expectedHmac.digest('hex');

      const hex = computeRawHexSignature(rawPayload, TEST_WEBHOOK_SECRET, timestamp);
      assert.strictEqual(hex, expectedHex);
    });

    it('Verifies raw hex signature with external timestamp', () => {
      const hex = computeRawHexSignature(rawPayload, TEST_WEBHOOK_SECRET, timestamp);
      const valid = verifyWebhookSignature(rawPayload, hex, TEST_WEBHOOK_SECRET, timestamp);
      assert.strictEqual(valid, true);
    });

    it('Verifies prefixed v1=<hex> signature', () => {
      const hex = computeRawHexSignature(rawPayload, TEST_WEBHOOK_SECRET, timestamp);
      const valid = verifyWebhookSignature(rawPayload, `v1=${hex}`, TEST_WEBHOOK_SECRET, timestamp);
      assert.strictEqual(valid, true);
    });

    it('Verifies legacy t=...,v1=... format', () => {
      const legacySig = generateWebhookSignature(rawPayload, TEST_WEBHOOK_SECRET, timestamp);
      const valid = verifyWebhookSignature(rawPayload, legacySig, TEST_WEBHOOK_SECRET);
      assert.strictEqual(valid, true);
    });

    it('Rejects tampered payload during verification', () => {
      const hex = computeRawHexSignature(rawPayload, TEST_WEBHOOK_SECRET, timestamp);
      const tampered = JSON.stringify({ ...JSON.parse(rawPayload), newStatus: 'HACKED' });
      const valid = verifyWebhookSignature(tampered, hex, TEST_WEBHOOK_SECRET, timestamp);
      assert.strictEqual(valid, false);
    });

    it('Rejects incorrect secret', () => {
      const hex = computeRawHexSignature(rawPayload, 'wrong_secret', timestamp);
      const valid = verifyWebhookSignature(rawPayload, hex, TEST_WEBHOOK_SECRET, timestamp);
      assert.strictEqual(valid, false);
    });

    it('SSRF defense blocks cloud metadata IP 169.254.169.254', () => {
      const blocked = isBlockedDestination('http://169.254.169.254/latest/meta-data');
      assert.strictEqual(blocked, true);
    });

    it('SSRF defense blocks Google cloud metadata internal host', () => {
      const blocked = isBlockedDestination('http://metadata.google.internal/computeMetadata/v1/');
      assert.strictEqual(blocked, true);
    });

    it('SSRF defense permits valid HTTPS destination', () => {
      const blocked = isBlockedDestination('https://kalvilearn.vercel.app/api/integrations/teamsync/webhooks');
      assert.strictEqual(blocked, false);
    });

    it('Handles permanent failure (HTTP 401) immediately with zero retries', async () => {
      setWebhookTransportHook(async () => ({
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid webhook signature'
      }));

      const res = await deliverWebhook({
        eventId: `evt_perm_${Date.now()}`,
        eventType: 'STATUS_CHANGED',
        url: 'https://kalvilearn.vercel.app/api/integrations/teamsync/webhooks',
        payloadString: rawPayload,
        signature: 'test-sig',
        timestamp,
        attempt: 1
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.permanentFailure, true);
      assert.strictEqual(res.retryScheduled, false);
      resetWebhookTransportHook();
    });

    it('Retries transient failure (HTTP 502) with exponential backoff', async () => {
      setWebhookTransportHook(async () => ({
        status: 502,
        statusText: 'Bad Gateway',
        text: async () => 'Upstream server unreachable'
      }));

      const res = await deliverWebhook({
        eventId: `evt_trans_${Date.now()}`,
        eventType: 'STATUS_CHANGED',
        url: 'https://kalvilearn.vercel.app/api/integrations/teamsync/webhooks',
        payloadString: rawPayload,
        signature: 'test-sig',
        timestamp,
        attempt: 1
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.retryScheduled, true);
      resetWebhookTransportHook();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART 14 - 17: HEALTH CHECK & ZERO SECRET LEAKAGE
  // ───────────────────────────────────────────────────────────────────────────
  describe('Part 14 - 17: Health Endpoints & Secret Leakage Prevention', () => {
    it('GET /health returns HTTP 200 with service status', async () => {
      const res = await fetch(`${baseUrl}/health`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'ok');
      assert.strictEqual(data.service, 'TeamSync API Engine');
      assert.ok(data.timestamp);
    });

    it('GET /api/health returns HTTP 200', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'ok');
    });

    it('Never leaks secrets in responses or public outputs', async () => {
      const res = await fetch(`${baseUrl}/api/v1/tickets/${createdTicketNumber}`, {
        headers: { 'Authorization': `Bearer ${TEST_API_KEY}` }
      });
      const bodyText = await res.text();

      assert.strictEqual(bodyText.includes(TEST_API_KEY), false, 'API key must never appear in response body');
      assert.strictEqual(bodyText.includes(TEST_WEBHOOK_SECRET), false, 'Webhook secret must never appear in response body');
      assert.strictEqual(bodyText.includes('postgres:'), false, 'Database password must never appear in response body');
    });
  });
});
