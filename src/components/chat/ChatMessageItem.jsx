import React from 'react';
import {
  Trash2,
  Download,
  FileText,
  Shield,
  Award
} from 'lucide-react';
import { format, parseISO, isToday, isYesterday, isThisYear } from 'date-fns';
import VoiceNotePlayer from './VoiceNotePlayer';
import WhatsAppCheck from './WhatsAppCheck';
import MarkdownRenderer from '../common/MarkdownRenderer';
import Avatar from '../common/Avatar';

const formatMessageTime = (isoString) => {
  if (!isoString) return '';
  try {
    const d = typeof isoString === 'string' ? parseISO(isoString) : new Date(isoString);
    return format(d, 'h:mm a');
  } catch {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch {
      return '';
    }
  }
};

const formatMessageFullDate = (isoString) => {
  if (!isoString) return '';
  try {
    const d = typeof isoString === 'string' ? parseISO(isoString) : new Date(isoString);
    if (isToday(d)) return `Today, ${format(d, 'h:mm a')}`;
    if (isYesterday(d)) return `Yesterday, ${format(d, 'h:mm a')}`;
    if (isThisYear(d)) return `${format(d, 'd MMMM')}, ${format(d, 'h:mm a')}`;
    return `${format(d, 'dd/MM/yyyy')}, ${format(d, 'h:mm a')}`;
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
  if (role === 'FOUNDING_ADVISOR') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-purple-950/80 text-purple-200 px-1.5 py-0.2 rounded border border-purple-800">
        <Award className="w-2.5 h-2.5" /> Advisor
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
  onDelete,
  isNew = false
}) => {
  // Check if message is a voice note / audio note
  const isAudioNote = Boolean(
    msg.file_type === 'audio' ||
    (msg.file_name && (/^voice_note/i.test(msg.file_name) || (msg.file_name.endsWith('.webm') && msg.content?.startsWith('Voice message')))) ||
    (msg.content && /^Voice message/i.test(msg.content) && msg.file_url)
  );

  const isPureVideo = msg.file_type === 'video' && !isAudioNote;

  return (
    <div className={`flex items-end gap-2 group ${isSelf ? 'justify-end' : 'justify-start'} ${isNew ? 'animate-msg-enter' : ''}`}>
      {/* Compact Round Avatar for standard incoming messages (Voice notes have internal avatar like WhatsApp demo) */}
      {!isSelf && !isAudioNote && (
        <Avatar
          src={msg.sender_avatar_url}
          name={msg.sender_name}
          size="sm"
          rounded="rounded-full"
          showStatus={true}
          status={isOnline ? 'online' : 'offline'}
          statusSize="xs"
          className="mb-0.5"
        />
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          CASE A: WhatsApp Voice Note Bubble (Exact match to demo)
          ───────────────────────────────────────────────────────────────────────── */}
      {isAudioNote ? (
        <div
          className={`rounded-2xl px-2.5 py-1.5 relative shadow-sm transition-all max-w-[90%] sm:max-w-[340px] ${
            isSelf
              ? 'bg-neutral-900 border border-neutral-750 text-white rounded-br-xs ml-auto'
              : 'bg-neutral-950 border border-neutral-800 text-neutral-100 rounded-bl-xs mr-auto'
          }`}
        >
          {/* Sender Header for incoming voice note */}
          {!isSelf && (
            <div className="flex items-center justify-between gap-2 mb-1 px-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-purple-400 leading-tight">
                  {msg.sender_name}
                </span>
                {getRoleBadge(msg.sender_role)}
              </div>
              {canDelete && (
                <button
                  onClick={() => onDelete(msg.id)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-neutral-500 hover:text-red-400 transition cursor-pointer"
                  title="Delete message"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {isSelf && canDelete && (
            <div className="flex justify-end -mt-0.5 mb-0.5">
              <button
                onClick={() => onDelete(msg.id)}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-neutral-500 hover:text-red-400 transition cursor-pointer"
                title="Delete message"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </div>
          )}

          {/* Compact WhatsApp Voice Note Bar */}
          <VoiceNotePlayer
            audioUrl={msg.file_url}
            isSelf={isSelf}
            senderAvatar={msg.sender_avatar_url}
            senderInitial={msg.sender_name?.charAt(0) || 'U'}
            timestamp={formatMessageTime(msg.created_at)}
            isOptimistic={msg.isOptimistic}
            status={msg.is_read ? 'read' : (msg.recipient_id ? 'sent' : 'read')}
          />
        </div>
      ) : (
        /* ─────────────────────────────────────────────────────────────────────────
           CASE B: Standard Text / Image / Document / Video Message Bubble
           ───────────────────────────────────────────────────────────────────────── */
        <div
          className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3 py-1.5 relative shadow-sm transition-all duration-150 ${
            isSelf
              ? 'bg-neutral-900 border border-neutral-750 text-white rounded-br-xs'
              : 'bg-neutral-950 border border-neutral-800 text-neutral-100 rounded-bl-xs'
          }`}
        >
          {/* Sender Name for incoming messages */}
          {!isSelf && (
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-purple-400 leading-tight">
                  {msg.sender_name}
                </span>
                {getRoleBadge(msg.sender_role)}
              </div>

              {canDelete && (
                <button
                  onClick={() => onDelete(msg.id)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-neutral-500 hover:text-red-400 transition cursor-pointer"
                  title="Delete message"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* Delete option for own messages on hover */}
          {isSelf && canDelete && (
            <div className="flex justify-end mb-0.5 -mt-0.5">
              <button
                onClick={() => onDelete(msg.id)}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-neutral-500 hover:text-red-400 transition cursor-pointer"
                title="Delete message"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Attachment Preview (Image, Video, or Document) */}
          {msg.file_url && (
            <div className="mb-1.5 mt-0.5">
              {msg.file_type === 'image' ? (
                <div className="rounded-xl overflow-hidden border border-neutral-800 bg-black/40">
                  <img
                    src={msg.file_url}
                    alt={msg.file_name || 'Attached image'}
                    loading="lazy"
                    className="max-h-64 w-full object-cover cursor-pointer hover:opacity-95 transition"
                    onClick={() => window.open(msg.file_url, '_blank')}
                  />
                  <div className="p-1.5 bg-neutral-950 flex items-center justify-between text-[11px] text-neutral-400">
                    <span className="truncate max-w-[180px]">{msg.file_name}</span>
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
              ) : isPureVideo ? (
                <div className="rounded-xl overflow-hidden border border-neutral-800 bg-black">
                  <video
                    src={msg.file_url}
                    controls
                    preload="metadata"
                    className="max-h-64 w-full rounded-t-xl bg-black"
                  />
                  <div className="p-1.5 bg-neutral-950 flex items-center justify-between text-[11px] text-neutral-400">
                    <span className="truncate max-w-[180px]">{msg.file_name}</span>
                    <a
                      href={msg.file_url}
                      download={msg.file_name || 'video'}
                      target="_blank"
                      rel="noreferrer"
                      className="text-white hover:underline flex items-center gap-1 font-semibold"
                    >
                      <Download className="w-3 h-3" />
                      Save
                    </a>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 p-2 bg-neutral-900 border border-neutral-800 rounded-xl hover:border-neutral-700 transition my-1">
                  <div className="w-7 h-7 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-center text-white shrink-0">
                    <FileText className="w-4 h-4 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-white truncate max-w-[160px]">
                      {msg.file_name}
                    </p>
                    <p className="text-[10px] text-neutral-400">
                      {formatFileSize(msg.file_size)}
                    </p>
                  </div>
                  <a
                    href={msg.file_url}
                    download={msg.file_name || 'document'}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 bg-white text-black hover:bg-neutral-200 rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0 shadow-sm"
                  >
                    <Download className="w-3 h-3" />
                    <span>Get</span>
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Text Message Content + Inline WhatsApp Timestamp */}
          {msg.content && msg.content !== 'Voice message' ? (
            <div className="text-[13px] text-neutral-100 leading-snug break-words">
              <MarkdownRenderer content={msg.content} className="inline-block" />
              <span
                title={formatMessageFullDate(msg.created_at)}
                className="inline-flex items-center gap-1 ml-2 float-right mt-0.5 text-[10px] text-neutral-400 select-none cursor-default"
              >
                <span>{formatMessageTime(msg.created_at)}</span>
                {isSelf && (
                  <WhatsAppCheck
                    isOptimistic={msg.isOptimistic}
                    status={msg.is_read ? 'read' : (msg.recipient_id ? 'sent' : 'read')}
                  />
                )}
              </span>
            </div>
          ) : (
            <div
              title={formatMessageFullDate(msg.created_at)}
              className="flex items-center justify-end gap-1 mt-0.5 text-[10px] text-neutral-400 select-none cursor-default"
            >
              <span>{formatMessageTime(msg.created_at)}</span>
              {isSelf && (
                <WhatsAppCheck
                  isOptimistic={msg.isOptimistic}
                  status={msg.is_read ? 'read' : (msg.recipient_id ? 'sent' : 'read')}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const ChatMessageItem = React.memo(ChatMessageItemComponent);
export default ChatMessageItem;
