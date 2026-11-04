import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, CheckCircle2, RefreshCw, X } from 'lucide-react';
import { supabase } from '../../api/supabase';
import { attendanceApi } from '../../api/attendanceApi';

export const AttendanceCaptureModal = ({ isOpen, session, onClose, onSubmitted }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const previewUrlRef = useRef(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [capturedBlob, setCapturedBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  };

  const releasePreview = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl('');
  };

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      releasePreview();
      setCapturedBlob(null);
      setCameraError('');
      setError('');
      setSuccess(false);
      return undefined;
    }

    let cancelled = false;
    const startCamera = async () => {
      setCameraError('');
      setCameraReady(false);
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera access requires a supported browser and a secure HTTPS connection.');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'user' },
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 }
          }
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          setCameraError(
            err.name === 'NotAllowedError'
              ? 'Camera permission was denied. Allow camera access in your browser settings and try again.'
              : err.name === 'NotFoundError'
                ? 'No camera was found on this device.'
                : err.message || 'Unable to open your camera.'
          );
        }
      }
    };

    startCamera();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [isOpen]);

  useEffect(() => () => releasePreview(), []);

  if (!isOpen || !session) return null;

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !cameraReady || !video.videoWidth || !video.videoHeight) {
      setError('The camera is not ready yet. Please wait and try again.');
      return;
    }

    const maxWidth = 1280;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) {
        setError('The photo could not be captured. Please try again.');
        return;
      }
      if (blob.size > 2 * 1024 * 1024) {
        setError('The captured photo is larger than 2 MB. Please retake it in better lighting.');
        return;
      }
      releasePreview();
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setCapturedBlob(blob);
      setError('');
    }, 'image/jpeg', 0.82);
  };

  const retakePhoto = async () => {
    releasePreview();
    setCapturedBlob(null);
    setError('');
    if (!streamRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch (err) {
        setCameraError(err.message || 'Unable to reopen the camera.');
      }
    }
  };

  const submit = async () => {
    if (!capturedBlob || !session?.id) return;
    setSubmitting(true);
    setError('');
    let uploadedPath = null;
    try {
      if (!supabase) throw new Error('Secure photo storage is not configured.');
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const authUserId = sessionData?.session?.user?.id;
      if (!authUserId) throw new Error('Your sign-in session expired. Sign in again before submitting attendance.');

      const randomName = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      uploadedPath = `${authUserId}/${session.meetingId}/${session.id}/${randomName}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('weekly-attendance-photos')
        .upload(uploadedPath, capturedBlob, {
          cacheControl: '0',
          upsert: false,
          contentType: 'image/jpeg'
        });
      if (uploadError) throw uploadError;

      await attendanceApi.submitLiveAttendance(session.id, uploadedPath);
      setSuccess(true);
      stopCamera();
      await onSubmitted?.();
    } catch (err) {
      if (uploadedPath && supabase) {
        await supabase.storage.from('weekly-attendance-photos').remove([uploadedPath]).catch(() => {});
      }
      setError(err.message || 'Attendance photo could not be submitted. Please retry while the attendance window is open.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4" role="presentation">
      <div className="w-full max-w-lg rounded-2xl border border-neutral-700 bg-neutral-950 shadow-2xl overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="attendance-capture-title">
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-neutral-800">
          <div>
            <h2 id="attendance-capture-title" className="text-sm font-bold text-white">Mark your attendance</h2>
            <p className="text-[11px] text-neutral-400 mt-0.5">{session.meetingTitle || 'Weekly meeting'} · photo submission</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800" aria-label="Close camera">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {success ? (
            <div className="py-8 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-400" />
              <h3 className="text-base font-bold text-white">Attendance submitted</h3>
              <p className="text-xs text-neutral-400">Your photo was securely saved and your attendance is recorded as Present.</p>
              <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold">Done</button>
            </div>
          ) : (
            <>
              <div className="relative rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800 aspect-video flex items-center justify-center">
                {previewUrl ? (
                  <img src={previewUrl} alt="Captured attendance photo preview" className="w-full h-full object-contain" />
                ) : (
                  <video ref={videoRef} muted playsInline autoPlay className="w-full h-full object-cover" />
                )}
                {!previewUrl && !cameraReady && !cameraError && (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-neutral-400">Opening camera…</div>
                )}
                <canvas ref={canvasRef} className="hidden" />
              </div>

              <p className="text-[11px] text-neutral-400">
                Your camera is used only after you open this window. Click Capture Photo when you are ready. No video is recorded.
              </p>

              {cameraError && (
                <div className="p-3 rounded-xl border border-rose-800 bg-rose-950/30 text-xs text-rose-200">{cameraError}</div>
              )}

              {error && (
                <div className="p-3 rounded-xl border border-rose-800 bg-rose-950/30 flex items-start gap-2 text-xs text-rose-200">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                {!previewUrl ? (
                  <button type="button" onClick={capturePhoto} disabled={!cameraReady} className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2">
                    <Camera className="w-4 h-4" /> Capture Photo
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={retakePhoto} disabled={submitting} className="flex-1 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4" /> Retake
                    </button>
                    <button type="button" onClick={submit} disabled={submitting || !capturedBlob} className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold">
                      {submitting ? 'Submitting securely…' : 'Confirm & Submit'}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AttendanceCaptureModal;
