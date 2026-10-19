import React, { useState } from 'react';

/**
 * Common Avatar component for TeamSync
 * Handles:
 * - Google OAuth profile pictures (lh3.googleusercontent.com) with referrerPolicy="no-referrer"
 * - Supabase storage uploaded avatars
 * - Graceful fallback to initial letter on image load error or missing src
 * - Optional online / offline presence status indicator
 */
export const Avatar = ({
  src,
  name = '',
  size = 'md', // 'xs' (20px), 'sm' (28px), 'md' (36px), 'lg' (40px), 'xl' (48px), '2xl' (96px/112px)
  rounded = 'rounded-lg',
  className = '',
  status = null, // 'online' | 'offline' | null
  showStatus = false,
  statusSize = 'sm', // 'xs' | 'sm' | 'md'
  border = true
}) => {
  const [imgError, setImgError] = useState(false);

  const initial = (name?.trim()?.charAt(0) || 'U').toUpperCase();

  // Size mappings
  const sizeClasses = {
    xs: 'w-5 h-5 text-[10px]',
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-xs',
    lg: 'w-10 h-10 text-sm',
    xl: 'w-12 h-12 text-base',
    '2xl': 'w-24 h-24 sm:w-28 sm:h-28 text-3xl'
  };

  const statusSizeClasses = {
    xs: 'w-2 h-2 -bottom-0.5 -right-0.5',
    sm: 'w-2.5 h-2.5 -bottom-0.5 -right-0.5',
    md: 'w-3 h-3 -bottom-0.5 -right-0.5'
  };

  const containerSizeClass = sizeClasses[size] || size;
  const statusSizeClass = statusSizeClasses[statusSize] || statusSizeClasses.sm;

  const hasValidImage = Boolean(src && !imgError);

  return (
    <div className={`relative shrink-0 select-none ${className}`}>
      <div
        className={`${containerSizeClass} ${rounded} bg-neutral-900 ${
          border ? 'border border-neutral-700' : ''
        } flex items-center justify-center font-bold text-white shadow-sm overflow-hidden`}
      >
        {hasValidImage ? (
          <img
            src={src}
            alt={name || 'User Avatar'}
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="flex items-center justify-center w-full h-full">
            {initial}
          </span>
        )}
      </div>

      {showStatus && status && (
        <span
          className={`absolute ${statusSizeClass} rounded-full ring-2 ring-black ${
            status === 'online' ? 'bg-emerald-400' : 'bg-neutral-600'
          }`}
          title={status === 'online' ? 'Online now' : 'Offline'}
        />
      )}
    </div>
  );
};

export default Avatar;
