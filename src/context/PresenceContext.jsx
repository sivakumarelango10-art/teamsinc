import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../api/supabase';
import { useAuth } from '../hooks/useAuth';

const PresenceContext = createContext(null);

const areSameMembers = (left, right) =>
  left.size === right.size && [...left].every((value) => right.has(value));

export const PresenceProvider = ({ children }) => {
  const { user } = useAuth();
  const [onlineEmails, setOnlineEmails] = useState(new Set());

  useEffect(() => {
    if (!user?.email) {
      setOnlineEmails(prev => (prev.size ? new Set() : prev));
      return;
    }

    const currentEmail = user.email.toLowerCase();
    // Always include current user as online in their local view.
    // Preserve the Set identity when presence has not actually changed.
    setOnlineEmails(prev => {
      if (prev.has(currentEmail)) return prev;
      const next = new Set(prev);
      next.add(currentEmail);
      return next;
    });

    // BroadcastChannel for cross-tab synchronization on the same browser
    let bc = null;
    try {
      bc = new BroadcastChannel('teamsync_presence_channel');
      bc.onmessage = (event) => {
        if (event.data?.type === 'ONLINE_PING' && event.data.email) {
          const email = event.data.email.toLowerCase();
          setOnlineEmails(prev => {
            if (prev.has(email)) return prev;
            const next = new Set(prev);
            next.add(email);
            return next;
          });
        } else if (event.data?.type === 'OFFLINE_PING' && event.data.email) {
          const email = event.data.email.toLowerCase();
          setOnlineEmails(prev => {
            if (!prev.has(email)) return prev;
            const next = new Set(prev);
            next.delete(email);
            return next;
          });
        }
      };
      bc.postMessage({ type: 'ONLINE_PING', email: currentEmail });
    } catch {
      // BroadcastChannel unsupported or restricted
    }

    // Supabase Realtime Presence Channel across all devices and users
    let channel = null;
    if (supabase) {
      channel = supabase.channel('online-presence', {
        config: {
          presence: {
            key: currentEmail
          }
        }
      });

      let syncDebounceTimer = null;
      const schedulePresenceSync = () => {
        if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
        syncDebounceTimer = setTimeout(() => {
          if (!channel) return;
          try {
            const state = channel.presenceState();
            const activeKeys = Object.keys(state).map(k => k.toLowerCase());
            const next = new Set([currentEmail, ...activeKeys]);
            setOnlineEmails(prev => (areSameMembers(prev, next) ? prev : next));
          } catch {}
        }, 150);
      };

      channel
        .on('presence', { event: 'sync' }, schedulePresenceSync)
        .on('presence', { event: 'join' }, schedulePresenceSync)
        .on('presence', { event: 'leave' }, schedulePresenceSync)
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({
              email: currentEmail,
              online_at: new Date().toISOString()
            });
          }
        });

      // Update last_seen_at heartbeat in database
      const updateHeartbeat = async () => {
        try {
          await supabase
            .from('profiles')
            .update({ last_seen_at: new Date().toISOString() })
            .ilike('email', currentEmail);
        } catch (err) {
          console.warn('Heartbeat update failed:', err);
        }
      };

      updateHeartbeat();
      const heartbeatTimer = setInterval(updateHeartbeat, 60000); // every 60s

      const handleUnload = () => {
        if (bc) {
          try {
            bc.postMessage({ type: 'OFFLINE_PING', email: currentEmail });
          } catch {}
        }
        if (channel) channel.untrack();
      };

      window.addEventListener('beforeunload', handleUnload);

      return () => {
        if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
        clearInterval(heartbeatTimer);
        window.removeEventListener('beforeunload', handleUnload);
        if (bc) {
          try {
            bc.postMessage({ type: 'OFFLINE_PING', email: currentEmail });
            bc.close();
          } catch {}
        }
        if (channel) {
          channel.untrack();
          supabase.removeChannel(channel);
        }
      };
    }

    return () => {
      if (bc) {
        try {
          bc.close();
        } catch {}
      }
    };
  }, [user?.email]);

  const isUserOnline = useCallback((email) => {
    if (!email) return false;
    const clean = email.toLowerCase();
    // Current user is always online in their own active session
    if (user?.email && user.email.toLowerCase() === clean) {
      return true;
    }
    return onlineEmails.has(clean);
  }, [user?.email, onlineEmails]);

  const value = useMemo(() => ({
    isUserOnline,
    onlineEmails,
    onlineCount: onlineEmails.size
  }), [isUserOnline, onlineEmails]);

  return (
    <PresenceContext.Provider value={value}>
      {children}
    </PresenceContext.Provider>
  );
};

export const usePresence = () => {
  const context = useContext(PresenceContext);
  if (!context) {
    return {
      isUserOnline: () => false,
      onlineEmails: new Set(),
      onlineCount: 0
    };
  }
  return context;
};

export default PresenceContext;
