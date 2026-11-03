import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar,
  Clock,
  Video,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Radio,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Bell,
  Layers,
  ChevronRight,
  Sparkles,
  Users
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useRealtime } from '../../hooks/useRealtime';
import { meetingsApi } from '../../api/meetingsApi';
import { departmentsApi } from '../../api/departmentsApi';
import LiveCountdown from '../../components/meetings/LiveCountdown';
import CreateMeetingModal from '../../components/meetings/CreateMeetingModal';
import MeetingDetailModal from '../../components/meetings/MeetingDetailModal';
import MeetingCalendarView from '../../components/meetings/MeetingCalendarView';
import MyAttendanceView from '../../components/meetings/MyAttendanceView';
import AttendanceReportsView from '../../components/meetings/AttendanceReportsView';
import Avatar from '../../components/common/Avatar';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const FOUNDER_EMAIL = 'sivakumarelango10@gmail.com';

const TAB_OPTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'today', label: "Today's Meetings" },
  { id: 'live', label: 'Live Now' },
  { id: 'past', label: 'Past Meetings' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'calendar', label: 'Calendar View' }
];

const MEETING_TYPES = [
  { value: 'ALL', label: 'All Types' },
  { value: 'GENERAL', label: 'General' },
  { value: 'FOUNDER_ALL_HANDS', label: 'Founder All-Hands' },
  { value: 'SPRINT_PLANNING', label: 'Sprint Planning' },
  { value: 'CODE_REVIEW', label: 'Code Review' },
  { value: 'ONE_ON_ONE', label: '1-on-1' },
  { value: 'LEADERSHIP_ALIGNMENT', label: 'Leadership Alignment' },
  { value: 'DEPARTMENT_SYNC', label: 'Department Sync' }
];

