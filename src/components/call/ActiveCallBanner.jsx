import React from 'react';
import { Video, Phone, Users, ArrowRight } from 'lucide-react';

export const ActiveCallBanner = ({ activeCall, onJoin, onDismiss }) => {
  if (!activeCall) return null;

  const callerName = activeCall.caller_name || 'Team Member';
  const participantCount = activeCall.participants?.length || 1;
  const isVoice = activeCall.call_type === 'voice';

  return (
    <div className="mx-4 my-2 p-3 sm:p-3.5 bg-gradient-to-r from-emerald-950/80 via-neutral-900 to-emerald-950/60 border border-emerald-500/40 rounded-2xl flex items-center justify-between gap-3 shadow-xl backdrop-blur-md animate-fadeIn shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 shadow-inner">
          {isVoice ? <Phone className="w-5 h-5 animate-pulse" /> : <Video className="w-5 h-5 animate-pulse" />}
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-black animate-ping" />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-xs sm:text-sm font-bold text-white truncate">
              {isVoice ? 'Group Voice Call' : 'Group Video Call'} Active
            </h4>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Live
            </span>
          </div>
          <p className="text-[11px] text-neutral-300 truncate">
            Started by <span className="font-semibold text-white">{callerName}</span> • {participantCount} participant{participantCount > 1 ? 's' : ''} in call
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onJoin}
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl text-xs flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer shadow-lg shadow-emerald-950/50"
        >
          <span>Join Call</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition cursor-pointer text-xs"
            title="Dismiss notification"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
};

export default ActiveCallBanner;
