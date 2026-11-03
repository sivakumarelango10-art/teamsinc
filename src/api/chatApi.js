import { supabase } from './supabase.js';

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
          .select('id, content, sender_id, sender_name, sender_email, sender_role, file_url, file_name, file_size, file_type, channel, metadata, created_at')
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

  async uploadAttachment(file) {
    if (!file) return null;

    const resolveType = (f) => {
      const name = (f.name || '').toLowerCase();
      const mime = (f.type || '').toLowerCase();
      if (mime.startsWith('audio/') || name.startsWith('voice_note') || (name.endsWith('.webm') && (mime.includes('audio') || name.startsWith('voice_note')))) {
        return 'audio';
      }
      if (mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(name)) return 'image';
      if (mime.startsWith('video/') || /\.(mp4|mov|avi|mkv)$/i.test(name)) return 'video';
      if (/\.(mp3|wav|ogg|m4a|aac|opus)$/i.test(name)) return 'audio';
      return 'document';
    };

    const detectedType = resolveType(file);

    if (supabase) {
      try {
        const safeName = (file.name || `audio_${Date.now()}.webm`).replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `uploads/${Date.now()}_${safeName}`;

        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('chat-attachments')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false,
            contentType: file.type || (detectedType === 'audio' ? 'audio/webm' : undefined)
          });

        if (!uploadErr && uploadData) {
          // Generate 7-day signed URL for private bucket attachment
          const { data: signData } = await supabase.storage
            .from('chat-attachments')
            .createSignedUrl(filePath, 60 * 60 * 24 * 7);

          const finalUrl = signData?.signedUrl || supabase.storage
            .from('chat-attachments')
            .getPublicUrl(filePath)?.data?.publicUrl;

          return {
            url: finalUrl,
            name: file.name || 'Voice Message',
            size: file.size || 0,
            type: detectedType
          };
        }
      } catch (err) {
        console.warn('Supabase storage upload notice, using DataURL fallback:', err);
      }
    }

    // High-res DataURL fallback
    try {
      const dataUrl = await fileToDataUrl(file);
      return {
        url: dataUrl,
        name: file.name || 'Voice Message',
        size: file.size || 0,
        type: detectedType
      };
    } catch (err) {
      console.error('Failed to encode attachment:', err);
      return null;
    }
  },

  async sendMessage({ content = '', senderId, senderName, senderEmail, senderRole, attachment = null, channel = 'general', metadata = {} }) {
    let fileUrl = null;
    let fileName = null;
    let fileSize = null;
    let fileType = null;

    if (attachment) {
      fileUrl = attachment.url;
      fileName = attachment.name;
      fileSize = attachment.size;
      fileType = attachment.type;
    }

    // Ensure non-null content for schema constraints if text was empty
    let cleanContent = content.trim();
    if (!cleanContent && attachment) {
      cleanContent = fileType === 'audio' ? 'Voice message' : (attachment.name || 'Attachment');
    }
    if (!cleanContent && metadata && (metadata.type || metadata.question || metadata.title)) {
      cleanContent = metadata.title || metadata.question || `Shared ${metadata.type || 'collaboration item'}`;
    }

    if (!cleanContent && !attachment) {
      throw new Error('Please type a message, record audio, or select a collaboration item to send');
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
          channel: channel || 'general',
          metadata: metadata || {}
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
      const current = await this.getMessages(200, null, channel || 'general');
      current.push(newMessage);
      // Keep bounded sliding window of latest 200 messages to protect browser storage quota
      const bounded = current.slice(-200);
      localStorage.setItem(storageKey, JSON.stringify(bounded));
    } catch {}

    return newMessage;
  },

  async deleteMessage(messageId, channel = 'general') {
    if (supabase) {
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId);
      if (error) throw error;
      return true;
    }

    try {
      const storageKey = `${STORAGE_CHAT_KEY}_${channel}`;
      const current = await this.getMessages(100, null, channel);
      const filtered = current.filter(m => m.id !== messageId);
      localStorage.setItem(storageKey, JSON.stringify(filtered));
    } catch {}
    return true;
  }
};

export default chatApi;
