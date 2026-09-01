import React from 'react';
import { Calendar, User, Building2, MoreVertical, Edit2, Trash2, CheckCircle } from 'lucide-react';
import { TaskStatusBadge, TaskPriorityBadge } from './TaskStatusBadge';
import { format, parseISO, isPast } from 'date-fns';

export const TaskCard = ({
  task,
  canManage = false,
  canUpdateStatus = false,
  onStatusChange,
  onEdit,
  onDelete
}) => {
  const isOverdue = task.status !== 'COMPLETED' && isPast(parseISO(task.deadline));

  return (
    <div className="glass-card rounded-2xl p-5 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition duration-200 group">
      <div>
        {/* Header: Priority, Department, and Actions */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <TaskPriorityBadge priority={task.priority} />
            {task.department?.name && (
              <span className="inline-flex items-center gap-1 text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20">
                <Building2 className="w-3 h-3" />
                {task.department.name}
              </span>
            )}
          </div>

          {canManage && (
            <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
              {onEdit && (
                <button
                  onClick={() => onEdit(task)}
                  className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition"
                  title="Edit Task"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => onDelete(task)}
                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition"
                  title="Delete Task"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Title & Description */}
        <h4 className="text-base font-semibold text-slate-100 group-hover:text-white transition line-clamp-1 mb-1.5">
          {task.title}
        </h4>
        {task.description && (
          <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-4">
            {task.description}
          </p>
        )}
      </div>

      <div className="pt-3 border-t border-slate-800/80 mt-2 space-y-3">
        {/* Assignee & Deadline */}
        <div className="flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1.5" title={`Assigned to: ${task.assignee?.full_name || 'Unassigned'}`}>
            <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-semibold text-indigo-300">
              {task.assignee?.full_name?.charAt(0) || 'U'}
            </div>
            <span className="truncate max-w-[110px]">
              {task.assignee?.full_name || 'Unassigned'}
            </span>
          </div>

          <div className={`flex items-center gap-1 ${isOverdue ? 'text-rose-400 font-medium' : 'text-slate-400'}`}>
            <Calendar className="w-3.5 h-3.5" />
            <span>{format(parseISO(task.deadline), 'MMM d')}</span>
            {isOverdue && <span className="text-[10px] ml-0.5">(Overdue)</span>}
          </div>
        </div>

        {/* Status Badge or Status Controller */}
        <div className="flex items-center justify-between pt-1">
          <TaskStatusBadge status={task.status} />

          {canUpdateStatus && onStatusChange && (
            <div className="flex items-center gap-1">
              {task.status !== 'TODO' && (
                <button
                  onClick={() => onStatusChange(task.id, 'TODO')}
                  className="px-2 py-1 text-[11px] font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-md transition"
                >
                  To Do
                </button>
              )}
              {task.status !== 'IN_PROGRESS' && (
                <button
                  onClick={() => onStatusChange(task.id, 'IN_PROGRESS')}
                  className="px-2 py-1 text-[11px] font-medium bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 rounded-md transition"
                >
                  In Progress
                </button>
              )}
              {task.status !== 'COMPLETED' && (
                <button
                  onClick={() => onStatusChange(task.id, 'COMPLETED')}
                  className="px-2 py-1 text-[11px] font-medium bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 rounded-md transition flex items-center gap-1"
                >
                  <CheckCircle className="w-3 h-3" />
                  Done
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskCard;
