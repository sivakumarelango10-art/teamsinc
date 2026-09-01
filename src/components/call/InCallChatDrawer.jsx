import React, { useState, useRef, useEffect } from 'react';
import { X, Send, MessageSquare } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export const InCallChatDrawer = ({ messages = [], onSendMessage, onClose, currentUserId }) => {
  const [text, setText] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e) => {
    if (e) e.preventDefault();
    if (!text.trim()) return;
    onSendMessage(text.trim());
    setText('');
  };

  const formatTime = (iso) => {
    try {
      return format(parseISO(iso), 'h:mm a');
    } catch {
      return '';
    }
  };

  return (
    <div className="w-80 md:w-88 h-full bg-neutral-950 border-l border-neutral-800 flex flex-col shrink-0 z-30 shadow-2xl">
      {/* Drawer Header */}
      <div className="px-4 py-3.5 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/80">
        <div className="flex items-center gap-2 text-white">
          <MessageSquare className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs md:text-sm font-bold tracking-tight">In-Call Chat</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition cursor-pointer"
          title="Close chat"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-neutral-500 p-4 space-y-2">
            <MessageSquare className="w-8 h-8 opacity-40 text-neutral-400" />
            <p className="text-xs text-neutral-400 font-medium">No messages yet</p>
            <p className="text-[11px] text-neutral-500">Messages sent here are visible to everyone in the call.</p>
          </div>
        ) : (
          messages.map((m) => {
            const isSelf = m.senderId === currentUserId;
            return (
              <div
                key={m.id}
                className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1.5 mb-1 text-[10px] text-neutral-400">
                  <span className={`font-bold ${isSelf ? 'text-emerald-400' : 'text-neutral-200'}`}>
                    {isSelf ? 'You' : m.senderName}
                  </span>
                  <span>•</span>
                  <span>{formatTime(m.createdAt)}</span>
                </div>
                <div
                  className={`p-2.5 rounded-2xl max-w-[90%] break-words whitespace-pre-wrap ${
                    isSelf
                      ? 'bg-emerald-600/20 border border-emerald-500/40 text-white rounded-tr-none'
                      : 'bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-tl-none'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {/* Input Bar */}
      <form onSubmit={handleSend} className="p-3 border-t border-neutral-800 bg-neutral-900/60 flex items-center gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Send message to call..."
          className="flex-1 bg-neutral-950 border border-neutral-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none transition"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="p-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black rounded-xl transition cursor-pointer shrink-0 shadow-md"
          title="Send"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};

export default InCallChatDrawer;
