import { query } from '../db.js';
import { dispatchWebhookEvent } from './webhookService.js';

// Status Lifecycle Valid State Transitions
export const ALLOWED_STATUS_TRANSITIONS = {
  OPEN: ['TRIAGED', 'IN_PROGRESS', 'BLOCKED', 'REJECTED'],
  TRIAGED: ['IN_PROGRESS', 'BLOCKED', 'REJECTED'],
  IN_PROGRESS: ['BLOCKED', 'RESOLVED', 'REJECTED'],
  BLOCKED: ['IN_PROGRESS', 'TRIAGED'],
  RESOLVED: ['CLOSED', 'OPEN'],
  CLOSED: ['OPEN'],
  REJECTED: ['OPEN']
};

export const DEFAULT_PRIORITIES_BY_TYPE = {
  BUG: 'MEDIUM',
  ISSUE: 'MEDIUM',
  FEATURE: 'LOW',
  IMPROVEMENT: 'LOW',
  FEEDBACK: 'LOW',
  OTHER: 'LOW'
};

function formatTicketResponse(row) {
  if (!row) return null;
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    source: row.source,
    externalReferenceId: row.external_reference_id,
    sourceReferenceId: row.external_reference_id,
    type: row.type,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    portal: row.portal || null,
    route: row.route || null,
    module: row.module || null,
    environment: row.environment || 'production',
    browser: row.browser || null,
    device: row.device || null,
    appVersion: row.app_version || null,
    reporter: {
      externalUserId: row.reporter_external_id || null,
      userId: row.reporter_external_id || null,
      name: row.reporter_name,
      email: row.reporter_email,
      role: row.reporter_role || null
    },
    metadata: row.metadata || {},
    assignedTo: row.assigned_to || null,
    assignee: row.assignee_id ? {
      id: row.assignee_id,
      fullName: row.assignee_name,
      name: row.assignee_name,
      email: row.assignee_email,
      role: row.assignee_role
    } : null,
    labels: Array.isArray(row.labels) ? row.labels : (typeof row.labels === 'string' ? JSON.parse(row.labels) : []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at || null,
    closedAt: row.closed_at || null
  };
}

/**
 * 1. Create a TeamSync Ticket with Idempotency Protection
 */
