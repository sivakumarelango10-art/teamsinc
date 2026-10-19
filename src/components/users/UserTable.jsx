import React, { useState, useEffect, useMemo } from 'react';
import { Shield, ShieldAlert, User, Edit, Power, Trash2, Award, ChevronLeft, ChevronRight, Users as UsersIcon } from 'lucide-react';
import { usePresence } from '../../context/PresenceContext';
import Avatar from '../common/Avatar';

export const UserRoleBadge = ({ role }) => {
  const configs = {
    FOUNDER: {
      label: 'Founder',
      icon: ShieldAlert,
      classes: 'bg-white text-black border-white font-bold shadow-sm'
    },
    ADMIN: {
      label: 'Admin',
      icon: Shield,
      classes: 'bg-neutral-800 text-white border-neutral-700 font-semibold'
    },
    FOUNDING_ADVISOR: {
      label: 'Founding Advisor',
      icon: Award,
      classes: 'bg-purple-950/80 text-purple-200 border-purple-800 font-semibold shadow-sm'
    },
    MEMBER: {
      label: 'Member',
      icon: User,
      classes: 'bg-neutral-950 text-neutral-400 border-neutral-800 font-medium'
    }
  };

  const config = configs[role] || configs.MEMBER;
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs border ${config.classes}`}
      aria-label={`Role: ${config.label}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );
};

