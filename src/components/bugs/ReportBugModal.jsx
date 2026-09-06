import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Bug,
  AlertTriangle,
  Upload,
  CheckCircle2,
  Loader2,
  FileText
} from 'lucide-react';
import { bugsApi } from '../../api/bugsApi';
import { useAuth } from '../../hooks/useAuth';

export const ReportBugModal = ({ isOpen, onClose, onSuccess }) => {
  const { user, profile } = useAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState('');
  const [severity, setSeverity] = useState('MEDIUM');
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError('Screenshot must be under 10MB.');
      return;
    }

    setScreenshotFile(file);
    setError('');

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => setScreenshotPreview(reader.result);
      reader.readAsDataURL(file);
    } else {
      setScreenshotPreview(null);
    }
  };

  const removeFile = () => {
    setScreenshotFile(null);
    setScreenshotPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please provide a descriptive bug title.');
      return;
    }
    if (!description.trim()) {
      setError('Please provide bug details/description.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      const reporterName = profile?.full_name || user?.user_metadata?.full_name || 'Team Member';
      const reporterEmail = profile?.email || user?.email || '';
      const reporterId = profile?.id || user?.id;

      await bugsApi.reportBug({
        title,
        description,
        steps_to_reproduce: steps,
        severity,
        screenshotFile,
        reporterId,
        reporterName,
        reporterEmail
      });

      setIsSuccess(true);
      if (onSuccess) onSuccess();

      setTimeout(() => {
        setIsSuccess(false);
        setTitle('');
        setDescription('');
        setSteps('');
        setSeverity('MEDIUM');
        removeFile();
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Error submitting bug:', err);
      setError(err.message || 'Failed to submit bug report.');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-neutral-950 border border-neutral-800 rounded-3xl shadow-2xl p-6 relative overflow-hidden flex flex-col max-h-[90vh] modal-enter">
        {/* Top accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 via-amber-500 to-red-600" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-850">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-950/60 border border-red-800/80 flex items-center justify-center text-red-400">
              <Bug className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">Report a Bug</h3>
              <p className="text-xs text-neutral-400">Reports go directly to Founder & Admins</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-900 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success State */}
        {isSuccess ? (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
            <CheckCircle2 className="w-16 h-16 text-emerald-400 animate-bounce" />
            <h4 className="text-xl font-bold text-white">Bug Report Submitted!</h4>
            <p className="text-xs text-neutral-400 max-w-sm">
              The Founder and Admins have been notified. They can assign it as an action task to the engineering team.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-4 overflow-y-auto pr-1 flex-1">
            {error && (
              <div className="p-3 rounded-xl bg-red-950/60 border border-red-800 text-xs text-red-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                Bug Summary / Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Call audio muted when switching tabs"
                className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 focus:border-white text-xs text-white placeholder:text-neutral-500 transition outline-none"
                required
              />
            </div>

            {/* Severity Selector */}
            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                Severity Level
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { value: 'LOW', label: 'Low', color: 'border-neutral-700 text-neutral-300 hover:bg-neutral-800' },
                  { value: 'MEDIUM', label: 'Medium', color: 'border-blue-800 text-blue-300 hover:bg-blue-950/40' },
                  { value: 'HIGH', label: 'High', color: 'border-amber-800 text-amber-300 hover:bg-amber-950/40' },
                  { value: 'CRITICAL', label: 'Critical', color: 'border-red-800 text-red-400 hover:bg-red-950/40' }
                ].map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSeverity(s.value)}
                    className={`py-2 px-2 text-xs font-bold rounded-xl border transition cursor-pointer text-center ${
                      severity === s.value
                        ? 'bg-white text-black border-white shadow-lg'
                        : `${s.color} bg-neutral-900/60`
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                Description & Impact <span className="text-red-400">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What happened? What was the expected behavior?"
                className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 focus:border-white text-xs text-white placeholder:text-neutral-500 transition outline-none resize-none"
                required
              />
            </div>

            {/* Steps to Reproduce */}
            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                Steps to Reproduce (Optional)
              </label>
              <textarea
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
                rows={2}
                placeholder="1. Go to Team Chat&#10;2. Click Voice Note&#10;3. Observe waveform freeze"
                className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 focus:border-white text-xs text-white placeholder:text-neutral-500 transition outline-none resize-none"
              />
            </div>

            {/* Screenshot / File Upload */}
            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                Screenshot / Attachment (Optional)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.txt,.log"
                onChange={handleFileChange}
                className="hidden"
              />

              {screenshotFile ? (
                <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-between">
                  <div className="flex items-center gap-3 overflow-hidden">
                    {screenshotPreview ? (
                      <img
                        src={screenshotPreview}
                        alt="Preview"
                        className="w-10 h-10 object-cover rounded-lg border border-neutral-700"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-center text-neutral-300">
                        <FileText className="w-5 h-5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate max-w-[200px]">
                        {screenshotFile.name}
                      </p>
                      <p className="text-[10px] text-neutral-400">
                        {Math.round(screenshotFile.size / 1024)} KB
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={removeFile}
                    className="p-1.5 text-neutral-400 hover:text-red-400 rounded-lg hover:bg-neutral-800 transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full p-4 rounded-xl border border-dashed border-neutral-800 hover:border-neutral-600 bg-neutral-900/30 hover:bg-neutral-900/60 transition flex flex-col items-center justify-center gap-1.5 text-neutral-400 hover:text-neutral-200 cursor-pointer"
                >
                  <Upload className="w-5 h-5" />
                  <span className="text-xs font-medium">Click to upload screenshot or logs (PNG, JPG, PDF, TXT)</span>
                </button>
              )}
            </div>

            {/* Form Actions */}
            <div className="pt-3 border-t border-neutral-850 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-semibold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black font-bold text-xs transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Submit Bug Report
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
};

export default ReportBugModal;
