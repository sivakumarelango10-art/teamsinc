import React, { useCallback, useEffect, useState } from 'react';
import { Camera, CheckCircle2, Clock3, Radio, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../api/supabase';
import { attendanceApi } from '../../api/attendanceApi';
import AttendanceCaptureModal from './AttendanceCaptureModal';

const formatRemaining = (expiresAt, now) => {
  const seconds = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  return { seconds, label: `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` };
};

export const ActiveAttendanceBanner = () => {
  const { user, profile } = useAuth();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [captureOpen, setCaptureOpen] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!profile?.id || profile.role === 'FOUNDER') {
      setSession(null);
      setLoading(false);
      return;
    }
    try {
      const result = await attendanceApi.getActiveLiveSession();
      setSession(result?.active ? result.session : null);
      setError('');
    } catch (err) {
      setError(err.message || 'Unable to check active attendance.');
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.role]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Subscribe to the current user's attendance rows. The server creates these rows
  // before it publishes an open session, so INSERT is the wake-up event for members.
  useEffect(() => {
    if (!supabase || !profile?.id || profile.role === 'FOUNDER') return undefined;

    const channel = supabase
      .channel(`live-attendance-member-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meeting_attendance',
          filter: `user_id=eq.${profile.id}`
        },
        () => { refresh(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.id, profile?.role, refresh]);

  useEffect(() => {
    if (!session?.expiresAt) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [session?.expiresAt]);

  useEffect(() => {
    if (!session?.expiresAt || now < new Date(session.expiresAt).getTime()) return;
    // Server decides closure and records MISSED_WINDOW; this refresh merely asks
    // the server to reconcile the expired session.
    refresh();
  }, [session?.expiresAt, now, refresh]);

  if (loading || !session || profile?.role === 'FOUNDER') return null;

  const countdown = formatRemaining(session.expiresAt, now);
  const alreadySubmitted = session.myStatus === 'PRESENT';
  const missedWindow = session.myStatus === 'MISSED_WINDOW' || countdown.seconds <= 0;

  return (
    <>
      <section className="rounded-2xl border border-emerald-700/60 bg-gradient-to-r from-emerald-950/50 via-neutral-950 to-neutral-950 p-4 sm:p-5 shadow-lg" aria-live="polite">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center justify-center shrink-0">
              <Radio className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Live attendance open</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] text-emerald-200">Weekly meeting</span>
              </div>
              <h2 className="mt-1 text-sm sm:text-base font-bold text-white truncate">{session.meetingTitle}</h2>
              <p className="mt-1 text-[11px] text-neutral-400">
                {alreadySubmitted
                  ? 'Your photo was submitted successfully. Your attendance is recorded as Present.'
                  : missedWindow
                    ? 'The five-minute attendance window has ended.'
                    : 'Capture and submit your photo before the five-minute window closes.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="min-w-[88px] text-center rounded-xl border border-neutral-800 bg-black/40 px-3 py-2">
              <div className="flex items-center justify-center gap-1 text-[10px] text-neutral-400">
                <Clock3 className="w-3 h-3" /> Time left
              </div>
              <div className={`mt-0.5 font-mono text-xl font-bold tabular-nums ${countdown.seconds <= 30 ? 'text-rose-300' : 'text-emerald-300'}`}>
                {countdown.label}
              </div>
            </div>

            {alreadySubmitted ? (
              <span className="px-4 py-3 rounded-xl bg-emerald-600/15 border border-emerald-600/40 text-emerald-300 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Present
              </span>
            ) : missedWindow ? (
              <span className="px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-300 text-xs font-semibold flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" /> Window closed
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setCaptureOpen(true)}
                className="px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 transition"
              >
                <Camera className="w-4 h-4" /> Mark Attendance
              </button>
            )}
          </div>
        </div>
        {error && <p className="mt-3 text-[11px] text-rose-300">{error}</p>}
      </section>

      <AttendanceCaptureModal
        isOpen={captureOpen}
        session={session}
        onClose={() => setCaptureOpen(false)}
        onSubmitted={async () => {
          await refresh();
          setCaptureOpen(false);
        }}
      />
    </>
  );
};

export default ActiveAttendanceBanner;
