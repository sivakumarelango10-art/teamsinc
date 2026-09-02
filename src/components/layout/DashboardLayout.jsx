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

      {/* Floating AI Copilot Trigger Button (Bottom Right) */}
      <button
        type="button"
        onClick={() => setCopilotOpen(true)}
        className="fixed bottom-6 right-6 z-40 px-3.5 py-2.5 rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-500 text-white font-bold text-xs shadow-2xl hover:scale-105 active:scale-95 transition-all duration-200 flex items-center gap-2 cursor-pointer border border-white/20 group animate-fadeIn"
        title="Open TeamSync AI Copilot (Ctrl + K)"
      >
        <Sparkles className="w-4 h-4 text-white animate-spin [animation-duration:4s]" />
        <span className="hidden sm:inline">AI Copilot</span>
        <span className="text-[10px] bg-black/40 px-1.5 py-0.5 rounded font-mono hidden md:inline">
          Ctrl+K
        </span>
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
