/**
 * TeamSync — Cloudflare R2 Storage Configuration
 * Centralized file size limits, supported MIME types, and validation rules.
 */

export const R2_CONFIG = {
  // File Size Limits (in Bytes)
  MAX_FILE_SIZES: {
    image: 10 * 1024 * 1024,      // 10 MB
    audio: 25 * 1024 * 1024,      // 25 MB
    document: 25 * 1024 * 1024,   // 25 MB
    video: 250 * 1024 * 1024      // 250 MB
  },

  // Allowed MIME Types by Category
  ALLOWED_MIME_TYPES: {
    image: [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/svg+xml'
    ],
    audio: [
      'audio/webm',
      'audio/ogg',
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/x-wav',
      'audio/aac',
      'audio/m4a',
      'audio/mp4'
    ],
    video: [
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'video/ogg',
      'video/x-msvideo'
    ],
    document: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
      'text/markdown',
      'application/json',
      'application/zip',
      'application/x-zip-compressed'
    ]
  },

  // Disallowed Extensions (Rejected immediately)
  DISALLOWED_EXTENSIONS: [
    'exe', 'bat', 'cmd', 'sh', 'ps1', 'vbs', 'msi', 'com', 'scr', 'hta', 'jar', 'apk'
  ],

  // Expiration times for presigned URLs (in seconds)
  PRESIGNED_EXPIRY: {
    upload: 900,      // 15 minutes to complete upload
    download: 900     // 15 minutes access per view/download
  }
};

/**
 * Determine file category based on MIME type or extension
 */
export function getFileCategory(file) {
  if (!file) return 'document';
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();

  if (type.startsWith('image/') || /\.(jpe?g|png|webp|gif|svg)$/i.test(name)) {
    return 'image';
  }
  if (type.startsWith('video/') || /\.(mp4|webm|mov|avi|mkv)$/i.test(name)) {
    return 'video';
  }
  if (type.startsWith('audio/') || /\.(webm|mp3|wav|ogg|m4a|aac)$/i.test(name)) {
    return 'audio';
  }
  return 'document';
}

/**
 * Format bytes into human-readable string
 */
export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Validate file before initiating upload
 * @param {File|Blob} file 
 * @returns {{ valid: boolean, error?: string, category: string }}
 */
export function validateFileForUpload(file) {
  if (!file) {
    return { valid: false, error: 'No file selected.', category: 'document' };
  }

  const name = (file.name || '').toLowerCase();
  const ext = name.split('.').pop() || '';

  // Check disallowed executable extensions
  if (R2_CONFIG.DISALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `Files with extension .${ext} are blocked for security reasons.`,
      category: 'document'
    };
  }

  const category = getFileCategory(file);
  const maxSize = R2_CONFIG.MAX_FILE_SIZES[category] || R2_CONFIG.MAX_FILE_SIZES.document;

  if (file.size > maxSize) {
    return {
      valid: false,
      error: `${category.toUpperCase()} exceeds the maximum size limit of ${formatBytes(maxSize)}. Selected file is ${formatBytes(file.size)}.`,
      category
    };
  }

  return { valid: true, category };
}

export default R2_CONFIG;
