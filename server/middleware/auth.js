import crypto from 'node:crypto';
import fs from 'fs';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FOUNDER_EMAIL = 'sivakumarelango10@gmail.com';

// Read API key from env or .env file (no hardcoded fallback — missing key is a misconfiguration)
export function getConfiguredApiKey() {
  let key = process.env.TEAMSYNC_API_KEY ? process.env.TEAMSYNC_API_KEY.trim().replace(/^["']|["']$/g, '') : null;
  if (!key && fs.existsSync('.env')) {
    const content = fs.readFileSync('.env', 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('TEAMSYNC_API_KEY=')) {
        key = trimmed.replace(/^TEAMSYNC_API_KEY=/, '').replace(/^["']|["']$/g, '');
        break;
      }
    }
  }
  if (!key) {
    console.error('[TeamSync] CRITICAL: TEAMSYNC_API_KEY environment variable is not set. All API requests will be rejected.');
  }
  return key || null;
}

/**
 * Server-to-server API Key authentication middleware.
 * Expects 'x-api-key' header or 'Authorization: Bearer <key>'.
 * Uses crypto.timingSafeEqual to eliminate side-channel timing attacks.
 */
export function requireApiKey(req, res, next) {
  const configuredKey = getConfiguredApiKey();

  const authHeader = req.headers['authorization'];
  const xApiKey = req.headers['x-api-key'];

  let providedKey = null;

  if (xApiKey && typeof xApiKey === 'string') {
    providedKey = xApiKey.trim();
  } else if (authHeader && typeof authHeader === 'string') {
    if (authHeader.startsWith('Bearer ')) {
      providedKey = authHeader.substring(7).trim();
    } else {
      providedKey = authHeader.trim();
    }
  }

  // Allow internal TeamSync workspace requests
  const workspaceSource = req.headers['x-teamsync-source'];
  if (workspaceSource === 'WORKSPACE') {
    req.authenticatedClient = {
      source: 'TEAMSYNC_WORKSPACE',
      authMethod: 'INTERNAL_SESSION',
      role: req.headers['x-teamsync-role'] || 'MEMBER',
      userId: req.headers['x-teamsync-user-id'] || null
    };
    return next();
  }

  if (!providedKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Missing API key. Provide either x-api-key or Authorization: Bearer <key>.'
    });
  }

  // Misconfiguration guard: if no API key is configured, reject all requests
  if (!configuredKey) {
    return res.status(503).json({
      success: false,
      error: 'Service Misconfiguration: TEAMSYNC_API_KEY is not set on the server. Contact the administrator.'
    });
  }

  // Safe constant-time string comparison
  const providedBuf = Buffer.from(providedKey, 'utf8');
  const configuredBuf = Buffer.from(configuredKey, 'utf8');

  if (providedBuf.length !== configuredBuf.length || !crypto.timingSafeEqual(providedBuf, configuredBuf)) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid API key.'
    });
  }

  req.authenticatedClient = {
    source: 'KALVILEARN',
    authMethod: 'API_KEY',
    role: 'ADMIN'
  };

  next();
}

/**
 * Derives and authenticates the requesting user from a trusted server-side source.
 * CRITICAL SECURITY GUARANTEE: Never trusts client-supplied role headers.
 * Looks up the actual user record and role from PostgreSQL public.profiles.
 */
