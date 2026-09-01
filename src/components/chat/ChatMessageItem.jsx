import React from 'react';
import {
  Trash2,
  Download,
  FileText,
  Clock3,
  Check,
  CheckCheck,
  Shield,
  ShieldAlert,
  Award
} from 'lucide-react';
import VoiceNotePlayer from './VoiceNotePlayer';

const formatMessageTime = (isoString) => {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

const formatFileSize = (bytes) => {
  if (!bytes) return '0 KB';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const getRoleBadge = (role) => {
  if (role === 'FOUNDER') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-white text-black px-1.5 py-0.2 rounded border border-neutral-300">
        <ShieldAlert className="w-2.5 h-2.5" /> Founder
      </span>
    );
  }
  if (role === 'FOUNDING_ADVISOR') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-purple-950/80 text-purple-200 px-1.5 py-0.2 rounded border border-purple-800">
        <Award className="w-2.5 h-2.5" /> Founding Advisor
      </span>
    );
  }
  if (role === 'ADMIN') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold bg-neutral-800 text-neutral-300 px-1.5 py-0.2 rounded border border-neutral-700">
        <Shield className="w-2.5 h-2.5" /> Admin
      </span>
    );
  }
  return null;
};

const ChatMessageItemComponent = ({
  msg,
  isSelf,
  isOnline,
  canDelete,
  onDelete
}) => {
  return (
    <div className={`flex gap-2.5 group ${isSelf ? 'justify-end' : 'justify-start'}`}>
      {/* Avatar for incoming messages */}
      {!isSelf && (
        <div className="relative shrink-0 self-end mb-1">
          <div className="w-8 h-8 rounded-xl bg-neutral-900 border border-neutral-700 flex items-center justify-center font-bold text-xs text-white">
            {msg.sender_name?.charAt(0) || 'U'}
          </div>
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-black ${
              isOnline ? 'bg-emerald-400' : 'bg-neutral-600'
            }`}
          />
        </div>
      )}

      {/* WhatsApp Message Bubble */}
      <div
        className={`max-w-[85%] sm:max-w-[65%] rounded-2xl p-3 relative shadow-md transition ${
          isSelf
            ? 'bg-neutral-900 border border-neutral-750 text-white rounded-br-none'
            : 'bg-neutral-950 border border-neutral-800 text-neutral-100 rounded-bl-none'
        }`}
      >
        {/* Sender Header */}
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold ${isSelf ? 'text-white' : 'text-neutral-200'}`}>
              {isSelf ? 'You' : msg.sender_name}
            </span>
            {getRoleBadge(msg.sender_role)}
          </div>

          {canDelete && (
            <button
              onClick={() => onDelete(msg.id)}
              className="opacity-0 group-hover:opacity-100 p-1 text-neutral-500 hover:text-red-400 transition cursor-pointer"
              title="Delete message"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Attachment Preview (Image, Audio Voice Note, or Document) */}
        {msg.file_url && (
          <div className="mb-2">
            {msg.file_type === 'image' ? (
              <div className="rounded-xl overflow-hidden border border-neutral-800 bg-black/40">
                <img
                  src={msg.file_url}
                  alt={msg.file_name || 'Attached image'}
                  loading="lazy"
                  className="max-h-72 w-full object-cover cursor-pointer hover:opacity-95 transition"
                  onClick={() => window.open(msg.file_url, '_blank')}
                />
                <div className="p-2 bg-neutral-950 flex items-center justify-between text-[11px] text-neutral-400">
                  <span className="truncate max-w-[200px]">{msg.file_name}</span>
                  <a
                    href={msg.file_url}
                    download={msg.file_name || 'image'}
                    target="_blank"
                    rel="noreferrer"
                    className="text-white hover:underline flex items-center gap-1 font-semibold"
                  >
                    <Download className="w-3 h-3" />
                    Save
                  </a>
                </div>
              </div>
            ) : msg.file_type === 'audio' || /\.(webm|mp3|wav|ogg|m4a|aac)$/i.test(msg.file_name || '') ? (
              <VoiceNotePlayer
                audioUrl={msg.file_url}
                duration={msg.audio_duration}
                isSelf={isSelf}
                fileName={msg.file_name}
              />
            ) : (
              /* WhatsApp-style Document Card */
              <div className="p-3 rounded-xl bg-black border border-neutral-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="w-9 h-9 rounded-lg bg-neutral-900 border border-neutral-700 flex items-center justify-center shrink-0 text-white">
                    <FileText className="w-4 h-4 text-white" />
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-xs font-semibold text-white truncate max-w-[220px]">
                      {msg.file_name || 'Document'}
                    </p>
                    <p className="text-[10px] text-neutral-400">
                      {formatFileSize(msg.file_size)}
                    </p>
                  </div>
                </div>

                <a
                  href={msg.file_url}
                  download={msg.file_name || 'document'}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-white text-black hover:bg-neutral-200 rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0 shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </a>
              </div>
            )}
          </div>
        )}

        {/* Text Message Content (Hidden if purely 'Voice message' label) */}
        {msg.content && msg.content !== 'Voice message' && (
          <p className="text-xs sm:text-sm text-neutral-200 whitespace-pre-wrap leading-relaxed break-words">
            {msg.content}
          </p>
        )}

        {/* Footer Timestamp & Delivery Checks */}
        <div className="flex items-center justify-end gap-1.5 mt-1.5 text-[10px] text-neutral-400">
          <span>{formatMessageTime(msg.created_at)}</span>
          {isSelf && (
            msg.isOptimistic ? (
              <Clock3 className="w-3 h-3 text-neutral-500 animate-pulse" title="Sending..." />
            ) : (
              <CheckCheck className="w-3.5 h-3.5 text-emerald-400" title="Delivered to channel" />
            )
          )}
        </div>
      </div>
    </div>
  );
};

export const ChatMessageItem = React.memo(ChatMessageItemComponent);
export default ChatMessageItem;
