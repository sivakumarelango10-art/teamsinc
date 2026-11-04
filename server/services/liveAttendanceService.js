import { query, pool } from '../db.js';

const PHOTO_BUCKET = 'weekly-attendance-photos';
const SESSION_DURATION_MINUTES = 5;

function httpError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

export function isFounderUser(user) {
  return Boolean(user && user.role === 'FOUNDER');
}

export function getAttendanceSessionState(session, now = Date.now()) {
  if (!session) return 'NOT_STARTED';
  if (session.status === 'CANCELLED') return 'CANCELLED';
  if (session.status === 'CLOSED') return 'CLOSED';
  const expiry = new Date(session.expires_at || session.expiresAt).getTime();
  if (!Number.isFinite(expiry) || now >= expiry) return 'CLOSED';
  return 'OPEN';
}

function buildEligibleProfilesQuery(meeting) {
  let sql = `
    SELECT p.id, p.auth_user_id, p.full_name, p.email, p.role, p.avatar_url
    FROM public.profiles p
    WHERE p.is_active = true
      AND p.role IN ('ADMIN', 'MEMBER')
  `;
  const params = [];
  if (meeting.visibility === 'DEPARTMENT' && meeting.department_id) {
    sql += ' AND p.id IN (SELECT user_id FROM public.department_members WHERE department_id = $1)';
    params.push(meeting.department_id);
  } else if (meeting.visibility === 'LEADERSHIP') {
    sql += " AND p.role = 'ADMIN'";
  } else if (meeting.visibility === 'INVITED') {
    sql += ' AND p.id IN (SELECT profile_id FROM public.meeting_participants WHERE meeting_id = $1)';
    params.push(meeting.id);
  }
  sql += ' ORDER BY p.full_name ASC';
  return { sql, params };
}

