import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  X,
  Send,
  Loader2,
  Bot,
  User,
  Zap,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Maximize2,
  Minimize2,
  BarChart3,
  Calendar,
  Building2,
  Bug,
  Award,
  Shield,
  HelpCircle,
  Copy,
  Check
} from 'lucide-react';
import { geminiApi } from '../../api/geminiApi';
import { useAuth } from '../../hooks/useAuth';
import { usePresence } from '../../context/PresenceContext';
import { tasksApi } from '../../api/tasksApi';
import { departmentsApi } from '../../api/departmentsApi';
import { planningApi } from '../../api/planningApi';
import { bugsApi } from '../../api/bugsApi';
import { format, isPast, parseISO } from 'date-fns';
import MarkdownRenderer from '../common/MarkdownRenderer';

export const AICopilotDrawer = ({ isOpen, onClose }) => {
  const { user, profile, role, isFounder, isAdmin, isFoundingAdvisor } = useAuth();
  const { onlineCount } = usePresence();

  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isSlideActive, setIsSlideActive] = useState(false);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 'welcome-1',
      sender: 'copilot',
      text: `Hello **${profile?.full_name || 'Team Member'}**! I am your **TeamSync AI Copilot**.\n\nI have live visibility across your dashboard tasks, daily workforce planning, bug reports, and department workloads. How can I assist your operations today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [copiedId, setCopiedId] = useState(null);
  const [isBriefingLoading, setIsBriefingLoading] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Ultra-smooth mount and slide coordination
  useEffect(() => {
    let timer;
    let raf1, raf2;
    if (isOpen) {
      setShouldRender(true);
      // Double RAF ensures the initial off-screen frame (translate-x-full & opacity-0)
      // is rendered in the DOM before animating into open state
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          setIsSlideActive(true);
        });
      });
    } else {
      setIsSlideActive(false);
      timer = setTimeout(() => {
        setShouldRender(false);
      }, 420);
    }
    return () => {
      if (timer) clearTimeout(timer);
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [isOpen]);

  // Handle ESC key to smoothly close Copilot
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock background scroll while Copilot is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (isSlideActive) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isSlideActive]);

  // Smoothly focus input without stealing frames from the slide animation
  useEffect(() => {
    if (isSlideActive) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isSlideActive]);

  // Fetch real-time system snapshot to feed into AI
  const getSystemSnapshot = async () => {
    try {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const [tasks, departments, planData, bugs] = await Promise.all([
        tasksApi.getTasks().catch(() => []),
        departmentsApi.getDepartments().catch(() => []),
        planningApi.getDailyAllocations(todayStr).catch(() => ({ assignments: [] })),
        bugsApi.getBugs().catch(() => [])
      ]);

      const overdueTasks = tasks.filter(
        t => t.status !== 'COMPLETED' && t.deadline && isPast(parseISO(t.deadline))
      );

      const urgentTasks = tasks
        .filter(t => t.priority === 'URGENT' || t.priority === 'HIGH')
        .slice(0, 5)
        .map(t => ({ title: t.title, priority: t.priority, status: t.status, assignee: t.assignee?.full_name }));

      return {
        totalTasks: tasks.length,
        completedTasks: tasks.filter(t => t.status === 'COMPLETED').length,
        inProgressTasks: tasks.filter(t => t.status === 'IN_PROGRESS').length,
        todoTasks: tasks.filter(t => t.status === 'TODO').length,
        overdueTasks: overdueTasks.length,
        departments: departments.map(d => ({ id: d.id, name: d.name })),
        onlineCount,
        openBugsCount: bugs.filter(b => b.status === 'OPEN' || b.status === 'IN_PROGRESS').length,
        criticalBugsCount: bugs.filter(b => b.severity === 'CRITICAL' && b.status !== 'RESOLVED').length,
        todayAllocationsCount: planData.assignments?.length || 0,
        urgentTasks
      };
    } catch {
      return { onlineCount };
    }
  };

  const handleSendMessage = async (customPrompt = null) => {
    const textToSend = customPrompt || input.trim();
    if (!textToSend || loading) return;

    const userMsg = {
      id: 'user-' + Date.now(),
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!customPrompt) setInput('');
    setLoading(true);

    try {
      const snapshot = await getSystemSnapshot();
      const history = messages.map(m => ({
        role: m.sender === 'user' ? 'user' : 'model',
        content: m.text
      }));

      const reply = await geminiApi.askSystemCopilot({
        message: textToSend,
        role: role || 'MEMBER',
        userName: profile?.full_name || 'Team Member',
        systemSnapshot: snapshot,
        conversationHistory: history
      });

      const copilotMsg = {
        id: 'copilot-' + Date.now(),
        sender: 'copilot',
        text: reply || 'I analyzed the workspace state. Let me know if you need deeper breakdowns!',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, copilotMsg]);
    } catch (err) {
      const errorMsg = {
        id: 'err-' + Date.now(),
        sender: 'copilot',
        text: `⚠️ **AI Service Notice**: ${err.message || 'Unable to connect to Gemini API.'} Please check your API key configuration.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isError: true
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  // Quick Action: Daily Executive Briefing
  const handleGenerateBriefing = async () => {
    if (isBriefingLoading) return;
    setIsBriefingLoading(true);
    try {
      const snapshot = await getSystemSnapshot();
      const briefing = await geminiApi.generateDailyBriefing({
        role: role || 'FOUNDER',
        userName: profile?.full_name || 'Leader',
        systemSnapshot: snapshot
      });

      setMessages(prev => [
        ...prev,
        {
          id: 'briefing-' + Date.now(),
          sender: 'copilot',
          text: briefing,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: 'err-' + Date.now(),
          sender: 'copilot',
          text: `⚠️ Failed to generate daily briefing: ${err.message}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isError: true
        }
      ]);
    } finally {
      setIsBriefingLoading(false);
    }
  };

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleResetChat = () => {
    setMessages([
      {
        id: 'welcome-reset',
        sender: 'copilot',
        text: `Chat reset. I am ready with fresh workspace telemetry. What would you like to analyze next?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  // Role Quick Prompt Suggestions
  const getPromptSuggestions = () => {
    if (isFounder) {
      return [
        { label: '📊 Analyze Workforce Velocity', prompt: 'Analyze our current task completion velocity and department staffing efficiency.' },
        { label: '⚠️ Bottleneck & Overdue Risks', prompt: 'Which tasks or departments currently have overdue items or execution bottlenecks?' },
        { label: '🐛 Critical Bugs Overview', prompt: 'Summarize all open high/critical severity bug reports that require executive attention.' },
        { label: '🏢 Department Balance', prompt: 'How is our headcount distributed across departments today vs our workload demand?' }
      ];
    }
    if (isAdmin) {
      return [
        { label: '📅 Daily Plan Optimization', prompt: 'Evaluate our daily workforce allocations for today. Are any departments understaffed?' },
        { label: '🎯 Task Backlog Breakdown', prompt: 'Review our active task queue and highlight which tasks need immediate follow-up.' },
        { label: '⚡ Bug Triage Recommendations', prompt: 'What open bugs need assignment to engineer tasks?' }
      ];
    }
    if (isFoundingAdvisor) {
      return [
        { label: '🛡️ Strategic Milestone Health', prompt: 'Provide a strategic audit of team milestone execution, risks, and governance health.' },
        { label: '📈 Quality & Bug Metrics', prompt: 'Assess current product quality trends based on reported vs resolved bugs.' }
      ];
    }
    return [
      { label: '📋 My Daily Priorities', prompt: 'What are the top focus priorities and key tasks assigned for today?' },
      { label: '🏢 Department Schedule', prompt: 'Explain my current department allocation and how it contributes to the team.' }
    ];
  };

  const suggestions = getPromptSuggestions();

  if (!shouldRender) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-end transition-opacity duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        isSlideActive ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="TeamSync AI Copilot"
    >
      {/* Backdrop with smooth blur and fade */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isSlideActive ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Drawer Container */}
      <div
        className={`relative w-full max-w-lg bg-neutral-950/95 backdrop-blur-2xl border-l border-neutral-800/90 text-neutral-100 flex flex-col h-full ai-drawer-glow z-10 will-change-transform transform-gpu transition-transform duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isSlideActive ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Animated Left Ambient Accent Laser Line */}
        <div className="absolute top-0 left-0 bottom-0 w-[1.5px] bg-gradient-to-b from-purple-500/0 via-purple-500/70 via-indigo-500/50 to-cyan-400/0 pointer-events-none" />

        {/* Header */}
        <div
          className={`p-4 border-b border-neutral-850 flex items-center justify-between bg-black/70 backdrop-blur-md transition-all duration-500 delay-75 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isSlideActive ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="relative w-9 h-9 rounded-xl overflow-hidden shadow-lg shrink-0 border border-neutral-750 bg-black p-0.5 group">
              <span className="absolute -inset-0.5 rounded-xl bg-gradient-to-tr from-purple-500 to-cyan-400 opacity-60 blur-xs animate-pulse -z-10" />
              <img src="/ai-logo.png" alt="TeamSync AI" className="w-full h-full object-cover rounded-lg" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-bold text-white tracking-tight">TeamSync Copilot</h2>
                <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-950/90 border border-emerald-700/80 text-emerald-400 font-bold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Active
                </span>
              </div>
              <p className="text-[10px] text-neutral-400">
                Live Telemetry &bull; Role: <span className="text-neutral-200 font-semibold">{role}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleResetChat}
              className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-900 transition-all duration-200 cursor-pointer hover:rotate-180"
              title="Reset conversation"
            >
              <RotateCcw className="w-3.5 h-3.5 transition-transform duration-300" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-900 transition-all duration-200 cursor-pointer hover:scale-110 active:scale-95"
              title="Close Copilot (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Executive Briefing Bar */}
        <div
          className={`px-4 py-2.5 bg-neutral-900/60 border-b border-neutral-850 flex items-center justify-between gap-2 transition-all duration-500 delay-100 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isSlideActive ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
          }`}
        >
          <span className="text-[11px] text-neutral-300 flex items-center gap-1.5 font-medium">
            <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-bounce-sm" />
            <span>Instant Workspace Intelligence</span>
          </span>
          <button
            type="button"
            onClick={handleGenerateBriefing}
            disabled={isBriefingLoading}
            className="px-2.5 py-1 rounded-lg bg-white text-black hover:bg-neutral-200 btn-shimmer btn-primary-smooth text-[11px] font-bold flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
          >
            {isBriefingLoading ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Briefing...</span>
              </>
            ) : (
              <>
                <FileText className="w-3 h-3 text-black" />
                <span>Generate Daily Briefing</span>
              </>
            )}
          </button>
        </div>

        {/* Chat Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-2.5 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.sender === 'copilot' && (
                <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 border border-neutral-750 mt-0.5 shadow-xs">
                  <img src="/ai-logo.png" alt="AI" className="w-full h-full object-cover" />
                </div>
              )}

              <div
                className={`max-w-[92%] sm:max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs relative group ${
                  m.sender === 'user'
                    ? 'bg-neutral-900 text-white border border-neutral-750 rounded-br-xs'
                    : m.isError
                    ? 'bg-red-950/40 border border-red-800 text-red-200 rounded-bl-xs'
                    : 'bg-neutral-900/70 border border-neutral-800/80 text-neutral-200 rounded-bl-xs leading-relaxed shadow-sm'
                }`}
              >
                {/* Markdown text & table rendering */}
                <div className="break-words">
                  <MarkdownRenderer content={m.text} />
                </div>

                <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-neutral-500">
                  <span>{m.timestamp}</span>
                  {m.sender === 'copilot' && (
                    <button
                      onClick={() => handleCopy(m.id, m.text)}
                      className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-white transition flex items-center gap-1 cursor-pointer"
                      title="Copy response"
                    >
                      {copiedId === m.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {m.sender === 'user' && (
                <div className="w-6 h-6 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-center text-neutral-300 shrink-0 mt-0.5 font-bold text-[10px]">
                  {profile?.full_name?.charAt(0) || 'U'}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-2.5 items-start">
              <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 border border-purple-500/80 shadow-sm animate-pulse mt-0.5">
                <img src="/ai-logo.png" alt="AI" className="w-full h-full object-cover" />
              </div>
              <div className="px-3.5 py-2.5 rounded-2xl bg-neutral-900/60 border border-neutral-800 text-xs text-neutral-400 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
                <span>Analyzing workspace telemetry...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div className="p-3 border-t border-neutral-850 bg-black/40">
          <div className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider mb-2 flex items-center gap-1">
            <HelpCircle className="w-3 h-3" />
            <span>Suggested Insights</span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {suggestions.map((s, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(s.prompt)}
                disabled={loading}
                className="px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-neutral-300 text-[11px] font-medium whitespace-nowrap transition-all duration-200 cursor-pointer hover:border-purple-500/40 hover:text-white hover:scale-[1.02] active:scale-95 disabled:opacity-50 shrink-0"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="p-3 border-t border-neutral-850 bg-black/90 flex items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask Copilot about tasks, departments, or system metrics...`}
            disabled={loading}
            className="flex-1 px-3.5 py-2.5 bg-neutral-900/90 border border-neutral-800 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/40 transition-all duration-200"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="p-2.5 rounded-xl bg-white text-black hover:bg-neutral-200 disabled:opacity-40 font-bold cursor-pointer shadow-md btn-shimmer btn-primary-smooth shrink-0"
            title="Send prompt"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AICopilotDrawer;