export const MeetingHub = () => {
  const { user, profile } = useAuth();

  // Role permissions
  const isFounder = profile?.role === 'FOUNDER' || user?.email?.toLowerCase() === FOUNDER_EMAIL;
  const isAdmin = profile?.role === 'ADMIN';
  const isFounderOrAdmin = isFounder || isAdmin;

  // Active navigation tab
  const [activeTab, setActiveTab] = useState('overview');

  const tabs = useMemo(() => {
    const list = [
      { id: 'overview', label: 'Overview' },
      { id: 'upcoming', label: 'Upcoming' },
      { id: 'today', label: "Today's Meetings" },
      { id: 'live', label: 'Live Now' },
      { id: 'past', label: 'Past Meetings' },
      { id: 'cancelled', label: 'Cancelled' },
      { id: 'calendar', label: 'Calendar View' },
      { id: 'my-attendance', label: 'My Attendance' }
    ];
    if (isFounderOrAdmin) {
      list.push({ id: 'attendance-reports', label: 'Attendance Reports' });
    }
    return list;
  }, [isFounderOrAdmin]);

  // Meeting states
  const [meetings, setMeetings] = useState([]);
  const [stats, setStats] = useState({
    totalMeetings: 0,
    scheduledToday: 0,
    upcomingMeetings: 0,
    startingSoon: 0,
    currentlyLive: 0,
    completedMeetings: 0,
    cancelledMeetings: 0,
    nextMeeting: null
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [departmentsList, setDepartmentsList] = useState([]);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState(null);

  // Notifications Popover
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  // Fetch departments for filter
  useEffect(() => {
    departmentsApi.getDepartments()
      .then(depts => setDepartmentsList(depts || []))
      .catch(() => setDepartmentsList([]));
  }, []);

  // Primary loader for meetings and stats
  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const [meetingsRes, statsRes, notifRes] = await Promise.all([
        meetingsApi.getMeetings({
          search: searchQuery.trim(),
          meetingType: typeFilter,
          departmentId: departmentFilter,
          limit: 100
        }),
        meetingsApi.getMeetingStats(),
        meetingsApi.getNotifications()
      ]);

      setMeetings(meetingsRes.meetings || []);
      setStats(statsRes || {});
      setNotifications(notifRes || []);
      setRealtimeConnected(true);
    } catch (err) {
      console.error('Failed to load meeting hub data:', err);
      setRealtimeConnected(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery, typeFilter, departmentFilter]);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Ultra-Realtime Subscription: Listen on meetings, participants, notifications
  useRealtime(
    ['meetings', 'meeting_participants', 'meeting_notifications'],
    () => {
      // Automatic non-blocking refresh when database changes occur
      loadData(true);
    },
    {
      debounceMs: 250,
      channelPrefix: 'teamsync_meeting_hub',
      broadcastChannel: 'teamsync_meetings_channel'
    }
  );

  // Copy link helper
  const handleCopy = (id, link, e) => {
    e.stopPropagation();
    if (link) {
      navigator.clipboard.writeText(link);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Safe join meeting
  const handleJoin = (link, e) => {
    e.stopPropagation();
    if (link) {
      window.open(link, '_blank', 'noopener,noreferrer');
    }
  };

  // Mark notification as read
  const handleReadNotification = async (notifId) => {
    try {
      await meetingsApi.markNotificationAsRead(notifId);
      setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, is_read: true } : n));
    } catch {
      // Ignore
    }
  };

  // Filter meetings according to active tab
  const filteredMeetings = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];

    return meetings.filter(m => {
      if (activeTab === 'upcoming') {
        return m.computedStatus === 'SCHEDULED' || m.computedStatus === 'STARTING_SOON';
      }
      if (activeTab === 'today') {
        const mDate = new Date(m.startTime).toISOString().split('T')[0];
        return mDate === today && m.status !== 'CANCELLED';
      }
      if (activeTab === 'live') {
        return m.computedStatus === 'LIVE';
      }
      if (activeTab === 'past') {
        return m.computedStatus === 'COMPLETED' || m.status === 'COMPLETED';
      }
      if (activeTab === 'cancelled') {
        return m.status === 'CANCELLED';
      }
      // 'overview' and 'calendar' show all in-scope meetings
      return true;
    });
  }, [meetings, activeTab]);

  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.is_read).length;
  }, [notifications]);

  return (
    <div className="space-y-6 pb-12">
      {/* ================= TOP HEADER BANNER ================= */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-br from-neutral-900 via-neutral-950 to-neutral-950 border border-neutral-800 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Video className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-white tracking-tight">Meeting Hub</h1>
              </div>
              <p className="text-xs text-neutral-400">
                {isFounder
                  ? 'Schedule, manage, and coordinate meetings seamlessly across all dates and teams'
                  : 'Discover, track, and join live and upcoming team sessions'}
              </p>
            </div>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          {/* Notifications Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 transition relative"
              title="Meeting Notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notifications Popover Dropdown */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-neutral-950 border border-neutral-800 shadow-2xl p-4 z-50 space-y-3">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Meeting Notifications ({unreadCount} unread)
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowNotifications(false)}
                    className="text-neutral-500 hover:text-white text-xs"
                  >
                    Close
                  </button>
                </div>

                <div className="max-h-72 overflow-y-auto space-y-2">
                  {notifications.length === 0 ? (
                    <div className="py-6 text-center text-xs text-neutral-500">
                      No meeting notifications yet.
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => handleReadNotification(n.id)}
                        className={`p-3 rounded-xl border text-xs cursor-pointer transition space-y-1 ${
                          n.is_read
                            ? 'bg-neutral-900/30 border-neutral-800/60 text-neutral-400'
                            : 'bg-neutral-900/80 border-blue-500/40 text-neutral-200'
                        }`}
                      >
                        <div className="flex items-center justify-between font-semibold">
                          <span className="text-white">{n.title}</span>
                          <span className="text-[10px] text-neutral-500 font-mono">
                            {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-300 leading-snug">{n.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="p-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 transition"
            title="Refresh Meetings"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
          </button>

          {/* Founder Schedule Meeting Action */}
          {isFounderOrAdmin && (
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-blue-500/20 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Schedule Meeting</span>
            </button>
          )}
        </div>
      </div>

      {/* ================= NEXT SCHEDULED MEETING HERO ================= */}
      {stats.nextMeeting && (
        <div className="p-6 rounded-2xl bg-gradient-to-r from-blue-950/40 via-neutral-900/70 to-neutral-900/90 border border-blue-500/30 shadow-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 uppercase tracking-wider">
                Next Upcoming Session
              </span>
              <LiveCountdown
                startTime={stats.nextMeeting.startTime}
                endTime={stats.nextMeeting.endTime}
                status={stats.nextMeeting.status}
                size="large"
              />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {stats.nextMeeting.title}
            </h2>
            <div className="flex items-center gap-4 text-xs text-neutral-300 flex-wrap">
              <span className="flex items-center gap-1.5 font-medium">
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                {new Date(stats.nextMeeting.startTime).toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric'
                })}
              </span>
              <span className="flex items-center gap-1.5 font-mono text-neutral-400">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                {new Date(stats.nextMeeting.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(stats.nextMeeting.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="text-neutral-500">•</span>
              <span className="font-mono text-neutral-400 text-[11px]">{stats.nextMeeting.timezone}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full lg:w-auto">
            <button
              type="button"
              onClick={(e) => handleCopy(stats.nextMeeting.id, stats.nextMeeting.meetingLink, e)}
              className="p-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-neutral-700 transition flex items-center justify-center gap-1.5 text-xs font-medium"
              title="Copy meeting link"
            >
              {copiedId === stats.nextMeeting.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copiedId === stats.nextMeeting.id ? 'Copied' : 'Copy Link'}</span>
            </button>

            <button
              type="button"
              onClick={(e) => handleJoin(stats.nextMeeting.meetingLink, e)}
              className="flex-1 lg:flex-initial px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xl shadow-emerald-600/30 transition"
            >
              <Video className="w-4 h-4" />
              <span>Join Meeting Now</span>
              <ExternalLink className="w-3.5 h-3.5 text-emerald-200" />
            </button>

            <button
              type="button"
              onClick={() => setSelectedMeeting(stats.nextMeeting)}
              className="p-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 transition text-xs font-medium"
            >
              Details
            </button>
          </div>
        </div>
      )}

      {/* ================= REAL-TIME KPI COUNTER CARDS ================= */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {/* Total Meetings */}
        <div
          onClick={() => setActiveTab('overview')}
          className={`p-4 rounded-xl border cursor-pointer transition ${
            activeTab === 'overview'
              ? 'bg-neutral-900 border-neutral-600 ring-1 ring-neutral-500'
              : 'bg-neutral-950/70 hover:bg-neutral-900/60 border-neutral-800'
          }`}
        >
          <span className="text-[11px] font-semibold text-neutral-400 block truncate">Total</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-white font-mono">{stats.totalMeetings || 0}</span>
            <Layers className="w-4 h-4 text-neutral-500" />
          </div>
        </div>

        {/* Scheduled Today */}
        <div
          onClick={() => setActiveTab('today')}
          className={`p-4 rounded-xl border cursor-pointer transition ${
            activeTab === 'today'
              ? 'bg-neutral-900 border-blue-500 ring-1 ring-blue-500'
              : 'bg-neutral-950/70 hover:bg-neutral-900/60 border-neutral-800'
          }`}
        >
          <span className="text-[11px] font-semibold text-blue-400 block truncate">Today</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-blue-400 font-mono">{stats.scheduledToday || 0}</span>
            <Calendar className="w-4 h-4 text-blue-500/70" />
          </div>
        </div>

        {/* Upcoming */}
        <div
          onClick={() => setActiveTab('upcoming')}
          className={`p-4 rounded-xl border cursor-pointer transition ${
            activeTab === 'upcoming'
              ? 'bg-neutral-900 border-indigo-500 ring-1 ring-indigo-500'
              : 'bg-neutral-950/70 hover:bg-neutral-900/60 border-neutral-800'
          }`}
        >
          <span className="text-[11px] font-semibold text-indigo-400 block truncate">Upcoming</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-indigo-400 font-mono">{stats.upcomingMeetings || 0}</span>
            <Clock className="w-4 h-4 text-indigo-500/70" />
          </div>
        </div>

        {/* Starting Soon */}
        <div
          onClick={() => setActiveTab('upcoming')}
          className="p-4 rounded-xl bg-neutral-950/70 hover:bg-neutral-900/60 border border-neutral-800 cursor-pointer transition"
        >
          <span className="text-[11px] font-semibold text-amber-400 block truncate">Starting Soon</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-amber-400 font-mono">{stats.startingSoon || 0}</span>
            <Radio className="w-4 h-4 text-amber-500/70" />
          </div>
        </div>

        {/* Currently Live */}
        <div
          onClick={() => setActiveTab('live')}
          className={`p-4 rounded-xl border cursor-pointer transition ${
            activeTab === 'live'
              ? 'bg-neutral-900 border-emerald-500 ring-1 ring-emerald-500'
              : 'bg-neutral-950/70 hover:bg-neutral-900/60 border-neutral-800'
          }`}
        >
          <span className="text-[11px] font-semibold text-emerald-400 block truncate">Live Now</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-emerald-400 font-mono">{stats.currentlyLive || 0}</span>
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </div>
        </div>

        {/* Completed */}
        <div
          onClick={() => setActiveTab('past')}
          className={`p-4 rounded-xl border cursor-pointer transition ${
            activeTab === 'past'
              ? 'bg-neutral-900 border-neutral-500 ring-1 ring-neutral-500'
              : 'bg-neutral-950/70 hover:bg-neutral-900/60 border-neutral-800'
          }`}
        >
          <span className="text-[11px] font-semibold text-neutral-400 block truncate">Completed</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-neutral-300 font-mono">{stats.completedMeetings || 0}</span>
            <CheckCircle2 className="w-4 h-4 text-neutral-500" />
          </div>
        </div>

        {/* Cancelled */}
        <div
          onClick={() => setActiveTab('cancelled')}
          className={`p-4 rounded-xl border cursor-pointer transition ${
            activeTab === 'cancelled'
              ? 'bg-neutral-900 border-red-500 ring-1 ring-red-500'
              : 'bg-neutral-950/70 hover:bg-neutral-900/60 border-neutral-800'
          }`}
        >
          <span className="text-[11px] font-semibold text-red-400 block truncate">Cancelled</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-red-400 font-mono">{stats.cancelledMeetings || 0}</span>
            <AlertCircle className="w-4 h-4 text-red-500/70" />
          </div>
        </div>
      </div>

      {/* ================= NAVIGATION TABS & SEARCH ================= */}
      <div className="space-y-4">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 border-b border-neutral-800 overflow-x-auto pb-px">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-xs font-semibold border-b-2 whitespace-nowrap transition ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-neutral-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filter Toolbar (Search, Type, Department) */}
        {activeTab !== 'calendar' && activeTab !== 'my-attendance' && activeTab !== 'attendance-reports' && (
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                type="text"
                placeholder="Search meetings by title, agenda, or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-500 text-xs focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-white text-xs focus:border-blue-500 focus:outline-none"
              >
                {MEETING_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>

              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-white text-xs focus:border-blue-500 focus:outline-none"
              >
                <option value="ALL">All Departments</option>
                {departmentsList.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ================= CONTENT VIEWS ================= */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <LoadingSpinner text="Synchronizing Meeting Hub..." size="medium" />
        </div>
      ) : activeTab === 'my-attendance' ? (
        <MyAttendanceView />
      ) : activeTab === 'attendance-reports' ? (
        <AttendanceReportsView
          onSelectMeeting={async (meetingId) => {
            const m = await meetingsApi.getMeetingById(meetingId);
            if (m) setSelectedMeeting(m);
          }}
        />
      ) : activeTab === 'calendar' ? (
        <MeetingCalendarView
          meetings={meetings}
          onSelectMeeting={(m) => setSelectedMeeting(m)}
        />
      ) : filteredMeetings.length === 0 ? (
        /* Empty State */
        <div className="p-12 text-center rounded-2xl bg-neutral-950/60 border border-neutral-800/80 space-y-4">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400">
            <Video className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">No meetings found</h3>
            <p className="text-xs text-neutral-400 max-w-sm mx-auto">
              {isFounder
                ? 'No meetings match your selected filter. Click below to schedule a new meeting or series.'
                : 'There are no active or upcoming meetings in this category right now.'}
            </p>
          </div>
          {isFounderOrAdmin && (
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center gap-2 shadow-lg shadow-blue-500/20 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Schedule New Meeting</span>
            </button>
          )}
        </div>
      ) : (
        /* Meetings Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMeetings.map((meeting) => {
            const start = new Date(meeting.startTime);
            const end = new Date(meeting.endTime);
            const dateStr = start.toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric'
            });
            const timeStr = `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            const isCancelled = meeting.status === 'CANCELLED';

            return (
              <div
                key={meeting.id}
                onClick={() => setSelectedMeeting(meeting)}
                className={`p-5 rounded-2xl border transition flex flex-col justify-between cursor-pointer group ${
                  meeting.computedStatus === 'LIVE'
                    ? 'bg-gradient-to-b from-neutral-900 to-neutral-950 border-emerald-500/60 ring-1 ring-emerald-500/50 shadow-lg shadow-emerald-950/40'
                    : 'bg-neutral-950/80 hover:bg-neutral-900/60 border-neutral-800 hover:border-neutral-700'
                }`}
              >
                <div className="space-y-3">
                  {/* Card Header Pills */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-neutral-900 text-neutral-300 border border-neutral-800">
                        {meeting.meetingType.replace(/_/g, ' ')}
                      </span>
                      {meeting.isWeeklyMeeting && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Weekly
                        </span>
                      )}
                    </div>
                    <LiveCountdown
                      startTime={meeting.startTime}
                      endTime={meeting.endTime}
                      status={meeting.status}
                    />
                  </div>

                  {/* Title */}
                  <h3 className={`text-base font-bold text-white group-hover:text-blue-400 transition leading-snug line-clamp-2 ${
                    isCancelled ? 'line-through text-neutral-400' : ''
                  }`}>
                    {meeting.title}
                  </h3>

                  {/* Date & Time */}
                  <div className="space-y-1 text-xs text-neutral-400">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span className="text-white font-medium">{dateStr}</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span>{timeStr}</span>
                      <span className="text-neutral-500">({meeting.timezone})</span>
                    </div>
                  </div>

                  {/* Agenda summary snippet */}
                  {meeting.agenda && (
                    <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed">
                      {meeting.agenda}
                    </p>
                  )}
                </div>

                {/* Card Footer Actions */}
                <div className="pt-4 mt-4 border-t border-neutral-800/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Avatar
                      src={meeting.creator?.avatar_url}
                      name={meeting.creator?.full_name || 'Founder'}
                      size="xs"
                    />
                    <span className="text-[11px] text-neutral-400 truncate max-w-[100px]">
                      {meeting.creator?.full_name || 'Founder'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {meeting.isWeeklyMeeting && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedMeeting(meeting);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 text-xs font-semibold flex items-center gap-1 transition"
                        title="View / Manage Attendance"
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Attendance</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => handleCopy(meeting.id, meeting.meetingLink, e)}
                      className="p-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white transition"
                      title="Copy meeting link"
                    >
                      {copiedId === meeting.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>

                    <button
                      type="button"
                      disabled={isCancelled}
                      onClick={(e) => handleJoin(meeting.meetingLink, e)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>Join</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ================= MODALS ================= */}
      <CreateMeetingModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          loadData(true);
        }}
      />

      <MeetingDetailModal
        isOpen={!!selectedMeeting}
        meeting={selectedMeeting}
        currentUser={profile || user}
        isFounderOrAdmin={isFounderOrAdmin}
        onClose={() => setSelectedMeeting(null)}
        onMeetingUpdated={() => {
          loadData(true);
          setSelectedMeeting(null);
        }}
        onMeetingDeleted={() => {
          loadData(true);
          setSelectedMeeting(null);
        }}
      />
    </div>
  );
};

export default MeetingHub;
