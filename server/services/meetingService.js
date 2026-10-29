import { query } from '../db.js';

/**
 * Validates and sanitizes meeting URLs.
 * Strictly requires secure HTTPS protocol and legitimate hostname.
 * Rejects javascript:, data:, file:, and malformed destinations.
 */
export function validateMeetingUrl(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'Meeting URL is required.' };
  }
  const trimmed = url.trim();
  if (!trimmed.startsWith('https://')) {
    return { valid: false, error: 'Meeting URL must begin with secure "https://". Unsafe or unencrypted protocols are forbidden.' };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'Only HTTPS meeting URLs are permitted.' };
    }
    if (!parsed.hostname || parsed.hostname.length < 3 || !parsed.hostname.includes('.')) {
      return { valid: false, error: 'Invalid meeting URL host.' };
    }
    return { valid: true, url: trimmed };
  } catch {
    return { valid: false, error: 'Malformed meeting link format.' };
  }
}

/**
 * Computes dynamic live meeting status based on start_time, end_time, and stored status.
 */
export function computeMeetingStatus(meeting, now = new Date()) {
  if (!meeting) return 'SCHEDULED';
  if (meeting.status === 'CANCELLED') return 'CANCELLED';
  if (meeting.status === 'COMPLETED') return 'COMPLETED';

  const startTime = new Date(meeting.start_time || meeting.startTime);
  const endTime = new Date(meeting.end_time || meeting.endTime);
  const nowMs = now.getTime();
  const startMs = startTime.getTime();
  const endMs = endTime.getTime();

  if (nowMs >= endMs) {
    return 'COMPLETED';
  }
  if (nowMs >= startMs && nowMs < endMs) {
    return 'LIVE';
  }
  // Starting soon threshold: within 15 minutes of start time
  if (nowMs >= startMs - 15 * 60 * 1000 && nowMs < startMs) {
    return 'STARTING_SOON';
  }
  return 'SCHEDULED';
}

/**
 * Formats a database meeting row for API consumption.
 */
