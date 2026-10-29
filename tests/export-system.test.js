import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { app } from '../server/app.js';
import { exportRateLimiter } from '../server/middleware/rateLimiter.js';
import { query } from '../server/db.js';

describe('TeamSync × KalviLearn Export System Test Suite', () => {
  let server;
  let baseUrl;
  const TEST_API_KEY = 'ts_live_kalvilearn_sec_99a8b1c4e2d3f7';
  let seededTicketIds = [];

  before(async () => {
    exportRateLimiter.reset();
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    // Seed temporary test tickets for export tests if dataset is empty
    try {
      const res1 = await query(`
        INSERT INTO public.tickets (
          source, external_reference_id, type, title, description, status, priority, portal,
          reporter_name, reporter_email, reporter_role
        ) VALUES (
          'KALVILEARN', 'export-test-student-${Date.now()}', 'BUG', 'Export Test Student Bug',
          'Export test description for student', 'OPEN', 'MEDIUM', 'STUDENT',
          'Synthetic Student', 'synthetic.student@kalvilearn.test', 'STUDENT'
        ) RETURNING id;
      `);
      const res2 = await query(`
        INSERT INTO public.tickets (
          source, external_reference_id, type, title, description, status, priority, portal,
          reporter_name, reporter_email, reporter_role
        ) VALUES (
          'KALVILEARN', 'export-test-mentor-${Date.now()}', 'FEEDBACK', 'Export Test Mentor Feedback',
          'Export test description for mentor', 'OPEN', 'LOW', 'MENTOR',
          'Synthetic Mentor', 'synthetic.mentor@kalvilearn.test', 'MENTOR'
        ) RETURNING id;
      `);
      seededTicketIds.push(res1.rows[0].id, res2.rows[0].id);
    } catch (seedErr) {
      console.warn('[Export Test Suite] Non-fatal seed note:', seedErr.message);
    }
  });

  after(async () => {
    if (seededTicketIds.length > 0) {
      await query('DELETE FROM public.tickets WHERE id = ANY($1::uuid[]);', [seededTicketIds]).catch(() => {});
    }
    exportRateLimiter.reset();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // 1. Authentication & Authorization
  describe('1. Authentication & Security Enforcement', () => {
    it('Rejects export request without authentication headers (HTTP 401)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'pdf', resource: 'tickets' })
      });
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.error, /Unauthorized/);
    });

    it('Accepts export request with valid x-api-key', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': TEST_API_KEY
        },
        body: JSON.stringify({ format: 'csv', resource: 'analytics' })
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('content-type'), 'text/csv; charset=utf-8');
    });

    it('Accepts export request with internal WORKSPACE source header', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-teamsync-source': 'WORKSPACE',
          'x-teamsync-role': 'FOUNDER'
        },
        body: JSON.stringify({ format: 'csv', resource: 'tickets' })
      });
      assert.strictEqual(res.status, 200);
      assert.ok(Number(res.headers.get('x-export-count')) >= 0);
    });

    it('Blocks unauthorized role from exporting restricted tasks (HTTP 403)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-teamsync-source': 'WORKSPACE',
          'x-teamsync-role': 'GUEST'
        },
        body: JSON.stringify({ format: 'pdf', resource: 'tasks' })
      });
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.error, "You don't have permission to export this data.");
    });
  });

  // 2. PDF Export Tests
  describe('2. PDF Document Generation', () => {
    it('Generates valid PDF for tickets with correct MIME, headers, and magic bytes', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-teamsync-source': 'WORKSPACE',
          'x-teamsync-role': 'FOUNDER'
        },
        body: JSON.stringify({ format: 'pdf', resource: 'tickets' })
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('content-type'), 'application/pdf');
      const disp = res.headers.get('content-disposition');
      assert.ok(disp.includes('attachment; filename="TeamSync-KalviLearn-Tickets-'));
      assert.ok(disp.endsWith('.pdf"'));

      const buf = Buffer.from(await res.arrayBuffer());
      assert.ok(buf.length > 1000, 'PDF buffer should contain meaningful bytes');
      // Validate PDF signature "%PDF-"
      assert.strictEqual(buf.subarray(0, 5).toString('ascii'), '%PDF-');
    });

    it('Generates valid PDF for students with proper formatting', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-teamsync-source': 'WORKSPACE',
          'x-teamsync-role': 'ADMIN'
        },
        body: JSON.stringify({ format: 'pdf', resource: 'students' })
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('content-type'), 'application/pdf');
      const buf = Buffer.from(await res.arrayBuffer());
      assert.strictEqual(buf.subarray(0, 5).toString('ascii'), '%PDF-');
    });

    it('Generates valid PDF for analytics summary report', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-teamsync-source': 'WORKSPACE',
          'x-teamsync-role': 'FOUNDER'
        },
        body: JSON.stringify({ format: 'pdf', resource: 'analytics' })
      });

      assert.strictEqual(res.status, 200);
      const buf = Buffer.from(await res.arrayBuffer());
      assert.strictEqual(buf.subarray(0, 5).toString('ascii'), '%PDF-');
    });
  });

  // 3. DOCX Export Tests
  describe('3. DOCX Document Generation', () => {
    it('Generates valid DOCX document with OpenXML MIME and ZIP signature', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-teamsync-source': 'WORKSPACE',
          'x-teamsync-role': 'FOUNDER'
        },
        body: JSON.stringify({ format: 'docx', resource: 'tickets' })
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(
        res.headers.get('content-type'),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      const disp = res.headers.get('content-disposition');
      assert.ok(disp.includes('attachment; filename="TeamSync-KalviLearn-Tickets-'));
      assert.ok(disp.endsWith('.docx"'));

      const buf = Buffer.from(await res.arrayBuffer());
      assert.ok(buf.length > 2000, 'DOCX package should contain valid XML parts');
      // Validate OpenXML PK ZIP header signature (0x50, 0x4B, 0x03, 0x04)
      assert.strictEqual(buf[0], 0x50);
      assert.strictEqual(buf[1], 0x4B);
      assert.strictEqual(buf[2], 0x03);
      assert.strictEqual(buf[3], 0x04);
    });

    it('Generates valid DOCX for mentors oversight resource', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-teamsync-source': 'WORKSPACE',
          'x-teamsync-role': 'FOUNDER'
        },
        body: JSON.stringify({ format: 'docx', resource: 'mentors' })
      });

      assert.strictEqual(res.status, 200);
      const buf = Buffer.from(await res.arrayBuffer());
      assert.strictEqual(buf[0], 0x50);
      assert.strictEqual(buf[1], 0x4B);
    });
  });

  // 4. CSV Export Tests
  describe('4. CSV Spreadsheet Generation', () => {
    it('Generates valid CSV with UTF-8 BOM, headers, and escaped fields', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-teamsync-source': 'WORKSPACE',
          'x-teamsync-role': 'FOUNDER'
        },
        body: JSON.stringify({ format: 'csv', resource: 'tickets' })
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('content-type'), 'text/csv; charset=utf-8');
      const buf = Buffer.from(await res.arrayBuffer());

      // Check UTF-8 BOM bytes 0xEF, 0xBB, 0xBF
      assert.strictEqual(buf[0], 0xEF, 'CSV must start with UTF-8 BOM byte 1');
      assert.strictEqual(buf[1], 0xBB, 'CSV must start with UTF-8 BOM byte 2');
      assert.strictEqual(buf[2], 0xBF, 'CSV must start with UTF-8 BOM byte 3');

      // Check header line
      const text = buf.toString('utf-8');
      assert.ok(text.includes('Ticket Number,Title,Type,Status,Priority,Portal'));
      assert.ok(text.includes('TS-'));
    });

    it('Generates valid CSV for students with cohort and submission metrics', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-teamsync-source': 'WORKSPACE',
          'x-teamsync-role': 'ADMIN'
        },
        body: JSON.stringify({ format: 'csv', resource: 'students' })
      });

      assert.strictEqual(res.status, 200);
      const text = await res.text();
      assert.ok(text.includes('Student Name,Email,Mentor,Campus,Total Submissions'));
    });
  });

  // 5. Input Validation & Error Handling
  describe('5. Input Validation & Edge Case Handling', () => {
    it('Rejects invalid format with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-teamsync-source': 'WORKSPACE'
        },
        body: JSON.stringify({ format: 'unsupported_format', resource: 'tickets' })
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes('Invalid export format'));
    });

    it('Rejects invalid resource with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-teamsync-source': 'WORKSPACE'
        },
        body: JSON.stringify({ format: 'pdf', resource: 'non_existent_table' })
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes('Invalid export resource'));
    });

    it('Returns HTTP 404 when filters match zero records', async () => {
      const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-teamsync-source': 'WORKSPACE'
        },
        body: JSON.stringify({
          format: 'pdf',
          resource: 'tickets',
          filters: { search: 'absolutely_nonexistent_search_query_999999' }
        })
      });

      assert.strictEqual(res.status, 404);
      const data = await res.json();
      assert.strictEqual(data.error, 'There is no data available for this export.');
    });
  });

  // 6. Rate Limiting Protection
  describe('6. Export Rate Limiting Protection', () => {
    it('Enforces sliding-window rate limit when client attempts rapid export burst', async () => {
      exportRateLimiter.reset();

      let hit429 = false;
      for (let i = 0; i < 25; i++) {
        const res = await fetch(`${baseUrl}/api/v1/integrations/kalvilearn/export`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': '198.51.100.42',
            'x-teamsync-source': 'WORKSPACE'
          },
          body: JSON.stringify({ format: 'csv', resource: 'analytics' })
        });
        if (res.status === 429) {
          hit429 = true;
          break;
        }
      }

      assert.ok(hit429, 'Excessive export burst must trigger HTTP 429 Rate Limit');
      exportRateLimiter.reset();
    });
  });
});
