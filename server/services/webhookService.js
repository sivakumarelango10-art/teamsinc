import crypto from 'node:crypto';
import fs from 'fs';
import { query } from '../db.js';

let mockWebhookTransport = null;

export function setWebhookTransportHook(fn) {
  mockWebhookTransport = fn;
}

export function resetWebhookTransportHook() {
  mockWebhookTransport = null;
}

export function getConfiguredWebhookConfig() {
  let url = (process.env.TEAMSYNC_WEBHOOK_URL || process.env.WEBHOOK_URL)
    ? (process.env.TEAMSYNC_WEBHOOK_URL || process.env.WEBHOOK_URL).trim().replace(/^["']|["']$/g, '')
    : null;
  let secret = process.env.TEAMSYNC_WEBHOOK_SECRET
    ? process.env.TEAMSYNC_WEBHOOK_SECRET.trim().replace(/^["']|["']$/g, '')
    : null;

  if ((!url || !secret) && fs.existsSync('.env')) {
    const content = fs.readFileSync('.env', 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if ((trimmed.startsWith('TEAMSYNC_WEBHOOK_URL=') || trimmed.startsWith('WEBHOOK_URL=')) && !url) {
        url = trimmed.split('=')[1]?.replace(/^["']|["']$/g, '');
      } else if (trimmed.startsWith('TEAMSYNC_WEBHOOK_SECRET=') && !secret) {
        secret = trimmed.replace(/^TEAMSYNC_WEBHOOK_SECRET=/, '').replace(/^["']|["']$/g, '');
      }
    }
  }

  if (!url) {
    // Webhook dispatch optional
  }
  if (!secret) {
    // Secret optional
  }

  return {
    url: url || null,
    secret: secret || null
  };
}

/**
 * Compute raw HMAC-SHA256 hex signature against canonical message: `${timestamp}.${payloadString}`
 */
export function computeRawHexSignature(payloadString, secret, timestamp) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${timestamp}.${payloadString}`);
  return hmac.digest('hex');
}

/**
 * Generate HMAC-SHA256 signature string for webhook payload (supports t=...,v1=... format)
 */
export function generateWebhookSignature(payloadString, secret, timestamp) {
  const hex = computeRawHexSignature(payloadString, secret, timestamp);
  return `t=${timestamp},v1=${hex}`;
}

/**
 * Verify HMAC-SHA256 signature against payload
 * Supports:
 *  1. `t=...,v1=...`
 *  2. `v1=...` (with external timestamp)
 *  3. `<hex>` (with external timestamp)
 */
export function verifyWebhookSignature(payloadString, signatureHeader, secret, externalTimestamp = null) {
  try {
    if (!signatureHeader || typeof signatureHeader !== 'string') return false;

    let timestamp = externalTimestamp;
    let expectedSig = signatureHeader.trim();

    if (signatureHeader.includes('t=') && signatureHeader.includes('v1=')) {
      const parts = signatureHeader.split(',');
      const timestampPart = parts.find(p => p.startsWith('t='));
      const sigPart = parts.find(p => p.startsWith('v1='));
      if (timestampPart && sigPart) {
        timestamp = timestampPart.substring(2).trim();
        expectedSig = sigPart.substring(3).trim();
      }
    } else if (signatureHeader.startsWith('v1=')) {
      expectedSig = signatureHeader.substring(3).trim();
    }

    if (!timestamp) return false;

    const calculatedSig = computeRawHexSignature(payloadString, secret, timestamp);

    const expectedBuf = Buffer.from(expectedSig, 'hex');
    const calculatedBuf = Buffer.from(calculatedSig, 'hex');

    if (expectedBuf.length !== calculatedBuf.length || expectedBuf.length === 0) return false;
    return crypto.timingSafeEqual(expectedBuf, calculatedBuf);
  } catch {
    return false;
  }
}

/**
 * SSRF Protection: Check if URL targets internal / cloud metadata hosts
 */
export function isBlockedDestination(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();

    // Block cloud metadata services and dangerous internal IPs
    const blockedHosts = [
      '169.254.169.254',
      'metadata.google.internal',
      'metadata.internal',
      'instance-data',
      '100.100.100.200'
    ];

    if (blockedHosts.includes(host)) {
      return true;
    }

    // In production, block non-https destinations (unless localhost for tests)
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:' && !isLocal) {
      return true;
    }

    return false;
  } catch {
    return true;
  }
}

/**
 * Calculate exponential backoff next retry delay in milliseconds
 * Attempt 1: 1 min, Attempt 2: 5 min, Attempt 3: 30 min, Attempt 4: 2 hours
 */
export function calculateBackoffMs(attempt) {
  const delays = [
    60 * 1000,          // 1 min
    5 * 60 * 1000,      // 5 mins
    30 * 60 * 1000,     // 30 mins
    2 * 60 * 60 * 1000  // 2 hours
  ];
  return delays[Math.min(Math.max(0, attempt - 1), delays.length - 1)];
}

/**
 * Dispatch webhook event
 */
export async function dispatchWebhookEvent(eventType, payload, customEventId = null) {
  const { url, secret } = getConfiguredWebhookConfig();

  // Skip dispatch if webhook is not fully configured — do not throw, callers use .catch(() => {})
  if (!url || !secret) {
    console.warn(`[Webhook] Skipping dispatch for event "${eventType}": webhook URL or secret not configured.`);
    return { skipped: true, reason: 'missing_config' };
  }

  // Stable event ID across retries
  const eventId = customEventId || `evt_${eventType.toLowerCase()}_${Date.now()}_${crypto.randomUUID().substring(0, 8)}`;
  const timestamp = Math.floor(Date.now() / 1000);

  // Canonical payload format
  const webhookBody = {
    id: eventId,
    eventId: eventId,
    event: eventType,
    eventType: eventType,
    timestamp: timestamp,
    createdAt: new Date(timestamp * 1000).toISOString(),
    source: 'TEAMSYNC',
    ticketId: payload.ticketId || null,
    ticketNumber: payload.ticketNumber || null,
    sourceReferenceId: payload.sourceReferenceId || payload.externalReferenceId || null,
    previousStatus: payload.previousStatus || null,
    newStatus: payload.newStatus || null,
    previousPriority: payload.previousPriority || null,
    newPriority: payload.newPriority || null,
    assignee: payload.assignee || null,
    comment: payload.comment || null,
    ticket: payload.ticket || {
      id: payload.ticketId,
      ticketNumber: payload.ticketNumber,
      sourceReferenceId: payload.sourceReferenceId,
      source: 'TEAMSYNC'
    },
    data: payload
  };

  const payloadString = JSON.stringify(webhookBody);
  const rawHexSignature = computeRawHexSignature(payloadString, secret, timestamp);

  // 1. Record delivery queue record in database
  let deliveryId = null;
  try {
    const insertRes = await query(`
      INSERT INTO public.webhook_deliveries (
        event_id, event_type, target_url, payload, signature, status, attempt_count, max_attempts
      ) VALUES ($1, $2, $3, $4, $5, 'PENDING', 0, 5)
      ON CONFLICT (event_id) DO UPDATE
        SET status = 'RETRYING',
            last_attempt_at = now()
      RETURNING id;
    `, [eventId, eventType, url, webhookBody, rawHexSignature]);
    deliveryId = insertRes.rows[0]?.id;
  } catch (err) {
    console.error('[Webhook] Failed to persist initial webhook delivery record:', err.message);
  }

  // 2. Perform outbound HTTP POST (awaited to prevent premature serverless container freeze)
  try {
    await deliverWebhook({
      deliveryId,
      eventId,
      eventType,
      url,
      payloadString,
      signature: rawHexSignature,
      timestamp,
      attempt: 1
    });
  } catch (err) {
    console.warn('[Webhook] Outbound delivery attempt warning:', err.message);
  }

  return { eventId, status: 'QUEUED' };
}

/**
 * Execute actual HTTP delivery with retry scheduling
 */
export async function deliverWebhook({ deliveryId, eventId, eventType, url, payloadString, signature, timestamp, attempt }) {
  // SSRF Check
  if (isBlockedDestination(url)) {
    const errorMsg = `SSRF blocked: Malicious or internal destination URL "${url}" is not allowed.`;
    console.error(`[Webhook SSRF Defense] ${errorMsg}`);
    if (deliveryId) {
      await query(`
        UPDATE public.webhook_deliveries
        SET status = 'FAILED',
            attempt_count = attempt_count + 1,
            last_attempt_at = now(),
            response_body = $1
        WHERE id = $2;
      `, [errorMsg, deliveryId]).catch(() => {});
    }
    return { success: false, error: errorMsg, permanentFailure: true };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'TeamSync-Webhook-Dispatcher/1.0',
    'X-TeamSync-Signature': signature,
    'X-TeamSync-Timestamp': String(timestamp),
    'X-TeamSync-Event-ID': eventId,
    'X-TeamSync-Event': eventType
  };

  try {
    let response;

    if (mockWebhookTransport) {
      response = await mockWebhookTransport(url, {
        method: 'POST',
        headers,
        body: payloadString,
        signal: controller.signal
      });
    } else {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: payloadString,
        signal: controller.signal
      });
    }

    clearTimeout(timeoutId);

    const responseStatus = response.status;
    const responseText = await response.text().catch(() => '');

    if (responseStatus >= 200 && responseStatus < 300) {
      if (deliveryId) {
        await query(`
          UPDATE public.webhook_deliveries
          SET status = 'DELIVERED',
              attempt_count = attempt_count + 1,
              last_attempt_at = now(),
              response_code = $1,
              response_body = $2
          WHERE id = $3;
        `, [responseStatus, responseText.substring(0, 1000), deliveryId]).catch(() => {});
      }
      return { success: true, status: responseStatus };
    }

    // Permanent Client Failures (400, 401, 403, 404, 422) - DO NOT RETRY
    const isPermanent = responseStatus >= 400 && responseStatus < 500 && responseStatus !== 429;
    if (isPermanent) {
      if (deliveryId) {
        await query(`
          UPDATE public.webhook_deliveries
          SET status = 'FAILED',
              attempt_count = attempt_count + 1,
              last_attempt_at = now(),
              response_code = $1,
              response_body = $2
          WHERE id = $3;
        `, [responseStatus, responseText.substring(0, 1000), deliveryId]).catch(() => {});
      }
      return {
        success: false,
        status: responseStatus,
        error: `Permanent failure (${responseStatus}): ${responseText.substring(0, 200)}`,
        permanentFailure: true,
        retryScheduled: false
      };
    }

    // Transient failure (429, 500, 502, 503, 504)
    throw new Error(`HTTP Error ${responseStatus}: ${responseText.substring(0, 200)}`);
  } catch (err) {
    clearTimeout(timeoutId);

    const nextDelay = calculateBackoffMs(attempt);
    const nextRetryAt = new Date(Date.now() + nextDelay);
    const isFinalAttempt = attempt >= 5;

    if (deliveryId) {
      await query(`
        UPDATE public.webhook_deliveries
        SET status = $1,
            attempt_count = attempt_count + 1,
            last_attempt_at = now(),
            next_retry_at = $2,
            response_body = $3
        WHERE id = $4;
      `, [
        isFinalAttempt ? 'FAILED' : 'RETRYING',
        isFinalAttempt ? null : nextRetryAt,
        err.message?.substring(0, 1000) || 'Network error',
        deliveryId
      ]).catch(() => {});
    }

    return {
      success: false,
      error: err.message,
      retryScheduled: !isFinalAttempt,
      attempt
    };
  }
}

export default {
  dispatchWebhookEvent,
  deliverWebhook,
  generateWebhookSignature,
  verifyWebhookSignature,
  computeRawHexSignature,
  calculateBackoffMs,
  isBlockedDestination,
  getConfiguredWebhookConfig,
  setWebhookTransportHook,
  resetWebhookTransportHook
};