export function formatMeetingResponse(row, now = new Date()) {
  if (!row) return null;
  const computedStatus = computeMeetingStatus(row, now);

  return {
    id: row.id,
    seriesId: row.series_id || null,
    title: row.title,
    description: row.description || '',
    agenda: row.agenda || '',
    additionalNotes: row.additional_notes || '',
    startTime: row.start_time,
    endTime: row.end_time,
    timezone: row.timezone || 'UTC',
    meetingLink: row.meeting_link,
    meetingType: row.meeting_type || 'GENERAL',
    location: row.location || null,
    status: row.status, // Stored status (SCHEDULED, COMPLETED, CANCELLED)
    computedStatus,     // Dynamic status (SCHEDULED, STARTING_SOON, LIVE, COMPLETED, CANCELLED)
    cancellationReason: row.cancellation_reason || null,
    cancelledAt: row.cancelled_at || null,
    cancelledBy: row.cancelled_by || null,
    visibility: row.visibility || 'ALL',
    departmentId: row.department_id || null,
    departmentName: row.department_name || null,
    createdBy: row.created_by,
    creatorName: row.creator_name || null,
    creatorRole: row.creator_role || null,
    creatorAvatar: row.creator_avatar || null,
    reminderPreferences: typeof row.reminder_preferences === 'string'
      ? JSON.parse(row.reminder_preferences)
      : (row.reminder_preferences || {}),
    attachments: typeof row.attachments === 'string'
      ? JSON.parse(row.attachments)
      : (row.attachments || []),
    participantCount: parseInt(row.participant_count || '0', 10),
    participants: Array.isArray(row.participants) ? row.participants : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Checks for overlapping meetings created by the Founder.
 */
export async function checkMeetingOverlap(startTime, endTime, excludeMeetingId = null) {
  const params = [new Date(startTime).toISOString(), new Date(endTime).toISOString()];
  let sql = `
    SELECT id, title, start_time, end_time, status
    FROM public.meetings
    WHERE status != 'CANCELLED'
      AND ((start_time < $2 AND end_time > $1))
  `;
  if (excludeMeetingId) {
    params.push(excludeMeetingId);
    sql += ` AND id != $3`;
  }
  sql += ` LIMIT 5;`;

  const res = await query(sql, params);
  const conflicts = res.rows.map(r => ({
    id: r.id,
    title: r.title,
    startTime: r.start_time,
    endTime: r.end_time,
    status: r.status
  }));

  return {
    hasOverlap: conflicts.length > 0,
    conflicts
  };
}

/**
 * 1. Create a Single Meeting
 */
export async function createMeeting(data, creatorUser) {
  const {
    title,
    description = '',
    agenda = '',
    additionalNotes = '',
    startTime,
    endTime,
    timezone = 'UTC',
    meetingLink,
    meetingType = 'GENERAL',
    location = null,
    visibility = 'ALL',
    departmentId = null,
    reminderPreferences = { reminder24h: true, reminder1h: true, reminder15m: true },
    attachments = [],
    participants = [],
    seriesId = null,
    idempotencyKey = null
  } = data;

  if (!title || typeof title !== 'string' || !title.trim()) {
    const err = new Error('Meeting title is required.');
    err.statusCode = 400;
    throw err;
  }

  if (!startTime || !endTime) {
    const err = new Error('Both start time and end time are required.');
    err.statusCode = 400;
    throw err;
  }

  const start = new Date(startTime);
  const end = new Date(endTime);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    const err = new Error('Invalid start or end date format.');
    err.statusCode = 400;
    throw err;
  }

  if (end <= start) {
    const err = new Error('Meeting end time must be later than start time.');
    err.statusCode = 400;
    throw err;
  }

  // Meeting Link Validation
  const urlCheck = validateMeetingUrl(meetingLink);
  if (!urlCheck.valid) {
    const err = new Error(urlCheck.error);
    err.statusCode = 400;
    throw err;
  }

  // Idempotency check if idempotency key provided
  if (idempotencyKey) {
    const existing = await query(`
      SELECT m.*, p.full_name as creator_name, p.role as creator_role, d.name as department_name
      FROM public.meetings m
      LEFT JOIN public.profiles p ON m.created_by = p.id
      LEFT JOIN public.departments d ON m.department_id = d.id
      WHERE m.idempotency_key = $1
      LIMIT 1;
    `, [idempotencyKey]);

    if (existing.rows.length > 0) {
      return {
        isExisting: true,
        meeting: formatMeetingResponse(existing.rows[0])
      };
    }
  }

  const insertSql = `
    INSERT INTO public.meetings (
      series_id,
      title,
      description,
      agenda,
      additional_notes,
      start_time,
      end_time,
      timezone,
      meeting_link,
      meeting_type,
      location,
      status,
      visibility,
      department_id,
      created_by,
      reminder_preferences,
      attachments,
      idempotency_key
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'SCHEDULED', $12, $13, $14, $15, $16, $17
    )
    RETURNING *;
  `;

  const insertParams = [
    seriesId || null,
    title.trim(),
    description.trim(),
    agenda.trim(),
    additionalNotes.trim(),
    start.toISOString(),
    end.toISOString(),
    timezone || 'UTC',
    urlCheck.url,
    meetingType,
    location ? location.trim() : null,
    visibility,
    departmentId || null,
    creatorUser.id,
    JSON.stringify(reminderPreferences),
    JSON.stringify(attachments),
    idempotencyKey || null
  ];

  const res = await query(insertSql, insertParams);
  const newRow = res.rows[0];

  // Insert invited participants if provided
  if (Array.isArray(participants) && participants.length > 0) {
    for (const pId of participants) {
      if (pId && typeof pId === 'string') {
        await query(`
          INSERT INTO public.meeting_participants (meeting_id, profile_id, status)
          VALUES ($1, $2, 'INVITED')
          ON CONFLICT (meeting_id, profile_id) DO NOTHING;
        `, [newRow.id, pId]).catch(() => {});
      }
    }
  }

  // Create In-App Notifications for authorized recipients
  await createMeetingScheduledNotifications(newRow, creatorUser).catch(() => {});

  const fullMeeting = await getMeetingById(newRow.id, creatorUser);
  return {
    isExisting: false,
    meeting: fullMeeting
  };
}

/**
 * Generates in-app notifications for authorized users upon meeting creation.
 */
async function createMeetingScheduledNotifications(meetingRow, creatorUser) {
  try {
    let recipientIds = [];

    if (meetingRow.visibility === 'ALL') {
      const allUsers = await query(`SELECT id FROM public.profiles WHERE is_active = true AND id != $1;`, [creatorUser.id]);
      recipientIds = allUsers.rows.map(r => r.id);
    } else if (meetingRow.visibility === 'LEADERSHIP') {
      const leadership = await query(`SELECT id FROM public.profiles WHERE role IN ('FOUNDER', 'ADMIN', 'FOUNDING_ADVISOR') AND id != $1;`, [creatorUser.id]);
      recipientIds = leadership.rows.map(r => r.id);
    } else if (meetingRow.visibility === 'DEPARTMENT' && meetingRow.department_id) {
      const deptMembers = await query(`SELECT user_id as id FROM public.department_members WHERE department_id = $1 AND user_id != $2;`, [meetingRow.department_id, creatorUser.id]);
      recipientIds = deptMembers.rows.map(r => r.id);
    } else if (meetingRow.visibility === 'INVITED') {
      const invited = await query(`SELECT profile_id as id FROM public.meeting_participants WHERE meeting_id = $1 AND profile_id != $2;`, [meetingRow.id, creatorUser.id]);
      recipientIds = invited.rows.map(r => r.id);
    }

    const title = `New Meeting: ${meetingRow.title}`;
    const dateFormatted = new Date(meetingRow.start_time).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
    });
    const message = `Founder scheduled a new meeting "${meetingRow.title}" for ${dateFormatted}.`;

    for (const rId of recipientIds) {
      await query(`
        INSERT INTO public.meeting_notifications (meeting_id, recipient_id, type, title, message, metadata)
        VALUES ($1, $2, 'NEW_MEETING', $3, $4, $5);
      `, [meetingRow.id, rId, title, message, JSON.stringify({ meetingId: meetingRow.id, startTime: meetingRow.start_time })]);
    }
  } catch (err) {
    console.warn('[MeetingNotification] Non-fatal notification error:', err.message);
  }
}

