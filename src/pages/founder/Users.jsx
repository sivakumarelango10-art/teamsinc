import React, { useState, useEffect } from 'react';
import { usersApi } from '../../api/usersApi';
import { useAuth } from '../../hooks/useAuth';
import UserTable from '../../components/users/UserTable';
import UserForm from '../../components/users/UserForm';
import ConfirmModal from '../../components/common/ConfirmModal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { Users as UsersIcon, UserPlus, Search, Filter, ShieldCheck } from 'lucide-react';

export const Users = () => {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', text: '' });

  const loadUsers = async () => {
    try {
      setLoading(true);
      const list = await usersApi.getUsers();
      setUsers(list);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateOrEditUser = async (formData) => {
    if (editingUser) {
      await usersApi.updateUser(editingUser.id, formData);
      setFeedback({ type: 'success', text: `Updated user ${formData.full_name}` });
    } else {
      await usersApi.createUser(formData);
      setFeedback({ type: 'success', text: `Created new user ${formData.full_name}` });
    }
    await loadUsers();
    setEditingUser(null);
  };

  const handleToggleStatus = async (targetUser) => {
    try {
      const nextStatus = !targetUser.is_active;
      await usersApi.toggleUserStatus(targetUser.id, nextStatus);
      setFeedback({
        type: 'success',
        text: `User ${targetUser.full_name} is now ${nextStatus ? 'active' : 'inactive'}.`
      });
      await loadUsers();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteConfirmUser) return;
    try {
      setActionLoading(true);
      await usersApi.deleteUser(deleteConfirmUser.id);
      setFeedback({ type: 'success', text: `User ${deleteConfirmUser.full_name} has been removed.` });
      setDeleteConfirmUser(null);
      await loadUsers();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  // Filtered Users
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && u.is_active) ||
      (statusFilter === 'INACTIVE' && !u.is_active);

    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <UsersIcon className="w-7 h-7 text-indigo-400" />
            User Management
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Provision team members, assign administrative capabilities, and regulate account statuses.
          </p>
        </div>

        <button
          onClick={() => {
            setEditingUser(null);
            setIsFormOpen(true);
          }}
          className="px-4 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition shadow-lg shadow-indigo-600/25 flex items-center gap-2 self-start md:self-auto cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add New User</span>
        </button>
      </div>

      {feedback.text && (
        <div className={`p-3.5 rounded-xl text-xs flex items-center justify-between ${
          feedback.type === 'success'
            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
            : 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
        }`}>
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback({ type: '', text: '' })} className="underline ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* Search & Filter Controls */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500 transition"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-indigo-500 transition"
            >
              <option value="ALL">All Roles</option>
              <option value="FOUNDER">Founders</option>
              <option value="ADMIN">Admins</option>
              <option value="MEMBER">Members</option>
            </select>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-indigo-500 transition"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      {loading ? (
        <LoadingSpinner text="Fetching registered team members..." />
      ) : (
        <UserTable
          users={filteredUsers}
          onEdit={(u) => {
            setEditingUser(u);
            setIsFormOpen(true);
          }}
          onToggleStatus={handleToggleStatus}
          onDelete={(u) => setDeleteConfirmUser(u)}
          currentUserId={currentUser?.id}
        />
      )}

      {/* Modals */}
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
    </div>
  );
};

export default Users;
