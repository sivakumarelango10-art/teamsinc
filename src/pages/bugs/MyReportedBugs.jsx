import React, { useState, useEffect, useCallback } from 'react';
import {
  Bug,
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  User,
  Image as ImageIcon,
  RefreshCw
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { bugsApi } from '../../api/bugsApi';
import { useAuth } from '../../hooks/useAuth';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ReportBugModal from '../../components/bugs/ReportBugModal';

export const MyReportedBugs = () => {
  const { profile, user } = useAuth();
  const [bugs, setBugs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  const fetchMyBugs = useCallback(async () => {
    try {
      setLoading(true);
      const userId = profile?.id || user?.id;
      const data = await bugsApi.getBugs({
        reported_by: userId
      });
      setBugs(data || []);
    } catch (err) {
      console.error('Failed to load my bugs:', err);
    } finally {
      setLoading(false);
    }
  }, [profile?.id, user?.id]);

  useEffect(() => {
    fetchMyBugs();
  }, [fetchMyBugs]);

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
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">UNDER TRIAGE</span>;
      case 'IN_PROGRESS':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">ASSIGNED TO ENGINEER</span>;
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Bug className="w-6 h-6 text-red-400" />
            My Reported Bugs
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Track status updates for bugs and issues you reported.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={fetchMyBugs}
            className="p-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 transition cursor-pointer"
            title="Refresh bugs"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsReportModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black font-bold text-xs flex items-center gap-2 transition cursor-pointer shadow-md"
          >
            <PlusCircle className="w-4 h-4" />
            Report a Bug
          </button>
        </div>
      </div>

      {/* Bugs List */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <LoadingSpinner text="Loading your bug reports..." />
        </div>
      ) : bugs.length === 0 ? (
        <div className="py-20 text-center rounded-2xl bg-neutral-900/30 border border-neutral-800 p-8 space-y-3">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto opacity-80" />
          <h3 className="text-base font-bold text-white">No Bugs Reported By You</h3>
          <p className="text-xs text-neutral-400 max-w-sm mx-auto">
            If you encounter unexpected errors or UI glitches, use the "Report a Bug" button to notify Founder and Admins.
          </p>
          <button
            type="button"
            onClick={() => setIsReportModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-xs font-bold text-white transition cursor-pointer inline-flex items-center gap-2"
          >
            <PlusCircle className="w-4 h-4" />
            Report Your First Bug
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {bugs.map((bug) => (
            <div
              key={bug.id}
              className="p-4 sm:p-5 rounded-2xl bg-neutral-950 border border-neutral-800 hover:border-neutral-700 transition shadow-lg space-y-3"
            >
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

              <p className="text-xs text-neutral-300 leading-relaxed whitespace-pre-wrap">
                {bug.description}
              </p>

              {bug.steps_to_reproduce && (
                <div className="p-3 rounded-xl bg-neutral-900/80 border border-neutral-800 text-[11px] text-neutral-300">
                  <span className="font-bold text-neutral-400 block mb-1">Steps to Reproduce:</span>
                  <p className="whitespace-pre-wrap">{bug.steps_to_reproduce}</p>
                </div>
              )}

              <div className="pt-3 border-t border-neutral-850 flex items-center justify-between gap-3 text-xs text-neutral-400 flex-wrap">
                <div className="flex items-center gap-3">
                  {bug.screenshot_url && (
                    <a
                      href={bug.screenshot_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-400 hover:underline flex items-center gap-1 font-semibold"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      Attached Screenshot
                    </a>
                  )}

                  {bug.assignee && (
                    <div className="flex items-center gap-1 text-emerald-400 bg-emerald-950/30 px-2 py-0.5 rounded-lg border border-emerald-800/40">
                      <span>Assigned to: <strong>{bug.assignee.full_name}</strong></span>
                    </div>
                  )}
                </div>

                <span className="text-[11px] text-neutral-500">
                  Status: <strong>{bug.status}</strong>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Report Bug Modal */}
      <ReportBugModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        onSuccess={fetchMyBugs}
      />
    </div>
  );
};

export default MyReportedBugs;
