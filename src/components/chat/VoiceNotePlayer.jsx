import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, Mic, AlertCircle } from 'lucide-react';
import WhatsAppCheck from './WhatsAppCheck';

// Generates stable pseudo-random waveform bar heights for a given string/url
const generateWaveformHeights = (seedStr, barCount = 26) => {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash << 5) - hash + seedStr.charCodeAt(i);
    hash |= 0;
  }
  const bars = [];
  for (let i = 0; i < barCount; i++) {
    const pseudo = Math.abs(Math.sin((hash + i * 17.7) * 1.6));
    const heightPercent = Math.max(25, Math.round(pseudo * 100));
    bars.push(heightPercent);
  }
  return bars;
};

const formatSeconds = (sec) => {
  if (isNaN(sec) || sec === Infinity || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

const VoiceNotePlayerComponent = ({
  audioUrl,
  isSelf = false,
  senderAvatar = null,
  senderInitial = 'U',
  timestamp = '',
  isOptimistic = false
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [hasError, setHasError] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  const audioRef = useRef(null);
  const waveformRef = useRef(null);
  const playerIdRef = useRef(`audio-${Math.random().toString(36).substring(2, 9)}`);

  const bars = useMemo(() => {
    return generateWaveformHeights(audioUrl || 'voice-note', 26);
  }, [audioUrl]);

  // Global listener to ensure only ONE audio plays at any time
  useEffect(() => {
    const handleGlobalPlay = (e) => {
      if (e.detail?.id !== playerIdRef.current && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    };

    window.addEventListener('teamsync:audio:play', handleGlobalPlay);
    return () => window.removeEventListener('teamsync:audio:play', handleGlobalPlay);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && audio.duration !== Infinity) {
        setTotalDuration(audio.duration);
      }
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const onError = () => {
      setHasError(true);
      setIsPlaying(false);
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [audioUrl]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      window.dispatchEvent(
        new CustomEvent('teamsync:audio:play', { detail: { id: playerIdRef.current } })
      );
      audio.play().then(() => setIsPlaying(true)).catch((err) => {
        console.warn('Audio play prevented:', err);
        setHasError(true);
      });
    }
  };

  const handleWaveformClick = (e) => {
    if (!audioRef.current || !waveformRef.current || totalDuration === 0) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const seekTime = ratio * totalDuration;
    audioRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  const cycleSpeed = (e) => {
    e.stopPropagation();
    const speeds = [1, 1.5, 2];
    const nextIdx = (speeds.indexOf(speed) + 1) % speeds.length;
    const nextSpeed = speeds[nextIdx];
    setSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const progressRatio = totalDuration > 0 ? Math.min(1, currentTime / totalDuration) : 0;
  const currentBarIndex = Math.floor(progressRatio * bars.length);

  return (
    <div className="flex items-center gap-2.5 min-w-[220px] sm:min-w-[270px] select-none py-0.5">
      {/* Hidden Audio Element with instant preload */}
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="auto"
        playsInline
      />

      {/* Avatar with Micro Mic Badge (WhatsApp Demo Style) */}
      <div className="relative shrink-0 self-center">
        <div className="w-8 h-8 rounded-full bg-emerald-950/80 border border-emerald-800/80 flex items-center justify-center font-bold text-xs text-emerald-300 overflow-hidden shadow-sm">
          {senderAvatar && !avatarError ? (
            <img
              src={senderAvatar}
              alt="Sender"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
              onError={() => setAvatarError(true)}
            />
          ) : (
            <span>{senderInitial}</span>
          )}
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-neutral-900 border border-neutral-700 rounded-full flex items-center justify-center text-emerald-400 shadow-sm">
          <Mic className="w-2 h-2" />
        </span>
      </div>

      {hasError ? (
        <div className="flex items-center gap-1.5 text-xs text-red-400 py-1">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="text-[11px]">Audio unavailable</span>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-center min-w-0">
          {/* Top Row: Play/Pause Button + Waveform */}
          <div className="flex items-center gap-2">
            {/* WhatsApp Play/Pause Button */}
            <button
              type="button"
              onClick={togglePlay}
              className="w-7 h-7 rounded-full bg-white text-black hover:bg-neutral-200 flex items-center justify-center shrink-0 transition-transform active:scale-90 cursor-pointer shadow-sm"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-3.5 h-3.5 fill-black text-black" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-black text-black ml-0.5" />
              )}
            </button>

            {/* Waveform Visualizer & Scrubber */}
            <div
              ref={waveformRef}
              onClick={handleWaveformClick}
              className="flex-1 h-5 flex items-center gap-[2px] cursor-pointer relative py-0.5 group"
              title="Seek"
            >
              {bars.map((heightPercent, idx) => {
                const isPassed = idx <= currentBarIndex && progressRatio > 0;
                return (
                  <div
                    key={idx}
                    className="flex-1 flex items-center justify-center h-full"
                  >
                    <span
                      style={{ height: `${heightPercent}%` }}
                      className={`w-full rounded-full transition-colors duration-100 ${
                        isPassed
                          ? 'bg-cyan-400'
                          : 'bg-neutral-600 group-hover:bg-neutral-500'
                      }`}
                    />
                  </div>
                );
              })}

              {/* Glowing Scrubber Dot */}
              {progressRatio > 0 && (
                <span
                  style={{ left: `calc(${progressRatio * 100}% - 4px)` }}
                  className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-cyan-400 ring-2 ring-black pointer-events-none transition-all duration-75 shadow-sm"
                />
              )}
            </div>
          </div>

          {/* Bottom Row: Duration, Speed, Timestamp & Delivery Checks */}
          <div className="flex items-center justify-between text-[10px] text-neutral-400 pt-1 leading-none">
            <div className="flex items-center gap-2">
              <span className="font-mono text-neutral-300">
                {isPlaying || currentTime > 0
                  ? formatSeconds(currentTime)
                  : formatSeconds(totalDuration)}
              </span>

              {/* Speed Button (1x / 1.5x / 2x) */}
              <button
                type="button"
                onClick={cycleSpeed}
                className="px-1 py-0.2 rounded bg-neutral-800 hover:bg-neutral-700 text-[9px] font-bold text-neutral-300 border border-neutral-700 transition cursor-pointer"
                title="Playback speed"
              >
                {speed}x
              </button>
            </div>

            {/* Timestamp & Ticks */}
            <div className="flex items-center gap-1 select-none">
              <span>{timestamp}</span>
              {isSelf && (
                <WhatsAppCheck isOptimistic={isOptimistic} status="read" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const VoiceNotePlayer = React.memo(VoiceNotePlayerComponent);
export default VoiceNotePlayer;
