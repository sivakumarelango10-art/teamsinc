import React from 'react';

export const BrandLogo = ({ size = 'default', showText = true, className = '' }) => {
  const sizeMap = {
    small: 'w-7 h-7',
    default: 'w-8 h-8',
    large: 'w-12 h-12',
    xl: 'w-16 h-16'
  };

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className={`${sizeMap[size] || sizeMap.default} rounded-lg bg-white overflow-hidden p-0.5 flex items-center justify-center shadow-md shrink-0`}>
        <img
          src="/logo.png"
          alt="TeamSync Logo"
          className="w-full h-full object-contain"
          loading="eager"
        />
      </div>
      {showText && (
        <span className="font-extrabold text-lg text-white tracking-tight">
          Team<span className="text-neutral-400">Sync</span>
        </span>
      )}
    </div>
  );
};

export default BrandLogo;