/**
 * 2. Schedule Multiple Meetings in Advance (Multi-Session & Recurring series)
 */
export async function createMultipleSessions(payload, creatorUser) {
  const isRecurring = Boolean(
    payload.isRecurring || payload.mode === 'RECURRING' || payload.recurrenceRule
  );

  const seriesTitle = (
    payload.seriesTitle ||
    payload.seriesData?.title ||
    payload.title ||
    'Meeting Series'
  ).trim();

  const seriesDesc = (payload.description || payload.seriesData?.description || '').trim();
  const seriesType = payload.meetingType || payload.seriesData?.meetingType || 'GENERAL';
  const seriesTimezone = payload.timezone || payload.seriesData?.timezone || 'UTC';
  const seriesVisibility = payload.visibility || payload.seriesData?.visibility || 'ALL';
  const seriesDept = payload.departmentId || payload.seriesData?.departmentId || null;
  const seriesLink = (
    payload.meetingLink ||
    payload.defaultLink ||
    payload.seriesData?.meetingLink ||
    payload.sessions?.[0]?.meetingLink ||
    payload.recurrenceRule?.meetingLink ||
    'https://meet.google.com'
  ).trim();

  const createdMeetings = [];
  const errors = [];
  let seriesId = null;

  // Option B2: Recurring Schedule Generator
  if (isRecurring && payload.recurrenceRule) {
    const rule = payload.recurrenceRule;
    const ruleType = rule.frequency || rule.type || 'WEEKLY';
    const limitOccurrences = Math.min(30, Math.max(1, parseInt(rule.count || rule.maxOccurrences, 10) || 5));

    // Create Series Record
    const seriesRes = await query(`
      INSERT INTO public.meeting_series (
        title, description, meeting_link, meeting_type, timezone, recurrence_rule, visibility, department_id, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id;
    `, [
      seriesTitle,
      seriesDesc,
      seriesLink,
      seriesType,
      seriesTimezone,
      JSON.stringify(rule),
      seriesVisibility,
      seriesDept,
      creatorUser.id
    ]);
    seriesId = seriesRes.rows[0].id;

    // Generate datetime intervals
    const generatedSessions = expandRecurrenceRule({
      type: ruleType,
      startDate: rule.initialStartTime ? new Date(rule.initialStartTime) : (rule.startDate ? new Date(rule.startDate) : new Date()),
      startTimeStr: rule.startTime,
      initialStartTime: rule.initialStartTime,
      initialEndTime: rule.initialEndTime,
      durationMinutes: rule.durationMinutes || 60,
      endDate: rule.endDate ? new Date(rule.endDate) : null,
      maxOccurrences: limitOccurrences,
      daysOfWeek: Array.isArray(rule.daysOfWeek) && rule.daysOfWeek.length > 0 ? rule.daysOfWeek : [1],
      interval: Math.max(1, parseInt(rule.interval, 10) || 1)
    });

    for (let i = 0; i < generatedSessions.length; i++) {
      const occ = generatedSessions[i];
      try {
        const occPayload = {
          title: `${seriesTitle} (${i + 1})`,
          description: seriesDesc,
          agenda: payload.agenda || payload.seriesData?.agenda || '',
          startTime: occ.startTime.toISOString(),
          endTime: occ.endTime.toISOString(),
          timezone: seriesTimezone,
          meetingLink: seriesLink,
          meetingType: seriesType,
          visibility: seriesVisibility,
          departmentId: seriesDept,
          participants: payload.participantIds || payload.seriesData?.participantIds || [],
          seriesId
        };
        const res = await createMeeting(occPayload, creatorUser);
        createdMeetings.push(res.meeting);
      } catch (err) {
        errors.push({ index: i, error: err.message });
      }
    }

    return {
      success: errors.length === 0,
      totalRequested: generatedSessions.length,
      createdCount: createdMeetings.length,
      count: createdMeetings.length,
      seriesId,
      series: { id: seriesId, title: seriesTitle },
      meetings: createdMeetings,
      errors: errors.length > 0 ? errors : null
    };
  }

  // Option B1: Independent Multiple Sessions Workflow
  const sessions = payload.sessions || [];
  if (Array.isArray(sessions) && sessions.length > 0) {
    const seriesRes = await query(`
      INSERT INTO public.meeting_series (
        title, description, meeting_link, meeting_type, timezone, visibility, department_id, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id;
    `, [
      seriesTitle,
      seriesDesc,
      seriesLink,
      seriesType,
      seriesTimezone,
      seriesVisibility,
      seriesDept,
      creatorUser.id
    ]);
    seriesId = seriesRes.rows[0].id;

    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      try {
        const sessionPayload = {
          title: s.title || `${seriesTitle} - Session ${i + 1}`,
          description: s.description || seriesDesc,
          agenda: s.agenda || payload.agenda || '',
          startTime: s.startTime,
          endTime: s.endTime,
          timezone: s.timezone || seriesTimezone,
          meetingLink: s.meetingLink || seriesLink,
          meetingType: s.meetingType || seriesType,
          location: s.location || null,
          visibility: s.visibility || seriesVisibility,
          departmentId: s.departmentId || seriesDept,
          participants: s.participants || payload.participantIds || [],
          seriesId
        };
        const res = await createMeeting(sessionPayload, creatorUser);
        createdMeetings.push(res.meeting);
      } catch (sessErr) {
        errors.push({ index: i, error: sessErr.message });
      }
    }

    return {
      success: errors.length === 0,
      totalRequested: sessions.length,
      createdCount: createdMeetings.length,
      count: createdMeetings.length,
      seriesId,
      series: { id: seriesId, title: seriesTitle },
      meetings: createdMeetings,
      errors: errors.length > 0 ? errors : null
    };
  }

  const err = new Error('Invalid multiple sessions specification.');
  err.statusCode = 400;
  throw err;
}

