import { supabase } from './supabase.js';

const STORAGE_DIRECT_CONVS = 'teamsync_direct_conversations';
const STORAGE_DIRECT_MSGS = 'teamsync_direct_messages_';

// BroadcastChannel for instant cross-tab synchronization
const directChatBroadcast = typeof window !== 'undefined' && window.BroadcastChannel
  ? new BroadcastChannel('teamsync_direct_chat_channel')
  : null;

/**
 * Returns canonical sorted pair [p1, p2] where p1 < p2
 */
export function canonicalParticipantPair(userIdA, userIdB) {
  if (!userIdA || !userIdB) return [null, null];
  return userIdA.localeCompare(userIdB) < 0
    ? [userIdA, userIdB]
    : [userIdB, userIdA];
}

export const directChatApi = {
  /**
   * Broadcast real-time event across tabs
   */
  broadcastEvent(type, payload) {
    if (directChatBroadcast) {
      try {
        directChatBroadcast.postMessage({ type, payload, timestamp: Date.now() });
      } catch (err) {
        // Ignore broadcast errors
      }
    }
  },

  /**
   * Subscribe to cross-tab direct chat events
   */
  onBroadcastEvent(callback) {
    if (!directChatBroadcast) return () => {};
    const handler = (e) => {
      if (e?.data) callback(e.data);
    };
    directChatBroadcast.addEventListener('message', handler);
    return () => directChatBroadcast.removeEventListener('message', handler);
  },

  /**
   * Fetch or create a canonical 1-on-1 conversation between two users
   */
  async getOrCreateConversation(currentUserId, otherUserId) {
    if (!currentUserId || !otherUserId) {
      throw new Error('Both participant IDs are required to get or create a conversation');
    }

    if (currentUserId === otherUserId) {
      throw new Error('Cannot start a direct message conversation with yourself');
    }

    const [p1, p2] = canonicalParticipantPair(currentUserId, otherUserId);

    if (supabase) {
      try {
        // 1. Try to find existing conversation
        const { data: existing, error: findErr } = await supabase
          .from('direct_conversations')
          .select(`
            id,
            participant_one_id,
            participant_two_id,
            last_message_at,
            last_message_preview,
            last_message_sender_id,
            created_at,
            updated_at,
            participant_one:profiles!direct_conversations_participant_one_id_fkey(id, full_name, email, role, avatar_url, last_seen_at),
            participant_two:profiles!direct_conversations_participant_two_id_fkey(id, full_name, email, role, avatar_url, last_seen_at)
          `)
          .eq('participant_one_id', p1)
          .eq('participant_two_id', p2)
          .maybeSingle();

        if (existing && !findErr) {
          return this.formatConversation(existing, currentUserId);
        }

        // 2. Create if not found
        const { data: created, error: insertErr } = await supabase
          .from('direct_conversations')
          .insert([{
            participant_one_id: p1,
            participant_two_id: p2,
            last_message_preview: ''
          }])
          .select(`
            id,
            participant_one_id,
            participant_two_id,
            last_message_at,
            last_message_preview,
            last_message_sender_id,
            created_at,
            updated_at,
            participant_one:profiles!direct_conversations_participant_one_id_fkey(id, full_name, email, role, avatar_url, last_seen_at),
            participant_two:profiles!direct_conversations_participant_two_id_fkey(id, full_name, email, role, avatar_url, last_seen_at)
          `)
          .single();

        if (created && !insertErr) {
          const formatted = this.formatConversation(created, currentUserId);
          this.broadcastEvent('CONVERSATION_CREATED', formatted);
          return formatted;
        }

        // If conflict error (another tab created it concurrently)
        if (insertErr && (insertErr.code === '23505' || insertErr.message?.includes('duplicate'))) {
          const { data: retryData } = await supabase
            .from('direct_conversations')
            .select(`
              id,
              participant_one_id,
              participant_two_id,
              last_message_at,
              last_message_preview,
              last_message_sender_id,
              created_at,
              updated_at,
              participant_one:profiles!direct_conversations_participant_one_id_fkey(id, full_name, email, role, avatar_url, last_seen_at),
              participant_two:profiles!direct_conversations_participant_two_id_fkey(id, full_name, email, role, avatar_url, last_seen_at)
            `)
            .eq('participant_one_id', p1)
            .eq('participant_two_id', p2)
            .single();

          if (retryData) return this.formatConversation(retryData, currentUserId);
        }

        throw insertErr;
      } catch (err) {
        console.error('Error in getOrCreateConversation:', err);
      }
    }

    // LocalStorage Fallback for offline resilience
    const convId = `dm_conv_${p1}_${p2}`;
    const fallbackConv = {
      id: convId,
      participant_one_id: p1,
      participant_two_id: p2,
      last_message_at: new Date().toISOString(),
      last_message_preview: '',
      unreadCount: 0,
      otherParticipant: {
        id: otherUserId,
        full_name: 'Team Member',
        role: 'MEMBER'
      }
    };
    return fallbackConv;
  },

  /**
   * Format conversation helper to cleanly identify other participant
   */
  formatConversation(conv, currentUserId, unreadCount = 0) {
    if (!conv) return null;
    const isP1Current = conv.participant_one_id === currentUserId;
    const otherParticipant = isP1Current ? conv.participant_two : conv.participant_one;

    return {
      id: conv.id,
      participantOneId: conv.participant_one_id,
      participantTwoId: conv.participant_two_id,
      lastMessageAt: conv.last_message_at,
      lastMessagePreview: conv.last_message_preview || '',
      lastMessageSenderId: conv.last_message_sender_id,
      createdAt: conv.created_at,
      updatedAt: conv.updated_at,
      unreadCount: unreadCount,
      otherParticipant: otherParticipant || {
        id: isP1Current ? conv.participant_two_id : conv.participant_one_id,
        full_name: 'Team Member',
        role: 'MEMBER'
      }
    };
  },

  /**
   * Fetch all conversations for the current user with unread counts
   */
  async getConversations(currentUserId) {
    if (!currentUserId) return [];

    if (supabase) {
      try {
        // Query conversations where current user is participant 1 or participant 2
        const { data: convs, error: convErr } = await supabase
          .from('direct_conversations')
          .select(`
            id,
            participant_one_id,
            participant_two_id,
            last_message_at,
            last_message_preview,
            last_message_sender_id,
            created_at,
            updated_at,
            participant_one:profiles!direct_conversations_participant_one_id_fkey(id, full_name, email, role, avatar_url, last_seen_at),
            participant_two:profiles!direct_conversations_participant_two_id_fkey(id, full_name, email, role, avatar_url, last_seen_at)
          `)
          .or(`participant_one_id.eq.${currentUserId},participant_two_id.eq.${currentUserId}`)
          .order('last_message_at', { ascending: false });

        if (convErr) throw convErr;

        if (!convs || convs.length === 0) return [];

        // Fetch unread message counts for all conversations in a single batch query
        const convIds = convs.map(c => c.id);
        const { data: unreadMessages, error: unreadErr } = await supabase
          .from('direct_messages')
          .select('conversation_id')
          .in('conversation_id', convIds)
          .eq('recipient_id', currentUserId)
          .eq('is_read', false);

        const unreadMap = {};
        if (!unreadErr && unreadMessages) {
          for (const msg of unreadMessages) {
            unreadMap[msg.conversation_id] = (unreadMap[msg.conversation_id] || 0) + 1;
          }
        }

        const formatted = convs.map(c => this.formatConversation(c, currentUserId, unreadMap[c.id] || 0));

        // Cache latest in localStorage
        try {
          localStorage.setItem(STORAGE_DIRECT_CONVS, JSON.stringify(formatted));
        } catch {}

        return formatted;
      } catch (err) {
        console.error('Error fetching direct conversations:', err);
      }
    }

    try {
      const stored = localStorage.getItem(STORAGE_DIRECT_CONVS);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },

  /**
   * Fetch messages for a specific conversation
   */
  async getMessages(conversationId, { limit = 60, before = null } = {}) {
    if (!conversationId) return [];

    if (supabase) {
      try {
        let query = supabase
          .from('direct_messages')
          .select(`
            id,
            conversation_id,
            sender_id,
            recipient_id,
            content,
            file_url,
            file_name,
            file_size,
            file_type,
            is_read,
            read_at,
            created_at,
            sender:profiles!direct_messages_sender_id_fkey(id, full_name, email, role, avatar_url)
          `)
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (before) {
          query = query.lt('created_at', before);
        }

        const { data, error } = await query;
        if (error) throw error;

        // Reverse so array is ascending chronologically
        const messages = (data || []).reverse();

        // Cache locally
        try {
          localStorage.setItem(`${STORAGE_DIRECT_MSGS}${conversationId}`, JSON.stringify(messages.slice(-100)));
        } catch {}

        return messages;
      } catch (err) {
        console.error('Error fetching direct messages:', err);
      }
    }

    try {
      const stored = localStorage.getItem(`${STORAGE_DIRECT_MSGS}${conversationId}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },

  /**
   * Send a direct message
   */
  async sendMessage({ conversationId, senderId, recipientId, content = '', attachment = null }) {
    let cleanContent = (content || '').trim();
    if (!cleanContent && attachment) {
      cleanContent = attachment.type === 'audio' ? 'Voice note' : (attachment.name || 'Attachment');
    }

    if (!cleanContent && !attachment) {
      throw new Error('Please type a message or select an attachment');
    }

    const payload = {
      conversation_id: conversationId,
      sender_id: senderId,
      recipient_id: recipientId,
      content: cleanContent,
      file_url: attachment?.url || null,
      file_name: attachment?.name || null,
      file_size: attachment?.size || null,
      file_type: attachment?.type || null
    };

    if (supabase) {
      const { data, error } = await supabase
        .from('direct_messages')
        .insert([payload])
        .select(`
          id,
          conversation_id,
          sender_id,
          recipient_id,
          content,
          file_url,
          file_name,
          file_size,
          file_type,
          is_read,
          read_at,
          created_at,
          sender:profiles!direct_messages_sender_id_fkey(id, full_name, email, role, avatar_url)
        `)
        .single();

      if (error) {
        console.error('Error sending direct message:', error);
        throw error;
      }

      this.broadcastEvent('MESSAGE_SENT', data);
      return data;
    }

    // Local fallback
    const localMsg = {
      id: 'dm_msg_' + Date.now(),
      ...payload,
      is_read: false,
      read_at: null,
      created_at: new Date().toISOString()
    };

    try {
      const stored = await this.getMessages(conversationId);
      stored.push(localMsg);
      localStorage.setItem(`${STORAGE_DIRECT_MSGS}${conversationId}`, JSON.stringify(stored.slice(-100)));
    } catch {}

    this.broadcastEvent('MESSAGE_SENT', localMsg);
    return localMsg;
  },

  /**
   * Mark all unread incoming messages in a conversation as read
   */
  async markAsRead(conversationId, currentUserId) {
    if (!conversationId || !currentUserId) return;

    if (supabase) {
      try {
        const { error } = await supabase
          .from('direct_messages')
          .update({
            is_read: true,
            read_at: new Date().toISOString()
          })
          .eq('conversation_id', conversationId)
          .eq('recipient_id', currentUserId)
          .eq('is_read', false);

        if (error) console.error('Error marking direct messages as read:', error);
        this.broadcastEvent('MESSAGES_READ', { conversationId, readBy: currentUserId });
      } catch (err) {
        console.error('Failed to mark direct messages read:', err);
      }
    }
  },

  /**
   * Delete a direct message
   */
  async deleteMessage(messageId, currentUserId) {
    if (!messageId) return false;

    if (supabase) {
      const { error } = await supabase
        .from('direct_messages')
        .delete()
        .eq('id', messageId)
        .eq('sender_id', currentUserId);

      if (error) throw error;
      this.broadcastEvent('MESSAGE_DELETED', { messageId });
      return true;
    }
    return true;
  }
};

export default directChatApi;
