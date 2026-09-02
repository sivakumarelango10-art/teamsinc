import React, { useState, useEffect } from 'react';
import {
  X,
  CheckSquare,
  UserCheck,
  Calendar,
  Building2,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Sparkles,
  Zap,
  Check
} from 'lucide-react';
import { format, addDays } from 'date-fns';
import { usersApi } from '../../api/usersApi';
import { departmentsApi } from '../../api/departmentsApi';
import { bugsApi } from '../../api/bugsApi';
import { geminiApi } from '../../api/geminiApi';
import { useAuth } from '../../hooks/useAuth';

export const ConvertBugToTaskModal = ({ bug, isOpen, onClose, onSuccess }) => {
  const { user } = useAuth();

  const [members, setMembers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [priority, setPriority] = useState('HIGH');
  const [deadline, setDeadline] = useState(format(addDays(new Date(), 2), 'yyyy-MM-dd'));

  // AI Triage State
  const [aiTriage, setAiTriage] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (bug) {
      setTitle(`[BUG FIX] ${bug.title}`);
      const descParts = [
        bug.description,
        bug.steps_to_reproduce ? `\n\nSteps to Reproduce:\n${bug.steps_to_reproduce}` : '',
        bug.screenshot_url ? `\n\nReference Screenshot:\n${bug.screenshot_url}` : '',
        `\n\nReported by: ${bug.reporter_name} (${bug.reporter_email})`
      ].filter(Boolean).join('');
      setDescription(descParts);
      setPriority(bug.severity === 'CRITICAL' ? 'URGENT' : (bug.severity === 'HIGH' ? 'HIGH' : 'MEDIUM'));
      setAiTriage(null);
    }
  }, [bug]);

  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      try {
        setLoadingOptions(true);
        const [usersList, deptsList] = await Promise.all([
          usersApi.getUsers(),
          departmentsApi.getDepartments()
        ]);
        const activeMembers = usersList.filter(u => u.is_active);
        setMembers(activeMembers);
        setDepartments(deptsList);

        if (activeMembers.length > 0) {
          setAssignedTo(activeMembers[0].id);
        }

        // Run AI Bug Triage and Department Routing
        if (bug && deptsList.length > 0) {
          runAiTriage(bug, deptsList);
        }
      } catch (err) {
        console.error('Failed to load members or departments:', err);
      } finally {
        setLoadingOptions(false);
      }
    };

    loadData();
  }, [isOpen]);

  const runAiTriage = async (targetBug, deptsList) => {
    try {
      setAiLoading(true);
      const triage = await geminiApi.classifyAndRouteBug({
        bugTitle: targetBug.title,
        bugDescription: targetBug.description,
        stepsToReproduce: targetBug.steps_to_reproduce,
        departments: deptsList,
        severity: targetBug.severity
      });

      if (triage) {
        setAiTriage(triage);
        if (triage.suggestedDepartmentId) {
          setDepartmentId(triage.suggestedDepartmentId);
        } else if (triage.suggestedDepartmentName) {
          const match = deptsList.find(d => d.name.toLowerCase() === triage.suggestedDepartmentName.toLowerCase());
          if (match) setDepartmentId(match.id);
        }
        if (triage.recommendedSeverity) {
          setPriority(triage.recommendedSeverity === 'CRITICAL' ? 'URGENT' : triage.recommendedSeverity);
        }
      }
    } catch (err) {
      console.warn('AI Triage notice:', err);
    } finally {
      setAiLoading(false);
    }
  };

  if (!isOpen || !bug) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please provide a task title');
      return;
    }
    if (!assignedTo) {
      setError('Please select a team member to assign this bug fix to');
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      await bugsApi.convertBugToTask(bug.id, {
        title,
        description,
        priority,
        deadline,
        assigned_to: assignedTo,
        assigned_by: user?.id,
        department_id: departmentId || null
      });

      setIsSuccess(true);
      if (onSuccess) onSuccess();

      setTimeout(() => {
        setIsSuccess(false);
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Failed to convert bug to task:', err);
      setError(err.message || 'Failed to convert bug into task.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg bg-neutral-950 border border-neutral-800 rounded-3xl shadow-2xl p-6 relative overflow-hidden flex flex-col max-h-[90vh] modal-enter">
        {/* Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-indigo-500 to-purple-600" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-850">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-950/60 border border-indigo-800/80 flex items-center justify-center text-indigo-400">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">Convert Bug to Action Task</h3>
              <p className="text-xs text-neutral-400">Assign resolution directly to a team member</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-900 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isSuccess ? (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
            <CheckCircle2 className="w-16 h-16 text-emerald-400 animate-bounce" />
            <h4 className="text-xl font-bold text-white">Task Assigned Successfully!</h4>
            <p className="text-xs text-neutral-400 max-w-sm">
              The bug report status is now marked as <strong>IN PROGRESS</strong> and the assigned member will see it in their task board.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-4 overflow-y-auto pr-1 flex-1">
            {/* AI Auto-Triage Department Routing Banner */}
            {aiLoading ? (
              <div className="p-3 rounded-2xl bg-purple-950/30 border border-purple-800/50 flex items-center gap-2.5 text-xs text-purple-300">
                <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                <span>AI is analyzing bug details & routing to target department...</span>
              </div>
            ) : aiTriage ? (
              <div className="p-3.5 rounded-2xl bg-gradient-to-tr from-purple-950/40 via-neutral-900/60 to-neutral-900 border border-purple-800/60 space-y-2 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-purple-300">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    <span>AI Route: {aiTriage.suggestedDepartmentName || 'General Engineering'}</span>
                  </div>
                  {aiTriage.confidenceScore && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-900/60 text-purple-200 border border-purple-700 font-bold">
                      {Math.round(aiTriage.confidenceScore * 100)}% Match
                    </span>
                  )}
                </div>
                {aiTriage.rootCauseSummary && (
                  <p className="text-[11px] text-neutral-300 leading-snug">
                    <strong className="text-white">Analysis:</strong> {aiTriage.rootCauseSummary}
                  </p>
                )}
                {aiTriage.errorDomain && (
                  <div className="flex items-center gap-2 text-[10px] text-neutral-400">
                    <span>Domain: <strong className="text-neutral-200">{aiTriage.errorDomain}</strong></span>
                    {aiTriage.routingReason && (
                      <span>&bull; {aiTriage.routingReason}</span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => runAiTriage(bug, departments)}
                  disabled={aiLoading || departments.length === 0}
                  className="px-2.5 py-1 rounded-lg bg-purple-950/80 hover:bg-purple-900 border border-purple-800 text-purple-300 text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>AI Triage & Route</span>
                </button>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-red-950/60 border border-red-800 text-xs text-red-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Task Title */}
            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                Task Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 focus:border-white text-xs text-white placeholder:text-neutral-500 transition outline-none"
                required
              />
            </div>

            {/* Assign Member & Department Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Assign To Member <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <select
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    disabled={loadingOptions}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 focus:border-white text-xs text-white appearance-none outline-none cursor-pointer"
                    required
                  >
                    {members.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.full_name} ({m.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Department
                </label>
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  disabled={loadingOptions}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 focus:border-white text-xs text-white appearance-none outline-none cursor-pointer"
                >
                  <option value="">No Department</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Priority & Deadline Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 focus:border-white text-xs text-white appearance-none outline-none cursor-pointer"
                >
                  <option value="LOW">Low Priority</option>
                  <option value="MEDIUM">Medium Priority</option>
                  <option value="HIGH">High Priority</option>
                  <option value="URGENT">Urgent Priority</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Resolution Deadline
                </label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 focus:border-white text-xs text-white outline-none"
                  required
                />
              </div>
            </div>

            {/* Task Description */}
            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                Task Description & Instructions
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 focus:border-white text-xs text-white placeholder:text-neutral-500 transition outline-none resize-none"
              />
            </div>

            {/* Form Actions */}
            <div className="pt-3 border-t border-neutral-850 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-semibold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || loadingOptions}
                className="px-5 py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black font-bold text-xs transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Create Task & Assign Member
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ConvertBugToTaskModal;
