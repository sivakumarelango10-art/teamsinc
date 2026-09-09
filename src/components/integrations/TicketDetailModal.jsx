import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  User,
  Tag,
  Shield,
  Send,
  Paperclip,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Layers,
  Monitor,
  Smartphone,
  Globe,
  RefreshCw,
  MessageSquare,
  History,
  FileText
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ticketsApi } from '../../api/ticketsApi';
import { useAuth } from '../../hooks/useAuth';
import LoadingSpinner from '../common/LoadingSpinner';

const AVAILABLE_LABELS = [
  'frontend', 'backend', 'database', 'authentication',
  'student', 'mentor', 'campus-manager', 'compiler',
  'performance', 'security', 'ui', 'ux', 'realtime'
];

export const TicketDetailModal = ({ ticketNumber, isOpen, onClose, onUpdate }) => {
  const { profile } = useAuth();

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusError, setStatusError] = useState('');

  // Load ticket details & team members
  const loadTicketData = async () => {
    if (!ticketNumber) return;
    try {
      setLoading(true);
      setStatusError('');
      const data = await ticketsApi.getTicket(ticketNumber);
      setTicket(data);

      // Load active team members for assignment dropdown
      const { supabase } = await import('../../api/supabase');
      if (supabase) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email, role')
          .eq('is_active', true)
          .order('full_name');
        setTeamMembers(profiles || []);
      }
    } catch (err) {
      console.error('Failed to load ticket details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && ticketNumber) {
      loadTicketData();
    }
  }, [isOpen, ticketNumber]);

  if (!isOpen) return null;

  // Handle status transition
  const handleTransitionStatus = async (targetStatus) => {
    try {
      setActionLoading(true);
      setStatusError('');
      const updated = await ticketsApi.updateStatus(
        ticket.ticketNumber,
        targetStatus,
        profile?.full_name || 'Team Member'
      );
      setTicket(prev => ({
        ...prev,
        status: updated.status,
        resolvedAt: updated.resolvedAt,
        closedAt: updated.closedAt
      }));
      await loadTicketData();
      if (onUpdate) onUpdate();
    } catch (err) {
      setStatusError(err.message || 'Failed to update status.');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle assignment
  const handleAssign = async (profileId) => {
    try {
      setActionLoading(true);
      await ticketsApi.assignTicket(
        ticket.ticketNumber,
        profileId || null,
        profile?.full_name || 'Team Member'
      );
      await loadTicketData();
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error('Assignment error:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle priority change
  const handlePriorityChange = async (newPriority) => {
    try {
      setActionLoading(true);
      await ticketsApi.updatePriority(
        ticket.ticketNumber,
        newPriority,
        profile?.full_name || 'Team Member'
      );
      await loadTicketData();
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error('Priority change error:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // Add discussion comment
  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || submittingComment) return;

    try {
      setSubmittingComment(true);
      await ticketsApi.addComment(ticket.ticketNumber, {
        comment: newComment.trim(),
        authorName: profile?.full_name || 'Team Member',
        authorRole: profile?.role || 'MEMBER',
        authorId: profile?.id || null
      });
      setNewComment('');
      await loadTicketData();
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const getStatusBadge = (st) => {
    switch (st) {
      case 'OPEN':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">OPEN</span>;
      case 'TRIAGED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30">TRIAGED</span>;
      case 'IN_PROGRESS':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">IN PROGRESS</span>;
      case 'BLOCKED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-orange-500/10 text-orange-400 border border-orange-500/30">BLOCKED</span>;
      case 'RESOLVED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">RESOLVED</span>;
      case 'CLOSED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-neutral-800 text-neutral-400 border border-neutral-700">CLOSED</span>;
      case 'REJECTED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-950/80 text-red-400 border border-red-800">REJECTED</span>;
      default:
        return null;
    }
  };

  const getPriorityBadge = (pr) => {
    switch (pr) {
      case 'CRITICAL':
        return <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-red-950/80 text-red-300 border border-red-800">CRITICAL</span>;
      case 'HIGH':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-950/80 text-amber-300 border border-amber-800">HIGH</span>;
      case 'MEDIUM':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-950/80 text-blue-300 border border-blue-800">MEDIUM</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-neutral-800 text-neutral-300 border border-neutral-700">LOW</span>;
    }
  };

  const getTypeBadge = (type) => {
    switch (type) {
      case 'BUG':
        return <span className="px-2 py-0.5 rounded text-[11px] font-black bg-red-500/10 text-red-400 border border-red-500/30">BUG</span>;
      case 'FEATURE':
        return <span className="px-2 py-0.5 rounded text-[11px] font-black bg-purple-500/10 text-purple-400 border border-purple-500/30">FEATURE</span>;
      case 'FEEDBACK':
        return <span className="px-2 py-0.5 rounded text-[11px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">FEEDBACK</span>;
      case 'IMPROVEMENT':
        return <span className="px-2 py-0.5 rounded text-[11px] font-black bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">IMPROVEMENT</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-black bg-neutral-800 text-neutral-300 border border-neutral-700">{type}</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Top Header */}
        <div className="p-5 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/50">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-xs font-black px-2.5 py-1 rounded-lg bg-neutral-800 text-white border border-neutral-700 tracking-wider">
              {ticket?.ticketNumber || ticketNumber}
            </span>
            {ticket && getTypeBadge(ticket.type)}
            {ticket && getPriorityBadge(ticket.priority)}
            {ticket && getStatusBadge(ticket.status)}
            <span className="text-xs text-neutral-500 font-semibold">
              Source: <strong className="text-neutral-300">{ticket?.source || 'KALVILEARN'}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadTicketData}
              disabled={loading}
              className="p-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 transition"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        {loading && !ticket ? (
          <div className="py-32 flex justify-center items-center">
            <LoadingSpinner text="Loading ticket details..." />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column (2 Cols): Details, Discussion, Activity */}
            <div className="lg:col-span-2 space-y-6">
              {/* Title & Context */}
              <div>
                <h2 className="text-xl font-black text-white tracking-tight leading-snug">
                  {ticket.title}
                </h2>
                <div className="flex items-center gap-3 text-xs text-neutral-400 mt-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-neutral-500" />
                    <span>Reported {ticket.createdAt ? format(parseISO(ticket.createdAt), 'PPpp') : 'recently'}</span>
                  </div>
                  {ticket.externalReferenceId && (
                    <span className="font-mono text-[11px] text-neutral-500 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
                      Ref: {ticket.externalReferenceId}
                    </span>
                  )}
                </div>
              </div>

              {/* Status Error Alert */}
              {statusError && (
                <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/80 text-xs text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{statusError}</span>
                </div>
              )}

              {/* KalviLearn Origin Context Card */}
              <div className="p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  KalviLearn Context & System Metadata
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-neutral-500 block text-[10px] uppercase font-bold">Portal</span>
                    <span className="text-white font-semibold">{ticket.portal || 'Not specified'}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block text-[10px] uppercase font-bold">Route</span>
                    <span className="text-white font-mono text-[11px] truncate block">{ticket.route || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block text-[10px] uppercase font-bold">Module</span>
                    <span className="text-white font-semibold">{ticket.module || 'General'}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block text-[10px] uppercase font-bold">Environment</span>
                    <span className="text-white font-semibold">{ticket.environment || 'production'}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block text-[10px] uppercase font-bold">Browser / Device</span>
                    <span className="text-neutral-300">{ticket.browser || 'Unknown'} · {ticket.device || 'Desktop'}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block text-[10px] uppercase font-bold">App Version</span>
                    <span className="text-neutral-300 font-mono text-[11px]">{ticket.appVersion || 'v1.0.0'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-neutral-500 block text-[10px] uppercase font-bold">Request Trace ID</span>
                    <span className="text-neutral-400 font-mono text-[11px] truncate block">
                      {ticket.metadata?.requestId || ticket.externalReferenceId || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-neutral-400" />
                  Report Description
                </h4>
                <div className="p-4 rounded-2xl bg-neutral-900/30 border border-neutral-800 text-xs text-neutral-200 leading-relaxed whitespace-pre-wrap">
                  {ticket.description}
                </div>
              </div>

              {/* Attachments Section */}
              {ticket.attachments && ticket.attachments.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-2">
                    <Paperclip className="w-4 h-4 text-neutral-400" />
                    Attachments ({ticket.attachments.length})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {ticket.attachments.map(att => (
                      <a
                        key={att.id}
                        href={att.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition flex items-center justify-between text-xs group"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <Paperclip className="w-4 h-4 text-indigo-400 shrink-0" />
                          <span className="text-white font-medium truncate">{att.fileName}</span>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-neutral-500 group-hover:text-white shrink-0 ml-2" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Discussion Comments Thread */}
              <div className="space-y-4 pt-4 border-t border-neutral-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-indigo-400" />
                  Team Discussion ({ticket.comments?.length || 0})
                </h4>

                {/* Comment List */}
                <div className="space-y-3">
                  {!ticket.comments || ticket.comments.length === 0 ? (
                    <p className="text-xs text-neutral-500 italic py-2">No comments on this report yet.</p>
                  ) : (
                    ticket.comments.map(c => (
                      <div key={c.id} className="p-3.5 rounded-xl bg-neutral-900/70 border border-neutral-800 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">{c.authorName}</span>
                            {c.authorRole && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-neutral-800 text-neutral-400 border border-neutral-700">
                                {c.authorRole}
                              </span>
                            )}
                          </div>
                          <span className="text-neutral-500">
                            {c.createdAt ? format(parseISO(c.createdAt), 'MMM d, h:mm a') : ''}
                          </span>
                        </div>
                        <p className="text-xs text-neutral-300 leading-relaxed whitespace-pre-wrap">
                          {c.comment}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                {/* Add Comment Form */}
                <form onSubmit={handleAddComment} className="flex gap-2">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment or update to this ticket..."
                    className="flex-1 px-4 py-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-xs text-white placeholder:text-neutral-500 focus:border-white outline-none transition"
                  />
                  <button
                    type="submit"
                    disabled={!newComment.trim() || submittingComment}
                    className="px-4 py-2.5 rounded-xl bg-white text-black font-bold text-xs hover:bg-neutral-200 transition disabled:opacity-50 disabled:pointer-events-none flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </button>
                </form>
              </div>

              {/* Audit Trail / Activity History */}
              <div className="space-y-3 pt-4 border-t border-neutral-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-2">
                  <History className="w-4 h-4 text-neutral-400" />
                  Audit History & Activity Log
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {(ticket.activities || []).map(act => (
                    <div key={act.id} className="flex items-center justify-between text-[11px] p-2 rounded-lg bg-neutral-900/30 border border-neutral-850">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-indigo-400">{act.action}</span>
                        {act.from && act.to && (
                          <span className="text-neutral-400 font-mono text-[10px]">
                            {act.from} ➔ {act.to}
                          </span>
                        )}
                        <span className="text-neutral-500">by {act.performedBy}</span>
                      </div>
                      <span className="text-neutral-500 text-[10px]">
                        {act.createdAt ? format(parseISO(act.createdAt), 'MMM d, h:mm a') : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column (1 Col): Management Controls */}
            <div className="space-y-6">
              {/* Lifecycle State Machine Action Panel */}
              <div className="p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                  Lifecycle State Machine
                </h4>

                <div className="text-xs text-neutral-400">
                  Current Status: <strong className="text-white ml-1">{ticket.status}</strong>
                </div>

                <div className="space-y-2">
                  {ticket.status === 'OPEN' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleTransitionStatus('TRIAGED')}
                        disabled={actionLoading}
                        className="w-full py-2 px-3 rounded-xl bg-blue-950/60 hover:bg-blue-900 border border-blue-800 text-blue-300 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Move to Triaged</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTransitionStatus('IN_PROGRESS')}
                        disabled={actionLoading}
                        className="w-full py-2 px-3 rounded-xl bg-indigo-950/60 hover:bg-indigo-900 border border-indigo-800 text-indigo-300 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        <span>Start Working (In Progress)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTransitionStatus('REJECTED')}
                        disabled={actionLoading}
                        className="w-full py-2 px-3 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-800 text-red-400 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span>Reject Report</span>
                      </button>
                    </>
                  )}

                  {ticket.status === 'TRIAGED' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleTransitionStatus('IN_PROGRESS')}
                        disabled={actionLoading}
                        className="w-full py-2 px-3 rounded-xl bg-indigo-950/60 hover:bg-indigo-900 border border-indigo-800 text-indigo-300 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        <span>Move to In Progress</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTransitionStatus('BLOCKED')}
                        disabled={actionLoading}
                        className="w-full py-2 px-3 rounded-xl bg-orange-950/40 hover:bg-orange-900 border border-orange-800 text-orange-300 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Mark Blocked</span>
                      </button>
                    </>
                  )}

                  {ticket.status === 'IN_PROGRESS' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleTransitionStatus('RESOLVED')}
                        disabled={actionLoading}
                        className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Mark Resolved</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTransitionStatus('BLOCKED')}
                        disabled={actionLoading}
                        className="w-full py-2 px-3 rounded-xl bg-orange-950/40 hover:bg-orange-900 border border-orange-800 text-orange-300 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Mark Blocked</span>
                      </button>
                    </>
                  )}

                  {ticket.status === 'BLOCKED' && (
                    <button
                      type="button"
                      onClick={() => handleTransitionStatus('IN_PROGRESS')}
                      disabled={actionLoading}
                      className="w-full py-2 px-3 rounded-xl bg-indigo-950/60 hover:bg-indigo-900 border border-indigo-800 text-indigo-300 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>Unblock & Resume In Progress</span>
                    </button>
                  )}

                  {ticket.status === 'RESOLVED' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleTransitionStatus('CLOSED')}
                        disabled={actionLoading}
                        className="w-full py-2 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span>Close Ticket</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTransitionStatus('OPEN')}
                        disabled={actionLoading}
                        className="w-full py-2 px-3 rounded-xl bg-amber-950/40 hover:bg-amber-900 border border-amber-800 text-amber-300 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Reopen Ticket</span>
                      </button>
                    </>
                  )}

                  {(ticket.status === 'CLOSED' || ticket.status === 'REJECTED') && (
                    <button
                      type="button"
                      onClick={() => handleTransitionStatus('OPEN')}
                      disabled={actionLoading}
                      className="w-full py-2 px-3 rounded-xl bg-amber-950/40 hover:bg-amber-900 border border-amber-800 text-amber-300 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Reopen Ticket</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Assignment Selector */}
              <div className="p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-2">
                  <User className="w-4 h-4 text-neutral-400" />
                  Assigned Team Member
                </h4>

                <select
                  value={ticket.assignedTo || ''}
                  onChange={(e) => handleAssign(e.target.value)}
                  disabled={actionLoading}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-white outline-none cursor-pointer"
                >
                  <option value="">Unassigned</option>
                  {teamMembers.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.full_name} ({m.role})
                    </option>
                  ))}
                </select>

                {ticket.assignee && (
                  <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 text-xs flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center font-bold text-white shrink-0">
                      {ticket.assignee.fullName?.charAt(0) || 'U'}
                    </div>
                    <div className="truncate min-w-0">
                      <p className="font-bold text-white truncate">{ticket.assignee.fullName}</p>
                      <p className="text-[11px] text-neutral-400 truncate">{ticket.assignee.email}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Priority Selector */}
              <div className="p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                  Priority Management
                </h4>

                <select
                  value={ticket.priority}
                  onChange={(e) => handlePriorityChange(e.target.value)}
                  disabled={actionLoading}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-white outline-none cursor-pointer"
                >
                  <option value="CRITICAL">Critical (Blocker)</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>

              {/* KalviLearn Reporter Profile Card */}
              <div className="p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-2 text-xs">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                  Reporter Information
                </h4>
                <div className="space-y-1">
                  <p className="font-bold text-white">{ticket.reporter?.name || 'KalviLearn User'}</p>
                  <p className="text-neutral-400 text-[11px]">{ticket.reporter?.email || 'No email provided'}</p>
                  {ticket.reporter?.role && (
                    <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-800 text-neutral-300 border border-neutral-700">
                      {ticket.reporter.role}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TicketDetailModal;
