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
  LogOut,
  Sparkles,
  MessageSquare
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import BrandLogo from '../common/BrandLogo';
import { Shield } from 'lucide-react';

export const Sidebar = ({ isOpen, onClose }) => {
  const { profile, role, isFounder, isAdmin, isFoundingAdvisor, logout } = useAuth();

  const getNavLinks = () => {
    if (isFounder) {
      return [
        { to: '/founder/dashboard', label: 'Founder Dashboard', icon: LayoutDashboard },
        { to: '/leadership-chat', label: 'Leadership Chat', icon: Shield },
        { to: '/chat', label: 'Team Chat', icon: MessageSquare },
        { to: '/founder/users', label: 'User Management', icon: Users },
        { to: '/founder/departments', label: 'Departments', icon: Building2 },
        { to: '/admin/tasks', label: 'All Tasks', icon: CheckSquare },
        { to: '/admin/daily-planning', label: 'Daily Team Planner', icon: Calendar },
        { to: '/founder/reports', label: 'Reports & Analytics', icon: BarChart3 }
      ];
    } else if (isAdmin) {
      return [
        { to: '/admin/dashboard', label: 'Admin Dashboard', icon: LayoutDashboard },
        { to: '/leadership-chat', label: 'Leadership Chat', icon: Shield },
        { to: '/chat', label: 'Team Chat', icon: MessageSquare },
        { to: '/admin/tasks', label: 'Task Management', icon: CheckSquare },
        { to: '/admin/assign-task', label: 'Assign New Task', icon: PlusCircle },
        { to: '/admin/daily-planning', label: 'Daily Team Planner', icon: Calendar }
      ];
    } else if (isFoundingAdvisor) {
      return [
        { to: '/founding-advisor/dashboard', label: 'Overview', icon: LayoutDashboard },
        { to: '/founding-advisor/tasks', label: 'Tasks', icon: CheckSquare },
        { to: '/leadership-chat', label: 'Leadership Chat', icon: Shield }
      ];
    } else {
      return [
        { to: '/member/dashboard', label: 'My Dashboard', icon: LayoutDashboard },
        { to: '/chat', label: 'Team Chat', icon: MessageSquare },
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
          className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-black border-r border-neutral-800 flex flex-col justify-between transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          <div className="h-16 px-6 flex items-center justify-between border-b border-neutral-800">
            <BrandLogo size="default" />
            <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded border border-neutral-700 bg-neutral-900 text-neutral-300">
              PROD
            </span>
          </div>

          {/* User Profile Summary */}
          <div className="p-4 mx-3 my-3 rounded-xl bg-neutral-950 border border-neutral-800">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-neutral-900 border border-neutral-700 text-white flex items-center justify-center font-bold text-sm">
                {profile?.full_name?.charAt(0) || 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white truncate">
                  {profile?.full_name || 'Team Member'}
                </p>
                <p className="text-[11px] text-neutral-400 truncate">
                  {profile?.email}
                </p>
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-neutral-800 flex items-center justify-between">
              <span className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider">Role</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                role === 'FOUNDING_ADVISOR'
                  ? 'border-purple-800 bg-purple-950/80 text-purple-200'
                  : role === 'FOUNDER'
                  ? 'border-white bg-white text-black'
                  : role === 'ADMIN'
                  ? 'border-neutral-700 bg-neutral-900 text-white'
                  : 'border-neutral-800 bg-neutral-900 text-neutral-300'
              }`}>
                {role === 'FOUNDING_ADVISOR' ? 'Founding Advisor' : role === 'FOUNDER' ? 'Founder' : role === 'ADMIN' ? 'Admin' : 'Member'}
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="px-3 py-2 space-y-1">
            <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
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
                    `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition ${
                      isActive
                        ? 'bg-white text-black shadow-sm'
                        : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
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

        {/* Bottom Section: Sign Out (No test/demo mode toggles) */}
        <div className="p-4 border-t border-neutral-800">
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-lg transition cursor-pointer"
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
