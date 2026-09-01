import { supabase } from './supabase';
import { r2StorageService } from '../utils/r2StorageService';

const STORAGE_CHAT_KEY = 'teamsync_chat_messages';

const fileToDataUrl = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const chatApi = {
  async getMessages(limit = 100, before = null, channel = 'general') {
    if (supabase) {
      try {
        let query = supabase
          .from('messages')
          .select('id, content, sender_id, sender_name, sender_email, sender_role, file_url, file_name, file_size, file_type, channel, created_at')
          .eq('channel', channel)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (before) {
          query = query.lt('created_at', before);
        }

        const { data, error } = await query;
        if (error) throw error;
        // Reverse so stream renders ascending chronologically
        return (data || []).reverse();
      } catch (err) {
        console.error('Error fetching chat messages:', err);
      }
    }

    try {
      const storageKey = `${STORAGE_CHAT_KEY}_${channel}`;
      const stored = localStorage.getItem(storageKey) || localStorage.getItem(STORAGE_CHAT_KEY);
      const all = stored ? JSON.parse(stored) : [];
      const channelMessages = all.filter(m => (m.channel || 'general') === channel);
      if (before) {
        const beforeTime = new Date(before).getTime();
        return channelMessages.filter(m => new Date(m.created_at).getTime() < beforeTime).slice(-limit);
      }
      return channelMessages.slice(-limit);
    } catch {
      return [];
    }
  },

  async uploadAttachment(file, options = {}) {
    if (!file) return null;

    try {
      const result = await r2StorageService.uploadFile({
        file,
        destination: 'chat',
        channel: options.channel || 'general',
        onProgress: options.onProgress
      });

      return {
        url: result.fileUrl,
        storageKey: result.storageKey,
        name: result.fileName,
        size: result.fileSize,
        type: result.fileType,
        mimeType: result.mimeType,
        isR2: result.isR2
      };
    } catch (err) {
      console.error('Error uploading attachment to R2/Storage:', err);
      throw err;
    }
  },

  async sendMessage({ content = '', senderId, senderName, senderEmail, senderRole, attachment = null, channel = 'general' }) {
    let fileUrl = null;
    let fileName = null;
    let fileSize = null;
    let fileType = null;

    let storageKey = null;
    let isR2 = true;

    if (attachment) {
      fileUrl = attachment.url;
      fileName = attachment.name;
      fileSize = attachment.size;
      fileType = attachment.type;
      storageKey = attachment.storageKey || null;
      isR2 = attachment.isR2 ?? true;
    }

    // Ensure non-null content for schema constraints if text was empty
    let cleanContent = content.trim();
    if (!cleanContent && attachment) {
      cleanContent = fileType === 'audio' ? 'Voice message' : (attachment.name || 'Attachment');
    }

    if (!cleanContent && !attachment) {
      throw new Error('Please type a message or record audio to send');
    }

    if (supabase) {
      const { data, error } = await supabase
        .from('messages')
        .insert([{
          content: cleanContent,
          sender_id: senderId || null,
          sender_name: senderName || 'Team Member',
          sender_email: senderEmail || '',
          sender_role: senderRole || 'MEMBER',
          file_url: fileUrl,
          file_name: fileName,
          file_size: fileSize,
          file_type: fileType,
          storage_key: storageKey,
          is_r2: isR2,
          channel: channel || 'general'
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
      file_url: fileUrl,
      file_name: fileName,
      file_size: fileSize,
      file_type: fileType,
      channel: channel || 'general',
      created_at: new Date().toISOString()
    };

    try {
      const storageKey = `${STORAGE_CHAT_KEY}_${channel || 'general'}`;
      const current = await this.getMessages(100, null, channel || 'general');
      current.push(newMessage);
      localStorage.setItem(storageKey, JSON.stringify(current));
    } catch {}

    return newMessage;
  },

  async deleteMessage(messageId, storageKey = null, channel = 'general') {
    if (storageKey) {
      try {
        await r2StorageService.deleteFile(storageKey, { channel });
      } catch (e) {
        console.warn('Error deleting R2 object:', e);
      }
    }

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