async function closeExpiredSessions() {
  const expired = await query(`
    SELECT id
    FROM public.meeting_attendance_sessions
    WHERE status = 'OPEN' AND expires_at <= now()
    ORDER BY expires_at ASC
    LIMIT 100;
  `);

  for (const item of expired.rows) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const closed = await client.query(`
        UPDATE public.meeting_attendance_sessions
        SET status = 'CLOSED', closed_at = COALESCE(closed_at, now())
        WHERE id = $1 AND status = 'OPEN' AND expires_at <= now()
        RETURNING id, meeting_id;
      `, [item.id]);

      if (closed.rows.length) {
        const pending = await client.query(`
          UPDATE public.meeting_attendance
          SET status = 'ABSENT',
              marked_at = now(),
              marked_by = NULL,
              correction_note = 'Automatically marked absent: the five-minute photo attendance window expired without a submission.',
              updated_at = now()
          WHERE attendance_session_id = $1 AND status = 'UNMARKED'
          RETURNING id, meeting_id, user_id;
        `, [item.id]);

        for (const row of pending.rows) {
          await client.query(`
            INSERT INTO public.meeting_attendance_history
              (attendance_id, meeting_id, user_id, previous_status, new_status, changed_by, correction_note)
            VALUES ($1, $2, $3, 'UNMARKED', 'ABSENT', NULL, 'Automatically marked absent: the five-minute photo attendance window expired without a submission.');
          `, [row.id, row.meeting_id, row.user_id]);
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export const liveAttendanceService = {
  async startSession(meetingId, founder, verifiedAt, verificationMethod = 'SUPABASE_TOTP_MFA') {
    if (!isFounderUser(founder)) throw httpError(403, 'Only the Founder can start attendance.');
    if (!verifiedAt || !Number.isFinite(new Date(verifiedAt).getTime())
      || !['SUPABASE_WEBAUTHN_MFA', 'SUPABASE_TOTP_MFA'].includes(verificationMethod)) {
      throw httpError(403, 'A recent Founder MFA verification is required.', 'FOUNDER_MFA_REQUIRED');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const meetingResult = await client.query(`
        SELECT id, title, start_time, end_time, status, is_weekly_meeting, visibility, department_id
        FROM public.meetings
        WHERE id = $1
        FOR UPDATE;
      `, [meetingId]);
      const meeting = meetingResult.rows[0];
      if (!meeting) throw httpError(404, 'Meeting not found.');
      if (!meeting.is_weekly_meeting) throw httpError(400, 'Live photo attendance is only available for weekly meetings.');
      if (meeting.status === 'CANCELLED') throw httpError(400, 'Attendance cannot be started for a cancelled meeting.');

      const nowResult = await client.query('SELECT now() AS server_now');
      const serverNow = nowResult.rows[0].server_now;
      const startsAt = new Date(meeting.start_time).getTime();
      const endsAt = new Date(meeting.end_time).getTime();
      const nowMs = new Date(serverNow).getTime();
      if (nowMs < startsAt - 15 * 60 * 1000 || nowMs >= endsAt) {
        throw httpError(409, 'Attendance can be started from 15 minutes before the meeting until the meeting ends.');
      }

      const existingSession = await client.query(
        'SELECT id, status FROM public.meeting_attendance_sessions WHERE meeting_id = $1 FOR UPDATE;',
        [meetingId]
      );
      if (existingSession.rows.length) {
        throw httpError(409, 'An attendance session has already been created for this weekly meeting occurrence.');
      }

      const preExisting = await client.query(`
        SELECT COUNT(*)::int AS count
        FROM public.meeting_attendance
        WHERE meeting_id = $1 AND status IN ('PRESENT', 'ABSENT');
      `, [meetingId]);
      if (preExisting.rows[0].count > 0) {
        throw httpError(409, 'Attendance has already been finalized for this occurrence. Review the existing register instead of starting a second session.');
      }

      const eligibleQuery = buildEligibleProfilesQuery(meeting);
      const eligibleResult = await client.query(eligibleQuery.sql, eligibleQuery.params);
      const eligible = eligibleResult.rows;
      if (!eligible.length) throw httpError(409, 'There are no eligible Admin or Member participants for this meeting.');

      const sessionResult = await client.query(`
        INSERT INTO public.meeting_attendance_sessions
          (meeting_id, started_by, status, verification_method, verified_at, started_at, expires_at)
        VALUES ($1, $2, 'OPEN', $4, $3, now(), now() + interval '5 minutes')
        RETURNING id, meeting_id, started_by, status, started_at, expires_at, verified_at, verification_method;
      `, [meetingId, founder.id, verifiedAt, verificationMethod]);
      const session = sessionResult.rows[0];

      for (const participant of eligible) {
        await client.query(`
          INSERT INTO public.meeting_attendance
            (meeting_id, user_id, status, attendance_session_id, created_at, updated_at)
          VALUES ($1, $2, 'UNMARKED', $3, now(), now())
          ON CONFLICT (meeting_id, user_id) DO UPDATE
          SET attendance_session_id = EXCLUDED.attendance_session_id,
              updated_at = now()
          WHERE public.meeting_attendance.status = 'UNMARKED'
            AND public.meeting_attendance.attendance_session_id IS NULL;
        `, [meetingId, participant.id, session.id]);

        await client.query(`
          INSERT INTO public.meeting_notifications
            (meeting_id, recipient_id, type, title, message, metadata)
          VALUES ($1, $2, 'ATTENDANCE_OPENED', $3, $4, $5::jsonb);
        `, [
          meetingId,
          participant.id,
          'Weekly meeting attendance is open',
          `Mark your attendance for "${meeting.title}" within the next five minutes. Capture a photo to submit.`,
          JSON.stringify({
            action: 'ATTENDANCE_OPENED',
            attendanceSessionId: session.id,
            expiresAt: session.expires_at
          })
        ]);
      }

      await client.query('COMMIT');
      return {
        success: true,
        session: {
          id: session.id,
          meetingId: session.meeting_id,
          status: session.status,
          startedAt: session.started_at,
          expiresAt: session.expires_at,
          durationSeconds: SESSION_DURATION_MINUTES * 60,
          verificationMethod: session.verification_method
        },
        totalEligible: eligible.length
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async getFounderRoster(meetingId, founder) {
    if (!isFounderUser(founder)) throw httpError(403, 'Only the Founder can view the live attendance roster.');
    await closeExpiredSessions();

    const meetingResult = await query(`
      SELECT id, title, start_time, end_time, status, is_weekly_meeting, visibility, department_id
      FROM public.meetings WHERE id = $1;
    `, [meetingId]);
    const meeting = meetingResult.rows[0];
    if (!meeting) throw httpError(404, 'Meeting not found.');
    if (!meeting.is_weekly_meeting) {
      return { isEligible: false, meeting: { id: meeting.id, title: meeting.title }, session: null, stats: null, roster: [] };
    }

    const eligibleQuery = buildEligibleProfilesQuery(meeting);
    const [profilesResult, sessionResult] = await Promise.all([
      query(eligibleQuery.sql, eligibleQuery.params),
      query(`
        SELECT id, status, started_at, expires_at, closed_at, verification_method, verified_at
        FROM public.meeting_attendance_sessions WHERE meeting_id = $1;
      `, [meetingId])
    ]);
    const session = sessionResult.rows[0] || null;
    const recordsResult = await query(`
      SELECT a.id, a.user_id, a.status, a.marked_at, a.submitted_at, a.photo_path,
             a.marked_by, a.correction_note, a.updated_at,
             mb.full_name AS marked_by_name
      FROM public.meeting_attendance a
      LEFT JOIN public.profiles mb ON mb.id = a.marked_by
      WHERE a.meeting_id = $1;
    `, [meetingId]);
    const recordMap = new Map(recordsResult.rows.map((record) => [record.user_id, record]));

    let presentCount = 0;
    let absentCount = 0;
    let unmarkedCount = 0;
    let missedWindowCount = 0;
    const roster = profilesResult.rows.map((profile) => {
      const record = recordMap.get(profile.id);
      const status = record?.status || 'UNMARKED';
      if (status === 'PRESENT') presentCount += 1;
      else if (status === 'ABSENT') absentCount += 1;
      else if (status === 'MISSED_WINDOW') missedWindowCount += 1;
      else unmarkedCount += 1;
      return {
        id: record?.id || null,
        userId: profile.id,
        name: profile.full_name || 'Team Member',
        email: profile.email,
        role: profile.role,
        avatarUrl: profile.avatar_url,
        status,
        photoPath: record?.photo_path || null,
        submittedAt: record?.submitted_at || null,
        markedAt: record?.marked_at || null,
        markedBy: record?.marked_by || null,
        markedByName: record?.marked_by_name || null,
        correctionNote: record?.correction_note || null,
        updatedAt: record?.updated_at || null
      };
    });

    const finalized = presentCount + absentCount;
    return {
      isEligible: true,
      meeting: {
        id: meeting.id,
        title: meeting.title,
        startTime: meeting.start_time,
        endTime: meeting.end_time,
        isWeeklyMeeting: true,
        status: meeting.status,
        visibility: meeting.visibility
      },
      session: session ? {
        id: session.id,
        status: getAttendanceSessionState(session),
        startedAt: session.started_at,
        expiresAt: session.expires_at,
        closedAt: session.closed_at,
        verificationMethod: session.verification_method
      } : null,
      stats: {
        totalEligible: roster.length,
        presentCount,
        absentCount,
        unmarkedCount,
        missedWindowCount,
        attendancePercentage: finalized ? Math.round((presentCount / finalized) * 1000) / 10 : 0
      },
      roster
    };
  },

  async getActiveSessionForUser(user) {
    if (!user?.id) throw httpError(401, 'Authentication is required.');
    await closeExpiredSessions();

    const result = await query(`
      SELECT s.id AS session_id, s.status AS session_status, s.started_at, s.expires_at,
             m.id AS meeting_id, m.title AS meeting_title, m.start_time, m.end_time,
             a.status AS attendance_status, a.submitted_at
      FROM public.meeting_attendance_sessions s
      JOIN public.meetings m ON m.id = s.meeting_id
      JOIN public.meeting_attendance a
        ON a.attendance_session_id = s.id AND a.user_id = $1
      WHERE s.status = 'OPEN'
        AND s.expires_at > now()
        AND m.is_weekly_meeting = true
      ORDER BY s.started_at DESC
      LIMIT 1;
    `, [user.id]);
    const row = result.rows[0];
    if (!row) return { active: false, session: null };

    return {
      active: true,
      session: {
        id: row.session_id,
        status: row.session_status,
        startedAt: row.started_at,
        expiresAt: row.expires_at,
        meetingId: row.meeting_id,
        meetingTitle: row.meeting_title,
        meetingStartTime: row.start_time,
        meetingEndTime: row.end_time,
        myStatus: row.attendance_status,
        submittedAt: row.submitted_at
      }
    };
  },

  async submitPhoto(sessionId, user, photoPath) {
    if (!user?.id || !user?.auth_user_id) throw httpError(401, 'A verified account session is required.');
    if (typeof photoPath !== 'string' || photoPath.length > 500 || photoPath.includes('..')) {
      throw httpError(400, 'Invalid attendance photo path.');
    }

    await closeExpiredSessions();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const sessionResult = await client.query(`
        SELECT s.id, s.meeting_id, s.status, s.started_at, s.expires_at, m.title, m.is_weekly_meeting, m.status AS meeting_status
        FROM public.meeting_attendance_sessions s
        JOIN public.meetings m ON m.id = s.meeting_id
        WHERE s.id = $1
        FOR UPDATE OF s;
      `, [sessionId]);
      const session = sessionResult.rows[0];
      if (!session) throw httpError(404, 'Attendance session not found.');
      if (!session.is_weekly_meeting) throw httpError(400, 'Photo attendance is only available for weekly meetings.');
      if (session.meeting_status === 'CANCELLED') throw httpError(409, 'This meeting has been cancelled.');
      const serverTime = await client.query('SELECT now() AS server_now');
      const sessionExpired = new Date(session.expires_at).getTime() <= new Date(serverTime.rows[0].server_now).getTime();
      if (session.status !== 'OPEN' || sessionExpired) {
        throw httpError(410, 'The five-minute attendance window has closed.', 'ATTENDANCE_WINDOW_CLOSED');
      }

      const expectedPrefix = `${user.auth_user_id}/${session.meeting_id}/${sessionId}/`;
      const allowedExtension = /\.(jpe?g|png|webp)$/i.test(photoPath);
      if (!photoPath.startsWith(expectedPrefix) || !allowedExtension) {
        throw httpError(403, 'The uploaded photograph does not belong to your account and attendance session.');
      }

      const objectResult = await client.query(`
        SELECT metadata
        FROM storage.objects
        WHERE bucket_id = $1 AND name = $2
        LIMIT 1;
      `, [PHOTO_BUCKET, photoPath]);
      const object = objectResult.rows[0];
      if (!object) throw httpError(400, 'The attendance photograph was not uploaded to the private attendance bucket.');
      const mime = String(object.metadata?.mimetype || '').toLowerCase();
      const size = Number(object.metadata?.size || 0);
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime) || !Number.isFinite(size) || size <= 0 || size > 2097152) {
        throw httpError(400, 'The attendance photograph must be a valid JPEG, PNG, or WebP image up to 2 MB.');
      }

      const attendanceResult = await client.query(`
        SELECT id, status FROM public.meeting_attendance
        WHERE attendance_session_id = $1 AND meeting_id = $2 AND user_id = $3
        FOR UPDATE;
      `, [sessionId, session.meeting_id, user.id]);
      const attendance = attendanceResult.rows[0];
      if (!attendance) throw httpError(403, 'You are not an eligible participant in this attendance session.');
      if (attendance.status !== 'UNMARKED') {
        throw httpError(409, attendance.status === 'PRESENT' ? 'Your attendance has already been submitted.' : 'This attendance record has already been finalized.');
      }

      const saved = await client.query(`
        UPDATE public.meeting_attendance
        SET status = 'PRESENT',
            marked_by = $2,
            marked_at = now(),
            submitted_at = now(),
            photo_path = $3,
            submission_method = 'CAMERA_CAPTURE',
            updated_at = now()
        WHERE id = $1
        RETURNING id, meeting_id, user_id, status, submitted_at, photo_path;
      `, [attendance.id, user.id, photoPath]);

      await client.query(`
        INSERT INTO public.meeting_attendance_history
          (attendance_id, meeting_id, user_id, previous_status, new_status, changed_by, correction_note)
        VALUES ($1, $2, $3, 'UNMARKED', 'PRESENT', $3, 'Photo submitted during the five-minute live attendance window.');
      `, [attendance.id, session.meeting_id, user.id]);

      await client.query('COMMIT');
      return { success: true, attendance: saved.rows[0] };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
};

export default liveAttendanceService;
