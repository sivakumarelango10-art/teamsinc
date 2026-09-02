import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import AICopilotDrawer from '../ai/AICopilotDrawer';
import { Sparkles } from 'lucide-react';

export const DashboardLayout = ({ title, children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);

  // Global hotkey Ctrl+K / Alt+A to toggle Copilot
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey && e.key.toLowerCase() === 'k') || (e.altKey && e.key.toLowerCase() === 'a')) {
        e.preventDefault();
        setCopilotOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
          onToggleCopilot={() => setCopilotOpen(true)}
          title={title}
        />

        <main className="flex-1 p-3 md:p-6 overflow-y-auto bg-black flex flex-col page-enter transition-all duration-300">
          {children || <Outlet />}
        </main>
      </div>

      {/* Floating AI Copilot Trigger Symbol Button (Bottom Right) */}
      <button
        type="button"
        onClick={() => setCopilotOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-13 h-13 rounded-full bg-gradient-to-tr from-purple-600 via-indigo-500 to-cyan-400 p-[2px] shadow-[0_4px_25px_rgba(147,51,234,0.4)] hover:shadow-[0_4px_35px_rgba(99,102,241,0.65)] hover:scale-110 active:scale-95 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] flex items-center justify-center cursor-pointer group animate-fadeIn"
        title="AI Copilot (Ctrl + K)"
        aria-label="Open AI Copilot"
      >
        <div className="w-full h-full bg-black rounded-full overflow-hidden flex items-center justify-center">
          <img
            src="/ai-logo.png"
            alt="AI Copilot"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 select-none pointer-events-none"
          />
        </div>
      </button>

      {/* AI Copilot Drawer */}
      <AICopilotDrawer
        isOpen={copilotOpen}
        onClose={() => setCopilotOpen(false)}
      />
    </div>
  );
};

export default DashboardLayout;
