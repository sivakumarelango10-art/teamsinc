import express from 'express';
import { requireUserAuth } from '../middleware/auth.js';
import attendanceService from '../services/attendanceService.js';

const router = express.Router();

// All attendance routes require an authenticated user session
router.use(requireUserAuth);

/**
 * 1. GET /api/v1/attendance/meetings/:meetingId
 * Retrieves the full participant roster and live statistics for a weekly meeting occurrence.
 * Accessible to Founder / Admin.
 */
router.get('/meetings/:meetingId', async (req, res, next) => {
  try {
    const data = await attendanceService.getMeetingAttendance(req.params.meetingId, req.user);
    res.status(200).json({
      success: true,
      ...data
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 2. POST /api/v1/attendance/meetings/:meetingId/mark
 * Marks or modifies attendance records for members in a weekly meeting.
 * Supports individual and bulk updates with audit history recording.
 * Accessible to Founder / Admin.
 */
router.post('/meetings/:meetingId/mark', async (req, res, next) => {
  try {
    const { records } = req.body;
    if (!records || !Array.isArray(records)) {
      return res.status(400).json({
        success: false,
        error: 'Request body must contain an array of attendance records.'
      });
    }

    const result = await attendanceService.markAttendance(req.params.meetingId, records, req.user);
    res.status(200).json({
      success: true,
      message: 'Attendance recorded successfully.',
      ...result
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 3. GET /api/v1/attendance/my-attendance
 * Retrieves the authenticated member's personal weekly meeting attendance history and statistics.
 * Accessible to ANY authenticated member.
 */
router.get('/my-attendance', async (req, res, next) => {
  try {
    const data = await attendanceService.getUserAttendanceHistory(req.user.id);
    res.status(200).json({
      success: true,
      ...data
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 4. GET /api/v1/attendance/reports
 * Aggregates organization-wide weekly meeting attendance reports and comparisons.
 * Accessible to Founder / Admin.
 */
router.get('/reports', async (req, res, next) => {
  try {
    const reports = await attendanceService.getAttendanceReports(req.query, req.user);
    res.status(200).json({
      success: true,
      ...reports
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 5. GET /api/v1/attendance/export
 * Exports attendance records as a downloadable CSV.
 * Accessible to Founder / Admin.
 */
router.get('/export', async (req, res, next) => {
  try {
    const csvData = await attendanceService.exportAttendanceCsv(req.query, req.user);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="teamsync-weekly-attendance-${Date.now()}.csv"`);
    res.status(200).send(csvData);
  } catch (err) {
    next(err);
  }
});

export default router;

