import React, { useState, useEffect } from 'react';
import { Clock, Radio, CheckCircle, AlertCircle } from 'lucide-react';

export function formatDurationMs(ms) {
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n) => String(n).padStart(2, '0');

  if (days > 0) {
    return `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  }
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * LiveCountdown component.
 * Displays accurate, per-second countdown to meeting start,
 * live duration ticker while meeting is in progress, and clean completed/cancelled badges.
 */
export const LiveCountdown = ({
  startTime,
  endTime,
  status = 'SCHEDULED',
  size = 'normal',
  showIcon = true,
  className = ''
}) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    // 1-second interval for real-time countdown accuracy
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  if (status === 'CANCELLED') {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-950/40 text-red-400 border border-red-800/50 ${className}`}>
        {showIcon && <AlertCircle className="w-3.5 h-3.5" />}
        <span>Cancelled</span>
      </span>
    );
  }

  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();

  if (isNaN(startMs) || isNaN(endMs)) {
    return null;
  }

  // Meeting has ended
  if (now >= endMs || status === 'COMPLETED') {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-neutral-900 text-neutral-400 border border-neutral-800 ${className}`}>
        {showIcon && <CheckCircle className="w-3.5 h-3.5" />}
        <span>Completed</span>
      </span>
    );
  }

  // Meeting is LIVE right now
  if (now >= startMs && now < endMs) {
    const elapsedMs = now - startMs;
    const elapsedMinutes = Math.floor(elapsedMs / (60 * 1000));
    return (
      <span
        aria-live="polite"
        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-500/50 shadow-sm shadow-emerald-500/20 ${className}`}
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span>LIVE NOW</span>
        <span className="text-emerald-300/80 font-mono text-[11px]">({elapsedMinutes}m elapsed)</span>
      </span>
    );
  }

  const msUntilStart = startMs - now;
  const isStartingSoon = msUntilStart <= 15 * 60 * 1000;

  // Meeting starting soon (<= 15 minutes)
  if (isStartingSoon) {
    return (
      <span
        aria-live="polite"
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-950/60 text-amber-300 border border-amber-500/50 animate-pulse ${className}`}
      >
        {showIcon && <Radio className="w-3.5 h-3.5 text-amber-400 animate-spin" style={{ animationDuration: '3s' }} />}
        <span>Starting Soon:</span>
        <span className="font-mono">{formatDurationMs(msUntilStart)}</span>
      </span>
    );
  }

  // Future scheduled meeting
  return (
    <span
      aria-live="off"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-neutral-900/90 text-neutral-300 border border-neutral-800 ${
        size === 'large' ? 'text-sm px-3.5 py-1.5' : ''
      } ${className}`}
    >
      {showIcon && <Clock className="w-3.5 h-3.5 text-blue-400" />}
      <span className="text-neutral-400">Starts in:</span>
      <span className="font-mono text-white font-semibold">{formatDurationMs(msUntilStart)}</span>
    </span>
  );
};

export default LiveCountdown;