const VALID_REPORT_TYPES = new Set([
  'BUG',
  'FEATURE',
  'FEATURE_REQUEST',
  'FEEDBACK',
  'ISSUE',
  'IMPROVEMENT',
  'OTHER'
]);

const VALID_PRIORITIES = new Set([
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL'
]);

const PRIORITY_ALIASES = {
  URGENT: 'CRITICAL',
  NORMAL: 'MEDIUM'
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Basic string sanitizer to strip out raw script tags and control characters
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .trim();
}

/**
 * Request validation middleware for POST /api/v1/tickets
 */
export function validateFeedbackPayload(req, res, next) {
  const body = req.body;
  const errors = [];

  if (!body || typeof body !== 'object') {
    return res.status(400).json({
      success: false,
      error: 'Invalid request body: Expected JSON object.'
    });
  }

  // 1. Validate Type / Category
  const rawType = body.type || body.category;
  if (!rawType || typeof rawType !== 'string') {
    errors.push('Field "type" (or "category") is required and must be a string.');
  } else {
    let normalizedType = rawType.toUpperCase().trim();
    if (normalizedType === 'FEATURE_REQUEST') normalizedType = 'FEATURE';
    if (!VALID_REPORT_TYPES.has(normalizedType)) {
      errors.push(`Invalid report type "${rawType}". Supported types: BUG, FEATURE, FEEDBACK, ISSUE, IMPROVEMENT, OTHER.`);
    } else {
      body.type = normalizedType;
      body.category = normalizedType;
    }
  }

  // 2. Validate Title
  if (!body.title || typeof body.title !== 'string') {
    errors.push('Field "title" is required and must be a string.');
  } else {
    body.title = sanitizeString(body.title);
    if (body.title.length < 3) {
      errors.push('Field "title" must be at least 3 characters long.');
    } else if (body.title.length > 255) {
      errors.push('Field "title" must not exceed 255 characters.');
    }
  }

  // 3. Validate Description
  if (!body.description || typeof body.description !== 'string') {
    errors.push('Field "description" is required and must be a string.');
  } else {
    body.description = sanitizeString(body.description);
    if (body.description.length < 5) {
      errors.push('Field "description" must be at least 5 characters long.');
    } else if (body.description.length > 10000) {
      errors.push('Field "description" must not exceed 10,000 characters.');
    }
  }

  // 4. Validate Reporter / User
  const reporterObj = body.reporter || body.user;
  if (!reporterObj || typeof reporterObj !== 'object') {
    errors.push('Field "reporter" (or "user") is required and must be an object.');
  } else {
    const name = reporterObj.name || (reporterObj.fullName) || 'Team Member';
    const email = reporterObj.email;
    const role = reporterObj.role;
    const externalUserId = reporterObj.externalUserId || reporterObj.userId || reporterObj.id;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      errors.push('Field "reporter.name" is required.');
    } else {
      reporterObj.name = sanitizeString(name);
    }

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      errors.push('Field "reporter.email" is required and must be a valid email address.');
    } else {
      reporterObj.email = email.trim().toLowerCase();
    }

    if (role && typeof role === 'string') {
      reporterObj.role = sanitizeString(role);
    }
    if (externalUserId) {
      reporterObj.externalUserId = sanitizeString(String(externalUserId));
      reporterObj.userId = reporterObj.externalUserId;
    }

    body.reporter = reporterObj;
    body.user = reporterObj;
  }

  // 5. Validate Priority (Optional, support aliases URGENT -> CRITICAL, NORMAL -> MEDIUM)
  if (body.priority) {
    if (typeof body.priority !== 'string') {
      errors.push('Field "priority" must be a string.');
    } else {
      let normalizedPriority = body.priority.toUpperCase().trim();
      if (PRIORITY_ALIASES[normalizedPriority]) {
        normalizedPriority = PRIORITY_ALIASES[normalizedPriority];
      }
      if (!VALID_PRIORITIES.has(normalizedPriority)) {
        errors.push(`Invalid priority "${body.priority}". Supported priorities: ${Array.from(VALID_PRIORITIES).join(', ')}.`);
      } else {
        body.priority = normalizedPriority;
      }
    }
  }

  // 6. Validate Source
  if (body.source && typeof body.source === 'string') {
    body.source = sanitizeString(body.source).toUpperCase();
  } else {
    body.source = 'TEAMSYNC';
  }

  // 7. Context Sanitization
  if (body.portal && typeof body.portal === 'string') body.portal = sanitizeString(body.portal);
  if (body.route && typeof body.route === 'string') body.route = sanitizeString(body.route);
  if (body.page && typeof body.page === 'string' && !body.route) body.route = sanitizeString(body.page);
  if (body.module && typeof body.module === 'string') body.module = sanitizeString(body.module);
  if (body.environment && typeof body.environment === 'string') body.environment = sanitizeString(body.environment);
  if (body.browser && typeof body.browser === 'string') body.browser = sanitizeString(body.browser);
  if (body.device && typeof body.device === 'string') body.device = sanitizeString(body.device);
  if (body.appVersion && typeof body.appVersion === 'string') body.appVersion = sanitizeString(body.appVersion);

  // 8. External / Source Reference ID
  const refId = body.sourceReferenceId || body.externalReferenceId || (body.metadata && body.metadata.requestId);
  if (refId && typeof refId === 'string') {
    const sanitizedRef = sanitizeString(refId);
    body.sourceReferenceId = sanitizedRef;
    body.externalReferenceId = sanitizedRef;
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed.',
      details: errors
    });
  }

  next();
}

export default { validateFeedbackPayload, VALID_REPORT_TYPES, VALID_PRIORITIES };

