import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../api/supabase';
import { useAuth } from '../hooks/useAuth';

const PresenceContext = createContext(null);

export const PresenceProvider = ({ children }) => {
  const { user } = useAuth();
  const [onlineEmails, setOnlineEmails] = useState(new Set());

  useEffect(() => {
    if (!user?.email) {
      setOnlineEmails(new Set());
      return;
    }

    const currentEmail = user.email.toLowerCase();
    // Always include current user as online in their local view
    setOnlineEmails(prev => new Set([...prev, currentEmail]));

    // BroadcastChannel for cross-tab synchronization on the same browser
    let bc = null;
    try {
      bc = new BroadcastChannel('teamsync_presence_channel');
      bc.onmessage = (event) => {
        if (event.data?.type === 'ONLINE_PING' && event.data.email) {
          setOnlineEmails(prev => new Set([...prev, event.data.email.toLowerCase()]));
        } else if (event.data?.type === 'OFFLINE_PING' && event.data.email) {
          setOnlineEmails(prev => {
            const next = new Set(prev);
            next.delete(event.data.email.toLowerCase());
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

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const activeKeys = Object.keys(state).map(k => k.toLowerCase());
          setOnlineEmails(new Set([currentEmail, ...activeKeys]));
        })
        .on('presence', { event: 'join' }, ({ key }) => {
          if (key) {
            setOnlineEmails(prev => new Set([...prev, key.toLowerCase()]));
          }
        })
        .on('presence', { event: 'leave' }, ({ key }) => {
          if (key && key.toLowerCase() !== currentEmail) {
            setOnlineEmails(prev => {
              const next = new Set(prev);
              next.delete(key.toLowerCase());
              return next;
            });
          }
        })
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

  const isUserOnline = (email) => {
    if (!email) return false;
    const clean = email.toLowerCase();
    // Current user is always online in their own active session
    if (user?.email && user.email.toLowerCase() === clean) {
      return true;
    }
    return onlineEmails.has(clean);
  };

  return (
    <PresenceContext.Provider value={{ isUserOnline, onlineEmails, onlineCount: onlineEmails.size }}>
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
