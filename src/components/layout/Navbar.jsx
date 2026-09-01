import React from 'react';
import { Menu, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../../hooks/useAuth';

export const Navbar = ({ onToggleSidebar, title = 'Dashboard' }) => {
  const { profile, role } = useAuth();
  const todayFormatted = format(new Date(), 'EEEE, MMMM d, yyyy');

  return (
    <header className="h-16 px-4 md:px-8 bg-black/90 backdrop-blur-md border-b border-neutral-800 sticky top-0 z-30 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-900 rounded-lg transition lg:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h2 className="text-base md:text-lg font-bold text-white tracking-tight">
          {title}
        </h2>
      </div>

      <div className="flex items-center gap-3 md:gap-5">
        {/* Date indicator */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-400">
          <Calendar className="w-3.5 h-3.5 text-neutral-400" />
          <span>{todayFormatted}</span>
        </div>

        {/* User Info & Avatar */}
        <div className="flex items-center gap-2.5 pl-2 border-l border-neutral-800">
          <div className="relative">
            <div className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-700 flex items-center justify-center font-bold text-xs text-white">
              {profile?.full_name?.charAt(0) || 'U'}
            </div>
            <span
              className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-black"
              title="Active now"
            />
          </div>
          <div className="hidden md:block text-left">
            <p className="text-xs font-semibold text-neutral-200 line-clamp-1">
              {profile?.full_name}
            </p>
            <p className="text-[10px] text-neutral-400 uppercase font-medium tracking-wider">
              {role}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
