import { supabase } from './supabase';

const STORAGE_CALL_HISTORY_KEY = 'teamsync_call_history';
const STORAGE_ACTIVE_CALL_KEY = 'teamsync_active_call';

export const callApi = {
  // Create a new call session
  async createCallSession({ roomId = 'general', roomTitle = 'TeamSync HQ General Call', caller, callType = 'video' }) {
    const sessionData = {
      room_id: roomId,
      room_title: roomTitle,
      call_type: callType,
      caller_name: caller?.full_name || caller?.name || 'Team Member',
      caller_email: caller?.email || '',
      started_at: new Date().toISOString(),
      status: 'ongoing',
      participants: [{
        id: caller?.id || 'local-user',
        name: caller?.full_name || caller?.name || 'Team Member',
        email: caller?.email || '',
        role: caller?.role || 'MEMBER',
        joined_at: new Date().toISOString()
      }]
    };

    let createdRecord = null;

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('call_history')
          .insert([sessionData])
          .select()
          .single();

        if (!error && data) {
          createdRecord = data;
        } else {
          console.warn('Supabase call session insert error, using local state:', error);
        }
      } catch (err) {
        console.warn('Call session error, using fallback:', err);
      }
    }

    if (!createdRecord) {
      createdRecord = {
        id: 'call-' + Date.now(),
        ...sessionData,
        created_at: new Date().toISOString()
      };
    }

    // Save active call locally and broadcast
    try {
      localStorage.setItem(STORAGE_ACTIVE_CALL_KEY, JSON.stringify(createdRecord));
    } catch {}

    return createdRecord;
  },

  // Update or finish a call session
  async endCallSession(callId, { duration = 0, participants = [] } = {}) {
    const endedAt = new Date().toISOString();
    const updateData = {
      ended_at: endedAt,
      duration_seconds: Math.round(duration),
      participants: participants.map(p => ({
        id: p.id,
        name: p.name,
        email: p.email,
        role: p.role
      })),
      status: 'ended'
    };

    if (supabase && callId && !callId.startsWith('call-')) {
      try {
        await supabase
          .from('call_history')
          .update(updateData)
          .eq('id', callId);
      } catch (err) {
        console.warn('Supabase call update error:', err);
      }
    }

    // Update in local history
    try {
      const stored = localStorage.getItem(STORAGE_CALL_HISTORY_KEY);
      const list = stored ? JSON.parse(stored) : [];
      const updatedList = [
        {
          id: callId || 'call-' + Date.now(),
          ...updateData,
          created_at: endedAt
        },
        ...list.filter(c => c.id !== callId)
      ];
      localStorage.setItem(STORAGE_CALL_HISTORY_KEY, JSON.stringify(updatedList.slice(0, 100)));
      localStorage.removeItem(STORAGE_ACTIVE_CALL_KEY);
    } catch {}

    return true;
  },

  // Get active call for a room if any
  async getActiveCall(roomId = 'general') {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('call_history')
          .select('*')
          .eq('room_id', roomId)
          .eq('status', 'ongoing')
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!error && data) {
          // Verify call is not stale (older than 4 hours)
          const startTime = new Date(data.started_at).getTime();
          if (Date.now() - startTime < 4 * 60 * 60 * 1000) {
            return data;
          }
        }
      } catch (err) {
        console.warn('Fetch active call error:', err);
      }
    }

    // Local fallback
    try {
      const active = localStorage.getItem(STORAGE_ACTIVE_CALL_KEY);
      if (active) {
        const parsed = JSON.parse(active);
        if (parsed && parsed.room_id === roomId && parsed.status === 'ongoing') {
          return parsed;
        }
      }
    } catch {}

    return null;
  },

  // Fetch past call history
  async getCallHistory(roomId = 'general', limit = 50) {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('call_history')
          .select('*')
          .eq('room_id', roomId)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (!error && data && data.length > 0) {
          return data;
        }
      } catch (err) {
        console.warn('Fetch call history error, checking fallback:', err);
      }
    }

    try {
      const stored = localStorage.getItem(STORAGE_CALL_HISTORY_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }
};

export default callApi;
