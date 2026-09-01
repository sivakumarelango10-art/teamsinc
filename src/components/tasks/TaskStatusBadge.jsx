import React from 'react';
import { Clock, CheckCircle2, CircleDot } from 'lucide-react';

export const TaskStatusBadge = ({ status }) => {
  const configs = {
    TODO: {
      label: 'To Do',
      classes: 'bg-neutral-950 text-neutral-400 border-neutral-800',
      icon: CircleDot
    },
    IN_PROGRESS: {
      label: 'In Progress',
      classes: 'bg-neutral-900 text-white border-neutral-700 font-medium',
      icon: Clock
    },
    COMPLETED: {
      label: 'Completed',
      classes: 'bg-white text-black border-white font-bold shadow-sm',
      icon: CheckCircle2
    }
  };

  const config = configs[status] || configs.TODO;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs border ${config.classes}`}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
};

export const TaskPriorityBadge = ({ priority }) => {
  const configs = {
    LOW: {
      label: 'Low',
      classes: 'bg-neutral-950 text-neutral-500 border-neutral-800'
    },
    MEDIUM: {
      label: 'Medium',
      classes: 'bg-neutral-900 text-neutral-300 border-neutral-700'
    },
    HIGH: {
      label: 'High',
      classes: 'bg-neutral-800 text-white border-neutral-600 font-semibold'
    },
    URGENT: {
      label: 'Urgent',
      classes: 'bg-white text-black border-white font-bold'
    }
  };

  const config = configs[priority] || configs.MEDIUM;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] uppercase tracking-wider border ${config.classes}`}>
      {config.label}
    </span>
  );
};

export default TaskStatusBadge;
