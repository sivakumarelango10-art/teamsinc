import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Menu, Calendar, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../../hooks/useAuth';
import Avatar from '../common/Avatar';

const LiveClock = React.memo(() => {
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 text-xs font-mono text-neutral-300 shadow-sm">
      <Calendar className="w-3.5 h-3.5 text-neutral-400" />
      <span>{format(currentDateTime, 'EEE, MMM d, yyyy')}</span>
      <span className="text-neutral-600">•</span>
      <span className="text-white font-bold">{format(currentDateTime, 'hh:mm:ss a')}</span>
    </div>
  );
});

export const Navbar = ({ onToggleSidebar, onToggleCopilot, title = 'Dashboard' }) => {
  const { profile, role, isFounder, isAdmin, isFoundingAdvisor } = useAuth();
  const canAccessAI = Boolean(isFounder || isAdmin || isFoundingAdvisor);

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
        <LiveClock />

        {/* AI Copilot Trigger (Leadership Only) */}
        {canAccessAI && onToggleCopilot && (
          <button
            type="button"
            onClick={onToggleCopilot}
            className="px-2.5 py-1.5 rounded-xl text-neutral-200 hover:text-white bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 hover:border-purple-500/50 transition-all duration-250 flex items-center gap-2 text-xs font-bold cursor-pointer shadow-sm group hover:shadow-[0_0_15px_rgba(168,85,247,0.2)] active:scale-95"
            title="Open TeamSinc AI Copilot"
          >
            <div className="w-4 h-4 rounded-full overflow-hidden shrink-0 border border-neutral-700 group-hover:border-purple-400 transition-colors duration-250">
              <img src="/ai-logo.png" alt="AI" className="w-full h-full object-cover" />
            </div>
            <span className="hidden md:inline">AI Copilot</span>
          </button>
        )}

        {/* Quick Team Chat Link */}
        <Link
          to="/chat"
          className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition-all duration-250 flex items-center gap-1.5 text-xs font-medium active:scale-95"
          title="Open Company Team Chat"
        >
          <MessageSquare className="w-4 h-4 text-white" />
          <span className="hidden lg:inline text-xs">Chat</span>
        </Link>

        {/* User Info & Avatar (Clickable to /profile) */}
        <Link
          to="/profile"
          className="flex items-center gap-2.5 pl-2 border-l border-neutral-800 hover:opacity-90 transition-all duration-250 cursor-pointer group active:scale-98"
          title="View My Profile"
        >
          <Avatar
            src={profile?.avatar_url}
            name={profile?.full_name}
            size="w-8 h-8 text-xs"
            rounded="rounded-xl"
            showStatus={true}
            status="online"
            statusSize="xs"
            className="group-hover:shadow-[0_0_12px_rgba(255,255,255,0.12)] transition-all duration-250"
          />
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
