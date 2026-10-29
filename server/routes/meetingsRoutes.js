import express from 'express';
import { requireUserAuth } from '../middleware/auth.js';
import meetingService from '../services/meetingService.js';

const router = express.Router();
const FOUNDER_EMAIL = 'sivakumarelango10@gmail.com';

/**
 * Authorization guard: Restricts meeting creation, modification, cancellation, and deletion
 * to Founder, Administrator, or Founder email account.
 */
function requireFounderOrAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Authentication required.'
    });
  }

  const role = req.user.role;
  const isAuthorized = role === 'FOUNDER' || role === 'ADMIN' || req.user.email?.toLowerCase() === FOUNDER_EMAIL;

  if (!isAuthorized) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Only the Founder and authorized leadership can schedule, update, cancel, or delete meetings.'
    });
  }

  next();
}

// All meeting endpoints require a valid authenticated session
router.use(requireUserAuth);

/**
 * 1. GET /api/v1/meetings/stats
 * Aggregates live meeting statistics (Total, Today, Upcoming, Starting Soon, Live, Completed, Cancelled)
 * and retrieves the next scheduled meeting with live countdown information.
 */
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await meetingService.getMeetingStats(req.user);
    res.status(200).json({
      success: true,
      stats
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 2. GET /api/v1/meetings/overlap
 * Checks whether the proposed start and end times collide with any existing active Founder meeting.
 */
router.get('/overlap', async (req, res, next) => {
  try {
    const { startTime, endTime, excludeId } = req.query;
    if (!startTime || !endTime) {
      return res.status(400).json({
        success: false,
        error: 'Both startTime and endTime query parameters are required for overlap checking.'
      });
    }

    const overlap = await meetingService.checkMeetingOverlap(startTime, endTime, excludeId || null);
    res.status(200).json({
      success: true,
      hasOverlap: overlap.hasOverlap,
      conflicts: overlap.conflicts
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 3. GET /api/v1/meetings/notifications
 * Lists in-app meeting notifications for the current user.
 */
router.get('/notifications', async (req, res, next) => {
  try {
    const notifications = await meetingService.listUserMeetingNotifications(req.user);
    res.status(200).json({
      success: true,
      notifications
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 4. PATCH /api/v1/meetings/notifications/:id/read
 * Marks a notification as read.
 */
router.patch('/notifications/:id/read', async (req, res, next) => {
  try {
    const updated = await meetingService.markNotificationAsRead(req.params.id, req.user);
    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found or access denied.'
      });
    }
    res.status(200).json({
      success: true,
      notification: updated
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 5. GET /api/v1/meetings
 * Lists meetings with role-based filtering, search query, date ranges, department, and pagination.
 */
router.get('/', async (req, res, next) => {
  try {
    const result = await meetingService.listMeetings(req.query, req.user);
    res.status(200).json({
      success: true,
      meetings: result.meetings,
      pagination: result.pagination
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 6. GET /api/v1/meetings/:id
 * Retrieves a single meeting by its ID.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const meeting = await meetingService.getMeetingById(req.params.id, req.user);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        error: 'Meeting not found or you lack permission to view it.'
      });
    }
    res.status(200).json({
      success: true,
      meeting
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 7. POST /api/v1/meetings
 * Schedules a single meeting.
 * Founder or Admin only.
 */
router.post('/', requireFounderOrAdmin, async (req, res, next) => {
  try {
    const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey || null;
    const result = await meetingService.createMeeting(req.body, req.user, idempotencyKey);

    const status = result.isExisting ? 200 : 201;
    res.status(status).json({
      success: true,
      meeting: result.meeting,
      idempotent: !!result.isExisting
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 8. POST /api/v1/meetings/bulk
 * Schedules multiple meetings in one workflow (independent sessions or expanded recurring series).
 * Founder or Admin only.
 */
router.post('/bulk', requireFounderOrAdmin, async (req, res, next) => {
  try {
    const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey || null;
    const result = await meetingService.createMultipleSessions(req.body, req.user, idempotencyKey);

    res.status(201).json({
      success: true,
      series: result.series,
      meetings: result.meetings,
      count: result.count
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 9. PATCH /api/v1/meetings/:id
 * Updates meeting details, timing (reschedule), or link.
 * Founder or Admin only.
 */
router.patch('/:id', requireFounderOrAdmin, async (req, res, next) => {
  try {
    const updatedMeeting = await meetingService.updateMeeting(req.params.id, req.body, req.user);
    res.status(200).json({
      success: true,
      meeting: updatedMeeting
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 10. PATCH /api/v1/meetings/:id/cancel
 * Cancels a scheduled meeting with an optional reason.
 * Founder or Admin only.
 */
router.patch('/:id/cancel', requireFounderOrAdmin, async (req, res, next) => {
  try {
    const { reason } = req.body;
    const cancelled = await meetingService.cancelMeeting(req.params.id, reason, req.user);
    res.status(200).json({
      success: true,
      meeting: cancelled
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 11. DELETE /api/v1/meetings/:id
 * Permanently deletes a meeting.
 * Founder or Admin only.
 */
router.delete('/:id', requireFounderOrAdmin, async (req, res, next) => {
  try {
    const deleted = await meetingService.deleteMeeting(req.params.id, req.user);
    res.status(200).json({
      success: true,
      deletedMeetingId: deleted.id,
      message: 'Meeting permanently removed.'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 12. POST /api/v1/meetings/:id/respond
 * Submits or updates an RSVP response for a meeting invitation.
 * Open to any authenticated user invited or authorized to attend.
 */
router.post('/:id/respond', async (req, res, next) => {
  try {
    const { status, responseNote } = req.body;
    const participantRecord = await meetingService.respondToInvitation(req.params.id, req.user, status, responseNote);
    res.status(200).json({
      success: true,
      participant: participantRecord
    });
  } catch (err) {
    next(err);
  }
});

export default router;
