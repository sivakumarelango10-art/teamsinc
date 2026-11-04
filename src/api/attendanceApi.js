import { supabase } from './supabase';

const API_BASE = '/api/v1/attendance';

/**
 * Acquire authorization headers for server-side API calls.
 */
async function getAuthHeaders() {
  const headers = {
    'Content-Type': 'application/json',
    'x-teamsync-source': 'WORKSPACE'
  };

  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) {
        headers['Authorization'] = `Bearer ${data.session.access_token}`;
      }
      if (data?.session?.user?.id) {
        headers['x-teamsync-user-id'] = data.session.user.id;
      }
      if (data?.session?.user?.email) {
        headers['x-teamsync-user-email'] = data.session.user.email;
      }
    } catch {
      // Ignore session acquisition errors
    }
  }

  return headers;
}

/**
 * Calculates attendance percentage strictly adhering to:
 * (Present / (Present + Absent)) * 100
 * Unmarked participants are excluded from the denominator.
 */
export function calculateAttendancePercentage(presentCount = 0, absentCount = 0) {
  const markedTotal = Number(presentCount || 0) + Number(absentCount || 0);
  if (markedTotal <= 0) return 0;
  return Math.round(((Number(presentCount || 0) / markedTotal) * 100) * 10) / 10;
}

/**
 * Badge and color styling tokens for attendance states.
 */
export function getAttendanceStatusConfig(status) {
  switch (status) {
    case 'PRESENT':
      return {
        label: 'Present',
        textColor: 'text-emerald-700 dark:text-emerald-300',
        bgColor: 'bg-emerald-50 dark:bg-emerald-950/40',
        borderColor: 'border-emerald-200 dark:border-emerald-800/60',
        dotColor: 'bg-emerald-500'
      };
    case 'ABSENT':
      return {
        label: 'Absent',
        textColor: 'text-rose-700 dark:text-rose-300',
        bgColor: 'bg-rose-50 dark:bg-rose-950/40',
        borderColor: 'border-rose-200 dark:border-rose-800/60',
        dotColor: 'bg-rose-500'
      };
    case 'MISSED_WINDOW':
      return {
        label: 'Missed Window',
        textColor: 'text-amber-700 dark:text-amber-300',
        bgColor: 'bg-amber-50 dark:bg-amber-950/40',
        borderColor: 'border-amber-200 dark:border-amber-800/60',
        dotColor: 'bg-amber-500'
      };
    case 'UNMARKED':
    default:
      return {
        label: 'Not Marked',
        textColor: 'text-zinc-600 dark:text-zinc-400',
        bgColor: 'bg-zinc-100 dark:bg-zinc-800/60',
        borderColor: 'border-zinc-200 dark:border-zinc-700',
        dotColor: 'bg-zinc-400'
      };
  }
}