/**
 * Expands recurring rules into concrete datetime pairs.
 */
function expandRecurrenceRule({
  type,
  startDate,
  startTimeStr,
  initialStartTime,
  initialEndTime,
  durationMinutes = 60,
  endDate,
  maxOccurrences = 10,
  daysOfWeek = [1],
  interval = 1
}) {
  const occurrences = [];

  let startHour = 10;
  let startMinute = 0;
  let calculatedDuration = durationMinutes;

  if (initialStartTime) {
    const sDate = new Date(initialStartTime);
    startHour = sDate.getHours();
    startMinute = sDate.getMinutes();
    if (initialEndTime) {
      const eDate = new Date(initialEndTime);
      calculatedDuration = Math.max(15, Math.round((eDate.getTime() - sDate.getTime()) / 60000));
    }
  } else if (startTimeStr) {
    const parts = String(startTimeStr).split(':');
    startHour = parseInt(parts[0], 10) || 10;
    startMinute = parseInt(parts[1], 10) || 0;
  }

  let current = new Date(startDate);
  current.setHours(startHour, startMinute, 0, 0);

  let iterations = 0;
  const maxSearchDays = 365;

  while (occurrences.length < maxOccurrences && iterations < maxSearchDays) {
    iterations++;

    if (endDate && current > endDate) {
      break;
    }

    const dayOfWeek = current.getDay();
    let matches = false;

    if (type === 'DAILY') {
      matches = true;
    } else if (type === 'WEEKDAYS') {
      matches = dayOfWeek >= 1 && dayOfWeek <= 5;
    } else if (type === 'WEEKLY') {
      matches = daysOfWeek.includes(dayOfWeek);
    } else if (type === 'MONTHLY') {
      matches = current.getDate() === startDate.getDate();
    } else {
      matches = true;
    }

    if (matches && current >= startDate) {
      const startCopy = new Date(current);
      const endCopy = new Date(startCopy.getTime() + calculatedDuration * 60 * 1000);
      occurrences.push({ startTime: startCopy, endTime: endCopy });
    }

    if (type === 'MONTHLY') {
      current.setMonth(current.getMonth() + interval);
    } else {
      current.setDate(current.getDate() + 1);
    }
  }

  return occurrences;
}

/**
 * 3. Get Single Meeting by ID with Participants
 */
