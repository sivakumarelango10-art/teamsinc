import express from 'express';
import { requireUserAuth, requireAdminOrFounder } from '../middleware/auth.js';
import { query } from '../db.js';

const router = express.Router();
const FOUNDER_EMAIL = 'sivakumarelango10@gmail.com';
const VALID_ROLES = ['FOUNDER', 'ADMIN', 'MEMBER', 'FOUNDING_ADVISOR'];

// Apply authentication to all user routes
router.use(requireUserAuth);

/**
 * 1. View User Directory
 * GET /api/v1/users
 * Allowed for: Administrator, Member, Founder
 */
router.get('/', async (req, res, next) => {
  try {
    const { q, role, status, page = 1, limit = 50 } = req.query;

    let sql = `
      SELECT id, full_name, email, role, is_active, avatar_url, created_at, updated_at
      FROM public.profiles
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    // Search query filter (name or email)
    if (q && typeof q === 'string' && q.trim()) {
      sql += ` AND (LOWER(full_name) LIKE $${paramIndex} OR LOWER(email) LIKE $${paramIndex})`;
      params.push(`%${q.trim().toLowerCase()}%`);
      paramIndex++;
    }

    // Role filter
    if (role && role !== 'ALL' && VALID_ROLES.includes(role.toUpperCase())) {
      sql += ` AND role = $${paramIndex}`;
      params.push(role.toUpperCase());
      paramIndex++;
    }

    // Status filter
    if (status && status !== 'ALL') {
      if (status.toUpperCase() === 'ACTIVE') {
        sql += ` AND is_active = true`;
      } else if (status.toUpperCase() === 'DEACTIVATED') {
        sql += ` AND is_active = false`;
      }
    }

    // Order by Founder first, then Admins, then full_name
    sql += ` ORDER BY CASE WHEN role = 'FOUNDER' THEN 1 WHEN role = 'ADMIN' THEN 2 WHEN role = 'FOUNDING_ADVISOR' THEN 3 ELSE 4 END, full_name ASC`;

    // Pagination
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const offset = (pageNum - 1) * limitNum;

    // Get total count
    const countSql = `SELECT COUNT(*) as total FROM (${sql}) as filtered_users`;
    const countRes = await query(countSql, params);
    const total = parseInt(countRes.rows[0]?.total || 0, 10);

    sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limitNum, offset);

    const result = await query(sql, params);

    return res.status(200).json({
      success: true,
      data: result.rows,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 2. Get Single User Details
 * GET /api/v1/users/:id
 * Allowed for: Administrator, Member, Founder
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT id, full_name, email, role, is_active, avatar_url, created_at, updated_at
       FROM public.profiles
       WHERE id = $1 LIMIT 1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found.'
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 3. Add New User
 * POST /api/v1/users
 * Allowed for: Administrator, Founder
 * Denied for: Member (HTTP 403 Forbidden)
 */
router.post('/', requireAdminOrFounder, async (req, res, next) => {
  try {
    const { full_name, email, role = 'MEMBER', is_active = true } = req.body;

    if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
      return res.status(400).json({ success: false, error: 'Full name is required.' });
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'A valid email address is required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const assignedRole = role ? role.toUpperCase() : 'MEMBER';

    if (!VALID_ROLES.includes(assignedRole)) {
      return res.status(400).json({ success: false, error: `Invalid role "${role}".` });
    }

    if (assignedRole === 'FOUNDER' && cleanEmail !== FOUNDER_EMAIL) {
      return res.status(403).json({ success: false, error: 'Cannot create an additional Founder account.' });
    }

    // Check duplicate
    const existing = await query('SELECT id FROM public.profiles WHERE LOWER(email) = LOWER($1)', [cleanEmail]);
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: `A user with email "${cleanEmail}" already exists.`
      });
    }

    const insertResult = await query(
      `INSERT INTO public.profiles (full_name, email, role, is_active)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, email, role, is_active, avatar_url, created_at, updated_at`,
      [full_name.trim(), cleanEmail, assignedRole, Boolean(is_active)]
    );

    return res.status(201).json({
      success: true,
      data: insertResult.rows[0],
      message: `User ${full_name} created successfully.`
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 4. Edit User Details
 * PATCH /api/v1/users/:id
 * Allowed for: Administrator, Founder
 * Denied for: Member (HTTP 403 Forbidden)
 */
router.patch('/:id', requireAdminOrFounder, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { full_name, email, role, is_active } = req.body;

    // Check if target exists
    const checkRes = await query('SELECT id, email, role, is_active FROM public.profiles WHERE id = $1', [id]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const targetUser = checkRes.rows[0];
    const isTargetFounder = targetUser.email.toLowerCase() === FOUNDER_EMAIL;

    // Protection: Founder cannot have role changed or account deactivated
    if (isTargetFounder) {
      if (role && role !== 'FOUNDER') {
        return res.status(403).json({ success: false, error: 'The primary Founder role cannot be modified.' });
      }
      if (is_active === false) {
        return res.status(403).json({ success: false, error: 'The primary Founder account cannot be deactivated.' });
      }
    }

    const updates = [];
    const params = [id];
    let pIdx = 2;

    if (full_name !== undefined && typeof full_name === 'string') {
      updates.push(`full_name = $${pIdx}`);
      params.push(full_name.trim());
      pIdx++;
    }

    if (role !== undefined && VALID_ROLES.includes(role.toUpperCase())) {
      if (role.toUpperCase() === 'FOUNDER' && !isTargetFounder) {
        return res.status(403).json({ success: false, error: 'Cannot elevate user to Founder.' });
      }
      updates.push(`role = $${pIdx}`);
      params.push(role.toUpperCase());
      pIdx++;
    }

    if (is_active !== undefined) {
      updates.push(`is_active = $${pIdx}`);
      params.push(Boolean(is_active));
      pIdx++;
    }

    updates.push(`updated_at = now()`);

    const updateSql = `
      UPDATE public.profiles
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING id, full_name, email, role, is_active, avatar_url, created_at, updated_at
    `;

    const updateRes = await query(updateSql, params);

    return res.status(200).json({
      success: true,
      data: updateRes.rows[0],
      message: 'User details updated successfully.'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 5. Change Role
 * PUT /api/v1/users/:id/role (or PATCH /api/v1/users/:id/role)
 * Allowed for: Administrator, Founder
 * Denied for: Member (HTTP 403 Forbidden)
 */
const handleRoleChange = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role || !VALID_ROLES.includes(role.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid role provided. Must be one of: ${VALID_ROLES.filter(r => r !== 'FOUNDER').join(', ')}.`
      });
    }

    const checkRes = await query('SELECT id, email, role FROM public.profiles WHERE id = $1', [id]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const targetUser = checkRes.rows[0];
    if (targetUser.email.toLowerCase() === FOUNDER_EMAIL) {
      return res.status(403).json({ success: false, error: 'The primary Founder role cannot be modified.' });
    }

    if (role.toUpperCase() === 'FOUNDER') {
      return res.status(403).json({ success: false, error: 'Cannot elevate user to Founder.' });
    }

    const updateRes = await query(
      `UPDATE public.profiles
       SET role = $1, updated_at = now()
       WHERE id = $2
       RETURNING id, full_name, email, role, is_active, avatar_url, created_at, updated_at`,
      [role.toUpperCase(), id]
    );

    return res.status(200).json({
      success: true,
      data: updateRes.rows[0],
      message: `Role changed to ${role.toUpperCase()} successfully.`
    });
  } catch (err) {
    next(err);
  }
};
router.put('/:id/role', requireAdminOrFounder, handleRoleChange);
router.patch('/:id/role', requireAdminOrFounder, handleRoleChange);

