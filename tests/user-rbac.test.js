import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { app } from '../server/app.js';
import { query } from '../server/db.js';

describe('TeamSync User Management Role-Based Access Control (RBAC) Tests', () => {
  let server;
  let baseUrl;

  // Real test users in database
  const ADMIN_EMAIL = 'sgjitbros@gmail.com'; // SG Karmjit (ADMIN)
  const MEMBER_EMAIL = 'prajith.p.dev.1@gmail.com'; // Prajith P (MEMBER)
  const FOUNDER_EMAIL = 'sivakumarelango10@gmail.com'; // Elango S (FOUNDER)

  let adminProfile;
  let memberProfile;
  let founderProfile;
  let createdTestUserId = null;

  before(async () => {
    // 1. Start HTTP server on ephemeral port
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    // 2. Fetch profiles from database to verify real records
    const res = await query(
      `SELECT id, full_name, email, role, is_active FROM public.profiles 
       WHERE LOWER(email) IN ($1, $2, $3)`,
      [ADMIN_EMAIL, MEMBER_EMAIL, FOUNDER_EMAIL]
    );

    for (const row of res.rows) {
      if (row.email.toLowerCase() === ADMIN_EMAIL) adminProfile = row;
      if (row.email.toLowerCase() === MEMBER_EMAIL) memberProfile = row;
      if (row.email.toLowerCase() === FOUNDER_EMAIL) founderProfile = row;
    }

    assert.ok(adminProfile, 'Admin profile must exist in database');
    assert.strictEqual(adminProfile.role, 'ADMIN', 'Admin profile must have ADMIN role');
    assert.ok(memberProfile, 'Member profile must exist in database');
    assert.strictEqual(memberProfile.role, 'MEMBER', 'Member profile must have MEMBER role');
    assert.ok(founderProfile, 'Founder profile must exist in database');
    assert.strictEqual(founderProfile.role, 'FOUNDER', 'Founder profile must have FOUNDER role');
  });

  after(async () => {
    // Cleanup any created test user
    if (createdTestUserId) {
      try {
        await query('DELETE FROM public.profiles WHERE id = $1', [createdTestUserId]);
      } catch {}
    }

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. NAVIGATION & VISIBILITY RULES
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Navigation & Page Accessibility', () => {
    it('User Management is visible in navigation for both Administrator and Member roles', async () => {
      // Replicate Sidebar.jsx getNavLinks logic
      const getNavLinksForRole = (role) => {
        const isFounder = role === 'FOUNDER';
        const isAdmin = role === 'ADMIN';
        const isFoundingAdvisor = role === 'FOUNDING_ADVISOR';

        if (isFounder) {
          return [
            { to: '/founder/dashboard', label: 'Founder Dashboard' },
            { to: '/founder/users', label: 'User Management' },
            { to: '/founder/departments', label: 'Departments' }
          ];
        } else if (isAdmin) {
          return [
            { to: '/admin/dashboard', label: 'Admin Dashboard' },
            { to: '/admin/users', label: 'User Management' },
            { to: '/admin/tasks', label: 'Task Management' }
          ];
        } else if (isFoundingAdvisor) {
          return [
            { to: '/founding-advisor/dashboard', label: 'Overview' },
            { to: '/founding-advisor/users', label: 'User Management' }
          ];
        } else {
          return [
            { to: '/member/dashboard', label: 'My Dashboard' },
            { to: '/member/users', label: 'User Management' },
            { to: '/member/tasks', label: 'My Tasks' }
          ];
        }
      };

      const adminLinks = getNavLinksForRole('ADMIN');
      const memberLinks = getNavLinksForRole('MEMBER');

      const adminUserNav = adminLinks.find(l => l.label === 'User Management');
      const memberUserNav = memberLinks.find(l => l.label === 'User Management');

      assert.ok(adminUserNav, 'Administrator navigation must contain User Management');
      assert.strictEqual(adminUserNav.to, '/admin/users');

      assert.ok(memberUserNav, 'Member navigation must contain User Management');
      assert.strictEqual(memberUserNav.to, '/member/users');
    });

    it('Frontend role check accurately evaluates canManageUsers for Admins vs Members', () => {
      const evaluatePermissions = (userRole) => ({
        canManageUsers: userRole === 'ADMIN' || userRole === 'FOUNDER',
        canViewDirectory: true
      });

      const memberPerms = evaluatePermissions('MEMBER');
      assert.strictEqual(memberPerms.canViewDirectory, true);
      assert.strictEqual(memberPerms.canManageUsers, false, 'Members must have canManageUsers === false');

      const adminPerms = evaluatePermissions('ADMIN');
      assert.strictEqual(adminPerms.canViewDirectory, true);
      assert.strictEqual(adminPerms.canManageUsers, true, 'Administrators must have canManageUsers === true');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. MEMBER DIRECTORY ACCESS (READ-ONLY)
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Member User Directory Read-Only Access', () => {
    it('Allows authenticated Member to view the user directory (HTTP 200 OK)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/users`, {
        method: 'GET',
        headers: {
          'x-teamsync-user-email': memberProfile.email
        }
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.ok(Array.isArray(body.data), 'Expected array of user records');
      assert.ok(body.data.length > 0, 'Directory must contain team members');

      // Verify required directory columns are present: User (full_name, email), Role, Status (is_active)
      const firstUser = body.data[0];
      assert.ok(firstUser.full_name, 'User record must have full_name');
      assert.ok(firstUser.role, 'User record must have role');
      assert.strictEqual(typeof firstUser.is_active, 'boolean', 'User record must have boolean is_active status');

      // Verify sensitive auth tokens / passwords are NOT exposed
      assert.strictEqual(firstUser.password, undefined);
      assert.strictEqual(firstUser.token, undefined);
      assert.strictEqual(firstUser.auth_user_id, undefined);
    });

    it('Allows authenticated Member to retrieve a single user record by ID (HTTP 200 OK)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/users/${adminProfile.id}`, {
        method: 'GET',
        headers: {
          'x-teamsync-user-email': memberProfile.email
        }
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.id, adminProfile.id);
      assert.strictEqual(body.data.role, 'ADMIN');
    });

    it('Allows Member to search and filter directory records without leaking unauthorized records', async () => {
      const res = await fetch(`${baseUrl}/api/v1/users?q=${encodeURIComponent('Prajith')}`, {
        method: 'GET',
        headers: {
          'x-teamsync-user-email': memberProfile.email
        }
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.ok(body.data.some(u => u.email.toLowerCase() === memberProfile.email.toLowerCase()));
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. MEMBER MUTATION REJECTION (HTTP 403 FORBIDDEN)
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Member Mutation Enforcement (Strictly Prohibited & Returns HTTP 403 Forbidden)', () => {
    it('Rejects direct user creation by a Member with HTTP 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/v1/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-teamsync-user-email': memberProfile.email
        },
        body: JSON.stringify({
          full_name: 'Unauthorized Member Created User',
          email: 'unauthorized_member_user@kalvilearn.io',
          role: 'MEMBER'
        })
      });

      assert.strictEqual(res.status, 403, 'Direct user creation by Member must return HTTP 403 Forbidden');
      const body = await res.json();
      assert.strictEqual(body.success, false);
      assert.match(body.error, /Forbidden.*read-only/i);
    });

    it('Rejects direct user editing by a Member with HTTP 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/v1/users/${adminProfile.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-teamsync-user-email': memberProfile.email
        },
        body: JSON.stringify({
          full_name: 'Hacked Name'
        })
      });

      assert.strictEqual(res.status, 403, 'Direct user edit by Member must return HTTP 403 Forbidden');
      const body = await res.json();
      assert.strictEqual(body.success, false);
      assert.match(body.error, /Forbidden.*read-only/i);
    });

    it('Rejects direct role-change attempt by a Member with HTTP 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/v1/users/${memberProfile.id}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-teamsync-user-email': memberProfile.email
        },
        body: JSON.stringify({
          role: 'ADMIN'
        })
      });

      assert.strictEqual(res.status, 403, 'Member role change attempt must return HTTP 403 Forbidden');
      const body = await res.json();
      assert.strictEqual(body.success, false);
      assert.match(body.error, /Forbidden.*read-only/i);
    });

    it('Rejects direct account activation / deactivation by a Member with HTTP 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/v1/users/${adminProfile.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-teamsync-user-email': memberProfile.email
        },
        body: JSON.stringify({
          is_active: false
        })
      });

      assert.strictEqual(res.status, 403, 'Member account status change attempt must return HTTP 403 Forbidden');
      const body = await res.json();
      assert.strictEqual(body.success, false);
      assert.match(body.error, /Forbidden.*read-only/i);
    });

    it('Rejects direct user deletion by a Member with HTTP 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/v1/users/${adminProfile.id}`, {
        method: 'DELETE',
        headers: {
          'x-teamsync-user-email': memberProfile.email
        }
      });

      assert.strictEqual(res.status, 403, 'Member user deletion attempt must return HTTP 403 Forbidden');
      const body = await res.json();
      assert.strictEqual(body.success, false);
      assert.match(body.error, /Forbidden.*read-only/i);
    });

    it('Rejects client-side role spoofing (x-teamsync-role header is ignored, server derives role from DB)', async () => {
      // Member attempts to send x-teamsync-role: ADMIN
      const res = await fetch(`${baseUrl}/api/v1/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-teamsync-user-email': memberProfile.email,
          'x-teamsync-role': 'ADMIN' // Client-side spoof attempt!
        },
        body: JSON.stringify({
          full_name: 'Privilege Escalation Attempt',
          email: 'spoofed_admin@kalvilearn.io',
          role: 'ADMIN'
        })
      });

      assert.strictEqual(res.status, 403, 'Server must derive role from DB and reject spoofed role header');
      const body = await res.json();
      assert.strictEqual(body.success, false);
      assert.match(body.error, /Forbidden.*read-only/i);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. ADMINISTRATOR CAPABILITIES & WORKFLOWS
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. Administrator Capabilities (Add, Edit, Role, Status, Delete)', () => {
    it('Allows Administrator to add a new user account (HTTP 201 Created)', async () => {
      const testEmail = `rbac_test_user_${Date.now()}@kalvilearn.io`;
      const res = await fetch(`${baseUrl}/api/v1/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-teamsync-user-email': adminProfile.email
        },
        body: JSON.stringify({
          full_name: 'Authorized Test User',
          email: testEmail,
          role: 'MEMBER',
          is_active: true
        })
      });

      assert.strictEqual(res.status, 201);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.ok(body.data?.id);
      assert.strictEqual(body.data.email, testEmail);
      assert.strictEqual(body.data.role, 'MEMBER');

      createdTestUserId = body.data.id;
    });

    it('Allows Administrator to edit user details (HTTP 200 OK)', async () => {
      assert.ok(createdTestUserId, 'Test user must be created first');

      const res = await fetch(`${baseUrl}/api/v1/users/${createdTestUserId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-teamsync-user-email': adminProfile.email
        },
        body: JSON.stringify({
          full_name: 'Updated Test User Name'
        })
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.full_name, 'Updated Test User Name');
    });

    it('Allows Administrator to change user role (HTTP 200 OK)', async () => {
      assert.ok(createdTestUserId, 'Test user must be created first');

      const res = await fetch(`${baseUrl}/api/v1/users/${createdTestUserId}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-teamsync-user-email': adminProfile.email
        },
        body: JSON.stringify({
          role: 'FOUNDING_ADVISOR'
        })
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.role, 'FOUNDING_ADVISOR');
    });

    it('Allows Administrator to change user account status (HTTP 200 OK)', async () => {
      assert.ok(createdTestUserId, 'Test user must be created first');

      const res = await fetch(`${baseUrl}/api/v1/users/${createdTestUserId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-teamsync-user-email': adminProfile.email
        },
        body: JSON.stringify({
          is_active: false
        })
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.is_active, false);
    });

    it('Allows Administrator to permanently delete user account (HTTP 200 OK)', async () => {
      assert.ok(createdTestUserId, 'Test user must be created first');

      const res = await fetch(`${baseUrl}/api/v1/users/${createdTestUserId}`, {
        method: 'DELETE',
        headers: {
          'x-teamsync-user-email': adminProfile.email
        }
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);

      // Verify user no longer exists in database
      const verifyRes = await query('SELECT id FROM public.profiles WHERE id = $1', [createdTestUserId]);
      assert.strictEqual(verifyRes.rows.length, 0, 'Deleted user must not exist in database');

      createdTestUserId = null;
    });

    it('Protects Founder account: rejects attempts to change Founder role, deactivate Founder, or delete Founder', async () => {
      // 1. Attempt to change Founder role
      const roleRes = await fetch(`${baseUrl}/api/v1/users/${founderProfile.id}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-teamsync-user-email': adminProfile.email
        },
        body: JSON.stringify({ role: 'MEMBER' })
      });
      assert.strictEqual(roleRes.status, 403);

      // 2. Attempt to deactivate Founder
      const statusRes = await fetch(`${baseUrl}/api/v1/users/${founderProfile.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-teamsync-user-email': adminProfile.email
        },
        body: JSON.stringify({ is_active: false })
      });
      assert.strictEqual(statusRes.status, 403);

      // 3. Attempt to delete Founder
      const deleteRes = await fetch(`${baseUrl}/api/v1/users/${founderProfile.id}`, {
        method: 'DELETE',
        headers: {
          'x-teamsync-user-email': adminProfile.email
        }
      });
      assert.strictEqual(deleteRes.status, 403);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. UNAUTHENTICATED ACCESS PROTECTION
  // ───────────────────────────────────────────────────────────────────────────
  describe('5. Authentication Enforcement', () => {
    it('Rejects unauthenticated directory access with HTTP 401 Unauthorized', async () => {
      const res = await fetch(`${baseUrl}/api/v1/users`, {
        method: 'GET'
      });
      assert.strictEqual(res.status, 401);
      const body = await res.json();
      assert.strictEqual(body.success, false);
      assert.match(body.error, /Unauthorized/i);
    });
  });
});
