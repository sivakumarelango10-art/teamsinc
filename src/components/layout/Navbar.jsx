import React from 'react';
import { Menu, Bell, Calendar, User } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../../hooks/useAuth';

export const Navbar = ({ onToggleSidebar, title = 'Dashboard' }) => {
  const { profile, role, isFounder, isAdmin } = useAuth();
  const todayFormatted = format(new Date(), 'EEEE, MMMM d, yyyy');

  return (
    <header className="h-16 px-4 md:px-8 bg-slate-900/80 backdrop-blur-md border-b border-slate-800/80 sticky top-0 z-30 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition lg:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h2 className="text-base md:text-lg font-bold text-white tracking-tight">
          {title}
        </h2>
      </div>

      <div className="flex items-center gap-3 md:gap-5">
        {/* Date indicator */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400">
          <Calendar className="w-3.5 h-3.5 text-indigo-400" />
          <span>{todayFormatted}</span>
        </div>

        {/* User Info & Avatar */}
        <div className="flex items-center gap-2.5 pl-2 border-l border-slate-800">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center font-bold text-xs text-white shadow-md">
            {profile?.full_name?.charAt(0) || 'U'}
          </div>
          <div className="hidden md:block text-left">
            <p className="text-xs font-semibold text-slate-200 line-clamp-1">
              {profile?.full_name}
            </p>
            <p className="text-[10px] text-slate-400 uppercase font-medium tracking-wider">
              {role}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
