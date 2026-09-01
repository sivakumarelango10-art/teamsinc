import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { usePresence } from '../../context/PresenceContext';
import { chatApi } from '../../api/chatApi';
import { supabase } from '../../api/supabase';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import BrandLogo from '../../components/common/BrandLogo';
import VoiceNotePlayer from '../../components/chat/VoiceNotePlayer';
import VoiceRecorderBar from '../../components/chat/VoiceRecorderBar';
import {
  Plus,
  Smile,
  Mic,
  Send,
  FileText,
  Image as ImageIcon,
  Download,
  X,
  Shield,
  ShieldAlert,
  User,
  Trash2,
  Users,
  CheckCheck,
  Paperclip,
  Lock,
  ExternalLink,
  MessageSquare
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

const QUICK_EMOJIS = ['😀', '😂', '😍', '👍', '🙏', '🎉', '🔥', '🚀', '❤️', '✅', '👏', '💯', '🎯', '💡', '✨', '🙌'];

export const TeamChat = () => {
  const { user, profile, isFounder } = useAuth();
  const { isUserOnline, onlineCount } = usePresence();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // Voice recording state
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);

  // Attachment state
  const [selectedFile, setSelectedFile] = useState(null);
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const attachMenuRef = useRef(null);
  const emojiPickerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target)) {
        setIsAttachMenuOpen(false);
      }
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) {
        setIsEmojiPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  const loadMessages = async () => {
    try {
      const list = await chatApi.getMessages(200);
      setMessages(list);
    } catch (err) {
      console.error('Failed to load chat messages:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMessages();

    // Supabase Realtime subscription for incoming messages
    let channel = null;
    if (supabase) {
      channel = supabase
        .channel('realtime-whatsapp-chat')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          (payload) => {
            if (payload.new) {
              setMessages(prev => {
                if (prev.some(m => m.id === payload.new.id)) return prev;
                return [...prev, payload.new];
              });
              setTimeout(() => scrollToBottom(true), 50);
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'messages' },
          (payload) => {
            if (payload.old?.id) {
              setMessages(prev => prev.filter(m => m.id !== payload.old.id));
            }
          }
        )
        .subscribe();
    }

    // Cross-tab synchronization
    let bc = null;
    try {
      bc = new BroadcastChannel('teamsync_chat_channel');
      bc.onmessage = (event) => {
        if (event.data?.type === 'NEW_MESSAGE' && event.data.message) {
          setMessages(prev => {
            if (prev.some(m => m.id === event.data.message.id)) return prev;
            return [...prev, event.data.message];
          });
          setTimeout(() => scrollToBottom(true), 50);
        } else if (event.data?.type === 'DELETE_MESSAGE' && event.data.id) {
          setMessages(prev => prev.filter(m => m.id !== event.data.id));
        }
      };
    } catch {}

    return () => {
      if (channel && supabase) supabase.removeChannel(channel);
      if (bc) bc.close();
    };
  }, []);

  useEffect(() => {
    if (!loading) {
      scrollToBottom(false);
    }
  }, [loading]);

  const handleFileSelect = (e, fileTypeHint = 'document') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit: 15MB
    if (file.size > 15 * 1024 * 1024) {
      setError('File is larger than 15MB limit.');
      return;
    }

    setSelectedFile(file);
    setIsAttachMenuOpen(false);

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        setAttachmentPreview({
          url: reader.result,
          name: file.name,
          size: file.size,
          type: 'image'
        });
      };
      reader.readAsDataURL(file);
    } else {
      setAttachmentPreview({
        url: null,
        name: file.name,
        size: file.size,
        type: 'document'
      });
    }

    inputRef.current?.focus();
  };

  const removeAttachment = () => {
    setSelectedFile(null);
    setAttachmentPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if ((!inputValue.trim() && !selectedFile) || sending) return;

    const content = inputValue.trim();
    const fileToSend = selectedFile;

    setInputValue('');
    removeAttachment();
    setSending(true);
    setError('');
    setIsEmojiPickerOpen(false);

    try {
      let attachmentData = null;
      if (fileToSend) {
        attachmentData = await chatApi.uploadAttachment(fileToSend);
      }

      const senderName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Team Member';
      const senderEmail = profile?.email || user?.email || '';
      const senderRole = profile?.role || 'MEMBER';
      const senderId = profile?.id || user?.id;

      const newMsg = await chatApi.sendMessage({
        content,
        senderId,
        senderName,
        senderEmail,
        senderRole,
        attachment: attachmentData
      });

      if (newMsg) {
        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        setTimeout(() => scrollToBottom(true), 50);

        try {
          const bc = new BroadcastChannel('teamsync_chat_channel');
          bc.postMessage({ type: 'NEW_MESSAGE', message: newMsg });
          bc.close();
        } catch {}
      }
    } catch (err) {
      console.error('Error sending message:', err);
      setError(err.message || 'Failed to deliver message. Please try again.');
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleSendVoice = async (audioFile, duration) => {
    setIsRecordingVoice(false);
    setSending(true);
    setError('');

    try {
      // Upload audio file (Supabase storage or DataURL fallback)
      const attachmentData = await chatApi.uploadAttachment(audioFile);

      const senderName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Team Member';
      const senderEmail = profile?.email || user?.email || '';
      const senderRole = profile?.role || 'MEMBER';
      const senderId = profile?.id || user?.id;

      const newMsg = await chatApi.sendMessage({
        content: 'Voice message',
        senderId,
        senderName,
        senderEmail,
        senderRole,
        attachment: attachmentData
      });

      if (newMsg) {
        // Attach client duration if available
        const enrichedMsg = { ...newMsg, audio_duration: duration };
        setMessages(prev => {
          if (prev.some(m => m.id === enrichedMsg.id)) return prev;
          return [...prev, enrichedMsg];
        });
        setTimeout(() => scrollToBottom(true), 50);

        try {
          const bc = new BroadcastChannel('teamsync_chat_channel');
          bc.postMessage({ type: 'NEW_MESSAGE', message: enrichedMsg });
          bc.close();
        } catch {}
      }
    } catch (err) {
      console.error('Error sending voice message:', err);
      setError(err.message || 'Failed to send voice message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleDeleteMessage = async (msgId) => {
    try {
      await chatApi.deleteMessage(msgId);
      setMessages(prev => prev.filter(m => m.id !== msgId));
      try {
        const bc = new BroadcastChannel('teamsync_chat_channel');
        bc.postMessage({ type: 'DELETE_MESSAGE', id: msgId });
        bc.close();
      } catch {}
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const addEmoji = (emoji) => {
    setInputValue(prev => prev + emoji);
    inputRef.current?.focus();
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatMessageTime = (dateStr) => {
    try {
      const date = parseISO(dateStr);
      return format(date, 'h:mm a');
    } catch {
      return '';
    }
  };

  const getRoleBadge = (role) => {
    if (role === 'FOUNDER') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-700">
          <ShieldAlert className="w-2.5 h-2.5 text-white" />
          Founder
        </span>
      );
    }
    if (role === 'ADMIN') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-neutral-300 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-700">
          <Shield className="w-2.5 h-2.5 text-neutral-300" />
          Admin
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-neutral-400 bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800">
        <User className="w-2.5 h-2.5" />
        Member
      </span>
    );
  };

  return (
    <div className="h-[calc(100vh-6.5rem)] flex flex-col bg-neutral-950 rounded-2xl md:rounded-3xl border border-neutral-800 overflow-hidden shadow-2xl relative">
      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => handleFileSelect(e, 'document')}
        className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar"
      />
      <input
        type="file"
        ref={imageInputRef}
        onChange={(e) => handleFileSelect(e, 'image')}
        className="hidden"
        accept="image/*"
      />

      {/* 1. Optimized WhatsApp Group Header */}
      <div className="px-5 py-3 bg-black border-b border-neutral-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          {/* Clean Logo Avatar */}
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-xl bg-white p-0.5 flex items-center justify-center shadow-md overflow-hidden">
              <img
                src="/logo.jpg"
                alt="TeamSync"
                className="w-full h-full object-contain"
              />
            </div>
            <span
              className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-black"
              title="Group online"
            />
          </div>

          {/* Clean Group Meta Info */}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm md:text-base font-bold text-white tracking-tight truncate">
                TeamSync Company HQ
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-neutral-900 border border-neutral-800 text-neutral-300">
                #general
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-400 mt-0.5">
              <span className="flex items-center gap-1 text-[11px] text-neutral-400">
                <Users className="w-3 h-3 text-neutral-500" />
                All Team Members
              </span>
              <span className="text-neutral-600">•</span>
              <span className="text-emerald-400 font-medium text-[11px] flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {onlineCount} Online Now
              </span>
            </div>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs text-neutral-400 bg-neutral-900/90 px-3 py-1.5 rounded-xl border border-neutral-800">
          <Lock className="w-3.5 h-3.5 text-neutral-400" />
          <span className="text-[11px] font-medium">Official Channel</span>
        </div>
      </div>

      {/* 2. Messages Stream (WhatsApp Canvas with Wallpaper pattern) */}
      <div
        className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-black/60 relative"
        style={{
          backgroundImage: `radial-gradient(#262626 1px, transparent 1px)`,
          backgroundSize: '24px 24px'
        }}
      >
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <LoadingSpinner text="Opening secure company channel..." />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-neutral-400 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400 shadow-inner">
              <MessageSquare className="w-6 h-6 text-white" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm md:text-base font-bold text-white">TeamSync Company Channel</h3>
              <p className="text-xs text-neutral-400 max-w-sm">
                Say hello, discuss project tasks, or attach documents to share with everyone.
              </p>
            </div>

            {/* Quick Conversation Starters */}
            <div className="flex items-center gap-2 flex-wrap justify-center pt-2">
              {[
                '👋 Hello team!',
                '🚀 Ready for standup',
                '📄 Sharing document',
                '✅ Task update'
              ].map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => {
                    setInputValue(starter);
                    inputRef.current?.focus();
                  }}
                  className="px-3 py-1.5 rounded-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 text-xs text-neutral-300 transition cursor-pointer"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isSelf =
              (msg.sender_email && profile?.email && msg.sender_email.toLowerCase() === profile.email.toLowerCase()) ||
              (msg.sender_id && profile?.id && msg.sender_id === profile.id);

            const isOnline = isUserOnline(msg.sender_email);
            const canDelete = isSelf || isFounder;

            return (
              <div
                key={msg.id || index}
                className={`flex gap-2.5 group ${isSelf ? 'justify-end' : 'justify-start'}`}
              >
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
                        onClick={() => handleDeleteMessage(msg.id)}
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
                    {isSelf && <CheckCheck className="w-3.5 h-3.5 text-neutral-300" />}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 3. Attachment Preview Chip (Shown before sending) */}
      {attachmentPreview && (
        <div className="px-4 py-2 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            {attachmentPreview.type === 'image' ? (
              <img
                src={attachmentPreview.url}
                alt="Preview"
                className="w-10 h-10 rounded-lg object-cover border border-neutral-700"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-neutral-900 border border-neutral-700 flex items-center justify-center text-white">
                <FileText className="w-5 h-5 text-white" />
              </div>
            )}
            <div>
              <p className="text-xs font-bold text-white truncate max-w-xs sm:max-w-md">
                {attachmentPreview.name}
              </p>
              <p className="text-[10px] text-neutral-400">
                {formatFileSize(attachmentPreview.size)} • Ready to send
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={removeAttachment}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-900 transition cursor-pointer"
            title="Remove attachment"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 4. Quick Emoji Picker Drawer */}
      {isEmojiPickerOpen && (
        <div ref={emojiPickerRef} className="p-3 bg-black border-t border-neutral-800 flex items-center gap-2 overflow-x-auto shrink-0 shadow-inner">
          <span className="text-[11px] text-neutral-400 mr-1 font-semibold">Emojis:</span>
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => addEmoji(emoji)}
              className="p-1.5 text-base hover:scale-125 transition cursor-pointer"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* 5. WhatsApp-Style Input Bar (Matches User Screenshot 2 Exactly) */}
      <div className="p-3 sm:p-4 bg-black border-t border-neutral-800 shrink-0 relative">
        {error && (
          <div className="mb-2 text-xs text-red-400 px-3 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="underline cursor-pointer">
              Dismiss
            </button>
          </div>
        )}

        {/* Attachment Floating Menu */}
        {isAttachMenuOpen && (
          <div ref={attachMenuRef} className="absolute bottom-20 left-4 z-50 p-2 bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl flex flex-col gap-1.5 w-48 text-xs text-neutral-200">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full px-3 py-2.5 rounded-xl hover:bg-neutral-800 text-left flex items-center gap-3 transition cursor-pointer"
            >
              <div className="w-7 h-7 rounded-lg bg-neutral-800 border border-neutral-600 flex items-center justify-center text-white">
                <FileText className="w-4 h-4 text-white" />
              </div>
              <div>
                <span className="font-bold text-white block">Document</span>
                <span className="text-[10px] text-neutral-400 block">PDF, DOCX, XLSX, TXT</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="w-full px-3 py-2.5 rounded-xl hover:bg-neutral-800 text-left flex items-center gap-3 transition cursor-pointer"
            >
              <div className="w-7 h-7 rounded-lg bg-neutral-800 border border-neutral-600 flex items-center justify-center text-white">
                <ImageIcon className="w-4 h-4 text-white" />
              </div>
              <div>
                <span className="font-bold text-white block">Photos & Media</span>
                <span className="text-[10px] text-neutral-400 block">PNG, JPG, WebP</span>
              </div>
            </button>
          </div>
        )}

        {/* Input Bar or Voice Recording Bar */}
        {isRecordingVoice ? (
          <VoiceRecorderBar
            onSend={handleSendVoice}
            onCancel={() => setIsRecordingVoice(false)}
          />
        ) : (
          <form onSubmit={handleSendMessage} className="flex items-center gap-2 sm:gap-3">
            {/* Main WhatsApp Pill */}
            <div className="flex-1 bg-neutral-900 border border-neutral-700 hover:border-neutral-600 focus-within:border-white rounded-full px-3 py-2 flex items-center gap-2 transition shadow-inner">
              {/* 1. Attachment '+' Button */}
              <button
                type="button"
                onClick={() => {
                  setIsAttachMenuOpen(prev => !prev);
                  setIsEmojiPickerOpen(false);
                }}
                className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-full transition cursor-pointer shrink-0"
                title="Attach documents or photos"
              >
                <Plus className={`w-5 h-5 transition-transform ${isAttachMenuOpen ? 'rotate-45 text-white' : ''}`} />
              </button>

              {/* 2. Emoji Button */}
              <button
                type="button"
                onClick={() => {
                  setIsEmojiPickerOpen(prev => !prev);
                  setIsAttachMenuOpen(false);
                }}
                className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-full transition cursor-pointer shrink-0"
                title="Emojis"
              >
                <Smile className="w-5 h-5" />
              </button>

              {/* 3. Text Input */}
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message"
                disabled={sending}
                className="flex-1 bg-transparent text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none px-1"
              />
            </div>

            {/* 4. Send or WhatsApp Mic Button */}
            {inputValue.trim() || selectedFile ? (
              <button
                type="submit"
                disabled={sending}
                className="w-11 h-11 rounded-full bg-white text-black hover:bg-neutral-200 disabled:opacity-50 transition flex items-center justify-center shadow-lg cursor-pointer shrink-0"
                title="Send message"
              >
                <Send className="w-5 h-5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsAttachMenuOpen(false);
                  setIsEmojiPickerOpen(false);
                  setIsRecordingVoice(true);
                }}
                className="w-11 h-11 rounded-full bg-neutral-900 border border-neutral-700 hover:border-emerald-500/60 hover:text-emerald-400 text-neutral-300 transition-all flex items-center justify-center cursor-pointer shrink-0 group shadow-md"
                title="Record voice message"
              >
                <Mic className="w-5 h-5 group-hover:scale-110 transition-transform" />
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
};

export default TeamChat;
