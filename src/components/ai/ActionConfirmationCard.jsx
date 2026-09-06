import React from 'react';
import {
  Check,
  X,
  AlertCircle,
  Clock,
  Building2,
  User,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  FileText
} from 'lucide-react';

/**
 * ActionConfirmationCard
 * Renders an interactive action preview card inside the chat stream.
 * Supports both button clicks and natural language confirmations.
 */
export const ActionConfirmationCard = ({
  action,
  onConfirm,
  onCancel,
  isExecuting = false
}) => {
  if (!action) return null;

  const [clicked, setClicked] = React.useState(false);

  const { type, preview = {}, status = 'PENDING' } = action;

  const isPending = status === 'PENDING';
  const isCompleted = status === 'COMPLETED';
  const isCancelled = status === 'CANCELLED';

  const handleConfirmClick = (e) => {
    e.preventDefault();
    if (clicked || isExecuting || !isPending) return;
    setClicked(true);
    onConfirm?.();
  };

  const handleCancelClick = (e) => {
    e.preventDefault();
    if (clicked || isExecuting || !isPending) return;
    setClicked(true);
    onCancel?.();
  };

  const getActionTitle = () => {
    switch (type) {
      case 'CREATE_TASK':
        return 'Create Workplace Task';
      case 'CREATE_BUG':
      case 'SEND_ISSUE':
        return 'Report Issue & Route to Department';
      case 'ASSIGN_TASK':
        return 'Assign Task to Team Member';
      case 'UPDATE_TASK_STATUS':
        return 'Update Task Status';
      default:
        return 'Workspace Action';
    }
  };

  const getPriorityBadgeClass = (priority = 'MEDIUM') => {
    switch (priority.toUpperCase()) {
      case 'URGENT':
      case 'CRITICAL':
        return 'bg-red-950/80 text-red-300 border-red-800';
      case 'HIGH':
        return 'bg-amber-950/80 text-amber-300 border-amber-800';
      case 'LOW':
        return 'bg-neutral-800 text-neutral-300 border-neutral-700';
      case 'MEDIUM':
      default:
        return 'bg-blue-950/80 text-blue-300 border-blue-800';
    }
  };

  return (
    <div className="my-2.5 rounded-2xl border border-neutral-750 bg-neutral-900/90 shadow-lg overflow-hidden transition-all duration-200">
      {/* Card Header Bar */}
      <div className="px-3.5 py-2 bg-neutral-850/90 border-b border-neutral-750 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 font-bold text-white tracking-wide">
          <FileText className="w-3.5 h-3.5 text-purple-400" />
          <span>{getActionTitle()}</span>
        </div>

        {/* State Indicator */}
        <div>
          {isPending && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-800/80">
              <Clock className="w-2.5 h-2.5" />
              <span>Awaiting Confirmation</span>
            </span>
          )}
          {isExecuting && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded-full border border-purple-800 animate-pulse">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              <span>Executing...</span>
            </span>
          )}
          {isCompleted && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/80">
              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
              <span>Executed</span>
            </span>
          )}
          {isCancelled && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-neutral-400 bg-neutral-800/60 px-2 py-0.5 rounded-full border border-neutral-700">
              <X className="w-2.5 h-2.5" />
              <span>Cancelled</span>
            </span>
          )}
        </div>
      </div>

      {/* Card Details Body */}
      <div className="p-3.5 space-y-2.5 text-xs">
        {/* Title */}
        {preview.title && (
          <div>
            <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider block mb-0.5">
              Target Deliverable / Title
            </span>
            <p className="font-semibold text-neutral-100 text-[13px] leading-snug">
              {preview.title}
            </p>
          </div>
        )}

        {/* Priority & Category */}
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          {preview.priority && (
            <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border uppercase tracking-wider ${getPriorityBadgeClass(preview.priority)}`}>
              {preview.priority} Priority
            </span>
          )}
          {preview.category && (
            <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-neutral-800 text-neutral-300 border border-neutral-700">
              {preview.category}
            </span>
          )}
        </div>

        {/* Department and Assignee Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-neutral-800/80 text-[11px]">
          <div className="flex items-center gap-1.5 text-neutral-300">
            <Building2 className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <span className="text-neutral-400">Department:</span>
            <span className="font-semibold text-white truncate">
              {preview.departmentName || 'General'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-neutral-300">
            <User className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <span className="text-neutral-400">Assignee:</span>
            <span className="font-semibold text-white truncate">
              {preview.assigneeName || 'Unassigned / Team Pool'}
            </span>
          </div>
        </div>

        {/* Potential Areas / Impact Note if provided */}
        {preview.impact && (
          <p className="text-[11px] text-neutral-400 leading-relaxed italic pt-1 border-t border-neutral-800/60">
            Impact: {preview.impact}
          </p>
        )}
      </div>

      {/* Confirmation Actions Footer */}
      {isPending && (
        <div className="px-3.5 py-2.5 bg-neutral-950/80 border-t border-neutral-800 flex items-center justify-between gap-2">
          <span className="text-[10px] text-neutral-400">
            Confirm to submit or reply <strong className="text-white">"yes"</strong> / <strong className="text-white">"no"</strong>.
          </span>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCancelClick}
              disabled={clicked || isExecuting}
              className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
            >
              <X className="w-3 h-3" />
              <span>Cancel</span>
            </button>

            <button
              type="button"
              onClick={handleConfirmClick}
              disabled={clicked || isExecuting}
              className="px-3 py-1 rounded-lg bg-white text-black hover:bg-neutral-200 text-xs font-bold flex items-center gap-1 transition cursor-pointer shadow-sm disabled:opacity-50"
            >
              {(clicked || isExecuting) ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Check className="w-3 h-3" />
                  <span>Confirm Action</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActionConfirmationCard;
