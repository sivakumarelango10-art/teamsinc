// TeamSync — Production Service Worker
// Handles: Web Push events, notification clicks, call cancellation cleanup, foreground coordination

const CACHE_VERSION = 'v1';
const APP_URL = self.registration.scope;

// ─── Install & Activate ────────────────────────────────────────────────────────
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ─── Foreground page coordination ─────────────────────────────────────────────
// The open page posts messages to the SW to let it know what's visible.
// We store state so the SW can decide whether to show a notification.
let foregroundState = {
  isChatVisible: false,
  activeCallIds: new Set()
};

self.addEventListener('message', (event) => {
  if (!event.data) return;

  const { type, payload } = event.data;

  if (type === 'SET_FOREGROUND_STATE') {
    foregroundState.isChatVisible = Boolean(payload?.isChatVisible);
  }

  if (type === 'CALL_ANSWERED') {
    // Page told us user answered a call — close the ringing push notification
    const callId = payload?.callId;
    if (callId) {
      self.registration.getNotifications({ tag: `call-${callId}` }).then((notes) => {
        notes.forEach((n) => n.close());
      });
    }
  }

  if (type === 'CALL_CANCELLED') {
    const callId = payload?.callId;
    if (callId) {
      self.registration.getNotifications({ tag: `call-${callId}` }).then((notes) => {
        notes.forEach((n) => n.close());
      });
      // Also close missed-call if it somehow opened first
      self.registration.getNotifications({ tag: `missed-${callId}` }).then((notes) => {
        notes.forEach((n) => n.close());
      });
    }
  }

  // Ping back to identify this SW is active
  if (type === 'PING') {
    event.source?.postMessage({ type: 'PONG' });
  }
});

// ─── Push Event ────────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { type: 'chat_message', title: 'TeamSync', body: event.data?.text() || 'New update' };
  }

  const notifType = data.type || 'chat_message';

  event.waitUntil(handlePushEvent(notifType, data));
});

async function handlePushEvent(notifType, data) {
  // Check if any window already has focus and is showing the relevant content
  const windowClients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  });

  const hasVisibleChatWindow = windowClients.some((c) => {
    // If window is focused AND we know chat is visible, skip push
    return c.focused && foregroundState.isChatVisible && notifType === 'chat_message';
  });

  // Always show call notifications regardless of focus (user needs to act)
  if (hasVisibleChatWindow && notifType === 'chat_message') {
    return; // Active chat window — skip OS notification
  }

  switch (notifType) {
    case 'chat_message':
      await showChatNotification(data);
      break;
    case 'incoming_call':
      await showCallNotification(data);
      break;
    case 'missed_call':
      await showMissedCallNotification(data);
      break;
    case 'call_cancelled':
      // Close the ringing notification if it's showing
      if (data.callId) {
        const existing = await self.registration.getNotifications({ tag: `call-${data.callId}` });
        existing.forEach((n) => n.close());
      }
      break;
    default:
      await showGenericNotification(data);
  }
}

// ─── Notification Builders ────────────────────────────────────────────────────

async function showChatNotification(data) {
  const {
    senderName = 'Team Member',
    preview = 'Sent a message',
    messageId,
    roomId = 'general'
  } = data;

  const options = {
    body: preview,
    icon: '/logo.jpg',
    badge: '/logo.jpg',
    // Use messageId tag to prevent duplicate notifications for same message
    tag: `chat-${messageId || 'latest'}`,
    renotify: Boolean(messageId), // Ring again if it's a genuinely new message
    silent: false,
    vibrate: [200, 100, 200],
    data: {
      type: 'chat_message',
      url: '/chat',
      messageId,
      roomId
    },
    actions: [
      { action: 'open', title: 'Open Chat' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  return self.registration.showNotification(`${senderName} · TeamSync`, options);
}

async function showCallNotification(data) {
  const {
    callerName = 'Team Member',
    callType = 'video',
    callId
  } = data;

  const callLabel = callType === 'voice' ? 'Voice' : 'Video';

  const options = {
    body: `${callerName} is calling you`,
    icon: '/logo.jpg',
    badge: '/logo.jpg',
    tag: `call-${callId}`,
    renotify: true,
    requireInteraction: true, // Stay visible until user acts
    silent: false,
    vibrate: [300, 200, 300, 200, 300],
    data: {
      type: 'incoming_call',
      url: '/chat',
      callId,
      callType,
      callerName
    },
    actions: [
      { action: 'join', title: '✅ Join' },
      { action: 'decline', title: '❌ Decline' }
    ]
  };

  return self.registration.showNotification(`📞 Incoming ${callLabel} Call`, options);
}

async function showMissedCallNotification(data) {
  const { callerName = 'Team Member', callId, callType = 'video' } = data;
  const callLabel = callType === 'voice' ? 'Voice' : 'Video';

  const options = {
    body: `${callerName} called you`,
    icon: '/logo.jpg',
    badge: '/logo.jpg',
    tag: `missed-${callId}`,
    renotify: false, // Don't re-ring for same missed call
    silent: true,
    data: {
      type: 'missed_call',
      url: '/chat',
      callId
    }
  };

  return self.registration.showNotification(`Missed ${callLabel} Call`, options);
}

async function showGenericNotification(data) {
  return self.registration.showNotification(data.title || 'TeamSync', {
    body: data.body || 'You have a new update',
    icon: '/logo.jpg',
    badge: '/logo.jpg',
    tag: data.tag || 'teamsync-general',
    data: { type: 'generic', url: data.url || '/chat' }
  });
}

// ─── Notification Click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};

  notification.close();

  // Dismiss action — just close
  if (action === 'dismiss' || action === 'decline') {
    return;
  }

  // Determine target URL
  let targetUrl = data.url || '/chat';

  event.waitUntil(
    (async () => {
      // Find existing open windows for this origin
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });

      // If any window matches our app origin, focus it and navigate
      for (const client of windowClients) {
        const clientUrl = new URL(client.url);
        const targetUrlObj = new URL(targetUrl, APP_URL);

        if (clientUrl.origin === targetUrlObj.origin) {
          // Navigate to the right route and focus
          await client.navigate(targetUrl);
          return client.focus();
        }
      }

      // No window found — open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })()
  );
});

// ─── Notification Close ────────────────────────────────────────────────────────
self.addEventListener('notificationclose', (event) => {
  const data = event.notification.data || {};
  // Analytics hook (non-blocking, fire-and-forget)
  // Could post to backend to track dismissed notifications
  // For now, just suppress stale call notifications tracking
});
