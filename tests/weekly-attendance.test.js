import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { query, pool } from '../server/db.js';
import { attendanceService } from '../server/services/attendanceService.js';
import { createMeeting } from '../server/services/meetingService.js';

describe('Weekly Meeting Attendance Management System Test Suite', () => {
  let founderUser, memberUserA, memberUserB;
  let nonWeeklyMeetingId = null;
  let weeklyMeetingAId = null;
  let weeklyMeetingBId = null;
  const createdMeetingIds = [];

  before(async () => {
    // 1. Fetch active profiles for tests
    const res = await query(`
      SELECT id, full_name, email, role 
      FROM public.profiles 
      WHERE is_active = true 
      ORDER BY role ASC;
    `);

    assert.ok(res.rows.length >= 3, 'Requires at least 3 active profiles for attendance test suite');

    founderUser = res.rows.find(r => r.role === 'FOUNDER' || r.email === 'sivakumarelango10@gmail.com') || {
      ...res.rows[0],
      role: 'FOUNDER'
    };

    const regularMembers = res.rows.filter(r => r.role === 'MEMBER' && r.email !== 'sivakumarelango10@gmail.com');
    memberUserA = regularMembers[0];
    memberUserB = regularMembers[1];

    // 2. Create a standard non-weekly meeting
    const nonWeeklyRes = await createMeeting({
      title: 'Ad-hoc Technical Discussion (Non-Weekly)',
      startTime: new Date(Date.now() + 3600000).toISOString(),
      endTime: new Date(Date.now() + 7200000).toISOString(),
      meetingLink: 'https://meet.google.com/test-adhoc-link',
      meetingType: 'CODE_REVIEW',
      isWeeklyMeeting: false
    }, founderUser);

    nonWeeklyMeetingId = nonWeeklyRes.meeting.id;
    createdMeetingIds.push(nonWeeklyMeetingId);

    // 3. Create Weekly Meeting Occurrence A
    const weeklyARes = await createMeeting({
      title: 'SINC Weekly Team Sync - Session 1',
      startTime: new Date(Date.now() + 86400000).toISOString(),
      endTime: new Date(Date.now() + 90000000).toISOString(),
      meetingLink: 'https://meet.google.com/test-weekly-occ-1',
      meetingType: 'GENERAL',
      isWeeklyMeeting: true
    }, founderUser);

    weeklyMeetingAId = weeklyARes.meeting.id;
    createdMeetingIds.push(weeklyMeetingAId);

    // 4. Create Weekly Meeting Occurrence B
    const weeklyBRes = await createMeeting({
      title: 'SINC Weekly Team Sync - Session 2',
      startTime: new Date(Date.now() + 86400000 * 7).toISOString(),
      endTime: new Date(Date.now() + 86400000 * 7 + 3600000).toISOString(),
      meetingLink: 'https://meet.google.com/test-weekly-occ-2',
      meetingType: 'GENERAL',
      isWeeklyMeeting: true
    }, founderUser);

    weeklyMeetingBId = weeklyBRes.meeting.id;
    createdMeetingIds.push(weeklyMeetingBId);
  });

  after(async () => {
    // Clean up created records
    if (createdMeetingIds.length > 0) {
      await query(`DELETE FROM public.meeting_attendance_history WHERE meeting_id = ANY($1::uuid[]);`, [createdMeetingIds]);
      await query(`DELETE FROM public.meeting_attendance WHERE meeting_id = ANY($1::uuid[]);`, [createdMeetingIds]);
      await query(`DELETE FROM public.meeting_notifications WHERE meeting_id = ANY($1::uuid[]);`, [createdMeetingIds]);
      await query(`DELETE FROM public.meeting_participants WHERE meeting_id = ANY($1::uuid[]);`, [createdMeetingIds]);
      await query(`DELETE FROM public.meetings WHERE id = ANY($1::uuid[]);`, [createdMeetingIds]);
    }
    await pool.end();
  });

  it('1. Attendance scope restriction: Non-weekly meetings reject attendance tracking', async () => {
    const result = await attendanceService.getMeetingAttendance(nonWeeklyMeetingId, founderUser);
    assert.strictEqual(result.isEligible, false, 'Non-weekly meeting should be ineligible for attendance');
    assert.ok(result.message.includes('non-weekly meetings'), 'Should return informative scope message');
    assert.strictEqual(result.stats, null, 'Stats should be null for ineligible meetings');
    assert.deepStrictEqual(result.roster, [], 'Roster should be empty for ineligible meetings');
  });

  it('2. Weekly meeting eligibility: Weekly meetings provide full roster and statistics', async () => {
    const result = await attendanceService.getMeetingAttendance(weeklyMeetingAId, founderUser);
    assert.strictEqual(result.isEligible, true, 'Weekly meeting must be eligible for attendance tracking');
    assert.ok(result.roster.length >= 3, 'Roster must contain active organization members');
    assert.strictEqual(typeof result.stats.attendanceRate, 'number', 'Attendance rate must be a number');
    assert.strictEqual(result.stats.unmarkedCount, result.roster.length, 'Initially all members should be UNMARKED');
  });

  it('3. Occurrence independence: Occurrence A and Occurrence B maintain separate attendance records', async () => {
    // Mark memberUserA as PRESENT in Occurrence A
    await attendanceService.markAttendance(weeklyMeetingAId, [
      { userId: memberUserA.id, status: 'PRESENT', notes: 'Attended session 1 on time' }
    ], founderUser);

    // Mark memberUserA as ABSENT in Occurrence B
    await attendanceService.markAttendance(weeklyMeetingBId, [
      { userId: memberUserA.id, status: 'ABSENT', notes: 'Absent for session 2 due to travel' }
    ], founderUser);

    const dataA = await attendanceService.getMeetingAttendance(weeklyMeetingAId, founderUser);
    const dataB = await attendanceService.getMeetingAttendance(weeklyMeetingBId, founderUser);

    const recordA = dataA.roster.find(r => r.userId === memberUserA.id);
    const recordB = dataB.roster.find(r => r.userId === memberUserA.id);

    assert.strictEqual(recordA.status, 'PRESENT', 'Member should be PRESENT in Occurrence A');
    assert.strictEqual(recordB.status, 'ABSENT', 'Member should be ABSENT in Occurrence B');
    assert.ok(recordA.notes.includes('session 1'), 'Notes in Occurrence A must be preserved independently');
    assert.ok(recordB.notes.includes('session 2'), 'Notes in Occurrence B must be preserved independently');
  });

  it('4. Correct formula calculation: (Present / (Present + Absent)) * 100 excludes Unmarked', async () => {
    // In Occurrence A:
    // User A: PRESENT
    // User B: ABSENT
    // Other users: UNMARKED
    await attendanceService.markAttendance(weeklyMeetingAId, [
      { userId: memberUserA.id, status: 'PRESENT' },
      { userId: memberUserB.id, status: 'ABSENT' }
    ], founderUser);

    const dataA = await attendanceService.getMeetingAttendance(weeklyMeetingAId, founderUser);
    assert.strictEqual(dataA.stats.presentCount, 1);
    assert.strictEqual(dataA.stats.absentCount, 1);
    // Formula: 1 / (1 + 1) * 100 = 50.0%
    assert.strictEqual(dataA.stats.attendanceRate, 50.0, 'Attendance percentage must be exactly 50% (unmarked excluded)');
  });

  it('5. Bulk actions & correction audit logging', async () => {
    // Bulk update: Mark User A and User B as PRESENT with a correction note
    const updateResult = await attendanceService.markAttendance(weeklyMeetingAId, [
      { userId: memberUserA.id, status: 'PRESENT', notes: 'Confirmed present' },
      { userId: memberUserB.id, status: 'PRESENT', notes: 'Excused and attended' }
    ], founderUser);

    assert.strictEqual(updateResult.success, true);
    assert.strictEqual(updateResult.count, 2);

    // Verify audit history was inserted
    const historyRes = await query(`
      SELECT * FROM public.meeting_attendance_history
      WHERE meeting_id = $1 AND user_id = $2
      ORDER BY created_at DESC
      LIMIT 1;
    `, [weeklyMeetingAId, memberUserB.id]);

    assert.ok(historyRes.rows.length > 0, 'Audit history log must be created on attendance status change');
    assert.strictEqual(historyRes.rows[0].new_status, 'PRESENT', 'Audit log must record new status');
    assert.strictEqual(historyRes.rows[0].previous_status, 'ABSENT', 'Audit log must record previous status');
    assert.strictEqual(historyRes.rows[0].changed_by, founderUser.id, 'Audit log must record who modified the status');
  });

  it('6. Member personal attendance history: Read-only personal records and percentage', async () => {
    const personalHistory = await attendanceService.getUserAttendanceHistory(memberUserA.id);

    assert.strictEqual(personalHistory.success, true);
    assert.ok(Array.isArray(personalHistory.history), 'History must be an array');
    assert.ok(personalHistory.history.length >= 2, 'History must contain weekly meetings A and B');

    // Verify only weekly meetings are present
    personalHistory.history.forEach(item => {
      assert.notStrictEqual(item.meetingId, nonWeeklyMeetingId, 'Non-weekly meetings must never appear in personal weekly attendance');
    });

    // Verify statistics structure
    assert.strictEqual(typeof personalHistory.stats.attendanceRate, 'number');
    assert.ok(personalHistory.stats.attendedCount >= 1, 'Member A attended Occurrence A');
  });

  it('7. Role-based security: Non-founder member cannot access full roster or mark attendance', async () => {
    // Member attempting to view full roster of weekly meeting
    await assert.rejects(
      async () => {
        await attendanceService.getMeetingAttendance(weeklyMeetingAId, memberUserA);
      },
      (err) => {
        assert.strictEqual(err.statusCode, 403, 'Should reject non-founder with HTTP 403');
        assert.ok(err.message.includes('Forbidden'), 'Should specify forbidden permission error');
        return true;
      }
    );

    // Member attempting to mark attendance
    await assert.rejects(
      async () => {
        await attendanceService.markAttendance(weeklyMeetingAId, [
          { userId: memberUserA.id, status: 'PRESENT' }
        ], memberUserA);
      },
      (err) => {
        assert.strictEqual(err.statusCode, 403, 'Should reject non-founder marking attendance with HTTP 403');
        return true;
      }
    );
  });

  it('8. Organization reports & CSV Export', async () => {
    const reports = await attendanceService.getAttendanceReports({}, founderUser);

    assert.strictEqual(reports.success, true);
    assert.ok(reports.summary.totalWeeklyMeetings >= 2, 'Reports must count all weekly meetings');
    assert.strictEqual(typeof reports.summary.overallAttendanceRate, 'number');
    assert.ok(Array.isArray(reports.meetingStats), 'Meeting statistics breakdown must be an array');
    assert.ok(Array.isArray(reports.atRiskMembers), 'At-risk members list must be an array');

    // CSV Export
    const csvData = await attendanceService.exportAttendanceCsv({}, founderUser);
    assert.ok(typeof csvData === 'string', 'CSV data must be a string');
    assert.ok(csvData.startsWith('"Meeting Title","Date"'), 'CSV must include standard header columns');
    assert.ok(csvData.includes('SINC Weekly Team Sync'), 'CSV must include recorded weekly meeting names');
  });
});
