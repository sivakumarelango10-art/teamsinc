import React, { useState, useEffect, useMemo } from 'react';
import { Shield, ShieldAlert, User, Edit, Power, Trash2, Award, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePresence } from '../../context/PresenceContext';

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
      classes: 'bg-neutral-950 text-neutral-400 border-neutral-800'
    }
  };

  const config = configs[role] || configs.MEMBER;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs border ${config.classes}`}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
};

export const UserTable = ({
  users = [],
  onEdit,
  onRoleChange,
  onToggleStatus,
  onDelete,
  currentUserId
}) => {
  const { isUserOnline } = usePresence();
  const isFounderAccount = (email) => email.toLowerCase() === 'sivakumarelango10@gmail.com';

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Reset to first page when filtering changes
  useEffect(() => {
    setCurrentPage(1);
  }, [users.length]);

  const totalPages = Math.ceil(users.length / pageSize) || 1;
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return users.slice(start, start + pageSize);
  }, [users, currentPage, pageSize]);

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-neutral-300">
        <thead className="bg-black text-xs font-semibold uppercase tracking-wider text-neutral-400 border-b border-neutral-800">
          <tr>
            <th className="px-6 py-4">User</th>
            <th className="px-6 py-4">Role</th>
            <th className="px-6 py-4">Status</th>
            <th className="px-6 py-4">Created</th>
            <th className="px-6 py-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-850">
          {paginatedUsers.map((u) => {
            const isTargetFounder = isFounderAccount(u.email);
            const isSelf = u.id === currentUserId;
            const isOnline = isUserOnline(u.email);

            return (
              <tr key={u.id} className="hover:bg-neutral-900/40 transition duration-150">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-9 h-9 rounded-lg bg-neutral-900 border border-neutral-700 flex items-center justify-center font-bold text-white shadow-sm">
                        {u.full_name?.charAt(0) || 'U'}
                      </div>
                      {/* Live presence avatar indicator */}
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-black ${
                          isOnline ? 'bg-emerald-400' : 'bg-neutral-600'
                        }`}
                        title={isOnline ? 'Online now' : 'Offline'}
                      />
                    </div>
                    <div>
                      <div className="font-medium text-white flex items-center gap-2">
                        {u.full_name}
                        {isSelf && (
                          <span className="text-[10px] bg-neutral-900 text-neutral-300 px-1.5 py-0.5 rounded border border-neutral-700">
                            You
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-neutral-400">{u.email}</div>
                    </div>
                  </div>
                </td>

                <td className="px-6 py-4 whitespace-nowrap">
                  {isTargetFounder ? (
                    <UserRoleBadge role="FOUNDER" />
                  ) : onRoleChange ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={u.role}
                        onChange={(e) => onRoleChange(u.id, e.target.value)}
                        className="bg-neutral-900 border border-neutral-700 hover:border-neutral-500 rounded-lg text-xs font-semibold text-white px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-white transition cursor-pointer"
                        title="Click to instantly change role"
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

                <td className="px-6 py-4 whitespace-nowrap">
                  {!u.is_active ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 bg-neutral-950 px-2.5 py-1 rounded-full border border-neutral-850">
                      <span className="w-1.5 h-1.5 rounded-full bg-neutral-600" />
                      Deactivated
                    </span>
                  ) : isOnline ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-neutral-900 px-3 py-1 rounded-full border border-emerald-900/60 shadow-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-400 bg-neutral-950 px-3 py-1 rounded-full border border-neutral-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-neutral-600" />
                      Offline
                    </span>
                  )}
                </td>

                <td className="px-6 py-4 whitespace-nowrap text-xs text-neutral-400">
                  {new Date(u.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </td>

                <td className="px-6 py-4 whitespace-nowrap text-right text-xs">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => onEdit(u)}
                      className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-900 rounded-lg transition"
                      title="Edit User"
                    >
                      <Edit className="w-4 h-4" />
                    </button>

                    {!isTargetFounder && (
                      <>
                        <button
                          onClick={() => onToggleStatus(u)}
                          className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-900 transition"
                          title={u.is_active ? 'Deactivate User' : 'Activate User'}
                        >
                          <Power className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => onDelete(u)}
                          className="p-2 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900 rounded-lg transition"
                          title="Delete User"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
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
            className="bg-neutral-900 border border-neutral-800 text-white rounded-lg px-2 py-1 outline-none cursor-pointer"
          >
            <option value={15}>15</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span className="text-neutral-500 ml-1">
            {users.length > 0 ? (
              <>Showing <strong className="text-neutral-200">{(currentPage - 1) * pageSize + 1}</strong> to <strong className="text-neutral-200">{Math.min(currentPage * pageSize, users.length)}</strong> of <strong className="text-neutral-200">{users.length}</strong> members</>
            ) : (
              '0 members'
            )}
          </span>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              className="p-1.5 rounded-lg border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
              title="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
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
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserTable;
