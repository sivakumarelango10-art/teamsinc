import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ArrowRightLeft,
  ShieldAlert,
  Share2,
  FileText,
  AlertCircle,
  HelpCircle,
  UserCheck
} from 'lucide-react';
import { collaborationApi } from '../../api/collaborationApi';
import { tasksApi } from '../../api/tasksApi';
import { usersApi } from '../../api/usersApi';
import Avatar from '../common/Avatar';

export const TaskTransferModal = ({
  isOpen,
  onClose,
  defaultTaskId = null,
  channel = 'general',
  conversationId = null,
  currentUserId,
  currentUserRole = 'MEMBER',
  onTransferRequested
}) => {
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState(defaultTaskId || '');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [reason, setReason] = useState('');
  const [completedWork, setCompletedWork] = useState('');
  const [remainingWork, setRemainingWork] = useState('');
  const [blockers, setBlockers] = useState('');
  const [shareToChat, setShareToChat] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (defaultTaskId) setSelectedTaskId(defaultTaskId);
  }, [defaultTaskId]);

  useEffect(() => {
    if (isOpen) {
      // 1. Fetch eligible tasks
      tasksApi.getTasks().then(res => {
        const allTasks = res || [];
        // Members can only transfer tasks assigned to them; Admins/Founders can transfer any task
        const eligible = ['ADMIN', 'FOUNDER'].includes(currentUserRole)
          ? allTasks
          : allTasks.filter(t => t.assigned_to === currentUserId);
        setTasks(eligible);
        if (!selectedTaskId && eligible.length > 0) {
          setSelectedTaskId(eligible[0].id);
        }
      }).catch(() => {});

      // 2. Fetch team members (potential recipients)
      usersApi.getUsers().then(res => {
        const otherMembers = (res || []).filter(u => u.id !== currentUserId && u.status !== 'SUSPENDED');
        setUsers(otherMembers);
        if (otherMembers.length > 0 && !selectedUserId) {
          setSelectedUserId(otherMembers[0].id);
        }
      }).catch(() => {});
    }
  }, [isOpen, currentUserId, currentUserRole, selectedTaskId, selectedUserId]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!selectedTaskId) {
      setError('Please choose a task to transfer.');
      return;
    }

    if (!selectedUserId) {
      setError('Please select a recipient team member.');
      return;
    }

    if (!reason.trim()) {
      setError('Please describe the reason for this transfer request.');
      return;
    }

    setLoading(true);
    try {
      const chosenTask = tasks.find(t => t.id === selectedTaskId);
      const chosenRecipient = users.find(u => u.id === selectedUserId);

      const payload = {
        task_id: selectedTaskId,
        from_user_id: currentUserId,
        to_user_id: selectedUserId,
        reason: reason.trim(),
        handover_notes: {
          completed_work: completedWork.trim(),
          remaining_work: remainingWork.trim(),
          blockers: blockers.trim()
        },
        channel: channel || null,
        conversation_id: conversationId || null
      };

      const transfer = await collaborationApi.createTransferRequest(payload);
      if (onTransferRequested) {
        onTransferRequested({
          ...transfer,
          task: chosenTask,
          task_title: chosenTask?.title,
          to_user: chosenRecipient
        }, shareToChat);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to request transfer. Please check for existing pending requests.');
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
        {/* Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-950/80 border border-indigo-800/80 flex items-center justify-center text-indigo-300">
              <ArrowRightLeft className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Request Task Transfer</h3>
              <p className="text-xs text-neutral-400">Initiate controlled handoff requiring recipient acceptance</p>
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

          {/* Controlled Transfer Security Notice */}
          <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-800/50 flex items-start gap-2.5">
            <UserCheck className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed text-indigo-200">
              <span className="font-bold text-white">Controlled Handoff: </span>
              Ownership of this task will <span className="underline">NOT</span> change immediately. The target recipient must explicitly accept your request before reassignment takes effect.
            </div>
          </div>

          {/* Select Task */}
          <div className="space-y-1.5">
            <label className="font-semibold text-white">
              Deliverable to Transfer <span className="text-red-400">*</span>
            </label>
            {tasks.length === 0 ? (
              <div className="p-3 rounded-xl bg-neutral-900 text-neutral-400 text-xs italic">
                No active tasks assigned to you are currently available for transfer.
              </div>
            ) : (
              <select
                required
                value={selectedTaskId}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-white focus:outline-none focus:border-indigo-500 transition text-xs"
              >
                <option value="">Select task...</option>
                {tasks.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({t.status})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Select Recipient */}
          <div className="space-y-1.5">
            <label className="font-semibold text-white">
              Target Recipient <span className="text-red-400">*</span>
            </label>
            <select
              required
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-white focus:outline-none focus:border-indigo-500 transition text-xs"
            >
              <option value="">Select team member...</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.role}) · {u.email}
                </option>
              ))}
            </select>
          </div>

          {/* Transfer Reason */}
          <div className="space-y-1.5">
            <label className="font-semibold text-white">
              Transfer Reason <span className="text-red-400">*</span>
            </label>
            <textarea
              required
              rows={2}
              placeholder="e.g. Workload balancing, specialized domain knowledge required, reassigned priority..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3.5 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500 transition resize-none text-xs"
            />
          </div>

          {/* Handover Documentation */}
          <div className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800 space-y-3">
            <div className="flex items-center gap-1.5 text-neutral-300 font-bold text-[11px] uppercase tracking-wider">
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              <span>Handover Documentation</span>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-neutral-300">Completed Work So Far</label>
              <textarea
                rows={2}
                placeholder="List completed milestones, commits, or documentation prepared..."
                value={completedWork}
                onChange={(e) => setCompletedWork(e.target.value)}
                className="w-full px-3 py-1.5 bg-black border border-neutral-800 rounded-lg text-white placeholder-neutral-600 focus:outline-none focus:border-indigo-500 transition resize-none text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-neutral-300">Remaining Work & Next Steps</label>
              <textarea
                rows={2}
                placeholder="What specific tasks, tests, or PRs still need to be completed?"
                value={remainingWork}
                onChange={(e) => setRemainingWork(e.target.value)}
                className="w-full px-3 py-1.5 bg-black border border-neutral-800 rounded-lg text-white placeholder-neutral-600 focus:outline-none focus:border-indigo-500 transition resize-none text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-neutral-300">Known Blockers / Tips for Recipient</label>
              <textarea
                rows={2}
                placeholder="Any environmental quirks, dependencies, or contact people..."
                value={blockers}
                onChange={(e) => setBlockers(e.target.value)}
                className="w-full px-3 py-1.5 bg-black border border-neutral-800 rounded-lg text-white placeholder-neutral-600 focus:outline-none focus:border-indigo-500 transition resize-none text-xs"
              />
            </div>
          </div>

          {/* Share to Chat */}
          <label className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-900/60 border border-neutral-800 cursor-pointer hover:border-neutral-700 transition">
            <div className="flex items-center gap-2">
              <Share2 className="w-4 h-4 text-indigo-400" />
              <span className="font-semibold text-white">Broadcast transfer card to current chat</span>
            </div>
            <input
              type="checkbox"
              checked={shareToChat}
              onChange={(e) => setShareToChat(e.target.checked)}
              className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
            />
          </label>

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
              disabled={loading || tasks.length === 0}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs transition cursor-pointer shadow-lg shadow-indigo-900/30 flex items-center gap-2"
            >
              {loading ? 'Submitting...' : 'Send Transfer Request'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default TaskTransferModal;

