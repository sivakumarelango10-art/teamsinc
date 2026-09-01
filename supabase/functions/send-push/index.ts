// TeamSync — Supabase Edge Function: send-push
// Deno runtime (supabase functions serve / supabase functions deploy)
//
// Triggered by Supabase Database Webhooks on:
//   - public.messages INSERT → sends chat push notification
//   - public.call_history INSERT/UPDATE → sends call push notification
//
// Security:
//   - VAPID_PRIVATE_KEY stored only in Supabase Edge Function Secrets (never in frontend)
//   - SUPABASE_SERVICE_ROLE_KEY stored in Edge Function Secrets
//   - Validates payload structure; never trusts userId from payload for auth decisions
//   - Uses service role to bypass RLS only for reading push_subscriptions
//   - Invalid/expired subscriptions (HTTP 410) are deleted immediately

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

// ─── Environment variables (set via: supabase secrets set KEY=value) ──────────
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:sivakumarelango10@gmail.com';

// Validate env at cold start
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('[send-push] VAPID keys not configured! Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY secrets.');
}

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// Admin Supabase client (bypasses RLS for reading push_subscriptions)
const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // Only accept POST
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response('Bad Request: invalid JSON', { status: 400 });
  }

  // Supabase Database Webhooks send the row in `record` and event type in `type`
  const eventType = (body.type as string) || '';
  const record = (body.record as Record<string, unknown>) || {};
  const oldRecord = (body.old_record as Record<string, unknown>) || {};
  const table = (body.table as string) || '';

  console.info(`[send-push] Event: ${eventType} on ${table}`, { id: record.id });

  try {
    if (table === 'messages' && eventType === 'INSERT') {
      await handleChatMessage(record);
    } else if (table === 'call_history') {
      if (eventType === 'INSERT' && record.status === 'ongoing') {
        await handleIncomingCall(record);
      } else if (eventType === 'UPDATE') {
        if (record.status === 'ended' && oldRecord.status === 'ongoing') {
          await handleCallCancelled(record);
        }
      }
    } else {
      // Unknown webhook event — acknowledge cleanly
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (err) {
    console.error('[send-push] Handler error:', err);
    // Return 200 so Supabase doesn't retry on application errors
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

// ─── Chat Message Push ────────────────────────────────────────────────────────
async function handleChatMessage(record: Record<string, unknown>) {
  const senderEmail = String(record.sender_email || '').toLowerCase();
  const senderName = String(record.sender_name || 'Team Member');
  const messageId = String(record.id || '');
  const content = String(record.content || '');
  const channel = String(record.channel || 'general');
  const fileType = record.file_type as string | null;

  // Craft preview text
  let preview = content;
  if (fileType === 'audio') {
    preview = '🎤 Voice message';
  } else if (fileType === 'image') {
    preview = '🖼️ Image';
  } else if (fileType === 'document') {
    preview = `📎 ${record.file_name || 'File'}`;
  }
  if (preview.length > 100) {
    preview = preview.substring(0, 97) + '...';
  }

  // Get allowed roles for this channel
  const allowedRoles = channel === 'leadership'
    ? ['FOUNDER', 'ADMIN', 'FOUNDING_ADVISOR']
    : ['FOUNDER', 'ADMIN', 'MEMBER'];

  // Query profiles of allowed recipients
  const { data: allowedProfiles } = await adminSupabase
    .from('profiles')
    .select('id, email, role')
    .in('role', allowedRoles);

  const allowedUserIds = new Set((allowedProfiles || []).map((p) => p.id));

  // Find sender profile id to exclude
  let senderProfileId: string | null = null;
  if (senderEmail) {
    const sender = (allowedProfiles || []).find(
      (p) => p.email?.toLowerCase() === senderEmail
    );
    senderProfileId = sender?.id ?? null;
  }

  // Get ALL push subscriptions matching allowed users except sender
  const { data: subscriptions, error } = await adminSupabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, user_id')
    .neq('endpoint', '')
    .limit(100);

  if (error || !subscriptions?.length) {
    console.info('[send-push] No subscriptions found for chat push.');
    return;
  }

  const targetSubscriptions = subscriptions.filter(
    (sub) => allowedUserIds.has(sub.user_id) && sub.user_id !== senderProfileId
  );

  const payload = JSON.stringify({
    type: 'chat_message',
    senderName: channel === 'leadership' ? `[Leadership] ${senderName}` : senderName,
    preview,
    messageId,
    roomId: channel,
    url: channel === 'leadership' ? '/leadership-chat' : '/chat'
  });

  await sendPushToSubscriptions(targetSubscriptions, payload);
}

// ─── Incoming Call Push ───────────────────────────────────────────────────────
async function handleIncomingCall(record: Record<string, unknown>) {
  const callerEmail = String(record.caller_email || '').toLowerCase();
  const callerName = String(record.caller_name || 'Team Member');
  const callType = String(record.call_type || 'video');
  const callId = String(record.id || '');

  // Get all subscriptions except the caller's
  const { data: subscriptions, error } = await adminSupabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, user_id')
    .limit(100);

  if (error || !subscriptions?.length) return;

  let callerProfileId: string | null = null;
  if (callerEmail) {
    const { data: callerProfile } = await adminSupabase
      .from('profiles')
      .select('id')
      .ilike('email', callerEmail)
      .maybeSingle();
    callerProfileId = callerProfile?.id ?? null;
  }

  const targetSubscriptions = subscriptions.filter(
    (sub) => sub.user_id !== callerProfileId
  );

  const payload = JSON.stringify({
    type: 'incoming_call',
    callerName,
    callType,
    callId
  });

  await sendPushToSubscriptions(targetSubscriptions, payload);
}

// ─── Call Cancelled / Ended Push ─────────────────────────────────────────────
async function handleCallCancelled(record: Record<string, unknown>) {
  const callId = String(record.id || '');

  // Send a cancellation push so SW can close the ringing notification
  const { data: subscriptions } = await adminSupabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .limit(100);

  if (!subscriptions?.length) return;

  const payload = JSON.stringify({
    type: 'call_cancelled',
    callId
  });

  await sendPushToSubscriptions(subscriptions, payload);
}

// ─── Send push to a batch of subscriptions ───────────────────────────────────
async function sendPushToSubscriptions(
  subscriptions: Array<{ id: string; endpoint: string; p256dh: string; auth: string }>,
  payload: string
) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('[send-push] VAPID not configured, skipping push delivery.');
    return;
  }

  const invalidIds: string[] = [];

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth
            }
          },
          payload,
          {
            TTL: 60 * 60, // 1 hour max delivery window
            urgency: 'high'
          }
        );
        console.info('[send-push] Push sent to subscription:', sub.id);
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;

        if (status === 410 || status === 404) {
          // Subscription expired or unregistered — mark for deletion
          invalidIds.push(sub.id);
          console.info('[send-push] Subscription gone (410/404), removing:', sub.id);
        } else {
          // Transient error (5xx) — log but don't delete
          console.warn('[send-push] Push delivery failed (transient):', sub.id, status);
        }
      }
    })
  );

  // Clean up invalid subscriptions
  if (invalidIds.length > 0) {
    const { error } = await adminSupabase
      .from('push_subscriptions')
      .delete()
      .in('id', invalidIds);

    if (error) {
      console.warn('[send-push] Failed to remove expired subscriptions:', error.message);
    } else {
      console.info('[send-push] Removed', invalidIds.length, 'expired subscription(s).');
    }
  }

  return results;
}