export const UserTable = ({
  users = [],
  loading = false,
  canManageUsers = false,
  onEdit,
  onRoleChange,
  onToggleStatus,
  onDelete,
  currentUserId
}) => {
  const { isUserOnline } = usePresence();
  const isFounderAccount = (email) => (email || '').toLowerCase() === 'sivakumarelango10@gmail.com';

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Reset to first page when filtering or dataset length changes
  useEffect(() => {
    setCurrentPage(1);
  }, [users.length]);

  const totalPages = Math.ceil(users.length / pageSize) || 1;
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return users.slice(start, start + pageSize);
  }, [users, currentPage, pageSize]);

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-neutral-300 min-w-[640px]" aria-label="User Directory Table">
          <thead className="bg-black text-xs font-semibold uppercase tracking-wider text-neutral-400 border-b border-neutral-800">
            <tr>
              <th scope="col" className="px-6 py-4">User</th>
              <th scope="col" className="px-6 py-4">Role</th>
              <th scope="col" className="px-6 py-4">Status</th>
              <th scope="col" className="px-6 py-4">Created</th>
              {canManageUsers && (
                <th scope="col" className="px-6 py-4 text-right">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-850">
            {loading ? (
              // Loading Skeleton State
              Array.from({ length: 5 }).map((_, idx) => (
                <tr key={`skeleton-${idx}`} className="animate-pulse">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-neutral-850 shrink-0" />
                      <div className="space-y-1.5 min-w-0">
                        <div className="w-28 h-3.5 bg-neutral-850 rounded" />
                        <div className="w-40 h-2.5 bg-neutral-900 rounded" />
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="w-20 h-5 bg-neutral-850 rounded" />
                  </td>
                  <td className="px-6 py-4">
                    <div className="w-16 h-5 bg-neutral-850 rounded-full" />
                  </td>
                  <td className="px-6 py-4">
                    <div className="w-24 h-3.5 bg-neutral-850 rounded" />
                  </td>
                  {canManageUsers && (
                    <td className="px-6 py-4 text-right">
                      <div className="w-16 h-6 bg-neutral-850 rounded ml-auto" />
                    </td>
                  )}
                </tr>
              ))
            ) : paginatedUsers.length === 0 ? (
              // Empty State
              <tr>
                <td
                  colSpan={canManageUsers ? 5 : 4}
                  className="px-6 py-14 text-center text-neutral-400"
                >
                  <div className="flex flex-col items-center justify-center gap-2.5">
                    <div className="p-3 rounded-2xl bg-neutral-900 border border-neutral-800 text-neutral-500">
                      <UsersIcon className="w-7 h-7" aria-hidden="true" />
                    </div>
                    <p className="text-sm font-bold text-white">No users found</p>
                    <p className="text-xs text-neutral-500 max-w-sm">
                      No team members match your current search and role filters.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedUsers.map((u) => {
                const isTargetFounder = isFounderAccount(u.email);
                const isSelf = u.id === currentUserId;
                const isOnline = isUserOnline(u.email);

                return (
                  <tr
                    key={u.id}
                    className="hover:bg-neutral-900/40 transition duration-150 group"
                  >
                    {/* User Column */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <Avatar
                          src={u.avatar_url}
                          name={u.full_name}
                          size="md"
                          rounded="rounded-lg"
                          showStatus={true}
                          status={isOnline ? 'online' : 'offline'}
                        />
                        <div className="min-w-0">
                          <div className="font-medium text-white flex items-center gap-2">
                            <span className="truncate">{u.full_name}</span>
                            {isSelf && (
                              <span className="text-[10px] bg-neutral-900 text-neutral-300 px-1.5 py-0.5 rounded border border-neutral-700 shrink-0 font-medium">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-neutral-400 truncate">{u.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Role Column */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {isTargetFounder ? (
                        <UserRoleBadge role="FOUNDER" />
                      ) : canManageUsers && onRoleChange ? (
                        <div className="flex items-center gap-2">
                          <label htmlFor={`role-select-${u.id}`} className="sr-only">
                            Change role for {u.full_name}
                          </label>
                          <select
                            id={`role-select-${u.id}`}
                            value={u.role}
                            onChange={(e) => onRoleChange(u.id, e.target.value)}
                            className="bg-neutral-900 border border-neutral-700 hover:border-neutral-500 focus:border-white rounded-lg text-xs font-semibold text-white px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-white transition cursor-pointer"
                            title="Click to change role"
                          >
                            <option value="MEMBER">Member</option>
                            <option value="ADMIN">Admin</option>
                            <option value="FOUNDING_ADVISOR">Founding Advisor</option>
                          </select>
                        </div>
                      ) : (
                        <UserRoleBadge role={u.role} />
                      )}
                    </td>

                    {/* Status Column */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {!u.is_active ? (
                        <span
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 bg-neutral-950 px-2.5 py-1 rounded-full border border-neutral-850"
                          aria-label="Account Status: Deactivated"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-neutral-600" aria-hidden="true" />
                          Deactivated
                        </span>
                      ) : isOnline ? (
                        <span
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-neutral-900 px-3 py-1 rounded-full border border-emerald-900/60 shadow-sm"
                          aria-label="Account Status: Active, Online Now"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
                          Active
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-400 bg-neutral-950 px-3 py-1 rounded-full border border-neutral-800"
                          aria-label="Account Status: Active, Offline"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-neutral-600" aria-hidden="true" />
                          Offline
                        </span>
                      )}
                    </td>

                    {/* Created Column */}
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-neutral-400">
                      {new Date(u.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </td>

                    {/* Actions Column (Strictly for Administrators and Founders) */}
                    {canManageUsers && (
                      <td className="px-6 py-4 whitespace-nowrap text-right text-xs">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onEdit && onEdit(u)}
                            className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-900 rounded-lg transition cursor-pointer"
                            title={`Edit ${u.full_name}`}
                            aria-label={`Edit ${u.full_name}`}
                          >
                            <Edit className="w-4 h-4" aria-hidden="true" />
                          </button>

                          {!isTargetFounder && (
                            <>
                              <button
                                onClick={() => onToggleStatus && onToggleStatus(u)}
                                className={`p-2 rounded-lg transition cursor-pointer ${
                                  u.is_active
                                    ? 'text-neutral-400 hover:text-amber-400 hover:bg-neutral-900'
                                    : 'text-neutral-500 hover:text-emerald-400 hover:bg-neutral-900'
                                }`}
                                title={u.is_active ? `Deactivate ${u.full_name}` : `Activate ${u.full_name}`}
                                aria-label={u.is_active ? `Deactivate ${u.full_name}` : `Activate ${u.full_name}`}
                              >
                                <Power className="w-4 h-4" aria-hidden="true" />
                              </button>

                              <button
                                onClick={() => onDelete && onDelete(u)}
                                className="p-2 text-neutral-400 hover:text-red-400 hover:bg-neutral-900 rounded-lg transition cursor-pointer"
                                title={`Delete ${u.full_name}`}
                                aria-label={`Delete ${u.full_name}`}
                              >
                                <Trash2 className="w-4 h-4" aria-hidden="true" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination & Display Controls */}
      <div className="p-3.5 bg-black border-t border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-400">
        <div className="flex items-center gap-2">
          <span>Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="bg-neutral-900 border border-neutral-800 text-white rounded-lg px-2 py-1 outline-none cursor-pointer focus:border-white transition"
            aria-label="Rows per page"
          >
            <option value={15}>15</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span className="text-neutral-500 ml-1">
            {users.length > 0 ? (
              <>
                Showing <strong className="text-neutral-200">{(currentPage - 1) * pageSize + 1}</strong> to{' '}
                <strong className="text-neutral-200">{Math.min(currentPage * pageSize, users.length)}</strong> of{' '}
                <strong className="text-neutral-200">{users.length}</strong> members
              </>
            ) : (
              '0 members'
            )}
          </span>
        </div>

        {totalPages > 1 && (
          <nav className="flex items-center gap-1.5" aria-label="Pagination">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              className="p-1.5 rounded-lg border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
              title="Previous page"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>

            <span className="px-3 py-1 font-semibold text-white bg-neutral-900 border border-neutral-800 rounded-lg">
              {currentPage} / {totalPages}
            </span>

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              className="p-1.5 rounded-lg border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
              title="Next page"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </nav>
        )}
      </div>
    </div>
  );
};

export default UserTable;