export async function createTicket(data, idempotencyKey = null) {
  const source = data.source || 'KALVILEARN';
  const extRef = data.sourceReferenceId || data.externalReferenceId || (data.metadata && data.metadata.requestId) || `req_${Date.now()}`;
  const effectiveIdempotencyKey = idempotencyKey || data.idempotencyKey || null;

  // 1. Check Idempotency: Duplicate detection by (source, externalReferenceId) or idempotencyKey
  let existingCheckQuery = `
    SELECT t.*, p.id as assignee_id, p.full_name as assignee_name, p.email as assignee_email, p.role as assignee_role
    FROM public.tickets t
    LEFT JOIN public.profiles p ON t.assigned_to = p.id
    WHERE (t.source = $1 AND t.external_reference_id = $2)
  `;
  const existingCheckParams = [source, extRef];

  if (effectiveIdempotencyKey) {
    existingCheckQuery += ` OR (t.idempotency_key IS NOT NULL AND t.idempotency_key = $3)`;
    existingCheckParams.push(effectiveIdempotencyKey);
  }

  const existingRes = await query(existingCheckQuery, existingCheckParams);
  if (existingRes.rows.length > 0) {
    return {
      isExisting: true,
      ticket: formatTicketResponse(existingRes.rows[0])
    };
  }

  // 2. Determine Priority (Sensible defaults if not specified)
  let priority = data.priority || DEFAULT_PRIORITIES_BY_TYPE[data.type] || 'MEDIUM';
  if (priority === 'URGENT') priority = 'CRITICAL';
  if (priority === 'NORMAL') priority = 'MEDIUM';

  // 3. Insert New Ticket
  const insertTicketSql = `
    INSERT INTO public.tickets (
      source,
      external_reference_id,
      type,
      title,
      description,
      status,
      priority,
      portal,
      route,
      module,
      environment,
      browser,
      device,
      app_version,
      reporter_external_id,
      reporter_name,
      reporter_email,
      reporter_role,
      metadata,
      labels,
      idempotency_key
    ) VALUES (
      $1, $2, $3, $4, $5, 'OPEN', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
    )
    RETURNING *;
  `;

  const reporterObj = data.reporter || data.user || {};
  const insertParams = [
    source,
    extRef,
    data.type || data.category || 'BUG',
    data.title || 'User Report',
    data.description,
    priority,
    data.portal || null,
    data.route || data.page || null,
    data.module || null,
    data.environment || 'production',
    data.browser || null,
    data.device || null,
    data.appVersion || null,
    reporterObj.externalUserId || reporterObj.userId || reporterObj.id || null,
    reporterObj.name || reporterObj.fullName || 'KalviLearn User',
    reporterObj.email || '',
    reporterObj.role || null,
    JSON.stringify(data.metadata || {}),
    JSON.stringify(Array.isArray(data.labels) ? data.labels : []),
    effectiveIdempotencyKey
  ];

  let newRow;
  try {
    const res = await query(insertTicketSql, insertParams);
    newRow = res.rows[0];
  } catch (err) {
    // Concurrent duplicate insertion safety check (unique constraint collision)
    if (err.code === '23505') {
      const collisionRes = await query(
        `SELECT t.*, p.id as assignee_id, p.full_name as assignee_name, p.email as assignee_email, p.role as assignee_role
         FROM public.tickets t
         LEFT JOIN public.profiles p ON t.assigned_to = p.id
         WHERE (t.source = $1 AND t.external_reference_id = $2)
            OR ($3::text IS NOT NULL AND t.idempotency_key = $3)`,
        [source, extRef, effectiveIdempotencyKey]
      );
      if (collisionRes.rows.length > 0) {
        return {
          isExisting: true,
          ticket: formatTicketResponse(collisionRes.rows[0])
        };
      }
    }
    throw err;
  }

  // 4. Record Initial Activity in Audit History
  await query(`
    INSERT INTO public.ticket_activities (
      ticket_id, action, from_value, to_value, performed_by_name
    ) VALUES ($1, 'TICKET_CREATED', NULL, 'OPEN', 'KalviLearn System')
  `, [newRow.id]);

  // 5. Insert Attachments if provided
  if (Array.isArray(data.attachments) && data.attachments.length > 0) {
    for (const att of data.attachments) {
      if (att.fileUrl && att.fileName) {
        await query(`
          INSERT INTO public.ticket_attachments (
            ticket_id, file_name, file_url, file_type, file_size
          ) VALUES ($1, $2, $3, $4, $5)
        `, [
          newRow.id,
          att.fileName,
          att.fileUrl,
          att.fileType || 'image/png',
          att.fileSize || 0
        ]);
      }
    }
  }

  const formatted = formatTicketResponse(newRow);

  // 6. Asynchronous Webhook Notification back to KalviLearn
  dispatchWebhookEvent('TICKET_CREATED', {
    ticketId: formatted.id,
    ticketNumber: formatted.ticketNumber,
    sourceReferenceId: formatted.sourceReferenceId,
    externalReferenceId: formatted.externalReferenceId,
    status: formatted.status,
    priority: formatted.priority,
    type: formatted.type,
    createdAt: formatted.createdAt,
    ticket: {
      id: formatted.id,
      ticketNumber: formatted.ticketNumber,
      sourceReferenceId: formatted.sourceReferenceId,
      source: formatted.source
    }
  }).catch(() => {});

  return {
    isExisting: false,
    ticket: formatted
  };
}

/**
 * 2. Get Single Ticket by TicketNumber or ID or ExternalRef
 */
