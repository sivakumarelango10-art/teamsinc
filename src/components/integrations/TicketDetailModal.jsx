import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  FileText,
  Maximize2,
  Download,
  ZoomIn,
  ZoomOut,
  Image as ImageIcon
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ticketsApi } from '../../api/ticketsApi';
import { useAuth } from '../../hooks/useAuth';
import { useRealtime } from '../../hooks/useRealtime';
import LoadingSpinner from '../common/LoadingSpinner';

// Module-level cache for active team members to eliminate duplicate lookups (with 5-min TTL)
let cachedProfiles = null;
let cachedProfilesTimestamp = 0;
const PROFILES_CACHE_TTL = 5 * 60 * 1000;

// Helper: Format bytes into human-readable string
function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Helper: Determine if an attachment is an image
function isImageAttachment(att) {
  if (!att) return false;
  const type = (att.fileType || '').toLowerCase();
  const url = (att.fileUrl || '').toLowerCase();
  return (
    type.startsWith('image/') ||
    url.startsWith('data:image/') ||
    /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(url)
  );
}

// Helper: Extract clean file extension / type label
function getFileTypeLabel(att) {
  if (!att) return 'FILE';
  const type = (att.fileType || '').toLowerCase();
  if (type.includes('png')) return 'PNG';
  if (type.includes('jpeg') || type.includes('jpg')) return 'JPG';
  if (type.includes('webp')) return 'WEBP';
  if (type.includes('gif')) return 'GIF';
  if (type.includes('svg')) return 'SVG';
  if (att.fileName && att.fileName.includes('.')) {
    return att.fileName.split('.').pop().toUpperCase();
  }
  return 'FILE';
}

/**
 * Interactive Lightbox Modal for Image Attachments
 */
