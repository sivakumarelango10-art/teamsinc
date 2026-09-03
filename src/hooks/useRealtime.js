import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../api/supabase';

/**
 * useRealtime
 * Subscribes to Supabase Realtime (postgres_changes) across one or more tables,
 * automatically debouncing burst updates (e.g. 200ms), avoiding screen-flicker,
 * generating unique collision-free channel IDs, and optionally syncing across browser tabs.
 *
 * @param {string | string[]} tables - Table name or array of table names to listen to
 * @param {Function} onUpdate - Callback invoked when a database change occurs
 * @param {Object} [options]
 * @param {string} [options.event='*'] - 'INSERT' | 'UPDATE' | 'DELETE' | '*'
 * @param {string} [options.channelPrefix='teamsync_rt'] - Prefix for unique channel name
 * @param {number} [options.debounceMs=200] - Debounce time in ms to avoid rapid repeated refetches
 * @param {boolean} [options.enabled=true] - Toggle subscription on/off
 * @param {string} [options.broadcastChannel] - Optional name for cross-tab BroadcastChannel
 */
export const useRealtime = (
  tables,
  onUpdate,
  {
    event = '*',
    channelPrefix = 'teamsync_rt',
    debounceMs = 200,
    enabled = true,
    broadcastChannel: broadcastChannelName = null
  } = {}
) => {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const debounceTimerRef = useRef(null);

  // Trigger debounced update
  const triggerUpdate = useCallback((payload) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      if (typeof onUpdateRef.current === 'function') {
        onUpdateRef.current(payload);
      }
    }, debounceMs);
  }, [debounceMs]);

  useEffect(() => {
    if (!enabled) return;

    const tableList = Array.isArray(tables) ? tables : [tables];
    if (tableList.length === 0) return;

    const channelId = `${channelPrefix}_${tableList.join('_')}_${Math.random().toString(36).substring(2, 9)}`;
    let channel = null;

    if (supabase) {
      channel = supabase.channel(channelId);

      tableList.forEach((tableName) => {
        channel.on(
          'postgres_changes',
          { event, schema: 'public', table: tableName },
          (payload) => {
            triggerUpdate(payload);
          }
        );
      });

      channel.subscribe();
    }

    // Optional cross-tab BroadcastChannel
    let bc = null;
    const effectiveBcName = broadcastChannelName || `teamsync_bc_${tableList.join('_')}`;
    try {
      bc = new BroadcastChannel(effectiveBcName);
      bc.onmessage = (e) => {
        triggerUpdate(e.data);
      };
    } catch {
      // BroadcastChannel not available in environment
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
      if (bc) {
        bc.close();
      }
    };
  }, [
    enabled,
    Array.isArray(tables) ? tables.join(',') : tables,
    event,
    channelPrefix,
    broadcastChannelName,
    triggerUpdate
  ]);
};

/**
 * Helper to dispatch a cross-tab local event when optimistic updates occur
 */
export const broadcastRealtimeEvent = (channelName, payload = {}) => {
  try {
    const bc = new BroadcastChannel(channelName);
    bc.postMessage(payload);
    bc.close();
  } catch {
    // Ignore error in restricted browser contexts
  }
};

export default useRealtime;