export async function getTicketByNumber(identifier) {
  const sql = `
    SELECT 
      t.*,
      p.id as assignee_id,
      p.full_name as assignee_name,
      p.email as assignee_email,
      p.role as assignee_role
    FROM public.tickets t
    LEFT JOIN public.profiles p ON t.assigned_to = p.id
    WHERE t.ticket_number = $1 
       OR t.external_reference_id = $1
       OR (t.id::text = $1)
    LIMIT 1;
  `;

  const res = await query(sql, [identifier]);
  if (res.rows.length === 0) return null;

  const ticket = formatTicketResponse(res.rows[0]);

  // Fetch comments, activities, and attachments in parallel
  const [commentsRes, activitiesRes, attachmentsRes] = await Promise.all([
    query(`
      SELECT tc.*, p.full_name as author_profile_name, p.role as author_profile_role
      FROM public.ticket_comments tc
      LEFT JOIN public.profiles p ON tc.author_id = p.id
      WHERE tc.ticket_id = $1
      ORDER BY tc.created_at ASC;
    `, [ticket.id]),

    query(`
      SELECT * FROM public.ticket_activities
      WHERE ticket_id = $1
      ORDER BY created_at ASC;
    `, [ticket.id]),

    query(`
      SELECT * FROM public.ticket_attachments
      WHERE ticket_id = $1
      ORDER BY created_at ASC;
    `, [ticket.id])
  ]);

  ticket.comments = commentsRes.rows.map(c => ({
    id: c.id,
    authorName: c.author_profile_name || c.author_name,
    authorRole: c.author_profile_role || c.author_role,
    comment: c.comment,
    createdAt: c.created_at,
    updatedAt: c.updated_at
  }));

  ticket.activities = activitiesRes.rows.map(a => ({
    id: a.id,
    action: a.action,
    from: a.from_value,
    to: a.to_value,
    performedBy: a.performed_by_name,
    createdAt: a.created_at
  }));

  ticket.attachments = attachmentsRes.rows.map(att => ({
    id: att.id,
    fileName: att.file_name,
    fileUrl: att.file_url,
    fileType: att.file_type,
    fileSize: Number(att.file_size),
    createdAt: att.created_at
  }));

  return ticket;
}

/**
 * 3. List and Filter Tickets with Pagination and Full-Text Search
 */
export async function listTickets({
  type,
  status,
  priority,
  portal,
  module,
  assignedTo,
  createdFrom,
  createdTo,
  externalReferenceId,
  sourceReferenceId,
  search,
  page = 1,
  limit = 20
} = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];
  const params = [];
  let paramIdx = 1;

  if (type && type !== 'ALL') {
    conditions.push(`t.type = $${paramIdx++}`);
    params.push(type.toUpperCase());
  }

  if (status && status !== 'ALL') {
    conditions.push(`t.status = $${paramIdx++}`);
    params.push(status.toUpperCase());
  }

  if (priority && priority !== 'ALL') {
    let p = priority.toUpperCase();
    if (p === 'URGENT') p = 'CRITICAL';
    if (p === 'NORMAL') p = 'MEDIUM';
    conditions.push(`t.priority = $${paramIdx++}`);
    params.push(p);
  }

  if (portal && portal !== 'ALL') {
    conditions.push(`t.portal = $${paramIdx++}`);
    params.push(portal);
  }

  if (module) {
    conditions.push(`t.module ILIKE $${paramIdx++}`);
    params.push(`%${module}%`);
  }

  if (assignedTo) {
    conditions.push(`t.assigned_to = $${paramIdx++}`);
    params.push(assignedTo);
  }

  const effectiveRef = sourceReferenceId || externalReferenceId;
  if (effectiveRef) {
    conditions.push(`t.external_reference_id = $${paramIdx++}`);
    params.push(effectiveRef);
  }

  if (createdFrom) {
    conditions.push(`t.created_at >= $${paramIdx++}`);
    params.push(new Date(createdFrom).toISOString());
  }

  if (createdTo) {
    conditions.push(`t.created_at <= $${paramIdx++}`);
    params.push(new Date(createdTo).toISOString());
  }

  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    conditions.push(`(
      t.ticket_number ILIKE $${paramIdx} OR
      t.title ILIKE $${paramIdx} OR
      t.description ILIKE $${paramIdx} OR
      t.reporter_name ILIKE $${paramIdx} OR
      t.reporter_email ILIKE $${paramIdx} OR
      t.external_reference_id ILIKE $${paramIdx} OR
      t.labels::text ILIKE $${paramIdx}
    )`);
    params.push(q);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countSql = `SELECT COUNT(*) as total FROM public.tickets t ${whereClause};`;
  const countRes = await query(countSql, params);
  const total = parseInt(countRes.rows[0]?.total || '0', 10);

  const dataSql = `
    SELECT 
      t.*,
      p.id as assignee_id,
      p.full_name as assignee_name,
      p.email as assignee_email,
      p.role as assignee_role
    FROM public.tickets t
    LEFT JOIN public.profiles p ON t.assigned_to = p.id
    ${whereClause}
    ORDER BY t.created_at DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++};
  `;

  const dataParams = [...params, limitNum, offset];
  const dataRes = await query(dataSql, dataParams);

  const tickets = dataRes.rows.map(formatTicketResponse);

  return {
    tickets,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1
    }
  };
}

