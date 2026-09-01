import React, { useState, useRef } from 'react';
import { X, FileText, Download, Upload, Loader2, Paperclip } from 'lucide-react';
import { chatApi } from '../../api/chatApi';

const formatFileSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

export const InCallFilesDrawer = ({ files = [], onShareFile, onClose }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 25MB limit
    if (file.size > 25 * 1024 * 1024) {
      setUploadError('File size exceeds 25MB limit.');
      return;
    }

    setIsUploading(true);
    setUploadError('');

    try {
      const uploaded = await chatApi.uploadAttachment(file);
      if (uploaded) {
        onShareFile(uploaded);
      }
    } catch (err) {
      console.error('In-call file upload error:', err);
      setUploadError(err.message || 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-80 md:w-88 h-full bg-neutral-950 border-l border-neutral-800 flex flex-col shrink-0 z-30 shadow-2xl">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.png,.jpg,.jpeg,.webp"
      />

      {/* Drawer Header */}
      <div className="px-4 py-3.5 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/80">
        <div className="flex items-center gap-2 text-white">
          <Paperclip className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs md:text-sm font-bold tracking-tight">Call Files ({files.length})</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition cursor-pointer"
          title="Close files"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Upload Action Card */}
      <div className="p-3 border-b border-neutral-800 bg-neutral-900/40">
        <button
          type="button"
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-2.5 px-3 rounded-xl border border-dashed border-neutral-700 hover:border-emerald-500/80 hover:bg-neutral-900 text-neutral-300 hover:text-white transition flex items-center justify-center gap-2 text-xs font-semibold cursor-pointer shadow-sm"
        >
          {isUploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              <span>Uploading file...</span>
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 text-emerald-400" />
              <span>Share a file with call</span>
            </>
          )}
        </button>

        {uploadError && (
          <p className="mt-2 text-[11px] text-red-400 text-center">{uploadError}</p>
        )}
      </div>

      {/* Files Stream */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 text-xs">
        {files.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-neutral-500 p-4 space-y-2">
            <FileText className="w-8 h-8 opacity-40 text-neutral-400" />
            <p className="text-xs text-neutral-400 font-medium">No files shared yet</p>
            <p className="text-[11px] text-neutral-500">
              Upload documents, presentations, or media to share with all call participants.
            </p>
          </div>
        ) : (
          files.map((file) => (
            <div
              key={file.id}
              className="p-3 rounded-xl bg-neutral-900/90 border border-neutral-800 hover:border-neutral-700 transition flex items-center justify-between gap-3 shadow-md"
            >
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="w-8 h-8 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-center shrink-0 text-white">
                  <FileText className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="overflow-hidden">
                  <p className="font-semibold text-white truncate max-w-[150px]" title={file.name}>
                    {file.name}
                  </p>
                  <p className="text-[10px] text-neutral-400">
                    {formatFileSize(file.size)} • {file.senderName || 'Member'}
                  </p>
                </div>
              </div>

              <a
                href={file.url}
                download={file.name}
                target="_blank"
                rel="noreferrer"
                className="p-2 rounded-lg bg-white text-black hover:bg-neutral-200 transition shrink-0 cursor-pointer shadow-sm"
                title="Download file"
              >
                <Download className="w-3.5 h-3.5" />
              </a>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default InCallFilesDrawer;