export async function getMeetingById(id, requestingUser = null) {
  const sql = `
    SELECT 
      m.*,
      p.full_name as creator_name,
      p.role as creator_role,
      p.avatar_url as creator_avatar,
      d.name as department_name,
      (SELECT COUNT(*) FROM public.meeting_participants WHERE meeting_id = m.id) as participant_count
    FROM public.meetings m
    LEFT JOIN public.profiles p ON m.created_by = p.id
    LEFT JOIN public.departments d ON m.department_id = d.id
    WHERE m.id = $1
    LIMIT 1;
  `;

  const res = await query(sql, [id]);
  if (res.rows.length === 0) return null;

  const meetingRow = res.rows[0];

  // Fetch participants
  const partRes = await query(`
    SELECT mp.*, p.full_name, p.email, p.role, p.avatar_url
    FROM public.meeting_participants mp
    JOIN public.profiles p ON mp.profile_id = p.id
    WHERE mp.meeting_id = $1
    ORDER BY p.full_name ASC;
  `, [id]);

  meetingRow.participants = partRes.rows.map(p => ({
    id: p.id,
    profileId: p.profile_id,
    fullName: p.full_name,
    email: p.email,
    role: p.role,
    avatarUrl: p.avatar_url,
    status: p.status,
    responseNote: p.response_note,
    createdAt: p.created_at
  }));

  return formatMeetingResponse(meetingRow);
}

/**
 * 4. List and Filter Meetings with Scope-based Authorization
 */
export async function listMeetings({
  tab = 'ALL', // 'OVERVIEW', 'UPCOMING', 'TODAY', 'LIVE', 'PAST', 'CANCELLED', 'ALL'
  status = null,
  visibility = null,
  departmentId = null,
  search = null,
  fromDate = null,
  toDate = null,
  seriesId = null,
  page = 1,
  limit = 20
} = {}, requestingUser = null) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];
  const params = [];
  let paramIdx = 1;

  const now = new Date();
  const nowIso = now.toISOString();

  // Tab-based date and status filters
  if (tab === 'UPCOMING') {
    conditions.push(`m.status = 'SCHEDULED'`);
    conditions.push(`m.start_time > $${paramIdx++}`);
    params.push(nowIso);
  } else if (tab === 'TODAY') {
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    conditions.push(`m.status != 'CANCELLED'`);
    conditions.push(`m.start_time >= $${paramIdx++} AND m.start_time <= $${paramIdx++}`);
    params.push(todayStart.toISOString(), todayEnd.toISOString());
  } else if (tab === 'LIVE') {
    conditions.push(`m.status != 'CANCELLED'`);
    conditions.push(`m.start_time <= $${paramIdx++} AND m.end_time > $${paramIdx++}`);
    params.push(nowIso, nowIso);
  } else if (tab === 'PAST') {
    conditions.push(`(m.status = 'COMPLETED' OR m.end_time <= $${paramIdx++})`);
    conditions.push(`m.status != 'CANCELLED'`);
    params.push(nowIso);
  } else if (tab === 'CANCELLED') {
    conditions.push(`m.status = 'CANCELLED'`);
  }

  // Explicit status filter override
  if (status && status !== 'ALL') {
    conditions.push(`m.status = $${paramIdx++}`);
    params.push(status.toUpperCase());
  }

  // Visibility and Department Filters
  if (visibility && visibility !== 'ALL') {
    conditions.push(`m.visibility = $${paramIdx++}`);
    params.push(visibility.toUpperCase());
  }

  if (departmentId) {
    conditions.push(`m.department_id = $${paramIdx++}`);
    params.push(departmentId);
  }

  if (seriesId) {
    conditions.push(`m.series_id = $${paramIdx++}`);
    params.push(seriesId);
  }

  if (fromDate) {
    conditions.push(`m.start_time >= $${paramIdx++}`);
    params.push(new Date(fromDate).toISOString());
  }

  if (toDate) {
    conditions.push(`m.start_time <= $${paramIdx++}`);
    params.push(new Date(toDate).toISOString());
  }

  // Search by title, description, agenda, location, creator name
  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    conditions.push(`(
      m.title ILIKE $${paramIdx} OR
      m.description ILIKE $${paramIdx} OR
      m.agenda ILIKE $${paramIdx} OR
      m.location ILIKE $${paramIdx} OR
      p.full_name ILIKE $${paramIdx} OR
      d.name ILIKE $${paramIdx}
    )`);
    params.push(q);
    paramIdx++;
  }

  // Security Scoping: Non-leadership users cannot see restricted LEADERSHIP or INVITED meetings they aren't invited to
  const userRole = requestingUser?.role || 'MEMBER';
  const isPrivileged = ['FOUNDER', 'ADMIN', 'FOUNDING_ADVISOR'].includes(userRole);

  if (!isPrivileged && requestingUser?.id) {
    conditions.push(`(
      m.visibility = 'ALL'
      OR (m.visibility = 'DEPARTMENT' AND m.department_id IN (
        SELECT department_id FROM public.department_members WHERE user_id = $${paramIdx}
      ))
      OR (m.visibility = 'INVITED' AND m.id IN (
        SELECT meeting_id FROM public.meeting_participants WHERE profile_id = $${paramIdx}
      ))
      OR m.created_by = $${paramIdx}
    )`);
    params.push(requestingUser.id);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countSql = `
    SELECT COUNT(*) as total 
    FROM public.meetings m
    LEFT JOIN public.profiles p ON m.created_by = p.id
    LEFT JOIN public.departments d ON m.department_id = d.id
    ${whereClause};
  `;
  const countRes = await query(countSql, params);
  const total = parseInt(countRes.rows[0]?.total || '0', 10);

  const dataSql = `
    SELECT 
      m.*,
      p.full_name as creator_name,
      p.role as creator_role,
      p.avatar_url as creator_avatar,
      d.name as department_name,
      (SELECT COUNT(*) FROM public.meeting_participants WHERE meeting_id = m.id) as participant_count
    FROM public.meetings m
    LEFT JOIN public.profiles p ON m.created_by = p.id
    LEFT JOIN public.departments d ON m.department_id = d.id
    ${whereClause}
    ORDER BY m.start_time ASC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++};
  `;

  const dataParams = [...params, limitNum, offset];
  const dataRes = await query(dataSql, dataParams);

  const meetings = dataRes.rows.map(r => formatMeetingResponse(r, now));

  return {
    meetings,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1
    }
  };
}

