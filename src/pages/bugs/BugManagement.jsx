import React, { useState, useEffect, useCallback } from 'react';
import {
  Bug,
  AlertTriangle,
  CheckCircle2,
  Clock,
  CheckSquare,
  Search,
  Filter,
  PlusCircle,
  ExternalLink,
  Trash2,
  User,
  Shield,
  Eye,
  RefreshCw,
  Image as ImageIcon,
  Bot
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { bugsApi } from '../../api/bugsApi';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../api/supabase';
import { useRealtime, broadcastRealtimeEvent } from '../../hooks/useRealtime';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ConvertBugToTaskModal from '../../components/bugs/ConvertBugToTaskModal';

export const BugManagement = () => {
  const { isFounder, isAdmin } = useAuth();

  const [bugs, setBugs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');

  // Modals state
  const [convertingBug, setConvertingBug] = useState(null);
  const [selectedBugDetails, setSelectedBugDetails] = useState(null);

  const fetchBugs = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const data = await bugsApi.getBugs({
        status: statusFilter,
        severity: severityFilter
      });
      setBugs(data || []);
    } catch (err) {
      console.error('Failed to load bugs:', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [statusFilter, severityFilter]);

  useEffect(() => {
    fetchBugs(false);
  }, [fetchBugs]);

  // Realtime subscription for incoming bug reports
  useRealtime(
    'bug_reports',
    () => fetchBugs(true),
    { channelPrefix: 'bug_mgmt', broadcastChannel: 'teamsync_bc_bugs' }
  );

  const handleUpdateStatus = async (bugId, newStatus) => {
    const prevBugs = [...bugs];
    setBugs(prev => prev.map(b => (b.id === bugId ? { ...b, status: newStatus } : b)));
    try {
      await bugsApi.updateBug(bugId, { status: newStatus });
      broadcastRealtimeEvent('teamsync_bc_bugs', { bugId, newStatus });
      fetchBugs(true);
    } catch (err) {
      setBugs(prevBugs);
      console.error('Failed to update bug status:', err);
    }
  };

  const handleDeleteBug = async (bugId) => {
    if (!window.confirm('Are you sure you want to delete this bug report?')) return;
    const prevBugs = [...bugs];
    setBugs(prev => prev.filter(b => b.id !== bugId));
    try {
      await bugsApi.deleteBug(bugId);
      broadcastRealtimeEvent('teamsync_bc_bugs', { bugId, action: 'DELETE' });
      fetchBugs(true);
    } catch (err) {
      setBugs(prevBugs);
      console.error('Failed to delete bug report:', err);
    }
  };

  // Metrics
  const totalCount = bugs.length;
  const openCount = bugs.filter(b => b.status === 'OPEN').length;
  const inProgressCount = bugs.filter(b => b.status === 'IN_PROGRESS').length;
  const criticalCount = bugs.filter(b => b.severity === 'CRITICAL' && b.status !== 'RESOLVED' && b.status !== 'CLOSED').length;
  const resolvedCount = bugs.filter(b => b.status === 'RESOLVED' || b.status === 'CLOSED').length;

  const filteredBugs = bugs.filter(b => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      b.title.toLowerCase().includes(q) ||
      b.description.toLowerCase().includes(q) ||
      (b.reporter_name && b.reporter_name.toLowerCase().includes(q)) ||
      (b.reporter_email && b.reporter_email.toLowerCase().includes(q))
    );
  });

  const getSeverityBadge = (sev) => {
    switch (sev) {
      case 'CRITICAL':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-red-950/80 border border-red-800 text-red-300">CRITICAL</span>;
      case 'HIGH':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 border border-amber-800 text-amber-300">HIGH</span>;
      case 'MEDIUM':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-950/80 border border-blue-800 text-blue-300">MEDIUM</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-neutral-800 border border-neutral-700 text-neutral-300">LOW</span>;
    }
  };

  const getStatusBadge = (st) => {
    switch (st) {
      case 'OPEN':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">OPEN</span>;
      case 'IN_PROGRESS':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">ASSIGNED / IN PROGRESS</span>;
      case 'RESOLVED':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">RESOLVED</span>;
      case 'CLOSED':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-neutral-800 text-neutral-400 border border-neutral-700">CLOSED</span>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Bug className="w-6 h-6 text-red-400" />
            Bug Reports & Triage Hub
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Review reported issues and assign resolutions directly to engineering team members.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={fetchBugs}
            className="px-3.5 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 font-semibold text-xs flex items-center gap-2 transition cursor-pointer"
            title="Refresh bugs"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800">
          <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Total Bugs</p>
          <p className="text-2xl font-black text-white mt-1">{totalCount}</p>
        </div>
        <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-800/40">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Open Triage</p>
          <p className="text-2xl font-black text-amber-300 mt-1">{openCount}</p>
        </div>
        <div className="p-4 rounded-2xl bg-indigo-950/20 border border-indigo-800/40">
          <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-400">Assigned / In Progress</p>
          <p className="text-2xl font-black text-indigo-300 mt-1">{inProgressCount}</p>
        </div>
        <div className="p-4 rounded-2xl bg-red-950/20 border border-red-800/40">
          <p className="text-[11px] font-bold uppercase tracking-wider text-red-400">Critical / Blocker</p>
          <p className="text-2xl font-black text-red-300 mt-1">{criticalCount}</p>
        </div>
        <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-800/40 col-span-2 sm:col-span-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Resolved</p>
          <p className="text-2xl font-black text-emerald-300 mt-1">{resolvedCount}</p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="p-3 bg-neutral-900/60 border border-neutral-800 rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search bugs by title, reporter, description..."
            className="w-full pl-9 pr-4 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-white placeholder:text-neutral-500 focus:border-white outline-none transition"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-white outline-none cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>

          {/* Severity Filter */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-white outline-none cursor-pointer"
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
      </div>

      {/* Bugs List */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <LoadingSpinner text="Loading bug reports..." />
        </div>
      ) : filteredBugs.length === 0 ? (
        <div className="py-20 text-center rounded-2xl bg-neutral-900/30 border border-neutral-800 p-8">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3 opacity-80" />
          <h3 className="text-base font-bold text-white">No Bugs Reported</h3>
          <p className="text-xs text-neutral-400 mt-1">
            {searchQuery ? 'No bugs match your search filters.' : 'All systems operating smoothly with no open issues.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredBugs.map((bug) => (
            <div
              key={bug.id}
              className="p-4 sm:p-5 rounded-2xl bg-neutral-950 border border-neutral-800 hover:border-neutral-700 transition shadow-lg space-y-3"
            >
              {/* Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  {getSeverityBadge(bug.severity)}
                  {getStatusBadge(bug.status)}
                  <h3 className="text-sm font-bold text-white tracking-tight leading-snug">
                    {bug.title}
                  </h3>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-neutral-400 shrink-0">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{format(parseISO(bug.created_at), 'MMM d, yyyy · h:mm a')}</span>
                </div>
              </div>

              {/* Description */}
              <p className="text-xs text-neutral-300 leading-relaxed whitespace-pre-wrap">
                {bug.description}
              </p>

              {/* Steps to Reproduce if provided */}
              {bug.steps_to_reproduce && (
                <div className="p-3 rounded-xl bg-neutral-900/80 border border-neutral-800 text-[11px] text-neutral-300">
                  <span className="font-bold text-neutral-400 block mb-1">Steps to Reproduce:</span>
                  <p className="whitespace-pre-wrap">{bug.steps_to_reproduce}</p>
                </div>
              )}

              {/* Card Footer Info & Actions */}
              <div className="pt-3 border-t border-neutral-850 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Reporter & Assigned Member Info */}
                <div className="flex items-center gap-3 flex-wrap text-xs text-neutral-400">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-neutral-500" />
                    <span>Reported by <strong className="text-white">{bug.reporter_name}</strong></span>
                  </div>

                  {bug.screenshot_url && (
                    <a
                      href={bug.screenshot_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-400 hover:underline flex items-center gap-1 font-semibold"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      View Attachment
                    </a>
                  )}

                  {bug.assignee && (
                    <div className="flex items-center gap-1 text-emerald-400 bg-emerald-950/30 px-2 py-0.5 rounded-lg border border-emerald-800/40">
                      <span>Assigned to: <strong>{bug.assignee.full_name}</strong></span>
                    </div>
                  )}

                  {bug.converted_task && (
                    <span className="text-[11px] text-purple-400 bg-purple-950/30 px-2 py-0.5 rounded-lg border border-purple-800/40">
                      Task: {bug.converted_task.title} ({bug.converted_task.status})
                    </span>
                  )}
                </div>

                {/* Quick Action Buttons */}
                <div className="flex items-center gap-2">
                  {/* Convert to Task with AI Triage Route */}
                  {bug.status === 'OPEN' && (
                    <button
                      type="button"
                      onClick={() => setConvertingBug(bug)}
                      className="px-3 py-1.5 rounded-xl bg-purple-950/70 hover:bg-purple-900 border border-purple-800/80 text-purple-300 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                      title="Use Gemini AI to triage and route bug to department"
                    >
                      <Bot className="w-3.5 h-3.5 text-purple-400" />
                      <span>AI Route & Convert</span>
                    </button>
                  )}

                  {bug.status === 'IN_PROGRESS' && (
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(bug.id, 'RESOLVED')}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Mark Resolved
                    </button>
                  )}

                  {bug.status === 'RESOLVED' && (
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(bug.id, 'CLOSED')}
                      className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold text-xs transition cursor-pointer"
                    >
                      Close Bug
                    </button>
                  )}

                  {isFounder && (
                    <button
                      type="button"
                      onClick={() => handleDeleteBug(bug.id)}
                      className="p-1.5 text-neutral-500 hover:text-red-400 transition cursor-pointer"
                      title="Delete bug report"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Convert Bug to Task Modal */}
      <ConvertBugToTaskModal
        bug={convertingBug}
        isOpen={!!convertingBug}
        onClose={() => setConvertingBug(null)}
        onSuccess={fetchBugs}
      />
    </div>
  );
};

export default BugManagement;