/**
 * 4. Update Ticket Status with Lifecycle State Machine Enforcement
 */
export async function updateTicketStatus(ticketNumber, newStatus, { performedBy = null, performedByName = 'Team Member' } = {}) {
  const currentTicket = await getTicketByNumber(ticketNumber);
  if (!currentTicket) {
    const err = new Error(`Ticket "${ticketNumber}" not found.`);
    err.statusCode = 404;
    throw err;
  }

  const normalizedStatus = newStatus.toUpperCase().trim();
  const currentStatus = currentTicket.status;

  if (currentStatus === normalizedStatus) {
    return currentTicket; // No-op idempotent
  }

  const allowedTransitions = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
  if (!allowedTransitions.includes(normalizedStatus)) {
    const err = new Error(
      `Invalid status transition: Cannot transition ticket from "${currentStatus}" to "${normalizedStatus}". Allowed transitions: ${allowedTransitions.join(', ') || 'None'}.`
    );
    err.statusCode = 422;
    throw err;
  }

  let resolvedAtSql = '';
  let closedAtSql = '';

  if (normalizedStatus === 'RESOLVED') {
    resolvedAtSql = ', resolved_at = now()';
  } else if (normalizedStatus === 'CLOSED') {
    closedAtSql = ', closed_at = now()';
  } else if (normalizedStatus === 'OPEN') {
    // If reopened, reset resolution timestamps
    resolvedAtSql = ', resolved_at = NULL';
    closedAtSql = ', closed_at = NULL';
  }

  const updateSql = `
    UPDATE public.tickets
    SET status = $1,
        updated_at = now()
        ${resolvedAtSql}
        ${closedAtSql}
    WHERE id = $2
    RETURNING *;
  `;

  await query(updateSql, [normalizedStatus, currentTicket.id]);

  // Record activity history
  const isReopened = currentStatus !== 'OPEN' && normalizedStatus === 'OPEN';
  const actionName = isReopened ? 'TICKET_REOPENED' : 'STATUS_CHANGED';

  await query(`
    INSERT INTO public.ticket_activities (
      ticket_id, action, from_value, to_value, performed_by, performed_by_name
    ) VALUES ($1, $2, $3, $4, $5, $6);
  `, [currentTicket.id, actionName, currentStatus, normalizedStatus, performedBy, performedByName]);

  const updatedTicket = await getTicketByNumber(currentTicket.id);

  // Dispatch webhook event
  const webhookEventType = normalizedStatus === 'RESOLVED' ? 'RESOLVED' :
                           normalizedStatus === 'CLOSED' ? 'CLOSED' :
                           isReopened ? 'REOPENED' : 'STATUS_CHANGED';

  dispatchWebhookEvent(webhookEventType, {
    ticketId: updatedTicket.id,
    ticketNumber: updatedTicket.ticketNumber,
    sourceReferenceId: updatedTicket.sourceReferenceId,
    previousStatus: currentStatus,
    newStatus: normalizedStatus,
    fromStatus: currentStatus,
    toStatus: normalizedStatus,
    updatedAt: updatedTicket.updatedAt,
    resolvedAt: updatedTicket.resolvedAt,
    closedAt: updatedTicket.closedAt,
    ticket: {
      id: updatedTicket.id,
      ticketNumber: updatedTicket.ticketNumber,
      sourceReferenceId: updatedTicket.sourceReferenceId,
      source: updatedTicket.source
    }
  }).catch(() => {});

  return updatedTicket;
}