/**
 * 6. Change Account Status (Activate / Deactivate)
 * PATCH /api/v1/users/:id/status (or PUT /api/v1/users/:id/status)
 * Allowed for: Administrator, Founder
 * Denied for: Member (HTTP 403 Forbidden)
 */
const handleStatusChange = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    if (is_active === undefined) {
      return res.status(400).json({ success: false, error: 'is_active boolean field is required.' });
    }

    const checkRes = await query('SELECT id, email, is_active FROM public.profiles WHERE id = $1', [id]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const targetUser = checkRes.rows[0];
    if (targetUser.email.toLowerCase() === FOUNDER_EMAIL && !is_active) {
      return res.status(403).json({ success: false, error: 'The primary Founder account cannot be deactivated.' });
    }

    const updateRes = await query(
      `UPDATE public.profiles
       SET is_active = $1, updated_at = now()
       WHERE id = $2
       RETURNING id, full_name, email, role, is_active, avatar_url, created_at, updated_at`,
      [Boolean(is_active), id]
    );

    return res.status(200).json({
      success: true,
      data: updateRes.rows[0],
      message: `User status changed to ${is_active ? 'active' : 'deactivated'}.`
    });
  } catch (err) {
    next(err);
  }
};
router.patch('/:id/status', requireAdminOrFounder, handleStatusChange);
router.put('/:id/status', requireAdminOrFounder, handleStatusChange);

/**
 * 7. Delete User
 * DELETE /api/v1/users/:id
 * Allowed for: Administrator, Founder
 * Denied for: Member (HTTP 403 Forbidden)
 */
router.delete('/:id', requireAdminOrFounder, async (req, res, next) => {
  try {
    const { id } = req.params;

    const checkRes = await query('SELECT id, email, full_name FROM public.profiles WHERE id = $1', [id]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const targetUser = checkRes.rows[0];
    if (targetUser.email.toLowerCase() === FOUNDER_EMAIL) {
      return res.status(403).json({ success: false, error: 'The primary Founder account cannot be deleted.' });
    }

    await query('DELETE FROM public.profiles WHERE id = $1', [id]);

    return res.status(200).json({
      success: true,
      message: `User ${targetUser.full_name} deleted successfully.`
    });
  } catch (err) {
    next(err);
  }
});

export default router;
