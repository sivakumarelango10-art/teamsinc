import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Inbox,
  Layers,
  Bug,
  Sparkles,
  MessageSquare,
  AlertOctagon,
  TrendingUp,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  User,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  Shield,
  Eye,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ticketsApi } from '../../api/ticketsApi';
import { useAuth } from '../../hooks/useAuth';
import { useRealtime } from '../../hooks/useRealtime';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import TicketDetailModal from '../../components/integrations/TicketDetailModal';

const REPORT_TYPE_TABS = [
  { key: 'ALL', label: 'All Reports', icon: Inbox },
  { key: 'BUG', label: 'Bugs', icon: Bug },
  { key: 'FEATURE', label: 'Features', icon: Sparkles },
  { key: 'FEEDBACK', label: 'Feedback', icon: MessageSquare },
  { key: 'ISSUE', label: 'Issues', icon: AlertOctagon },
  { key: 'IMPROVEMENT', label: 'Improvements', icon: TrendingUp }
];

const STATUS_FILTERS = [
  { key: 'ALL', label: 'All Statuses' },
  { key: 'OPEN', label: 'Open' },
  { key: 'TRIAGED', label: 'Triaged' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'BLOCKED', label: 'Blocked' },
  { key: 'RESOLVED', label: 'Resolved' },
  { key: 'CLOSED', label: 'Closed' },
  { key: 'REJECTED', label: 'Rejected' }
];

