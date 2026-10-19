import React, { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Building2,
  CheckSquare,
  Calendar,
  BarChart3,
  PlusCircle,
  LogOut,
  MessageSquare,
  Shield,
  Bug,
  User,
  ChevronRight,
  Layers
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import BrandLogo from '../common/BrandLogo';
import ReportBugModal from '../bugs/ReportBugModal';
import Avatar from '../common/Avatar';

export const Sidebar = ({ isOpen, onClose }) => {
  const { profile, role, isFounder, isAdmin, isFoundingAdvisor, logout } = useAuth();
  const [isReportBugModalOpen, setIsReportBugModalOpen] = useState(false);

  const getNavLinks = () => {
    if (isFounder) {
      return [
        { to: '/founder/dashboard', label: 'Founder Dashboard', icon: LayoutDashboard },
        { to: '/integrations/kalvilearn', label: 'KalviLearn Hub', icon: Layers },
        { to: '/chat', label: 'Chats', icon: MessageSquare },
        { to: '/founder/bugs', label: 'Bug Reports', icon: Bug },
        { to: '/founder/users', label: 'User Management', icon: Users },
        { to: '/founder/departments', label: 'Departments', icon: Building2 },
        { to: '/admin/tasks', label: 'All Tasks', icon: CheckSquare },
        { to: '/admin/daily-planning', label: 'Daily Task Allocation', icon: Calendar },
        { to: '/founder/reports', label: 'Reports & Analytics', icon: BarChart3 },
        { to: '/profile', label: 'My Profile', icon: User }
      ];
    } else if (isAdmin) {
      return [
        { to: '/admin/dashboard', label: 'Admin Dashboard', icon: LayoutDashboard },
        { to: '/integrations/kalvilearn', label: 'KalviLearn Hub', icon: Layers },
        { to: '/chat', label: 'Chats', icon: MessageSquare },
        { to: '/admin/bugs', label: 'Bug Reports', icon: Bug },
        { to: '/admin/users', label: 'User Management', icon: Users },
        { to: '/admin/tasks', label: 'Task Management', icon: CheckSquare },
        { to: '/admin/assign-task', label: 'Assign New Task', icon: PlusCircle },
        { to: '/admin/daily-planning', label: 'Daily Task Allocation', icon: Calendar },
        { to: '/profile', label: 'My Profile', icon: User }
      ];
    } else if (isFoundingAdvisor) {
      return [
        { to: '/founding-advisor/dashboard', label: 'Overview', icon: LayoutDashboard },
        { to: '/integrations/kalvilearn', label: 'KalviLearn Hub', icon: Layers },
        { to: '/chat', label: 'Leadership Chat', icon: Shield },
        { to: '/founding-advisor/users', label: 'User Management', icon: Users },
        { to: '/founding-advisor/tasks', label: 'Tasks', icon: CheckSquare },
        { to: '/profile', label: 'My Profile', icon: User }
      ];
    } else {
      return [
        { to: '/member/dashboard', label: 'My Dashboard', icon: LayoutDashboard },
        { to: '/integrations/kalvilearn', label: 'KalviLearn Hub', icon: Layers },
        { to: '/chat', label: 'Team Chat', icon: MessageSquare },
        { to: '/member/users', label: 'User Management', icon: Users },
        { to: '/member/tasks', label: 'My Tasks', icon: CheckSquare },
        { to: '/member/daily-plan', label: 'My Daily Plan', icon: Calendar },
        { to: '/member/bugs', label: 'My Reported Bugs', icon: Bug },
        { to: '/profile', label: 'My Profile', icon: User }
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
          </div>

          {/* User Profile Summary Card (Clickable to /profile) */}
          <Link
            to="/profile"
            onClick={onClose}
            className="block p-3.5 mx-3 my-3 rounded-2xl bg-neutral-950 hover:bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition-all duration-250 cursor-pointer group shadow-sm hover:shadow-[0_4px_20px_rgba(0,0,0,0.4)] active:scale-[0.98]"
            title="View and Edit Profile"
          >
            <div className="flex items-center gap-3">
              <Avatar
                src={profile?.avatar_url}
                name={profile?.full_name}
                size="lg"
                rounded="rounded-xl"
                className="group-hover:border-neutral-500 transition-all duration-250 shadow-inner"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate group-hover:text-emerald-400 transition-colors duration-200">
                  {profile?.full_name || 'Team Member'}
                </p>
                <p className="text-[11px] text-neutral-400 truncate">
                  {profile?.email}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-neutral-600 group-hover:text-white group-hover:translate-x-1 transition-all duration-200 shrink-0" />
            </div>
            <div className="mt-2.5 pt-2 border-t border-neutral-800/80 flex items-center justify-between">
              <span className="text-[9px] uppercase font-bold tracking-wider text-neutral-400">
                ROLE
              </span>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-neutral-900 text-neutral-300 border border-neutral-700">
                {role}
              </span>
            </div>
          </Link>

          {/* Navigation Items */}
          <div className="px-3 space-y-1">
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
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
                    `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 active:scale-[0.98] ${
                      isActive
                        ? 'bg-white text-black shadow-md font-bold'
                        : 'text-neutral-400 hover:text-white hover:bg-neutral-900 hover:translate-x-1'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </div>

        {/* Bottom Section: Quick Report Bug Button (Members Only) & Sign Out */}
        <div className="p-4 border-t border-neutral-800 space-y-2">
          {!isFounder && !isAdmin && (
            <button
              type="button"
              onClick={() => setIsReportBugModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-red-400 bg-red-950/40 hover:bg-red-900/60 border border-red-800/60 rounded-xl transition-all duration-200 cursor-pointer shadow-sm btn-danger-smooth"
            >
              <Bug className="w-3.5 h-3.5" />
              <span>Report a Bug</span>
            </button>
          )}

          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-xl transition-all duration-200 active:scale-[0.98] cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Report Bug Modal (Members Only) */}
      {!isFounder && !isAdmin && (
        <ReportBugModal
          isOpen={isReportBugModalOpen}
          onClose={() => setIsReportBugModalOpen(false)}
        />
      )}
    </>
  );
};

export default Sidebar;
