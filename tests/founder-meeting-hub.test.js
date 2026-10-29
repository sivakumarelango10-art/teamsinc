import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { app } from '../server/app.js';
import { query } from '../server/db.js';
import {
  validateMeetingUrl,
  computeMeetingStatus,
  formatMeetingResponse,
  checkMeetingOverlap
} from '../server/services/meetingService.js';

describe('Founder Meeting Hub Test Suite', () => {
  let server;
  let baseUrl;
  let founderProfile;
  let memberProfile;
  const createdMeetingIds = [];
  const createdSeriesIds = [];

  before(async () => {
    // 1. Start HTTP test server on an ephemeral port
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    // 2. Resolve real Founder and Member profiles from the database
    const founderRes = await query(`
      SELECT id, email, full_name, role 
      FROM public.profiles 
      WHERE role = 'FOUNDER' OR email = 'sivakumarelango10@gmail.com'
      LIMIT 1;
    `);
    founderProfile = founderRes.rows[0];

    const memberRes = await query(`
      SELECT id, email, full_name, role 
      FROM public.profiles 
      WHERE role = 'MEMBER'
      LIMIT 1;
    `);
    memberProfile = memberRes.rows[0];
  });

  after(async () => {
    // Clean up all test meetings and series created during test suite
    try {
      await query(`
        DELETE FROM public.meetings 
        WHERE title LIKE 'Test Collision Target%' 
           OR title LIKE 'Founder Engineering Review%' 
           OR title LIKE 'Sprint 42%' 
           OR title LIKE 'Weekly SINC Standup%' 
           OR title LIKE 'Lifecycle Target%' 
           OR title LIKE 'Rescheduled Lifecycle Target%'
           OR title LIKE 'Unauthorized Member Meeting%'
           OR ($1::uuid[] IS NOT NULL AND id = ANY($1::uuid[]));
      `, [createdMeetingIds.length > 0 ? createdMeetingIds : null]);

      await query(`
        DELETE FROM public.meeting_series
        WHERE title LIKE 'Sprint 42%'
           OR title LIKE 'Weekly SINC Standup%'
           OR ($1::uuid[] IS NOT NULL AND id = ANY($1::uuid[]));
      `, [createdSeriesIds.length > 0 ? createdSeriesIds : null]);
    } catch (_) {}

    // Clean up test server
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // ================= 1. SECURITY & VALIDATION =================
  describe('1. Security & Meeting Link Validation', () => {
    it('should strictly accept secure HTTPS meeting URLs', () => {
      const gmeet = validateMeetingUrl('https://meet.google.com/abc-defg-hij');
      assert.strictEqual(gmeet.valid, true);

      const teams = validateMeetingUrl('https://teams.microsoft.com/l/meetup-join/19%3ameeting');
      assert.strictEqual(teams.valid, true);

      const zoom = validateMeetingUrl('https://zoom.us/j/1234567890?pwd=abc');
      assert.strictEqual(zoom.valid, true);
    });

    it('should reject unencrypted http:// URLs', () => {
      const res = validateMeetingUrl('http://meet.google.com/abc-defg-hij');
      assert.strictEqual(res.valid, false);
      assert.match(res.error, /secure "https:\/\/"/i);
    });

    it('should reject javascript:, data:, file: and malformed protocols', () => {
      assert.strictEqual(validateMeetingUrl('javascript:alert(1)').valid, false);
      assert.strictEqual(validateMeetingUrl('data:text/html,<h1>bad</h1>').valid, false);
      assert.strictEqual(validateMeetingUrl('file:///etc/passwd').valid, false);
      assert.strictEqual(validateMeetingUrl('not-a-url').valid, false);
      assert.strictEqual(validateMeetingUrl('').valid, false);
    });
  });

  // ================= 2. DYNAMIC STATUS ENGINE =================
  describe('2. Dynamic Status Engine & Timers', () => {
    const fixedNow = new Date('2026-10-29T12:00:00Z');

    it('should compute SCHEDULED for future meetings (>15 min)', () => {
      const meeting = {
        status: 'SCHEDULED',
        start_time: '2026-10-29T13:00:00Z',
        end_time: '2026-10-29T14:00:00Z'
      };
      assert.strictEqual(computeMeetingStatus(meeting, fixedNow), 'SCHEDULED');
    });

    it('should compute STARTING_SOON when within 15 minutes before start', () => {
      const meeting = {
        status: 'SCHEDULED',
        start_time: '2026-10-29T12:10:00Z', // 10 minutes in future
        end_time: '2026-10-29T13:10:00Z'
      };
      assert.strictEqual(computeMeetingStatus(meeting, fixedNow), 'STARTING_SOON');
    });

    it('should compute LIVE when currently between start and end time', () => {
      const meeting = {
        status: 'SCHEDULED',
        start_time: '2026-10-29T11:30:00Z', // started 30 min ago
        end_time: '2026-10-29T12:30:00Z'    // ends in 30 min
      };
      assert.strictEqual(computeMeetingStatus(meeting, fixedNow), 'LIVE');
    });

    it('should compute COMPLETED when wall-clock time has passed end time', () => {
      const meeting = {
        status: 'SCHEDULED',
        start_time: '2026-10-29T10:00:00Z',
        end_time: '2026-10-29T11:00:00Z'    // ended 1 hour ago
      };
      assert.strictEqual(computeMeetingStatus(meeting, fixedNow), 'COMPLETED');
    });

    it('should preserve CANCELLED status regardless of timestamps', () => {
      const meeting = {
        status: 'CANCELLED',
        start_time: '2026-10-29T13:00:00Z',
        end_time: '2026-10-29T14:00:00Z'
      };
      assert.strictEqual(computeMeetingStatus(meeting, fixedNow), 'CANCELLED');
    });
  });

  // ================= 3. OVERLAP DETECTION =================
  describe('3. Overlap Detection Engine', () => {
    it('should identify overlap when times intersect an existing active meeting', async () => {
      // Create a test meeting for tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const start = new Date(tomorrow);
      start.setHours(15, 0, 0, 0);
      const end = new Date(tomorrow);
      end.setHours(16, 0, 0, 0);

      const ins = await query(`
        INSERT INTO public.meetings (title, start_time, end_time, meeting_link, created_by, status)
        VALUES ('Test Collision Target', $1, $2, 'https://meet.google.com/test-target', $3, 'SCHEDULED')
        RETURNING id;
      `, [start.toISOString(), end.toISOString(), founderProfile.id]);
      const targetId = ins.rows[0].id;
      createdMeetingIds.push(targetId);

      // Check partial overlap (15:30 to 16:30)
      const overlapStart = new Date(tomorrow);
      overlapStart.setHours(15, 30, 0, 0);
      const overlapEnd = new Date(tomorrow);
      overlapEnd.setHours(16, 30, 0, 0);

      const check1 = await checkMeetingOverlap(overlapStart.toISOString(), overlapEnd.toISOString());
      assert.strictEqual(check1.hasOverlap, true);
      assert.ok(check1.conflicts.some(c => c.id === targetId));

      // Check excluding targetId (should not report overlap against itself during edit)
      const checkSelf = await checkMeetingOverlap(overlapStart.toISOString(), overlapEnd.toISOString(), targetId);
      assert.strictEqual(checkSelf.hasOverlap, false);

      // Check non-overlapping slot (17:00 to 18:00)
      const cleanStart = new Date(tomorrow);
      cleanStart.setHours(17, 0, 0, 0);
      const cleanEnd = new Date(tomorrow);
      cleanEnd.setHours(18, 0, 0, 0);

      const check2 = await checkMeetingOverlap(cleanStart.toISOString(), cleanEnd.toISOString());
      assert.strictEqual(check2.hasOverlap, false);
    });
  });

  // ================= 4. ROLE-BASED ACCESS CONTROL =================
  describe('4. Role-Based Access Control', () => {
    it('should reject meeting creation from a MEMBER with HTTP 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/v1/meetings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-teamsync-source': 'WORKSPACE',
          'x-teamsync-user-id': memberProfile.id,
          'x-teamsync-user-email': memberProfile.email
        },
        body: JSON.stringify({
          title: 'Unauthorized Member Meeting',
          startTime: new Date(Date.now() + 86400000).toISOString(),
          endTime: new Date(Date.now() + 90000000).toISOString(),
          meetingLink: 'https://meet.google.com/unauth'
        })
      });

      assert.strictEqual(res.status, 403);
      const body = await res.json();
      assert.strictEqual(body.success, false);
      assert.match(body.error, /Forbidden/i);
    });

    it('should allow Founder to schedule a Single Meeting with HTTP 201 Created', async () => {
      const startTime = new Date(Date.now() + 2 * 86400000).toISOString();
      const endTime = new Date(Date.now() + 2 * 86400000 + 3600000).toISOString();

      const res = await fetch(`${baseUrl}/api/v1/meetings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-teamsync-source': 'WORKSPACE',
          'x-teamsync-user-id': founderProfile.id,
          'x-teamsync-user-email': founderProfile.email
        },
        body: JSON.stringify({
          title: 'Founder Engineering Review',
          description: 'Quarterly review of platform architecture and velocity',
          agenda: '1. Architecture Review\n2. Realtime Engine\n3. Q&A',
          startTime,
          endTime,
          meetingLink: 'https://meet.google.com/eng-rev-2026',
          meetingType: 'FOUNDER_ALL_HANDS',
          timezone: 'Asia/Kolkata',
          visibility: 'ALL'
        })
      });

      assert.strictEqual(res.status, 201);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.ok(body.meeting?.id);
      assert.strictEqual(body.meeting.title, 'Founder Engineering Review');
      assert.strictEqual(body.meeting.meetingType, 'FOUNDER_ALL_HANDS');
      assert.strictEqual(body.meeting.computedStatus, 'SCHEDULED');

      createdMeetingIds.push(body.meeting.id);
    });
  });

  // ================= 5. MULTIPLE SESSIONS & RECURRING =================
  describe('5. Schedule Multiple Sessions & Recurring Series', () => {
    it('should schedule multiple independent sessions in one workflow', async () => {
      const tomorrow1 = new Date(Date.now() + 86400000);
      const tomorrow2 = new Date(Date.now() + 2 * 86400000);

      const res = await fetch(`${baseUrl}/api/v1/meetings/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-teamsync-source': 'WORKSPACE',
          'x-teamsync-user-id': founderProfile.id,
          'x-teamsync-user-email': founderProfile.email
        },
        body: JSON.stringify({
          seriesTitle: 'Sprint 42 Multi-Session Review',
          meetingType: 'SPRINT_PLANNING',
          sessions: [
            {
              title: 'Sprint 42 - Part 1: Kickoff',
              startTime: tomorrow1.toISOString(),
              endTime: new Date(tomorrow1.getTime() + 3600000).toISOString(),
              meetingLink: 'https://meet.google.com/sprint42-part1'
            },
            {
              title: 'Sprint 42 - Part 2: Task Breakdown',
              startTime: tomorrow2.toISOString(),
              endTime: new Date(tomorrow2.getTime() + 3600000).toISOString(),
              meetingLink: 'https://meet.google.com/sprint42-part2'
            }
          ]
        })
      });

      assert.strictEqual(res.status, 201);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.count, 2);
      assert.strictEqual(body.meetings.length, 2);

      if (body.series?.id) createdSeriesIds.push(body.series.id);
      body.meetings.forEach(m => createdMeetingIds.push(m.id));
    });

    it('should expand a recurring series into individual occurrence records', async () => {
      const start = new Date(Date.now() + 86400000);
      const end = new Date(start.getTime() + 3600000);

      const res = await fetch(`${baseUrl}/api/v1/meetings/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-teamsync-source': 'WORKSPACE',
          'x-teamsync-user-id': founderProfile.id,
          'x-teamsync-user-email': founderProfile.email
        },
        body: JSON.stringify({
          seriesTitle: 'Weekly SINC Standup',
          meetingType: 'GENERAL',
          isRecurring: true,
          recurrenceRule: {
            frequency: 'WEEKDAYS',
            count: 3,
            initialStartTime: start.toISOString(),
            initialEndTime: end.toISOString(),
            meetingLink: 'https://meet.google.com/weekly-standup',
            title: 'Weekly SINC Standup'
          }
        })
      });

      assert.strictEqual(res.status, 201);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.count, 3);
      assert.strictEqual(body.meetings.length, 3);

      if (body.series?.id) createdSeriesIds.push(body.series.id);
      body.meetings.forEach(m => createdMeetingIds.push(m.id));
    });
  });

  // ================= 6. STATS & LIVE AGGREGATIONS =================
  describe('6. Live Statistics & Discovery', () => {
    it('should return accurate live counts calculated from real database records', async () => {
      const res = await fetch(`${baseUrl}/api/v1/meetings/stats`, {
        headers: {
          'x-teamsync-source': 'WORKSPACE',
          'x-teamsync-user-id': founderProfile.id,
          'x-teamsync-user-email': founderProfile.email
        }
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.ok(typeof body.stats.totalMeetings === 'number');
      assert.ok(typeof body.stats.upcomingMeetings === 'number');
      assert.ok(typeof body.stats.scheduledToday === 'number');
      assert.ok(typeof body.stats.currentlyLive === 'number');
      assert.ok(typeof body.stats.completedMeetings === 'number');
      assert.ok(typeof body.stats.cancelledMeetings === 'number');
      assert.ok(body.stats.nextMeeting !== undefined);
    });
  });

  // ================= 7. MEETING LIFECYCLE (EDIT, CANCEL, DELETE) =================
  describe('7. Management Controls (Edit, Cancel, Delete)', () => {
    let targetMeetingId;

    before(async () => {
      // Create a dedicated lifecycle meeting
      const start = new Date(Date.now() + 5 * 86400000);
      const end = new Date(start.getTime() + 3600000);

      const ins = await query(`
        INSERT INTO public.meetings (title, start_time, end_time, meeting_link, created_by, status)
        VALUES ('Lifecycle Target', $1, $2, 'https://meet.google.com/lifecycle', $3, 'SCHEDULED')
        RETURNING id;
      `, [start.toISOString(), end.toISOString(), founderProfile.id]);
      targetMeetingId = ins.rows[0].id;
      createdMeetingIds.push(targetMeetingId);
    });

    it('should allow Founder to reschedule/update meeting details', async () => {
      const newStart = new Date(Date.now() + 6 * 86400000).toISOString();
      const newEnd = new Date(Date.now() + 6 * 86400000 + 3600000).toISOString();

      const res = await fetch(`${baseUrl}/api/v1/meetings/${targetMeetingId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-teamsync-source': 'WORKSPACE',
          'x-teamsync-user-id': founderProfile.id,
          'x-teamsync-user-email': founderProfile.email
        },
        body: JSON.stringify({
          title: 'Rescheduled Lifecycle Target',
          startTime: newStart,
          endTime: newEnd,
          meetingLink: 'https://meet.google.com/lifecycle-v2'
        })
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.meeting.title, 'Rescheduled Lifecycle Target');
      assert.strictEqual(body.meeting.meetingLink, 'https://meet.google.com/lifecycle-v2');
    });

    it('should allow Founder to cancel meeting with a reason', async () => {
      const res = await fetch(`${baseUrl}/api/v1/meetings/${targetMeetingId}/cancel`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-teamsync-source': 'WORKSPACE',
          'x-teamsync-user-id': founderProfile.id,
          'x-teamsync-user-email': founderProfile.email
        },
        body: JSON.stringify({
          reason: 'Emergency team sync rescheduled to next month.'
        })
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.meeting.status, 'CANCELLED');
      assert.strictEqual(body.meeting.cancellationReason, 'Emergency team sync rescheduled to next month.');
    });

    it('should allow Founder to permanently delete meeting', async () => {
      const res = await fetch(`${baseUrl}/api/v1/meetings/${targetMeetingId}`, {
        method: 'DELETE',
        headers: {
          'x-teamsync-source': 'WORKSPACE',
          'x-teamsync-user-id': founderProfile.id,
          'x-teamsync-user-email': founderProfile.email
        }
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.deletedMeetingId, targetMeetingId);

      // Verify not found in DB
      const check = await query(`SELECT id FROM public.meetings WHERE id = $1`, [targetMeetingId]);
      assert.strictEqual(check.rows.length, 0);
    });
  });
});
