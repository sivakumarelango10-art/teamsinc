import React, { useState, useEffect } from 'react';
import { Bell, BellOff, X, Check } from 'lucide-react';
import notificationService from '../../utils/notificationService';
import { useAuth } from '../../hooks/useAuth';
import { hasUserDismissedPrompt, markPromptDismissed } from '../../utils/pushSubscriptionManager';

/**
 * PushPermissionPrompt
 *
 * A non-intrusive banner that:
 * - Only appears when Notification.permission === 'default'
 * - Is not shown if the user has previously dismissed it
 * - Does NOT trigger on app load — shown after user navigates to chat or after login
 * - Explains value before requesting permission
 * - Handles granted / denied / already-granted states cleanly
 */
const PushPermissionPrompt = () => {
  const { profile } = useAuth();
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState('idle'); // 'idle' | 'requesting' | 'granted' | 'denied'

  useEffect(() => {
    // Only show if:
    // 1. Notifications are supported
    // 2. Permission has not been decided yet ('default')
    // 3. User hasn't dismissed this prompt before
    // 4. User is logged in
    if (
      !profile?.id ||
      !('Notification' in window) ||
      Notification.permission !== 'default' ||
      hasUserDismissedPrompt()
    ) {
      return;
    }

    // Defer showing by 3 seconds so it doesn't pop up immediately on load
    const timer = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(timer);
  }, [profile?.id]);

  const handleEnable = async () => {
    setState('requesting');
    try {
      const result = await notificationService.requestPermissionAndSubscribe(profile?.id);
      if (result === 'granted') {
        setState('granted');
        setTimeout(() => {
          setVisible(false);
        }, 2000);
      } else {
        setState('denied');
        markPromptDismissed();
      }
    } catch {
      setState('denied');
    }
  };

  const handleDismiss = () => {
    markPromptDismissed();
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="
        fixed bottom-4 left-1/2 -translate-x-1/2 z-[200]
        w-full max-w-md mx-auto px-4
        animate-slideUp
      "
    >
      <div className="
        bg-neutral-900 border border-neutral-700/60
        rounded-2xl shadow-2xl shadow-black/60
        overflow-hidden backdrop-blur-xl
      ">
        {/* Accent bar */}
        <div className="h-0.5 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-600" />

        <div className="p-4 flex items-start gap-4">
          {/* Icon */}
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mt-0.5">
            {state === 'granted' ? (
              <Check className="w-5 h-5 text-emerald-400" />
            ) : state === 'denied' ? (
              <BellOff className="w-5 h-5 text-neutral-400" />
            ) : (
              <Bell className="w-5 h-5 text-emerald-400" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {state === 'granted' && (
              <>
                <p className="text-sm font-semibold text-emerald-400">Notifications enabled!</p>
                <p className="text-xs text-neutral-400 mt-0.5">You'll be notified of messages and calls.</p>
              </>
            )}
            {state === 'denied' && (
              <>
                <p className="text-sm font-semibold text-neutral-300">Notifications blocked</p>
                <p className="text-xs text-neutral-400 mt-0.5">
                  To enable later, click the 🔒 in your browser's address bar.
                </p>
              </>
            )}
            {(state === 'idle' || state === 'requesting') && (
              <>
                <p className="text-sm font-semibold text-white">Stay in the loop</p>
                <p className="text-xs text-neutral-400 mt-0.5 leading-relaxed">
                  Get notified about new messages and incoming calls — even when TeamSync is in the background.
                </p>
              </>
            )}
          </div>

          {/* Close button (always visible when not granted) */}
          {state !== 'granted' && (
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss notification prompt"
              className="
                flex-shrink-0 w-7 h-7 rounded-full
                text-neutral-500 hover:text-neutral-300
                hover:bg-neutral-800 transition
                flex items-center justify-center cursor-pointer
              "
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Action buttons */}
        {(state === 'idle' || state === 'requesting') && (
          <div className="px-4 pb-4 flex gap-2">
            <button
              type="button"
              onClick={handleDismiss}
              className="
                flex-1 py-2 px-3 rounded-xl text-xs font-medium
                text-neutral-400 hover:text-neutral-200
                border border-neutral-700 hover:border-neutral-600
                transition cursor-pointer
              "
            >
              Not now
            </button>
            <button
              type="button"
              id="push-permission-enable-btn"
              onClick={handleEnable}
              disabled={state === 'requesting'}
              className="
                flex-1 py-2 px-3 rounded-xl text-xs font-semibold
                bg-emerald-500 hover:bg-emerald-400
                text-black transition cursor-pointer
                disabled:opacity-60 disabled:cursor-not-allowed
                flex items-center justify-center gap-1.5
              "
            >
              {state === 'requesting' ? (
                <>
                  <span className="w-3 h-3 rounded-full border-2 border-black/40 border-t-black animate-spin" />
                  Enabling…
                </>
              ) : (
                <>
                  <Bell className="w-3.5 h-3.5" />
                  Enable Notifications
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PushPermissionPrompt;