/**
 * 5. Assign Ticket to Team Member
 */
export async function assignTicket(ticketNumber, assigneeProfileId, { performedBy = null, performedByName = 'Team Member' } = {}) {
  const currentTicket = await getTicketByNumber(ticketNumber);
  if (!currentTicket) {
    const err = new Error(`Ticket "${ticketNumber}" not found.`);
    err.statusCode = 404;
    throw err;
  }

  let assigneeProfile = null;
  if (assigneeProfileId) {
    const profileRes = await query(`
      SELECT id, full_name, email, role, is_active FROM public.profiles WHERE id = $1;
    `, [assigneeProfileId]);

    if (profileRes.rows.length === 0) {
      const err = new Error(`Assigned user ID "${assigneeProfileId}" does not correspond to a valid TeamSync user.`);
      err.statusCode = 400;
      throw err;
    }
    assigneeProfile = profileRes.rows[0];
  }

  await query(`
    UPDATE public.tickets
    SET assigned_to = $1,
        updated_at = now()
    WHERE id = $2;
  `, [assigneeProfileId || null, currentTicket.id]);

  await query(`
    INSERT INTO public.ticket_activities (
      ticket_id, action, from_value, to_value, performed_by, performed_by_name
    ) VALUES ($1, 'ASSIGNED', $2, $3, $4, $5);
  `, [
    currentTicket.id,
    currentTicket.assignee?.fullName || 'Unassigned',
    assigneeProfile ? assigneeProfile.full_name : 'Unassigned',
    performedBy,
    performedByName
  ]);

  const updatedTicket = await getTicketByNumber(currentTicket.id);

  dispatchWebhookEvent('ASSIGNED', {
    ticketId: updatedTicket.id,
    ticketNumber: updatedTicket.ticketNumber,
    sourceReferenceId: updatedTicket.sourceReferenceId,
    assignedTo: updatedTicket.assignee,
    assignee: updatedTicket.assignee ? {
      id: updatedTicket.assignee.id,
      name: updatedTicket.assignee.fullName,
      email: updatedTicket.assignee.email,
      role: updatedTicket.assignee.role
    } : null,
    ticket: {
      id: updatedTicket.id,
      ticketNumber: updatedTicket.ticketNumber,
      sourceReferenceId: updatedTicket.sourceReferenceId,
      source: updatedTicket.source
    }
  }).catch(() => {});

  return updatedTicket;
}

/**
 * 6. Update Ticket Priority
 */
export async function updateTicketPriority(ticketNumber, newPriority, { performedBy = null, performedByName = 'Team Member' } = {}) {
  const currentTicket = await getTicketByNumber(ticketNumber);
  if (!currentTicket) {
    const err = new Error(`Ticket "${ticketNumber}" not found.`);
    err.statusCode = 404;
    throw err;
  }

  let normalized = newPriority.toUpperCase().trim();
  if (normalized === 'URGENT') normalized = 'CRITICAL';
  if (normalized === 'NORMAL') normalized = 'MEDIUM';

  if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(normalized)) {
    const err = new Error(`Invalid priority "${newPriority}". Allowed: LOW, MEDIUM, HIGH, CRITICAL.`);
    err.statusCode = 400;
    throw err;
  }

  await query(`
    UPDATE public.tickets
    SET priority = $1,
        updated_at = now()
    WHERE id = $2;
  `, [normalized, currentTicket.id]);

  await query(`
    INSERT INTO public.ticket_activities (
      ticket_id, action, from_value, to_value, performed_by, performed_by_name
    ) VALUES ($1, 'PRIORITY_CHANGED', $2, $3, $4, $5);
  `, [currentTicket.id, currentTicket.priority, normalized, performedBy, performedByName]);

  const updatedTicket = await getTicketByNumber(currentTicket.id);

  dispatchWebhookEvent('PRIORITY_CHANGED', {
    ticketId: updatedTicket.id,
    ticketNumber: updatedTicket.ticketNumber,
    sourceReferenceId: updatedTicket.sourceReferenceId,
    previousPriority: currentTicket.priority,
    newPriority: normalized,
    priority: normalized,
    ticket: {
      id: updatedTicket.id,
      ticketNumber: updatedTicket.ticketNumber,
      sourceReferenceId: updatedTicket.sourceReferenceId,
      source: updatedTicket.source
    }
  }).catch(() => {});

  return updatedTicket;
}

