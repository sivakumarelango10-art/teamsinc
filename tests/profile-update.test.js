import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { query, pool } from '../server/db.js';
import crypto from 'node:crypto';

describe('TeamSync Profile Update, Avatar Upload, and Database RLS Verification Tests', () => {
  const TEST_USER_ID = crypto.randomUUID();
  const TEST_AUTH_ID = crypto.randomUUID();
  const TEST_EMAIL = `profile.test.${Date.now()}@kalvilearn.test`;

  const ANOTHER_USER_ID = crypto.randomUUID();
  const ANOTHER_AUTH_ID = crypto.randomUUID();
  const ANOTHER_EMAIL = `profile.another.${Date.now()}@kalvilearn.test`;

  before(async () => {
    // 1. Create a synthetic test user with role MEMBER
    await query(
      `INSERT INTO public.profiles (id, auth_user_id, email, full_name, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [TEST_USER_ID, TEST_AUTH_ID, TEST_EMAIL, 'Original Profile Name', 'MEMBER']
    );

    // 2. Create another synthetic user to test cross-user isolation
    await query(
      `INSERT INTO public.profiles (id, auth_user_id, email, full_name, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [ANOTHER_USER_ID, ANOTHER_AUTH_ID, ANOTHER_EMAIL, 'Another User', 'MEMBER']
    );
  });

  after(async () => {
    // Clean up test rows
    try {
      await query(`DELETE FROM public.profiles WHERE id IN ($1, $2)`, [TEST_USER_ID, ANOTHER_USER_ID]);
    } catch (e) {
      console.warn('Cleanup error:', e.message);
    }
  });

  describe('1. Database RLS & Cardinality Error Prevention', () => {
    it('Authenticated user can update their own full_name and avatar_url without subquery cardinality error', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE authenticated');
        await client.query(
          `SELECT set_config('request.jwt.claims', $1, true)`,
          [JSON.stringify({ sub: TEST_AUTH_ID, email: TEST_EMAIL, role: 'authenticated' })]
        );

        const newAvatar = `https://storage.example.test/avatars/${TEST_USER_ID}/avatar_12345.webp`;
        const res = await client.query(
          `UPDATE public.profiles 
           SET full_name = $1, avatar_url = $2, updated_at = NOW() 
           WHERE id = $3 
           RETURNING id, full_name, avatar_url, role`,
          ['Updated Test User Name', newAvatar, TEST_USER_ID]
        );

        assert.strictEqual(res.rowCount, 1, 'Should update exactly 1 row');
        assert.strictEqual(res.rows[0].full_name, 'Updated Test User Name');
        assert.strictEqual(res.rows[0].avatar_url, newAvatar);
        assert.strictEqual(res.rows[0].role, 'MEMBER');

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    });

    it('Cross-user modification is blocked by RLS (updating another user profile updates 0 rows)', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE authenticated');
        // Authenticated as TEST_USER, trying to update ANOTHER_USER
        await client.query(
          `SELECT set_config('request.jwt.claims', $1, true)`,
          [JSON.stringify({ sub: TEST_AUTH_ID, email: TEST_EMAIL, role: 'authenticated' })]
        );

        const res = await client.query(
          `UPDATE public.profiles 
           SET full_name = $1 
           WHERE id = $2 
           RETURNING id`,
          ['Hacked Name', ANOTHER_USER_ID]
        );

        assert.strictEqual(res.rowCount, 0, 'RLS must prevent updating another user profile');
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });

    it('Trigger trg_protect_profile_immutable_fields prevents standard members from changing their role', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE authenticated');
        await client.query(
          `SELECT set_config('request.jwt.claims', $1, true)`,
          [JSON.stringify({ sub: TEST_AUTH_ID, email: TEST_EMAIL, role: 'authenticated' })]
        );

        let threwError = false;
        try {
          await client.query(
            `UPDATE public.profiles 
             SET role = 'ADMIN' 
             WHERE id = $1`,
            [TEST_USER_ID]
          );
        } catch (err) {
          threwError = true;
          assert.match(err.message, /cannot modify your own assigned role/i);
        }
        assert.strictEqual(threwError, true, 'Trigger must reject role escalation');
      } finally {
        await client.query('ROLLBACK').catch(() => {});
        client.release();
      }
    });

    it('Trigger trg_protect_profile_immutable_fields prevents changing email address', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE authenticated');
        await client.query(
          `SELECT set_config('request.jwt.claims', $1, true)`,
          [JSON.stringify({ sub: TEST_AUTH_ID, email: TEST_EMAIL, role: 'authenticated' })]
        );

        let threwError = false;
        try {
          await client.query(
            `UPDATE public.profiles 
             SET email = 'hacked@kalvilearn.test' 
             WHERE id = $1`,
            [TEST_USER_ID]
          );
        } catch (err) {
          threwError = true;
          assert.match(err.message, /Email address cannot be modified/i);
        }
        assert.strictEqual(threwError, true, 'Trigger must reject email modification');
      } finally {
        await client.query('ROLLBACK').catch(() => {});
        client.release();
      }
    });

    it('Trigger trg_protect_profile_immutable_fields prevents changing account status (is_active)', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE authenticated');
        await client.query(
          `SELECT set_config('request.jwt.claims', $1, true)`,
          [JSON.stringify({ sub: TEST_AUTH_ID, email: TEST_EMAIL, role: 'authenticated' })]
        );

        let threwError = false;
        try {
          await client.query(
            `UPDATE public.profiles 
             SET is_active = false 
             WHERE id = $1`,
            [TEST_USER_ID]
          );
        } catch (err) {
          threwError = true;
          assert.match(err.message, /cannot modify your own account status/i);
        }
        assert.strictEqual(threwError, true, 'Trigger must reject is_active modification');
      } finally {
        await client.query('ROLLBACK').catch(() => {});
        client.release();
      }
    });
  });

  describe('2. Display Name Validation Rules', () => {
    function validateDisplayName(name) {
      if (!name || typeof name !== 'string') return { valid: false, error: 'Display name is required.' };
      const trimmed = name.trim();
      if (trimmed.length < 2) return { valid: false, error: 'Display name must be at least 2 characters.' };
      if (trimmed.length > 60) return { valid: false, error: 'Display name cannot exceed 60 characters.' };
      return { valid: true, value: trimmed };
    }

    it('Accepts valid display names with whitespace trimmed', () => {
      const res = validateDisplayName('  Elango S  ');
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.value, 'Elango S');
    });

    it('Rejects empty or purely whitespace names', () => {
      assert.strictEqual(validateDisplayName('').valid, false);
      assert.strictEqual(validateDisplayName('   ').valid, false);
      assert.strictEqual(validateDisplayName(null).valid, false);
    });

    it('Rejects names shorter than 2 characters', () => {
      const res = validateDisplayName('A');
      assert.strictEqual(res.valid, false);
      assert.match(res.error, /at least 2 characters/i);
    });

    it('Rejects names longer than 60 characters', () => {
      const longName = 'A'.repeat(65);
      const res = validateDisplayName(longName);
      assert.strictEqual(res.valid, false);
      assert.match(res.error, /cannot exceed 60 characters/i);
    });
  });

  describe('3. Avatar File Upload & MIME Validation Rules', () => {
    const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

    function validateAvatarFile(file) {
      if (!file) return { valid: false, error: 'No file provided.' };
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        return { valid: false, error: 'Please select a valid image file (JPEG, PNG, or WebP).' };
      }
      if (file.size > MAX_FILE_SIZE) {
        return { valid: false, error: 'Image size exceeds 5MB limit. Please choose a smaller photo.' };
      }
      return { valid: true };
    }

    it('Accepts JPEG, PNG, and WebP files under 5MB', () => {
      assert.strictEqual(validateAvatarFile({ type: 'image/jpeg', size: 1024 * 500 }).valid, true);
      assert.strictEqual(validateAvatarFile({ type: 'image/png', size: 1024 * 1024 }).valid, true);
      assert.strictEqual(validateAvatarFile({ type: 'image/webp', size: 2 * 1024 * 1024 }).valid, true);
    });

    it('Rejects unsupported file formats (SVG, PDF, text, gif)', () => {
      assert.strictEqual(validateAvatarFile({ type: 'image/svg+xml', size: 1024 }).valid, false);
      assert.strictEqual(validateAvatarFile({ type: 'application/pdf', size: 1024 }).valid, false);
      assert.strictEqual(validateAvatarFile({ type: 'text/html', size: 1024 }).valid, false);
      assert.strictEqual(validateAvatarFile({ type: 'image/gif', size: 1024 }).valid, false);
    });

    it('Rejects files larger than 5MB', () => {
      const oversized = validateAvatarFile({ type: 'image/jpeg', size: 6 * 1024 * 1024 });
      assert.strictEqual(oversized.valid, false);
      assert.match(oversized.error, /exceeds 5MB limit/i);
    });
  });

  describe('4. Storage Path & Security Architecture', () => {
    function generateAvatarPath(userId, extension = 'webp') {
      const cleanUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '');
      const timestamp = Date.now();
      return `avatars/${cleanUserId}/avatar_${timestamp}.${extension}`;
    }

    it('Generates scoped storage path per authenticated user', () => {
      const path = generateAvatarPath('user-abc-123');
      assert.match(path, /^avatars\/user-abc-123\/avatar_\d+\.webp$/);
    });

    it('Sanitizes potential path traversal characters in user ID', () => {
      const path = generateAvatarPath('../../../etc/passwd');
      assert.ok(!path.includes('..'));
      assert.ok(!path.includes('/etc/'));
    });
  });

  describe('5. Error Message Sanitization (Safe Diagnostic Messaging)', () => {
    function sanitizeErrorMessage(err) {
      const msg = err?.message || String(err || '');
      if (msg.includes('subquery used as an expression')) {
        return 'Unable to update profile due to a system constraint. Please try again.';
      }
      if (msg.includes('violates foreign key') || msg.includes('duplicate key') || msg.includes('syntax error')) {
        return 'An error occurred while saving your profile changes. Please try again.';
      }
      return msg;
    }

    it('Masks PostgreSQL subquery cardinality error from raw user display', () => {
      const safe = sanitizeErrorMessage(new Error('more than one row returned by a subquery used as an expression'));
      assert.strictEqual(safe.includes('subquery'), false);
      assert.strictEqual(safe.includes('more than one row'), false);
      assert.match(safe, /Unable to update profile/i);
    });

    it('Masks foreign key and duplicate key database errors', () => {
      const safe = sanitizeErrorMessage(new Error('duplicate key value violates unique constraint'));
      assert.strictEqual(safe.includes('unique constraint'), false);
      assert.match(safe, /An error occurred while saving your profile/i);
    });
  });
});
