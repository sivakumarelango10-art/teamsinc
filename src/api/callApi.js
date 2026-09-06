import { supabase } from './supabase.js';

const STORAGE_CALL_HISTORY_KEY = 'teamsync_call_history';
const STORAGE_ACTIVE_CALL_KEY = 'teamsync_active_call';

export const isValidUuid = (str) => {
  return typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
};

export const generateCallId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {}
  }
  // Standard RFC4122 v4 UUID generator fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const callApi = {
  // Create a new call session with canonical UUID
  async createCallSession({ id, roomId = 'general', roomTitle = 'TeamSync HQ General Call', caller, callType = 'video' }) {
    const callUuid = isValidUuid(id) ? id : generateCallId();
    const sessionData = {
      id: callUuid,
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
          console.warn('Supabase call session insert notice, using canonical session data:', error?.message);
        }
      } catch (err) {
        console.warn('Call session error, using fallback:', err);
      }
    }

    if (!createdRecord) {
      createdRecord = {
        ...sessionData,
        created_at: new Date().toISOString()
      };
    }

    // Save active call locally
    try {
      localStorage.setItem(STORAGE_ACTIVE_CALL_KEY, JSON.stringify(createdRecord));
    } catch {}

    return createdRecord;
  },

  // Update or finish a call session cleanly
  async endCallSession(callId, { duration = 0, participants = [], roomId = null } = {}) {
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

    if (supabase) {
      try {
        if (callId && isValidUuid(callId)) {
          await supabase
            .from('call_history')
            .update(updateData)
            .eq('id', callId);
        }
        if (roomId) {
          // Also close any ongoing call in that room to guarantee no orphan calls remain
          await supabase
            .from('call_history')
            .update(updateData)
            .eq('room_id', roomId)
            .eq('status', 'ongoing');
        }
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
          id: callId || generateCallId(),
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

  // Get active call for a room if any (excludes stale calls > 1 hour)
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
          // Verify call is not stale (older than 1 hour)
          const startTime = new Date(data.started_at).getTime();
          if (Date.now() - startTime < 60 * 60 * 1000) {
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
          const startTime = new Date(parsed.started_at).getTime();
          if (Date.now() - startTime < 60 * 60 * 1000) {
            return parsed;
          }
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
