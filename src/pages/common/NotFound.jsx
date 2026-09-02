import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Home, 
  Compass, 
  MessageSquare, 
  CheckSquare, 
  User, 
  Bug, 
  FileQuestion,
  Search
} from 'lucide-react';
import BrandLogo from '../../components/common/BrandLogo';
import { useAuth } from '../../hooks/useAuth';
import ReportBugModal from '../../components/bugs/ReportBugModal';

export const NotFound = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const [isBugModalOpen, setIsBugModalOpen] = useState(false);

  // Determine dashboard link based on role
  const getDashboardPath = () => {
    if (!user || !profile) return '/login';
    if (profile.role === 'FOUNDER') return '/founder/dashboard';
    if (profile.role === 'ADMIN') return '/admin/dashboard';
    if (profile.role === 'FOUNDING_ADVISOR') return '/founding-advisor/dashboard';
    return '/member/dashboard';
  };

  const dashboardPath = getDashboardPath();

  const handleGoBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(dashboardPath);
    }
  };

  return (
    <div className="min-h-screen bg-black text-neutral-100 flex flex-col justify-between relative overflow-hidden selection:bg-white selection:text-black">
      {/* Background ambient lighting effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-neutral-900/40 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-72 h-72 bg-blue-950/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-10 right-10 w-72 h-72 bg-purple-950/20 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header */}
      <header className="relative z-10 w-full px-6 py-5 flex items-center justify-between border-b border-neutral-900/80 backdrop-blur-md">
        <Link to={dashboardPath} className="flex items-center gap-2 transition hover:opacity-85">
          <BrandLogo size="default" />
        </Link>
        <div className="flex items-center gap-3">
          {user ? (
            <Link
              to={dashboardPath}
              className="px-3.5 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 text-xs font-medium transition"
            >
              Back to App
            </Link>
          ) : (
            <Link
              to="/login"
              className="px-3.5 py-1.5 rounded-lg bg-white text-black hover:bg-neutral-200 text-xs font-bold transition"
            >
              Sign In
            </Link>
          )}
        </div>
      </header>

      {/* Main 404 Hero Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-12 text-center max-w-2xl mx-auto w-full">
        {/* Subtle Status Pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-900/90 border border-neutral-800 text-neutral-400 text-xs font-mono mb-6 shadow-sm">
          <FileQuestion className="w-3.5 h-3.5 text-neutral-400" />
          <span>ERROR 404 &bull; RESOURCE_NOT_FOUND</span>
        </div>

        {/* Large Gradient 404 Display */}
        <div className="relative mb-4">
          <h1 className="text-7xl sm:text-9xl font-black tracking-tighter bg-gradient-to-b from-white via-neutral-200 to-neutral-700 bg-clip-text text-transparent select-none">
            404
          </h1>
          <div className="absolute inset-0 blur-2xl bg-white/5 pointer-events-none" />
        </div>

        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight mb-3">
          Page Not Found
        </h2>

        <p className="text-sm text-neutral-400 max-w-md mx-auto mb-4 leading-relaxed">
          The page or resource you requested cannot be located. It might have been moved, deleted, or the address URL was mistyped.
        </p>

        {/* Path Indicator */}
        {location.pathname && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-neutral-950 border border-neutral-900 text-[11px] font-mono text-neutral-400 mb-8 max-w-full overflow-hidden text-ellipsis">
            <span className="text-neutral-400">Path:</span>
            <span className="text-neutral-300 font-semibold truncate">{location.pathname}</span>
          </div>
        )}

        {/* Primary Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3 w-full max-w-sm mb-10">
          <button
            type="button"
            onClick={handleGoBack}
            className="flex-1 min-w-[140px] px-4 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-200 text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
          <Link
            to={dashboardPath}
            className="flex-1 min-w-[140px] px-4 py-2.5 rounded-xl bg-white text-black hover:bg-neutral-200 text-xs font-bold flex items-center justify-center gap-2 transition shadow-md active:scale-95"
          >
            <Home className="w-4 h-4" />
            {user ? 'Go to Dashboard' : 'Go to Login'}
          </Link>
        </div>

        {/* Quick Navigation Shortcuts (If Authenticated) */}
        {user && (
          <div className="w-full bg-neutral-950/80 border border-neutral-800/80 rounded-2xl p-4 text-left shadow-lg backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-neutral-400" />
                Quick Destinations
              </span>
              <span className="text-[10px] text-neutral-400 font-medium">TeamSync Navigation</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Link
                to={dashboardPath}
                className="flex flex-col items-center justify-center p-3 rounded-xl bg-neutral-900/50 hover:bg-neutral-900 border border-neutral-800/60 hover:border-neutral-700 transition group text-center"
              >
                <Home className="w-4 h-4 text-neutral-400 group-hover:text-white mb-1.5 transition" />
                <span className="text-xs font-semibold text-neutral-200 group-hover:text-white">Dashboard</span>
              </Link>

              <Link
                to="/chat"
                className="flex flex-col items-center justify-center p-3 rounded-xl bg-neutral-900/50 hover:bg-neutral-900 border border-neutral-800/60 hover:border-neutral-700 transition group text-center"
              >
                <MessageSquare className="w-4 h-4 text-neutral-400 group-hover:text-white mb-1.5 transition" />
                <span className="text-xs font-semibold text-neutral-200 group-hover:text-white">Team Chat</span>
              </Link>

              <Link
                to={profile?.role === 'MEMBER' ? '/member/tasks' : profile?.role === 'FOUNDER' || profile?.role === 'ADMIN' ? '/admin/tasks' : '/founding-advisor/tasks'}
                className="flex flex-col items-center justify-center p-3 rounded-xl bg-neutral-900/50 hover:bg-neutral-900 border border-neutral-800/60 hover:border-neutral-700 transition group text-center"
              >
                <CheckSquare className="w-4 h-4 text-neutral-400 group-hover:text-white mb-1.5 transition" />
                <span className="text-xs font-semibold text-neutral-200 group-hover:text-white">Tasks</span>
              </Link>

              <Link
                to="/profile"
                className="flex flex-col items-center justify-center p-3 rounded-xl bg-neutral-900/50 hover:bg-neutral-900 border border-neutral-800/60 hover:border-neutral-700 transition group text-center"
              >
                <User className="w-4 h-4 text-neutral-400 group-hover:text-white mb-1.5 transition" />
                <span className="text-xs font-semibold text-neutral-200 group-hover:text-white">My Profile</span>
              </Link>
            </div>
          </div>
        )}

        {/* Broken Link Report Helper */}
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-neutral-400">
          <span>Think this is a mistake?</span>
          <button
            type="button"
            onClick={() => setIsBugModalOpen(true)}
            className="text-neutral-300 hover:text-white underline underline-offset-4 flex items-center gap-1 transition cursor-pointer font-medium"
          >
            <Bug className="w-3.5 h-3.5 text-neutral-400" />
            Report an issue
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full px-6 py-4 text-center border-t border-neutral-900 text-xs text-neutral-400">
        &copy; {new Date().getFullYear()} TeamSync Platform. All rights reserved.
      </footer>

      {/* Bug Report Modal */}
      {isBugModalOpen && (
        <ReportBugModal
          isOpen={isBugModalOpen}
          onClose={() => setIsBugModalOpen(false)}
          defaultContext={`404 Page Not Found error encountered at path: ${location.pathname}`}
        />
      )}
    </div>
  );
};

export default NotFound;