/**
 * 7. Add Comment to Ticket
 */
export async function addTicketComment(ticketNumber, { comment, authorId = null, authorName = 'Team Member', authorRole = null, authorEmail = null, origin = null }) {
  const currentTicket = await getTicketByNumber(ticketNumber);
  if (!currentTicket) {
    const err = new Error(`Ticket "${ticketNumber}" not found.`);
    err.statusCode = 404;
    throw err;
  }

  if (!comment || typeof comment !== 'string' || comment.trim().length === 0) {
    const err = new Error('Comment text cannot be empty.');
    err.statusCode = 400;
    throw err;
  }

  const insertRes = await query(`
    INSERT INTO public.ticket_comments (
      ticket_id, author_id, author_name, author_role, comment
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `, [currentTicket.id, authorId, authorName, authorRole, comment.trim()]);

  await query(`
    INSERT INTO public.ticket_activities (
      ticket_id, action, from_value, to_value, performed_by, performed_by_name
    ) VALUES ($1, 'COMMENT_ADDED', NULL, $2, $3, $4);
  `, [currentTicket.id, comment.trim().substring(0, 100), authorId, authorName]);

  // Dispatch webhook event ONLY if comment was created by TeamSync staff (prevent infinite echo loop)
  const isKalviLearnOrigin = origin === 'KALVILEARN' || 
    ['STUDENT', 'MENTOR', 'CAMPUS_MANAGER'].includes(authorRole) ||
    authorName.toLowerCase().includes('kalvilearn');

  if (!isKalviLearnOrigin) {
    dispatchWebhookEvent('COMMENT_CREATED', {
      ticketId: currentTicket.id,
      ticketNumber: currentTicket.ticketNumber,
      sourceReferenceId: currentTicket.sourceReferenceId,
      comment: {
        id: insertRes.rows[0].id,
        authorName: authorName,
        authorEmail: authorEmail || 'staff@teamsync.io',
        authorRole: authorRole || 'ENGINEER',
        content: comment.trim(),
        createdAt: insertRes.rows[0].created_at
      },
      ticket: {
        id: currentTicket.id,
        ticketNumber: currentTicket.ticketNumber,
        sourceReferenceId: currentTicket.sourceReferenceId,
        source: currentTicket.source
      }
    }).catch(() => {});
  }

  return insertRes.rows[0];
}

/**
 * 8. Add Attachment to Ticket
 */
export async function addTicketAttachment(ticketNumber, { fileName, fileUrl, fileType = 'application/octet-stream', fileSize = 0, uploadedBy = null, uploadedByName = 'Team Member' }) {
  const currentTicket = await getTicketByNumber(ticketNumber);
  if (!currentTicket) {
    const err = new Error(`Ticket "${ticketNumber}" not found.`);
    err.statusCode = 404;
    throw err;
  }

  const insertRes = await query(`
    INSERT INTO public.ticket_attachments (
      ticket_id, file_name, file_url, file_type, file_size, uploaded_by
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `, [currentTicket.id, fileName, fileUrl, fileType, fileSize, uploadedBy]);

  await query(`
    INSERT INTO public.ticket_activities (
      ticket_id, action, from_value, to_value, performed_by, performed_by_name
    ) VALUES ($1, 'ATTACHMENT_ADDED', NULL, $2, $3, $4);
  `, [currentTicket.id, fileName, uploadedBy, uploadedByName]);

  return insertRes.rows[0];
}

