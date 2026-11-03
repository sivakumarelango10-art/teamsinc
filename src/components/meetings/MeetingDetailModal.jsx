import React, { useState } from 'react';
import {
  X,
  Calendar,
  Clock,
  Video,
  ExternalLink,
  Copy,
  Check,
  Users,
  AlertTriangle,
  Trash2,
  Edit2,
  Slash,
  MessageSquare,
  Building2,
  Globe,
  Radio,
  FileText
} from 'lucide-react';
import { LiveCountdown } from './LiveCountdown';
import Avatar from '../common/Avatar';
import { meetingsApi } from '../../api/meetingsApi';
import WeeklyAttendanceManager from './WeeklyAttendanceManager';

export const MeetingDetailModal = ({
  isOpen,
  meeting,
  currentUser,
  isFounderOrAdmin = false,
  onClose,
  onMeetingUpdated,
  onMeetingDeleted
}) => {
  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [showDeletePrompt, setShowDeletePrompt] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);

  // RSVP state
  const [rsvpLoading, setRsvpLoading] = useState(false);

  // Edit Mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);

  // Tab state (Meeting Details vs Weekly Attendance)
  const [activeModalTab, setActiveModalTab] = useState('details');

  if (!isOpen || !meeting) return null;

  // Initialize edit form when opening edit mode
  const handleStartEdit = () => {
    const sDate = new Date(meeting.startTime);
    const eDate = new Date(meeting.endTime);
    const dateStr = sDate.toISOString().split('T')[0];
    const pad = (n) => String(n).padStart(2, '0');
    const startStr = `${pad(sDate.getHours())}:${pad(sDate.getMinutes())}`;
    const endStr = `${pad(eDate.getHours())}:${pad(eDate.getMinutes())}`;

    setEditForm({
      title: meeting.title,
      date: dateStr,
      startTime: startStr,
      endTime: endStr,
      meetingLink: meeting.meetingLink,
      meetingType: meeting.meetingType,
      agenda: meeting.agenda || '',
      description: meeting.description || '',
      visibility: meeting.visibility || 'ALL'
    });
    setIsEditing(true);
  };

  const handleCopyLink = () => {
    if (meeting.meetingLink) {
      navigator.clipboard.writeText(meeting.meetingLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Safe join meeting
  const handleJoinMeeting = () => {
    if (meeting.meetingLink) {
      window.open(meeting.meetingLink, '_blank', 'noopener,noreferrer');
    }
  };

  // Submit Edit
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setActionError(null);
    try {
      const startIso = new Date(`${editForm.date}T${editForm.startTime}:00`).toISOString();
      const endIso = new Date(`${editForm.date}T${editForm.endTime}:00`).toISOString();

      if (new Date(endIso) <= new Date(startIso)) {
        throw new Error('End time must be after start time.');
      }

      const updated = await meetingsApi.updateMeeting(meeting.id, {
        title: editForm.title.trim(),
        startTime: startIso,
        endTime: endIso,
        meetingLink: editForm.meetingLink.trim(),
        meetingType: editForm.meetingType,
        agenda: editForm.agenda.trim(),
        description: editForm.description.trim(),
        visibility: editForm.visibility
      });

      setIsEditing(false);
      if (onMeetingUpdated) onMeetingUpdated(updated);
    } catch (err) {
      setActionError(err.message || 'Failed to update meeting');
    } finally {
      setActionLoading(false);
    }
  };

  // Confirm Cancellation
  const handleConfirmCancel = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await meetingsApi.cancelMeeting(meeting.id, cancelReason);
      setShowCancelPrompt(false);
      if (onMeetingUpdated) onMeetingUpdated(updated);
    } catch (err) {
      setActionError(err.message || 'Failed to cancel meeting');
    } finally {
      setActionLoading(false);
    }
  };

  // Confirm Deletion
  const handleConfirmDelete = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      await meetingsApi.deleteMeeting(meeting.id);
      setShowDeletePrompt(false);
      onClose();
      if (onMeetingDeleted) onMeetingDeleted(meeting.id);
    } catch (err) {
      setActionError(err.message || 'Failed to delete meeting');
    } finally {
      setActionLoading(false);
    }
  };

  // RSVP response
  const handleRsvp = async (status) => {
    setRsvpLoading(true);
    try {
      await meetingsApi.respondToInvitation(meeting.id, status);
      // Refresh single meeting
      const refetched = await meetingsApi.getMeetingById(meeting.id);
      if (onMeetingUpdated && refetched) onMeetingUpdated(refetched);
    } catch (err) {
      console.error('RSVP error:', err);
    } finally {
      setRsvpLoading(false);
    }
  };

  const startDate = new Date(meeting.startTime);
  const endDate = new Date(meeting.endTime);
  const formattedDate = startDate.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  const formattedTime = `${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  const myParticipantRecord = meeting.participants?.find(
    p => p.profile_id === currentUser?.id || p.profile?.email === currentUser?.email
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-2xl bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="px-6 py-5 border-b border-neutral-800 flex items-start justify-between bg-neutral-900/40">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                {meeting.meetingType.replace(/_/g, ' ')}
              </span>
              {meeting.isWeeklyMeeting && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  Weekly Meeting · Attendance
                </span>
              )}
              <LiveCountdown
                startTime={meeting.startTime}
                endTime={meeting.endTime}
                status={meeting.status}
              />
            </div>
            <h2 className="text-xl font-bold text-white mt-1">{meeting.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Error Banner */}
        {actionError && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-950/60 border border-red-800/80 text-red-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Cancellation Notice Banner if Cancelled */}
        {meeting.status === 'CANCELLED' && (
          <div className="mx-6 mt-4 p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 space-y-1">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span>This meeting has been cancelled by leadership</span>
            </div>
            {meeting.cancellationReason && (
              <p className="text-xs text-red-200/90 pl-6">
                Reason: &ldquo;{meeting.cancellationReason}&rdquo;
              </p>
            )}
          </div>
        )}

        {/* Weekly Meeting Tab Switcher */}
        {meeting.isWeeklyMeeting && !isEditing && (
          <div className="flex border-b border-neutral-800 bg-neutral-900/40 px-6 pt-2 gap-2">
            <button
              type="button"
              onClick={() => setActiveModalTab('details')}
              className={`px-4 py-2 text-xs font-semibold border-b-2 transition ${
                activeModalTab === 'details'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-neutral-400 hover:text-white'
              }`}
            >
              Meeting Details
            </button>
            <button
              type="button"
              onClick={() => setActiveModalTab('attendance')}
              className={`px-4 py-2 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
                activeModalTab === 'attendance'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-neutral-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Attendance</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 font-bold">
                Weekly
              </span>
            </button>
          </div>
        )}

        {/* Normal Content or Edit Form */}
        {!isEditing ? (
          activeModalTab === 'attendance' && meeting.isWeeklyMeeting ? (
            <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
              <WeeklyAttendanceManager
                meetingId={meeting.id}
                isFounderOrAdmin={isFounderOrAdmin}
                currentUser={currentUser}
                onAttendanceUpdated={() => {
                  if (onMeetingUpdated) {
                    meetingsApi.getMeetingById(meeting.id).then(m => {
                      if (m) onMeetingUpdated(m);
                    });
                  }
                }}
              />
            </div>
          ) : (
            <div className="px-6 py-5 space-y-6 max-h-[70vh] overflow-y-auto">
            {/* Join Banner */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-blue-950/50 via-neutral-900/60 to-neutral-900/80 border border-blue-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center sm:text-left">
                <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
                  Meeting Access URL
                </span>
                <p className="text-xs text-neutral-300 font-mono truncate max-w-sm">
                  {meeting.meetingLink}
                </p>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="p-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition flex items-center justify-center gap-1.5 text-xs font-medium"
                  title="Copy meeting link"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleJoinMeeting}
                  disabled={meeting.status === 'CANCELLED'}
                  className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition"
                >
                  <Video className="w-4 h-4" />
                  <span>Join Meeting</span>
                  <ExternalLink className="w-3.5 h-3.5 text-emerald-200" />
                </button>
              </div>
            </div>

            {/* Time & Location Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3.5 rounded-xl bg-neutral-900/50 border border-neutral-800 space-y-1">
                <span className="text-[11px] text-neutral-400 flex items-center gap-1.5 font-medium">
                  <Calendar className="w-3.5 h-3.5 text-blue-400" />
                  Date & Time
                </span>
                <p className="text-sm font-semibold text-white">{formattedDate}</p>
                <p className="text-xs text-neutral-300 font-mono">{formattedTime}</p>
              </div>

              <div className="p-3.5 rounded-xl bg-neutral-900/50 border border-neutral-800 space-y-1">
                <span className="text-[11px] text-neutral-400 flex items-center gap-1.5 font-medium">
                  <Globe className="w-3.5 h-3.5 text-blue-400" />
                  Timezone & Scope
                </span>
                <p className="text-sm font-semibold text-white font-mono text-xs">{meeting.timezone}</p>
                <p className="text-xs text-neutral-400">
                  Visibility: <span className="text-neutral-200 font-medium">{meeting.visibility.replace(/_/g, ' ')}</span>
                </p>
              </div>
            </div>

            {/* Agenda & Description */}
            {meeting.agenda && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-blue-400" />
                  Agenda
                </h4>
                <div className="p-3.5 rounded-xl bg-neutral-900/40 border border-neutral-800 text-xs text-neutral-300 whitespace-pre-wrap leading-relaxed">
                  {meeting.agenda}
                </div>
              </div>
            )}

            {meeting.description && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
                  Notes & Details
                </h4>
                <div className="p-3.5 rounded-xl bg-neutral-900/40 border border-neutral-800 text-xs text-neutral-300 whitespace-pre-wrap leading-relaxed">
                  {meeting.description}
                </div>
              </div>
            )}

            {/* Organizer & RSVP */}
            <div className="p-4 rounded-xl bg-neutral-900/40 border border-neutral-800 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <Avatar
                    src={meeting.creator?.avatar_url}
                    name={meeting.creator?.full_name || 'Founder'}
                    size="sm"
                  />
                  <div>
                    <span className="text-xs font-semibold text-white block">
                      Organized by {meeting.creator?.full_name || 'Founder'}
                    </span>
                    <span className="text-[11px] text-neutral-400">
                      {meeting.creator?.email}
                    </span>
                  </div>
                </div>

                {/* RSVP Controls for Authorized User */}
                {currentUser && meeting.status !== 'CANCELLED' && meeting.status !== 'COMPLETED' && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-neutral-400 mr-1">RSVP:</span>
                    <button
                      type="button"
                      disabled={rsvpLoading}
                      onClick={() => handleRsvp('ACCEPTED')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                        myParticipantRecord?.status === 'ACCEPTED'
                          ? 'bg-emerald-600 text-white font-bold'
                          : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                      }`}
                    >
                      Going
                    </button>
                    <button
                      type="button"
                      disabled={rsvpLoading}
                      onClick={() => handleRsvp('TENTATIVE')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                        myParticipantRecord?.status === 'TENTATIVE'
                          ? 'bg-amber-600 text-white font-bold'
                          : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                      }`}
                    >
                      Maybe
                    </button>
                    <button
                      type="button"
                      disabled={rsvpLoading}
                      onClick={() => handleRsvp('DECLINED')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                        myParticipantRecord?.status === 'DECLINED'
                          ? 'bg-red-700 text-white font-bold'
                          : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                      }`}
                    >
                      Can&apos;t go
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Cancel Prompt Modal View */}
            {showCancelPrompt && (
              <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/80 space-y-3">
                <span className="text-xs font-bold text-red-300 uppercase tracking-wide flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  Cancel this meeting?
                </span>
                <p className="text-xs text-neutral-300">
                  Authorized participants will receive an immediate in-app cancellation notification.
                </p>
                <input
                  type="text"
                  placeholder="Cancellation reason (e.g. Rescheduled to next week)"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-white text-xs"
                />
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowCancelPrompt(false)}
                    className="px-3 py-1.5 rounded-lg text-neutral-400 hover:text-white text-xs"
                  >
                    Nevermind
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={handleConfirmCancel}
                    className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
                  >
                    {actionLoading ? 'Cancelling...' : 'Confirm Cancellation'}
                  </button>
                </div>
              </div>
            )}

            {/* Delete Prompt Modal View */}
            {showDeletePrompt && (
              <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/80 space-y-3">
                <span className="text-xs font-bold text-red-300 uppercase tracking-wide flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  Permanently delete meeting?
                </span>
                <p className="text-xs text-neutral-300">
                  This action is permanent and completely removes this meeting and its participant records from the database.
                </p>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowDeletePrompt(false)}
                    className="px-3 py-1.5 rounded-lg text-neutral-400 hover:text-white text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={handleConfirmDelete}
                    className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
                  >
                    {actionLoading ? 'Deleting...' : 'Permanently Delete'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      ) : (
          /* ================= EDIT MODE ================= */
          <form onSubmit={handleSaveEdit} className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-300">Title</label>
              <input
                type="text"
                required
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-white text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-neutral-300">Date</label>
                <input
                  type="date"
                  required
                  value={editForm.date}
                  onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-white text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-neutral-300">Start Time</label>
                <input
                  type="time"
                  required
                  value={editForm.startTime}
                  onChange={(e) => setEditForm({ ...editForm, startTime: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-white text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-neutral-300">End Time</label>
                <input
                  type="time"
                  required
                  value={editForm.endTime}
                  onChange={(e) => setEditForm({ ...editForm, endTime: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-white text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-300">Meeting Link (HTTPS)</label>
              <input
                type="url"
                required
                value={editForm.meetingLink}
                onChange={(e) => setEditForm({ ...editForm, meetingLink: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-white text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-300">Agenda</label>
              <textarea
                rows={2}
                value={editForm.agenda}
                onChange={(e) => setEditForm({ ...editForm, agenda: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-white text-xs"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 rounded-xl text-neutral-400 hover:text-white text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
              >
                {actionLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}

        {/* Footer Actions */}
        {!isEditing && (
          <div className="px-6 py-4 border-t border-neutral-800 flex items-center justify-between bg-neutral-900/30">
            {isFounderOrAdmin && meeting.status !== 'CANCELLED' && activeModalTab !== 'attendance' ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleStartEdit}
                  className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Reschedule / Edit</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowCancelPrompt(true)}
                  className="px-3 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-950/70 border border-red-800/40 text-red-300 text-xs font-medium flex items-center gap-1.5 transition"
                >
                  <Slash className="w-3.5 h-3.5" />
                  <span>Cancel Meeting</span>
                </button>
              </div>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              {isFounderOrAdmin && (
                <button
                  type="button"
                  onClick={() => setShowDeletePrompt(true)}
                  className="p-2 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-neutral-800 transition"
                  title="Delete Meeting"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold transition"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MeetingDetailModal;
