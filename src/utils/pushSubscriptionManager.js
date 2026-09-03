// TeamSync — Push Subscription Manager
// Handles: VAPID subscription creation, multi-device storage in Supabase,
//          subscription refresh, cleanup on logout.
// NEVER stores or exposes the VAPID private key — that lives only in Edge Function secrets.

import { supabase } from '../api/supabase';

const DEVICE_ID_KEY = 'teamsync_device_id';
const SUBSCRIPTION_KEY = 'teamsync_push_sub_endpoint';
const DISMISSED_PROMPT_KEY = 'teamsync_push_prompt_dismissed';

// ─── Device Identity ───────────────────────────────────────────────────────────
// A stable per-browser-profile ID so a user on 3 devices gets 3 subscriptions.
export function getOrCreateDeviceId() {
  let deviceId = null;
  try {
    deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
  } catch {
    // localStorage blocked (incognito/strict) — use a session-only ID
    deviceId = `dev_session_${Math.random().toString(36).substring(2, 10)}`;
  }
  return deviceId;
}

// ─── Convert VAPID public key ──────────────────────────────────────────────────
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ─── Subscribe to push ────────────────────────────────────────────────────────
// Returns the PushSubscription or null on failure.
export async function subscribeToPush(vapidPublicKey) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.info('[Push] Web Push not supported in this browser.');
    return null;
  }

  if (Notification.permission !== 'granted') {
    console.info('[Push] Notification permission not granted, skipping subscription.');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true, // Required by browsers — all pushes show a notification
      applicationServerKey
    });

    return subscription;
  } catch (err) {
    // NotAllowedError = permission denied; just return null gracefully
    console.warn('[Push] Push subscription failed:', err.message || err);
    return null;
  }
}

// ─── Send subscription to Supabase ────────────────────────────────────────────
// Stores the subscription under the authenticated user with the device ID.
// Uses UPSERT so re-registering the same device updates rather than duplicates.
export async function saveSubscriptionToDatabase(subscription, userId) {
  if (!supabase || !subscription || !userId) return false;

  const deviceId = getOrCreateDeviceId();
  const subJson = subscription.toJSON();

  try {
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          device_id: deviceId,
          subscription: subJson,
          endpoint: subJson.endpoint,
          p256dh: subJson.keys?.p256dh || '',
          auth: subJson.keys?.auth || '',
          user_agent: navigator.userAgent.substring(0, 200),
          last_used_at: new Date().toISOString()
        },
        { onConflict: 'user_id,device_id' }
      );

    if (error) {
      console.warn('[Push] Failed to save subscription:', error.message);
      return false;
    }

    // Cache the endpoint locally so we know if subscription changed
    try {
      localStorage.setItem(SUBSCRIPTION_KEY, subJson.endpoint);
    } catch {}

    console.info('[Push] Subscription saved/updated for device:', deviceId);
    return true;
  } catch (err) {
    console.warn('[Push] Database error saving subscription:', err.message || err);
    return false;
  }
}

// ─── Unsubscribe on logout ─────────────────────────────────────────────────────
export async function unsubscribeFromPush(userId) {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
    }
  } catch (err) {
    console.warn('[Push] Error unsubscribing:', err.message || err);
  }

  // Remove from database
  if (supabase && userId) {
    const deviceId = getOrCreateDeviceId();
    try {
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('device_id', deviceId);
    } catch {}
  }

  try {
    localStorage.removeItem(SUBSCRIPTION_KEY);
  } catch {}

  console.info('[Push] Unsubscribed from push notifications.');
}

// ─── Refresh subscription if stale ────────────────────────────────────────────
// Called on app load after login. Detects if subscription endpoint changed
// (browser can rotate subscriptions) and re-registers if needed.
export async function refreshSubscriptionIfNeeded(vapidPublicKey, userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const currentSub = await registration.pushManager.getSubscription();

    if (!currentSub) {
      // No subscription exists — create one
      const newSub = await subscribeToPush(vapidPublicKey);
      if (newSub) await saveSubscriptionToDatabase(newSub, userId);
      return;
    }

    // Check if the endpoint changed since we last saved
    let cachedEndpoint = null;
    try {
      cachedEndpoint = localStorage.getItem(SUBSCRIPTION_KEY);
    } catch {}

    if (!cachedEndpoint || cachedEndpoint !== currentSub.endpoint) {
      // Endpoint differs — re-save
      await saveSubscriptionToDatabase(currentSub, userId);
    }
  } catch (err) {
    console.warn('[Push] Subscription refresh error:', err.message || err);
  }
}

// ─── Permission prompt state helpers ──────────────────────────────────────────
export function hasUserDismissedPrompt() {
  try {
    return localStorage.getItem(DISMISSED_PROMPT_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markPromptDismissed() {
  try {
    localStorage.setItem(DISMISSED_PROMPT_KEY, 'true');
  } catch {}
}

export function getPermissionState() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}
