import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Search,
  Filter,
  Save,
  RotateCcw,
  AlertCircle,
  Check,
  ChevronDown,
  Info,
  Clock,
  ShieldCheck,
  MessageSquare,
  Camera,
  Radio,
  Timer
} from 'lucide-react';
import { attendanceApi, calculateAttendancePercentage, getAttendanceStatusConfig } from '../../api/attendanceApi';
import { supabase } from '../../api/supabase';
import Avatar from '../common/Avatar';
import LoadingSpinner from '../common/LoadingSpinner';
import FounderAttendanceVerificationModal from './FounderAttendanceVerificationModal';

export const WeeklyAttendanceManager = ({
  meetingId,
  isFounder = false,
  isFounderOrAdmin = false,
  currentUser = null,
  onAttendanceUpdated = null
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  // Attendance payload from API
  const [meetingInfo, setMeetingInfo] = useState(null);
  const [isEligible, setIsEligible] = useState(true);
  const [roster, setRoster] = useState([]);
  const [originalRoster, setOriginalRoster] = useState([]);
  const [stats, setStats] = useState({
    totalEligible: 0,
    presentCount: 0,
    absentCount: 0,
    unmarkedCount: 0,
    attendanceRate: 0
  });
  const [liveSession, setLiveSession] = useState(null);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [startingSession, setStartingSession] = useState(false);
  const [sessionNow, setSessionNow] = useState(Date.now());
  const [sessionRequestError, setSessionRequestError] = useState('');

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, PRESENT, ABSENT, UNMARKED

  // Multi-selection for bulk operations
  const [selectedUserIds, setSelectedUserIds] = useState(new Set());
  const [bulkActionConfirm, setBulkActionConfirm] = useState(null); // 'PRESENT' | 'ABSENT' | 'UNMARKED' | null
  const [bulkNote, setBulkNote] = useState('');

  // Note modal / inline editing
  const [activeNoteUserId, setActiveNoteUserId] = useState(null);
  const [activeNoteText, setActiveNoteText] = useState('');

  // Fetch Attendance Data
  const loadAttendance = useCallback(async () => {
    if (!meetingId) return;
    try {
      setLoading(true);
      setError(null);
      const res = isFounder
        ? await attendanceApi.getLiveMeetingAttendance(meetingId)
        : await attendanceApi.getMeetingAttendance(meetingId);

      if (!res.isEligible) {
        setIsEligible(false);
        setMeetingInfo(res.meeting || null);
        setRoster([]);
        setLiveSession(null);
        return;
      }

      const normalizedRoster = (res.roster || []).map(member => ({
        ...member,
        fullName: member.fullName || member.name || 'Team Member',
        notes: member.notes || member.correctionNote || ''
      }));

      setIsEligible(true);
      setMeetingInfo(res.meeting);
      setLiveSession(res.session || null);
      setStats(res.stats || {
        totalEligible: normalizedRoster.length,
        presentCount: 0,
        absentCount: 0,
        unmarkedCount: normalizedRoster.filter(m => m.status === 'UNMARKED').length,
        attendanceRate: 0
      });

      let signedPhotoUrls = {};
      if (isFounder && supabase) {
        const signed = await Promise.all(normalizedRoster.map(async member => {
          if (!member.photoPath) return [member.userId, null];
          const { data, error: signError } = await supabase.storage
            .from('weekly-attendance-photos')
            .createSignedUrl(member.photoPath, 300);
          return [member.userId, signError ? null : data?.signedUrl || null];
        }));
        signedPhotoUrls = Object.fromEntries(signed);
      }

      setRoster(normalizedRoster.map(member => ({
        ...member,
        photoUrl: signedPhotoUrls[member.userId] || null
      })));
      setOriginalRoster(JSON.parse(JSON.stringify(normalizedRoster)));
      setSelectedUserIds(new Set());
    } catch (err) {
      console.error('Failed to load meeting attendance:', err);
      setError(err.message || 'Unable to retrieve attendance roster.');
    } finally {
      setLoading(false);
    }
  }, [meetingId, isFounder]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  // Realtime subscription for attendance updates
  useEffect(() => {
    if (!supabase || !meetingId) return;

    const channel = supabase
      .channel(`realtime:meeting_attendance:${meetingId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meeting_attendance',
          filter: `meeting_id=eq.${meetingId}`
        },
        () => { loadAttendance(); }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meeting_attendance_sessions',
          filter: `meeting_id=eq.${meetingId}`
        },
        () => { loadAttendance(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [meetingId, loadAttendance]);

  // Detect dirty unsaved modifications
  const dirtyChanges = useMemo(() => {
    const originalMap = new Map(originalRoster.map(r => [r.userId, r]));
    const changes = [];

    roster.forEach(item => {
      const orig = originalMap.get(item.userId);
      if (!orig) return;
      if (orig.status !== item.status || (orig.notes || '') !== (item.notes || '')) {
        changes.push({
          userId: item.userId,
          status: item.status,
          notes: item.notes || ''
        });
      }
    });

    return changes;
  }, [roster, originalRoster]);

  // Dynamic live stats recalculation based on current staging
  const liveStats = useMemo(() => {
    let present = 0;
    let absent = 0;
    let unmarked = 0;
    roster.forEach(r => {
      if (r.status === 'PRESENT') present++;
      else if (r.status === 'ABSENT' || r.status === 'MISSED_WINDOW') absent++;
      else unmarked++;
    });

    const rate = calculateAttendancePercentage(present, absent);

    return {
      totalEligible: roster.length,
      presentCount: present,
      absentCount: absent,
      unmarkedCount: unmarked,
      attendanceRate: rate
    };
  }, [roster]);

  const canManageAttendance = isFounder && liveSession?.status === 'CLOSED';

  useEffect(() => {
    if (!liveSession?.expiresAt) return undefined;
    const timer = window.setInterval(() => setSessionNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [liveSession?.expiresAt]);

  useEffect(() => {
    if (liveSession?.status === 'OPEN' && new Date(liveSession.expiresAt).getTime() <= sessionNow) {
      loadAttendance();
    }
  }, [liveSession?.status, liveSession?.expiresAt, sessionNow, loadAttendance]);

  const startAttendance = async () => {
    setStartingSession(true);
    setSessionRequestError('');
    try {
      await attendanceApi.startLiveAttendance(meetingId);
      setVerificationOpen(false);
      await loadAttendance();
      setSuccessMessage('Five-minute attendance window opened. Eligible Members and Admins have been notified.');
      if (onAttendanceUpdated) onAttendanceUpdated();
    } catch (err) {
      setSessionRequestError(err.message || 'Unable to start the attendance window.');
      throw err;
    } finally {
      setStartingSession(false);
    }
  };

  // Handle single status change staged in local state
  const handleStatusChange = (userId, newStatus) => {
    if (!canManageAttendance) return;
    setRoster(prev => prev.map(member => {
      if (member.userId === userId) {
        return {
          ...member,
          status: newStatus
        };
      }
      return member;
    }));
  };

  // Open note edit popover
  const handleOpenNote = (member) => {
    setActiveNoteUserId(member.userId);
    setActiveNoteText(member.notes || '');
  };

  const handleSaveNote = (userId) => {
    if (!canManageAttendance) return;
    setRoster(prev => prev.map(m => {
      if (m.userId === userId) {
        return { ...m, notes: activeNoteText.trim() };
      }
      return m;
    }));
    setActiveNoteUserId(null);
    setActiveNoteText('');
  };

  // Multi-selection helpers
  const handleToggleSelectAll = (filteredIds) => {
    if (selectedUserIds.size === filteredIds.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(filteredIds));
    }
  };

  const handleToggleSelectRow = (userId) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  // Apply bulk update
  const handleApplyBulkAction = () => {
    if (!canManageAttendance || !bulkActionConfirm || selectedUserIds.size === 0) return;

    setRoster(prev => prev.map(member => {
      if (selectedUserIds.has(member.userId)) {
        return {
          ...member,
          status: bulkActionConfirm,
          notes: bulkNote.trim() ? bulkNote.trim() : member.notes
        };
      }
      return member;
    }));

    setBulkActionConfirm(null);
    setBulkNote('');
    setSelectedUserIds(new Set());
  };

  // Save all changes to the database
  const handleSaveAttendance = async () => {
    if (!canManageAttendance || dirtyChanges.length === 0) return;

    try {
      setSaving(true);
      setError(null);
      setSuccessMessage('');

      await attendanceApi.markAttendance(meetingId, dirtyChanges);

      setSuccessMessage(`Successfully updated attendance for ${dirtyChanges.length} member${dirtyChanges.length > 1 ? 's' : ''}.`);
      setOriginalRoster(JSON.parse(JSON.stringify(roster)));
      if (onAttendanceUpdated) onAttendanceUpdated();

      setTimeout(() => {
        setSuccessMessage('');
      }, 3500);
    } catch (err) {
      console.error('Failed to save attendance:', err);
      setError(err.message || 'Failed to save attendance records.');
    } finally {
      setSaving(false);
    }
  };

  // Discard staged changes
  const handleDiscardChanges = () => {
    setRoster(JSON.parse(JSON.stringify(originalRoster)));
    setSelectedUserIds(new Set());
  };

  // Quick mark all currently unmarked members as Present
  const handleQuickMarkAllPresent = () => {
    if (!canManageAttendance) return;
    setRoster(prev => prev.map(member => ({
      ...member,
      status: 'PRESENT'
    })));
  };

  // Filtered members list
  const filteredRoster = useMemo(() => {
    return roster.filter(member => {
      const matchesSearch =
        member.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        member.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        member.role?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'ALL' || member.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [roster, searchQuery, statusFilter]);

  const filteredIds = useMemo(() => filteredRoster.map(m => m.userId), [filteredRoster]);

  if (loading) {
    return (
      <div className="py-12 flex flex-col items-center justify-center text-neutral-400">
        <LoadingSpinner size="lg" />
        <p className="mt-3 text-sm font-medium">Loading weekly attendance roster...</p>
      </div>
    );
  }

  // If meeting is not weekly, render informative restricted scope notice
  if (!isEligible) {
    return (
      <div className="p-8 text-center bg-neutral-900/40 border border-neutral-800 rounded-2xl">
        <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-3">
          <Info className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-white">Attendance Tracking Disabled</h3>
        <p className="text-sm text-neutral-400 mt-1 max-w-md mx-auto">
          Attendance tracking is strictly exclusive to <span className="text-neutral-200 font-medium">Weekly Meetings</span>. This meeting is not classified as a weekly meeting.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Messages */}
      {error && (
        <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-800/80 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {isFounder && (
        <div className="rounded-2xl border border-amber-800/50 bg-gradient-to-r from-amber-950/30 via-neutral-950 to-neutral-950 p-4 sm:p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-amber-300">Founder attendance control</p>
                <h3 className="text-sm font-bold text-white mt-0.5">
                  {!liveSession ? 'Start five-minute attendance' : liveSession.status === 'OPEN' ? 'Attendance window is live' : 'Attendance session closed'}
                </h3>
                <p className="text-[11px] text-neutral-400 mt-1">
                  {!liveSession
                    ? 'Verify with your authenticator, then open the photo attendance window for eligible Admins and Members.'
                    : liveSession.status === 'OPEN'
                      ? 'Participants can submit one photo. Manual corrections become available after the window closes.'
                      : 'Review photo submissions below and finalize missed participants.'}
                </p>
              </div>
            </div>

            {!liveSession ? (
              <button
                type="button"
                onClick={() => setVerificationOpen(true)}
                disabled={startingSession}
                className="px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-bold flex items-center justify-center gap-2"
              >
                <Radio className="w-4 h-4" />
                {startingSession ? 'Starting…' : 'Verify & Start Attendance'}
              </button>
            ) : liveSession.status === 'OPEN' ? (
              <div className="min-w-[105px] rounded-xl border border-emerald-700/50 bg-emerald-950/30 px-4 py-2 text-center">
                <div className="flex items-center justify-center gap-1 text-[10px] text-emerald-300">
                  <Timer className="w-3 h-3" /> Time remaining
                </div>
                <div className="font-mono text-2xl font-bold tabular-nums text-emerald-200">
                  {(() => {
                    const seconds = Math.max(0, Math.ceil((new Date(liveSession.expiresAt).getTime() - sessionNow) / 1000));
                    return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
                  })()}
                </div>
              </div>
            ) : (
              <span className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-300 text-xs font-semibold">Closed</span>
            )}
          </div>

          {sessionRequestError && (
            <div className="p-3 rounded-xl border border-rose-800 bg-rose-950/30 text-xs text-rose-200">{sessionRequestError}</div>
          )}

          {liveSession && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-xl bg-black/30 border border-neutral-800 p-3">
                <span className="text-[10px] uppercase tracking-wider text-neutral-500">Present</span>
                <p className="text-xl font-bold text-emerald-300">{liveStats.presentCount}</p>
              </div>
              <div className="rounded-xl bg-black/30 border border-neutral-800 p-3">
                <span className="text-[10px] uppercase tracking-wider text-neutral-500">Not marked</span>
                <p className="text-xl font-bold text-neutral-200">{liveStats.unmarkedCount}</p>
              </div>
              <div className="rounded-xl bg-black/30 border border-neutral-800 p-3">
                <span className="text-[10px] uppercase tracking-wider text-neutral-500">Missed window</span>
                <p className="text-xl font-bold text-amber-300">{liveStats.missedWindowCount || 0}</p>
              </div>
              <div className="rounded-xl bg-black/30 border border-neutral-800 p-3">
                <span className="text-[10px] uppercase tracking-wider text-neutral-500">Eligible</span>
                <p className="text-xl font-bold text-white">{liveStats.totalEligible}</p>
              </div>
            </div>
          )}

          <p className="text-[10px] text-neutral-500">
            Founder start verification uses Supabase TOTP MFA. This is a secure second factor, not Face ID or automatic facial recognition.
          </p>
        </div>
      )}

      {isFounder && (
        <FounderAttendanceVerificationModal
          isOpen={verificationOpen}
          onClose={() => setVerificationOpen(false)}
          onVerified={startAttendance}
        />
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 bg-neutral-900/60 border border-neutral-800 rounded-xl">
          <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Eligible</span>
          <p className="text-xl font-bold text-white mt-0.5">{liveStats.totalEligible}</p>
        </div>

        <div className="p-3.5 bg-emerald-950/20 border border-emerald-900/40 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">Present</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <p className="text-xl font-bold text-emerald-300 mt-0.5">{liveStats.presentCount}</p>
        </div>

        <div className="p-3.5 bg-rose-950/20 border border-rose-900/40 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider">Absent</span>
            <XCircle className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <p className="text-xl font-bold text-rose-300 mt-0.5">{liveStats.absentCount}</p>
        </div>

        <div className="p-3.5 bg-neutral-900/60 border border-neutral-800 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Unmarked</span>
            <HelpCircle className="w-3.5 h-3.5 text-neutral-400" />
          </div>
          <p className="text-xl font-bold text-neutral-300 mt-0.5">{liveStats.unmarkedCount}</p>
        </div>

        <div className="col-span-2 sm:col-span-1 p-3.5 bg-gradient-to-br from-blue-950/30 to-indigo-950/20 border border-blue-900/40 rounded-xl">
          <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider">Attendance %</span>
          <p className="text-xl font-bold text-blue-300 mt-0.5">
            {liveStats.attendanceRate}%
          </p>
        </div>
      </div>

      {/* Founder Control Bar: Filter, Search, Dirty Indicator, Save Button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search member name or email..."
            className="w-full pl-9 pr-3 py-2 bg-neutral-900/80 border border-neutral-800 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-neutral-900 border border-neutral-800 rounded-xl">
          {['ALL', 'PRESENT', 'ABSENT', 'UNMARKED'].map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition ${
                statusFilter === tab
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk Action Bar (if items selected and user is Founder/Admin) */}
      {canManageAttendance && selectedUserIds.size > 0 && (
        <div className="p-3 bg-blue-950/40 border border-blue-800/60 rounded-xl flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 text-xs text-blue-200">
            <span className="font-semibold">{selectedUserIds.size}</span> members selected
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setBulkActionConfirm('PRESENT')}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/40 transition"
            >
              Mark Present
            </button>
            <button
              onClick={() => setBulkActionConfirm('ABSENT')}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-600/30 border border-rose-500/40 text-rose-300 hover:bg-rose-600/40 transition"
            >
              Mark Absent
            </button>
            <button
              onClick={() => setBulkActionConfirm('UNMARKED')}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Bulk Confirmation Modal */}
      {bulkActionConfirm && (
        <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-700 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h4 className="text-sm font-semibold text-white">
                Confirm Bulk Action: Mark {selectedUserIds.size} members as{' '}
                <span className={bulkActionConfirm === 'PRESENT' ? 'text-emerald-400' : bulkActionConfirm === 'ABSENT' ? 'text-rose-400' : 'text-neutral-300'}>
                  {bulkActionConfirm}
                </span>?
              </h4>
              <p className="text-xs text-neutral-400 mt-0.5">
                This will update their attendance status in this weekly meeting session.
              </p>
            </div>
          </div>

          <input
            type="text"
            value={bulkNote}
            onChange={(e) => setBulkNote(e.target.value)}
            placeholder="Optional note / audit reason for bulk update..."
            className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />

          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setBulkActionConfirm(null);
                setBulkNote('');
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleApplyBulkAction}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-500 transition shadow-sm"
            >
              Apply to Selected
            </button>
          </div>
        </div>
      )}

      {/* Roster Table */}
      <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-950/60">
        <div className="px-4 py-3 bg-neutral-900/60 border-b border-neutral-800 flex items-center justify-between text-xs font-semibold text-neutral-400">
          <div className="flex items-center gap-3">
            {canManageAttendance && (
              <input
                type="checkbox"
                checked={selectedUserIds.size > 0 && selectedUserIds.size === filteredIds.length}
                onChange={() => handleToggleSelectAll(filteredIds)}
                className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
            )}
            <span>Member ({filteredRoster.length})</span>
          </div>
          <span>Status & Action</span>
        </div>

        <div className="divide-y divide-neutral-800/80 max-h-[380px] overflow-y-auto">
          {filteredRoster.length === 0 ? (
            <div className="py-8 text-center text-neutral-500 text-xs">
              No members match the current filter or search criteria.
            </div>
          ) : (
            filteredRoster.map(member => {
              const statusCfg = getAttendanceStatusConfig(member.status);
              const isSelected = selectedUserIds.has(member.userId);

              return (
                <div
                  key={member.userId}
                  className={`px-4 py-3 flex items-center justify-between gap-3 transition ${
                    isSelected ? 'bg-blue-950/20' : 'hover:bg-neutral-900/30'
                  }`}
                >
                  {/* Member identity */}
                  <div className="flex items-center gap-3 min-w-0">
                    {canManageAttendance && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectRow(member.userId)}
                        className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                      />
                    )}
                    {member.photoUrl ? (
                      <a href={member.photoUrl} target="_blank" rel="noreferrer" title="Open captured attendance photo" className="w-12 h-12 rounded-xl overflow-hidden border border-emerald-700/60 shrink-0">
                        <img src={member.photoUrl} alt={member.fullName + ' attendance capture'} className="w-full h-full object-cover" />
                      </a>
                    ) : (
                      <Avatar
                        user={{
                          name: member.fullName,
                          avatar_url: member.avatarUrl,
                          email: member.email
                        }}
                        size="sm"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white truncate">
                          {member.fullName}
                        </span>
                        {member.role === 'FOUNDER' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Founder
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-400 truncate">{member.email}</p>
                      {member.submittedAt && (
                        <p className="text-[10px] text-emerald-300 mt-0.5">
                          Photo submitted {new Date(member.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                      {member.notes && (
                        <p className="text-[10px] text-neutral-400 italic flex items-center gap-1 mt-0.5">
                          <MessageSquare className="w-2.5 h-2.5" /> {member.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions & Status Selector */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Read-only badge if not Founder/Admin */}
                    {!canManageAttendance ? (
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${statusCfg.bgColor} ${statusCfg.textColor} ${statusCfg.borderColor}`}>
                        {statusCfg.label}
                      </span>
                    ) : (
                      <>
                        {/* Status Toggle Group */}
                        <div className="inline-flex rounded-lg border border-neutral-800 bg-neutral-900 p-0.5">
                          <button
                            type="button"
                            onClick={() => handleStatusChange(member.userId, 'PRESENT')}
                            className={`px-2 py-1 text-[11px] font-semibold rounded-md transition ${
                              member.status === 'PRESENT'
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'text-neutral-400 hover:text-emerald-400'
                            }`}
                          >
                            Present
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(member.userId, 'ABSENT')}
                            className={`px-2 py-1 text-[11px] font-semibold rounded-md transition ${
                              member.status === 'ABSENT'
                                ? 'bg-rose-600 text-white shadow-sm'
                                : 'text-neutral-400 hover:text-rose-400'
                            }`}
                          >
                            Absent
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(member.userId, 'UNMARKED')}
                            className={`px-2 py-1 text-[11px] font-semibold rounded-md transition ${
                              member.status === 'UNMARKED'
                                ? 'bg-neutral-700 text-white shadow-sm'
                                : 'text-neutral-500 hover:text-neutral-300'
                            }`}
                          >
                            —
                          </button>
                        </div>

                        {/* Note Button */}
                        <button
                          type="button"
                          onClick={() => handleOpenNote(member)}
                          title="Add / Edit note"
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Note modal/popover */}
      {activeNoteUserId && (
        <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-700 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white">Correction Note / Reason</span>
            <button
              onClick={() => setActiveNoteUserId(null)}
              className="text-neutral-400 hover:text-white text-xs"
            >
              Cancel
            </button>
          </div>
          <textarea
            value={activeNoteText}
            onChange={(e) => setActiveNoteText(e.target.value)}
            rows={2}
            placeholder="e.g. Excused due to medical leave, joined asynchronously..."
            className="w-full p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => handleSaveNote(activeNoteUserId)}
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-500 transition"
            >
              Set Note
            </button>
          </div>
        </div>
      )}

      {/* Bottom Action Footer for Founder */}
      {canManageAttendance && (
        <div className="flex items-center justify-between pt-2 border-t border-neutral-800">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleQuickMarkAllPresent}
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-neutral-300 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 transition"
            >
              Mark All Present
            </button>
            {dirtyChanges.length > 0 && (
              <button
                type="button"
                onClick={handleDiscardChanges}
                className="px-3 py-1.5 rounded-xl text-xs font-medium text-neutral-400 hover:text-white transition flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Discard
              </button>
            )}
          </div>

          <button
            type="button"
            disabled={saving || dirtyChanges.length === 0}
            onClick={handleSaveAttendance}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 shadow-lg ${
              dirtyChanges.length > 0
                ? 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer shadow-blue-500/20'
                : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
            }`}
          >
            {saving ? (
              <>
                <LoadingSpinner size="sm" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>
                  {dirtyChanges.length > 0
                    ? `Save Attendance (${dirtyChanges.length} Changes)`
                    : 'Attendance Saved'}
                </span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default WeeklyAttendanceManager;