const LightboxModal = ({ attachment, onClose }) => {
  const [isZoomed, setIsZoomed] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!attachment) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/95 backdrop-blur-xl flex flex-col justify-between p-4 sm:p-6 animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Lightbox Top Header */}
      <div
        className="w-full max-w-6xl mx-auto flex items-center justify-between gap-4 pb-4 border-b border-neutral-800 text-white shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-950/60 border border-indigo-800/80 flex items-center justify-center text-indigo-400 shrink-0">
            <ImageIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white truncate" title={attachment.fileName}>
              {attachment.fileName || 'Report Screenshot'}
            </h3>
            <div className="flex items-center gap-2 text-[11px] text-neutral-400 mt-0.5">
              <span className="px-1.5 py-0.2 rounded font-mono font-bold bg-neutral-800 text-neutral-300">
                {getFileTypeLabel(attachment)}
              </span>
              <span>•</span>
              <span>{formatBytes(attachment.fileSize)}</span>
              {attachment.createdAt && (
                <>
                  <span>•</span>
                  <span>{format(parseISO(attachment.createdAt), 'MMM d, yyyy · h:mm a')}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Zoom Toggle */}
          <button
            type="button"
            onClick={() => setIsZoomed(!isZoomed)}
            className="p-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
            title={isZoomed ? 'Fit to Screen' : 'View Original Size'}
          >
            {isZoomed ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
            <span className="hidden sm:inline">{isZoomed ? 'Fit Screen' : 'Zoom 1:1'}</span>
          </button>

          {/* Download / Open in Tab */}
          <a
            href={attachment.fileUrl}
            target="_blank"
            rel="noreferrer"
            download={attachment.fileName || 'attachment.png'}
            className="p-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
            title="Download or Open in New Tab"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Open</span>
          </a>

          {/* Close Lightbox */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 transition cursor-pointer"
            title="Close Lightbox (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Lightbox Center Image View */}
      <div
        className="flex-1 w-full max-w-6xl mx-auto flex items-center justify-center overflow-auto p-2 sm:p-4 my-auto"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <img
          src={attachment.fileUrl}
          alt={attachment.fileName || 'Report Screenshot'}
          onClick={(e) => {
            e.stopPropagation();
            setIsZoomed(!isZoomed);
          }}
          className={`transition-all duration-200 rounded-lg shadow-2xl select-none ${
            isZoomed
              ? 'max-w-none cursor-zoom-out'
              : 'max-h-[78vh] max-w-full object-contain cursor-zoom-in'
          }`}
        />
      </div>

      {/* Lightbox Footer Note */}
      <div className="w-full text-center text-[11px] text-neutral-500 pt-2 shrink-0">
        Click image to toggle 1:1 zoom · Press <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 font-mono text-[10px]">Esc</kbd> to exit
      </div>
    </div>
  );
};

/**
 * Individual Attachment Card with Thumbnail & Metadata
 */
const AttachmentCard = ({ attachment, onPreview }) => {
  const [imgError, setImgError] = useState(false);
  const isImg = isImageAttachment(attachment) && !imgError;

  return (
    <div
      onClick={() => {
        if (isImg) onPreview(attachment);
      }}
      className={`rounded-2xl bg-neutral-900/80 border border-neutral-800 hover:border-neutral-700 transition overflow-hidden group shadow-md flex flex-col justify-between ${
        isImg ? 'cursor-pointer hover:shadow-indigo-950/30' : ''
      }`}
    >
      {/* Thumbnail or Fallback Header */}
      {isImg ? (
        <div className="aspect-video w-full bg-neutral-950/80 relative overflow-hidden flex items-center justify-center border-b border-neutral-800/80">
          <img
            src={attachment.fileUrl}
            alt={attachment.fileName || 'Attachment'}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          {/* Hover Overlay */}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white text-xs font-semibold backdrop-blur-[2px]">
            <Maximize2 className="w-4 h-4 text-indigo-400" />
            <span>Click to Preview</span>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-neutral-950/60 border-b border-neutral-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-950/30 border border-amber-800/50 flex items-center justify-center text-amber-400 shrink-0">
            <Paperclip className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-white truncate" title={attachment.fileName}>
              {attachment.fileName || 'Attached File'}
            </p>
            <p className="text-[10px] text-neutral-400">
              {imgError ? 'Preview unavailable' : getFileTypeLabel(attachment)}
            </p>
          </div>
        </div>
      )}

      {/* Card Info Footer */}
      <div className="p-3.5 flex items-center justify-between gap-3 text-xs bg-neutral-900/90">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white text-xs truncate group-hover:text-indigo-300 transition-colors" title={attachment.fileName}>
            {attachment.fileName || 'Screenshot.png'}
          </p>
          <div className="flex items-center gap-2 text-[11px] text-neutral-400 mt-0.5">
            <span className="px-1.5 py-0.2 rounded font-mono font-bold bg-neutral-800 text-neutral-300 text-[10px]">
              {getFileTypeLabel(attachment)}
            </span>
            <span>•</span>
            <span>{formatBytes(attachment.fileSize)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <a
            href={attachment.fileUrl}
            target="_blank"
            rel="noreferrer"
            download={attachment.fileName || 'attachment'}
            onClick={(e) => e.stopPropagation()}
            className="p-2 rounded-xl bg-neutral-850 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-750 transition cursor-pointer"
            title="Download or open original"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
};

export const TicketDetailModal = ({
  ticketNumber,
  initialTicket = null,
  isOpen,
  onClose,
  onUpdate,
  onTicketUpdated
}) => {
  const { profile } = useAuth();

  // Primary Ticket State (Initialized immediately with initialTicket if available for instant UI)
  const [ticket, setTicket] = useState(() => initialTicket || null);
  const [loading, setLoading] = useState(!initialTicket);
  const [secondaryLoading, setSecondaryLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState(() => cachedProfiles || []);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusError, setStatusError] = useState('');

  // Quick Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportNotice, setExportNotice] = useState('');

  const handleQuickExport = async (format) => {
    try {
      setIsExporting(true);
      setExportMenuOpen(false);
      setExportNotice(`Exporting ${format.toUpperCase()}...`);
      await ticketsApi.exportData({
        format,
        resource: 'tickets',
        filters: { ticketNumber: ticket?.ticketNumber || ticketNumber },
        userRole: profile?.role || 'MEMBER',
        userId: profile?.id || null
      });
      setExportNotice('Downloaded!');
      setTimeout(() => setExportNotice(''), 3000);
    } catch (err) {
      console.error('Failed to export ticket:', err);
      setStatusError(err.message || 'Failed to export ticket.');
    } finally {
      setIsExporting(false);
    }
  };

  // Lightbox Preview State
  const [lightboxAttachment, setLightboxAttachment] = useState(null);

  // Reference for request cancellation
  const abortControllerRef = useRef(null);

  // Sync ticket when initialTicket changes
  useEffect(() => {
    if (initialTicket && (!ticket || ticket.ticketNumber !== initialTicket.ticketNumber)) {
      setTicket(initialTicket);
      setLoading(false);
    }
  }, [initialTicket, ticket]);

  // Load ticket details and cached profiles
  const loadTicketData = useCallback(async (isSilent = false) => {
    if (!ticketNumber) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      if (!isSilent && !ticket) setLoading(true);
      setSecondaryLoading(true);
      setStatusError('');

      // 1. Fetch ticket details
      const data = await ticketsApi.getTicket(ticketNumber, controller.signal);
      if (data) {
        setTicket(data);
      }

      // 2. Fetch or reuse cached team members (with 5-minute TTL)
      const isCacheValid = cachedProfiles && cachedProfiles.length > 0 && (Date.now() - cachedProfilesTimestamp < PROFILES_CACHE_TTL);
      if (isCacheValid) {
        setTeamMembers(cachedProfiles);
      } else {
        const { supabase } = await import('../../api/supabase');
        if (supabase) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, email, role')
            .eq('is_active', true)
            .order('full_name');
          if (profiles) {
            cachedProfiles = profiles;
            cachedProfilesTimestamp = Date.now();
            setTeamMembers(profiles);
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Failed to load ticket details:', err);
      }
    } finally {
      if (!isSilent) setLoading(false);
      setSecondaryLoading(false);
    }
  }, [ticketNumber]);

  // Trigger load on open or ticket change
  useEffect(() => {
    if (isOpen && ticketNumber) {
      loadTicketData(false);
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [isOpen, ticketNumber, loadTicketData]);

  // Body scroll locking
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !lightboxAttachment && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, lightboxAttachment, onClose]);

  // Real-time synchronization for live status, priority, comments, and attachments
  useRealtime(
    ['tickets', 'ticket_comments', 'ticket_activities', 'ticket_attachments'],
    () => {
      loadTicketData(true);
    },
    { channelPrefix: `ticket_detail_${ticketNumber}`, broadcastChannel: 'teamsync_bc_tickets' }
  );

  if (!isOpen) return null;

  // Handle status transition
  const handleTransitionStatus = async (targetStatus) => {
    try {
      setActionLoading(true);
      setStatusError('');

      // Optimistic local update
      setTicket(prev => ({
        ...prev,
        status: targetStatus
      }));

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

      await loadTicketData(true);
      if (onUpdate) onUpdate();
      if (onTicketUpdated) onTicketUpdated(updated || { ...ticket, status: targetStatus, resolvedAt: updated?.resolvedAt, closedAt: updated?.closedAt });
    } catch (err) {
      setStatusError(err.message || 'Failed to update status.');
      await loadTicketData(true);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle assignment
  const handleAssign = async (profileId) => {
    try {
      setActionLoading(true);
      const updated = await ticketsApi.assignTicket(
        ticket.ticketNumber,
        profileId || null,
        profile?.full_name || 'Team Member'
      );
      await loadTicketData(true);
      if (onUpdate) onUpdate();
      if (onTicketUpdated) onTicketUpdated(updated || { ...ticket, assignedTo: profileId });
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
      const updated = await ticketsApi.updatePriority(
        ticket.ticketNumber,
        newPriority,
        profile?.full_name || 'Team Member'
      );
      await loadTicketData(true);
      if (onUpdate) onUpdate();
      if (onTicketUpdated) onTicketUpdated(updated || { ...ticket, priority: newPriority });
    } catch (err) {
      console.error('Priority change error:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // Add discussion comment with Optimistic UI update
  const handleAddComment = async (e) => {
    e.preventDefault();
    const commentText = newComment.trim();
    if (!commentText || submittingComment) return;

    // 1. Optimistic Local Comment
    const tempId = `temp_${Date.now()}`;
    const optimisticComment = {
      id: tempId,
      authorName: profile?.full_name || 'Team Member',
      authorRole: profile?.role || 'MEMBER',
      comment: commentText,
      createdAt: new Date().toISOString(),
      isPending: true
    };

    setTicket(prev => ({
      ...prev,
      comments: [...(prev?.comments || []), optimisticComment]
    }));
    setNewComment('');

    try {
      setSubmittingComment(true);
      const created = await ticketsApi.addComment(ticket.ticketNumber, {
        comment: commentText,
        authorName: profile?.full_name || 'Team Member',
        authorRole: profile?.role || 'MEMBER',
        authorId: profile?.id || null
      });

      // Reconcile optimistic comment with server response
      if (created) {
        setTicket(prev => ({
          ...prev,
          comments: (prev?.comments || []).map(c => c.id === tempId ? created : c)
        }));
      }
    } catch (err) {
      console.error('Failed to post comment:', err);
      // Rollback optimistic comment on error
      setTicket(prev => ({
        ...prev,
        comments: (prev?.comments || []).filter(c => c.id !== tempId)
      }));
      setStatusError('Failed to post comment. Please try again.');
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
      case 'ISSUE':
        return <span className="px-2 py-0.5 rounded text-[11px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/30">ISSUE</span>;
      case 'IMPROVEMENT':
        return <span className="px-2 py-0.5 rounded text-[11px] font-black bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">IMPROVEMENT</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-black bg-neutral-800 text-neutral-300 border border-neutral-700">{type}</span>;
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-150"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="relative w-full max-w-5xl bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
          {/* Top Header */}
          <div className="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/50 shrink-0">
            <div className="flex items-center gap-2.5 flex-wrap min-w-0">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-950/40 border border-red-800/60 text-red-400 text-xs font-bold shadow-sm">
                <img src="/kalvium-logo.svg" alt="Kalvium" className="w-4 h-4 rounded-sm object-contain" />
                <span>KalviLearn</span>
              </div>
              <span className="font-mono text-xs font-black px-2.5 py-1 rounded-lg bg-neutral-800 text-white border border-neutral-700 tracking-wider">
                {ticket?.ticketNumber || ticketNumber}
              </span>
              {ticket && getTypeBadge(ticket.type)}
              {ticket && getPriorityBadge(ticket.priority)}
              {ticket && getStatusBadge(ticket.status)}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Quick Export Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setExportMenuOpen(!exportMenuOpen)}
                  disabled={isExporting}
                  className="px-3 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                  title="Export this report as PDF, DOCS, or CSV"
                >
                  <Download className={`w-3.5 h-3.5 ${isExporting ? 'animate-bounce text-indigo-400' : 'text-neutral-400'}`} />
                  <span className="hidden sm:inline">{exportNotice || (isExporting ? 'Exporting...' : 'Export')}</span>
                </button>

                {exportMenuOpen && (
                  <div
                    className="absolute right-0 mt-1.5 w-48 rounded-xl bg-neutral-900 border border-neutral-800 shadow-2xl py-1.5 z-30 animate-in fade-in zoom-in-95 duration-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="px-3 py-1 text-[10px] font-bold text-neutral-400 uppercase tracking-wider border-b border-neutral-800 mb-1">
                      Export Report
                    </div>
                    <button
                      type="button"
                      onClick={() => handleQuickExport('pdf')}
                      className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:text-white hover:bg-neutral-800 flex items-center justify-between transition cursor-pointer"
                    >
                      <span>PDF Document</span>
                      <span className="text-[10px] font-mono text-rose-400 font-bold">.pdf</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickExport('docx')}
                      className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:text-white hover:bg-neutral-800 flex items-center justify-between transition cursor-pointer"
                    >
                      <span>DOCS / Word</span>
                      <span className="text-[10px] font-mono text-blue-400 font-bold">.docx</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickExport('csv')}
                      className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:text-white hover:bg-neutral-800 flex items-center justify-between transition cursor-pointer"
                    >
                      <span>CSV Spreadsheet</span>
                      <span className="text-[10px] font-mono text-emerald-400 font-bold">.csv</span>
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => loadTicketData(false)}
                disabled={actionLoading}
                className="p-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 transition cursor-pointer"
                title="Refresh report details"
              >
                <RefreshCw className={`w-4 h-4 ${secondaryLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 transition cursor-pointer"
                title="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Modal Content Body */}
          {loading && !ticket ? (
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
              <div className="lg:col-span-2 space-y-6">
                <div className="space-y-2">
                  <div className="h-7 w-3/4 bg-neutral-800/60 rounded-lg" />
                  <div className="h-4 w-1/3 bg-neutral-850 rounded" />
                </div>
                <div className="p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-3">
                  <div className="h-4 w-48 bg-neutral-800/60 rounded" />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="h-8 bg-neutral-950 rounded-lg" />
                    <div className="h-8 bg-neutral-950 rounded-lg" />
                    <div className="h-8 bg-neutral-950 rounded-lg" />
                    <div className="h-8 bg-neutral-950 rounded-lg" />
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-3">
                  <div className="h-4 w-32 bg-neutral-800/60 rounded" />
                  <div className="h-24 bg-neutral-950 rounded-xl" />
                </div>
              </div>
              <div className="space-y-6">
                <div className="p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-3">
                  <div className="h-4 w-28 bg-neutral-800/60 rounded" />
                  <div className="h-10 bg-neutral-950 rounded-xl" />
                  <div className="h-10 bg-neutral-950 rounded-xl" />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column (2 Cols): Details, Attachments, Discussion, Activity */}
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
                  <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/80 text-xs text-red-300 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                      <span>{statusError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStatusError('')}
                      className="text-red-400 hover:text-white p-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
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
                      <span className="text-white font-mono text-[11px] truncate block" title={ticket.route || 'N/A'}>
                        {ticket.route || 'N/A'}
                      </span>
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
                      <span className="text-neutral-300">{ticket.browser || 'Chrome'} · {ticket.device || 'Desktop'}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block text-[10px] uppercase font-bold">App Version</span>
                      <span className="text-neutral-300 font-mono text-[11px]">{ticket.appVersion || 'v1.0.0'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-neutral-500 block text-[10px] uppercase font-bold">External Reference</span>
                      <span className="text-neutral-400 font-mono text-[11px] truncate block">
                        {ticket.externalReferenceId || ticket.metadata?.requestId || 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Report Description */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-neutral-400" />
                    Report Description
                  </h4>
                  <div className="p-4 rounded-2xl bg-neutral-900/30 border border-neutral-800 text-xs text-neutral-200 leading-relaxed whitespace-pre-wrap">
                    {ticket.description}
                  </div>
                </div>

                {/* Dedicated ATTACHMENTS Section - Strict Zero-Attachment Rule */}
                {(() => {
                  const hasLoadedAttachments = Array.isArray(ticket.attachments) && ticket.attachments.length > 0;
                  const hasExpectedAttachment = !Array.isArray(ticket.attachments) && Boolean(ticket.metadata?.attachmentUrl || ticket.metadata?.attachment_url || ticket.attachmentUrl);

                  if (!hasLoadedAttachments && !hasExpectedAttachment) {
                    return null;
                  }

                  return (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-2">
                          <Paperclip className="w-4 h-4 text-indigo-400" />
                          ATTACHMENTS {hasLoadedAttachments ? `(${ticket.attachments.length})` : ''}
                        </h4>
                      </div>

                      {hasExpectedAttachment ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="h-28 rounded-2xl bg-neutral-900/50 border border-neutral-800 animate-pulse flex items-center justify-center text-xs text-neutral-500">
                            Loading attachment...
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {ticket.attachments.map((att) => (
                            <AttachmentCard
                              key={att.id || att.fileUrl}
                              attachment={att}
                              onPreview={(selected) => setLightboxAttachment(selected)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

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
                        <div
                          key={c.id}
                          className={`p-3.5 rounded-xl border space-y-1.5 transition-all ${
                            c.isPending
                              ? 'bg-neutral-900/40 border-indigo-500/30 opacity-70'
                              : 'bg-neutral-900/70 border-neutral-800'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white">{c.authorName}</span>
                              {c.authorRole && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-neutral-800 text-neutral-400 border border-neutral-700">
                                  {c.authorRole}
                                </span>
                              )}
                              {c.isPending && (
                                <span className="text-[10px] text-indigo-400 font-semibold italic">
                                  Sending...
                                </span>
                              )}
                            </div>
                            <span className="text-neutral-500 text-[10px]">
                              {c.createdAt ? format(parseISO(c.createdAt), 'MMM d, h:mm a') : 'just now'}
                            </span>
                          </div>
                          <p className="text-xs text-neutral-300 leading-relaxed whitespace-pre-wrap">
                            {c.comment}
                          </p>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Add Comment Form with Optimistic UI */}
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
                      className="px-4 py-2.5 rounded-xl bg-white text-black font-bold text-xs hover:bg-neutral-200 transition disabled:opacity-50 disabled:pointer-events-none flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{submittingComment ? 'Posting...' : 'Send'}</span>
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

                  <div className="text-xs text-neutral-400 flex items-center justify-between">
                    <span>Current Status:</span>
                    <strong className="text-white ml-1">{ticket.status}</strong>
                  </div>

                  <div className="space-y-2 pt-1">
                    {ticket.status === 'OPEN' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleTransitionStatus('TRIAGED')}
                          disabled={actionLoading}
                          className="w-full py-2.5 px-3 rounded-xl bg-blue-950/60 hover:bg-blue-900 border border-blue-800 text-blue-300 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Move to Triaged</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTransitionStatus('IN_PROGRESS')}
                          disabled={actionLoading}
                          className="w-full py-2.5 px-3 rounded-xl bg-indigo-950/60 hover:bg-indigo-900 border border-indigo-800 text-indigo-300 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                          <span>Start Working (In Progress)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTransitionStatus('REJECTED')}
                          disabled={actionLoading}
                          className="w-full py-2.5 px-3 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-800 text-red-400 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
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
                          className="w-full py-2.5 px-3 rounded-xl bg-indigo-950/60 hover:bg-indigo-900 border border-indigo-800 text-indigo-300 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                          <span>Move to In Progress</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTransitionStatus('BLOCKED')}
                          disabled={actionLoading}
                          className="w-full py-2.5 px-3 rounded-xl bg-orange-950/40 hover:bg-orange-900 border border-orange-800 text-orange-300 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
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
                          className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Mark Resolved</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTransitionStatus('BLOCKED')}
                          disabled={actionLoading}
                          className="w-full py-2.5 px-3 rounded-xl bg-orange-950/40 hover:bg-orange-900 border border-orange-800 text-orange-300 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
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
                        className="w-full py-2.5 px-3 rounded-xl bg-indigo-950/60 hover:bg-indigo-900 border border-indigo-800 text-indigo-300 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
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
                          className="w-full py-2.5 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <span>Close Ticket</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTransitionStatus('OPEN')}
                          disabled={actionLoading}
                          className="w-full py-2.5 px-3 rounded-xl bg-amber-950/40 hover:bg-amber-900 border border-amber-800 text-amber-300 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
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
                        className="w-full py-2.5 px-3 rounded-xl bg-amber-950/40 hover:bg-amber-900 border border-amber-800 text-amber-300 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
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
                    className="w-full px-3 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-white outline-none cursor-pointer"
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
                    className="w-full px-3 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-white outline-none cursor-pointer"
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

      {/* Interactive Lightbox Overlay Modal */}
      {lightboxAttachment && (
        <LightboxModal
          attachment={lightboxAttachment}
          onClose={() => setLightboxAttachment(null)}
        />
      )}
    </>
  );
};

export default TicketDetailModal;
