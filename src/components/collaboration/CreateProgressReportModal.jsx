import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Layers,
  Share2,
  AlertCircle
} from 'lucide-react';
import { collaborationApi } from '../../api/collaborationApi';
import { tasksApi } from '../../api/tasksApi';

export const CreateProgressReportModal = ({
  isOpen,
  onClose,
  defaultTaskId = null,
  channel = 'general',
  conversationId = null,
  currentUserId,
  onReportSubmitted
}) => {
  const [tasks, setTasks] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState(defaultTaskId || '');
  const [status, setStatus] = useState('IN_PROGRESS');
  const [progressPercentage, setProgressPercentage] = useState(50);
  const [summary, setSummary] = useState('');
  const [workCompleted, setWorkCompleted] = useState('');
  const [workInProgress, setWorkInProgress] = useState('');
  const [blockers, setBlockers] = useState('');
  const [assistanceRequired, setAssistanceRequired] = useState('');
  const [nextSteps, setNextSteps] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [updateTaskStatus, setUpdateTaskStatus] = useState(true);
  const [shareToChat, setShareToChat] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (defaultTaskId) setSelectedTaskId(defaultTaskId);
  }, [defaultTaskId]);

  useEffect(() => {
    if (isOpen) {
      tasksApi.getTasks().then(res => {
        setTasks(res || []);
        if (!selectedTaskId && res && res.length > 0) {
          const first = defaultTaskId ? res.find(t => t.id === defaultTaskId) : res[0];
          if (first) {
            setSelectedTaskId(first.id);
            setStatus(first.status || 'IN_PROGRESS');
            setProgressPercentage(first.progress_percentage || 50);
          }
        }
      }).catch(() => {});
    }
  }, [isOpen, defaultTaskId]);

  const handleTaskChange = (e) => {
    const tid = e.target.value;
    setSelectedTaskId(tid);
    const chosen = tasks.find(t => t.id === tid);
    if (chosen) {
      setStatus(chosen.status || 'IN_PROGRESS');
      setProgressPercentage(chosen.progress_percentage || 0);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!selectedTaskId) {
      setError('Please select a task to report progress on.');
      return;
    }

    if (!summary.trim()) {
      setError('Please provide an executive summary of current progress.');
      return;
    }

    setLoading(true);
    try {
      const chosenTask = tasks.find(t => t.id === selectedTaskId);
      const payload = {
        task_id: selectedTaskId,
        reporter_id: currentUserId,
        status,
        progress_percentage: Number(progressPercentage) || 0,
        summary: summary.trim(),
        work_completed: workCompleted.trim(),
        work_in_progress: workInProgress.trim(),
        blockers: blockers.trim(),
        assistance_required: assistanceRequired.trim(),
        next_steps: nextSteps.trim(),
        expected_completion_date: expectedDate ? new Date(expectedDate).toISOString() : null,
        update_task_status: updateTaskStatus,
        channel: channel || null,
        conversation_id: conversationId || null
      };

      const report = await collaborationApi.submitProgressReport(payload);
      if (onReportSubmitted) {
        onReportSubmitted({
          ...report,
          task: chosenTask,
          task_title: chosenTask?.title
        }, shareToChat);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to submit progress report.');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl p-6 relative overflow-hidden modal-enter max-h-[90vh] flex flex-col">
        {/* Top Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-950/80 border border-amber-800/80 flex items-center justify-center text-amber-300">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Post Task Progress Report</h3>
              <p className="text-xs text-neutral-400">Broadcast milestone status, blockers, and deliverables</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white transition cursor-pointer p-1 rounded-lg hover:bg-neutral-900"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-4 pt-4 pr-1 text-xs text-neutral-200">
          {error && (
            <div className="p-3 rounded-xl bg-red-950/60 border border-red-800/60 text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Select Task */}
          <div className="space-y-1.5">
            <label className="font-semibold text-white">
              Target Task <span className="text-red-400">*</span>
            </label>
            <select
              required
              value={selectedTaskId}
              onChange={handleTaskChange}
              className="w-full px-3.5 py-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-white focus:outline-none focus:border-amber-500 transition text-xs"
            >
              <option value="">Select task...</option>
              {tasks.map(t => (
                <option key={t.id} value={t.id}>
                  {t.title} ({t.status}) {t.assignee ? `· ${t.assignee.full_name}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Status & Progress Slider */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-neutral-900/60 border border-neutral-800">
            <div className="space-y-1.5">
              <label className="font-semibold text-white">Current Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-1.5 bg-black border border-neutral-800 rounded-lg text-white text-xs focus:outline-none focus:border-amber-500 transition"
              >
                <option value="TODO">To Do</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="REVIEW">Review</option>
                <option value="BLOCKED">Blocked</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between font-semibold text-white">
                <span>Progress</span>
                <span className="font-mono text-amber-400">{progressPercentage}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={progressPercentage}
                onChange={(e) => setProgressPercentage(e.target.value)}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Summary */}
          <div className="space-y-1.5">
            <label className="font-semibold text-white">
              Executive Summary <span className="text-red-400">*</span>
            </label>
            <textarea
              required
              rows={2}
              placeholder="Concise overview of current status and milestones reached..."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full px-3.5 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500 transition resize-none text-xs"
            />
          </div>

          {/* Work Completed & Work In Progress */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="font-semibold text-neutral-300">Work Completed</label>
              <textarea
                rows={2}
                placeholder="Key accomplishments, commits, or merged changes..."
                value={workCompleted}
                onChange={(e) => setWorkCompleted(e.target.value)}
                className="w-full px-3.5 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500 transition resize-none text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-neutral-300">Next Steps</label>
              <textarea
                rows={2}
                placeholder="Immediate next objectives or target commits..."
                value={nextSteps}
                onChange={(e) => setNextSteps(e.target.value)}
                className="w-full px-3.5 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500 transition resize-none text-xs"
              />
            </div>
          </div>

          {/* Blockers & Help Needed */}
          <div className="p-3 rounded-xl bg-red-950/20 border border-red-900/40 space-y-2.5">
            <div className="flex items-center gap-1.5 text-red-300 font-semibold">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span>Blockers & Dependencies (Optional)</span>
            </div>
            <textarea
              rows={2}
              placeholder="Any roadblocks, waiting on external PRs, missing credentials, or API issues..."
              value={blockers}
              onChange={(e) => setBlockers(e.target.value)}
              className="w-full px-3.5 py-2 bg-neutral-900/80 border border-neutral-800 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-red-500 transition resize-none text-xs"
            />
            <input
              type="text"
              placeholder="Assistance needed: What would unblock you?"
              value={assistanceRequired}
              onChange={(e) => setAssistanceRequired(e.target.value)}
              className="w-full px-3 py-1.5 bg-neutral-900/80 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-red-500 transition text-xs"
            />
          </div>

          {/* Target Completion Date */}
          <div className="space-y-1.5">
            <label className="font-semibold text-neutral-300">Expected Delivery Date (Optional)</label>
            <input
              type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
              className="w-full px-3.5 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-white focus:outline-none focus:border-amber-500 transition text-xs"
            />
          </div>

          {/* Toggles */}
          <div className="pt-2 border-t border-neutral-800 space-y-2">
            <label className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-900/60 border border-neutral-800 cursor-pointer hover:border-neutral-700 transition">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <div>
                  <div className="font-semibold text-white">Update Task Record Directly</div>
                  <div className="text-[10px] text-neutral-400">Synchronize the formal task status & progress bar</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={updateTaskStatus}
                onChange={(e) => setUpdateTaskStatus(e.target.checked)}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-900/60 border border-neutral-800 cursor-pointer hover:border-neutral-700 transition">
              <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-amber-400" />
                <span className="font-semibold text-white">Broadcast card to current chat</span>
              </div>
              <input
                type="checkbox"
                checked={shareToChat}
                onChange={(e) => setShareToChat(e.target.checked)}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
            </label>
          </div>

          {/* Modal Footer */}
          <div className="pt-3 border-t border-neutral-800 flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-neutral-400 hover:text-white font-semibold hover:bg-neutral-900 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-xs transition cursor-pointer shadow-lg shadow-amber-900/30 flex items-center gap-2"
            >
              {loading ? 'Posting...' : 'Post Report'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default CreateProgressReportModal;

