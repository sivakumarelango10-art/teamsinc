import React from 'react';

export const StatCard = ({
  title,
  value,
  subtitle,
  icon: Icon,
  trend
}) => {
  return (
    <div className="p-5 rounded-2xl bg-neutral-950 border border-neutral-800 transition-all duration-200 hover:border-neutral-700 hover:shadow-lg">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">{title}</span>
        {Icon && (
          <div className="p-2 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300">
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <h3 className="text-3xl font-extrabold text-white tracking-tight">{value}</h3>
        {trend && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-neutral-700 bg-neutral-900 text-neutral-300">
            {trend}
          </span>
        )}
      </div>

      {subtitle && (
        <p className="mt-1.5 text-xs text-neutral-500 truncate">{subtitle}</p>
      )}
    </div>
  );
};

export default StatCard;
