import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { usePresence } from '../../context/PresenceContext';
import { chatApi } from '../../api/chatApi';
import { supabase } from '../../api/supabase';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import BrandLogo from '../../components/common/BrandLogo';
import {
  Send,
  MessageSquare,
  Shield,
  ShieldAlert,
  User,
  Trash2,
  Users,
  CheckCheck,
  Smile,
  Lock
} from 'lucide-react';
import { format, isToday, isYesterday, parseISO } from 'date-fns';

export const TeamChat = () => {
  const { user, profile, isFounder } = useAuth();
  const { isUserOnline, onlineCount } = usePresence();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

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

    // 1. Supabase Realtime subscription for incoming messages
    let channel = null;
    if (supabase) {
      channel = supabase
        .channel('realtime-group-chat')
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

    // 2. Cross-tab synchronization
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

  // Auto-scroll when messages initial load completes
  useEffect(() => {
    if (!loading) {
      scrollToBottom(false);
    }
  }, [loading]);

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!inputValue.trim() || sending) return;

    const content = inputValue.trim();
    setInputValue('');
    setSending(true);
    setError('');

    try {
      const senderName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Team Member';
      const senderEmail = profile?.email || user?.email || '';
      const senderRole = profile?.role || 'MEMBER';
      const senderId = profile?.id || user?.id;

      const newMsg = await chatApi.sendMessage({
        content,
        senderId,
        senderName,
        senderEmail,
        senderRole
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
      setError('Failed to deliver message. Please try again.');
    } finally {
      setSending(false);
      inputRef.current?.focus();
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

  const addQuickEmoji = (emoji) => {
    setInputValue(prev => prev + emoji);
    inputRef.current?.focus();
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
    <div className="h-[calc(100vh-6rem)] flex flex-col bg-neutral-950 rounded-3xl border border-neutral-800 overflow-hidden shadow-2xl">
      {/* 1. Group Chat Header (WhatsApp style) */}
      <div className="px-6 py-4 bg-black border-b border-neutral-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="relative">
            <div className="w-11 h-11 rounded-2xl bg-neutral-900 border border-neutral-700 flex items-center justify-center text-white shadow-md">
              <BrandLogo size="small" />
            </div>
            <span
              className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-black"
              title="Group active"
            />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-white tracking-tight">
                TeamSync Company HQ
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-neutral-900 border border-neutral-800 text-neutral-300">
                #general
              </span>
            </div>
            <p className="text-xs text-neutral-400 flex items-center gap-2 mt-0.5">
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3 text-neutral-500" />
                All Team Members
              </span>
              <span>•</span>
              <span className="text-emerald-400 font-medium">
                {onlineCount} Online Now
              </span>
            </p>
          </div>
        </div>

        {/* Security & System info */}
        <div className="hidden sm:flex items-center gap-2 text-xs text-neutral-400 bg-neutral-900 px-3 py-1.5 rounded-xl border border-neutral-800">
          <Lock className="w-3.5 h-3.5 text-neutral-400" />
          <span>Official Company Group</span>
        </div>
      </div>

      {/* 2. Messages Canvas */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-black/50">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <LoadingSpinner text="Connecting to real-time team stream..." />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-neutral-400 space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-500">
              <MessageSquare className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-white">Welcome to TeamSync Company Chat</h3>
            <p className="text-xs text-neutral-400 max-w-sm">
              This is the official unified channel for all company communications. Say hello to kick off collaboration!
            </p>
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
                className={`flex gap-3 group ${isSelf ? 'justify-end' : 'justify-start'}`}
              >
                {/* Incoming Message Avatar */}
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

                {/* Message Bubble Container */}
                <div
                  className={`max-w-[85%] sm:max-w-[70%] rounded-2xl p-3.5 relative shadow-md transition ${
                    isSelf
                      ? 'bg-neutral-900 border border-neutral-750 text-white rounded-br-sm'
                      : 'bg-neutral-950 border border-neutral-800 text-neutral-100 rounded-bl-sm'
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

                    {/* Delete action */}
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

                  {/* Message Content */}
                  <p className="text-xs sm:text-sm text-neutral-200 whitespace-pre-wrap leading-relaxed break-words">
                    {msg.content}
                  </p>

                  {/* Footer / Timestamp & Delivery */}
                  <div className="flex items-center justify-end gap-1.5 mt-2 text-[10px] text-neutral-400">
                    <span>{formatMessageTime(msg.created_at)}</span>
                    {isSelf && <CheckCheck className="w-3 h-3 text-neutral-300" />}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 3. Quick Emoji Reactions Bar */}
      <div className="px-4 py-2 bg-neutral-950 border-t border-neutral-900 flex items-center gap-1.5 overflow-x-auto text-xs shrink-0">
        <span className="text-[11px] text-neutral-400 mr-1 flex items-center gap-1">
          <Smile className="w-3.5 h-3.5 text-neutral-400" />
          Quick:
        </span>
        {['👍', '🚀', '🔥', '❤️', '✅', '👏', '🎯', '💡'].map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => addQuickEmoji(emoji)}
            className="px-2 py-1 bg-neutral-900 hover:bg-neutral-800 rounded-lg text-sm transition cursor-pointer"
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* 4. Chat Input Bar (WhatsApp style) */}
      <div className="p-3 sm:p-4 bg-black border-t border-neutral-800 shrink-0">
        {error && (
          <div className="mb-2 text-xs text-red-400 px-2">{error}</div>
        )}
        <form onSubmit={handleSendMessage} className="flex items-center gap-2 sm:gap-3">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message to the team... (Press Enter to send)"
            disabled={sending}
            className="flex-1 bg-neutral-900 border border-neutral-700 hover:border-neutral-600 focus:border-white rounded-2xl px-4 py-3 text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none transition"
          />

          <button
            type="submit"
            disabled={!inputValue.trim() || sending}
            className="px-5 py-3 rounded-2xl bg-white text-black hover:bg-neutral-200 disabled:opacity-40 font-bold text-xs sm:text-sm transition flex items-center gap-2 shadow-md cursor-pointer shrink-0"
          >
            <span>{sending ? 'Sending...' : 'Send'}</span>
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default TeamChat;
