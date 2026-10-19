import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usersApi } from '../../api/usersApi';
import { useAuth } from '../../hooks/useAuth';
import { useRealtime, broadcastRealtimeEvent } from '../../hooks/useRealtime';
import UserTable from '../../components/users/UserTable';
import UserForm from '../../components/users/UserForm';
import ConfirmModal from '../../components/common/ConfirmModal';
import { Users as UsersIcon, UserPlus, Search, Filter, AlertTriangle, RotateCw } from 'lucide-react';
import { usePresence } from '../../context/PresenceContext';

export const Users = () => {
  const { user: currentUser, profile, role, isFounder, isAdmin } = useAuth();
  const { isUserOnline, onlineCount } = usePresence();

  // Determine administrative permission strictly from trusted context
  const canManageUsers = Boolean(
    isFounder || isAdmin || profile?.role === 'FOUNDER' || profile?.role === 'ADMIN'
  );

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals state (Restricted to Administrators & Founders)
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', text: '' });

  const loadUsers = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      setError(null);
      const list = await usersApi.getUsers();
      setUsers(list || []);
    } catch (err) {
      console.error('Failed to load users:', err);
      setError(err.message || 'Failed to fetch team members. Please check connection and try again.');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers(false);
  }, [loadUsers]);

  // Real-time synchronization on profiles table
  useRealtime(
    'profiles',
    () => loadUsers(true),
    { channelPrefix: 'users_list', broadcastChannel: 'teamsync_bc_profiles' }
  );

  const handleRoleChange = async (userId, newRole) => {
    if (!canManageUsers) {
      setFeedback({ type: 'error', text: 'Forbidden: Members have read-only access to user management.' });
      return;
    }

    const prevUsers = [...users];
    // Optimistic instant feedback
    setUsers(curr => curr.map(u => (u.id === userId ? { ...u, role: newRole } : u)));

    try {
      const target = prevUsers.find(u => u.id === userId);
      await usersApi.changeUserRole(userId, newRole);

      broadcastRealtimeEvent('teamsync_role_changes', { type: 'ROLE_CHANGED', email: target?.email, role: newRole });
      broadcastRealtimeEvent('teamsync_bc_profiles', { userId, role: newRole });

      setFeedback({
        type: 'success',
        text: `Role for ${target?.full_name || 'user'} changed to ${newRole}. Updates reflect immediately.`
      });
      loadUsers(true);
    } catch (err) {
      setUsers(prevUsers);
      setFeedback({ type: 'error', text: err.message || 'Failed to update user role.' });
    }
  };

  const handleCreateOrEditUser = async (formData) => {
    if (!canManageUsers) {
      setFeedback({ type: 'error', text: 'Forbidden: Members have read-only access to user management.' });
      return;
    }

    try {
      if (editingUser) {
        await usersApi.updateUser(editingUser.id, formData);
        setFeedback({ type: 'success', text: `Updated user ${formData.full_name}` });
      } else {
        await usersApi.createUser(formData);
        setFeedback({ type: 'success', text: `Created new user ${formData.full_name}` });
      }
      broadcastRealtimeEvent('teamsync_bc_profiles');
      await loadUsers(true);
      setEditingUser(null);
      setIsFormOpen(false);
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Operation failed.' });
    }
  };

  const handleToggleStatus = async (targetUser) => {
    if (!canManageUsers) {
      setFeedback({ type: 'error', text: 'Forbidden: Members have read-only access to user management.' });
      return;
    }

    const nextStatus = !targetUser.is_active;
    const prevUsers = [...users];
    setUsers(curr => curr.map(u => (u.id === targetUser.id ? { ...u, is_active: nextStatus } : u)));

    try {
      await usersApi.toggleUserStatus(targetUser.id, nextStatus);
      setFeedback({
        type: 'success',
        text: `User ${targetUser.full_name} is now ${nextStatus ? 'active' : 'inactive'}.`
      });
      broadcastRealtimeEvent('teamsync_bc_profiles');
      loadUsers(true);
    } catch (err) {
      setUsers(prevUsers);
      setFeedback({ type: 'error', text: err.message });
    }
  };

  const handleDeleteUser = async () => {
    if (!canManageUsers || !deleteConfirmUser) return;
    const target = deleteConfirmUser;
    setDeleteConfirmUser(null);
    const prevUsers = [...users];
    setUsers(curr => curr.filter(u => u.id !== target.id));

    try {
      setActionLoading(true);
      await usersApi.deleteUser(target.id);
      setFeedback({ type: 'success', text: `User ${target.full_name} has been removed.` });
      broadcastRealtimeEvent('teamsync_bc_profiles');
      loadUsers(true);
    } catch (err) {
      setUsers(prevUsers);
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return users.filter((u) => {
      const matchesSearch = !q ||
        (u.full_name && u.full_name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q));

      const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;

      const isOnline = isUserOnline(u.email);
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && isOnline && u.is_active) ||
        (statusFilter === 'OFFLINE' && !isOnline && u.is_active) ||
        (statusFilter === 'DEACTIVATED' && !u.is_active);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchQuery, roleFilter, statusFilter, isUserOnline]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
              <UsersIcon className="w-7 h-7 text-white" aria-hidden="true" />
              <span>User Management</span>
            </h1>
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full border border-emerald-900/60 bg-neutral-900 text-emerald-400 flex items-center gap-1.5 shadow-sm"
              title="Real-time online presence"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
              <span>{onlineCount} Online Now</span>
            </span>
          </div>
          <p className="text-xs md:text-sm text-neutral-400 mt-1">
            {canManageUsers
              ? 'Provision team members, assign administrative capabilities, and monitor real-time user presence.'
              : 'Browse verified team members, review roles, and monitor real-time user presence.'}
          </p>
        </div>

        {/* Add New User Button (Strictly for Administrators and Founders) */}
        {canManageUsers && (
          <button
            onClick={() => {
              setEditingUser(null);
              setIsFormOpen(true);
            }}
            className="px-4 py-2.5 text-xs font-bold text-black bg-white hover:bg-neutral-200 rounded-xl transition shadow-md flex items-center gap-2 self-start md:self-auto cursor-pointer active:scale-95"
            title="Add New User"
          >
            <UserPlus className="w-4 h-4 text-black" aria-hidden="true" />
            <span>Add New User</span>
          </button>
        )}
      </div>

      {/* Recoverable Error Banner */}
      {error && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-red-950/40 border border-red-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-red-200"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => loadUsers(false)}
            className="px-3.5 py-1.5 bg-red-900/60 hover:bg-red-800 text-red-100 border border-red-700/80 rounded-xl text-xs font-semibold cursor-pointer transition flex items-center gap-1.5 shrink-0"
          >
            <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Action Feedback Banner */}
      {feedback.text && (
        <div
          role="status"
          className={`p-3.5 rounded-xl text-xs flex items-center justify-between border ${
            feedback.type === 'error'
              ? 'bg-red-950/50 border-red-800 text-red-200'
              : 'bg-neutral-900 border-neutral-700 text-white'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            onClick={() => setFeedback({ type: '', text: '' })}
            className="underline ml-4 text-neutral-400 hover:text-white cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Search & Filter Controls */}
      <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-3" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-3.5 py-2 bg-black border border-neutral-800 rounded-xl text-white placeholder-neutral-600 text-xs focus:outline-none focus:border-white transition"
            aria-label="Search users by name or email"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-neutral-500" aria-hidden="true" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 bg-black border border-neutral-800 rounded-xl text-neutral-200 text-xs focus:outline-none focus:border-white transition cursor-pointer"
              aria-label="Filter by role"
            >
              <option value="ALL">All Roles</option>
              <option value="FOUNDER">Founders</option>
              <option value="ADMIN">Admins</option>
              <option value="FOUNDING_ADVISOR">Founding Advisors</option>
              <option value="MEMBER">Members</option>
            </select>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-black border border-neutral-800 rounded-xl text-neutral-200 text-xs focus:outline-none focus:border-white transition cursor-pointer"
            aria-label="Filter by status"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active (Online Now)</option>
            <option value="OFFLINE">Offline</option>
            <option value="DEACTIVATED">Deactivated</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <UserTable
        users={filteredUsers}
        loading={loading}
        canManageUsers={canManageUsers}
        onEdit={canManageUsers ? (u) => {
          setEditingUser(u);
          setIsFormOpen(true);
        } : undefined}
        onRoleChange={canManageUsers ? handleRoleChange : undefined}
        onToggleStatus={canManageUsers ? handleToggleStatus : undefined}
        onDelete={canManageUsers ? (u) => setDeleteConfirmUser(u) : undefined}
        currentUserId={currentUser?.id}
      />

      {/* Administrative Modals (Rendered ONLY for authorized Administrators and Founders) */}
      {canManageUsers && (
        <>
          <UserForm
            isOpen={isFormOpen}
            onClose={() => {
              setIsFormOpen(false);
              setEditingUser(null);
            }}
            onSubmit={handleCreateOrEditUser}
            initialData={editingUser}
          />

          <ConfirmModal
            isOpen={Boolean(deleteConfirmUser)}
            title="Delete User Account"
            message={`Are you sure you want to permanently delete "${deleteConfirmUser?.full_name}" (${deleteConfirmUser?.email})? This action cannot be reversed.`}
            confirmText="Delete Account"
            loading={actionLoading}
            onConfirm={handleDeleteUser}
            onCancel={() => setDeleteConfirmUser(null)}
          />
        </>
      )}
    </div>
  );
};

export default Users;
