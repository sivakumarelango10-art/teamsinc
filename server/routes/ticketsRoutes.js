import express from 'express';
import { requireApiKey } from '../middleware/auth.js';
import { integrationRateLimiter } from '../middleware/rateLimiter.js';
import { validateFeedbackPayload } from '../middleware/validate.js';
import ticketService from '../services/ticketService.js';

const router = express.Router();

// Apply sliding-window rate limiting to all /api/v1/tickets routes
router.use(integrationRateLimiter.middleware());

/**
 * 1. Create Ticket
 * POST /api/v1/tickets
 */
router.post('/', requireApiKey, validateFeedbackPayload, async (req, res, next) => {
  try {
    const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey || null;

    const result = await ticketService.createTicket(req.body, idempotencyKey);

    const ticket = result.ticket;
    const responsePayload = {
      success: true,
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      source: ticket.source,
      sourceReferenceId: ticket.sourceReferenceId || ticket.externalReferenceId,
      externalReferenceId: ticket.externalReferenceId,
      type: ticket.type,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.createdAt,
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        source: ticket.source,
        sourceReferenceId: ticket.sourceReferenceId || ticket.externalReferenceId,
        externalReferenceId: ticket.externalReferenceId,
        type: ticket.type,
        status: ticket.status,
        priority: ticket.priority,
        createdAt: ticket.createdAt
      }
    };

    if (result.isExisting) {
      return res.status(200).json({
        ...responsePayload,
        idempotent: true,
        message: 'Ticket already exists for this external reference or idempotency key.'
      });
    }

    return res.status(201).json(responsePayload);
  } catch (err) {
    next(err);
  }
});

/**
 * 2. Query Single Ticket by TicketNumber (TS-XXXX), UUID id, or sourceReferenceId (FB-XXXX)
 * GET /api/v1/tickets/:identifier
 */
router.get('/:identifier', requireApiKey, async (req, res, next) => {
  try {
    const ticket = await ticketService.getTicketByNumber(req.params.identifier);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: `Ticket "${req.params.identifier}" not found.`
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
 * 3. List and Filter Tickets with Pagination and Search
 * GET /api/v1/tickets
 */
router.get('/', requireApiKey, async (req, res, next) => {
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
 * 4. Update Ticket Status (Lifecycle State Machine Enforced)
 * PATCH /api/v1/tickets/:identifier/status
 */
router.patch('/:identifier/status', requireApiKey, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status || typeof status !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Field "status" is required.'
      });
    }

    const updated = await ticketService.updateTicketStatus(req.params.identifier, status, {
      performedByName: req.body.performedByName || 'TeamSync API'
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
 * PATCH /api/v1/tickets/:identifier/assign
 */
router.patch('/:identifier/assign', requireApiKey, async (req, res, next) => {
  try {
    const { assignedTo } = req.body;
    const updated = await ticketService.assignTicket(req.params.identifier, assignedTo, {
      performedByName: req.body.performedByName || 'TeamSync API'
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
 * PATCH /api/v1/tickets/:identifier/priority
 */
router.patch('/:identifier/priority', requireApiKey, async (req, res, next) => {
  try {
    const { priority } = req.body;
    if (!priority) {
      return res.status(400).json({ success: false, error: 'Field "priority" is required.' });
    }

    const updated = await ticketService.updateTicketPriority(req.params.identifier, priority, {
      performedByName: req.body.performedByName || 'TeamSync API'
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
 * POST /api/v1/tickets/:identifier/comments
 */
router.post('/:identifier/comments', requireApiKey, async (req, res, next) => {
  try {
    const commentText = req.body.comment || req.body.content || req.body.text;
    const authorObj = req.body.author || {};
    const authorName = req.body.authorName || authorObj.name || 'Team Member';
    const authorRole = req.body.authorRole || authorObj.role || null;
    const authorId = req.body.authorId || authorObj.id || null;
    const authorEmail = req.body.authorEmail || authorObj.email || null;
    const origin = req.body.origin || (req.authenticatedClient?.source || 'API');

    const result = await ticketService.addTicketComment(req.params.identifier, {
      comment: commentText,
      authorName,
      authorRole,
      authorId,
      authorEmail,
      origin
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
 * GET /api/v1/tickets/meta/stats
 */
router.get('/meta/stats', requireApiKey, async (req, res, next) => {
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

export default router;
