import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar,
  Download,
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  Search,
  Filter,
  ChevronRight,
  ShieldAlert,
  ArrowUpRight
} from 'lucide-react';
import { attendanceApi } from '../../api/attendanceApi';
import Avatar from '../common/Avatar';
import LoadingSpinner from '../common/LoadingSpinner';

export const AttendanceReportsView = ({ onSelectMeeting = null }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Report Data
  const [summary, setSummary] = useState({
    totalWeeklyMeetings: 0,
    totalRecords: 0,
    totalPresent: 0,
    totalAbsent: 0,
    overallAttendanceRate: 0,
    atRiskMemberCount: 0
  });

  const [atRiskMembers, setAtRiskMembers] = useState([]);
  const [meetingStats, setMeetingStats] = useState([]);

  const fetchReports = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const res = await attendanceApi.getAttendanceReports({
        fromDate: fromDate || undefined,
        toDate: toDate || undefined
      });

      setSummary(res.summary || {
        totalWeeklyMeetings: 0,
        totalRecords: 0,
        totalPresent: 0,
        totalAbsent: 0,
        overallAttendanceRate: 0,
        atRiskMemberCount: 0
      });
      setAtRiskMembers(res.atRiskMembers || []);
      setMeetingStats(res.meetingStats || []);
    } catch (err) {
      console.error('Failed to load attendance reports:', err);
      setError(err.message || 'Unable to load attendance analytics.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Export CSV
  const handleExportCsv = async () => {
    try {
      setExporting(true);
      await attendanceApi.exportAttendanceCsv({
        fromDate: fromDate || undefined,
        toDate: toDate || undefined
      });
    } catch (err) {
      console.error('Failed to export CSV:', err);
      alert(err.message || 'CSV export failed.');
    } finally {
      setExporting(false);
    }
  };

  // Filtered meeting list
  const filteredMeetings = useMemo(() => {
    return meetingStats.filter(m =>
      m.title?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [meetingStats, searchQuery]);

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-neutral-400">
        <LoadingSpinner size="lg" />
        <p className="mt-3 text-sm font-medium">Generating organization attendance reports...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Bar with Export & Date Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-neutral-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Weekly Meeting Attendance Reports & Analytics
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Executive overview of weekly attendance compliance, attendance percentages, and at-risk participants.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => fetchReports(true)}
            disabled={refreshing}
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-neutral-300 hover:text-white bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 transition flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={exporting}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-1.5 shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-800/80 text-red-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-4 bg-neutral-900/60 border border-neutral-800 rounded-2xl">
          <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Weekly Meetings</span>
          <p className="text-2xl font-bold text-white mt-1">{summary.totalWeeklyMeetings}</p>
        </div>

        <div className="p-4 bg-emerald-950/20 border border-emerald-900/40 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">Overall Rate</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-300 mt-1">{summary.overallAttendanceRate}%</p>
        </div>

        <div className="p-4 bg-rose-950/20 border border-rose-900/40 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider">Total Absences</span>
            <XCircle className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-bold text-rose-300 mt-1">{summary.totalAbsent}</p>
        </div>

        <div className="p-4 bg-amber-950/20 border border-amber-900/40 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">At-Risk (≥2 Absences)</span>
            <ShieldAlert className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-amber-300 mt-1">{summary.atRiskMemberCount}</p>
        </div>
      </div>

      {/* At-Risk Members Section */}
      {atRiskMembers.length > 0 && (
        <div className="p-5 rounded-2xl bg-amber-950/15 border border-amber-800/40 space-y-3">
          <div className="flex items-center gap-2 text-amber-400">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <h3 className="text-sm font-bold text-white">
              At-Risk Team Members (High Absence Frequency)
            </h3>
          </div>
          <p className="text-xs text-neutral-400">
            Members with 2 or more absences in weekly meetings require attention to maintain team alignment.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            {atRiskMembers.map(member => (
              <div
                key={member.userId}
                className="p-3 bg-neutral-900/80 border border-neutral-800 rounded-xl flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar
                    user={{
                      name: member.fullName,
                      avatar_url: member.avatarUrl,
                      email: member.email
                    }}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{member.fullName}</p>
                    <p className="text-[11px] text-neutral-400 truncate">{member.email}</p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    {member.absentCount} missed
                  </span>
                  <p className="text-[10px] text-neutral-400 mt-0.5">{member.attendanceRate}% rate</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Meeting Comparison List */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-white">
            Weekly Meetings Performance Breakdown ({filteredMeetings.length})
          </h3>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search weekly sessions..."
              className="w-full pl-9 pr-3 py-1.5 bg-neutral-900/80 border border-neutral-800 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="border border-neutral-800 rounded-2xl overflow-hidden bg-neutral-950/60">
          <div className="px-5 py-3.5 bg-neutral-900/60 border-b border-neutral-800 flex items-center justify-between text-xs font-semibold text-neutral-400">
            <span>Weekly Session</span>
            <div className="flex items-center gap-6">
              <span className="hidden sm:inline">Present / Absent</span>
              <span>Attendance Rate</span>
              <span className="w-16 text-right">Action</span>
            </div>
          </div>

          <div className="divide-y divide-neutral-800/80">
            {filteredMeetings.length === 0 ? (
              <div className="py-12 text-center text-neutral-500 text-xs">
                No weekly meetings found matching the query.
              </div>
            ) : (
              filteredMeetings.map(meeting => {
                const dateObj = new Date(meeting.startTime);
                const dateStr = dateObj.toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                });
                const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                return (
                  <div
                    key={meeting.meetingId}
                    className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-neutral-900/30 transition"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white truncate">
                          {meeting.title}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          Weekly
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-400 flex items-center gap-1.5 mt-0.5">
                        <Calendar className="w-3 h-3 text-neutral-500" />
                        <span>{dateStr} at {timeStr}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-6 shrink-0">
                      <div className="hidden sm:flex items-center gap-2 text-xs">
                        <span className="text-emerald-400 font-semibold">{meeting.presentCount} present</span>
                        <span className="text-neutral-600">/</span>
                        <span className="text-rose-400 font-semibold">{meeting.absentCount} absent</span>
                      </div>

                      <div className="w-20 text-right">
                        <span className="text-xs font-bold text-blue-300">
                          {meeting.attendanceRate}%
                        </span>
                      </div>

                      <div className="w-16 text-right">
                        {onSelectMeeting ? (
                          <button
                            onClick={() => onSelectMeeting(meeting.meetingId)}
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition"
                          >
                            Roster
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AttendanceReportsView;
