import React from 'react';
import { X, Mic, MicOff, Video, VideoOff, Monitor, Users, ShieldAlert, Shield, User } from 'lucide-react';

export const InCallParticipantsDrawer = ({
  currentUser,
  localState = {},
  peers = {},
  onClose
}) => {
  const getRoleBadge = (r) => {
    if (r === 'ADMIN') {
      return (
        <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold bg-neutral-900 text-neutral-300 px-1.5 py-0.5 rounded border border-neutral-700">
          <Shield className="w-2.5 h-2.5" /> Admin
        </span>
      );
    }
    return null;
  };

  const peerList = Object.values(peers);
  const totalCount = 1 + peerList.length;

  return (
    <div className="w-80 md:w-88 h-full bg-neutral-950 border-l border-neutral-800 flex flex-col shrink-0 z-30 shadow-2xl">
      {/* Drawer Header */}
      <div className="px-4 py-3.5 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/80">
        <div className="flex items-center gap-2 text-white">
          <Users className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs md:text-sm font-bold tracking-tight">In Call ({totalCount})</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition cursor-pointer"
          title="Close participants"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Participants Stream */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
        {/* Local Participant */}
        <div className="p-3 rounded-xl bg-neutral-900/90 border border-neutral-800 flex items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="relative w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center font-bold text-white shrink-0">
              {currentUser?.full_name?.charAt(0) || 'Y'}
              {localState.isSpeaking && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-black animate-pulse" />
              )}
            </div>
            <div className="overflow-hidden">
              <div className="flex items-center gap-1.5">
                <p className="font-bold text-white truncate max-w-[130px]">
                  {currentUser?.full_name || 'You'} (You)
                </p>
                {getRoleBadge(currentUser?.role)}
              </div>
              <p className="text-[10px] text-neutral-400 truncate">{currentUser?.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {localState.isScreenSharing && (
              <span title="Sharing screen">
                <Monitor className="w-3.5 h-3.5 text-emerald-400" />
              </span>
            )}
            {localState.isVideoOff ? (
              <span title="Camera off">
                <VideoOff className="w-3.5 h-3.5 text-neutral-500" />
              </span>
            ) : (
              <span title="Camera on">
                <Video className="w-3.5 h-3.5 text-emerald-400" />
              </span>
            )}
            {localState.isAudioMuted ? (
              <span title="Muted">
                <MicOff className="w-3.5 h-3.5 text-red-400" />
              </span>
            ) : (
              <span title="Unmuted">
                <Mic className="w-3.5 h-3.5 text-emerald-400" />
              </span>
            )}
          </div>
        </div>

        {/* Remote Peers */}
        {peerList.map((peer) => (
          <div
            key={peer.id}
            className="p-3 rounded-xl bg-neutral-900/60 border border-neutral-800 hover:border-neutral-750 transition flex items-center justify-between gap-2 shadow-sm"
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="relative w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center font-bold text-white shrink-0">
                {peer.name?.charAt(0) || 'P'}
                {peer.isSpeaking && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-black animate-pulse" />
                )}
              </div>
              <div className="overflow-hidden">
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-white truncate max-w-[130px]">
                    {peer.name || 'Participant'}
                  </p>
                  {getRoleBadge(peer.role)}
                </div>
                <p className="text-[10px] text-neutral-400 truncate">{peer.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {peer.isScreenSharing && (
                <span title="Sharing screen">
                  <Monitor className="w-3.5 h-3.5 text-emerald-400" />
                </span>
              )}
              {peer.isVideoOff ? (
                <span title="Camera off">
                  <VideoOff className="w-3.5 h-3.5 text-neutral-500" />
                </span>
              ) : (
                <span title="Camera on">
                  <Video className="w-3.5 h-3.5 text-emerald-400" />
                </span>
              )}
              {peer.isAudioMuted ? (
                <span title="Muted">
                  <MicOff className="w-3.5 h-3.5 text-red-400" />
                </span>
              ) : (
                <span title="Unmuted">
                  <Mic className="w-3.5 h-3.5 text-emerald-400" />
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default InCallParticipantsDrawer;
