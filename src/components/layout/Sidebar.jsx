import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Building2,
  CheckSquare,
  Calendar,
  BarChart3,
  PlusCircle,
  ShieldAlert,
  Shield,
  UserCheck,
  LogOut,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export const Sidebar = ({ isOpen, onClose }) => {
  const { profile, role, isFounder, isAdmin, isMember, logout, switchDemoRole } = useAuth();

  const getNavLinks = () => {
    if (isFounder) {
      return [
        { to: '/founder/dashboard', label: 'Founder Dashboard', icon: LayoutDashboard },
        { to: '/founder/users', label: 'User Management', icon: Users },
        { to: '/founder/departments', label: 'Departments', icon: Building2 },
        { to: '/admin/tasks', label: 'All Tasks', icon: CheckSquare },
        { to: '/admin/daily-planning', label: 'Daily Team Planner', icon: Calendar },
        { to: '/founder/reports', label: 'Reports & Analytics', icon: BarChart3 }
      ];
    } else if (isAdmin) {
      return [
        { to: '/admin/dashboard', label: 'Admin Dashboard', icon: LayoutDashboard },
        { to: '/admin/tasks', label: 'Task Management', icon: CheckSquare },
        { to: '/admin/assign-task', label: 'Assign New Task', icon: PlusCircle },
        { to: '/admin/daily-planning', label: 'Daily Team Planner', icon: Calendar }
      ];
    } else {
      return [
        { to: '/member/dashboard', label: 'My Dashboard', icon: LayoutDashboard },
        { to: '/member/tasks', label: 'My Tasks', icon: CheckSquare },
        { to: '/member/daily-plan', label: 'My Daily Plan', icon: Calendar }
      ];
    }
  };

  const navLinks = getNavLinks();

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800/80 flex flex-col justify-between transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          {/* Brand Logo */}
          <div className="h-16 px-6 flex items-center justify-between border-b border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
                <Sparkles className="w-4 h-4" />
              </div>
              <span className="font-extrabold text-lg text-white tracking-tight">
                Team<span className="text-indigo-400">Sync</span>
              </span>
            </div>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-800 text-indigo-300 border border-slate-700">
              v1.0
            </span>
          </div>

          {/* User Profile Summary */}
          <div className="p-4 mx-3 my-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center font-bold text-sm">
                {profile?.full_name?.charAt(0) || 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-100 truncate">
                  {profile?.full_name || 'Team Member'}
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  {profile?.email}
                </p>
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Role</span>
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                isFounder
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                  : isAdmin
                  ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}>
                {role}
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="px-3 py-2 space-y-1">
            <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Navigation
            </div>
            {navLinks.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </div>

        {/* Bottom Section: Quick Role Switcher & Logout */}
        <div className="p-4 border-t border-slate-800/80 space-y-3">
          {/* Quick Demo Role Switcher for instant pair programming & verification */}
          <div className="p-2.5 rounded-xl bg-slate-950/40 border border-slate-800">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center justify-between">
              <span>Quick Role Switch</span>
              <span className="text-[9px] text-indigo-400">Demo</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => switchDemoRole('FOUNDER')}
                className={`py-1 text-[10px] font-bold rounded-lg transition ${
                  isFounder ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-slate-850 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
                title="Switch to Founder (sivakumarelango10@gmail.com)"
              >
                Founder
              </button>
              <button
                type="button"
                onClick={() => switchDemoRole('ADMIN')}
                className={`py-1 text-[10px] font-bold rounded-lg transition ${
                  isAdmin ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40' : 'bg-slate-850 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
                title="Switch to Admin (admin@teamsync.com)"
              >
                Admin
              </button>
              <button
                type="button"
                onClick={() => switchDemoRole('MEMBER')}
                className={`py-1 text-[10px] font-bold rounded-lg transition ${
                  isMember ? 'bg-slate-700 text-white border border-slate-600' : 'bg-slate-850 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
                title="Switch to Member (david@teamsync.com)"
              >
                Member
              </button>
            </div>
          </div>

          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 rounded-xl transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
