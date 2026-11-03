import React from 'react';
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  ExternalLink,
  Calendar,
  Layers
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import TaskStatusBadge from '../tasks/TaskStatusBadge';
import Avatar from '../common/Avatar';

export const ProgressReportCard = ({
  report,
  onOpenTask
}) => {
  if (!report) return null;

  const progress = report.progress_percentage ?? 0;
  const hasBlockers = Boolean(report.blockers && report.blockers.trim());

  return (
    <div className="w-full max-w-md my-2 rounded-2xl bg-neutral-950/90 border border-neutral-800 shadow-xl overflow-hidden text-neutral-200">
      {/* Header Bar */}
      <div className="p-3.5 bg-neutral-900/80 border-b border-neutral-800 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-950/80 border border-amber-800/80 flex items-center justify-center text-amber-300 shrink-0">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-300 border border-amber-800/60">
                Progress Report
              </span>
              <TaskStatusBadge status={report.status} />
            </div>
            <h4 className="text-sm font-bold text-white mt-1 leading-snug">
              {report.task?.title || report.task_title || 'Task Deliverable'}
            </h4>
          </div>
        </div>

        {onOpenTask && report.task_id && (
          <button
            type="button"
            onClick={() => onOpenTask(report.task_id)}
            className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition cursor-pointer"
            title="View full task details"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Progress Bar Gauge */}
      <div className="px-4 py-3 bg-neutral-900/40 border-b border-neutral-850 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-neutral-400 font-semibold flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-neutral-500" /> Execution Completion
          </span>
          <span className="font-mono font-bold text-white text-xs">{progress}%</span>
        </div>
        <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              progress >= 100
                ? 'bg-emerald-500'
                : progress > 50
                ? 'bg-blue-500'
                : 'bg-amber-500'
            }`}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      </div>

      {/* Executive Summary */}
      {report.summary && (
        <div className="p-4 text-xs text-neutral-200 leading-relaxed border-b border-neutral-850 whitespace-pre-wrap">
          {report.summary}
        </div>
      )}

      {/* Blockers Alert if any */}
      {hasBlockers && (
        <div className="mx-3.5 my-3 p-2.5 rounded-xl bg-red-950/40 border border-red-800/60 text-xs space-y-1">
          <div className="flex items-center gap-1.5 text-red-300 font-bold text-[11px] uppercase tracking-wide">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span>Active Blockers</span>
          </div>
          <p className="text-red-200 text-xs leading-relaxed pl-5">
            {report.blockers}
          </p>
          {report.assistance_required && (
            <div className="text-[11px] text-red-300 pt-1 pl-5 border-t border-red-900/40">
              <span className="font-semibold text-white">Help needed: </span>
              {report.assistance_required}
            </div>
          )}
        </div>
      )}

      {/* Work Sections (Completed & Next Steps) */}
      <div className="p-4 pt-1 space-y-2.5 text-xs">
        {report.work_completed && (
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Accomplished
            </span>
            <p className="text-neutral-300 bg-neutral-900/50 p-2 rounded-lg border border-neutral-800/60 leading-relaxed whitespace-pre-wrap">
              {report.work_completed}
            </p>
          </div>
        )}

        {report.next_steps && (
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1">
              <ArrowRight className="w-3 h-3 text-blue-400" /> Next Milestone
            </span>
            <p className="text-neutral-300 bg-neutral-900/50 p-2 rounded-lg border border-neutral-800/60 leading-relaxed whitespace-pre-wrap">
              {report.next_steps}
            </p>
          </div>
        )}

        {report.expected_completion_date && (
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 pt-1">
            <Calendar className="w-3.5 h-3.5 text-neutral-500" />
            <span>Target completion: </span>
            <span className="text-white font-medium">
              {format(parseISO(report.expected_completion_date), 'MMM d, yyyy')}
            </span>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-3 bg-neutral-900/60 border-t border-neutral-850 flex items-center justify-between text-[11px] text-neutral-400">
        <div className="flex items-center gap-2">
          <Avatar
            src={report.reporter?.avatar_url}
            name={report.reporter?.full_name}
            size="xs"
            rounded="rounded-full"
          />
          <span className="font-medium text-neutral-300 truncate max-w-[150px]">
            {report.reporter?.full_name || 'Team Member'}
          </span>
        </div>
        {report.created_at && (
          <span className="font-mono text-[10px] text-neutral-500">
            {format(parseISO(report.created_at), 'MMM d, h:mm a')}
          </span>
        )}
      </div>
    </div>
  );
};

export default ProgressReportCard;

