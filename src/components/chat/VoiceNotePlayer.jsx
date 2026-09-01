import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, RotateCcw, Volume2, Mic, AlertCircle } from 'lucide-react';

// Generates stable pseudo-random waveform bar heights for a given string/url
const generateWaveformHeights = (seedStr, barCount = 32) => {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash << 5) - hash + seedStr.charCodeAt(i);
    hash |= 0;
  }
  const bars = [];
  for (let i = 0; i < barCount; i++) {
    const pseudo = Math.abs(Math.sin((hash + i * 19.3) * 1.5));
    // scale between 20% and 100%
    const heightPercent = Math.max(20, Math.round(pseudo * 100));
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

export const VoiceNotePlayer = ({ audioUrl, duration = 0, isSelf = false, fileName = 'Voice message' }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);
  const [speed, setSpeed] = useState(1);
  const [isReady, setIsReady] = useState(false);
  const [hasError, setHasError] = useState(false);

  const audioRef = useRef(null);
  const waveformRef = useRef(null);
  const playerIdRef = useRef(`audio-${Math.random().toString(36).substring(2, 9)}`);

  const bars = useMemo(() => {
    return generateWaveformHeights(audioUrl || 'voice-note', 32);
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
      setIsReady(true);
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const onError = () => {
      console.warn('Audio playback error on:', audioUrl);
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
      // Announce to other players to pause
      window.dispatchEvent(
        new CustomEvent('teamsync:audio:play', { detail: { id: playerIdRef.current } })
      );
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(err => {
          console.warn('Playback initiation error:', err);
          setIsPlaying(false);
        });
    }
  };

  const handleWaveformClick = (e) => {
    if (!waveformRef.current || !audioRef.current) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = ratio * (totalDuration || audioRef.current.duration || 1);
    audioRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const cycleSpeed = () => {
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
    <div className={`p-2.5 sm:p-3 rounded-2xl border transition-all ${
      isSelf
        ? 'bg-neutral-900/90 border-neutral-700/80 shadow-md'
        : 'bg-neutral-950/90 border-neutral-800 shadow-md'
    }`}>
      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        playsInline
      />

      {hasError ? (
        <div className="flex items-center gap-2 text-xs text-red-400 py-1">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Audio file could not be loaded.</span>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          {/* WhatsApp Play/Pause Circular Button */}
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer shadow-md ${
              isSelf
                ? 'bg-emerald-500 hover:bg-emerald-400 text-black'
                : 'bg-emerald-500 hover:bg-emerald-400 text-black'
            }`}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-current text-black" />
            ) : (
              <Play className="w-5 h-5 fill-current text-black ml-0.5" />
            )}
          </button>

          {/* Waveform and Progress */}
          <div className="flex-1 min-w-[160px] sm:min-w-[200px] flex flex-col justify-center gap-1.5">
            {/* WhatsApp Audio Waveform Bar Visualizer */}
            <div
              ref={waveformRef}
              onClick={handleWaveformClick}
              className="h-7 flex items-center gap-[2.5px] cursor-pointer py-1 select-none group"
              title="Click to seek"
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
                      className={`w-full rounded-full transition-colors duration-150 ${
                        isPassed
                          ? isSelf
                            ? 'bg-emerald-400'
                            : 'bg-emerald-400'
                          : isSelf
                            ? 'bg-neutral-600 group-hover:bg-neutral-500'
                            : 'bg-neutral-700 group-hover:bg-neutral-600'
                      }`}
                    />
                  </div>
                );
              })}
            </div>

            {/* Time & Controls Strip */}
            <div className="flex items-center justify-between text-[11px] text-neutral-400 font-mono select-none">
              <span className="font-medium text-neutral-300">
                {isPlaying || currentTime > 0
                  ? formatSeconds(currentTime)
                  : formatSeconds(totalDuration)}
              </span>

              <div className="flex items-center gap-2">
                {/* Speed Toggle (WhatsApp style: 1x -> 1.5x -> 2x) */}
                <button
                  type="button"
                  onClick={cycleSpeed}
                  className="px-1.5 py-0.5 rounded-full bg-neutral-800 hover:bg-neutral-700 text-[10px] font-bold text-neutral-200 border border-neutral-750 transition cursor-pointer"
                  title="Playback Speed"
                >
                  {speed}x
                </button>

                {/* Voice Note Mic Badge */}
                <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                  <Mic className="w-3 h-3" />
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoiceNotePlayer;
