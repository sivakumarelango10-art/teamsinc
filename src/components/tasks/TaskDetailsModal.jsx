import React from 'react';
import {
  X,
  Calendar,
  User,
  Shield,
  Clock,
  Building2,
  AlertTriangle
} from 'lucide-react';
import { format, parseISO, isPast } from 'date-fns';
import TaskStatusBadge from './TaskStatusBadge';

export const TaskDetailsModal = ({ task, isOpen, onClose }) => {
  if (!isOpen || !task) return null;

  const isOverdue = task.deadline && isPast(parseISO(task.deadline)) && task.status !== 'COMPLETED';

  const priorityColors = {
    LOW: 'bg-neutral-800 text-neutral-300 border-neutral-700',
    MEDIUM: 'bg-blue-950/80 text-blue-300 border-blue-800/80',
    HIGH: 'bg-amber-950/80 text-amber-300 border-amber-800/80',
    URGENT: 'bg-red-950/80 text-red-300 border-red-800/80'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl p-6 relative overflow-hidden">
        {/* Top accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-indigo-500 to-purple-600" />

        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-white transition cursor-pointer p-1"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-4 pt-1">
          {/* Status & Priority header badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <TaskStatusBadge status={task.status} />
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border uppercase tracking-wider ${
                priorityColors[task.priority] || priorityColors.MEDIUM
              }`}
            >
              {task.priority} Priority
            </span>
            {task.department && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-neutral-900 border border-neutral-800 text-neutral-300 flex items-center gap-1">
                <Building2 className="w-3 h-3 text-neutral-400" />
                {task.department.name}
              </span>
            )}
            {isOverdue && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-950/80 border border-red-800 text-red-300 flex items-center gap-1 animate-pulse">
                <AlertTriangle className="w-3 h-3 text-red-400" />
                Overdue
              </span>
            )}
          </div>

          {/* Title */}
          <h3 className="text-xl font-bold text-white tracking-tight leading-snug">
            {task.title}
          </h3>

          {/* Description */}
          <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800 text-neutral-300 text-sm leading-relaxed whitespace-pre-wrap">
            {task.description || <span className="text-neutral-500 italic">No description provided for this task.</span>}
          </div>

          {/* Key metadata grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {/* Assignee */}
            <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-neutral-800 text-white flex items-center justify-center font-bold text-xs shrink-0">
                {task.assignee?.full_name?.charAt(0) || 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">Assigned To</div>
                <div className="text-xs font-semibold text-white truncate">
                  {task.assignee?.full_name || 'Unassigned'}
                </div>
                <div className="text-[11px] text-neutral-400 truncate">{task.assignee?.email}</div>
              </div>
            </div>

            {/* Due Date */}
            <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-neutral-800 text-neutral-300 flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">Due Date</div>
                <div className={`text-xs font-semibold ${isOverdue ? 'text-red-400 font-bold' : 'text-white'}`}>
                  {task.deadline ? format(parseISO(task.deadline), 'MMM d, yyyy') : 'No deadline'}
                </div>
                <div className="text-[11px] text-neutral-400">
                  {isOverdue ? 'Deadline missed' : 'Target delivery'}
                </div>
              </div>
            </div>

            {/* Created By */}
            {task.creator && (
              <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-neutral-800 text-neutral-300 flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">Created By</div>
                  <div className="text-xs font-semibold text-white truncate">
                    {task.creator.full_name}
                  </div>
                  <div className="text-[11px] text-neutral-400 truncate">{task.creator.email}</div>
                </div>
              </div>
            )}

            {/* Created Date */}
            <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-neutral-800 text-neutral-300 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">Created On</div>
                <div className="text-xs font-semibold text-white">
                  {task.created_at ? format(parseISO(task.created_at), 'MMM d, yyyy') : 'Recently'}
                </div>
                <div className="text-[11px] text-neutral-400">Task initialization</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-neutral-850 flex items-center justify-between">
          <span className="text-[11px] text-neutral-500">
            Read-only oversight mode · Task ID: {task.id?.slice(0, 8)}...
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-black bg-white hover:bg-neutral-200 rounded-xl transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default TaskDetailsModal;
