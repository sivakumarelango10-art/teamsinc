import React from 'react';
import { Loader2 } from 'lucide-react';

export const LoadingSpinner = ({ text = 'Loading...', size = 'default' }) => {
  const sizeClasses = {
    small: 'w-4 h-4',
    default: 'w-7 h-7',
    large: 'w-10 h-10'
  };

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 space-y-3">
      <Loader2 className={`${sizeClasses[size] || sizeClasses.default} text-white animate-spin`} />
      {text && <p className="text-xs font-medium text-neutral-400">{text}</p>}
    </div>
  );
};

export default LoadingSpinner;
