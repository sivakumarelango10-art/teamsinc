import { supabase } from './supabase';

const API_BASE = '/api/v1/meetings';

/**
 * Derives live dynamic meeting status based on start_time, end_time, and stored status.
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
  // Starting soon: within 15 minutes of start time
  if (nowMs >= startMs - 15 * 60 * 1000 && nowMs < startMs) {
    return 'STARTING_SOON';
  }
  return 'SCHEDULED';
}

/**
 * Standardizes meeting object representation from DB or API payload.
 */
export function formatMeetingClient(meeting) {
  if (!meeting) return null;
  const computedStatus = computeMeetingStatus(meeting);

  return {
    id: meeting.id,
    seriesId: meeting.series_id || meeting.seriesId || null,
    title: meeting.title,
    description: meeting.description || '',
    agenda: meeting.agenda || '',
    additionalNotes: meeting.additional_notes || meeting.additionalNotes || '',
    startTime: meeting.start_time || meeting.startTime,
    endTime: meeting.end_time || meeting.endTime,
    timezone: meeting.timezone || 'UTC',
    meetingLink: meeting.meeting_link || meeting.meetingLink,
    meetingType: meeting.meeting_type || meeting.meetingType || 'GENERAL',
    location: meeting.location || null,
    status: meeting.status,
    computedStatus,
    cancellationReason: meeting.cancellation_reason || meeting.cancellationReason || null,
    cancelledAt: meeting.cancelled_at || meeting.cancelledAt || null,
    createdBy: meeting.created_by || meeting.createdBy,
    creator: meeting.creator || null,
    visibility: meeting.visibility || 'ALL',
    departmentId: meeting.department_id || meeting.departmentId || null,
    reminderMinutes: meeting.reminder_minutes || meeting.reminderMinutes || 15,
    participants: meeting.participants || [],
    series: meeting.series || null,
    createdAt: meeting.created_at || meeting.createdAt,
    updatedAt: meeting.updated_at || meeting.updatedAt
  };
}

