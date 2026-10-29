import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  Video,
  List,
  Grid
} from 'lucide-react';
import { LiveCountdown } from './LiveCountdown';

export const MeetingCalendarView = ({ meetings = [], onSelectMeeting }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('month'); // 'month' | 'agenda'

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Month navigation
  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };
  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };
  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  // Map meetings to YYYY-MM-DD
  const meetingsByDate = useMemo(() => {
    const map = new Map();
    meetings.forEach((m) => {
      const d = new Date(m.startTime);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    });
    return map;
  }, [meetings]);

  // Generate calendar grid days for current month
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday
    const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days = [];

    // Preceding month trailing days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const dateObj = new Date(year, month - 1, d);
      const dateKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        dayNumber: d,
        dateKey,
        isCurrentMonth: false,
        meetings: meetingsByDate.get(dateKey) || []
      });
    }

    // Current month days
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const dateObj = new Date(year, month, d);
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        dayNumber: d,
        dateKey,
        isCurrentMonth: true,
        isToday: dateKey === todayKey,
        meetings: meetingsByDate.get(dateKey) || []
      });
    }

    // Trailing next month days to complete 35 or 42 grid cells
    const remaining = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const dateObj = new Date(year, month + 1, d);
      const dateKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        dayNumber: d,
        dateKey,
        isCurrentMonth: false,
        meetings: meetingsByDate.get(dateKey) || []
      });
    }

    return days;
  }, [year, month, meetingsByDate]);

  const weekDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
      {/* Calendar Header Navigation */}
      <div className="p-4 border-b border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-neutral-900/40">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-blue-400" />
            <span>{monthName}</span>
          </h3>
          <button
            type="button"
            onClick={goToToday}
            className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold transition"
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="p-1 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`p-1.5 rounded-lg text-xs transition ${
                viewMode === 'month' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
              }`}
              title="Month Grid View"
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('agenda')}
              className={`p-1.5 rounded-lg text-xs transition ${
                viewMode === 'agenda' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
              }`}
              title="Agenda List View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Month Steppers */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 transition"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 transition"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* MONTH GRID VIEW */}
      {viewMode === 'month' && (
        <div className="p-2 sm:p-4">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2 text-center">
            {weekDayNames.map((d) => (
              <span key={d} className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider py-1">
                {d}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {calendarDays.map((cell, idx) => (
              <div
                key={idx}
                className={`min-h-[90px] sm:min-h-[110px] p-1.5 sm:p-2 rounded-xl border flex flex-col justify-between transition ${
                  cell.isCurrentMonth
                    ? 'bg-neutral-900/30 border-neutral-800/80 hover:border-neutral-700'
                    : 'bg-neutral-950/40 border-neutral-900 text-neutral-600'
                } ${cell.isToday ? 'ring-1 ring-blue-500 bg-blue-950/10' : ''}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-xs font-semibold ${
                      cell.isToday
                        ? 'w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[11px]'
                        : cell.isCurrentMonth
                        ? 'text-neutral-300'
                        : 'text-neutral-600'
                    }`}
                  >
                    {cell.dayNumber}
                  </span>
                  {cell.meetings.length > 0 && (
                    <span className="text-[10px] font-bold text-neutral-400 bg-neutral-800 px-1.5 py-0.5 rounded-full">
                      {cell.meetings.length}
                    </span>
                  )}
                </div>

                {/* Day meetings pills */}
                <div className="space-y-1 overflow-y-auto max-h-[70px] pr-0.5">
                  {cell.meetings.map((m) => {
                    const timeStr = new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const isCancelled = m.status === 'CANCELLED';
                    const isLive = m.computedStatus === 'LIVE';

                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onSelectMeeting(m)}
                        className={`w-full text-left px-1.5 py-1 rounded text-[11px] truncate flex items-center gap-1 transition ${
                          isCancelled
                            ? 'bg-red-950/30 text-red-400/80 line-through border border-red-900/40'
                            : isLive
                            ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/50 font-bold'
                            : 'bg-neutral-800/80 hover:bg-neutral-700 text-neutral-200 border border-neutral-700/60'
                        }`}
                      >
                        <span className="text-[10px] font-mono text-neutral-400 shrink-0">{timeStr}</span>
                        <span className="truncate">{m.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AGENDA LIST VIEW */}
      {viewMode === 'agenda' && (
        <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
          {meetings.length === 0 ? (
            <div className="py-12 text-center text-neutral-500 text-xs">
              No meetings scheduled for this period.
            </div>
          ) : (
            meetings.map((m) => {
              const start = new Date(m.startTime);
              const end = new Date(m.endTime);
              const dateStr = start.toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
              });
              const timeStr = `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

              return (
                <div
                  key={m.id}
                  onClick={() => onSelectMeeting(m)}
                  className="p-3.5 rounded-xl bg-neutral-900/40 hover:bg-neutral-900/80 border border-neutral-800 cursor-pointer flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white">{m.title}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-neutral-800 text-neutral-300 font-medium">
                        {m.meetingType.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-neutral-400 font-mono">
                      <span>{dateStr}</span>
                      <span>•</span>
                      <span>{timeStr}</span>
                      <span>•</span>
                      <span>{m.timezone}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <LiveCountdown
                      startTime={m.startTime}
                      endTime={m.endTime}
                      status={m.status}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default MeetingCalendarView;
