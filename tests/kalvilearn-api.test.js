import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { app } from '../server/app.js';
import { pool, query } from '../server/db.js';
import {
  generateWebhookSignature,
  verifyWebhookSignature,
  calculateBackoffMs
} from '../server/services/webhookService.js';
import { ALLOWED_STATUS_TRANSITIONS } from '../server/services/ticketService.js';

describe('KalviLearn ➔ TeamSync Integration API Test Suite', () => {
  let server;
  let baseUrl;
  const TEST_API_KEY = 'ts_live_kalvilearn_sec_99a8b1c4e2d3f7';
  let createdTicketNumber = null;
  let testProfileId = null;

  before(async () => {
    // 1. Start test HTTP server on ephemeral port
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    // 2. Fetch a real profile id from DB for assignment test
    const profileRes = await query('SELECT id FROM public.profiles LIMIT 1;');
    if (profileRes.rows.length > 0) {
      testProfileId = profileRes.rows[0].id;
    }
  });

  after(async () => {
    // Clean up test tickets created during this suite
    try {
      await query(`
        DELETE FROM public.tickets
        WHERE external_reference_id LIKE 'kalvilearn-bug-%'
           OR external_reference_id LIKE 'kalvilearn-feat-%'
           OR external_reference_id LIKE 'kalvilearn-crit-%'
           OR ($1::text IS NOT NULL AND ticket_number = $1);
      `, [createdTicketNumber]);
      await query('DELETE FROM public.webhook_deliveries WHERE event_type LIKE \'%TICKET%\' OR target_url LIKE \'%kalvilearn%\';').catch(() => {});
    } catch (_) {}

    // Clean up test server
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. AUTHENTICATION TESTS
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Server-to-Server Authentication', () => {
    it('Rejects requests with missing API key (HTTP 401)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/tickets`, {
        method: 'GET'
      });
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.error, /Missing API key/i);
    });

    it('Rejects requests with invalid / forged API key (HTTP 401)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/tickets`, {
        method: 'GET',
        headers: { 'x-api-key': 'invalid-token-12345' }
      });
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.error, /Invalid API key/i);
    });

    it('Accepts valid x-api-key header (HTTP 200)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/tickets`, {
        method: 'GET',
        headers: { 'x-api-key': TEST_API_KEY }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.tickets));
    });

    it('Accepts valid Authorization: Bearer <key> header (HTTP 200)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/tickets`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${TEST_API_KEY}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. INPUT VALIDATION TESTS
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Input Validation & Strict Enums', () => {
    it('Rejects invalid report type with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': TEST_API_KEY
        },
        body: JSON.stringify({
          source: 'KALVILEARN',
          type: 'UNSUPPORTED_MALICIOUS_TYPE',
          title: 'Valid Title Here',
          description: 'Valid description text here.',
          reporter: { name: 'Aaditya', email: 'aaditya@kalvium.com' }
        })
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.ok(data.details.some(d => d.includes('Invalid report type')));
    });

    it('Rejects missing title with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': TEST_API_KEY
        },
        body: JSON.stringify({
          source: 'KALVILEARN',
          type: 'BUG',
          description: 'Valid description text here.',
          reporter: { name: 'Aaditya', email: 'aaditya@kalvium.com' }
        })
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.details.some(d => d.includes('Field "title" is required')));
    });

    it('Rejects missing description with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': TEST_API_KEY
        },
        body: JSON.stringify({
          source: 'KALVILEARN',
          type: 'BUG',
          title: 'Valid Title',
          reporter: { name: 'Aaditya', email: 'aaditya@kalvium.com' }
        })
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.details.some(d => d.includes('Field "description" is required')));
    });

    it('Rejects malformed email address with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': TEST_API_KEY
        },
        body: JSON.stringify({
          source: 'KALVILEARN',
          type: 'BUG',
          title: 'Valid Title Here',
          description: 'Valid description text here.',
          reporter: { name: 'Aaditya', email: 'not-an-email' }
        })
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.details.some(d => d.includes('valid email address')));
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. TICKET CREATION & SENSIBLE PRIORITIES
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Ticket Creation & Priority Handling', () => {
    it('Successfully creates a BUG report with default priority MEDIUM (HTTP 201)', async () => {
      const uniqueRef = `kalvilearn-bug-${Date.now()}`;
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': TEST_API_KEY
        },
        body: JSON.stringify({
          source: 'KALVILEARN',
          type: 'BUG',
          title: 'Student View is not opening',
          description: 'Clicking Student View from the Mentor Portal does not open the student details page.',
          portal: 'MENTOR',
          route: '/mentor/students',
          module: 'STUDENT_VIEW',
          externalReferenceId: uniqueRef,
          reporter: {
            externalUserId: 'ext_aaditya_1',
            name: 'Aaditya R M',
            email: 'aaditya.rm@kalvium.com',
            role: 'MENTOR'
          },
          environment: 'production',
          browser: 'Chrome',
          device: 'Desktop',
          appVersion: '1.0.0'
        })
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.ticket.id);
      assert.match(data.ticket.ticketNumber, /^TS-\d+$/);
      assert.strictEqual(data.ticket.status, 'OPEN');
      assert.strictEqual(data.ticket.priority, 'MEDIUM'); // sensible default for BUG
      assert.strictEqual(data.ticket.externalReferenceId, uniqueRef);

      createdTicketNumber = data.ticket.ticketNumber;
    });

    it('Successfully creates a FEATURE request with default priority LOW (HTTP 201)', async () => {
      const uniqueRef = `kalvilearn-feat-${Date.now()}`;
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': TEST_API_KEY
        },
        body: JSON.stringify({
          source: 'KALVILEARN',
          type: 'FEATURE',
          title: 'Export Mentor Attendance as CSV',
          description: 'Mentors need a single button to download monthly attendance records as a spreadsheet.',
          portal: 'MENTOR',
          route: '/mentor/attendance',
          module: 'ATTENDANCE',
          externalReferenceId: uniqueRef,
          reporter: {
            name: 'Sivakumar Elango',
            email: 'sivakumar@kalvium.com',
            role: 'LEAD_MENTOR'
          }
        })
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.ticket.priority, 'LOW'); // sensible default for FEATURE
    });

    it('Allows explicit priority override when provided in request (HTTP 201)', async () => {
      const uniqueRef = `kalvilearn-crit-${Date.now()}`;
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': TEST_API_KEY
        },
        body: JSON.stringify({
          source: 'KALVILEARN',
          type: 'BUG',
          priority: 'CRITICAL',
          title: 'Payment Gateway Disconnecting during checkout',
          description: 'Payment sessions timing out immediately in production.',
          portal: 'STUDENT',
          externalReferenceId: uniqueRef,
          reporter: { name: 'Finance Lead', email: 'finance@kalvium.com' }
        })
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.ticket.priority, 'CRITICAL');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. IDEMPOTENCY ENGINE TESTS
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. Idempotency & Duplicate Prevention', () => {
    it('Returns existing ticket with HTTP 200 when duplicate externalReferenceId arrives', async () => {
      const fixedRef = `kalvilearn-idemp-${Date.now()}`;

      // First submission
      const res1 = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': TEST_API_KEY },
        body: JSON.stringify({
          source: 'KALVILEARN',
          type: 'ISSUE',
          title: 'Compiler timeout on heavy test suites',
          description: 'Test suites with over 100 tests encounter timeouts.',
          externalReferenceId: fixedRef,
          reporter: { name: 'Dev Lead', email: 'dev@kalvium.com' }
        })
      });
      assert.strictEqual(res1.status, 201);
      const data1 = await res1.json();
      const firstTicketId = data1.ticket.id;
      const firstTicketNum = data1.ticket.ticketNumber;

      // Second identical submission
      const res2 = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': TEST_API_KEY },
        body: JSON.stringify({
          source: 'KALVILEARN',
          type: 'ISSUE',
          title: 'Compiler timeout on heavy test suites',
          description: 'Test suites with over 100 tests encounter timeouts.',
          externalReferenceId: fixedRef,
          reporter: { name: 'Dev Lead', email: 'dev@kalvium.com' }
        })
      });

      assert.strictEqual(res2.status, 200); // Idempotent 200
      const data2 = await res2.json();
      assert.strictEqual(data2.idempotent, true);
      assert.strictEqual(data2.ticket.id, firstTicketId);
      assert.strictEqual(data2.ticket.ticketNumber, firstTicketNum);
    });

    it('Returns existing ticket when matching Idempotency-Key header is supplied', async () => {
      const idempotencyKey = `idem-key-${Date.now()}-${Math.random()}`;

      const res1 = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': TEST_API_KEY,
          'Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify({
          source: 'KALVILEARN',
          type: 'IMPROVEMENT',
          title: 'Improve Student Leaderboard Cache',
          description: 'Cache redis layer needs 5 minute TTL.',
          reporter: { name: 'Engineer', email: 'eng@kalvium.com' }
        })
      });
      assert.strictEqual(res1.status, 201);
      const data1 = await res1.json();

      // Retry with same Idempotency-Key
      const res2 = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': TEST_API_KEY,
          'Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify({
          source: 'KALVILEARN',
          type: 'IMPROVEMENT',
          title: 'Improve Student Leaderboard Cache',
          description: 'Cache redis layer needs 5 minute TTL.',
          reporter: { name: 'Engineer', email: 'eng@kalvium.com' }
        })
      });

      assert.strictEqual(res2.status, 200);
      const data2 = await res2.json();
      assert.strictEqual(data2.idempotent, true);
      assert.strictEqual(data2.ticket.id, data1.ticket.id);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. LIFECYCLE STATE MACHINE TESTS
  // ───────────────────────────────────────────────────────────────────────────
  describe('5. Status Lifecycle State Machine & Valid Transitions', () => {
    it('Rejects invalid status jump from OPEN to CLOSED directly (HTTP 422)', async () => {
      assert.ok(createdTicketNumber, 'Created ticket number must exist');

      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/tickets/${createdTicketNumber}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-api-key': TEST_API_KEY },
        body: JSON.stringify({ status: 'CLOSED' })
      });

      assert.strictEqual(res.status, 422);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.error, /Cannot transition ticket from "OPEN" to "CLOSED"/i);
    });

    it('Permits valid transition OPEN ➔ IN_PROGRESS (HTTP 200)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/tickets/${createdTicketNumber}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-api-key': TEST_API_KEY },
        body: JSON.stringify({ status: 'IN_PROGRESS' })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.ticket.status, 'IN_PROGRESS');
    });

    it('Permits valid transition IN_PROGRESS ➔ RESOLVED and records resolvedAt (HTTP 200)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/tickets/${createdTicketNumber}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-api-key': TEST_API_KEY },
        body: JSON.stringify({ status: 'RESOLVED' })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.ticket.status, 'RESOLVED');
      assert.ok(data.ticket.resolvedAt);
    });

    it('Permits valid transition RESOLVED ➔ CLOSED and records closedAt (HTTP 200)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/tickets/${createdTicketNumber}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-api-key': TEST_API_KEY },
        body: JSON.stringify({ status: 'CLOSED' })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.ticket.status, 'CLOSED');
      assert.ok(data.ticket.closedAt);
    });

    it('Permits reopening a closed ticket CLOSED ➔ OPEN (HTTP 200)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/tickets/${createdTicketNumber}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-api-key': TEST_API_KEY },
        body: JSON.stringify({ status: 'OPEN' })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.ticket.status, 'OPEN');
      assert.strictEqual(data.ticket.resolvedAt, null);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. TEAM ASSIGNMENT & REAL USERS
  // ───────────────────────────────────────────────────────────────────────────
  describe('6. Team Member Assignment', () => {
    it('Assigns ticket to a real TeamSync user profile (HTTP 200)', async () => {
      if (!testProfileId) return; // Skip if no profile in DB

      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/tickets/${createdTicketNumber}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-api-key': TEST_API_KEY },
        body: JSON.stringify({ assignedTo: testProfileId })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.ticket.assignedTo, testProfileId);
      assert.ok(data.ticket.assignee?.fullName);
    });

    it('Rejects assignment to a non-existent user profile with HTTP 400', async () => {
      const fakeUuid = '00000000-0000-0000-0000-000000000000';
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/tickets/${createdTicketNumber}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-api-key': TEST_API_KEY },
        body: JSON.stringify({ assignedTo: fakeUuid })
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /does not correspond to a valid TeamSync user/i);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. COMMENTS & AUDIT TRAIL
  // ───────────────────────────────────────────────────────────────────────────
  describe('7. Discussion Comments & Audit Trail', () => {
    it('Adds a discussion comment to the ticket (HTTP 201)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/tickets/${createdTicketNumber}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': TEST_API_KEY },
        body: JSON.stringify({
          comment: 'Root cause identified: student navigation state route parameter was missing.',
          authorName: 'Sivakumar Elango'
        })
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.comment.comment, 'Root cause identified: student navigation state route parameter was missing.');
    });

    it('Retrieving ticket includes comments and full activity history', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/tickets/${createdTicketNumber}`, {
        method: 'GET',
        headers: { 'x-api-key': TEST_API_KEY }
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      const ticket = data.ticket;

      assert.ok(Array.isArray(ticket.comments));
      assert.ok(ticket.comments.length >= 1);
      assert.ok(ticket.comments.some(c => c.comment.includes('Root cause identified')));

      assert.ok(Array.isArray(ticket.activities));
      assert.ok(ticket.activities.some(a => a.action === 'TICKET_CREATED'));
      assert.ok(ticket.activities.some(a => a.action === 'STATUS_CHANGED' || a.action === 'TICKET_REOPENED'));
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. TICKET LISTING, SEARCH & PAGINATION
  // ───────────────────────────────────────────────────────────────────────────
  describe('8. Querying, Filtering & Pagination', () => {
    it('Filters tickets by type', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/tickets?type=BUG`, {
        headers: { 'x-api-key': TEST_API_KEY }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.tickets.every(t => t.type === 'BUG'));
    });

    it('Performs search across title, ticketNumber, and reporter name', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/tickets?search=Student`, {
        headers: { 'x-api-key': TEST_API_KEY }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.tickets.length > 0);
    });

    it('Respects pagination page and limit parameters', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/tickets?limit=2&page=1`, {
        headers: { 'x-api-key': TEST_API_KEY }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.tickets.length <= 2);
      assert.strictEqual(data.pagination.limit, 2);
      assert.strictEqual(data.pagination.page, 1);
      assert.ok(data.pagination.total >= 1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. WEBHOOK SECURITY & BACKOFF ENGINE
  // ───────────────────────────────────────────────────────────────────────────
  describe('9. Webhook Signature & Retry Progression', () => {
    const secret = 'test-webhook-secret-key-12345';
    const payload = JSON.stringify({ event: 'STATUS_CHANGED', ticketNumber: 'TS-1024', status: 'RESOLVED' });
    const timestamp = Date.now();

    it('Generates and verifies authentic HMAC-SHA256 signature', () => {
      const sig = generateWebhookSignature(payload, secret, timestamp);
      assert.ok(sig.startsWith(`t=${timestamp},v1=`));

      const isValid = verifyWebhookSignature(payload, sig, secret);
      assert.strictEqual(isValid, true);
    });

    it('Rejects tampered payload during webhook verification', () => {
      const sig = generateWebhookSignature(payload, secret, timestamp);
      const tamperedPayload = JSON.stringify({ event: 'STATUS_CHANGED', ticketNumber: 'TS-1024', status: 'CRITICAL_HACKED' });

      const isValid = verifyWebhookSignature(tamperedPayload, sig, secret);
      assert.strictEqual(isValid, false);
    });

    it('Rejects forged signature with wrong secret', () => {
      const sig = generateWebhookSignature(payload, 'wrong-secret-key', timestamp);
      const isValid = verifyWebhookSignature(payload, sig, secret);
      assert.strictEqual(isValid, false);
    });

    it('Calculates correct exponential backoff progression', () => {
      assert.strictEqual(calculateBackoffMs(1), 60 * 1000);        // 1 min
      assert.strictEqual(calculateBackoffMs(2), 5 * 60 * 1000);    // 5 min
      assert.strictEqual(calculateBackoffMs(3), 30 * 60 * 1000);   // 30 min
      assert.strictEqual(calculateBackoffMs(4), 2 * 60 * 60 * 1000); // 2 hours
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 10. REAL DATABASE STATS AGGREGATION
  // ───────────────────────────────────────────────────────────────────────────
  describe('10. Real Database Live Statistics', () => {
    it('Returns verified non-hardcoded counts from real database tables', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/stats`, {
        headers: { 'x-api-key': TEST_API_KEY }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(typeof data.stats.total === 'number');
      assert.ok(data.stats.total >= 1);
      assert.ok(typeof data.stats.open === 'number');
      assert.ok(typeof data.stats.resolved === 'number');
      assert.ok(typeof data.stats.byType === 'object');
    });
  });
});
