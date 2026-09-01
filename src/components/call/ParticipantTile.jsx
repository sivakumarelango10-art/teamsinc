import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, Monitor, Shield, ShieldAlert, User, Maximize2 } from 'lucide-react';

const FILTER_STYLES = {
  none: '',
  studio: 'brightness(1.15) contrast(1.1) saturate(1.1)',
  warm: 'sepia(0.2) saturate(1.2) brightness(1.05)',
  cool: 'hue-rotate(180deg) saturate(0.9) brightness(1.05)',
  vibrant: 'saturate(1.6) contrast(1.1)',
  sepia: 'sepia(0.7) contrast(1.1)',
  noir: 'grayscale(1) contrast(1.2) brightness(0.95)',
  neon: 'hue-rotate(90deg) contrast(1.3) saturate(1.5)'
};

export const ParticipantTile = ({
  stream,
  name = 'Participant',
  email = '',
  role = 'MEMBER',
  isLocal = false,
  isAudioMuted = false,
  isVideoOff = false,
  isScreenSharing = false,
  isSpeaking = false,
  activeFilter = 'none',
  backgroundEffect = 'none',
  onPin,
  isPinned = false
}) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const filterStyle = isLocal && activeFilter ? (FILTER_STYLES[activeFilter] || '') : '';

  const getRoleBadge = (r) => {
    if (r === 'FOUNDER') {
      return (
        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-neutral-900/90 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
          <ShieldAlert className="w-2.5 h-2.5" /> Founder
        </span>
      );
    }
    if (r === 'ADMIN') {
      return (
        <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold bg-neutral-900/90 text-neutral-300 px-1.5 py-0.5 rounded border border-neutral-700">
          <Shield className="w-2.5 h-2.5" /> Admin
        </span>
      );
    }
    return null;
  };

  const initial = name ? name.charAt(0).toUpperCase() : 'U';

  return (
    <div
      className={`relative w-full h-full min-h-[180px] bg-neutral-950 rounded-2xl md:rounded-3xl overflow-hidden border transition-all duration-200 group flex items-center justify-center ${
        isSpeaking
          ? 'border-emerald-500 ring-2 ring-emerald-500/80 shadow-lg shadow-emerald-500/20'
          : 'border-neutral-800/80 hover:border-neutral-700'
      } ${isPinned ? 'ring-2 ring-amber-400' : ''}`}
    >
      {/* Background Effect wrapper */}
      <div className={`w-full h-full flex items-center justify-center ${
        isLocal && backgroundEffect === 'blur' ? 'backdrop-blur-md bg-neutral-900/40' : ''
      }`}>
        {/* Video stream rendering */}
        {stream && !isVideoOff ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocal} // Always mute local playback to prevent audio feedback loop
            style={{ filter: filterStyle }}
            className={`w-full h-full object-cover ${
              isLocal && !isScreenSharing ? 'scale-x-[-1]' : ''
            } ${isLocal && backgroundEffect === 'blur' ? 'filter blur-[1px]' : ''}`}
          />
        ) : (
          /* Avatar placeholder when camera is off */
          <div className="flex flex-col items-center justify-center gap-3 p-4 select-none">
            <div className={`relative w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center font-bold text-2xl md:text-3xl text-white transition-transform ${
              isSpeaking ? 'scale-105 ring-4 ring-emerald-500 animate-pulse' : 'ring-2 ring-neutral-700'
            } bg-gradient-to-br from-neutral-800 to-neutral-900 shadow-xl`}>
              <span>{initial}</span>
              {isSpeaking && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 ring-2 ring-black" />
              )}
            </div>
            <div className="text-center">
              <p className="text-xs md:text-sm font-semibold text-white truncate max-w-[160px]">
                {name} {isLocal && '(You)'}
              </p>
              <p className="text-[10px] text-neutral-500">Camera Off</p>
            </div>
          </div>
        )}
      </div>

      {/* Screen Sharing Watermark Badge */}
      {isScreenSharing && (
        <div className="absolute top-3 left-3 bg-neutral-900/90 backdrop-blur-md border border-neutral-700 text-white px-2.5 py-1 rounded-xl flex items-center gap-1.5 text-xs font-semibold shadow-md">
          <Monitor className="w-3.5 h-3.5 text-emerald-400" />
          <span>Screen Sharing</span>
        </div>
      )}

      {/* Pin / Fullscreen Tile Button (Appears on Hover) */}
      {onPin && (
        <button
          type="button"
          onClick={onPin}
          className="absolute top-3 right-3 p-1.5 rounded-xl bg-black/60 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-700/60 opacity-0 group-hover:opacity-100 transition cursor-pointer shadow-md"
          title={isPinned ? 'Unpin tile' : 'Pin spotlight'}
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Bottom Information Overlay Strip */}
      <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex items-center justify-between gap-2 pointer-events-none">
        {/* Name and Role */}
        <div className="flex items-center gap-1.5 overflow-hidden">
          <span className="text-xs font-semibold text-white truncate max-w-[130px] md:max-w-[180px] drop-shadow">
            {name} {isLocal && '(You)'}
          </span>
          {getRoleBadge(role)}
        </div>

        {/* Audio State Icon */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center backdrop-blur-md border ${
            isAudioMuted
              ? 'bg-red-500/90 border-red-400 text-white'
              : 'bg-black/60 border-neutral-700 text-emerald-400'
          }`}>
            {isAudioMuted ? (
              <MicOff className="w-3 h-3" />
            ) : (
              <Mic className="w-3 h-3" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParticipantTile;
