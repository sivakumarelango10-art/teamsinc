import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { usePresence } from '../../context/PresenceContext';
import { useCallNotification } from '../../context/CallNotificationContext';
import { chatApi } from '../../api/chatApi';
import { directChatApi } from '../../api/directChatApi';
import { callApi } from '../../api/callApi';
import { supabase } from '../../api/supabase';
import notificationService from '../../utils/notificationService';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import VoiceNotePlayer from '../../components/chat/VoiceNotePlayer';
import VoiceRecorderBar from '../../components/chat/VoiceRecorderBar';
import ChatMessageItem from '../../components/chat/ChatMessageItem';
import ActiveCallBanner from '../../components/call/ActiveCallBanner';
import CallHistoryModal from '../../components/call/CallHistoryModal';
import NewChatModal from '../../components/chat/NewChatModal';
import Avatar from '../../components/common/Avatar';
import { usersApi } from '../../api/usersApi';
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
  PanelLeftOpen,
  UserCheck,
  Award,
  Sparkles
} from 'lucide-react';
import { format, parseISO, isToday, isYesterday, isThisYear, isSameDay } from 'date-fns';

const QUICK_EMOJIS = ['😀', '😂', '😍', '👍', '🙏', '🎉', '🔥', '🚀', '❤️', '✅', '👏', '💯', '🎯', '💡', '✨', '🙌'];

// WhatsApp-style Date Divider Label (Today, Yesterday, September 1, 2026, 14/08/2025)
const formatDayDividerLabel = (isoString) => {
  if (!isoString) return '';
  try {
    const d = typeof isoString === 'string' ? parseISO(isoString) : new Date(isoString);
    if (isNaN(d.getTime())) return '';
    if (isToday(d)) return 'Today';
    if (isYesterday(d)) return 'Yesterday';
    if (isThisYear(d)) return format(d, 'MMMM d, yyyy');
    return format(d, 'dd/MM/yyyy');
  } catch {
    return '';
  }
};

