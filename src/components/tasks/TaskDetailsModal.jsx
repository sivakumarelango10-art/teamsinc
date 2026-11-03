import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Calendar,
  User,
  Shield,
  Clock,
  Building2,
  AlertTriangle,
  Layers,
  TrendingUp,
  FileText,
  ArrowRightLeft,
  Plus,
  History,
  CheckCircle2,
  Tag
} from 'lucide-react';
import { format, parseISO, isPast } from 'date-fns';
import TaskStatusBadge from './TaskStatusBadge';
import Avatar from '../common/Avatar';
import { collaborationApi } from '../../api/collaborationApi';
import NoteCard from '../collaboration/NoteCard';
import ProgressReportCard from '../collaboration/ProgressReportCard';
import TaskTransferCard from '../collaboration/TaskTransferCard';
import CreateNoteModal from '../collaboration/CreateNoteModal';
import CreateProgressReportModal from '../collaboration/CreateProgressReportModal';
import TaskTransferModal from '../collaboration/TaskTransferModal';

export const TaskDetailsModal = ({
  task,
  isOpen,
  onClose,
  currentUserId,
  currentUserRole = 'MEMBER',
  onTaskUpdated
}) => {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'reports' | 'notes' | 'transfers'
  const [reports, setReports] = useState([]);
  const [notes, setNotes] = useState([]);
  const [transferData, setTransferData] = useState({ pendingTransfer: null, history: [] });
  const [loadingExtras, setLoadingExtras] = useState(false);

  // Sub-modal triggers
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);

  const loadExtraData = useCallback(async () => {
    if (!task?.id) return;
    setLoadingExtras(true);
    try {
      const [reps, nts, trfs] = await Promise.all([
        collaborationApi.getTaskReports(task.id),
        collaborationApi.getNotes({ taskId: task.id, userId: currentUserId }),
        collaborationApi.getTaskTransfers(task.id)
      ]);
      setReports(reps || []);
      setNotes(nts || []);
      setTransferData(trfs || { pendingTransfer: null, history: [] });
    } catch (err) {
      console.warn('Failed to load task collaboration extras:', err);
    } finally {
      setLoadingExtras(false);
    }
  }, [task?.id, currentUserId]);

  useEffect(() => {
    if (isOpen && task?.id) {
      loadExtraData();
    }
  }, [isOpen, task?.id, loadExtraData]);

  if (!isOpen || !task) return null;

  const isOverdue = task.deadline && isPast(parseISO(task.deadline)) && task.status !== 'COMPLETED';
  const isAssignee = currentUserId && (task.assigned_to === currentUserId || task.assignee?.id === currentUserId);
  const isAdmin = ['ADMIN', 'FOUNDER'].includes(currentUserRole);
  const canTransfer = (isAssignee || isAdmin) && !transferData.pendingTransfer;
  const canReport = isAssignee || isAdmin;

  const priorityColors = {
    LOW: 'bg-neutral-800 text-neutral-300 border-neutral-700',
    MEDIUM: 'bg-blue-950/80 text-blue-300 border-blue-800/80',
    HIGH: 'bg-amber-950/80 text-amber-300 border-amber-800/80',
    URGENT: 'bg-red-950/80 text-red-300 border-red-800/80'
  };

  const progress = task.progress_percentage ?? 0;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl p-6 relative overflow-hidden modal-enter max-h-[90vh] flex flex-col">
        {/* Top accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-indigo-500 to-purple-600" />

        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-white transition cursor-pointer p-1 rounded-lg hover:bg-neutral-900"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Badges & Actions */}
        <div className="space-y-3 pt-1 shrink-0">
          <div className="flex items-center gap-2 flex-wrap pr-8">
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

          {/* Progress Bar & Quick Actions Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-neutral-900/60 border border-neutral-800">
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-400 font-semibold flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-neutral-500" /> Execution Progress
                </span>
                <span className="font-mono font-bold text-white text-xs">{progress}%</span>
              </div>
              <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    progress >= 100 ? 'bg-emerald-500' : progress > 50 ? 'bg-blue-500' : 'bg-amber-500'
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Quick Collaboration Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              {canReport && (
                <button
                  type="button"
                  onClick={() => setIsReportModalOpen(true)}
                  className="px-2.5 py-1.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 font-semibold text-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Report Progress</span>
                </button>
              )}
              {canTransfer && (
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(true)}
                  className="px-2.5 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 font-semibold text-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>Transfer Task</span>
                </button>
              )}
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-neutral-800 pt-1 overflow-x-auto">
            {[
              { id: 'overview', label: 'Overview', icon: Tag },
              { id: 'reports', label: `Progress Reports (${reports.length})`, icon: TrendingUp },
              { id: 'notes', label: `Linked Notes (${notes.length})`, icon: FileText },
              { id: 'transfers', label: `Transfer History (${(transferData.history || []).length})`, icon: History }
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer border-b-2 ${
                    isActive
                      ? 'border-purple-500 text-white font-bold'
                      : 'border-transparent text-neutral-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto pt-4 pr-1 space-y-4 text-xs text-neutral-300">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Active Pending Transfer Banner */}
              {transferData.pendingTransfer && (
                <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-700/80 space-y-2">
                  <div className="flex items-center justify-between text-xs text-indigo-300 font-bold">
                    <span className="flex items-center gap-1.5">
                      <ArrowRightLeft className="w-4 h-4 text-indigo-400" />
                      Pending Transfer Request
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800 text-[10px]">
                      Awaiting Recipient Response
                    </span>
                  </div>
                  <TaskTransferCard
                    transfer={transferData.pendingTransfer}
                    currentUserId={currentUserId}
                    currentUserRole={currentUserRole}
                    onStatusChange={() => {
                      loadExtraData();
                      if (onTaskUpdated) onTaskUpdated();
                    }}
                  />
                </div>
              )}

              {/* Description */}
              <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800 leading-relaxed whitespace-pre-wrap">
                {task.description || (
                  <span className="text-neutral-500 italic">No description provided for this task.</span>
                )}
              </div>

              {/* Key metadata grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Assignee */}
                <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 flex items-start gap-3">
                  <Avatar
                    src={task.assignee?.avatar_url}
                    name={task.assignee?.full_name}
                    size="sm"
                    rounded="rounded-lg"
                  />
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
          )}

          {/* TAB 2: PROGRESS REPORTS */}
          {activeTab === 'reports' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2">
                <span className="font-semibold text-white">Submitted Progress Updates</span>
                {canReport && (
                  <button
                    type="button"
                    onClick={() => setIsReportModalOpen(true)}
                    className="px-3 py-1 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Progress Report</span>
                  </button>
                )}
              </div>

              {reports.length === 0 ? (
                <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 text-center space-y-2">
                  <TrendingUp className="w-6 h-6 mx-auto text-neutral-600" />
                  <p className="text-xs text-neutral-400">No progress reports have been filed for this task yet.</p>
                </div>
              ) : (
                reports.map(rep => (
                  <ProgressReportCard key={rep.id} report={rep} />
                ))
              )}
            </div>
          )}

          {/* TAB 3: LINKED NOTES */}
          {activeTab === 'notes' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2">
                <span className="font-semibold text-white">Notes & Checklists Linked to this Task</span>
                <button
                  type="button"
                  onClick={() => setIsNoteModalOpen(true)}
                  className="px-3 py-1 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Attach Note</span>
                </button>
              </div>

              {notes.length === 0 ? (
                <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 text-center space-y-2">
                  <FileText className="w-6 h-6 mx-auto text-neutral-600" />
                  <p className="text-xs text-neutral-400">No notes or checklists attached to this task yet.</p>
                </div>
              ) : (
                notes.map(note => (
                  <NoteCard key={note.id} note={note} currentUserId={currentUserId} />
                ))
              )}
            </div>
          )}

          {/* TAB 4: TRANSFER HISTORY */}
          {activeTab === 'transfers' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2">
                <span className="font-semibold text-white">Task Ownership & Transfer Audit Log</span>
                {canTransfer && (
                  <button
                    type="button"
                    onClick={() => setIsTransferModalOpen(true)}
                    className="px-3 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1 shadow-sm"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>Initiate Transfer</span>
                  </button>
                )}
              </div>

              {(transferData.history || []).length === 0 && !transferData.pendingTransfer ? (
                <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 text-center space-y-2">
                  <History className="w-6 h-6 mx-auto text-neutral-600" />
                  <p className="text-xs text-neutral-400">This task has remained with its original assignee since creation.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {transferData.pendingTransfer && (
                    <TaskTransferCard
                      transfer={transferData.pendingTransfer}
                      currentUserId={currentUserId}
                      currentUserRole={currentUserRole}
                      onStatusChange={() => {
                        loadExtraData();
                        if (onTaskUpdated) onTaskUpdated();
                      }}
                    />
                  )}

                  {(transferData.history || []).map(hist => (
                    <div key={hist.id} className="p-3.5 rounded-xl bg-neutral-900/70 border border-neutral-800 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white uppercase tracking-wider text-[10px]">
                          Event: {hist.event_type}
                        </span>
                        <span className="font-mono text-[10px] text-neutral-500">
                          {format(parseISO(hist.created_at), 'MMM d, yyyy h:mm a')}
                        </span>
                      </div>
                      <p className="text-neutral-300">
                        {hist.actor?.full_name || 'System'} executed action <span className="font-mono text-purple-400">{hist.event_type}</span>.
                      </p>
                      {hist.notes && (
                        <p className="text-neutral-400 bg-black/40 p-2 rounded border border-neutral-850 text-[11px]">
                          {hist.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="mt-4 pt-4 border-t border-neutral-850 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-neutral-500 font-mono">
            Task ID: {task.id?.slice(0, 8)}...
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-black bg-white hover:bg-neutral-200 rounded-xl transition cursor-pointer"
          >
            Close
          </button>
        </div>

        {/* Sub-modals scoped to this task */}
        {isReportModalOpen && (
          <CreateProgressReportModal
            isOpen={isReportModalOpen}
            onClose={() => setIsReportModalOpen(false)}
            defaultTaskId={task.id}
            currentUserId={currentUserId}
            onReportSubmitted={() => {
              loadExtraData();
              if (onTaskUpdated) onTaskUpdated();
            }}
          />
        )}

        {isNoteModalOpen && (
          <CreateNoteModal
            isOpen={isNoteModalOpen}
            onClose={() => setIsNoteModalOpen(false)}
            defaultTaskId={task.id}
            currentUserId={currentUserId}
            onNoteCreated={() => loadExtraData()}
          />
        )}

        {isTransferModalOpen && (
          <TaskTransferModal
            isOpen={isTransferModalOpen}
            onClose={() => setIsTransferModalOpen(false)}
            defaultTaskId={task.id}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            onTransferRequested={() => {
              loadExtraData();
              if (onTaskUpdated) onTaskUpdated();
            }}
          />
        )}
      </div>
    </div>,
    document.body
  );
};

export default TaskDetailsModal;
