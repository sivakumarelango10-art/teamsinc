import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  Search,
  Filter,
  RefreshCw,
  TrendingUp,
  AlertCircle,
  Sparkles,
  MessageSquare
} from 'lucide-react';
import { attendanceApi, getAttendanceStatusConfig } from '../../api/attendanceApi';
import LoadingSpinner from '../common/LoadingSpinner';

export const MyAttendanceView = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [stats, setStats] = useState({
    totalWeeklyMeetings: 0,
    attendedCount: 0,
    missedCount: 0,
    unmarkedCount: 0,
    attendanceRate: 0
  });

  const [history, setHistory] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const fetchMyAttendance = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const res = await attendanceApi.getMyAttendance();
      setStats(res.stats || {
        totalWeeklyMeetings: 0,
        attendedCount: 0,
        missedCount: 0,
        unmarkedCount: 0,
        attendanceRate: 0
      });
      setHistory(res.history || []);
    } catch (err) {
      console.error('Failed to load my attendance:', err);
      setError(err.message || 'Unable to load attendance history.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMyAttendance();
  }, [fetchMyAttendance]);

  const filteredHistory = useMemo(() => {
    return history.filter(item => {
      const matchesSearch = item.meetingTitle?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'PRESENT' && item.status === 'PRESENT') ||
        (statusFilter === 'ABSENT' && item.status === 'ABSENT') ||
        (statusFilter === 'UNMARKED' && item.status === 'UNMARKED');

      return matchesSearch && matchesStatus;
    });
  }, [history, searchQuery, statusFilter]);

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-neutral-400">
        <LoadingSpinner size="lg" />
        <p className="mt-3 text-sm font-medium">Loading your weekly attendance records...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-neutral-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            My Weekly Meeting Attendance
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Track your personal attendance records and participation across all weekly team meetings.
          </p>
        </div>

        <button
          onClick={() => fetchMyAttendance(true)}
          disabled={refreshing}
          className="px-3 py-1.5 rounded-xl text-xs font-medium text-neutral-300 hover:text-white bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 transition flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-800/80 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
        <div className="p-4 bg-neutral-900/60 border border-neutral-800 rounded-2xl">
          <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Weekly Sessions</span>
          <p className="text-2xl font-bold text-white mt-1">{stats.totalWeeklyMeetings}</p>
        </div>

        <div className="p-4 bg-emerald-950/20 border border-emerald-900/40 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">Attended</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-300 mt-1">{stats.attendedCount}</p>
        </div>

        <div className="p-4 bg-rose-950/20 border border-rose-900/40 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider">Missed</span>
            <XCircle className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-bold text-rose-300 mt-1">{stats.missedCount}</p>
        </div>

        <div className="p-4 bg-neutral-900/60 border border-neutral-800 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Pending</span>
            <HelpCircle className="w-4 h-4 text-neutral-400" />
          </div>
          <p className="text-2xl font-bold text-neutral-300 mt-1">{stats.unmarkedCount}</p>
        </div>

        <div className="col-span-2 sm:col-span-1 p-4 bg-gradient-to-br from-blue-950/40 to-indigo-950/30 border border-blue-900/50 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider">Attendance %</span>
            <TrendingUp className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-blue-300 mt-1">
            {stats.attendanceRate}%
          </p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search meetings by title..."
            className="w-full pl-9 pr-3 py-2 bg-neutral-900/80 border border-neutral-800 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-neutral-900 border border-neutral-800 rounded-xl">
          {[
            { id: 'ALL', label: 'All' },
            { id: 'PRESENT', label: 'Attended' },
            { id: 'ABSENT', label: 'Missed' },
            { id: 'UNMARKED', label: 'Unmarked' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                statusFilter === tab.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* History List */}
      <div className="border border-neutral-800 rounded-2xl overflow-hidden bg-neutral-950/60">
        <div className="px-5 py-3.5 bg-neutral-900/60 border-b border-neutral-800 flex items-center justify-between text-xs font-semibold text-neutral-400">
          <span>Weekly Meeting Session</span>
          <span>Attendance Record</span>
        </div>

        <div className="divide-y divide-neutral-800/80">
          {filteredHistory.length === 0 ? (
            <div className="py-12 text-center text-neutral-500 text-xs">
              No weekly meeting attendance records found.
            </div>
          ) : (
            filteredHistory.map(item => {
              const statusCfg = getAttendanceStatusConfig(item.status);
              const startDate = item.startTime ? new Date(item.startTime) : null;
              const dateFormatted = startDate
                ? startDate.toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })
                : 'Date not set';
              const timeFormatted = startDate
                ? startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '';

              return (
                <div
                  key={item.id || item.meetingId}
                  className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-neutral-900/30 transition"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white">
                        {item.meetingTitle}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        Weekly
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-neutral-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                        {dateFormatted}
                      </span>
                      {timeFormatted && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-neutral-500" />
                          {timeFormatted}
                        </span>
                      )}
                    </div>

                    {item.notes && (
                      <p className="text-[11px] text-neutral-400 italic flex items-center gap-1.5 pt-0.5">
                        <MessageSquare className="w-3 h-3 text-neutral-500 shrink-0" />
                        <span>Note: {item.notes}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 ${statusCfg.bgColor} ${statusCfg.textColor} ${statusCfg.borderColor}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${statusCfg.dotColor}`} />
                      {statusCfg.label}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default MyAttendanceView;
