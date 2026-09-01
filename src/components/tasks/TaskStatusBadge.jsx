import React from 'react';
import { Clock, CheckCircle2, AlertCircle, CircleDot } from 'lucide-react';

export const TaskStatusBadge = ({ status }) => {
  const configs = {
    TODO: {
      label: 'To Do',
      color: 'bg-slate-800 text-slate-300 border-slate-700',
      icon: CircleDot
    },
    IN_PROGRESS: {
      label: 'In Progress',
      color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      icon: Clock
    },
    COMPLETED: {
      label: 'Completed',
      color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      icon: CheckCircle2
    }
  };

  const config = configs[status] || configs.TODO;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${config.color}`}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
};

export const TaskPriorityBadge = ({ priority }) => {
  const configs = {
    LOW: {
      label: 'Low',
      color: 'bg-slate-800/80 text-slate-400 border-slate-700/60'
    },
    MEDIUM: {
      label: 'Medium',
      color: 'bg-blue-500/10 text-blue-400 border-blue-500/20'
    },
    HIGH: {
      label: 'High',
      color: 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    },
    URGENT: {
      label: 'Urgent',
      color: 'bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse'
    }
  };

  const config = configs[priority] || configs.MEDIUM;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${config.color}`}>
      {config.label}
    </span>
  );
};

export default TaskStatusBadge;