/**
 * 5. Live Database KPI Metrics and Next Scheduled Meeting
 */
export async function getMeetingStats(requestingUser = null) {
  const now = new Date();
  const nowIso = now.toISOString();

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const startingSoonThreshold = new Date(now.getTime() + 15 * 60 * 1000).toISOString();

  const sql = `
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'SCHEDULED' AND start_time > $1) AS upcoming,
      COUNT(*) FILTER (WHERE status != 'CANCELLED' AND start_time >= $2 AND start_time <= $3) AS scheduled_today,
      COUNT(*) FILTER (WHERE status != 'CANCELLED' AND start_time <= $1 AND end_time > $1) AS live,
      COUNT(*) FILTER (WHERE status = 'SCHEDULED' AND start_time > $1 AND start_time <= $4) AS starting_soon,
      COUNT(*) FILTER (WHERE status = 'COMPLETED' OR (status != 'CANCELLED' AND end_time <= $1)) AS completed,
      COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled
    FROM public.meetings;
  `;

  const res = await query(sql, [nowIso, todayStart.toISOString(), todayEnd.toISOString(), startingSoonThreshold]);
  const row = res.rows[0];

  // Fetch the Next Scheduled Meeting with countdown
  const nextRes = await query(`
    SELECT m.*, p.full_name as creator_name, p.role as creator_role, d.name as department_name
    FROM public.meetings m
    LEFT JOIN public.profiles p ON m.created_by = p.id
    LEFT JOIN public.departments d ON m.department_id = d.id
    WHERE m.status = 'SCHEDULED' AND m.start_time > $1
    ORDER BY m.start_time ASC
    LIMIT 1;
  `, [nowIso]);

  const nextMeeting = nextRes.rows.length > 0 ? formatMeetingResponse(nextRes.rows[0], now) : null;

  // Recent activity logs (recent meetings created or cancelled)
  const recentRes = await query(`
    SELECT m.id, m.title, m.status, m.start_time, m.created_at, m.updated_at, m.cancelled_at, p.full_name as creator_name
    FROM public.meetings m
    LEFT JOIN public.profiles p ON m.created_by = p.id
    ORDER BY m.updated_at DESC
    LIMIT 5;
  `);

  const totalCount = parseInt(row.total || '0', 10);
  const scheduledTodayCount = parseInt(row.scheduled_today || '0', 10);
  const upcomingCount = parseInt(row.upcoming || '0', 10);
  const startingSoonCount = parseInt(row.starting_soon || '0', 10);
  const liveCount = parseInt(row.live || '0', 10);
  const completedCount = parseInt(row.completed || '0', 10);
  const cancelledCount = parseInt(row.cancelled || '0', 10);

  return {
    total: totalCount,
    totalMeetings: totalCount,
    scheduledToday: scheduledTodayCount,
    upcoming: upcomingCount,
    upcomingMeetings: upcomingCount,
    startingSoon: startingSoonCount,
    live: liveCount,
    currentlyLive: liveCount,
    completed: completedCount,
    completedMeetings: completedCount,
    cancelled: cancelledCount,
    cancelledMeetings: cancelledCount,
    nextMeeting,
    recentActivity: recentRes.rows.map(r => ({
      id: r.id,
      title: r.title,
      status: r.status,
      startTime: r.start_time,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      cancelledAt: r.cancelled_at,
      creatorName: r.creator_name || 'Founder'
    }))
  };
}

/**
 * 6. Update Meeting Details / Reschedule
 */