/**
 * 9. Update Ticket Labels
 */
export async function updateTicketLabels(ticketNumber, labels, { performedBy = null, performedByName = 'Team Member' } = {}) {
  const currentTicket = await getTicketByNumber(ticketNumber);
  if (!currentTicket) {
    const err = new Error(`Ticket "${ticketNumber}" not found.`);
    err.statusCode = 404;
    throw err;
  }

  const cleanLabels = Array.from(new Set(labels.map(l => String(l).trim().toLowerCase()).filter(Boolean)));

  await query(`
    UPDATE public.tickets
    SET labels = $1::jsonb,
        updated_at = now()
    WHERE id = $2;
  `, [JSON.stringify(cleanLabels), currentTicket.id]);

  await query(`
    INSERT INTO public.ticket_activities (
      ticket_id, action, from_value, to_value, performed_by, performed_by_name
    ) VALUES ($1, 'LABELS_UPDATED', $2, $3, $4, $5);
  `, [
    currentTicket.id,
    currentTicket.labels.join(', ') || 'none',
    cleanLabels.join(', ') || 'none',
    performedBy,
    performedByName
  ]);

  return await getTicketByNumber(currentTicket.id);
}

/**
 * 10. Real Database Live Statistics Aggregation
 */
export async function getTicketStats() {
  const sql = `
    SELECT 
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'OPEN') AS open,
      COUNT(*) FILTER (WHERE status = 'TRIAGED') AS triaged,
      COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') AS in_progress,
      COUNT(*) FILTER (WHERE status = 'BLOCKED') AS blocked,
      COUNT(*) FILTER (WHERE status = 'RESOLVED') AS resolved,
      COUNT(*) FILTER (WHERE status = 'CLOSED') AS closed,
      COUNT(*) FILTER (WHERE status = 'REJECTED') AS rejected,
      COUNT(*) FILTER (WHERE priority = 'CRITICAL' AND status NOT IN ('RESOLVED', 'CLOSED', 'REJECTED')) AS critical,
      COUNT(*) FILTER (WHERE type = 'BUG') AS bugs,
      COUNT(*) FILTER (WHERE type = 'FEATURE') AS features,
      COUNT(*) FILTER (WHERE type = 'FEEDBACK') AS feedback,
      COUNT(*) FILTER (WHERE type = 'ISSUE') AS issues,
      COUNT(*) FILTER (WHERE type = 'IMPROVEMENT') AS improvements,
      COUNT(*) FILTER (WHERE type = 'OTHER') AS other
    FROM public.tickets;
  `;

  const res = await query(sql);
  const row = res.rows[0];

  return {
    total: parseInt(row.total || '0', 10),
    open: parseInt(row.open || '0', 10),
    triaged: parseInt(row.triaged || '0', 10),
    inProgress: parseInt(row.in_progress || '0', 10),
    blocked: parseInt(row.blocked || '0', 10),
    resolved: parseInt(row.resolved || '0', 10),
    closed: parseInt(row.closed || '0', 10),
    rejected: parseInt(row.rejected || '0', 10),
    critical: parseInt(row.critical || '0', 10),
    byType: {
      BUG: parseInt(row.bugs || '0', 10),
      FEATURE: parseInt(row.features || '0', 10),
      FEEDBACK: parseInt(row.feedback || '0', 10),
      ISSUE: parseInt(row.issues || '0', 10),
      IMPROVEMENT: parseInt(row.improvements || '0', 10),
      OTHER: parseInt(row.other || '0', 10)
    }
  };
}

export default {
  createTicket,
  getTicketByNumber,
  listTickets,
  updateTicketStatus,
  assignTicket,
  updateTicketPriority,
  addTicketComment,
  addTicketAttachment,
  updateTicketLabels,
  getTicketStats,
  ALLOWED_STATUS_TRANSITIONS
};
