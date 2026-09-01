// TeamSync Enterprise Notification & Audio Chime Service

class NotificationService {
  constructor() {
    this.audioCtx = null;
    this.ringInterval = null;
    this.isServiceWorkerRegistered = false;
    this.initServiceWorker();
  }

  // Initialize Service Worker
  async initServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        this.isServiceWorkerRegistered = true;
      } catch (err) {
        console.warn('Service Worker registration note:', err);
      }
    }
  }

  // Request browser notification permissions
  async requestPermission() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    try {
      const permission = await Notification.requestPermission();
      return permission;
    } catch (e) {
      return 'denied';
    }
  }

  get hasPermission() {
    return 'Notification' in window && Notification.permission === 'granted';
  }

  // Lazy initialize Web Audio context
  getAudioContext() {
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  // Synthesize a pleasant high-quality 2-tone message chime
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
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.25);

      // Tone 2: G#6 (1661.2 Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1661.2, now + 0.08);
      gain2.gain.setValueAtTime(0.14, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.4);
    } catch (e) {
      console.warn('Audio chime notice:', e);
    }
  }

  // Start synthesizing an incoming call ringtone
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
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + offset);
          osc.stop(now + offset + 0.15);
        });
      } catch {}
    };

    playRingCycle();
    this.ringInterval = setInterval(playRingCycle, 1800);
  }

  // Stop incoming call ringtone
  stopIncomingCallRingtone() {
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
  }

  // Context-aware chat message notification
  notifyChatMessage({ senderName, content = '', currentPath = '' }) {
    // If the user is actively viewing /chat and the window is visible in foreground, skip system push
    const isViewingChat = currentPath === '/chat' && !document.hidden;
    if (isViewingChat) {
      return;
    }

    // Play subtle audio chime
    this.playMessageChime();

    // Dispatch Web Notification if permitted
    if (this.hasPermission) {
      try {
        const preview = content.length > 80 ? content.substring(0, 77) + '...' : content;
        const notification = new Notification(`${senderName || 'Team Member'} (TeamSync)`, {
          body: preview || 'Sent a message in #general',
          icon: '/logo.jpg',
          badge: '/logo.jpg',
          tag: 'teamsync-chat-message',
          renotify: true
        });

        notification.onclick = () => {
          window.focus();
          if (window.location.pathname !== '/chat') {
            window.location.href = '/chat';
          }
          notification.close();
        };
      } catch (err) {
        console.warn('Notification dispatch notice:', err);
      }
    }
  }

  // Incoming call notification
  notifyIncomingCall({ callerName, callType = 'video', onAccept }) {
    this.startIncomingCallRingtone();

    if (this.hasPermission) {
      try {
        const title = `Incoming ${callType === 'voice' ? 'Voice' : 'Video'} Call`;
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
      } catch (e) {}
    }
  }
}

export const notificationService = new NotificationService();
export default notificationService;