export async function updateMeeting(id, updates, modifyingUser) {
  const current = await getMeetingById(id, modifyingUser);
  if (!current) {
    const err = new Error(`Meeting "${id}" not found.`);
    err.statusCode = 404;
    throw err;
  }

  const allowedFields = [
    'title', 'description', 'agenda', 'additional_notes', 'start_time', 'end_time',
    'timezone', 'meeting_link', 'meeting_type', 'location', 'visibility', 'department_id',
    'reminder_preferences'
  ];

  const updateClauses = [];
  const params = [];
  let paramIdx = 1;

  let newStartTime = current.startTime;
  let newEndTime = current.endTime;
  let newLink = current.meetingLink;
  let timeChanged = false;
  let linkChanged = false;

  if (updates.title && updates.title.trim()) {
    updateClauses.push(`title = $${paramIdx++}`);
    params.push(updates.title.trim());
  }

  if (updates.description !== undefined) {
    updateClauses.push(`description = $${paramIdx++}`);
    params.push(updates.description ? updates.description.trim() : '');
  }

  if (updates.agenda !== undefined) {
    updateClauses.push(`agenda = $${paramIdx++}`);
    params.push(updates.agenda ? updates.agenda.trim() : '');
  }

  if (updates.additionalNotes !== undefined) {
    updateClauses.push(`additional_notes = $${paramIdx++}`);
    params.push(updates.additionalNotes ? updates.additionalNotes.trim() : '');
  }

  if (updates.startTime) {
    const s = new Date(updates.startTime);
    if (isNaN(s.getTime())) throw new Error('Invalid start time.');
    updateClauses.push(`start_time = $${paramIdx++}`);
    params.push(s.toISOString());
    newStartTime = s.toISOString();
    timeChanged = true;
  }

  if (updates.endTime) {
    const e = new Date(updates.endTime);
    if (isNaN(e.getTime())) throw new Error('Invalid end time.');
    updateClauses.push(`end_time = $${paramIdx++}`);
    params.push(e.toISOString());
    newEndTime = e.toISOString();
    timeChanged = true;
  }

  if (new Date(newEndTime) <= new Date(newStartTime)) {
    const err = new Error('Meeting end time must be later than start time.');
    err.statusCode = 400;
    throw err;
  }

  if (updates.timezone) {
    updateClauses.push(`timezone = $${paramIdx++}`);
    params.push(updates.timezone);
  }

  if (updates.meetingLink) {
    const linkCheck = validateMeetingUrl(updates.meetingLink);
    if (!linkCheck.valid) {
      const err = new Error(linkCheck.error);
      err.statusCode = 400;
      throw err;
    }
    updateClauses.push(`meeting_link = $${paramIdx++}`);
    params.push(linkCheck.url);
    if (linkCheck.url !== current.meetingLink) {
      linkChanged = true;
      newLink = linkCheck.url;
    }
  }

  if (updates.meetingType) {
    updateClauses.push(`meeting_type = $${paramIdx++}`);
    params.push(updates.meetingType);
  }

  if (updates.location !== undefined) {
    updateClauses.push(`location = $${paramIdx++}`);
    params.push(updates.location ? updates.location.trim() : null);
  }

  if (updates.visibility) {
    updateClauses.push(`visibility = $${paramIdx++}`);
    params.push(updates.visibility);
  }

  if (updates.departmentId !== undefined) {
    updateClauses.push(`department_id = $${paramIdx++}`);
    params.push(updates.departmentId || null);
  }

  if (updateClauses.length === 0) {
    return current;
  }

  updateClauses.push(`updated_at = now()`);
  params.push(id);

  const updateSql = `
    UPDATE public.meetings
    SET ${updateClauses.join(', ')}
    WHERE id = $${paramIdx}
    RETURNING *;
  `;

  await query(updateSql, params);

  // Dispatch In-App Notifications for changes
  if (timeChanged) {
    await notifyMeetingChange(id, 'TIME_CHANGED', `Meeting Rescheduled: ${current.title}`, `Meeting "${current.title}" has been rescheduled to start at ${new Date(newStartTime).toLocaleString()}.`, modifyingUser).catch(() => {});
  } else if (linkChanged) {
    await notifyMeetingChange(id, 'LINK_CHANGED', `Meeting Link Updated: ${current.title}`, `The video conferencing link for "${current.title}" has been updated.`, modifyingUser).catch(() => {});
  }

  return await getMeetingById(id, modifyingUser);
}

/**
 * 7. Cancel a Meeting with Reason
 */
