import { supabase } from './supabase';

const STORAGE_CHAT_KEY = 'teamsync_chat_messages';

export const chatApi = {
  async getMessages(limit = 150) {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .order('created_at', { ascending: true })
          .limit(limit);

        if (error) throw error;
        return data || [];
      } catch (err) {
        console.error('Error fetching chat messages:', err);
      }
    }

    try {
      const stored = localStorage.getItem(STORAGE_CHAT_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },

  async sendMessage({ content, senderId, senderName, senderEmail, senderRole }) {
    if (!content?.trim()) throw new Error('Message cannot be empty');

    const cleanContent = content.trim();

    if (supabase) {
      // Resolve valid profile ID
      let resolvedSenderId = senderId;
      if (resolvedSenderId) {
        try {
          const { data: p } = await supabase
            .from('profiles')
            .select('id')
            .or(`id.eq.${resolvedSenderId},auth_user_id.eq.${resolvedSenderId}`)
            .maybeSingle();
          resolvedSenderId = p?.id || null;
        } catch {
          resolvedSenderId = null;
        }
      }

      const { data, error } = await supabase
        .from('messages')
        .insert([{
          content: cleanContent,
          sender_id: resolvedSenderId,
          sender_name: senderName || 'Team Member',
          sender_email: senderEmail || '',
          sender_role: senderRole || 'MEMBER'
        }])
        .select()
        .single();

      if (error) {
        console.error('Error sending message:', error);
        throw error;
      }
      return data;
    }

    // Local fallback
    const newMessage = {
      id: 'msg-' + Date.now(),
      content: cleanContent,
      sender_id: senderId,
      sender_name: senderName,
      sender_email: senderEmail,
      sender_role: senderRole,
      created_at: new Date().toISOString()
    };

    try {
      const current = await this.getMessages();
      current.push(newMessage);
      localStorage.setItem(STORAGE_CHAT_KEY, JSON.stringify(current));
    } catch {}

    return newMessage;
  },

  async deleteMessage(messageId) {
    if (supabase) {
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId);
      if (error) throw error;
      return true;
    }

    try {
      const current = await this.getMessages();
      const filtered = current.filter(m => m.id !== messageId);
      localStorage.setItem(STORAGE_CHAT_KEY, JSON.stringify(filtered));
    } catch {}
    return true;
  }
};