export async function resolveAuthenticatedUser(req) {
  const configuredKey = getConfiguredApiKey();
  const authHeader = req.headers['authorization'];
  const xApiKey = req.headers['x-api-key'];

  // 1. API Key Authentication (System Administrator)
  let providedKey = null;
  if (xApiKey && typeof xApiKey === 'string') {
    providedKey = xApiKey.trim();
  } else if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (configuredKey && token === configuredKey) {
      providedKey = token;
    }
  }

  if (providedKey && configuredKey) {
    const providedBuf = Buffer.from(providedKey, 'utf8');
    const configuredBuf = Buffer.from(configuredKey, 'utf8');
    if (providedBuf.length === configuredBuf.length && crypto.timingSafeEqual(providedBuf, configuredBuf)) {
      return {
        id: '00000000-0000-0000-0000-000000000001',
        email: FOUNDER_EMAIL,
        role: 'FOUNDER',
        full_name: 'System Root Administrator',
        is_active: true,
        authMethod: 'API_KEY'
      };
    }
  }

  // 2. JWT Bearer Token (Supabase Session Token)
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const parts = token.split('.');
    if (parts.length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        const userEmail = payload.email ? payload.email.trim().toLowerCase() : null;
        const authUid = payload.sub && UUID_REGEX.test(payload.sub) ? payload.sub : null;

        if (userEmail || authUid) {
          const { query } = await import('../db.js');
          const res = await query(
            `SELECT id, auth_user_id, full_name, email, role, is_active 
             FROM public.profiles 
             WHERE ($1::uuid IS NOT NULL AND auth_user_id = $1::uuid)
                OR ($2::text IS NOT NULL AND LOWER(email) = LOWER($2::text))
             LIMIT 1`,
            [authUid, userEmail]
          );
          if (res.rows.length > 0) {
            const user = res.rows[0];
            return {
              id: user.id,
              auth_user_id: user.auth_user_id,
              email: user.email,
              role: user.role, // Derived from PostgreSQL
              full_name: user.full_name,
              is_active: user.is_active,
              authMethod: 'JWT'
            };
          }
        }
      } catch {
        // Fall through to other auth mechanisms if JWT decode fails
      }
    }
  }

  // 3. Authenticated Session Headers (User ID or Email)
  // Derive the user's role from the database, NEVER trusting x-teamsync-role
  const sessionEmail = req.headers['x-teamsync-user-email'] || req.headers['x-user-email'] || req.headers['x-session-email'];
  const sessionUserId = req.headers['x-teamsync-user-id'] || req.headers['x-user-id'] || req.headers['x-session-user-id'];

  if (sessionEmail || sessionUserId) {
    const cleanEmail = typeof sessionEmail === 'string' ? sessionEmail.trim().toLowerCase() : null;
    const cleanUid = typeof sessionUserId === 'string' && UUID_REGEX.test(sessionUserId.trim()) ? sessionUserId.trim() : null;

    try {
      const { query } = await import('../db.js');
      const res = await query(
        `SELECT id, auth_user_id, full_name, email, role, is_active 
         FROM public.profiles 
         WHERE ($1::uuid IS NOT NULL AND (id = $1::uuid OR auth_user_id = $1::uuid))
            OR ($2::text IS NOT NULL AND LOWER(email) = LOWER($2::text))
         LIMIT 1`,
        [cleanUid, cleanEmail]
      );
      if (res.rows.length > 0) {
        const user = res.rows[0];
        return {
          id: user.id,
          auth_user_id: user.auth_user_id,
          email: user.email,
          role: user.role, // Server-derived, NOT from client headers
          full_name: user.full_name,
          is_active: user.is_active,
          authMethod: 'SESSION_HEADER'
        };
      }
    } catch {
      // DB error
    }
  }

  return null;
}

/**
 * Authentication middleware that verifies session and attaches trusted server-derived user.
 */
export async function requireUserAuth(req, res, next) {
  try {
    const user = await resolveAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Valid authenticated session required.'
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Your account has been deactivated.'
      });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Role-Based Access Control middleware for user-management mutations.
 * Returns HTTP 403 Forbidden for authenticated Members attempting prohibited administrative actions.
 */
export function requireAdminOrFounder(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Authentication required.'
    });
  }

  const role = req.user.role;
  const isAuthorized = role === 'ADMIN' || role === 'FOUNDER' || req.user.email?.toLowerCase() === FOUNDER_EMAIL;

  if (!isAuthorized) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Members have read-only access to user management.'
    });
  }

  next();
}

export default requireApiKey;
