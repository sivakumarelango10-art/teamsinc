// TeamSync Enterprise Notification & Audio Chime Service
// Production version: integrates Web Push subscription init + foreground state coordination

import {
  subscribeToPush,
  saveSubscriptionToDatabase,
  refreshSubscriptionIfNeeded,
  unsubscribeFromPush,
  getPermissionState
} from './pushSubscriptionManager';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

class NotificationService {
  constructor() {
    this.audioCtx = null;
    this.ringInterval = null;
    this.swRegistration = null;
    this._swReadyPromise = null;
    this._swController = null;

    // Initiate SW registration immediately (non-blocking)
    this._swReadyPromise = this._initServiceWorker();
  }

  // ─── Service Worker ─────────────────────────────────────────────────────────
  async _initServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      // Register (or reuse if already registered)
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      this.swRegistration = reg;

      // Wait for the SW to be active
      await navigator.serviceWorker.ready;

      // Set up a message channel to coordinate foreground state
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'PONG') {
          // SW is alive
        }
      });

      return reg;
    } catch (err) {
      console.warn('[NotificationService] SW registration failed:', err.message || err);
      return null;
    }
  }

  // ─── Tell SW whether the chat page is currently visible ────────────────────
  // Call this on mount/unmount of the chat page and on visibilitychange.
  setForegroundState(isChatVisible) {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
    try {
      navigator.serviceWorker.controller.postMessage({
        type: 'SET_FOREGROUND_STATE',
        payload: { isChatVisible }
      });
    } catch {}
  }

  // ─── Notify SW that a call was answered (close the push notification) ───────
  notifyCallAnswered(callId) {
    if (!callId || !('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
    try {
      navigator.serviceWorker.controller.postMessage({
        type: 'CALL_ANSWERED',
        payload: { callId }
      });
    } catch {}
  }

  // ─── Notify SW that a call was cancelled (close the push notification) ──────
  notifyCallCancelled(callId) {
    if (!callId || !('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
    try {
      navigator.serviceWorker.controller.postMessage({
        type: 'CALL_CANCELLED',
        payload: { callId }
      });
    } catch {}
  }

  // ─── Permission ─────────────────────────────────────────────────────────────
  getPermissionState() {
    return getPermissionState();
  }

  get hasPermission() {
    return 'Notification' in window && Notification.permission === 'granted';
  }

  async requestPermission() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    try {
      const result = await Notification.requestPermission();
      return result;
    } catch {
      return 'denied';
    }
  }

  // ─── Web Push Init (called after user logs in) ───────────────────────────────
  // This sets up the push subscription and stores it in Supabase.
  // If VAPID public key is missing, it degrades gracefully to foreground-only mode.
  async initWebPush(userId) {
    if (!userId) return;
    if (!VAPID_PUBLIC_KEY) {
      console.info('[Push] VITE_VAPID_PUBLIC_KEY not set — running in foreground-only mode.');
      return;
    }

    try {
      // Wait for SW to be ready
      await this._swReadyPromise;

      // Try to refresh or create subscription
      await refreshSubscriptionIfNeeded(VAPID_PUBLIC_KEY, userId);

      // If permission just granted, create a new subscription
      if (this.hasPermission) {
        const sub = await subscribeToPush(VAPID_PUBLIC_KEY);
        if (sub) {
          await saveSubscriptionToDatabase(sub, userId);
        }
      }
    } catch (err) {
      console.warn('[Push] initWebPush error:', err.message || err);
    }
  }

  // ─── Called on logout ────────────────────────────────────────────────────────
  async onLogout(userId) {
    try {
      await unsubscribeFromPush(userId);
    } catch {}
  }

  // ─── Request permission + subscribe (for PushPermissionPrompt button) ───────
  async requestPermissionAndSubscribe(userId) {
    const permission = await this.requestPermission();
    if (permission !== 'granted') return permission;

    await this.initWebPush(userId);
    return 'granted';
  }

  // ─── Audio Context ──────────────────────────────────────────────────────────
  getAudioContext() {
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.audioCtx = new AudioCtx();
    }
    if (this.audioCtx?.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  // ─── Message Chime (foreground) ─────────────────────────────────────────────
  playMessageChime() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      // Tone 1: E6 (1318.5 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1318.5, now);
      gain1.gain.setValueAtTime(0.12, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc1.connect(gain1); gain1.connect(ctx.destination);
      osc1.start(now); osc1.stop(now + 0.25);
      // Tone 2: G#6 (1661.2 Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1661.2, now + 0.08);
      gain2.gain.setValueAtTime(0.14, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc2.connect(gain2); gain2.connect(ctx.destination);
      osc2.start(now + 0.08); osc2.stop(now + 0.4);
    } catch {}
  }

  // ─── Incoming Call Ringtone (foreground) ─────────────────────────────────────
  startIncomingCallRingtone() {
    this.stopIncomingCallRingtone();
    const playRingCycle = () => {
      try {
        const ctx = this.getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        [0, 0.2].forEach((offset) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(852, now + offset);
          gain.gain.setValueAtTime(0.15, now + offset);
          gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.15);
          osc.connect(gain); gain.connect(ctx.destination);
          osc.start(now + offset); osc.stop(now + offset + 0.15);
        });
      } catch {}
    };
    playRingCycle();
    this.ringInterval = setInterval(playRingCycle, 1800);
  }

  stopIncomingCallRingtone() {
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
  }

  // ─── Chat Notification (foreground-aware) ────────────────────────────────────
  notifyChatMessage({ senderName, content = '', currentPath = '', messageId = null }) {
    const isViewingChat = currentPath === '/chat' && !document.hidden;
    if (isViewingChat) return;

    // Play audio chime
    this.playMessageChime();

    // Show in-browser notification (works when tab is open but not focused)
    if (this.hasPermission) {
      try {
        const preview = content.length > 80 ? content.substring(0, 77) + '...' : content;
        const notification = new Notification(`${senderName || 'Team Member'} · TeamSync`, {
          body: preview || 'Sent a message in #general',
          icon: '/logo.jpg',
          badge: '/logo.jpg',
          tag: messageId ? `chat-${messageId}` : 'teamsync-chat-message',
          renotify: Boolean(messageId)
        });
        notification.onclick = () => {
          window.focus();
          if (window.location.pathname !== '/chat') window.location.href = '/chat';
          notification.close();
        };
      } catch (err) {
        console.warn('[Notify] Chat notification error:', err.message);
      }
    }
  }

  // ─── Incoming Call Notification (foreground-aware) ───────────────────────────
  notifyIncomingCall({ callerName, callType = 'video', onAccept }) {
    this.startIncomingCallRingtone();
    if (this.hasPermission) {
      try {
        const title = `📞 Incoming ${callType === 'voice' ? 'Voice' : 'Video'} Call`;
        const notification = new Notification(title, {
          body: `${callerName || 'A team member'} is calling in #general`,
          icon: '/logo.jpg',
          tag: 'teamsync-incoming-call',
          requireInteraction: true
        });
        notification.onclick = () => {
          window.focus();
          this.stopIncomingCallRingtone();
          if (onAccept) onAccept();
          notification.close();
        };
      } catch {}
    }
  }
}

export const notificationService = new NotificationService();
export default notificationService;
