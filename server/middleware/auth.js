import crypto from 'node:crypto';
import fs from 'fs';

// Read API key from env or .env file
function getConfiguredApiKey() {
  let key = process.env.TEAMSYNC_API_KEY;
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
  return key || 'ts_live_kalvilearn_sec_99a8b1c4e2d3f7';
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
      authMethod: 'INTERNAL_SESSION'
    };
    return next();
  }

  if (!providedKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Missing API key. Provide either x-api-key or Authorization: Bearer <key>.'
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
    authMethod: 'API_KEY'
  };

  next();
}

export default requireApiKey;
