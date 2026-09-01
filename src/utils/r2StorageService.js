/**
 * TeamSync — Cloudflare R2 Storage Service
 * Handles direct browser-to-R2 upload via S3 presigned URLs, upload progress tracking,
 * secure download URL generation, and deletion.
 */

import { supabase } from '../api/supabase';
import { validateFileForUpload, getFileCategory } from '../config/r2Config';

// In-memory cache for presigned GET download URLs (Key -> { url, expiresAt })
const downloadUrlCache = new Map();

export const r2StorageService = {
  /**
   * Upload a file directly to Cloudflare R2 with progress tracking
   * @param {Object} options
   * @param {File|Blob} options.file - File object or audio blob to upload
   * @param {string} [options.destination='chat'] - 'chat' | 'task' | 'avatar'
   * @param {string} [options.channel='general'] - 'general' | 'leadership'
   * @param {string} [options.taskId=null] - Task UUID if destination is 'task'
   * @param {Function} [options.onProgress] - Callback (percent: number) => void
   * @returns {Promise<{ storageKey: string, fileUrl: string, fileName: string, fileSize: number, fileType: string, mimeType: string }>}
   */
  async uploadFile({
    file,
    destination = 'chat',
    channel = 'general',
    taskId = null,
    onProgress = null
  }) {
    if (!file) throw new Error('No file provided for upload.');

    // 1. Client-side validation
    const validation = validateFileForUpload(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const fileName = file.name || `audio_note_${Date.now()}.webm`;
    const mimeType = file.type || (validation.category === 'audio' ? 'audio/webm' : 'application/octet-stream');
    const fileSize = file.size || 0;
    const category = validation.category;

    // 2. Request presigned PUT URL from Supabase Edge Function
    if (supabase) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;

        if (token) {
          const { data, error } = await supabase.functions.invoke('r2-presign', {
            body: {
              action: 'create-upload-url',
              fileName,
              fileType: mimeType,
              fileSize,
              destination,
              channel,
              taskId
            }
          });

          if (!error && data?.success && data?.uploadUrl) {
            const { uploadUrl, storageKey, directUrl } = data;

            // 3. Direct Browser-to-Cloudflare-R2 Upload via XMLHttpRequest for progress monitoring
            await new Promise((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.open('PUT', uploadUrl, true);
              xhr.setRequestHeader('Content-Type', mimeType);

              if (xhr.upload && onProgress) {
                xhr.upload.onprogress = (e) => {
                  if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    onProgress(percent);
                  }
                };
              }

              xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                  if (onProgress) onProgress(100);
                  resolve();
                } else {
                  reject(new Error(`Cloudflare R2 upload failed with status ${xhr.status}: ${xhr.statusText}`));
                }
              };

              xhr.onerror = () => {
                reject(new Error('Network error during Cloudflare R2 direct upload.'));
              };

              xhr.send(file);
            });

            // Cache the presigned direct URL
            const finalUrl = directUrl || uploadUrl.split('?')[0];
            downloadUrlCache.set(storageKey, {
              url: finalUrl,
              expiresAt: Date.now() + 14 * 60 * 1000 // 14 minutes cache
            });

            return {
              storageKey,
              fileUrl: finalUrl,
              fileName,
              fileSize,
              fileType: category,
              mimeType,
              isR2: true
            };
          }
        }
      } catch (r2Err) {
        console.warn('[R2 Storage] Edge Function presign note, attempting fallback:', r2Err.message || r2Err);
      }
    }

    // 4. Fallback: Supabase Storage Bucket
    if (supabase) {
      try {
        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `${destination}/${Date.now()}_${safeName}`;

        if (onProgress) onProgress(30);

        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('chat-attachments')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false,
            contentType: mimeType
          });

        if (!uploadErr && uploadData) {
          if (onProgress) onProgress(100);
          const { data: pubData } = supabase.storage
            .from('chat-attachments')
            .getPublicUrl(filePath);

          return {
            storageKey: `supabase://${filePath}`,
            fileUrl: pubData?.publicUrl,
            fileName,
            fileSize,
            fileType: category,
            mimeType,
            isR2: false
          };
        }
      } catch (supaErr) {
        console.warn('[Storage] Supabase bucket upload note:', supaErr);
      }
    }

    // 5. Offline / Mock fallback: DataURL
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (onProgress) onProgress(100);
        resolve({
          storageKey: `dataurl://${Date.now()}`,
          fileUrl: reader.result,
          fileName,
          fileSize,
          fileType: category,
          mimeType,
          isR2: false
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  /**
   * Get a valid, active presigned download URL for viewing/downloading an R2 object
   * @param {string} storageKey - e.g. 'teamsync/chat/leadership/uuid.pdf'
   * @param {Object} [options]
   * @param {string} [options.channel='general']
   * @param {string} [options.taskId=null]
   * @returns {Promise<string>} Active URL
   */
  async getDownloadUrl(storageKey, options = {}) {
    if (!storageKey) return '';
    if (storageKey.startsWith('http://') || storageKey.startsWith('https://') || storageKey.startsWith('data:')) {
      return storageKey;
    }

    // Check in-memory cache
    const cached = downloadUrlCache.get(storageKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.url;
    }

    if (supabase && storageKey.startsWith('teamsync/')) {
      try {
        const { data, error } = await supabase.functions.invoke('r2-presign', {
          body: {
            action: 'create-download-url',
            storageKey,
            channel: options.channel || 'general',
            taskId: options.taskId || null
          }
        });

        if (!error && data?.downloadUrl) {
          downloadUrlCache.set(storageKey, {
            url: data.downloadUrl,
            expiresAt: Date.now() + 14 * 60 * 1000
          });
          return data.downloadUrl;
        }
      } catch (err) {
        console.warn('[R2 Storage] Download presign error:', err);
      }
    }

    return storageKey;
  },

  /**
   * Delete an object from Cloudflare R2
   * @param {string} storageKey
   * @param {Object} [options]
   * @returns {Promise<boolean>}
   */
  async deleteFile(storageKey, options = {}) {
    if (!storageKey || !storageKey.startsWith('teamsync/')) return true;

    if (supabase) {
      try {
        const { data, error } = await supabase.functions.invoke('r2-presign', {
          body: {
            action: 'delete-file',
            storageKey,
            channel: options.channel || 'general',
            taskId: options.taskId || null
          }
        });

        downloadUrlCache.delete(storageKey);
        return !error && data?.success;
      } catch (err) {
        console.warn('[R2 Storage] Delete file error:', err);
      }
    }
    return false;
  }
};

export default r2StorageService;