const formatConversationTime = (isoString) => {
  if (!isoString) return '';
  try {
    const d = typeof isoString === 'string' ? parseISO(isoString) : new Date(isoString);
    if (isNaN(d.getTime())) return '';
    if (isToday(d)) return format(d, 'h:mm a');
    if (isYesterday(d)) return 'Yesterday';
    if (isThisYear(d)) return format(d, 'MMM d');
    return format(d, 'dd/MM/yy');
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, profile, isFounder, isAdmin, isFoundingAdvisor } = useAuth();
  const { isUserOnline, onlineCount } = usePresence();

  // All team users directory for avatar and profile enrichment
  const [usersList, setUsersList] = useState([]);
  useEffect(() => {
    usersApi.getUsers().then(list => setUsersList(list || [])).catch(() => {});
  }, []);

  const usersMap = useMemo(() => {
    const map = {};
    usersList.forEach(u => {
      if (u.id) map[u.id] = u;
      if (u.email) map[u.email.toLowerCase()] = u;
    });
    return map;
  }, [usersList]);

  // Role channel permissions (Founding Advisor can ONLY access Leadership chat)
  const isAdvisor = profile?.role === 'FOUNDING_ADVISOR' || Boolean(isFoundingAdvisor);
  const canAccessLeadership = isFounder || isAdmin || isAdvisor;
  const canAccessGeneral = !isAdvisor;

  // Chat Mode & Active Target
  // chatMode: 'channel' | 'direct'
  const [chatMode, setChatMode] = useState('channel');
  const defaultChannel = isAdvisor ? 'leadership' : (initialChannel || 'general');
  const [activeChannel, setActiveChannel] = useState(defaultChannel);
  const [activeDirectConv, setActiveDirectConv] = useState(null);

  // Direct conversations list & modal
  const [directConversations, setDirectConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);

  // Ensure Founding Advisor is locked away from general channel if in channel mode
  useEffect(() => {
    if (isAdvisor && chatMode === 'channel' && activeChannel !== 'leadership') {
      setActiveChannel('leadership');
    }
  }, [isAdvisor, chatMode, activeChannel]);

  // Chat sidebar collapse/hide state & Mobile animated state
  const [isChatListOpen, setIsChatListOpen] = useState(true);
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(true);
  const [isMobileClosing, setIsMobileClosing] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');

  // Messages & Composer State
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
  const directRealtimeChannelRef = useRef(null);
  const typingBcRef = useRef(null);

  // Stable refs so global-inbox handler can access volatile state without
  // being in the global-inbox effect's dependency array (prevents re-subscribe
  // on every chatMode/conversation/usersMap change).
  const chatModeRef = useRef(chatMode);
  const activeDirectConvRef = useRef(activeDirectConv);
  const usersMapRef = useRef(usersMap);
  // The callback is declared later in this component; initialize the ref safely, then sync it after declaration.
  const loadDirectConversationsRef = useRef(null);
  useEffect(() => { chatModeRef.current = chatMode; }, [chatMode]);
  useEffect(() => { activeDirectConvRef.current = activeDirectConv; }, [activeDirectConv]);
  useEffect(() => { usersMapRef.current = usersMap; }, [usersMap]);

  // Pagination & Smart Scroll State
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const processedMsgIdsRef = useRef(new Set());
  const newlyArrivedIdsRef = useRef(new Set());
  // Ignore out-of-order responses when users switch chats before a fetch completes.
  const loadMessagesRequestRef = useRef(0);

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

  // Close menus on outside click
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
  const isNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  }, []);

  const scrollToBottom = useCallback((smooth = true, force = false) => {
    requestAnimationFrame(() => {
      if (force || isNearBottom()) {
        messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
      }
    });
  }, [isNearBottom]);

  // Load Direct Conversations for Current User
  const loadDirectConversations = useCallback(async () => {
    if (!profile?.id) return;
    try {
      setLoadingConversations(true);
      const list = await directChatApi.getConversations(profile.id);
      // Enrich otherParticipant details with usersMap if missing full_name/avatar
      const enriched = list.map(c => {
        const enrichedOther = usersMap[c.otherParticipant?.id] || c.otherParticipant;
        return {
          ...c,
          otherParticipant: {
            ...c.otherParticipant,
            ...enrichedOther
          }
        };
      });
      setDirectConversations(enriched);
      return enriched;
    } catch (err) {
      console.error('Failed to load direct conversations:', err);
    } finally {
      setLoadingConversations(false);
    }
  }, [profile?.id, usersMap]);

  // Sync only after the callback's const binding has been initialized.
  useEffect(() => {
    loadDirectConversationsRef.current = loadDirectConversations;
  }, [loadDirectConversations]);

  useEffect(() => {
    loadDirectConversations();
  }, [loadDirectConversations]);

  // Handle URL query parameters (e.g. ?dm=userId or ?channel=leadership)
  useEffect(() => {
    const dmUserId = searchParams.get('dm');
    const channelParam = searchParams.get('channel');

    if (dmUserId && profile?.id && dmUserId !== profile.id && usersList.length > 0) {
      const targetUser = usersList.find(u => u.id === dmUserId);
      if (targetUser) {
        handleStartChatWithMember(targetUser);
      }
    } else if (channelParam) {
      if (channelParam === 'leadership' && canAccessLeadership) {
        setChatMode('channel');
        setActiveChannel('leadership');
        setActiveDirectConv(null);
      } else if (channelParam === 'general' && canAccessGeneral) {
        setChatMode('channel');
        setActiveChannel('general');
        setActiveDirectConv(null);
      }
    }
  }, [searchParams, profile?.id, usersList, canAccessLeadership, canAccessGeneral]);

  // Load Messages for Active Channel or Active Direct Conversation
  const loadMessages = useCallback(async () => {
    const requestId = ++loadMessagesRequestRef.current;
    try {
      setLoading(true);
      processedMsgIdsRef.current.clear();
      newlyArrivedIdsRef.current.clear();

      let list = [];
      if (chatMode === 'channel') {
        list = await chatApi.getMessages(50, null, activeChannel);
      } else if (chatMode === 'direct' && activeDirectConv) {
        list = await directChatApi.getMessages(activeDirectConv.id, { limit: 50 });
      }

      // A slower response for a previously selected chat must never replace
      // the messages for the conversation currently on screen.
      if (requestId !== loadMessagesRequestRef.current) return;

      if (chatMode === 'direct' && activeDirectConv && profile?.id) {
        await directChatApi.markAsRead(activeDirectConv.id, profile.id);
        if (requestId !== loadMessagesRequestRef.current) return;
        setDirectConversations(prev =>
          prev.map(c => c.id === activeDirectConv.id ? { ...c, unreadCount: 0 } : c)
        );
      }

      list.forEach(m => processedMsgIdsRef.current.add(m.id));
      setMessages(list);
      setHasMoreOlder(list.length >= 50);
    } catch (err) {
      if (requestId === loadMessagesRequestRef.current) {
        console.error('Failed to load chat messages:', err);
      }
    } finally {
      if (requestId === loadMessagesRequestRef.current) {
        setLoading(false);
      }
    }
  }, [chatMode, activeChannel, activeDirectConv?.id, profile?.id]);

  const loadOlderMessages = async () => {
    if (loadingOlder || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const oldestDate = messages[0]?.created_at;
      let olderList = [];

      if (chatMode === 'channel') {
        olderList = await chatApi.getMessages(50, oldestDate, activeChannel);
      } else if (chatMode === 'direct' && activeDirectConv) {
        olderList = await directChatApi.getMessages(activeDirectConv.id, { limit: 50, before: oldestDate });
      }

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
      mode: chatMode,
      targetId: chatMode === 'channel' ? activeChannel : activeDirectConv?.id
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
  }, [profile, user, chatMode, activeChannel, activeDirectConv?.id]);

  const handleTypingSignal = useCallback((payload) => {
    if (!payload?.email) return;
    const myEmail = profile?.email?.toLowerCase() || user?.email?.toLowerCase();
    if (payload.email.toLowerCase() === myEmail) return;

    const currentTarget = chatMode === 'channel' ? activeChannel : activeDirectConv?.id;
    if (payload.targetId !== currentTarget) return;

    setTypingUsers(prev => {
      const updated = { ...prev };
      if (payload.isTyping) {
        updated[payload.email] = { name: payload.name, time: Date.now() };
      } else {
        delete updated[payload.email];
      }
      return updated;
    });
  }, [profile?.email, user?.email, chatMode, activeChannel, activeDirectConv?.id]);

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

  // Mobile Back button smooth close handler
  const handleMobileBack = () => {
    setIsMobileClosing(true);
    setTimeout(() => {
      setIsMobileChatOpen(false);
      setIsMobileClosing(false);
    }, 200);
  };

  // Channel & Conversation Switchers
  const handleSelectChannel = (channelId) => {
    setChatMode('channel');
    setActiveChannel(channelId);
    setActiveDirectConv(null);
    setIsMobileChatOpen(true);
    setInputValue('');
    setError('');
    removeAttachment();
    setSearchParams(channelId === 'leadership' ? { channel: 'leadership' } : {});
  };

  const handleSelectDirectConversation = async (conv) => {
    setChatMode('direct');
    setActiveDirectConv(conv);
    setIsMobileChatOpen(true);
    setInputValue('');
    setError('');
    removeAttachment();
    if (conv.otherParticipant?.id) {
      setSearchParams({ dm: conv.otherParticipant.id });
    }

    if (profile?.id) {
      await directChatApi.markAsRead(conv.id, profile.id);
      setDirectConversations(prev =>
        prev.map(c => c.id === conv.id ? { ...c, unreadCount: 0 } : c)
      );
    }
  };

  const handleStartChatWithMember = async (member) => {
    if (!profile?.id || !member?.id) return;
    try {
      setLoading(true);
      const conv = await directChatApi.getOrCreateConversation(profile.id, member.id);
      const formattedConv = {
        ...conv,
        otherParticipant: {
          ...conv.otherParticipant,
          ...member
        }
      };

      setDirectConversations(prev => {
        const existingIdx = prev.findIndex(c => c.id === conv.id);
        if (existingIdx !== -1) {
          const updated = [...prev];
          updated[existingIdx] = formattedConv;
          return updated;
        }
        return [formattedConv, ...prev];
      });

      await handleSelectDirectConversation(formattedConv);
    } catch (err) {
      console.error('Failed to open direct conversation:', err);
      setError('Unable to open direct chat. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Real-time Subscriptions (Channel + Direct Messages)
  useEffect(() => {
    notificationService.setForegroundState(true);

    const handleVisibilityChange = () => {
      notificationService.setForegroundState(!document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    loadMessages();

    let rtChannel = null;
    let directRtChannel = null;
    let bc = null;
    let typingBc = null;

    if (supabase) {
      // 1. Channel Realtime Subscription (when in channel mode)
      if (chatMode === 'channel') {
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
                  const optIndex = prev.findIndex(
                    m => m.isOptimistic && m.sender_id === newMsg.sender_id && m.content === newMsg.content
                  );
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
            if (payload?.targetId === activeChannel) {
              handleTypingSignal(payload);
            }
          })
          .subscribe();

        realtimeChannelRef.current = rtChannel;

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
            }
          };

          typingBc = new BroadcastChannel(`teamsync_typing_channel_${activeChannel}`);
          typingBcRef.current = typingBc;
          typingBc.onmessage = (event) => {
            if (event.data && event.data.targetId === activeChannel) {
              handleTypingSignal(event.data);
            }
          };
        } catch {}
      }

      // 2. Direct Messages Realtime Subscription
      if (chatMode === 'direct' && activeDirectConv) {
        directRtChannel = supabase
          .channel(`realtime-direct-${activeDirectConv.id}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'direct_messages',
              filter: `conversation_id=eq.${activeDirectConv.id}`
            },
            async (payload) => {
              if (payload.new) {
                const newMsg = payload.new;
                if (processedMsgIdsRef.current.has(newMsg.id)) return;
                processedMsgIdsRef.current.add(newMsg.id);
                newlyArrivedIdsRef.current.add(newMsg.id);

                setMessages(prev => {
                  const optIndex = prev.findIndex(
                    m => m.isOptimistic && m.sender_id === newMsg.sender_id && m.content === newMsg.content
                  );
                  if (optIndex !== -1) {
                    const updated = [...prev];
                    updated[optIndex] = newMsg;
                    return updated;
                  }
                  return [...prev, newMsg];
                });
                setTimeout(() => scrollToBottom(true, false), 40);

                // Auto-mark as read if we are the recipient
                if (profile?.id && newMsg.recipient_id === profile.id) {
                  await directChatApi.markAsRead(activeDirectConv.id, profile.id);
                }

                // Update conversation list preview
                setDirectConversations(prev =>
                  prev.map(c =>
                    c.id === activeDirectConv.id
                      ? {
                          ...c,
                          lastMessageAt: newMsg.created_at,
                          lastMessagePreview: newMsg.content || newMsg.file_name || 'Attachment'
                        }
                      : c
                  )
                );
              }
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'direct_messages',
              filter: `conversation_id=eq.${activeDirectConv.id}`
            },
            (payload) => {
              if (payload.new) {
                const updatedMsg = payload.new;
                setMessages(prev =>
                  prev.map(m => (m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m))
                );
              }
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'DELETE',
              schema: 'public',
              table: 'direct_messages',
              filter: `conversation_id=eq.${activeDirectConv.id}`
            },
            (payload) => {
              if (payload.old?.id) {
                processedMsgIdsRef.current.delete(payload.old.id);
                setMessages(prev => prev.filter(m => m.id !== payload.old.id));
              }
            }
          )
          .on('broadcast', { event: 'typing' }, ({ payload }) => {
            if (payload?.targetId === activeDirectConv.id) {
              handleTypingSignal(payload);
            }
          })
          .subscribe();

        realtimeChannelRef.current = directRtChannel;

        try {
          typingBc = new BroadcastChannel(`teamsync_typing_dm_${activeDirectConv.id}`);
          typingBcRef.current = typingBc;
          typingBc.onmessage = (event) => {
            if (event.data && event.data.targetId === activeDirectConv.id) {
              handleTypingSignal(event.data);
            }
          };
        } catch {}
      }

    }

    // DirectChat cross-tab synchronization
    const unsubBroadcast = directChatApi.onBroadcastEvent((data) => {
      if (data.type === 'MESSAGE_SENT' && data.payload) {
        const msg = data.payload;
        if (chatMode === 'direct' && activeDirectConv?.id === msg.conversation_id) {
          if (!processedMsgIdsRef.current.has(msg.id)) {
            processedMsgIdsRef.current.add(msg.id);
            setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
            setTimeout(() => scrollToBottom(true, false), 40);
          }
        }
      } else if (data.type === 'MESSAGES_READ' && data.payload) {
        if (chatMode === 'direct' && activeDirectConv?.id === data.payload.conversationId) {
          setMessages(prev => prev.map(m => ({ ...m, is_read: true })));
        }
      } else if (data.type === 'CONVERSATION_CREATED') {
        loadDirectConversations();
      }
    });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (rtChannel && supabase) supabase.removeChannel(rtChannel);
      if (directRtChannel && supabase) supabase.removeChannel(directRtChannel);
      if (bc) bc.close();
      if (typingBc) {
        typingBc.close();
        typingBcRef.current = null;
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      unsubBroadcast();
      notificationService.setForegroundState(false);
    };
  }, [
    chatMode,
    activeChannel,
    activeDirectConv?.id,
    profile?.id,
    handleTypingSignal,
    loadMessages,
    scrollToBottom
  ]);

  // ── Global Direct Inbox Subscription ────────────────────────────────────────
  // IMPORTANT: This effect is intentionally isolated from the main subscription
  // effect above. It must only re-run when `profile?.id` changes (i.e. user
  // switches accounts or signs in/out).
  //
  // Root cause of the production error
  // ────────────────────────────────────
  // supabase.channel(name) is DEDUPLICATED: calling it a second time with the
  // same topic returns the EXISTING already-subscribed instance. If any part of
  // the code then calls .on('postgres_changes', …) on that already-joined
  // channel, the SDK throws:
  //   "cannot add 'postgres_changes' callbacks after 'subscribe'"
  //
  // Previously this channel was created inside the big subscription effect whose
  // dependencies included chatMode, activeDirectConv?.id, usersMap, and
  // loadDirectConversations. Every time the user switched conversations (or the
  // users map re-loaded), the effect re-ran: the cleanup removed rtChannel and
  // directRtChannel but NOT globalDirectChannel, so the next run found the
  // already-subscribed instance and tried to add a new postgres_changes listener
  // to it → crash.
  //
  // Fix: separate this channel into its own effect keyed ONLY on profile?.id.
  // All volatile state (chatMode, activeDirectConv, usersMap, …) is read through
  // stable refs so the handler stays current without forcing a re-subscribe.
  useEffect(() => {
    if (!supabase || !profile?.id) return;

    const userId = profile.id;
    const topic = `global-direct-inbox-${userId}`;

    // Ensure no stale channel with this topic is left in the SDK's registry
    // before we create a fresh one.  supabase.channel() would return the old
    // instance if we didn't remove it first.
    const stale = supabase.getChannels().find(c => c.topic === `realtime:${topic}`);
    if (stale) {
      supabase.removeChannel(stale);
    }

    const globalDirectChannel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages'
        },
        (payload) => {
          if (!payload.new) return;
          const msg = payload.new;
          // Only act on messages addressed to the currently authenticated user
          if (msg.recipient_id !== userId) return;

          // Read volatile state through refs — no extra effect dependencies needed
          const currentChatMode = chatModeRef.current;
          const currentActiveDirectConv = activeDirectConvRef.current;
          const currentUsersMap = usersMapRef.current;
          const currentLoadDirectConversations = loadDirectConversationsRef.current;

          // Only notify when the message belongs to a conversation not currently open
          if (currentChatMode !== 'direct' || currentActiveDirectConv?.id !== msg.conversation_id) {
            setDirectConversations(prev => {
              const exists = prev.some(c => c.id === msg.conversation_id);
              if (!exists) {
                currentLoadDirectConversations?.();
                return prev;
              }
              return prev.map(c =>
                c.id === msg.conversation_id
                  ? {
                      ...c,
                      lastMessageAt: msg.created_at,
                      lastMessagePreview: msg.content || msg.file_name || 'Attachment',
                      unreadCount: (c.unreadCount || 0) + 1
                    }
                  : c
              );
            });

            // System notification via the notification service
            const senderInfo = currentUsersMap[msg.sender_id];
            notificationService.notifyChatMessage({
              senderName: senderInfo?.full_name || 'Team Member',
              content: msg.content || msg.file_name || 'Sent you a private message',
              currentPath: window.location.pathname,
              messageId: msg.id
            });
          }
        }
      )
      .subscribe((status, err) => {
        if (err) {
          console.warn('[GlobalInbox] Subscription error:', err);
        }
      });

    return () => {
      if (supabase) {
        supabase.removeChannel(globalDirectChannel);
      }
    };
  }, [profile?.id]); // ← only re-subscribe when authenticated user changes

  useEffect(() => {
    if (!loading) {
      scrollToBottom(false, true);
    }
  }, [loading, chatMode, activeChannel, activeDirectConv?.id, scrollToBottom]);

  // File Upload Handlers
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

  // Instant Message Delivery with Optimistic UI
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

    // Optimistic UI insertion
    const optId = 'opt-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const optimisticMsg = {
      id: optId,
      content,
      sender_id: senderId,
      sender_name: senderName,
      sender_email: senderEmail,
      sender_role: senderRole,
      recipient_id: chatMode === 'direct' ? activeDirectConv?.otherParticipant?.id : null,
      file_url: attachmentPreview?.url || null,
      file_name: fileToSend?.name || null,
      file_size: fileToSend?.size || null,
      file_type: fileToSend ? (fileToSend.type?.startsWith('image/') ? 'image' : 'document') : null,
      created_at: new Date().toISOString(),
      isOptimistic: true,
      is_read: false
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

      let newMsg = null;
      if (chatMode === 'channel') {
        newMsg = await chatApi.sendMessage({
          content,
          senderId,
          senderName,
          senderEmail,
          senderRole,
          attachment: attachmentData,
          channel: activeChannel
        });

        try {
          const bc = new BroadcastChannel(`teamsync_chat_channel_${activeChannel}`);
          bc.postMessage({ type: 'NEW_MESSAGE', message: newMsg });
          bc.close();
        } catch {}
      } else if (chatMode === 'direct' && activeDirectConv) {
        newMsg = await directChatApi.sendMessage({
          conversationId: activeDirectConv.id,
          senderId: profile.id,
          recipientId: activeDirectConv.otherParticipant.id,
          content,
          attachment: attachmentData
        });

        // Update direct conversation preview in sidebar
        setDirectConversations(prev =>
          prev.map(c =>
            c.id === activeDirectConv.id
              ? {
                  ...c,
                  lastMessageAt: newMsg.created_at,
                  lastMessagePreview: newMsg.content || newMsg.file_name || 'Attachment'
                }
              : c
          )
        );
      }

      if (newMsg) {
        newlyArrivedIdsRef.current.add(newMsg.id);
        setMessages(prev => prev.map(m => m.id === optId ? newMsg : m));
        processedMsgIdsRef.current.add(newMsg.id);
      }
    } catch (err) {
      console.error('Error sending message:', err);
      setError(err.message || 'Failed to send message. Please try again.');
      setMessages(prev => prev.filter(m => m.id !== optId));
    } finally {
      setSending(false);
      setTimeout(() => scrollToBottom(true, false), 40);
    }
  };

  // Voice Note Sender
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
      recipient_id: chatMode === 'direct' ? activeDirectConv?.otherParticipant?.id : null,
      file_url: tempAudioUrl,
      file_name: `Voice note (${Math.round(duration)}s)`,
      file_size: audioBlob.size,
      file_type: 'audio',
      created_at: new Date().toISOString(),
      isOptimistic: true,
      is_read: false
    };

    newlyArrivedIdsRef.current.add(optId);
    setMessages(prev => [...prev, optimisticMsg]);
    setTimeout(() => scrollToBottom(true, true), 20);

    try {
      const audioFile = new File([audioBlob], `voice_note_${Date.now()}.webm`, { type: 'audio/webm' });
      const attachmentData = await chatApi.uploadAttachment(audioFile);

      let newMsg = null;
      if (chatMode === 'channel') {
        newMsg = await chatApi.sendMessage({
          content: `Voice message (${Math.round(duration)}s)`,
          senderId,
          senderName,
          senderEmail,
          senderRole,
          attachment: attachmentData,
          channel: activeChannel
        });

        try {
          const bc = new BroadcastChannel(`teamsync_chat_channel_${activeChannel}`);
          bc.postMessage({ type: 'NEW_MESSAGE', message: newMsg });
          bc.close();
        } catch {}
      } else if (chatMode === 'direct' && activeDirectConv) {
        newMsg = await directChatApi.sendMessage({
          conversationId: activeDirectConv.id,
          senderId: profile.id,
          recipientId: activeDirectConv.otherParticipant.id,
          content: `Voice message (${Math.round(duration)}s)`,
          attachment: attachmentData
        });

        setDirectConversations(prev =>
          prev.map(c =>
            c.id === activeDirectConv.id
              ? {
                  ...c,
                  lastMessageAt: newMsg.created_at,
                  lastMessagePreview: 'Voice note'
                }
              : c
          )
        );
      }

      if (newMsg) {
        newlyArrivedIdsRef.current.add(newMsg.id);
        setMessages(prev => prev.map(m => m.id === optId ? newMsg : m));
        processedMsgIdsRef.current.add(newMsg.id);
      }
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

  const handleDeleteMessage = useCallback(async (msgId) => {
    try {
      if (chatMode === 'channel') {
        await chatApi.deleteMessage(msgId);
        setMessages(prev => prev.filter(m => m.id !== msgId));
        try {
          const bc = new BroadcastChannel(`teamsync_chat_channel_${activeChannel}`);
          bc.postMessage({ type: 'DELETE_MESSAGE', id: msgId });
          bc.close();
        } catch {}
      } else if (chatMode === 'direct') {
        await directChatApi.deleteMessage(msgId, profile?.id);
        setMessages(prev => prev.filter(m => m.id !== msgId));
      }
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  }, [chatMode, activeChannel, profile?.id]);

  const handleStartCall = async (callType = 'video') => {
    try {
      const roomId = chatMode === 'direct'
        ? `dm_${activeDirectConv.id}`
        : activeChannel;

      // If call is already active in this room, join session
      if (ongoingCall && ongoingCall.room_id === roomId && ongoingCall.status === 'ongoing') {
        acceptCall(ongoingCall);
        return;
      }

      const roomTitle = chatMode === 'direct'
        ? `Call with ${activeDirectConv.otherParticipant.full_name}`
        : (activeChannel === 'leadership' ? 'Leadership Council' : (initialTitle || 'Team Chat'));

      await startCall(callType, roomId, roomTitle);
    } catch (err) {
      console.error('Error starting call:', err);
      setError(err.message || 'Failed to start call. Please try again.');
    }
  };

  const handleJoinCall = (call) => {
    acceptCall(call || ongoingCall);
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Filtered direct conversations
  const filteredDirectConversations = useMemo(() => {
    const q = chatSearchQuery.trim().toLowerCase();
    if (!q) return directConversations;
    return directConversations.filter(c => {
      const name = (c.otherParticipant?.full_name || '').toLowerCase();
      const email = (c.otherParticipant?.email || '').toLowerCase();
      const preview = (c.lastMessagePreview || '').toLowerCase();
      return name.includes(q) || email.includes(q) || preview.includes(q);
    });
  }, [directConversations, chatSearchQuery]);

  // Active Chat Titles & Presence
  const isDirectMode = chatMode === 'direct' && Boolean(activeDirectConv);
  const isLeadershipActive = !isDirectMode && activeChannel === 'leadership';

  const otherPerson = activeDirectConv?.otherParticipant;
  const isOtherOnline = otherPerson ? (isUserOnline(otherPerson.id) || isUserOnline(otherPerson.email)) : false;

  const currentChatTitle = isDirectMode
    ? (otherPerson?.full_name || 'Team Member')
    : (isLeadershipActive ? 'Leadership Council' : 'Team Chat');

  const currentChatSubtitle = isDirectMode
    ? (isOtherOnline ? 'Active Now • Online' : 'Offline')
    : (isLeadershipActive ? '' : `Company HQ • All Members • ${onlineCount} online`);

  const getRoleBadge = (role) => {
    switch (role) {
      case 'FOUNDER':
        return 'bg-amber-950/80 text-amber-300 border-amber-800';
      case 'ADMIN':
        return 'bg-blue-950/80 text-blue-300 border-blue-800';
      case 'FOUNDING_ADVISOR':
        return 'bg-purple-950/80 text-purple-300 border-purple-800';
      default:
        return 'bg-neutral-800 text-neutral-300 border-neutral-700';
    }
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'FOUNDER':
        return 'Founder';
      case 'ADMIN':
        return 'Admin';
      case 'FOUNDING_ADVISOR':
        return 'Advisor';
      default:
        return 'Member';
    }
  };

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
          LEFT PANE: WhatsApp Conversation & Channel Selector (Available to ALL members)
          ───────────────────────────────────────────────────────────────────────── */}
      <div
        className={`bg-black flex flex-col shrink-0 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isChatListOpen
            ? 'w-full md:w-80 opacity-100 translate-x-0 border-r border-neutral-800'
            : 'w-0 opacity-0 -translate-x-4 pointer-events-none border-r-0'
        } ${isMobileChatOpen ? 'hidden md:flex' : 'flex'}`}
      >
        <div className="w-full md:w-80 flex flex-col h-full shrink-0">
          {/* Top Header with Close / Hide Toggle Button & New Chat Action */}
          <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar
                src={profile?.avatar_url}
                name={profile?.full_name}
                size="md"
                rounded="rounded-2xl"
              />
              <div className="min-w-0">
                <h2 className="text-base font-bold text-white tracking-tight truncate">Chats</h2>
                <p className="text-[11px] text-neutral-400 truncate">Channels & Direct Messages</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsNewChatModalOpen(true)}
                className="p-1.5 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30 transition cursor-pointer flex items-center gap-1 text-xs font-semibold"
                title="Start New Direct Message"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline text-[11px]">New</span>
              </button>

              <button
                type="button"
                onClick={() => setIsChatListOpen(false)}
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition cursor-pointer hidden md:flex"
                title="Hide Chats Panel"
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
                placeholder="Search chats and contacts..."
                className="w-full pl-8 pr-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-xl text-xs text-white placeholder:text-neutral-500 outline-none focus:border-neutral-700 transition"
              />
            </div>
          </div>

          {/* Channel / Conversation Items List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-3">
            {/* 1. CHANNELS SECTION */}
            <div className="space-y-1">
              <div className="px-3 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                Channels
              </div>

              {/* Team Chat (General) */}
              {canAccessGeneral && (!chatSearchQuery || 'team chat general company hq all members'.toLowerCase().includes(chatSearchQuery.toLowerCase())) && (
                <button
                  type="button"
                  onClick={() => handleSelectChannel('general')}
                  className={`w-full p-2.5 rounded-2xl flex items-center gap-3 transition-all duration-200 text-left cursor-pointer ${
                    chatMode === 'channel' && activeChannel === 'general'
                      ? 'bg-neutral-900 border border-neutral-700 text-white shadow-md'
                      : 'hover:bg-neutral-900/50 text-neutral-300 border border-transparent'
                  }`}
                >
                  <div className="w-10 h-10 rounded-2xl bg-emerald-950/60 border border-emerald-800/80 flex items-center justify-center text-emerald-400 shrink-0">
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

              {/* Leadership Chat (Founder, Admin, Founding Advisor) */}
              {canAccessLeadership && (!chatSearchQuery || 'leadership council chat executive founder admin advisor'.toLowerCase().includes(chatSearchQuery.toLowerCase())) && (
                <button
                  type="button"
                  onClick={() => handleSelectChannel('leadership')}
                  className={`w-full p-2.5 rounded-2xl flex items-center gap-3 transition-all duration-200 text-left cursor-pointer ${
                    chatMode === 'channel' && activeChannel === 'leadership'
                      ? 'bg-neutral-900 border border-amber-800/80 text-white shadow-md'
                      : 'hover:bg-neutral-900/50 text-neutral-300 border border-transparent'
                  }`}
                >
                  <div className="w-10 h-10 rounded-2xl bg-amber-950/60 border border-amber-800/80 flex items-center justify-center text-amber-400 shrink-0">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-bold text-white truncate">Leadership Chat</span>
                  </div>
                </button>
              )}
            </div>

            {/* 2. DIRECT MESSAGES SECTION */}
            <div className="space-y-1">
              <div className="flex items-center justify-between px-3 pt-2 pb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                  Direct Messages {directConversations.length > 0 && `(${directConversations.length})`}
                </span>
                <button
                  type="button"
                  onClick={() => setIsNewChatModalOpen(true)}
                  className="text-[10px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 transition cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>New Chat</span>
                </button>
              </div>

              {filteredDirectConversations.length === 0 ? (
                <div className="p-4 rounded-xl bg-neutral-900/30 border border-neutral-800/60 text-center space-y-2 my-1">
                  <MessageSquare className="w-5 h-5 mx-auto text-neutral-600" />
                  <p className="text-[11px] text-neutral-400">
                    {chatSearchQuery ? 'No matching conversations' : 'No direct messages yet'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsNewChatModalOpen(true)}
                    className="px-3 py-1 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 text-[11px] font-semibold border border-blue-500/30 transition cursor-pointer"
                  >
                    Start a conversation
                  </button>
                </div>
              ) : (
                filteredDirectConversations.map((conv) => {
                  const other = conv.otherParticipant;
                  const isOnline = other ? (isUserOnline(other.id) || isUserOnline(other.email)) : false;
                  const isSelected = chatMode === 'direct' && activeDirectConv?.id === conv.id;

                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => handleSelectDirectConversation(conv)}
                      className={`w-full p-2.5 rounded-2xl flex items-center gap-3 transition-all duration-200 text-left cursor-pointer group ${
                        isSelected
                          ? 'bg-neutral-900 border border-blue-500/50 text-white shadow-md'
                          : 'hover:bg-neutral-900/50 text-neutral-300 border border-transparent'
                      }`}
                    >
                      <Avatar
                        src={other?.avatar_url}
                        name={other?.full_name}
                        size="md"
                        rounded="rounded-2xl"
                        showStatus={true}
                        status={isOnline ? 'online' : 'offline'}
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-white truncate group-hover:text-blue-400 transition">
                            {other?.full_name || 'Team Member'}
                          </span>
                          <span className="text-[10px] text-neutral-500 shrink-0 font-mono">
                            {formatConversationTime(conv.lastMessageAt)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <p className="text-[11px] text-neutral-400 truncate">
                            {conv.lastMessagePreview || 'Started conversation'}
                          </p>
                          {conv.unreadCount > 0 && (
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-blue-600 text-white shrink-0 shadow-sm animate-pulse">
                              {conv.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          RIGHT PANE: WhatsApp Conversation View (Channels & Direct Messages)
          ───────────────────────────────────────────────────────────────────────── */}
      <div
        className={`flex-1 flex flex-col min-w-0 bg-neutral-950 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          !isMobileChatOpen ? 'hidden md:flex' : 'flex'
        } ${isMobileClosing ? 'animate-mobile-chat-exit' : 'animate-mobile-chat-enter md:animate-none'}`}
      >
        {/* 1. Header Bar */}
        <div className="px-4 md:px-5 py-3 bg-black border-b border-neutral-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            {/* Show / Open Chats List Button (When Hidden) */}
            {!isChatListOpen && (
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

            {/* Mobile Back Button */}
            <button
              type="button"
              onClick={handleMobileBack}
              className="md:hidden p-1.5 -ml-1 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-900 transition cursor-pointer"
              title="Back to all chats"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* Avatar Icon */}
            {isDirectMode ? (
              <Avatar
                src={otherPerson?.avatar_url}
                name={otherPerson?.full_name}
                size="md"
                rounded="rounded-xl"
                showStatus={true}
                status={isOtherOnline ? 'online' : 'offline'}
              />
            ) : (
              <div className="relative shrink-0">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-md overflow-hidden transition-colors duration-200 ${
                    isLeadershipActive
                      ? 'bg-amber-950/80 border border-amber-800 text-amber-300'
                      : 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
                  }`}
                >
                  {isLeadershipActive ? <Shield className="w-5 h-5" /> : <Users className="w-5 h-5" />}
                </div>
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-black"
                  title="Channel online"
                />
              </div>
            )}

            {/* Group / Direct Meta Info */}
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm md:text-base font-bold text-white tracking-tight truncate">
                  {currentChatTitle}
                </h2>
                {isDirectMode ? (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${getRoleBadge(
                      otherPerson?.role
                    )}`}
                  >
                    {getRoleLabel(otherPerson?.role)}
                  </span>
                ) : !isLeadershipActive ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-neutral-900 border border-neutral-800 text-neutral-300 animate-fadeIn">
                    #general
                  </span>
                )}
              </div>
              {currentChatSubtitle && (
                <p className="text-[11px] text-neutral-400 truncate">
                  {currentChatSubtitle}
                </p>
              )}
            </div>
          </div>

          {/* Call Launcher Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleStartCall('video')}
              className="p-2 sm:px-3 sm:py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/80 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm hover:border-emerald-500/50 btn-emerald-smooth"
              title={isDirectMode ? 'Start 1-to-1 Video Call' : 'Start Group Video Call'}
            >
              <Video className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Video Call</span>
            </button>

            <button
              type="button"
              onClick={() => handleStartCall('voice')}
              className="p-2 sm:px-3 sm:py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/80 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm hover:border-emerald-500/50 btn-emerald-smooth"
              title={isDirectMode ? 'Start 1-to-1 Voice Call' : 'Start Group Voice Call'}
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
                {isDirectMode ? (
                  <MessageSquare className="w-7 h-7 text-blue-400/80" />
                ) : isLeadershipActive ? (
                  <Shield className="w-7 h-7 text-amber-400/80" />
                ) : (
                  <MessageSquare className="w-7 h-7 text-emerald-400/80" />
                )}
              </div>
              <h3 className="text-base font-bold text-white">
                {isDirectMode
                  ? `Private Conversation with ${otherPerson?.full_name || 'Member'}`
                  : 'No Messages Yet'}
              </h3>
              <p className="text-xs text-neutral-400 max-w-sm">
                {isDirectMode
                  ? `This is the direct, end-to-end private conversation between you and ${otherPerson?.full_name || 'this member'}. Messages sent here are strictly confidential.`
                  : isLeadershipActive
                  ? 'Start the leadership conversation.'
                  : 'Start the conversation with your team. Share updates, attachments, or voice notes.'}
              </p>
            </div>
          ) : (
            messages.map((msg, index) => {
              const myEmail = profile?.email?.toLowerCase() || user?.email?.toLowerCase();
              const myId = profile?.id || user?.id;

              const isSelf = Boolean(
                (msg.sender_id && myId && msg.sender_id === myId) ||
                (msg.sender_email && myEmail && msg.sender_email.toLowerCase() === myEmail)
              );

              const senderOnline = msg.sender_id
                ? (isUserOnline(msg.sender_id) || isUserOnline(msg.sender_email))
                : false;

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
                    msg={(() => {
                      const senderAvatar =
                        msg.sender_avatar_url ||
                        msg.sender?.avatar_url ||
                        usersMap[msg.sender_id]?.avatar_url ||
                        usersMap[msg.sender_email?.toLowerCase()]?.avatar_url;
                      return senderAvatar && !msg.sender_avatar_url
                        ? { ...msg, sender_avatar_url: senderAvatar }
                        : msg;
                    })()}
                    isSelf={isSelf}
                    isOnline={senderOnline}
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
                  placeholder={
                    isDirectMode
                      ? `Message ${otherPerson?.full_name?.split(' ')[0] || 'member'} privately...`
                      : 'Type a message...'
                  }
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

      {/* New Direct Message Member Picker Modal */}
      <NewChatModal
        isOpen={isNewChatModalOpen}
        onClose={() => setIsNewChatModalOpen(false)}
        onSelectMember={handleStartChatWithMember}
        members={usersList}
        currentUserId={profile?.id}
      />

      {/* Past Call History Modal */}
      <CallHistoryModal
        roomId={chatMode === 'direct' ? `dm_${activeDirectConv?.id}` : activeChannel}
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
      />
    </div>
  );
};

export default TeamChat;
