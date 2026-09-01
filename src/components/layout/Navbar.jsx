import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Menu, Calendar, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../../hooks/useAuth';

export const Navbar = ({ onToggleSidebar, title = 'Dashboard' }) => {
  const { profile, role } = useAuth();
  const [currentDateTime, setCurrentDateTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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

      <div className="flex items-center gap-3 md:gap-4">
        {/* Real-time Live Date & Clock indicator */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 text-xs font-mono text-neutral-300 shadow-sm">
          <Calendar className="w-3.5 h-3.5 text-neutral-400" />
          <span>{format(currentDateTime, 'EEE, MMM d, yyyy')}</span>
          <span className="text-neutral-600">•</span>
          <span className="text-white font-bold">{format(currentDateTime, 'hh:mm:ss a')}</span>
        </div>

        {/* Quick Team Chat Link */}
        <Link
          to="/chat"
          className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition flex items-center gap-1.5 text-xs font-medium"
          title="Open Company Team Chat"
        >
          <MessageSquare className="w-4 h-4 text-white" />
          <span className="hidden lg:inline text-xs">Chat</span>
        </Link>

        {/* User Info & Avatar (Clickable to /profile) */}
        <Link
          to="/profile"
          className="flex items-center gap-2.5 pl-2 border-l border-neutral-800 hover:opacity-85 transition cursor-pointer group"
          title="View My Profile"
        >
          <div className="relative">
            <div className="w-8 h-8 rounded-xl bg-neutral-900 border border-neutral-700 group-hover:border-neutral-500 flex items-center justify-center font-bold text-xs text-white overflow-hidden transition shadow-sm">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.full_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{profile?.full_name?.charAt(0) || 'U'}</span>
              )}
            </div>
            <span
              className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-black"
              title="Active now"
            />
          </div>
          <div className="hidden md:block text-left">
            <p className="text-xs font-semibold text-neutral-200 line-clamp-1 group-hover:text-white transition">
              {profile?.full_name || 'Team Member'}
            </p>
            <p className="text-[10px] text-neutral-400 uppercase font-medium tracking-wider">
              {role}
            </p>
          </div>
        </Link>
      </div>
    </header>
  );
};

export default Navbar;