export const attendanceApi = {
  /**
   * 1. Get Meeting Attendance Roster & Statistics (Founder / Admin)
   * Only applicable to weekly meetings.
   */
  async getMeetingAttendance(meetingId) {
    const headers = await getAuthHeaders();
    try {
      const res = await fetch(`${API_BASE}/meetings/${meetingId}`, { headers });
      if (res.ok) {
        return await res.json();
      }
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to fetch attendance (${res.status})`);
    } catch (err) {
      // Direct Supabase fallback if backend endpoint fails
      if (supabase) {
        // Check if meeting is weekly
        const { data: meeting } = await supabase
          .from('meetings')
          .select('id, title, is_weekly_meeting, start_time, visibility, department_id')
          .eq('id', meetingId)
          .single();

        if (!meeting || !meeting.is_weekly_meeting) {
          return {
            isEligible: false,
            message: 'Attendance tracking is only available for weekly meetings.',
            meeting: meeting ? { id: meeting.id, title: meeting.title, isWeeklyMeeting: false } : null,
            stats: null,
            roster: []
          };
        }

        // Fetch roster profiles
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email, role, avatar_url, department_id')
          .eq('is_active', true);

        // Fetch existing attendance records
        const { data: attendanceRecords } = await supabase
          .from('meeting_attendance')
          .select('*')
          .eq('meeting_id', meetingId);

        const attMap = new Map((attendanceRecords || []).map(r => [r.user_id, r]));

        let present = 0;
        let absent = 0;
        let unmarked = 0;

        const roster = (profiles || []).map(p => {
          const record = attMap.get(p.id);
          const status = record ? record.status : 'UNMARKED';
          if (status === 'PRESENT') present++;
          else if (status === 'ABSENT') absent++;
          else if (h.status === 'MISSED_WINDOW') missedWindow++; else unmarked++;

          return {
            userId: p.id,
            fullName: p.full_name || 'Team Member',
            email: p.email,
            role: p.role || 'MEMBER',
            avatarUrl: p.avatar_url,
            departmentId: p.department_id,
            status,
            notes: record?.notes || '',
            markedAt: record?.marked_at || null
          };
        });

        const markedTotal = present + absent;
        const rate = markedTotal > 0 ? Math.round(((present / markedTotal) * 100) * 10) / 10 : 0;

        return {
          success: true,
          isEligible: true,
          meeting: {
            id: meeting.id,
            title: meeting.title,
            isWeeklyMeeting: true,
            startTime: meeting.start_time
          },
          stats: {
            totalEligible: roster.length,
            presentCount: present,
            absentCount: absent,
            unmarkedCount: unmarked,
            attendanceRate: rate
          },
          roster
        };
      }
      throw err;
    }
  },

  /**
   * 2. Mark or Modify Attendance Records (Founder / Admin)
   * records: [{ userId, status, notes }]
   */
  async markAttendance(meetingId, records) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/meetings/${meetingId}/mark`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ records })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to record attendance.');
    }
    return data;
  },

  /**
   * 3. Get Authenticated Member's Weekly Attendance History (Personal)
   */
  async getMyAttendance() {
    const headers = await getAuthHeaders();
    try {
      const res = await fetch(`${API_BASE}/my-attendance`, { headers });
      if (res.ok) {
        return await res.json();
      }
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to fetch your attendance history (${res.status})`);
    } catch (err) {
      // Supabase fallback
      if (supabase) {
        const { data: sess } = await supabase.auth.getSession();
        const userId = sess?.session?.user?.id;
        if (!userId) throw new Error('Not authenticated');

        const { data: records } = await supabase
          .from('meeting_attendance')
          .select(`
            id, status, correction_note, marked_at, updated_at,
            meeting:meetings!meeting_attendance_meeting_id_fkey(id, title, start_time, end_time, is_weekly_meeting, status)
          `)
          .eq('user_id', userId)
          .order('marked_at', { ascending: false });

        const history = (records || [])
          .filter(r => r.meeting && r.meeting.is_weekly_meeting)
          .map(r => ({
            id: r.id,
            meetingId: r.meeting.id,
            meetingTitle: r.meeting.title,
            startTime: r.meeting.start_time,
            endTime: r.meeting.end_time,
            meetingStatus: r.meeting.status,
            status: r.status,
            notes: r.correction_note,
            markedAt: r.marked_at,
            updatedAt: r.updated_at
          }));

        let attended = 0;
        let missed = 0;
        let unmarked = 0;

        history.forEach(h => {
          if (h.status === 'PRESENT') attended++;
          else if (h.status === 'ABSENT' || h.status === 'MISSED_WINDOW') missed++;
          else unmarked++;
        });

        const markedTotal = attended + missed;
        const rate = markedTotal > 0 ? Math.round(((attended / markedTotal) * 100) * 10) / 10 : 0;

        return {
          success: true,
          stats: {
            totalWeeklyMeetings: history.length,
            attendedCount: attended,
            missedCount: missed,
            unmarkedCount: unmarked,
            attendanceRate: rate
          },
          history
        };
      }
      throw err;
    }
  },

  /**
   * Live photo-attendance endpoints use strict, verified Supabase bearer auth.
   * They intentionally do not fall back to direct client-side table writes.
   */
  async requestLive(path, options = {}) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...headers,
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Attendance request failed (${response.status}).`);
      error.status = response.status;
      error.code = data.code || null;
      throw error;
    }
    return data;
  },

  async getLiveMeetingAttendance(meetingId) {
    return this.requestLive(`/meetings/${encodeURIComponent(meetingId)}/live-session`);
  },

  async startLiveAttendance(meetingId) {
    return this.requestLive(`/meetings/${encodeURIComponent(meetingId)}/live-session`, {
      method: 'POST',
      body: JSON.stringify({})
    });
  },

  async getActiveLiveSession() {
    return this.requestLive('/active-session');
  },

  async submitLiveAttendance(sessionId, photoPath) {
    return this.requestLive(`/sessions/${encodeURIComponent(sessionId)}/submit`, {
      method: 'POST',
      body: JSON.stringify({ photoPath })
    });
  },

  /**
   * 4. Get Organization-Wide Attendance Reports & Analytics (Founder / Admin)
   */
  async getAttendanceReports(filters = {}) {
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (filters.fromDate) params.append('fromDate', filters.fromDate);
    if (filters.toDate) params.append('toDate', filters.toDate);
    if (filters.userId) params.append('userId', filters.userId);

    const res = await fetch(`${API_BASE}/reports?${params.toString()}`, { headers });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to fetch attendance reports.');
    }
    return data;
  },

  /**
   * 5. Export Weekly Attendance as CSV
   */
  async exportAttendanceCsv(filters = {}) {
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (filters.fromDate) params.append('fromDate', filters.fromDate);
    if (filters.toDate) params.append('toDate', filters.toDate);
    if (filters.userId) params.append('userId', filters.userId);

    const res = await fetch(`${API_BASE}/export?${params.toString()}`, {
      headers: {
        ...headers,
        Accept: 'text/csv'
      }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Export failed' }));
      throw new Error(err.error || `Export failed with status ${res.status}`);
    }

    const csvBlob = await res.blob();
    const url = window.URL.createObjectURL(csvBlob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `teamsync-weekly-attendance-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    return true;
  }
};

export default attendanceApi;

