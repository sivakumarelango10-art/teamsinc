import express from 'express';
import { requireApiKey } from '../middleware/auth.js';
import { integrationRateLimiter, exportRateLimiter } from '../middleware/rateLimiter.js';
import { validateFeedbackPayload } from '../middleware/validate.js';
import ticketService from '../services/ticketService.js';
import { verifyWebhookSignature } from '../services/webhookService.js';
import { deleteTicket } from '../services/ticketService.js';
import { exportIntegrationData } from '../services/exportService.js';
import fs from 'fs';

const router = express.Router();

// Apply rate limiter to all integration routes
router.use(integrationRateLimiter.middleware());

/**
 * 1. Create Feedback / Ticket from KalviLearn
 * POST /api/v1/integrations/kalvilearn/feedback
 */
router.post('/feedback', requireApiKey, validateFeedbackPayload, async (req, res, next) => {
  try {
    const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey || null;

    const result = await ticketService.createTicket(req.body, idempotencyKey);

    if (result.isExisting) {
      return res.status(200).json({
        success: true,
        idempotent: true,
        message: 'Ticket already exists for this external reference or idempotency key.',
        ticket: {
          id: result.ticket.id,
          ticketNumber: result.ticket.ticketNumber,
          source: result.ticket.source,
          externalReferenceId: result.ticket.externalReferenceId,
          type: result.ticket.type,
          status: result.ticket.status,
          priority: result.ticket.priority,
          createdAt: result.ticket.createdAt
        }
      });
    }

    return res.status(201).json({
      success: true,
      ticket: {
        id: result.ticket.id,
        ticketNumber: result.ticket.ticketNumber,
        source: result.ticket.source,
        externalReferenceId: result.ticket.externalReferenceId,
        type: result.ticket.type,
        status: result.ticket.status,
        priority: result.ticket.priority,
        createdAt: result.ticket.createdAt
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 2. Query Single Ticket by TicketNumber / ID / ExternalRef
 * GET /api/v1/integrations/kalvilearn/tickets/:ticketNumber
 */
router.get('/tickets/:ticketNumber', requireApiKey, async (req, res, next) => {
  try {
    const ticket = await ticketService.getTicketByNumber(req.params.ticketNumber);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: `Ticket "${req.params.ticketNumber}" not found.`
      });
    }

    return res.status(200).json({
      success: true,
      ticket
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 3. List and Filter Tickets with Pagination
 * GET /api/v1/integrations/kalvilearn/tickets
 */
router.get('/tickets', requireApiKey, async (req, res, next) => {
  try {
    const result = await ticketService.listTickets(req.query);
    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 4. Update Ticket Status (State Machine Enforced)
 * PATCH /api/v1/integrations/kalvilearn/tickets/:ticketNumber/status
 */
router.patch('/tickets/:ticketNumber/status', requireApiKey, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status || typeof status !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Field "status" is required.'
      });
    }

    const updated = await ticketService.updateTicketStatus(req.params.ticketNumber, status, {
      performedByName: req.body.performedByName || 'KalviLearn API'
    });

    return res.status(200).json({
      success: true,
      ticket: updated
    });
  } catch (err) {
    if (err.statusCode === 422) {
      return res.status(422).json({
        success: false,
        error: err.message
      });
    }
    if (err.statusCode === 404) {
      return res.status(404).json({
        success: false,
        error: err.message
      });
    }
    next(err);
  }
});

/**
 * 5. Assign Ticket to Team Member
 * PATCH /api/v1/integrations/kalvilearn/tickets/:ticketNumber/assign
 */
router.patch('/tickets/:ticketNumber/assign', requireApiKey, async (req, res, next) => {
  try {
    const { assignedTo } = req.body;
    const updated = await ticketService.assignTicket(req.params.ticketNumber, assignedTo, {
      performedByName: req.body.performedByName || 'KalviLearn API'
    });

    return res.status(200).json({
      success: true,
      ticket: updated
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    next(err);
  }
});

/**
 * 6. Update Ticket Priority
 * PATCH /api/v1/integrations/kalvilearn/tickets/:ticketNumber/priority
 */
router.patch('/tickets/:ticketNumber/priority', requireApiKey, async (req, res, next) => {
  try {
    const { priority } = req.body;
    if (!priority) {
      return res.status(400).json({ success: false, error: 'Field "priority" is required.' });
    }

    const updated = await ticketService.updateTicketPriority(req.params.ticketNumber, priority, {
      performedByName: req.body.performedByName || 'KalviLearn API'
    });

    return res.status(200).json({
      success: true,
      ticket: updated
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    next(err);
  }
});

/**
 * 7. Add Comment to Ticket
 * POST /api/v1/integrations/kalvilearn/tickets/:ticketNumber/comments
 */
router.post('/tickets/:ticketNumber/comments', requireApiKey, async (req, res, next) => {
  try {
    const { comment, authorName, authorRole, authorId } = req.body;
    const result = await ticketService.addTicketComment(req.params.ticketNumber, {
      comment,
      authorName: authorName || 'KalviLearn User',
      authorRole: authorRole || null,
      authorId: authorId || null
    });

    return res.status(201).json({
      success: true,
      comment: result
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    next(err);
  }
});

/**
 * 8. Live Database Ticket Statistics
 * GET /api/v1/integrations/kalvilearn/stats
 */
router.get('/stats', requireApiKey, async (req, res, next) => {
  try {
    const stats = await ticketService.getTicketStats();
    return res.status(200).json({
      success: true,
      stats
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 9. Delete Ticket (Founder / Admin only — hard delete)
 * DELETE /api/v1/integrations/kalvilearn/tickets/:ticketNumber
 */
router.delete('/tickets/:ticketNumber', requireApiKey, async (req, res, next) => {
  try {
    // Only Founder and Admin are allowed to permanently delete reports
    const callerRole = req.authenticatedClient?.role || req.headers['x-teamsync-role'];
    const isWorkspace = req.headers['x-teamsync-source'] === 'WORKSPACE';
    const isAuthorized = isWorkspace || callerRole === 'FOUNDER' || callerRole === 'ADMIN';

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only Founders and Admins can permanently delete reports.'
      });
    }

    const performedByName = req.body?.performedByName || req.headers['x-performed-by'] || 'Admin';

    const result = await deleteTicket(req.params.ticketNumber, {
      performedByName
    });

    return res.status(200).json({
      success: true,
      deleted: true,
      ticketNumber: result.ticketNumber,
      id: result.id,
      message: `Report ${result.ticketNumber} has been permanently deleted.`
    });
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

/**
 * 10. Webhook Receiver Simulation / Test Endpoint
 * POST /api/v1/webhooks/kalvilearn/ticket-updated
 */
router.post('/webhook-simulation', async (req, res) => {
  let secret = process.env.KALVILEARN_WEBHOOK_SECRET;
  if (!secret && fs.existsSync('.env')) {
    const content = fs.readFileSync('.env', 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('KALVILEARN_WEBHOOK_SECRET=')) {
        secret = trimmed.replace(/^KALVILEARN_WEBHOOK_SECRET=/, '').replace(/^["']|["']$/g, '');
        break;
      }
    }
  }

  // No hardcoded fallback — missing secret is a server misconfiguration, not a valid default
  if (!secret) {
    return res.status(503).json({
      success: false,
      error: 'Service Misconfiguration: KALVILEARN_WEBHOOK_SECRET is not set. Contact the administrator.'
    });
  }

  const sig = req.headers['x-teamsync-signature'];
  const rawBody = JSON.stringify(req.body);

  const isValid = verifyWebhookSignature(rawBody, sig, secret);
  if (!isValid) {
    return res.status(401).json({
      success: false,
      error: 'Invalid webhook signature.'
    });
  }

  return res.status(200).json({
    success: true,
    message: 'Webhook received and verified successfully.',
    eventId: req.body.id,
    event: req.body.event
  });
});

/**
 * 11. Export Integration Data (PDF, DOCX, CSV)
 * POST /api/v1/integrations/kalvilearn/export
 * GET /api/v1/integrations/kalvilearn/export
 */
const handleExport = async (req, res, next) => {
  try {
    const format = req.body?.format || req.query?.format || 'pdf';
    const resource = req.body?.resource || req.query?.resource || 'tickets';
    const filters = req.body?.filters || {
      type: req.query?.type,
      status: req.query?.status,
      priority: req.query?.priority,
      portal: req.query?.portal,
      module: req.query?.module,
      assignedTo: req.query?.assignedTo,
      search: req.query?.search,
      createdFrom: req.query?.createdFrom,
      createdTo: req.query?.createdTo
    };

    const caller = {
      role: req.authenticatedClient?.role || req.headers['x-teamsync-role'] || 'MEMBER',
      userId: req.authenticatedClient?.userId || req.headers['x-teamsync-user-id'] || null,
      source: req.authenticatedClient?.source || req.headers['x-teamsync-source'] || 'WORKSPACE'
    };

    const result = await exportIntegrationData({ format, resource, filters, caller });

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('X-Export-Count', result.recordCount);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Export-Count');

    return res.status(200).send(result.buffer);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: err.message
      });
    }
    next(err);
  }
};

router.post('/export', exportRateLimiter.middleware(), requireApiKey, handleExport);
router.get('/export', exportRateLimiter.middleware(), requireApiKey, handleExport);

export default router;
