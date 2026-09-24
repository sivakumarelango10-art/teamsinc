import crypto from 'node:crypto';
import fs from 'fs';

// Read API key from env or .env file (no hardcoded fallback — missing key is a misconfiguration)
function getConfiguredApiKey() {
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

export default requireApiKey;