export const KalviLearnHub = () => {
  const { isFounder, isAdmin } = useAuth();

  // State
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState({
    total: 0, open: 0, triaged: 0, inProgress: 0, blocked: 0, resolved: 0, closed: 0, critical: 0,
    byType: { BUG: 0, FEATURE: 0, FEEDBACK: 0, ISSUE: 0, IMPROVEMENT: 0, OTHER: 0 }
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedTypeTab, setSelectedTypeTab] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [portalFilter, setPortalFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Modal state
  const [activeTicketNumber, setActiveTicketNumber] = useState(null);

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { ticketNumber, title }
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const handleDeleteClick = (e, ticket) => {
    e.stopPropagation();
    setDeleteError(null);
    setDeleteConfirm({ ticketNumber: ticket.ticketNumber, title: ticket.title });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await ticketsApi.deleteTicket(deleteConfirm.ticketNumber);
      setDeleteConfirm(null);
      setTickets(prev => prev.filter(t => t.ticketNumber !== deleteConfirm.ticketNumber));
      fetchStats();
      fetchTickets(true);
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete. Please try again.');
    } finally {
      setDeleting(false);
    }
  };


  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load live statistics from real DB
  const fetchStats = useCallback(async () => {
    try {
      const data = await ticketsApi.getStats();
      if (data) setStats(data);
    } catch (err) {
      console.error('Failed to load ticket stats:', err);
    }
  }, []);

  // Fetch tickets
  const fetchTickets = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const res = await ticketsApi.getTickets({
        type: selectedTypeTab,
        status: statusFilter,
        priority: priorityFilter,
        portal: portalFilter,
        search: debouncedSearch,
        page: currentPage,
        limit: 15
      });

      if (res && res.tickets) {
        setTickets(res.tickets);
        setTotalPages(res.pagination?.totalPages || 1);
        setTotalCount(res.pagination?.total || 0);
      }
    } catch (err) {
      console.error('Failed to load tickets:', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [selectedTypeTab, statusFilter, priorityFilter, portalFilter, debouncedSearch, currentPage]);

  useEffect(() => {
    fetchStats();
    fetchTickets(false);
  }, [fetchStats, fetchTickets]);

  // Realtime subscription for incoming KalviLearn reports
  useRealtime(
    'tickets',
    () => {
      fetchStats();
      fetchTickets(true);
    },
    { channelPrefix: 'kalvilearn_hub', broadcastChannel: 'teamsync_bc_tickets' }
  );

  const getStatusBadge = (st) => {
    switch (st) {
      case 'OPEN':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">OPEN</span>;
      case 'TRIAGED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30">TRIAGED</span>;
      case 'IN_PROGRESS':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">IN PROGRESS</span>;
      case 'BLOCKED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/30">BLOCKED</span>;
      case 'RESOLVED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">RESOLVED</span>;
      case 'CLOSED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-800 text-neutral-400 border border-neutral-700">CLOSED</span>;
      case 'REJECTED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-950/80 text-red-400 border border-red-800">REJECTED</span>;
      default:
        return null;
    }
  };

  const getPriorityBadge = (pr) => {
    switch (pr) {
      case 'CRITICAL':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-950/80 text-red-300 border border-red-800">CRITICAL</span>;
      case 'HIGH':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800">HIGH</span>;
      case 'MEDIUM':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-950/80 text-blue-300 border border-blue-800">MEDIUM</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-800 text-neutral-300 border border-neutral-700">LOW</span>;
    }
  };

  const getTypeBadge = (type) => {
    switch (type) {
      case 'BUG':
        return <span className="px-2 py-0.5 rounded text-[10px] font-black bg-red-500/10 text-red-400 border border-red-500/30">BUG</span>;
      case 'FEATURE':
        return <span className="px-2 py-0.5 rounded text-[10px] font-black bg-purple-500/10 text-purple-400 border border-purple-500/30">FEATURE</span>;
      case 'FEEDBACK':
        return <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">FEEDBACK</span>;
      case 'ISSUE':
        return <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/30">ISSUE</span>;
      case 'IMPROVEMENT':
        return <span className="px-2 py-0.5 rounded text-[10px] font-black bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">IMPROVEMENT</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-black bg-neutral-800 text-neutral-300 border border-neutral-700">{type}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-white overflow-hidden p-1 flex items-center justify-center shadow-md shrink-0 border border-neutral-700">
              <img
                src="/kalvium-logo.svg"
                alt="Kalvium"
                className="w-full h-full object-contain"
                loading="eager"
              />
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              KalviLearn Integration Hub
            </h1>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Centralized intake and lifecycle management for KalviLearn bugs, features, and feedback.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => { fetchStats(); fetchTickets(false); }}
            className="px-3.5 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 font-semibold text-xs flex items-center gap-2 transition cursor-pointer"
            title="Refresh reports"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Real Database KPI Metrics Cards (Never Hardcoded!) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Total Reports</p>
          <p className="text-2xl font-black text-white mt-1">{stats.total}</p>
          <span className="text-[10px] text-neutral-500 mt-0.5 block">{stats.byType.BUG} bugs · {stats.byType.FEATURE} features</span>
        </div>

        <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-800/40">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Open Triage</p>
          <p className="text-2xl font-black text-amber-300 mt-1">{stats.open}</p>
          <span className="text-[10px] text-amber-500/80 mt-0.5 block">Awaiting triage</span>
        </div>

        <div className="p-4 rounded-2xl bg-indigo-950/20 border border-indigo-800/40">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">In Progress</p>
          <p className="text-2xl font-black text-indigo-300 mt-1">{stats.inProgress}</p>
          <span className="text-[10px] text-indigo-400/80 mt-0.5 block">Active development</span>
        </div>

        <div className="p-4 rounded-2xl bg-orange-950/20 border border-orange-800/40">
          <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400">Blocked</p>
          <p className="text-2xl font-black text-orange-300 mt-1">{stats.blocked}</p>
          <span className="text-[10px] text-orange-500/80 mt-0.5 block">Needs dependency</span>
        </div>

        <div className="p-4 rounded-2xl bg-red-950/20 border border-red-800/40">
          <p className="text-[10px] font-bold uppercase tracking-wider text-red-400">Critical / Blocker</p>
          <p className="text-2xl font-black text-red-300 mt-1">{stats.critical}</p>
          <span className="text-[10px] text-red-500/80 mt-0.5 block">High urgency</span>
        </div>

        <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-800/40">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Resolved / Closed</p>
          <p className="text-2xl font-black text-emerald-300 mt-1">{stats.resolved + stats.closed}</p>
          <span className="text-[10px] text-emerald-500/80 mt-0.5 block">{stats.resolved} resolved · {stats.closed} closed</span>
        </div>
      </div>

      {/* Report Type Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-neutral-800">
        {REPORT_TYPE_TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = selectedTypeTab === tab.key;
          const count = tab.key === 'ALL' ? stats.total : (stats.byType[tab.key] || 0);

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => { setSelectedTypeTab(tab.key); setCurrentPage(1); }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-white text-black shadow-md'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? 'bg-black/10 text-black' : 'bg-neutral-800 text-neutral-400'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search & Filter Toolbar */}
      <div className="p-3 bg-neutral-900/60 border border-neutral-800 rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ticket #, title, reporter, module, route, labels..."
            className="w-full pl-9 pr-4 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-white placeholder:text-neutral-500 focus:border-white outline-none transition"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 overflow-x-auto">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            className="px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-white outline-none cursor-pointer"
          >
            {STATUS_FILTERS.map(sf => (
              <option key={sf.key} value={sf.key}>{sf.label}</option>
            ))}
          </select>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => { setPriorityFilter(e.target.value); setCurrentPage(1); }}
            className="px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-white outline-none cursor-pointer"
          >
            <option value="ALL">All Priorities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          {/* Portal Filter */}
          <select
            value={portalFilter}
            onChange={(e) => { setPortalFilter(e.target.value); setCurrentPage(1); }}
            className="px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-white outline-none cursor-pointer"
          >
            <option value="ALL">All Portals</option>
            <option value="MENTOR">Mentor</option>
            <option value="STUDENT">Student</option>
            <option value="CAMPUS_MANAGER">Campus Manager</option>
          </select>
        </div>
      </div>

      {/* Tickets List / Table */}
      {loading ? (
        <div className="py-24 flex justify-center items-center">
          <LoadingSpinner text="Loading KalviLearn tickets..." />
        </div>
      ) : tickets.length === 0 ? (
        <div className="py-20 text-center rounded-2xl bg-neutral-900/30 border border-neutral-800 p-8 space-y-2">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-2 opacity-80" />
          <h3 className="text-base font-bold text-white">No Tickets Found</h3>
          <p className="text-xs text-neutral-400 max-w-md mx-auto">
            {searchQuery || statusFilter !== 'ALL' || priorityFilter !== 'ALL'
              ? 'No reports match your active filters or search terms.'
              : 'All systems operational. No open reports currently registered from KalviLearn.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map(ticket => (
            <div
              key={ticket.id}
              onClick={() => setActiveTicketNumber(ticket.ticketNumber)}
              className="p-4 sm:p-5 rounded-2xl bg-neutral-950 border border-neutral-800 hover:border-neutral-700 transition shadow-lg space-y-3 cursor-pointer group"
            >
              {/* Header Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs font-black px-2 py-0.5 rounded bg-neutral-800 text-white border border-neutral-700">
                    <img src="/kalvium-logo.svg" alt="" className="w-3.5 h-3.5 object-contain rounded-sm" />
                    {ticket.ticketNumber}
                  </span>
                  {getTypeBadge(ticket.type)}
                  {getPriorityBadge(ticket.priority)}
                  {getStatusBadge(ticket.status)}
                  <h3 className="text-sm font-bold text-white tracking-tight group-hover:text-indigo-300 transition-colors">
                    {ticket.title}
                  </h3>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-neutral-500 shrink-0">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{ticket.createdAt ? format(parseISO(ticket.createdAt), 'MMM d, yyyy · h:mm a') : ''}</span>
                </div>
              </div>

              {/* Description Preview */}
              <p className="text-xs text-neutral-300 line-clamp-2 leading-relaxed">
                {ticket.description}
              </p>

              {/* Card Footer: Metadata & Assignee */}
              <div className="pt-2.5 border-t border-neutral-850 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3 flex-wrap text-neutral-400 text-[11px]">
                  {ticket.portal && (
                    <span className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-300 font-semibold">
                      Portal: {ticket.portal}
                    </span>
                  )}
                  {ticket.module && (
                    <span className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-400">
                      Module: {ticket.module}
                    </span>
                  )}
                  {ticket.reporter?.name && (
                    <div className="flex items-center gap-1 text-neutral-400">
                      <User className="w-3.5 h-3.5 text-neutral-500" />
                      <span>{ticket.reporter.name} ({ticket.reporter.role || 'User'})</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {ticket.assignee ? (
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-950/30 border border-indigo-800/50 text-indigo-300 text-[11px] font-semibold">
                      Assigned: {ticket.assignee.fullName}
                    </span>
                  ) : (
                    <span className="text-neutral-500 text-[11px] italic">
                      Unassigned
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTicketNumber(ticket.ticketNumber);
                    }}
                    className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 transition"
                    title="View Ticket Details"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  {/* Delete — Founder / Admin only */}
                  {(isFounder || isAdmin) && (
                    <button
                      type="button"
                      onClick={(e) => handleDeleteClick(e, ticket)}
                      className="p-1.5 rounded-lg bg-red-950/30 hover:bg-red-900/60 text-red-500 hover:text-red-300 border border-red-900/50 hover:border-red-700 transition"
                      title="Delete Report Permanently"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Pagination Bar */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 rounded-2xl bg-neutral-950 border border-neutral-800 text-xs text-neutral-400 mt-4">
              <span>
                Showing page <strong className="text-white">{currentPage}</strong> of <strong className="text-white">{totalPages}</strong> ({totalCount} total tickets)
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  className="p-1.5 rounded-lg border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <span className="px-3 py-1 font-semibold text-white bg-neutral-900 border border-neutral-800 rounded-lg">
                  {currentPage} / {totalPages}
                </span>

                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  className="p-1.5 rounded-lg border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ticket Detail Modal */}
      {activeTicketNumber && (
        <TicketDetailModal
          ticketNumber={activeTicketNumber}
          initialTicket={tickets.find(t => t.ticketNumber === activeTicketNumber) || null}
          isOpen={!!activeTicketNumber}
          onClose={() => setActiveTicketNumber(null)}
          onUpdate={() => {
            fetchStats();
            fetchTickets(true);
          }}
          onTicketUpdated={(updated) => {
            setTickets(prev => prev.map(t => t.ticketNumber === updated.ticketNumber ? { ...t, ...updated } : t));
            fetchStats();
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
          onClick={() => { if (!deleting) setDeleteConfirm(null); }}
        >
          <div
            className="w-full max-w-md bg-neutral-950 border border-red-900/60 rounded-2xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 p-5 border-b border-neutral-800 bg-red-950/20">
              <div className="w-10 h-10 rounded-xl bg-red-950/60 border border-red-800/60 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h2 className="text-sm font-black text-white">Delete Report Permanently?</h2>
                <p className="text-[11px] text-red-400 mt-0.5">This action cannot be undone.</p>
              </div>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <p className="text-xs text-neutral-300 leading-relaxed">
                You are about to permanently delete the following report and all its associated
                comments, activities, and attachments:
              </p>

              <div className="p-3.5 rounded-xl bg-neutral-900 border border-neutral-800 space-y-1">
                <p className="text-[11px] font-mono font-black text-red-400">{deleteConfirm.ticketNumber}</p>
                <p className="text-xs font-semibold text-white line-clamp-2">{deleteConfirm.title}</p>
              </div>

              {deleteError && (
                <div className="p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-[11px] text-red-300 font-medium">
                  {deleteError}
                </div>
              )}

              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-950/20 border border-amber-800/30">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <p className="text-[11px] text-amber-300">
                  A webhook notification will be sent to KalviLearn upon deletion.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 px-5 pb-5">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-700 hover:bg-red-600 text-white text-xs font-black transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {deleting ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Permanently
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KalviLearnHub;
