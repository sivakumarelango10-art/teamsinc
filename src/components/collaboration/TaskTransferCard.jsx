import React, { useState } from 'react';
import {
  ArrowRightLeft,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ExternalLink,
  ShieldAlert,
  ArrowRight,
  FileText
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { collaborationApi } from '../../api/collaborationApi';
import Avatar from '../common/Avatar';

export const TaskTransferCard = ({
  transfer,
  currentUserId,
  currentUserRole = 'MEMBER',
  onOpenTask,
  onStatusChange
}) => {
  const [data, setData] = useState(transfer);
  const [loadingAction, setLoadingAction] = useState(false);
  const [error, setError] = useState('');
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  if (!data) return null;

  const isRecipient = currentUserId === data.to_user_id;
  const isSender = currentUserId === data.from_user_id;
  const isAdmin = ['FOUNDER', 'ADMIN'].includes(currentUserRole);
  const isPending = data.status === 'PENDING';

  const handleAccept = async () => {
    if (!window.confirm('Do you accept full ownership and responsibility for this task?')) return;
    setLoadingAction(true);
    setError('');
    try {
      const updated = await collaborationApi.acceptTransfer(data.id, currentUserId);
      setData(prev => ({ ...prev, status: 'ACCEPTED', ...updated }));
      if (onStatusChange) onStatusChange('ACCEPTED', data.task_id);
    } catch (err) {
      setError(err.message || 'Failed to accept transfer');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      setError('Please provide a reason for rejecting the transfer.');
      return;
    }
    setLoadingAction(true);
    setError('');
    try {
      const updated = await collaborationApi.rejectTransfer(data.id, currentUserId, rejectionReason.trim());
      setData(prev => ({ ...prev, status: 'REJECTED', rejection_reason: rejectionReason.trim(), ...updated }));
      setShowRejectBox(false);
      if (onStatusChange) onStatusChange('REJECTED', data.task_id);
    } catch (err) {
      setError(err.message || 'Failed to reject transfer');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Are you sure you want to cancel this transfer request?')) return;
    setLoadingAction(true);
    setError('');
    try {
      const updated = await collaborationApi.cancelTransfer(data.id, currentUserId);
      setData(prev => ({ ...prev, status: 'CANCELLED', ...updated }));
      if (onStatusChange) onStatusChange('CANCELLED', data.task_id);
    } catch (err) {
      setError(err.message || 'Failed to cancel transfer');
    } finally {
      setLoadingAction(false);
    }
  };

  const getStatusBadge = () => {
    switch (data.status) {
      case 'PENDING':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-800/80 flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" /> Pending Recipient Acceptance
          </span>
        );
      case 'ACCEPTED':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 flex items-center gap-1">
            <CheckCircle2 className="w-2.5 h-2.5" /> Ownership Transferred
          </span>
        );
      case 'REJECTED':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-950/80 text-red-300 border border-red-800/80 flex items-center gap-1">
            <XCircle className="w-2.5 h-2.5" /> Transfer Declined
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700">
            Cancelled by Sender
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-full max-w-md my-2 rounded-2xl bg-neutral-950/90 border border-neutral-800 shadow-xl overflow-hidden text-neutral-200">
      {/* Header Bar */}
      <div className="p-3.5 bg-neutral-900/80 border-b border-neutral-800 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-950/80 border border-indigo-800/80 flex items-center justify-center text-indigo-300 shrink-0">
            <ArrowRightLeft className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-900/40 text-indigo-300 border border-indigo-800/60">
                Task Transfer Request
              </span>
              {getStatusBadge()}
            </div>
            <h4 className="text-sm font-bold text-white mt-1 leading-snug">
              {data.task?.title || data.task_title || 'Task Deliverable'}
            </h4>
          </div>
        </div>

        {onOpenTask && data.task_id && (
          <button
            type="button"
            onClick={() => onOpenTask(data.task_id)}
            className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition cursor-pointer"
            title="Inspect task details"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Transfer Parties Flow Banner */}
      <div className="p-3 bg-neutral-900/40 border-b border-neutral-850 flex items-center justify-between text-xs">
        {/* From User */}
        <div className="flex items-center gap-2 min-w-0">
          <Avatar
            src={data.from_user?.avatar_url}
            name={data.from_user?.full_name}
            size="xs"
            rounded="rounded-full"
          />
          <div className="min-w-0">
            <div className="text-[9px] uppercase font-bold text-neutral-500">Current Assignee</div>
            <div className="font-semibold text-white truncate max-w-[100px]">
              {data.from_user?.full_name || 'Sender'}
            </div>
          </div>
        </div>

        <ArrowRight className="w-4 h-4 text-indigo-400 shrink-0 mx-2" />

        {/* To User */}
        <div className="flex items-center gap-2 min-w-0 text-right">
          <div className="min-w-0">
            <div className="text-[9px] uppercase font-bold text-neutral-500">Proposed Recipient</div>
            <div className="font-semibold text-indigo-300 truncate max-w-[100px]">
              {data.to_user?.full_name || 'Recipient'}
            </div>
          </div>
          <Avatar
            src={data.to_user?.avatar_url}
            name={data.to_user?.full_name}
            size="xs"
            rounded="rounded-full"
          />
        </div>
      </div>

      {/* Reason */}
      <div className="p-3.5 border-b border-neutral-850 space-y-1 text-xs">
        <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
          Transfer Reason:
        </span>
        <p className="text-neutral-200 leading-relaxed font-medium">
          {data.reason}
        </p>
      </div>

      {/* Handover Details */}
      {data.handover_notes && (
        <div className="p-3.5 space-y-2 border-b border-neutral-850 text-xs">
          <div className="flex items-center gap-1.5 text-neutral-400 font-semibold text-[11px]">
            <FileText className="w-3.5 h-3.5 text-indigo-400" />
            <span>Handover Documentation</span>
          </div>

          {typeof data.handover_notes === 'object' ? (
            <div className="space-y-2 text-xs">
              {data.handover_notes.completed_work && (
                <div className="bg-neutral-900/60 p-2 rounded-lg border border-neutral-800">
                  <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Completed So Far</div>
                  <div className="text-neutral-300 text-xs mt-0.5">{data.handover_notes.completed_work}</div>
                </div>
              )}
              {data.handover_notes.remaining_work && (
                <div className="bg-neutral-900/60 p-2 rounded-lg border border-neutral-800">
                  <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Remaining Deliverables</div>
                  <div className="text-neutral-300 text-xs mt-0.5">{data.handover_notes.remaining_work}</div>
                </div>
              )}
              {data.handover_notes.blockers && (
                <div className="bg-red-950/20 p-2 rounded-lg border border-red-900/40">
                  <div className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Known Obstacles / Gotchas</div>
                  <div className="text-red-200 text-xs mt-0.5">{data.handover_notes.blockers}</div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-neutral-300 bg-neutral-900/50 p-2 rounded-lg border border-neutral-800 text-xs leading-relaxed whitespace-pre-wrap">
              {data.handover_notes}
            </p>
          )}
        </div>
      )}

      {/* Rejection Notice if rejected */}
      {data.status === 'REJECTED' && data.rejection_reason && (
        <div className="mx-3.5 my-3 p-2.5 rounded-xl bg-red-950/40 border border-red-800/60 text-xs space-y-1">
          <div className="flex items-center gap-1.5 text-red-300 font-bold text-[11px] uppercase tracking-wide">
            <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span>Decline Reason</span>
          </div>
          <p className="text-red-200 text-xs leading-relaxed pl-5">
            {data.rejection_reason}
          </p>
        </div>
      )}

      {error && (
        <div className="mx-3.5 mb-3 p-2 rounded-lg bg-red-950/60 border border-red-800/60 text-red-300 text-xs flex items-center gap-2">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Recipient Action Rejection Box */}
      {showRejectBox && isPending && isRecipient && (
        <div className="p-3 bg-neutral-900 border-t border-neutral-800 space-y-2">
          <label className="block text-xs font-semibold text-red-400">
            Please explain why you cannot take over this task:
          </label>
          <textarea
            rows={2}
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="e.g. Current sprint capacity full, unfamiliar with legacy stack..."
            className="w-full p-2 bg-black border border-neutral-700 rounded-lg text-white text-xs focus:outline-none focus:border-red-500 transition resize-none"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowRejectBox(false)}
              className="px-3 py-1 rounded-lg text-neutral-400 hover:text-white text-xs transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={loadingAction}
              onClick={handleReject}
              className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold text-xs transition cursor-pointer"
            >
              Confirm Decline
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons Footer */}
      {isPending && (
        <div className="p-3 bg-neutral-900/60 border-t border-neutral-850 flex items-center justify-between gap-2">
          {isRecipient ? (
            <div className="flex items-center gap-2 w-full justify-end">
              {!showRejectBox && (
                <>
                  <button
                    type="button"
                    disabled={loadingAction}
                    onClick={() => setShowRejectBox(true)}
                    className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-red-950 hover:text-red-300 text-neutral-400 font-semibold text-xs border border-neutral-700 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Decline</span>
                  </button>
                  <button
                    type="button"
                    disabled={loadingAction}
                    onClick={handleAccept}
                    className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs transition cursor-pointer shadow-lg shadow-emerald-900/30 flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{loadingAction ? 'Transferring...' : 'Accept Task'}</span>
                  </button>
                </>
              )}
            </div>
          ) : (isSender || isAdmin) ? (
            <div className="flex items-center justify-between w-full">
              <span className="text-[11px] text-neutral-400 italic">
                Awaiting recipient response...
              </span>
              <button
                type="button"
                disabled={loadingAction}
                onClick={handleCancel}
                className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-750 text-neutral-300 hover:text-white font-semibold text-xs border border-neutral-700 transition cursor-pointer"
              >
                {loadingAction ? 'Cancelling...' : 'Cancel Request'}
              </button>
            </div>
          ) : (
            <div className="text-[11px] text-neutral-400 italic">
              Transfer pending recipient review
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TaskTransferCard;
