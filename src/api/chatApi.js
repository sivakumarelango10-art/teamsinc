import { supabase } from './supabase';

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
  async getMessages(limit = 200) {
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

  async uploadAttachment(file) {
    if (!file) return null;

    const resolveType = (f) => {
      if (f.type?.startsWith('image/')) return 'image';
      if (f.type?.startsWith('audio/') || /\.(webm|mp3|wav|ogg|m4a|aac)$/i.test(f.name || '')) return 'audio';
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
          const { data: pubData } = supabase.storage
            .from('chat-attachments')
            .getPublicUrl(filePath);

          return {
            url: pubData?.publicUrl,
            name: file.name || 'Voice Message',
            size: file.size || 0,
            type: detectedType
          };
        }
      } catch (err) {
        console.warn('Storage bucket upload notice, using DataURL fallback:', err);
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

  async sendMessage({ content = '', senderId, senderName, senderEmail, senderRole, attachment = null }) {
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

    if (!cleanContent && !attachment) {
      throw new Error('Please type a message or record audio to send');
    }

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
          sender_role: senderRole || 'MEMBER',
          file_url: fileUrl,
          file_name: fileName,
          file_size: fileSize,
          file_type: fileType
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
