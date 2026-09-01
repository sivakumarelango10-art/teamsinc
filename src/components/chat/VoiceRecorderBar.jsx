import React, { useState, useEffect, useRef } from 'react';
import { Trash2, Send, Pause, Play, AlertCircle, Loader2 } from 'lucide-react';

const formatTimer = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
};

export const VoiceRecorderBar = ({ onSend, onCancel }) => {
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [previewAudioUrl, setPreviewAudioUrl] = useState(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [audioLevels, setAudioLevels] = useState(new Array(16).fill(15));
  const [isInitializing, setIsInitializing] = useState(true);
  const [permissionError, setPermissionError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const previewAudioRef = useRef(null);
  const recordingDurationRef = useRef(0);
  const recordedBlobRef = useRef(null);

  // Clean up all audio tracks and contexts
  const cleanupStream = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {}
      });
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    if (previewAudioUrl) {
      try {
        URL.revokeObjectURL(previewAudioUrl);
      } catch {}
    }
  };

  // Start recording on mount
  useEffect(() => {
    let isCancelled = false;

    const startRecording = async () => {
      setIsInitializing(true);
      setPermissionError('');

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setPermissionError('Audio recording is not supported in this browser.');
        setIsInitializing(false);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

        if (isCancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;

        // Setup Web Audio API Analyzer for live waveform animation
        try {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (AudioContextClass) {
            const audioCtx = new AudioContextClass();
            audioContextRef.current = audioCtx;
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 64;
            analyser.smoothingTimeConstant = 0.6;
            source.connect(analyser);
            analyserRef.current = analyser;

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            let lastVisualizerUpdate = 0;

            const updateVisualizer = (timestamp) => {
              if (!analyserRef.current || isCancelled) return;
              animFrameRef.current = requestAnimationFrame(updateVisualizer);

              // Throttle state update to every 80ms (~12fps) to reduce CPU overhead while keeping smooth animation
              if (timestamp - lastVisualizerUpdate < 80) return;
              lastVisualizerUpdate = timestamp;

              analyserRef.current.getByteFrequencyData(dataArray);

              // Extract 16 frequency bands
              const bands = [];
              const step = Math.max(1, Math.floor(bufferLength / 16));
              for (let i = 0; i < 16; i++) {
                const val = dataArray[i * step] || 0;
                // Scale height between 15% and 100%
                const heightPct = Math.max(15, Math.min(100, Math.round((val / 255) * 100)));
                bands.push(heightPct);
              }
              setAudioLevels(bands);
            };

            animFrameRef.current = requestAnimationFrame(updateVisualizer);
          }
        } catch (ctxErr) {
          console.warn('Web Audio visualizer notice:', ctxErr);
        }

        // Determine best supported mime type
        let mimeType = 'audio/webm';
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
          mimeType = 'audio/ogg;codecs=opus';
        }

        const mediaRecorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        mediaRecorder.start(200); // 200ms slice
        setIsInitializing(false);

        // Start timer
        timerIntervalRef.current = setInterval(() => {
          setRecordingTime(prev => {
            const next = prev + 1;
            recordingDurationRef.current = next;
            return next;
          });
        }, 1000);

      } catch (err) {
        console.error('Microphone access denied or error:', err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setPermissionError('Microphone permission was denied. Please allow microphone access in your browser settings.');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setPermissionError('No microphone found on your device.');
        } else {
          setPermissionError('Failed to access microphone: ' + (err.message || 'Unknown error'));
        }
        setIsInitializing(false);
      }
    };

    startRecording();

    return () => {
      isCancelled = true;
      cleanupStream();
    };
  }, []);

  // Discard recording
  const handleDiscard = () => {
    cleanupStream();
    onCancel();
  };

  // Pause / Resume recording (or switch to preview)
  const handleTogglePause = () => {
    if (!mediaRecorderRef.current) return;

    if (!isPaused) {
      // Pause
      if (mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.pause();
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      setIsPaused(true);

      // Create preview blob from accumulated chunks
      if (audioChunksRef.current.length > 0) {
        const mimeType = mediaRecorderRef.current.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        recordedBlobRef.current = blob;
        const previewUrl = URL.createObjectURL(blob);
        setPreviewAudioUrl(previewUrl);
      }
    } else {
      // Resume
      if (mediaRecorderRef.current.state === 'paused') {
        mediaRecorderRef.current.resume();
      }
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        setIsPreviewPlaying(false);
      }
      if (previewAudioUrl) {
        URL.revokeObjectURL(previewAudioUrl);
        setPreviewAudioUrl(null);
      }
      timerIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => {
          const next = prev + 1;
          recordingDurationRef.current = next;
          return next;
        });
      }, 1000);
      setIsPaused(false);
    }
  };

  // Toggle play/pause for preview
  const handleTogglePreviewPlay = () => {
    if (!previewAudioRef.current) return;
    if (isPreviewPlaying) {
      previewAudioRef.current.pause();
      setIsPreviewPlaying(false);
    } else {
      previewAudioRef.current.play()
        .then(() => setIsPreviewPlaying(true))
        .catch(console.warn);
    }
  };

  // Finalize and send recording
  const handleSend = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    const recorder = mediaRecorderRef.current;
    const finalDuration = Math.max(1, recordingDurationRef.current);

    // Stop recording and assemble file
    const sendBlobAndFinish = (blob) => {
      cleanupStream();
      const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
      const audioFile = new File([blob], `voice_${Date.now()}.${extension}`, {
        type: blob.type || 'audio/webm'
      });
      onSend(audioFile, finalDuration);
    };

    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        sendBlobAndFinish(blob);
      };
      try {
        recorder.stop();
      } catch (err) {
        console.warn('Recorder stop error:', err);
        if (audioChunksRef.current.length > 0) {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          sendBlobAndFinish(blob);
        } else {
          cleanupStream();
          onCancel();
        }
      }
    } else if (recordedBlobRef.current) {
      sendBlobAndFinish(recordedBlobRef.current);
    } else {
      cleanupStream();
      onCancel();
    }
  };

  if (permissionError) {
    return (
      <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-2xl flex items-center justify-between gap-3 text-xs text-neutral-200">
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{permissionError}</span>
        </div>
        <button
          type="button"
          onClick={handleDiscard}
          className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-medium transition cursor-pointer"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 sm:gap-3 w-full animate-fadeIn">
      {/* WhatsApp Voice Recording Capsule */}
      <div className="flex-1 bg-neutral-900 border border-neutral-750 rounded-full px-3.5 py-2 flex items-center justify-between gap-3 shadow-inner">
        {/* Left: Discard Trash Button */}
        <button
          type="button"
          onClick={handleDiscard}
          disabled={isSubmitting}
          className="p-1.5 text-neutral-400 hover:text-red-400 hover:bg-neutral-800 rounded-full transition cursor-pointer shrink-0"
          title="Cancel & discard recording"
        >
          <Trash2 className="w-5 h-5 transition-transform active:scale-90" />
        </button>

        {/* Middle: Recording Status & Dynamic Audio Visualizer */}
        <div className="flex-1 flex items-center gap-3 overflow-hidden">
          {/* Pulsing Red Recording Indicator */}
          <div className="flex items-center gap-2 shrink-0">
            <span className={`w-3 h-3 rounded-full bg-red-500 ${isPaused ? 'opacity-50' : 'animate-ping'}`} />
            <span className="text-xs font-mono font-bold text-white tracking-wider">
              {formatTimer(recordingTime)}
            </span>
          </div>

          {/* Live Audio Visualizer Bars or Preview Slider */}
          {isPaused && previewAudioUrl ? (
            <div className="flex-1 flex items-center gap-2">
              <audio
                ref={previewAudioRef}
                src={previewAudioUrl}
                onTimeUpdate={() => {
                  if (previewAudioRef.current) {
                    setPreviewCurrentTime(previewAudioRef.current.currentTime);
                  }
                }}
                onEnded={() => {
                  setIsPreviewPlaying(false);
                  setPreviewCurrentTime(0);
                }}
              />
              <button
                type="button"
                onClick={handleTogglePreviewPlay}
                className="w-7 h-7 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black flex items-center justify-center transition cursor-pointer shrink-0"
                title={isPreviewPlaying ? 'Pause review' : 'Play review'}
              >
                {isPreviewPlaying ? (
                  <Pause className="w-3.5 h-3.5 fill-current text-black" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current text-black ml-0.5" />
                )}
              </button>
              <span className="text-[11px] text-neutral-400 truncate">
                Preview your voice note
              </span>
            </div>
          ) : (
            <div className="flex-1 flex items-center gap-1 h-6 px-1">
              {audioLevels.map((lvl, idx) => (
                <div key={idx} className="flex-1 flex items-center justify-center h-full">
                  <span
                    style={{ height: `${lvl}%` }}
                    className="w-full bg-emerald-400 rounded-full transition-all duration-75"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Pause / Resume Button */}
        <button
          type="button"
          onClick={handleTogglePause}
          disabled={isSubmitting || isInitializing}
          className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-full transition cursor-pointer shrink-0"
          title={isPaused ? 'Resume recording' : 'Pause & review'}
        >
          {isPaused ? (
            <Play className="w-4 h-4 text-emerald-400" />
          ) : (
            <Pause className="w-4 h-4 text-neutral-300" />
          )}
        </button>
      </div>

      {/* WhatsApp Vibrant Send Button (Emerald Green circular button) */}
      <button
        type="button"
        onClick={handleSend}
        disabled={isSubmitting || isInitializing}
        className="w-11 h-11 rounded-full bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-black disabled:opacity-50 transition flex items-center justify-center shadow-lg shadow-emerald-950/40 cursor-pointer shrink-0"
        title="Send voice note"
      >
        {isSubmitting ? (
          <Loader2 className="w-5 h-5 animate-spin text-black" />
        ) : (
          <Send className="w-5 h-5 fill-current text-black ml-0.5" />
        )}
      </button>
    </div>
  );
};

export default VoiceRecorderBar;