export async function cancelMeeting(id, reasonOrOptions = '', cancellingUser) {
  const current = await getMeetingById(id, cancellingUser);
  if (!current) {
    const err = new Error(`Meeting "${id}" not found.`);
    err.statusCode = 404;
    throw err;
  }

  if (current.status === 'CANCELLED') {
    return current;
  }

  const reason = typeof reasonOrOptions === 'string'
    ? reasonOrOptions.trim()
    : (typeof reasonOrOptions?.reason === 'string' ? reasonOrOptions.reason.trim() : '');

  const cancelSql = `
    UPDATE public.meetings
    SET status = 'CANCELLED',
        cancellation_reason = $1,
        cancelled_at = now(),
        cancelled_by = $2,
        updated_at = now()
    WHERE id = $3
    RETURNING *;
  `;

  await query(cancelSql, [reason || 'Cancelled by Organizer', cancellingUser.id, id]);

  // Dispatch cancellation notification
  await notifyMeetingChange(
    id,
    'CANCELLED',
    `Meeting Cancelled: ${current.title}`,
    `Meeting "${current.title}" scheduled for ${new Date(current.startTime).toLocaleDateString()} has been cancelled.${reason ? ` Reason: ${reason}` : ''}`,
    cancellingUser
  ).catch(() => {});

  return await getMeetingById(id, cancellingUser);
}

/**
 * 8. Delete a Meeting Permanently
 */
export async function deleteMeeting(id, deletingUser) {
  const current = await getMeetingById(id, deletingUser);
  if (!current) {
    const err = new Error(`Meeting "${id}" not found.`);
    err.statusCode = 404;
    throw err;
  }

  // FK ON DELETE CASCADE removes participants and notifications
  await query(`DELETE FROM public.meetings WHERE id = $1;`, [id]);

  return {
    deleted: true,
    id: current.id,
    title: current.title
  };
}

/**
 * Helper to dispatch notification changes to meeting participants
 */
async function notifyMeetingChange(meetingId, type, title, message, authorUser) {
  try {
    const parts = await query(`
      SELECT profile_id as id FROM public.meeting_participants WHERE meeting_id = $1 AND profile_id != $2
      UNION
      SELECT id FROM public.profiles WHERE role IN ('FOUNDER', 'ADMIN') AND id != $2;
    `, [meetingId, authorUser.id]);

    for (const row of parts.rows) {
      await query(`
        INSERT INTO public.meeting_notifications (meeting_id, recipient_id, type, title, message, metadata)
        VALUES ($1, $2, $3, $4, $5, $6);
      `, [meetingId, row.id, type, title, message, JSON.stringify({ meetingId })]);
    }
  } catch (err) {
    console.warn('[NotifyMeetingChange] Non-fatal notification error:', err.message);
  }
}

/**
 * 9. Respond to Invitation (RSVP)
 */
export async function respondToInvitation(meetingId, { status, responseNote = '' }, respondingUser) {
  const cleanStatus = status ? status.toUpperCase().trim() : 'ACCEPTED';
  if (!['ACCEPTED', 'DECLINED', 'TENTATIVE', 'ATTENDED'].includes(cleanStatus)) {
    const err = new Error(`Invalid status "${status}". Allowed: ACCEPTED, DECLINED, TENTATIVE, ATTENDED.`);
    err.statusCode = 400;
    throw err;
  }

  const upsertSql = `
    INSERT INTO public.meeting_participants (meeting_id, profile_id, status, response_note, updated_at)
    VALUES ($1, $2, $3, $4, now())
    ON CONFLICT (meeting_id, profile_id)
    DO UPDATE SET status = EXCLUDED.status, response_note = EXCLUDED.response_note, updated_at = now()
    RETURNING *;
  `;

  const res = await query(upsertSql, [meetingId, respondingUser.id, cleanStatus, responseNote ? responseNote.trim() : null]);
  return res.rows[0];
}

/**
 * 10. List Notifications for Current User
 */
export async function listUserMeetingNotifications(user) {
  const sql = `
    SELECT * FROM public.meeting_notifications
    WHERE recipient_id = $1
    ORDER BY created_at DESC
    LIMIT 50;
  `;
  const res = await query(sql, [user.id]);
  return res.rows;
}

/**
 * 11. Mark Notification as Read
 */
export async function markNotificationAsRead(id, user) {
  const sql = `
    UPDATE public.meeting_notifications
    SET is_read = true, read_at = now()
    WHERE id = $1 AND recipient_id = $2
    RETURNING *;
  `;
  const res = await query(sql, [id, user.id]);
  return res.rows[0];
}

export default {
  validateMeetingUrl,
  computeMeetingStatus,
  formatMeetingResponse,
  checkMeetingOverlap,
  createMeeting,
  createMultipleSessions,
  getMeetingById,
  listMeetings,
  getMeetingStats,
  updateMeeting,
  cancelMeeting,
  deleteMeeting,
  respondToInvitation,
  listUserMeetingNotifications,
  markNotificationAsRead
};
