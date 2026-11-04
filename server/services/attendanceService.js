import { query, pool } from '../db.js';

const FOUNDER_EMAIL = 'sivakumarelango10@gmail.com';

function isFounderOrAdminUser(user) {
  if (!user) return false;
  const role = user.role;
  return role === 'FOUNDER' || role === 'ADMIN' || user.email?.toLowerCase() === FOUNDER_EMAIL;
}

export const attendanceService = {
  /**
   * 1. Get Meeting Attendance Roster & Statistics
   * Exclusively accessible for weekly meetings by Founder / Admin.
   */
  async getMeetingAttendance(meetingId, requestingUser) {
    if (!isFounderOrAdminUser(requestingUser)) {
      const err = new Error('Forbidden: Only the Founder and authorized leadership can view full attendance rosters.');
      err.statusCode = 403;
      throw err;
    }

    // 1. Verify meeting exists and is weekly
    const mRes = await query(`
      SELECT m.*, p.full_name as creator_name, d.name as department_name
      FROM public.meetings m
      LEFT JOIN public.profiles p ON m.created_by = p.id
      LEFT JOIN public.departments d ON m.department_id = d.id
      WHERE m.id = $1;
    `, [meetingId]);

    if (!mRes.rows.length) {
      const err = new Error('Meeting not found.');
      err.statusCode = 404;
      throw err;
    }

    const meeting = mRes.rows[0];

    // Attendance tracking is EXCLUSIVELY enabled for weekly meetings
    if (!meeting.is_weekly_meeting) {
      return {
        isEligible: false,
        message: 'Attendance tracking is disabled for non-weekly meetings. Only meetings classified as weekly meetings support attendance.',
        meeting: {
          id: meeting.id,
          title: meeting.title,
          isWeeklyMeeting: false
        },
        stats: null,
        roster: []
      };
    }

    // 2. Fetch all eligible members based on meeting visibility/department
    let eligibleProfilesSql = `
      SELECT p.id, p.full_name, p.email, p.role, p.avatar_url
      FROM public.profiles p
      WHERE p.is_active = true
    `;
    const eligibleParams = [];

    if (meeting.visibility === 'DEPARTMENT' && meeting.department_id) {
      eligibleProfilesSql += ` AND p.id IN (SELECT user_id FROM public.department_members WHERE department_id = $1)`;
      eligibleParams.push(meeting.department_id);
    } else if (meeting.visibility === 'LEADERSHIP') {
      eligibleProfilesSql += ` AND p.role IN ('FOUNDER', 'ADMIN', 'FOUNDING_ADVISOR')`;
    } else if (meeting.visibility === 'INVITED') {
      eligibleProfilesSql += ` AND p.id IN (SELECT profile_id FROM public.meeting_participants WHERE meeting_id = $1)`;
      eligibleParams.push(meeting.id);
    }

    eligibleProfilesSql += ` ORDER BY p.full_name ASC;`;
    const profilesRes = await query(eligibleProfilesSql, eligibleParams);
    const eligibleProfiles = profilesRes.rows;

    // 3. Fetch existing attendance records for this meeting occurrence
    const attRes = await query(`
      SELECT a.*,
             mb.full_name as marked_by_name,
             mb.email as marked_by_email
      FROM public.meeting_attendance a
      LEFT JOIN public.profiles mb ON a.marked_by = mb.id
      WHERE a.meeting_id = $1;
    `, [meetingId]);

    const attendanceMap = new Map();
    attRes.rows.forEach(r => attendanceMap.set(r.user_id, r));

    // 4. Combine into complete roster (defaulting missing entries to 'UNMARKED')
    let presentCount = 0;
    let absentCount = 0;
    let unmarkedCount = 0;

    const roster = eligibleProfiles.map(p => {
      const record = attendanceMap.get(p.id);
      const status = record ? record.status : 'UNMARKED';

      if (status === 'PRESENT') presentCount++;
      else if (status === 'ABSENT') absentCount++;
      else unmarkedCount++;

      return {
        id: record?.id || null,
        userId: p.id,
        name: p.full_name || 'Member',
        email: p.email,
        role: p.role,
        avatarUrl: p.avatar_url,
        status,
        notes: record?.correction_note || '',
        markedAt: record?.marked_at || null,
        markedByName: record?.marked_by_name || null,
        correctionNote: record?.correction_note || null,
        updatedAt: record?.updated_at || null
      };
    });

    const totalEligible = roster.length;
    const finalizedCount = presentCount + absentCount;
    const attendancePercentage = finalizedCount > 0 
      ? Math.round((presentCount / finalizedCount) * 1000) / 10 
      : 0;

    return {
      isEligible: true,
      meeting: {
        id: meeting.id,
        title: meeting.title,
        startTime: meeting.start_time,
        endTime: meeting.end_time,
        isWeeklyMeeting: true,
        visibility: meeting.visibility,
        departmentName: meeting.department_name
      },
      stats: {
        totalEligible,
        presentCount,
        absentCount,
        missedWindowCount,
        unmarkedCount,
        attendancePercentage,
        attendanceRate: attendancePercentage,
        finalizedCount
      },
      roster
    };
  },

  /**
   * 2. Mark Attendance (Single or Bulk) with Atomic Transaction & Audit Trail
   */
  async markAttendance(meetingId, records, actorUser) {
    if (!isFounderOrAdminUser(actorUser)) {
      const err = new Error('Forbidden: Only the Founder can record or modify attendance.');
      err.statusCode = 403;
      throw err;
    }

    if (!Array.isArray(records) || records.length === 0) {
      const err = new Error('No attendance records provided.');
      err.statusCode = 400;
      throw err;
    }

    // Verify meeting is weekly
    const mRes = await query(`SELECT id, title, start_time, is_weekly_meeting FROM public.meetings WHERE id = $1;`, [meetingId]);
    if (!mRes.rows.length) {
      const err = new Error('Meeting not found.');
      err.statusCode = 404;
      throw err;
    }
    const meeting = mRes.rows[0];
    if (!meeting.is_weekly_meeting) {
      const err = new Error('Attendance can only be marked for eligible weekly meetings.');
      err.statusCode = 400;
      throw err;
    }

    const liveSessionRes = await query(
      `SELECT status, (expires_at <= now()) AS expired
       FROM public.meeting_attendance_sessions
       WHERE meeting_id = $1;`,
      [meetingId]
    );
    const liveSession = liveSessionRes.rows[0];
    if (liveSession) {
      const isLive = liveSession.status === 'OPEN' && !liveSession.expired;
      if (isLive) {
        const err = new Error('Manual attendance changes are disabled while the five-minute photo attendance window is open.');
        err.statusCode = 409;
        throw err;
      }
      if (actorUser?.role !== 'FOUNDER') {
        const err = new Error('Only the Founder can finalize or correct attendance after the live window closes.');
        err.statusCode = 403;
        throw err;
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updatedRecords = [];
      const notificationsToInsert = [];

      for (const rec of records) {
        const { userId, status } = rec;
        const correctionNote = (rec.correctionNote !== undefined ? rec.correctionNote : rec.notes) || '';
        if (!userId) continue;

        const normalizedStatus = (status || 'UNMARKED').toUpperCase();
        if (!['PRESENT', 'ABSENT', 'UNMARKED'].includes(normalizedStatus)) {
          throw new Error(`Invalid status "${status}". Allowed values: PRESENT, ABSENT, UNMARKED.`);
        }

        // 1. Fetch current status if exists
        const curRes = await client.query(`
          SELECT id, status FROM public.meeting_attendance 
          WHERE meeting_id = $1 AND user_id = $2 FOR UPDATE;
        `, [meetingId, userId]);

        const prevRecord = curRes.rows[0] || null;
        const prevStatus = prevRecord ? prevRecord.status : 'UNMARKED';

        // 2. Upsert into meeting_attendance
        const upsertRes = await client.query(`
          INSERT INTO public.meeting_attendance (
            meeting_id, user_id, status, marked_by, marked_at, correction_note, updated_at
          ) VALUES (
            $1, $2, $3, $4, now(), $5, now()
          )
          ON CONFLICT (meeting_id, user_id) DO UPDATE SET
            status = EXCLUDED.status,
            marked_by = EXCLUDED.marked_by,
            marked_at = now(),
            correction_note = EXCLUDED.correction_note,
            updated_at = now()
          RETURNING *;
        `, [meetingId, userId, normalizedStatus, actorUser.id, correctionNote ? correctionNote.trim() : null]);

        const savedRecord = upsertRes.rows[0];
        updatedRecords.push(savedRecord);

        // 3. Record Audit History if status changed or note provided
        if (prevStatus !== normalizedStatus || correctionNote) {
          await client.query(`
            INSERT INTO public.meeting_attendance_history (
              attendance_id, meeting_id, user_id, previous_status, new_status, changed_by, correction_note
            ) VALUES ($1, $2, $3, $4, $5, $6, $7);
          `, [
            savedRecord.id,
            meetingId,
            userId,
            prevStatus,
            normalizedStatus,
            actorUser.id,
            correctionNote ? correctionNote.trim() : null
          ]);

          // 4. Queue In-App Notification for member if finalized (PRESENT or ABSENT)
          if (normalizedStatus !== 'UNMARKED') {
            const meetingDate = new Date(meeting.start_time).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric'
            });
            notificationsToInsert.push({
              recipient_id: userId,
              type: 'INVITATION',
              title: `Weekly Meeting Attendance: ${normalizedStatus === 'PRESENT' ? 'Present' : 'Absent'}`,
              message: `Your attendance for "${meeting.title}" on ${meetingDate} was marked as ${normalizedStatus}.`,
              metadata: {
                meetingId,
                status: normalizedStatus,
                action: 'ATTENDANCE_RECORDED'
              }
            });
          }
        }
      }

      // Batch insert queued notifications
      for (const n of notificationsToInsert) {
        await client.query(`
          INSERT INTO public.meeting_notifications (
            meeting_id, recipient_id, type, title, message, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6);
        `, [meetingId, n.recipient_id, n.type, n.title, n.message, JSON.stringify(n.metadata)]);
      }

      await client.query('COMMIT');

      // Return refreshed roster and stats
      const refreshed = await this.getMeetingAttendance(meetingId, actorUser);
      return {
        success: true,
        count: updatedRecords.length,
        ...refreshed
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * 3. Member Personal Attendance History
   * Any authenticated member can view their own weekly meeting attendance.
   */
  async getUserAttendanceHistory(userId) {
    if (!userId) {
      const err = new Error('User ID is required.');
      err.statusCode = 400;
      throw err;
    }

    // Query all weekly meetings and join member's attendance
    const sql = `
      SELECT 
        m.id as meeting_id,
        m.title as meeting_title,
        m.start_time,
        m.end_time,
        m.status as meeting_status,
        m.is_weekly_meeting,
        a.id as attendance_id,
        COALESCE(a.status, 'UNMARKED') as status,
        a.marked_at,
        a.updated_at,
        a.correction_note,
        mb.full_name as marked_by_name
      FROM public.meetings m
      LEFT JOIN public.meeting_attendance a 
        ON m.id = a.meeting_id AND a.user_id = $1
      LEFT JOIN public.profiles mb 
        ON a.marked_by = mb.id
      WHERE m.is_weekly_meeting = true
        AND m.status != 'CANCELLED'
      ORDER BY m.start_time DESC;
    `;

    const res = await query(sql, [userId]);
    const rows = res.rows;

    let presentCount = 0;
    let absentCount = 0;
    let missedWindowCount = 0;
    let unmarkedCount = 0;

    const history = rows.map(r => {
      const status = r.status || 'UNMARKED';
      if (status === 'PRESENT') presentCount++;
      else if (status === 'ABSENT') absentCount++;
      else if (status === 'MISSED_WINDOW') missedWindowCount++;
      else unmarkedCount++;

      return {
        meetingId: r.meeting_id,
        meetingTitle: r.meeting_title,
        startTime: r.start_time,
        endTime: r.end_time,
        meetingStatus: r.meeting_status,
        status,
        markedAt: r.marked_at,
        updatedAt: r.updated_at,
        markedByName: r.marked_by_name,
        correctionNote: r.correction_note
      };
    });

    const totalHeld = presentCount + absentCount + missedWindowCount;
    const totalWeeklyMeetings = rows.length;
    const hasData = totalHeld > 0;
    const attendancePercentage = hasData 
      ? Math.round((presentCount / totalHeld) * 1000) / 10 
      : null;

    return {
      success: true,
      stats: {
        totalWeeklyMeetings,
        totalHeld,
        attendedCount: presentCount,
        missedCount: absentCount + missedWindowCount,
        missedWindowCount,
        unmarkedCount,
        attendanceRate: attendancePercentage || 0,
        hasData
      },
      summary: {
        totalWeeklyMeetings,
        totalHeld,
        presentCount,
        absentCount,
        missedWindowCount,
        unmarkedCount,
        attendancePercentage,
        hasData
      },
      history
    };
  },

  /**
   * 4. Founder Attendance Reports & Analytics across Weekly Meetings
   */
  async getAttendanceReports(filter = {}, requestingUser) {
    if (!isFounderOrAdminUser(requestingUser)) {
      const err = new Error('Forbidden: Only the Founder can access organizational attendance analytics.');
      err.statusCode = 403;
      throw err;
    }

    let sql = `
      SELECT 
        m.id as meeting_id,
        m.title as meeting_title,
        m.start_time,
        m.end_time,
        m.status as meeting_status,
        a.id as attendance_id,
        a.user_id,
        p.full_name as user_name,
        p.email as user_email,
        p.role as user_role,
        d.name as department_name,
        COALESCE(a.status, 'UNMARKED') as status,
        a.marked_at,
        a.updated_at
      FROM public.meetings m
      JOIN public.meeting_attendance a ON m.id = a.meeting_id
      JOIN public.profiles p ON a.user_id = p.id
      LEFT JOIN public.department_members dm ON p.id = dm.user_id
      LEFT JOIN public.departments d ON dm.department_id = d.id
      WHERE m.is_weekly_meeting = true
    `;
    const params = [];

    if (filter.startDate) {
      params.push(filter.startDate);
      sql += ` AND m.start_time >= $${params.length}`;
    }
    if (filter.endDate) {
      params.push(filter.endDate);
      sql += ` AND m.start_time <= $${params.length}`;
    }
    if (filter.meetingId) {
      params.push(filter.meetingId);
      sql += ` AND m.id = $${params.length}`;
    }
    if (filter.userId) {
      params.push(filter.userId);
      sql += ` AND a.user_id = $${params.length}`;
    }
    if (filter.status && filter.status !== 'ALL') {
      params.push(filter.status);
      sql += ` AND a.status = $${params.length}`;
    }

    sql += ` ORDER BY m.start_time DESC, p.full_name ASC;`;

    const res = await query(sql, params);
    const rows = res.rows;

    let totalPresent = 0;
    let totalAbsent = 0;
    let totalMissedWindow = 0;
    let totalUnmarked = 0;

    const memberStatsMap = new Map();
    const meetingStatsMap = new Map();

    rows.forEach(r => {
      const st = r.status;
      if (st === 'PRESENT') totalPresent++;
      else if (st === 'ABSENT') totalAbsent++;
      else if (st === 'MISSED_WINDOW') totalMissedWindow++;
      else totalUnmarked++;

      // Member tracking
      if (!memberStatsMap.has(r.user_id)) {
        memberStatsMap.set(r.user_id, {
          userId: r.user_id,
          name: r.user_name,
          email: r.user_email,
          role: r.user_role,
          department: r.department_name,
          presentCount: 0,
          absentCount: 0,
          missedWindowCount: 0,
          unmarkedCount: 0
        });
      }
      const mem = memberStatsMap.get(r.user_id);
      if (st === 'PRESENT') mem.presentCount++;
      else if (st === 'ABSENT') mem.absentCount++;
      else if (st === 'MISSED_WINDOW') mem.missedWindowCount++;
      else mem.unmarkedCount++;

      // Meeting tracking
      if (!meetingStatsMap.has(r.meeting_id)) {
        meetingStatsMap.set(r.meeting_id, {
          meetingId: r.meeting_id,
          title: r.meeting_title,
          startTime: r.start_time,
          presentCount: 0,
          absentCount: 0,
          missedWindowCount: 0,
          unmarkedCount: 0
        });
      }
      const mtg = meetingStatsMap.get(r.meeting_id);
      if (st === 'PRESENT') mtg.presentCount++;
      else if (st === 'ABSENT') mtg.absentCount++;
      else if (st === 'MISSED_WINDOW') mtg.missedWindowCount++;
      else mtg.unmarkedCount++;
    });

    const totalFinalized = totalPresent + totalAbsent + totalMissedWindow;
    const overallPercentage = totalFinalized > 0
      ? Math.round((totalPresent / totalFinalized) * 1000) / 10
      : 0;

    // Member analytics list
    const memberSummaries = Array.from(memberStatsMap.values()).map(m => {
      const fin = m.presentCount + m.absentCount + m.missedWindowCount;
      const pct = fin > 0 ? Math.round((m.presentCount / fin) * 1000) / 10 : 0;
      return {
        ...m,
        percentage: pct,
        isAtRisk: (m.absentCount + m.missedWindowCount) >= 2 // Flag repeated absences or missed windows
      };
    });

    // Meeting comparisons
    const meetingSummaries = Array.from(meetingStatsMap.values()).map(m => {
      const fin = m.presentCount + m.absentCount + m.missedWindowCount;
      const pct = fin > 0 ? Math.round((m.presentCount / fin) * 1000) / 10 : 0;
      return {
        ...m,
        percentage: pct
      };
    });

    return {
      success: true,
      summary: {
        totalWeeklyMeetings: meetingStatsMap.size,
        totalRecords: rows.length,
        totalPresent,
        totalAbsent,
        totalMissedWindow,
        overallAttendanceRate: overallPercentage,
        atRiskMemberCount: memberSummaries.filter(m => m.isAtRisk).length
      },
      overall: {
        totalRecords: rows.length,
        totalPresent,
        totalAbsent,
        totalMissedWindow,
        totalUnmarked,
        totalFinalized,
        overallPercentage,
        uniqueMeetingsCount: meetingStatsMap.size,
        uniqueMembersCount: memberStatsMap.size
      },
      memberSummaries,
      meetingSummaries,
      meetingStats: meetingSummaries,
      atRiskMembers: memberSummaries.filter(m => m.isAtRisk)
    };
  },

  /**
   * 5. Export Attendance as CSV String
   */
  async exportAttendanceCsv(filter = {}, requestingUser) {
    const reports = await this.getAttendanceReports(filter, requestingUser);

    let sql = `
      SELECT 
        m.title as meeting_title,
        m.start_time,
        m.end_time,
        p.full_name as member_name,
        p.email as member_email,
        d.name as department_name,
        a.status,
        mb.full_name as marked_by_name,
        a.marked_at,
        a.updated_at
      FROM public.meetings m
      JOIN public.meeting_attendance a ON m.id = a.meeting_id
      JOIN public.profiles p ON a.user_id = p.id
      LEFT JOIN public.department_members dm ON p.id = dm.user_id
      LEFT JOIN public.departments d ON dm.department_id = d.id
      LEFT JOIN public.profiles mb ON a.marked_by = mb.id
      WHERE m.is_weekly_meeting = true
      ORDER BY m.start_time DESC, p.full_name ASC;
    `;

    const res = await query(sql);
    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const headers = ['Meeting Title', 'Date', 'Start Time', 'End Time', 'Member Name', 'Member Email', 'Department', 'Status', 'Marked By', 'Updated At'];
    const lines = [headers.map(escapeCsv).join(',')];

    for (const r of res.rows) {
      const d = new Date(r.start_time);
      const dateStr = d.toISOString().split('T')[0];
      const startStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const endStr = new Date(r.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      lines.push([
        escapeCsv(r.meeting_title),
        escapeCsv(dateStr),
        escapeCsv(startStr),
        escapeCsv(endStr),
        escapeCsv(r.member_name),
        escapeCsv(r.member_email),
        escapeCsv(r.department_name || 'General'),
        escapeCsv(r.status),
        escapeCsv(r.marked_by_name || 'System'),
        escapeCsv(r.updated_at ? new Date(r.updated_at).toISOString() : '')
      ].join(','));
    }

    return lines.join('\n');
  }
};

export default attendanceService;
