import React from 'react';
import { Shield, ShieldAlert, User, Edit, Power, Trash2, CheckCircle2, XCircle } from 'lucide-react';

export const UserRoleBadge = ({ role }) => {
  const configs = {
    FOUNDER: {
      label: 'Founder',
      icon: ShieldAlert,
      classes: 'bg-amber-500/10 text-amber-300 border-amber-500/30'
    },
    ADMIN: {
      label: 'Admin',
      icon: Shield,
      classes: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
    },
    MEMBER: {
      label: 'Member',
      icon: User,
      classes: 'bg-slate-800 text-slate-300 border-slate-700'
    }
  };

  const config = configs[role] || configs.MEMBER;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${config.classes}`}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
};

export const UserTable = ({
  users = [],
  onEdit,
  onToggleStatus,
  onDelete,
  currentUserId
}) => {
  const isFounderAccount = (email) => email.toLowerCase() === 'sivakumarelango10@gmail.com';

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm">
      <table className="w-full text-left text-sm text-slate-300">
        <thead className="bg-slate-900/80 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
          <tr>
            <th className="px-6 py-4">User</th>
            <th className="px-6 py-4">Role</th>
            <th className="px-6 py-4">Status</th>
            <th className="px-6 py-4">Created</th>
            <th className="px-6 py-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {users.map((u) => {
            const isTargetFounder = isFounderAccount(u.email);
            const isSelf = u.id === currentUserId;

            return (
              <tr key={u.id} className="hover:bg-slate-800/30 transition duration-150">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center font-bold text-white shadow-sm">
                      {u.full_name?.charAt(0) || 'U'}
                    </div>
                    <div>
                      <div className="font-medium text-slate-100 flex items-center gap-2">
                        {u.full_name}
                        {isSelf && (
                          <span className="text-[10px] bg-slate-800 text-indigo-300 px-1.5 py-0.5 rounded border border-slate-700">
                            You
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400">{u.email}</div>
                    </div>
                  </div>
                </td>

                <td className="px-6 py-4 whitespace-nowrap">
                  <UserRoleBadge role={u.role} />
                </td>

                <td className="px-6 py-4 whitespace-nowrap">
                  {u.is_active ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full border border-slate-700">
                      <XCircle className="w-3.5 h-3.5" />
                      Inactive
                    </span>
                  )}
                </td>

                <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-400">
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
                      className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition"
                      title="Edit User"
                    >
                      <Edit className="w-4 h-4" />
                    </button>

                    {!isTargetFounder && (
                      <>
                        <button
                          onClick={() => onToggleStatus(u)}
                          className={`p-2 rounded-lg transition ${
                            u.is_active
                              ? 'text-slate-400 hover:text-amber-400 hover:bg-slate-800'
                              : 'text-slate-400 hover:text-emerald-400 hover:bg-slate-800'
                          }`}
                          title={u.is_active ? 'Deactivate User' : 'Activate User'}
                        >
                          <Power className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => onDelete(u)}
                          className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition"
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
  );
};

export default UserTable;
