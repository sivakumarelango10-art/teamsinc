import React from 'react';
import { Calendar, Building2, Edit2, Trash2, CheckCircle } from 'lucide-react';
import { TaskStatusBadge, TaskPriorityBadge } from './TaskStatusBadge';
import { format, parseISO, isPast } from 'date-fns';
import Avatar from '../common/Avatar';

const TaskCardComponent = ({
  task,
  canManage = false,
  canUpdateStatus = false,
  onStatusChange,
  onEdit,
  onDelete
}) => {
  const isOverdue = Boolean(task.deadline && task.status !== 'COMPLETED' && isPast(parseISO(task.deadline)));

  return (
    <div className="glass-card rounded-2xl p-5 border border-neutral-800 flex flex-col justify-between hover:border-neutral-700 transition duration-200 group bg-neutral-950">
      <div>
        {/* Header: Priority, Department, and Actions */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <TaskPriorityBadge priority={task.priority} />
            {task.department?.name && (
              <span className="inline-flex items-center gap-1 text-xs text-neutral-300 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
                <Building2 className="w-3 h-3 text-neutral-400" />
                {task.department.name}
              </span>
            )}
          </div>

          {canManage && (
            <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
              {onEdit && (
                <button
                  onClick={() => onEdit(task)}
                  className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-900 rounded-lg transition"
                  title="Edit Task"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => onDelete(task)}
                  className="p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900 rounded-lg transition"
                  title="Delete Task"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Title & Description */}
        <h4 className="text-base font-semibold text-white group-hover:text-white transition line-clamp-1 mb-1.5">
          {task.title}
        </h4>
        {task.description && (
          <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed mb-4">
            {task.description}
          </p>
        )}
      </div>

      <div className="pt-3 border-t border-neutral-850 mt-2 space-y-3">
        {/* Assignee & Deadline */}
        <div className="flex items-center justify-between text-xs text-neutral-400">
          <div className="flex items-center gap-1.5" title={`Assigned to: ${task.assignee?.full_name || 'Unassigned'}`}>
            <Avatar
              src={task.assignee?.avatar_url}
              name={task.assignee?.full_name}
              size="xs"
              rounded="rounded"
            />
            <span className="truncate max-w-[120px] text-neutral-300 font-medium">
              {task.assignee?.full_name || 'Unassigned'}
            </span>
          </div>

          {task.deadline ? (
            <div className={`flex items-center gap-1 ${isOverdue ? 'text-neutral-300 font-semibold' : 'text-neutral-400'}`}>
              <Calendar className="w-3.5 h-3.5 text-neutral-500" />
              <span>{format(parseISO(task.deadline), 'MMM d')}</span>
              {isOverdue && <span className="text-[10px] ml-0.5 text-neutral-400">(Overdue)</span>}
            </div>
          ) : (
            <span className="text-neutral-500 text-xs">No deadline</span>
          )}
        </div>

        {/* Status Badge or Status Controller */}
        <div className="flex items-center justify-between pt-1">
          <TaskStatusBadge status={task.status} />

          {canUpdateStatus && onStatusChange && (
            <div className="flex items-center gap-1">
              {task.status !== 'TODO' && (
                <button
                  onClick={() => onStatusChange(task.id, 'TODO')}
                  className="px-2 py-1 text-[11px] font-medium bg-neutral-900 text-neutral-400 hover:text-white hover:bg-neutral-850 rounded border border-neutral-800 transition"
                >
                  To Do
                </button>
              )}
              {task.status !== 'IN_PROGRESS' && (
                <button
                  onClick={() => onStatusChange(task.id, 'IN_PROGRESS')}
                  className="px-2 py-1 text-[11px] font-medium bg-neutral-800 text-white hover:bg-neutral-700 rounded border border-neutral-700 transition"
                >
                  In Progress
                </button>
              )}
              {task.status !== 'COMPLETED' && (
                <button
                  onClick={() => onStatusChange(task.id, 'COMPLETED')}
                  className="px-2.5 py-1 text-[11px] font-bold bg-white text-black hover:bg-neutral-200 rounded transition flex items-center gap-1 shadow-sm"
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

export const TaskCard = React.memo(TaskCardComponent);
export default TaskCard;
