import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import { useAuth } from '../../hooks/useAuth';

const AICopilotDrawer = React.lazy(() => import('../ai/AICopilotDrawer'));

export const DashboardLayout = ({ title, children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotMounted, setCopilotMounted] = useState(false);
  const { isFounder, isAdmin, isFoundingAdvisor } = useAuth();
  const location = useLocation();

  // AI Copilot is exclusively for Founder, Admin, and Founding Advisor (hidden for normal Members)
  const canAccessAI = Boolean(isFounder || isAdmin || isFoundingAdvisor);
  const isChatPage = location.pathname.startsWith('/chat');

  // Lazily mount Copilot on first open so transitions play smoothly without destroying instance mid-animation
  useEffect(() => {
    if (copilotOpen && !copilotMounted) {
      setCopilotMounted(true);
    }
  }, [copilotOpen, copilotMounted]);

  // Global hotkey Ctrl+K / Alt+A to toggle Copilot (Leadership only)
  useEffect(() => {
    if (!canAccessAI) return;
    const handleKeyDown = (e) => {
      if ((e.ctrlKey && e.key.toLowerCase() === 'k') || (e.altKey && e.key.toLowerCase() === 'a')) {
        e.preventDefault();
        setCopilotOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canAccessAI]);

  return (
    <div className="min-h-screen bg-black flex text-neutral-100 relative">
      {/* Sidebar Navigation */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <Navbar
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          onToggleCopilot={canAccessAI ? () => setCopilotOpen(true) : null}
          title={title}
        />

        <main className={`flex-1 ${isChatPage ? 'p-0 overflow-hidden' : 'p-3 md:p-6 overflow-y-auto'} bg-black flex flex-col page-enter transition-all duration-300`}>
          {children || <Outlet />}
        </main>
      </div>

      {/* WhatsApp Meta-AI Style Floating Action Button (Only for Founder, Admin, Advisor; hidden on /chat) */}
      {canAccessAI && !isChatPage && (
        <div className="fixed bottom-6 right-6 z-40">
          {/* Ambient Glow Aura */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-purple-600 to-cyan-400 blur-md opacity-45 animate-ai-aura pointer-events-none" />

          <button
            type="button"
            onClick={() => setCopilotOpen(true)}
            className="relative w-12 h-12 min-w-[48px] min-h-[48px] max-w-[48px] max-h-[48px] rounded-full bg-gradient-to-tr from-purple-600 via-indigo-500 to-cyan-400 p-[2px] shadow-[0_4px_24px_rgba(99,102,241,0.5)] hover:shadow-[0_6px_32px_rgba(168,85,247,0.75)] hover:scale-110 active:scale-95 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] flex items-center justify-center cursor-pointer group ai-gradient-border"
            title="TeamSync AI Copilot (Ctrl + K)"
            aria-label="Open AI Copilot"
          >
            <div className="w-full h-full bg-neutral-950 rounded-full overflow-hidden flex items-center justify-center p-0.5">
              <img
                src="/ai-logo.png"
                alt="AI Copilot"
                className="w-full h-full object-cover object-center rounded-full group-hover:scale-108 transition-transform duration-300 select-none pointer-events-none"
              />
            </div>

            {/* Live Indicator Dot */}
            <span className="absolute top-0 right-0 w-3 h-3 bg-emerald-400 border-2 border-neutral-950 rounded-full shadow-xs" />
          </button>
        </div>
      )}

      {/* AI Copilot Drawer (Leadership only, dynamically loaded on first open, transitions smoothly on open/close) */}
      {canAccessAI && (copilotOpen || copilotMounted) && (
        <React.Suspense fallback={null}>
          <AICopilotDrawer
            isOpen={copilotOpen}
            onClose={() => setCopilotOpen(false)}
          />
        </React.Suspense>
      )}
    </div>
  );
};

export default DashboardLayout;
