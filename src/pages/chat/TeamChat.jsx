import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { usePresence } from '../../context/PresenceContext';
import { useCallNotification } from '../../context/CallNotificationContext';
import { chatApi } from '../../api/chatApi';
import { callApi } from '../../api/callApi';
import { supabase } from '../../api/supabase';
import notificationService from '../../utils/notificationService';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import BrandLogo from '../../components/common/BrandLogo';
import VoiceNotePlayer from '../../components/chat/VoiceNotePlayer';
import VoiceRecorderBar from '../../components/chat/VoiceRecorderBar';
import ChatMessageItem from '../../components/chat/ChatMessageItem';
import ActiveCallBanner from '../../components/call/ActiveCallBanner';
import CallHistoryModal from '../../components/call/CallHistoryModal';
import {
  Plus,
  Smile,
  Mic,
  Send,
  FileText,
  Image as ImageIcon,
  X,
  Shield,
  Users,
  MessageSquare,
  Video,
  Phone,
  Clock,
  Clock3,
  Loader2,
  Search,
  ChevronLeft,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { format, parseISO, isToday, isYesterday, isThisYear, isSameDay } from 'date-fns';

const QUICK_EMOJIS = ['😀', '😂', '😍', '👍', '🙏', '🎉', '🔥', '🚀', '❤️', '✅', '👏', '💯', '🎯', '💡', '✨', '🙌'];

// WhatsApp-style Date Divider Label (Today, Yesterday, September 1, 2026, 14/08/2025)
const formatDayDividerLabel = (isoString) => {
  if (!isoString) return '';
  try {
    const d = typeof isoString === 'string' ? parseISO(isoString) : new Date(isoString);
    if (isNaN(d.getTime())) return '';

    if (isToday(d)) {
      return 'Today';
    }
    if (isYesterday(d)) {
      return 'Yesterday';
    }
    if (isThisYear(d)) {
      return format(d, 'MMMM d, yyyy');
    }
    return format(d, 'dd/MM/yyyy');
  } catch {
    return '';
  }
};

const isDifferentDay = (d1, d2) => {
  if (!d1 || !d2) return true;
  try {
    const date1 = typeof d1 === 'string' ? parseISO(d1) : new Date(d1);
    const date2 = typeof d2 === 'string' ? parseISO(d2) : new Date(d2);
    if (isNaN(date1.getTime()) || isNaN(date2.getTime())) return true;
    return !isSameDay(date1, date2);
  } catch {
    return true;
  }
};

export const TeamChat = ({
  channel: initialChannel = 'general',
  title: initialTitle,
  subtitle: initialSubtitle
}) => {
  const { user, profile, isFounder, isAdmin, isFoundingAdvisor, isLeadership } = useAuth();
  const { isUserOnline, onlineCount } = usePresence();

  // Role channel permissions (Founding Advisor can ONLY access Leadership chat)
  const isAdvisor = profile?.role === 'FOUNDING_ADVISOR' || Boolean(isFoundingAdvisor);
  const canAccessLeadership = isFounder || isAdmin || isAdvisor;
  const canAccessGeneral = !isAdvisor;
  const hasMultipleChannels = canAccessGeneral && canAccessLeadership; // Founder & Admin

  // Active channel state (Founding Advisor defaults and is restricted to 'leadership')
  const defaultChannel = isAdvisor ? 'leadership' : (initialChannel || 'general');
  const [activeChannel, setActiveChannel] = useState(defaultChannel);

  // Ensure Founding Advisor is locked strictly to 'leadership' channel
  useEffect(() => {
    if (isAdvisor && activeChannel !== 'leadership') {
      setActiveChannel('leadership');
    }
  }, [isAdvisor, activeChannel]);

  // Chat sidebar collapse/hide state & Mobile animated state
  const [isChatListOpen, setIsChatListOpen] = useState(true);
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(true);
  const [isMobileClosing, setIsMobileClosing] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // Global Call Notification Context (handles multi-route calls and ringing)
  const { startCall, ongoingCall, acceptCall, activeCallSession } = useCallNotification();
  const [dismissedCallId, setDismissedCallId] = useState(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  // Live Typing Indicator State & Broadcast
  const [typingUsers, setTypingUsers] = useState({}); // { [email]: { name, time } }
  const typingTimeoutRef = useRef(null);
  const lastTypingBroadcastRef = useRef(0);
  const realtimeChannelRef = useRef(null);
  const typingBcRef = useRef(null);

  // Pagination & Smart Scroll State
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const processedMsgIdsRef = useRef(new Set());
  const newlyArrivedIdsRef = useRef(new Set());

  // Voice recording state
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);

  // Attachment state
  const [selectedFile, setSelectedFile] = useState(null);
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);

  const scrollContainerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
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

  // Smart Scroll detection: Only auto-scroll if already near bottom or user forced
  const isNearBottom = () => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  };

  const scrollToBottom = (smooth = true, force = false) => {
    if (force || isNearBottom()) {
      messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }
  };

  const loadMessages = async (targetChannel = activeChannel) => {
    try {
      setLoading(true);
      processedMsgIdsRef.current.clear();
      newlyArrivedIdsRef.current.clear();
      const list = await chatApi.getMessages(50, null, targetChannel);
      list.forEach(m => processedMsgIdsRef.current.add(m.id));
      setMessages(list);
      setHasMoreOlder(list.length >= 50);
    } catch (err) {
      console.error('Failed to load chat messages:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadOlderMessages = async () => {
    if (loadingOlder || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const oldestDate = messages[0]?.created_at;
      const olderList = await chatApi.getMessages(50, oldestDate, activeChannel);
      if (olderList.length < 50) {
        setHasMoreOlder(false);
      }
      if (olderList.length > 0) {
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const newOlder = olderList.filter(m => !existingIds.has(m.id));
          newOlder.forEach(m => processedMsgIdsRef.current.add(m.id));
          return [...newOlder, ...prev];
        });
      }
    } catch (e) {
      console.error('Error loading older messages:', e);
    } finally {
      setLoadingOlder(false);
    }
  };

  // Broadcast typing indicator with throttling
  const broadcastTyping = useCallback((isTyping) => {
    const myEmail = profile?.email || user?.email;
    const myName = profile?.full_name || user?.user_metadata?.full_name || 'Team Member';
    if (!myEmail) return;

    const payload = {
      email: myEmail,
      name: myName,
      isTyping,
      time: Date.now(),
      channel: activeChannel
    };

    if (realtimeChannelRef.current) {
      realtimeChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload
      });
    }

    if (typingBcRef.current) {
      try {
        typingBcRef.current.postMessage(payload);
      } catch {}
    }
  }, [profile, user, activeChannel]);

  const handleTypingSignal = useCallback((payload) => {
    if (!payload?.email) return;
    const myEmail = profile?.email?.toLowerCase() || user?.email?.toLowerCase();
    if (payload.email.toLowerCase() === myEmail) return;

    setTypingUsers(prev => {
      const updated = { ...prev };
      if (payload.isTyping) {
        updated[payload.email] = { name: payload.name, time: Date.now() };
      } else {
        delete updated[payload.email];
      }
      return updated;
    });
  }, [profile?.email, user?.email]);

  const handleInputChange = (val) => {
    setInputValue(val);
    const now = Date.now();
    if (now - lastTypingBroadcastRef.current > 1500) {
      lastTypingBroadcastRef.current = now;
      broadcastTyping(true);
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      broadcastTyping(false);
    }, 2500);
  };

  // Clean stale typing users after 3s
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setTypingUsers(prev => {
        let changed = false;
        const next = { ...prev };
        Object.keys(next).forEach(k => {
          if (now - next[k].time > 3200) {
            delete next[k];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  const handleStartCall = async (callType = 'video') => {
    try {
      // If a call is already active in this room, join the existing session
      if (ongoingCall && ongoingCall.room_id === activeChannel && ongoingCall.status === 'ongoing') {
        acceptCall(ongoingCall);
        return;
      }
      const channelTitle = activeChannel === 'leadership' ? 'Leadership Council' : (initialTitle || 'Team Chat');
      await startCall(callType, activeChannel, channelTitle);
    } catch (err) {
      console.error('Error starting call:', err);
      setError(err.message || 'Failed to start call. Please try again.');
    }
  };

  const handleJoinCall = (call) => {
    acceptCall(call || ongoingCall);
  };

  // Mobile Back button smooth close handler
  const handleMobileBack = () => {
    setIsMobileClosing(true);
    setTimeout(() => {
      setIsMobileChatOpen(false);
      setIsMobileClosing(false);
    }, 200);
  };

  useEffect(() => {
    notificationService.setForegroundState(true);

    const handleVisibilityChange = () => {
      notificationService.setForegroundState(!document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    loadMessages(activeChannel);

    // Supabase Realtime subscription
    let rtChannel = null;
    if (supabase) {
      rtChannel = supabase
        .channel(`realtime-chat-${activeChannel}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          (payload) => {
            if (payload.new) {
              const newMsg = payload.new;
              if ((newMsg.channel || 'general') !== activeChannel) return;
              if (processedMsgIdsRef.current.has(newMsg.id)) return;
              processedMsgIdsRef.current.add(newMsg.id);
              newlyArrivedIdsRef.current.add(newMsg.id);

              setMessages(prev => {
                const optIndex = prev.findIndex(m => m.isOptimistic && m.sender_id === newMsg.sender_id && m.content === newMsg.content);
                if (optIndex !== -1) {
                  const updated = [...prev];
                  updated[optIndex] = newMsg;
                  return updated;
                }
                return [...prev, newMsg];
              });
              setTimeout(() => scrollToBottom(true, false), 40);

              const myEmail = profile?.email?.toLowerCase() || user?.email?.toLowerCase();
              if (newMsg.sender_email && myEmail && newMsg.sender_email.toLowerCase() !== myEmail) {
                notificationService.notifyChatMessage({
                  senderName: newMsg.sender_name,
                  content: newMsg.content || newMsg.file_name,
                  currentPath: window.location.pathname,
                  messageId: newMsg.id
                });
              }
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'messages' },
          (payload) => {
            if (payload.new) {
              const updatedMsg = payload.new;
              if ((updatedMsg.channel || 'general') !== activeChannel) return;
              setMessages(prev => prev.map(m => (m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m)));
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'messages' },
          (payload) => {
            if (payload.old?.id) {
              processedMsgIdsRef.current.delete(payload.old.id);
              setMessages(prev => prev.filter(m => m.id !== payload.old.id));
            }
          }
        )
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          if (payload?.channel === activeChannel) {
            handleTypingSignal(payload);
          }
        })
        .subscribe();

      realtimeChannelRef.current = rtChannel;
    }

    // Cross-tab synchronization
    let bc = null;
    let typingBc = null;
    try {
      bc = new BroadcastChannel(`teamsync_chat_channel_${activeChannel}`);
      bc.onmessage = (event) => {
        if (event.data?.type === 'NEW_MESSAGE' && event.data.message) {
          const msg = event.data.message;
          if ((msg.channel || 'general') !== activeChannel) return;
          if (processedMsgIdsRef.current.has(msg.id)) return;
          processedMsgIdsRef.current.add(msg.id);
          newlyArrivedIdsRef.current.add(msg.id);

          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          setTimeout(() => scrollToBottom(true, false), 40);
        } else if (event.data?.type === 'DELETE_MESSAGE' && event.data.id) {
          processedMsgIdsRef.current.delete(event.data.id);
          setMessages(prev => prev.filter(m => m.id !== event.data.id));
        }
      };

      typingBc = new BroadcastChannel(`teamsync_typing_channel_${activeChannel}`);
      typingBcRef.current = typingBc;
      typingBc.onmessage = (event) => {
        if (event.data && event.data.channel === activeChannel) {
          handleTypingSignal(event.data);
        }
      };
    } catch {}

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (rtChannel && supabase) supabase.removeChannel(rtChannel);
      if (bc) bc.close();
      if (typingBc) {
        typingBc.close();
        typingBcRef.current = null;
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      notificationService.setForegroundState(false);
    };
  }, [handleTypingSignal, profile?.email, user?.email, activeChannel]);

  useEffect(() => {
    if (!loading) {
      scrollToBottom(false, true);
    }
  }, [loading, activeChannel]);

  const handleFileSelect = (e, fileTypeHint = 'document') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|avi|mkv)$/i.test(file.name);
    const isImage = file.type.startsWith('image/');
    const maxLimit = isVideo ? 50 * 1024 * 1024 : (isImage ? 10 * 1024 * 1024 : 25 * 1024 * 1024);

    if (file.size > maxLimit) {
      setError(`File is too large (Limit: ${Math.round(maxLimit / (1024 * 1024))}MB).`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (imageInputRef.current) imageInputRef.current.value = '';
      if (videoInputRef.current) videoInputRef.current.value = '';
      return;
    }

    setSelectedFile(file);
    setIsAttachMenuOpen(false);
    setError('');

    if (isImage) {
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
    } else if (isVideo) {
      setAttachmentPreview({
        url: URL.createObjectURL(file),
        name: file.name,
        size: file.size,
        type: 'video'
      });
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
    if (attachmentPreview?.url && attachmentPreview.url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(attachmentPreview.url);
      } catch {}
    }
    setSelectedFile(null);
    setAttachmentPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (imageInputRef.current) imageInputRef.current.value = '';
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  // Instant Optimistic Message Delivery (<0.1ms client-side perceived latency)
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if ((!inputValue.trim() && !selectedFile) || sending) return;

    const content = inputValue.trim();
    const fileToSend = selectedFile;

    broadcastTyping(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    setInputValue('');
    removeAttachment();
    setError('');
    setIsEmojiPickerOpen(false);

    const senderName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Team Member';
    const senderEmail = profile?.email || user?.email || '';
    const senderRole = profile?.role || 'MEMBER';
    const senderId = profile?.id || user?.id;

    // 1. Instant Optimistic UI insertion
    const optId = 'opt-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const optimisticMsg = {
      id: optId,
      content,
      sender_id: senderId,
      sender_name: senderName,
      sender_email: senderEmail,
      sender_role: senderRole,
      file_url: attachmentPreview?.url || null,
      file_name: fileToSend?.name || null,
      file_size: fileToSend?.size || null,
      file_type: fileToSend ? (fileToSend.type?.startsWith('image/') ? 'image' : 'document') : null,
      created_at: new Date().toISOString(),
      isOptimistic: true
    };

    newlyArrivedIdsRef.current.add(optId);
    setMessages(prev => [...prev, optimisticMsg]);
    setTimeout(() => scrollToBottom(true, true), 20);

    setSending(true);

    try {
      let attachmentData = null;
      if (fileToSend) {
        attachmentData = await chatApi.uploadAttachment(fileToSend);
      }

      const newMsg = await chatApi.sendMessage({
        content,
        senderId,
        senderName,
        senderEmail,
        senderRole,
        attachment: attachmentData,
        channel: activeChannel
      });

      newlyArrivedIdsRef.current.add(newMsg.id);
      setMessages(prev => prev.map(m => m.id === optId ? newMsg : m));
      processedMsgIdsRef.current.add(newMsg.id);

      try {
        const bc = new BroadcastChannel(`teamsync_chat_channel_${activeChannel}`);
        bc.postMessage({ type: 'NEW_MESSAGE', message: newMsg });
        bc.close();
      } catch {}
    } catch (err) {
      console.error('Error sending message:', err);
      setError(err.message || 'Failed to send message. Please try again.');
      setMessages(prev => prev.filter(m => m.id !== optId));
    } finally {
      setSending(false);
      setTimeout(() => scrollToBottom(true, false), 40);
    }
  };

  // WhatsApp-style Voice Note Sender
  const handleSendVoice = async (audioBlob, duration) => {
    setIsRecordingVoice(false);
    if (!audioBlob) return;

    const senderName = profile?.full_name || user?.user_metadata?.full_name || 'Team Member';
    const senderEmail = profile?.email || user?.email || '';
    const senderRole = profile?.role || 'MEMBER';
    const senderId = profile?.id || user?.id;

    const optId = 'opt-audio-' + Date.now();
    const tempAudioUrl = URL.createObjectURL(audioBlob);
    const optimisticMsg = {
      id: optId,
      content: 'Voice message',
      sender_id: senderId,
      sender_name: senderName,
      sender_email: senderEmail,
      sender_role: senderRole,
      file_url: tempAudioUrl,
      file_name: `Voice note (${Math.round(duration)}s)`,
      file_size: audioBlob.size,
      file_type: 'audio',
      created_at: new Date().toISOString(),
      isOptimistic: true
    };

    newlyArrivedIdsRef.current.add(optId);
    setMessages(prev => [...prev, optimisticMsg]);
    setTimeout(() => scrollToBottom(true, true), 20);

    try {
      const audioFile = new File([audioBlob], `voice_note_${Date.now()}.webm`, { type: 'audio/webm' });
      const attachmentData = await chatApi.uploadAttachment(audioFile);

      const newMsg = await chatApi.sendMessage({
        content: `Voice message (${Math.round(duration)}s)`,
        senderId,
        senderName,
        senderEmail,
        senderRole,
        attachment: attachmentData,
        channel: activeChannel
      });

      newlyArrivedIdsRef.current.add(newMsg.id);
      setMessages(prev => prev.map(m => m.id === optId ? newMsg : m));
      processedMsgIdsRef.current.add(newMsg.id);

      try {
        const bc = new BroadcastChannel(`teamsync_chat_channel_${activeChannel}`);
        bc.postMessage({ type: 'NEW_MESSAGE', message: newMsg });
        bc.close();
      } catch {}
    } catch (err) {
      console.error('Failed to send voice note:', err);
      setError('Failed to upload voice note.');
      setMessages(prev => prev.filter(m => m.id !== optId));
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

  const handleDeleteMessage = async (msgId) => {
    try {
      await chatApi.deleteMessage(msgId);
      setMessages(prev => prev.filter(m => m.id !== msgId));
      try {
        const bc = new BroadcastChannel(`teamsync_chat_channel_${activeChannel}`);
        bc.postMessage({ type: 'DELETE_MESSAGE', id: msgId });
        bc.close();
      } catch {}
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Determine current active chat title and info
  const isLeadershipActive = activeChannel === 'leadership';
  const currentChatTitle = isLeadershipActive ? 'Leadership Council' : 'Team Chat';
  const currentChatSubtitle = isLeadershipActive
    ? 'Restricted Executive Channel (Founder, Admin & Advisor)'
    : `Company HQ • All Members • ${onlineCount} online`;

  return (
    <div className="h-[calc(100vh-6.5rem)] flex bg-neutral-950 rounded-2xl md:rounded-3xl border border-neutral-800 overflow-hidden shadow-2xl relative transition-all duration-300">
      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.json,.zip"
        onChange={(e) => handleFileSelect(e, 'document')}
        className="hidden"
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => handleFileSelect(e, 'image')}
        className="hidden"
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        onChange={(e) => handleFileSelect(e, 'video')}
        className="hidden"
      />

      {/* ─────────────────────────────────────────────────────────────────────────
          LEFT PANE: WhatsApp Conversation & Channel Selector (Admin & Founder Only)
          ───────────────────────────────────────────────────────────────────────── */}
      {hasMultipleChannels && (
        <div
          className={`bg-black flex flex-col shrink-0 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isChatListOpen
              ? 'w-full md:w-80 opacity-100 translate-x-0 border-r border-neutral-800'
              : 'w-0 opacity-0 -translate-x-4 pointer-events-none border-r-0'
          } ${isMobileChatOpen ? 'hidden md:flex' : 'flex'}`}
        >
          <div className="w-full md:w-80 flex flex-col h-full shrink-0">
            {/* Top Header with Close / Hide Toggle Button */}
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-neutral-900 border border-neutral-750 flex items-center justify-center font-bold text-xs text-white shadow-sm">
                  {profile?.full_name?.charAt(0) || 'U'}
                </div>
                <div>
                  <h2 className="text-base font-bold text-white tracking-tight">Chats</h2>
                  <p className="text-[11px] text-neutral-400">Team & Leadership</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800/80 text-emerald-400">
                  {onlineCount} Online
                </span>
                <button
                  type="button"
                  onClick={() => setIsChatListOpen(false)}
                  className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition cursor-pointer"
                  title="Close / Hide Chats Panel"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Search Bar */}
            <div className="p-3 border-b border-neutral-800/80">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={chatSearchQuery}
                  onChange={(e) => setChatSearchQuery(e.target.value)}
                  placeholder="Search chats..."
                  className="w-full pl-8 pr-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-xl text-xs text-white placeholder:text-neutral-500 outline-none focus:border-neutral-700 transition"
                />
              </div>
            </div>

            {/* Channel / Conversation Items List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {/* 1. Team Chat (General) */}
              {canAccessGeneral && (!chatSearchQuery || 'team chat general company hq all members'.toLowerCase().includes(chatSearchQuery.toLowerCase())) && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveChannel('general');
                    setIsMobileChatOpen(true);
                  }}
                  className={`w-full p-3 rounded-2xl flex items-center gap-3 transition-all duration-200 text-left cursor-pointer ${
                    activeChannel === 'general'
                      ? 'bg-neutral-900 border border-neutral-700 text-white shadow-md'
                      : 'hover:bg-neutral-900/50 text-neutral-300 border border-transparent'
                  }`}
                >
                  <div className="w-11 h-11 rounded-2xl bg-emerald-950/60 border border-emerald-800/80 flex items-center justify-center text-emerald-400 shrink-0">
                    <Users className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white truncate">Team Chat</span>
                      <span className="text-[10px] text-emerald-400 font-medium">All Team</span>
                    </div>
                    <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                      Company HQ • All Members
                    </p>
                  </div>
                </button>
              )}

              {/* 2. Leadership Chat (Restricted - Founder, Admin, Founding Advisor) */}
              {canAccessLeadership && (!chatSearchQuery || 'leadership council chat executive founder admin advisor'.toLowerCase().includes(chatSearchQuery.toLowerCase())) && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveChannel('leadership');
                    setIsMobileChatOpen(true);
                  }}
                  className={`w-full p-3 rounded-2xl flex items-center gap-3 transition-all duration-200 text-left cursor-pointer ${
                    activeChannel === 'leadership'
                      ? 'bg-neutral-900 border border-amber-800/80 text-white shadow-md'
                      : 'hover:bg-neutral-900/50 text-neutral-300 border border-transparent'
                  }`}
                >
                  <div className="w-11 h-11 rounded-2xl bg-amber-950/60 border border-amber-800/80 flex items-center justify-center text-amber-400 shrink-0">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                        <span>Leadership Chat</span>
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                      Founder, Admin & Advisor
                    </p>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          RIGHT PANE: WhatsApp Conversation View
          ───────────────────────────────────────────────────────────────────────── */}
      <div
        className={`flex-1 flex flex-col min-w-0 bg-neutral-950 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          !isMobileChatOpen ? 'hidden md:flex' : 'flex'
        } ${isMobileClosing ? 'animate-mobile-chat-exit' : 'animate-mobile-chat-enter md:animate-none'}`}
      >
        {/* 1. WhatsApp Group Header */}
        <div className="px-4 md:px-5 py-3 bg-black border-b border-neutral-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            {/* Show / Open Chats List Button (When Hidden) */}
            {hasMultipleChannels && !isChatListOpen && (
              <button
                type="button"
                onClick={() => setIsChatListOpen(true)}
                className="p-1.5 -ml-1 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-900 border border-neutral-800 transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
                title="Show Chats List"
              >
                <PanelLeftOpen className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline text-[11px]">Chats</span>
              </button>
            )}

            {/* Mobile Back Button (Only for Admin & Founder who have conversation switcher) */}
            {hasMultipleChannels && isChatListOpen && (
              <button
                type="button"
                onClick={handleMobileBack}
                className="md:hidden p-1.5 -ml-1 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-900 transition cursor-pointer"
                title="Back to all chats"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}

            {/* Avatar Icon */}
            <div className="relative shrink-0">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-md overflow-hidden transition-colors duration-200 ${
                isLeadershipActive
                  ? 'bg-amber-950/80 border border-amber-800 text-amber-300'
                  : 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
              }`}>
                {isLeadershipActive ? <Shield className="w-5 h-5" /> : <Users className="w-5 h-5" />}
              </div>
              <span
                className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-black"
                title="Channel online"
              />
            </div>

            {/* Group Meta Info */}
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm md:text-base font-bold text-white tracking-tight truncate">
                  {currentChatTitle}
                </h2>
                {isLeadershipActive ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 border border-amber-800 text-amber-200 flex items-center gap-1 animate-fadeIn">
                    <Shield className="w-2.5 h-2.5 text-amber-400" />
                    #leadership
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-neutral-900 border border-neutral-800 text-neutral-300 animate-fadeIn">
                    #general
                  </span>
                )}
              </div>
              <p className="text-[11px] text-neutral-400 truncate">
                {currentChatSubtitle}
              </p>
            </div>
          </div>

          {/* Call Launcher Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleStartCall('video')}
              className="p-2 sm:px-3 sm:py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/80 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm hover:border-emerald-500/50 btn-emerald-smooth"
              title="Start Group Video Call"
            >
              <Video className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Video Call</span>
            </button>

            <button
              type="button"
              onClick={() => handleStartCall('voice')}
              className="p-2 sm:px-3 sm:py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/80 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm hover:border-emerald-500/50 btn-emerald-smooth"
              title="Start Group Voice Call"
            >
              <Phone className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Voice Call</span>
            </button>

            <button
              type="button"
              onClick={() => setIsHistoryModalOpen(true)}
              className="p-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/80 text-neutral-400 hover:text-white cursor-pointer shadow-sm btn-icon-smooth"
              title="View Call Logs"
            >
              <Clock className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. Active Call Banner */}
        {ongoingCall && !activeCallSession && ongoingCall.id !== dismissedCallId && (
          <div className="p-3 bg-neutral-900/90 border-b border-neutral-800 shrink-0 animate-fadeIn">
            <ActiveCallBanner
              call={ongoingCall}
              onJoin={handleJoinCall}
              onDismiss={() => setDismissedCallId(ongoingCall.id)}
            />
          </div>
        )}

        {/* 3. WhatsApp Message History Canvas */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 relative bg-[radial-gradient(#262626_1px,transparent_1px)] [background-size:16px_16px]"
        >
          {/* Infinite Scroll "Load Older Messages" Button */}
          {hasMoreOlder && (
            <div className="flex justify-center pb-2">
              <button
                type="button"
                onClick={loadOlderMessages}
                disabled={loadingOlder}
                className="px-3.5 py-1.5 rounded-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs font-semibold flex items-center gap-1.5 shadow-md transition cursor-pointer"
              >
                {loadingOlder ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Loading history...</span>
                  </>
                ) : (
                  <>
                    <Clock3 className="w-3.5 h-3.5" />
                    <span>Load older messages</span>
                  </>
                )}
              </button>
            </div>
          )}

          {loading ? (
            <div className="h-full flex items-center justify-center">
              <LoadingSpinner text="Loading messages..." />
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3 animate-fadeIn">
              <div className="w-14 h-14 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-500 shadow-inner">
                {isLeadershipActive ? <Shield className="w-7 h-7 text-amber-400/80" /> : <MessageSquare className="w-7 h-7 text-emerald-400/80" />}
              </div>
              <h3 className="text-base font-bold text-white">No Messages Yet</h3>
              <p className="text-xs text-neutral-400 max-w-sm">
                {isLeadershipActive
                  ? 'Start the confidential leadership briefing with Founder, Admins, and Founding Advisor.'
                  : 'Start the conversation with your team. Share updates, attachments, or voice notes.'}
              </p>
            </div>
          ) : (
            messages.map((msg, index) => {
              const myEmail = profile?.email?.toLowerCase() || user?.email?.toLowerCase();
              const isSelf = Boolean(
                (msg.sender_id && user && msg.sender_id === user.id) ||
                (msg.sender_email && myEmail && msg.sender_email.toLowerCase() === myEmail)
              );
              const isOnline = isUserOnline(msg.sender_email);
              const canDelete = isFounder || isSelf;
              const isNew = newlyArrivedIdsRef.current.has(msg.id) || Boolean(msg.isOptimistic);

              const prevMsg = index > 0 ? messages[index - 1] : null;
              const showDateDivider = index === 0 || isDifferentDay(prevMsg?.created_at, msg.created_at);
              const dayLabel = showDateDivider ? formatDayDividerLabel(msg.created_at) : null;

              return (
                <React.Fragment key={msg.id || `msg-${index}`}>
                  {showDateDivider && dayLabel && (
                    <div className="flex justify-center my-3 select-none">
                      <span className="px-3 py-1 rounded-lg bg-neutral-900 border border-neutral-800 text-[11px] font-semibold text-neutral-300 shadow-sm">
                        {dayLabel}
                      </span>
                    </div>
                  )}
                  <ChatMessageItem
                    msg={msg}
                    isSelf={isSelf}
                    isOnline={isOnline}
                    canDelete={canDelete}
                    onDelete={handleDeleteMessage}
                    isNew={isNew}
                  />
                </React.Fragment>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Attachment Upload Progress/Preview */}
        {attachmentPreview && (
          <div className="px-4 py-2 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between shrink-0 animate-fadeIn">
            <div className="flex items-center gap-3 overflow-hidden">
              {attachmentPreview.type === 'image' && attachmentPreview.url && (
                <img
                  src={attachmentPreview.url}
                  alt="Preview"
                  className="w-10 h-10 object-cover rounded-lg border border-neutral-700"
                />
              )}
              {attachmentPreview.type === 'video' && (
                <div className="w-10 h-10 bg-neutral-800 rounded-lg flex items-center justify-center text-white border border-neutral-700">
                  <Video className="w-5 h-5" />
                </div>
              )}
              {attachmentPreview.type === 'document' && (
                <div className="w-10 h-10 bg-neutral-800 rounded-lg flex items-center justify-center text-white border border-neutral-700">
                  <FileText className="w-5 h-5" />
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
              className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition cursor-pointer"
              title="Remove attachment"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Quick Emoji Picker Drawer */}
        {isEmojiPickerOpen && (
          <div ref={emojiPickerRef} className="p-3 bg-black border-t border-neutral-800 flex items-center gap-2 overflow-x-auto shrink-0 shadow-inner animate-dropdown">
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

        {/* WhatsApp-Style Input Bar */}
        <div className="p-3 sm:p-4 bg-black border-t border-neutral-800 shrink-0 relative">
          {error && (
            <div className="mb-2 text-xs text-red-400 px-3 flex items-center justify-between animate-fadeIn">
              <span>{error}</span>
              <button onClick={() => setError('')} className="underline cursor-pointer">
                Dismiss
              </button>
            </div>
          )}

          {/* Attachment Floating Menu */}
          {isAttachMenuOpen && (
            <div ref={attachMenuRef} className="absolute bottom-20 left-4 z-50 p-2 bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl flex flex-col gap-1.5 w-52 text-xs text-neutral-200 animate-dropdown">
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
                  <span className="text-[10px] text-neutral-400 block">PDF, DOCX, XLSX, TXT (25MB)</span>
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
                  <span className="text-[10px] text-neutral-400 block">PNG, JPG, WebP (10MB)</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                className="w-full px-3 py-2.5 rounded-xl hover:bg-neutral-800 text-left flex items-center gap-3 transition cursor-pointer"
              >
                <div className="w-7 h-7 rounded-lg bg-neutral-800 border border-neutral-600 flex items-center justify-center text-white">
                  <Video className="w-4 h-4 text-white" />
                </div>
                <div>
                  <span className="font-bold text-white block">Video File</span>
                  <span className="text-[10px] text-neutral-400 block">MP4, WebM, MOV (50MB)</span>
                </div>
              </button>
            </div>
          )}

          {/* Live Typing Indicator */}
          {Object.keys(typingUsers).length > 0 && (
            <div className="px-3 pb-2 text-xs text-emerald-400 flex items-center gap-2 animate-fadeIn font-medium">
              <div className="flex gap-1 items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.2s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.4s]" />
              </div>
              <span>
                {Object.values(typingUsers).map(u => u.name).join(', ')} {Object.keys(typingUsers).length > 1 ? 'are typing...' : 'is typing...'}
              </span>
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
                  <Plus className={`w-5 h-5 transition-transform duration-200 ${isAttachMenuOpen ? 'rotate-45 text-white' : ''}`} />
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
                  onChange={(e) => handleInputChange(e.target.value)}
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
                  className="w-11 h-11 rounded-full bg-white text-black hover:bg-neutral-200 disabled:opacity-50 flex items-center justify-center shadow-lg cursor-pointer shrink-0 btn-shimmer btn-primary-smooth"
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
                  className="w-11 h-11 rounded-full bg-neutral-900 border border-neutral-700 hover:border-emerald-500/60 hover:text-emerald-400 text-neutral-300 flex items-center justify-center cursor-pointer shrink-0 group shadow-md btn-icon-smooth"
                  title="Record voice message"
                >
                  <Mic className="w-5 h-5 group-hover:scale-110 transition-transform duration-200" />
                </button>
              )}
            </form>
          )}
        </div>
      </div>

      {/* Past Call History Modal */}
      <CallHistoryModal
        roomId={activeChannel}
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
      />
    </div>
  );
};

export default TeamChat;
