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
import { usersApi } from '../../api/usersApi';
import MarkdownRenderer from '../common/MarkdownRenderer';
import ActionConfirmationCard from './ActionConfirmationCard';
import {
  classifyIntentRuleBased,
  resolveDepartment,
  resolveUser,
  extractPriority,
  isConfirmationPhrase,
  isCancellationPhrase,
  executeAgentAction
} from '../../utils/aiAgentEngine';

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
      text: `Hello **${profile?.full_name || 'Team Member'}**! I am your **TeamSinc AI Copilot**.\n\nI have live visibility across your dashboard tasks, daily workforce planning, bug reports, and department workloads. How can I assist your operations today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [copiedId, setCopiedId] = useState(null);
  const [isBriefingLoading, setIsBriefingLoading] = useState(false);

  // Agent State: Pending Consequential Action & Context Memory
  const [pendingAction, setPendingAction] = useState(null);
  const [lastContextItem, setLastContextItem] = useState(null);
  const [executingActionId, setExecutingActionId] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const isExecutingRef = useRef(false);

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

  // Controlled Action Execution: Direct backend operation with real verification
  const handleExecutePendingAction = async (actionToExecute) => {
    const act = actionToExecute || pendingAction;
    if (!act || act.status !== 'PENDING') return;

    // Strict concurrency lock: Prevent double-click or rapid Enter race conditions
    if (isExecutingRef.current) return;
    isExecutingRef.current = true;

    setExecutingActionId(act.id);

    try {
      const result = await executeAgentAction({
        action: act,
        currentUser: profile || user,
        role: role || 'MEMBER'
      });

      // Update the confirmation card to COMPLETED
      setMessages(prev =>
        prev.map(m =>
          m.action?.id === act.id
            ? { ...m, action: { ...m.action, status: 'COMPLETED', result } }
            : m
        )
      );

      const successMsg = {
        id: 'agent-res-' + Date.now(),
        sender: 'copilot',
        text: `✅ **Operation Executed & Verified**\n\n${result.message}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, successMsg]);

      // Reset pending state
      setPendingAction(null);
      setLastContextItem(null);
    } catch (err) {
      console.error('Agent action execution failed:', err);
      const errMsg = {
        id: 'agent-err-' + Date.now(),
        sender: 'copilot',
        text: `⚠️ **Action Execution Failed**: ${err.message || 'The server rejected the request.'} Nothing was submitted.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isError: true
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      isExecutingRef.current = false;
      setExecutingActionId(null);
    }
  };

  const handleCancelPendingAction = (actionToCancel) => {
    const act = actionToCancel || pendingAction;
    if (act) {
      setMessages(prev =>
        prev.map(m =>
          m.action?.id === act.id
            ? { ...m, action: { ...m.action, status: 'CANCELLED' } }
            : m
        )
      );
    }

    setPendingAction(null);
    const cancelMsg = {
      id: 'agent-cancel-' + Date.now(),
      sender: 'copilot',
      text: 'Understood. I have cancelled the pending action. No changes were made.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages(prev => [...prev, cancelMsg]);
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
      // 1. Fetch live DB records: departments, users, and system snapshot
      const [departments, users, snapshot] = await Promise.all([
        departmentsApi.getDepartments().catch(() => []),
        usersApi.getUsers().catch(() => []),
        getSystemSnapshot().catch(() => ({}))
      ]);

      // 2. CHECK FOR ACTIVE PENDING ACTION (Confirmation / Cancellation / Modification)
      if (pendingAction && pendingAction.status === 'PENDING') {
        // A. Natural Language Confirmation: "yes", "ok", "sure", "do it", "confirm", etc.
        if (isConfirmationPhrase(textToSend)) {
          setLoading(false);
          await handleExecutePendingAction(pendingAction);
          return;
        }

        // B. Natural Language Cancellation: "no", "cancel", "stop", "never mind", etc.
        if (isCancellationPhrase(textToSend)) {
          setLoading(false);
          handleCancelPendingAction(pendingAction);
          return;
        }

        // C. Target Modification before confirmation (Department, Assignee, Priority)
        const deptChange = resolveDepartment(textToSend, departments);
        const userChange = resolveUser(textToSend, users);
        const priorityChange = extractPriority(textToSend);

        if (deptChange || userChange.match || priorityChange) {
          const updatedAction = {
            ...pendingAction,
            data: {
              ...pendingAction.data,
              ...(deptChange ? { department_id: deptChange.id } : {}),
              ...(userChange.match ? { assigned_to: userChange.match.id } : {}),
              ...(priorityChange ? { priority: priorityChange, severity: priorityChange } : {})
            },
            preview: {
              ...pendingAction.preview,
              ...(deptChange ? { departmentName: deptChange.name } : {}),
              ...(userChange.match ? { assigneeName: userChange.match.full_name } : {}),
              ...(priorityChange ? { priority: priorityChange } : {})
            }
          };

          setPendingAction(updatedAction);
          setMessages(prev =>
            prev.map(m => (m.action?.id === pendingAction.id ? { ...m, action: updatedAction } : m))
          );

          const changes = [];
          if (deptChange) changes.push(`destination to **${deptChange.name}**`);
          if (userChange.match) changes.push(`assignee to **${userChange.match.full_name}**`);
          if (priorityChange) changes.push(`priority to **${priorityChange}**`);

          const modMsg = {
            id: 'copilot-mod-' + Date.now(),
            sender: 'copilot',
            text: `Understood. I've updated the ${changes.join(' and ')}.\n\nWould you like me to proceed with this updated action?`,
            action: updatedAction,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };

          setMessages(prev => [...prev, modMsg]);
          setLoading(false);
          return;
        }
      }

      // 3. AGENT INTENT CLASSIFICATION & CONTEXT GENERATION
      const agentAnalysis = classifyIntentRuleBased({
        message: textToSend,
        departments,
        users,
        pendingAction
      });

      // CASE 0: UNAUTHORIZED REQUEST (Privilege Escalation or Credential Leak Probing)
      if (agentAnalysis.intent === 'UNAUTHORIZED_REQUEST') {
        const secMsg = {
          id: 'copilot-sec-' + Date.now(),
          sender: 'copilot',
          text: `🛡️ **Access Denied**: ${agentAnalysis.reason || 'Privilege escalation, secret inspection, and unauthorized administrative actions are strictly prevented by platform security.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isError: true
        };
        setMessages(prev => [...prev, secMsg]);
        setLoading(false);
        return;
      }

      // CASE A: REPORT_ISSUE or CREATE_BUG
      if (agentAnalysis.intent === 'REPORT_ISSUE' || agentAnalysis.intent === 'CREATE_BUG') {
        const issue = agentAnalysis.issue;
        const targetDept = resolveDepartment(issue.targetDeptName || 'Development', departments);
        const targetUser = issue.targetPersonName ? resolveUser(issue.targetPersonName, users) : { match: null };

        const newAction = {
          id: 'act-' + Date.now(),
          type: agentAnalysis.intent === 'CREATE_BUG' ? 'CREATE_BUG' : 'SEND_ISSUE',
          status: 'PENDING',
          data: {
            title: issue.title,
            description: issue.summary,
            severity: issue.priority || 'HIGH',
            department_id: targetDept?.id || null,
            assigned_to: targetUser.match?.id || null
          },
          preview: {
            title: issue.title,
            category: issue.category,
            priority: issue.priority || 'HIGH',
            departmentName: targetDept?.name || 'Development',
            assigneeName: targetUser.match?.full_name || null,
            impact: issue.impact
          }
        };

        setPendingAction(newAction);
        setLastContextItem(newAction);

        const responseText = [
          `I understand the issue.\n`,
          `**Issue:** ${issue.title}`,
          `**Summary:** ${issue.summary}`,
          `**Category:** ${issue.category}`,
          `**Impact:** ${issue.impact}`,
          `\n**Potential areas:**`,
          ...issue.potentialAreas.map(a => `• ${a}`),
          `\n**Priority:** ${issue.priority}`,
          `**Recommended Department:** ${targetDept?.name || 'Development'}${targetUser.match ? `\n**Target Assignee:** ${targetUser.match.full_name}` : ''}`,
          `\nWould you like me to send this issue to the **${targetDept?.name || 'Development'}** department?`
        ].join('\n');

        const copilotMsg = {
          id: 'copilot-' + Date.now(),
          sender: 'copilot',
          text: responseText,
          action: newAction,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        setMessages(prev => [...prev, copilotMsg]);
        setLoading(false);
        return;
      }

      // CASE B: CREATE_TASK
      if (agentAnalysis.intent === 'CREATE_TASK') {
        const userRole = (role || 'MEMBER').toUpperCase();

        // RLS Authorization Guard: Standard members cannot directly create enterprise tasks
        if (userRole !== 'FOUNDER' && userRole !== 'ADMIN') {
          const task = agentAnalysis.task;
          const targetDept = task.targetDeptName ? resolveDepartment(task.targetDeptName, departments) : null;

          const newAction = {
            id: 'act-' + Date.now(),
            type: 'SEND_ISSUE',
            status: 'PENDING',
            data: {
              title: task.title,
              description: `Task creation request submitted by team member: ${task.description}`,
              severity: task.priority || 'MEDIUM',
              department_id: targetDept?.id || null
            },
            preview: {
              title: task.title,
              priority: task.priority || 'MEDIUM',
              category: 'Member Work Request / Issue',
              departmentName: targetDept?.name || 'Development',
              impact: 'Submitted to department leadership for review and task creation.'
            }
          };

          setPendingAction(newAction);
          setLastContextItem(newAction);

          const memberNotice = [
            `ℹ️ **Role Notice**: Standard team members cannot directly insert enterprise backlog tasks.`,
            `However, I can submit this as a prioritized **Issue / Work Request** to the **${targetDept?.name || 'Development'}** department for management review.\n`,
            `**Request:** ${task.title}`,
            `**Priority:** ${task.priority}`,
            `**Target Department:** ${targetDept?.name || 'Development'}`,
            `\nWould you like me to submit this request to **${targetDept?.name || 'Development'}**?`
          ].join('\n');

          const copilotMsg = {
            id: 'copilot-' + Date.now(),
            sender: 'copilot',
            text: memberNotice,
            action: newAction,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };

          setMessages(prev => [...prev, copilotMsg]);
          setLoading(false);
          return;
        }

        const task = agentAnalysis.task;
        const targetDept = task.targetDeptName ? resolveDepartment(task.targetDeptName, departments) : null;
        const userResolution = task.targetPersonName ? resolveUser(task.targetPersonName, users) : { match: null, ambiguous: [] };

        if (userResolution.ambiguous && userResolution.ambiguous.length > 1) {
          const ambMsg = {
            id: 'copilot-' + Date.now(),
            sender: 'copilot',
            text: `I found multiple team members matching "${task.targetPersonName}":\n${userResolution.ambiguous.map(u => `• **${u.full_name}** (${u.email})`).join('\n')}\n\nWhich one would you like to assign this task to?`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          setMessages(prev => [...prev, ambMsg]);
          setLoading(false);
          return;
        }

        const newAction = {
          id: 'act-' + Date.now(),
          type: 'CREATE_TASK',
          status: 'PENDING',
          data: {
            title: task.title,
            description: task.description,
            priority: task.priority || 'MEDIUM',
            department_id: targetDept?.id || null,
            assigned_to: userResolution.match?.id || null
          },
          preview: {
            title: task.title,
            priority: task.priority || 'MEDIUM',
            departmentName: targetDept?.name || 'General',
            assigneeName: userResolution.match?.full_name || 'Unassigned / Team Pool'
          }
        };

        setPendingAction(newAction);
        setLastContextItem(newAction);

        const responseText = [
          `I can create that deliverable for you.\n`,
          `**Task:** ${task.title}`,
          `**Priority:** ${task.priority}`,
          `**Department:** ${targetDept?.name || 'General'}`,
          `**Assignee:** ${userResolution.match?.full_name || 'Unassigned / Team Pool'}`,
          `\nWould you like me to create and schedule this task?`
        ].join('\n');

        const copilotMsg = {
          id: 'copilot-' + Date.now(),
          sender: 'copilot',
          text: responseText,
          action: newAction,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        setMessages(prev => [...prev, copilotMsg]);
        setLoading(false);
        return;
      }

      // CASE C: SEND_TO_DEPARTMENT (context-dependent)
      if (agentAnalysis.intent === 'SEND_TO_DEPARTMENT') {
        const resolvedDept = resolveDepartment(agentAnalysis.targetName, departments);
        if (!resolvedDept) {
          const notFoundMsg = {
            id: 'copilot-' + Date.now(),
            sender: 'copilot',
            text: `I couldn't find a department matching "${agentAnalysis.targetName}". Available departments are: ${departments.map(d => `**${d.name}**`).join(', ')}.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          setMessages(prev => [...prev, notFoundMsg]);
          setLoading(false);
          return;
        }

        if (!lastContextItem) {
          const noContextMsg = {
            id: 'copilot-' + Date.now(),
            sender: 'copilot',
            text: `What would you like me to send to the **${resolvedDept.name}** department? Please describe the issue or task you want to submit.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          setMessages(prev => [...prev, noContextMsg]);
          setLoading(false);
          return;
        }

        const updatedAction = {
          ...lastContextItem,
          id: 'act-' + Date.now(),
          status: 'PENDING',
          data: {
            ...lastContextItem.data,
            department_id: resolvedDept.id
          },
          preview: {
            ...lastContextItem.preview,
            departmentName: resolvedDept.name
          }
        };

        setPendingAction(updatedAction);
        setLastContextItem(updatedAction);

        const copilotMsg = {
          id: 'copilot-' + Date.now(),
          sender: 'copilot',
          text: `I've prepared to send "${updatedAction.preview.title}" to the **${resolvedDept.name}** department.\n\nWould you like me to send it?`,
          action: updatedAction,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        setMessages(prev => [...prev, copilotMsg]);
        setLoading(false);
        return;
      }

      // CASE D: ASSIGN_TASK (context-dependent)
      if (agentAnalysis.intent === 'ASSIGN_TASK') {
        const userResolution = resolveUser(agentAnalysis.targetPersonName, users);

        if (!userResolution.match) {
          const notFoundMsg = {
            id: 'copilot-' + Date.now(),
            sender: 'copilot',
            text: userResolution.ambiguous?.length > 1
              ? `Multiple members matched "${agentAnalysis.targetPersonName}": ${userResolution.ambiguous.map(u => `**${u.full_name}**`).join(', ')}. Which one did you mean?`
              : `I couldn't find a team member matching "${agentAnalysis.targetPersonName}". Please select from: ${users.slice(0, 8).map(u => u.full_name).join(', ')}.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          setMessages(prev => [...prev, notFoundMsg]);
          setLoading(false);
          return;
        }

        if (!lastContextItem) {
          const noContextMsg = {
            id: 'copilot-' + Date.now(),
            sender: 'copilot',
            text: `What would you like me to assign to **${userResolution.match.full_name}**? Please provide the task title or issue details.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          setMessages(prev => [...prev, noContextMsg]);
          setLoading(false);
          return;
        }

        const updatedAction = {
          ...lastContextItem,
          id: 'act-' + Date.now(),
          status: 'PENDING',
          data: {
            ...lastContextItem.data,
            assigned_to: userResolution.match.id
          },
          preview: {
            ...lastContextItem.preview,
            assigneeName: userResolution.match.full_name
          }
        };

        setPendingAction(updatedAction);
        setLastContextItem(updatedAction);

        const copilotMsg = {
          id: 'copilot-' + Date.now(),
          sender: 'copilot',
          text: `I've prepared to assign "${updatedAction.preview.title}" to **${userResolution.match.full_name}**.\n\nWould you like me to proceed with this assignment?`,
          action: updatedAction,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        setMessages(prev => [...prev, copilotMsg]);
        setLoading(false);
        return;
      }

      // CASE E: GENERAL_CHAT / INFORMATIONAL QUERY
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
      console.error('Agent message error:', err);
      const errorMsg = {
        id: 'err-' + Date.now(),
        sender: 'copilot',
        text: `⚠️ **AI Service Notice**: ${err.message || 'Unable to process request.'}`,
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
    setPendingAction(null);
    setLastContextItem(null);
    setMessages([
      {
        id: 'welcome-reset',
        sender: 'copilot',
        text: `Chat reset. I am ready with fresh workspace telemetry. What would you like to analyze or execute next?`,
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
      aria-label="TeamSinc AI Copilot"
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
              <img src="/ai-logo.png" alt="TeamSinc AI" className="w-full h-full object-cover rounded-lg" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-bold text-white tracking-tight">TeamSinc Copilot</h2>
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

                {/* Interactive Workplace Action Preview Card */}
                {m.action && (
                  <ActionConfirmationCard
                    action={m.action}
                    onConfirm={() => handleExecutePendingAction(m.action)}
                    onCancel={() => handleCancelPendingAction(m.action)}
                    isExecuting={executingActionId === m.action.id}
                  />
                )}

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
                <div className="w-6 h-6 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-center text-neutral-300 shrink-0 mt-0.5 font-bold text-[10px] overflow-hidden">
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : null}
                  <span className={profile?.avatar_url ? 'hidden' : 'inline'}>
                    {profile?.full_name?.charAt(0) || 'U'}
                  </span>
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
