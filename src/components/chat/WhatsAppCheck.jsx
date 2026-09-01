import React from 'react';

/**
 * Authentic WhatsApp Double-Tick & Single-Tick Status Icon
 * @param {string} status - 'pending' | 'sent' | 'delivered' | 'read'
 * @param {boolean} isOptimistic - if true, shows clock / sending state
 */
export const WhatsAppCheck = ({ status = 'read', isOptimistic = false, className = '' }) => {
  if (isOptimistic || status === 'pending') {
    return (
      <svg
        viewBox="0 0 16 16"
        className={`w-3 h-3 text-neutral-500 animate-pulse ${className}`}
        fill="currentColor"
      >
        <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm8-4.5a.75.75 0 0 1 .75.75v3.5l2.25 1.3a.75.75 0 0 1-.75 1.3L7.5 8.75A.75.75 0 0 1 7.25 8V4.25A.75.75 0 0 1 8 3.5z" />
      </svg>
    );
  }

  if (status === 'sent') {
    // Single gray tick
    return (
      <svg
        viewBox="0 0 16 15"
        className={`w-3.5 h-3 text-[#8696a0] shrink-0 ${className}`}
        fill="currentColor"
      >
        <path d="M10.91 3.316l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.875 1.912 6.7a.365.365 0 0 0-.51-.063l-.478.372a.365.365 0 0 0-.063.51l3.235 3.874a.365.365 0 0 0 .563.01l6.314-7.577a.365.365 0 0 0-.063-.51z" />
      </svg>
    );
  }

  // Double blue/cyan ticks (Official WhatsApp double checkmark SVG)
  const isRead = status === 'read' || status === 'delivered';
  const colorClass = isRead ? 'text-[#53bdeb]' : 'text-[#8696a0]';

  return (
    <svg
      viewBox="0 0 16 15"
      className={`w-4 h-3.5 ${colorClass} shrink-0 ${className}`}
      fill="currentColor"
    >
      <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.875 6.012 6.7a.365.365 0 0 0-.51-.063l-.478.372a.365.365 0 0 0-.063.51l3.235 3.874a.365.365 0 0 0 .563.01l6.314-7.577a.365.365 0 0 0-.063-.51zm-4.24 0l-.478-.372a.365.365 0 0 0-.51.063L4.426 9.875 2.772 7.89a.365.365 0 0 0-.51-.063l-.478.372a.365.365 0 0 0-.063.51l2.195 2.684a.365.365 0 0 0 .563.01l6.314-7.577a.365.365 0 0 0-.063-.51z" />
    </svg>
  );
};

export default WhatsAppCheck;