/**
 * Helper to acquire authorization headers for server-side API calls.
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
      // Ignore session errors
    }
  }

  return headers;
}

export const meetingsApi = {
  /**
   * 1. Query meetings with filters, pagination, and search
   */
  async getMeetings(filters = {}) {
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();

    if (filters.search) params.append('search', filters.search);
    if (filters.status && filters.status !== 'ALL') params.append('status', filters.status);
    if (filters.meetingType && filters.meetingType !== 'ALL') params.append('meetingType', filters.meetingType);
    if (filters.departmentId && filters.departmentId !== 'ALL') params.append('departmentId', filters.departmentId);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.todayOnly) params.append('todayOnly', 'true');
    if (filters.page) params.append('page', filters.page);
    if (filters.limit) params.append('limit', filters.limit);

    try {
      const res = await fetch(`${API_BASE}?${params.toString()}`, { headers });
      if (res.ok) {
        const data = await res.json();
        return {
          meetings: (data.meetings || []).map(formatMeetingClient),
          pagination: data.pagination || { total: data.meetings?.length || 0, page: 1, limit: 50, totalPages: 1 }
        };
      }
    } catch {
      // Server endpoint not reachable, fallback to direct Supabase
    }

    if (supabase) {
      let query = supabase
        .from('meetings')
        .select(`
          *,
          creator:profiles!meetings_created_by_fkey(id, full_name, email, role, avatar_url),
          participants:meeting_participants(id, profile_id, status, response_note, profile:profiles(id, full_name, email, avatar_url))
        `, { count: 'exact' })
        .order('start_time', { ascending: true });

      if (filters.search) {
        query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%,agenda.ilike.%${filters.search}%`);
      }
      if (filters.meetingType && filters.meetingType !== 'ALL') {
        query = query.eq('meeting_type', filters.meetingType);
      }
      if (filters.departmentId && filters.departmentId !== 'ALL') {
        query = query.eq('department_id', filters.departmentId);
      }
      if (filters.startDate) {
        query = query.gte('start_time', filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte('end_time', filters.endDate);
      }
      if (filters.status && filters.status !== 'ALL') {
        if (filters.status === 'CANCELLED') {
          query = query.eq('status', 'CANCELLED');
        } else if (filters.status === 'COMPLETED') {
          query = query.eq('status', 'COMPLETED');
        } else if (filters.status === 'SCHEDULED') {
          query = query.eq('status', 'SCHEDULED');
        }
      }

      const { data, count, error } = await query;
      if (error) throw error;

      let formatted = (data || []).map(formatMeetingClient);

      // In-memory status filter if filter is dynamic (e.g. LIVE, STARTING_SOON)
      if (filters.status && filters.status !== 'ALL') {
        if (filters.status === 'LIVE' || filters.status === 'STARTING_SOON') {
          formatted = formatted.filter(m => m.computedStatus === filters.status);
        }
      }

      return {
        meetings: formatted,
        pagination: {
          total: count || formatted.length,
          page: filters.page || 1,
          limit: filters.limit || 50,
          totalPages: Math.ceil((count || formatted.length) / (filters.limit || 50))
        }
      };
    }

    return { meetings: [], pagination: { total: 0, page: 1, limit: 50, totalPages: 0 } };
  },

  /**
   * 2. Get Single Meeting
   */
  async getMeetingById(id) {
    const headers = await getAuthHeaders();
    try {
      const res = await fetch(`${API_BASE}/${id}`, { headers });
      if (res.ok) {
        const data = await res.json();
        return formatMeetingClient(data.meeting);
      }
    } catch {
      // Fallback
    }

    if (supabase) {
      const { data, error } = await supabase
        .from('meetings')
        .select(`
          *,
          creator:profiles!meetings_created_by_fkey(id, full_name, email, role, avatar_url),
          participants:meeting_participants(id, profile_id, status, response_note, profile:profiles(id, full_name, email, avatar_url))
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return formatMeetingClient(data);
    }
    return null;
  },

  /**
   * 3. Get Meeting Statistics (Total, Today, Upcoming, Starting Soon, Live, Completed, Cancelled, Next Meeting)
   */
  async getMeetingStats() {
    const headers = await getAuthHeaders();
    try {
      const res = await fetch(`${API_BASE}/stats`, { headers });
      if (res.ok) {
        const data = await res.json();
        return data.stats;
      }
    } catch {
      // Fallback
    }

    // Direct Supabase calculation
    if (supabase) {
      const now = new Date();
      const nowIso = now.toISOString();

      const { data: allMeetings, error } = await supabase
        .from('meetings')
        .select(`
          id, title, start_time, end_time, status, meeting_link, meeting_type, timezone,
          creator:profiles!meetings_created_by_fkey(id, full_name, email, avatar_url)
        `)
        .order('start_time', { ascending: true });

      if (error) throw error;

      let totalMeetings = 0;
      let scheduledToday = 0;
      let upcomingMeetings = 0;
      let startingSoon = 0;
      let currentlyLive = 0;
      let completedMeetings = 0;
      let cancelledMeetings = 0;
      let nextMeeting = null;

      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);

      (allMeetings || []).forEach(row => {
        totalMeetings++;
        const status = computeMeetingStatus(row, now);

        if (row.status === 'CANCELLED') {
          cancelledMeetings++;
          return;
        }

        const start = new Date(row.start_time);
        if (start >= todayStart && start <= todayEnd) {
          scheduledToday++;
        }

        if (status === 'LIVE') {
          currentlyLive++;
        } else if (status === 'STARTING_SOON') {
          startingSoon++;
          upcomingMeetings++;
        } else if (status === 'SCHEDULED') {
          upcomingMeetings++;
        } else if (status === 'COMPLETED') {
          completedMeetings++;
        }

        if ((status === 'SCHEDULED' || status === 'STARTING_SOON' || status === 'LIVE') && !nextMeeting) {
          nextMeeting = formatMeetingClient(row);
        }
      });

      return {
        totalMeetings,
        scheduledToday,
        upcomingMeetings,
        startingSoon,
        currentlyLive,
        completedMeetings,
        cancelledMeetings,
        nextMeeting
      };
    }

    return {
      totalMeetings: 0,
      scheduledToday: 0,
      upcomingMeetings: 0,
      startingSoon: 0,
      currentlyLive: 0,
      completedMeetings: 0,
      cancelledMeetings: 0,
      nextMeeting: null
    };
  },

  /**
   * 4. Check for meeting time collisions / overlaps
   */
  async checkOverlap(startTime, endTime, excludeId = null) {
    const headers = await getAuthHeaders();
    const params = new URLSearchParams({ startTime, endTime });
    if (excludeId) params.append('excludeId', excludeId);

    try {
      const res = await fetch(`${API_BASE}/overlap?${params.toString()}`, { headers });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Fallback
    }

    if (supabase) {
      let query = supabase
        .from('meetings')
        .select('id, title, start_time, end_time')
        .neq('status', 'CANCELLED')
        .lt('start_time', endTime)
        .gt('end_time', startTime);

      if (excludeId) {
        query = query.neq('id', excludeId);
      }

      const { data } = await query;
      return {
        hasOverlap: (data && data.length > 0),
        conflicts: data || []
      };
    }

    return { hasOverlap: false, conflicts: [] };
  },

  /**
   * 5. Schedule Single Meeting
   */
  async createMeeting(payload, idempotencyKey = null) {
    const headers = await getAuthHeaders();
    if (idempotencyKey) {
      headers['idempotency-key'] = idempotencyKey;
    }

    const res = await fetch(API_BASE, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to schedule meeting.');
    }

    return {
      meeting: formatMeetingClient(data.meeting),
      idempotent: data.idempotent
    };
  },

  /**
   * 6. Schedule Multiple Meetings or Recurring Series
   */
  async createMultipleSessions(payload, idempotencyKey = null) {
    const headers = await getAuthHeaders();
    if (idempotencyKey) {
      headers['idempotency-key'] = idempotencyKey;
    }

    const res = await fetch(`${API_BASE}/bulk`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to schedule multiple sessions.');
    }

    return {
      series: data.series,
      meetings: (data.meetings || []).map(formatMeetingClient),
      count: data.count
    };
  },

  /**
   * 7. Update Meeting Details / Reschedule
   */
  async updateMeeting(id, payload) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update meeting.');
    }

    return formatMeetingClient(data.meeting);
  },

  /**
   * 8. Cancel Meeting
   */
  async cancelMeeting(id, reason = '') {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/${id}/cancel`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ reason })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to cancel meeting.');
    }

    return formatMeetingClient(data.meeting);
  },

  /**
   * 9. Delete Meeting
   */
  async deleteMeeting(id) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/${id}`, {
      method: 'DELETE',
      headers
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to delete meeting.');
    }

    return data;
  },

  /**
   * 10. Respond to Meeting Invitation (RSVP)
   */
  async respondToInvitation(meetingId, status, responseNote = '') {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/${meetingId}/respond`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ status, responseNote })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to record RSVP response.');
    }

    return data.participant;
  },

  /**
   * 11. Fetch Meeting Notifications
   */
  async getNotifications() {
    const headers = await getAuthHeaders();
    try {
      const res = await fetch(`${API_BASE}/notifications`, { headers });
      if (res.ok) {
        const data = await res.json();
        return data.notifications || [];
      }
    } catch {
      // Fallback
    }

    if (supabase) {
      const { data } = await supabase
        .from('meeting_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);
      return data || [];
    }

    return [];
  },

  /**
   * 12. Mark Notification as Read
   */
  async markNotificationAsRead(id) {
    const headers = await getAuthHeaders();
    try {
      const res = await fetch(`${API_BASE}/notifications/${id}/read`, {
        method: 'PATCH',
        headers
      });
      if (res.ok) {
        const data = await res.json();
        return data.notification;
      }
    } catch {
      // Fallback
    }

    if (supabase) {
      const { data } = await supabase
        .from('meeting_notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      return data;
    }

    return null;
  }
};

export default meetingsApi;