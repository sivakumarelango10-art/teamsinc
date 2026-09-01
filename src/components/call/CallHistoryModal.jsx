import React, { useState, useEffect } from 'react';
import { X, Phone, Video, Users, Calendar, Clock, Loader2, ArrowUpRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { callApi } from '../../api/callApi';

export const CallHistoryModal = ({ roomId = 'general', isOpen, onClose }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all' | 'video' | 'voice'

  useEffect(() => {
    if (!isOpen) return;

    const loadHistory = async () => {
      setLoading(true);
      try {
        const list = await callApi.getCallHistory(roomId, 50);
        setHistory(list);
      } catch (err) {
        console.error('Failed to load call history:', err);
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, [isOpen, roomId]);

  if (!isOpen) return null;

  const formatDuration = (seconds) => {
    if (!seconds || seconds <= 0) return '< 1 min';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s > 0 ? `${s}s` : ''}`;
  };

  const formatCallDate = (isoStr) => {
    try {
      const date = parseISO(isoStr);
      return format(date, 'MMM d, yyyy • h:mm a');
    } catch {
      return 'Recent call';
    }
  };

  const filteredHistory = history.filter(item => {
    if (filter === 'video') return item.call_type !== 'voice';
    if (filter === 'voice') return item.call_type === 'voice';
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="w-full max-w-xl bg-neutral-950 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm md:text-base font-bold text-white">Call History</h3>
              <p className="text-[11px] text-neutral-400">Past group calls in #general</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="px-6 py-2.5 border-b border-neutral-800 bg-neutral-900/30 flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-full font-semibold transition cursor-pointer ${
              filter === 'all'
                ? 'bg-white text-black'
                : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
            }`}
          >
            All Calls ({history.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('video')}
            className={`px-3 py-1.5 rounded-full font-semibold transition cursor-pointer ${
              filter === 'video'
                ? 'bg-white text-black'
                : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
            }`}
          >
            Video
          </button>
          <button
            type="button"
            onClick={() => setFilter('voice')}
            className={`px-3 py-1.5 rounded-full font-semibold transition cursor-pointer ${
              filter === 'voice'
                ? 'bg-white text-black'
                : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
            }`}
          >
            Voice Only
          </button>
        </div>

        {/* List of Calls */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-neutral-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              <p className="text-xs">Loading call history...</p>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="py-12 text-center text-neutral-500 space-y-2">
              <Clock className="w-8 h-8 mx-auto opacity-30 text-neutral-400" />
              <p className="text-xs text-neutral-300 font-semibold">No call records found</p>
              <p className="text-[11px] text-neutral-500">
                Calls started in this group chat will automatically appear here with duration and participants.
              </p>
            </div>
          ) : (
            filteredHistory.map((item) => {
              const isVoice = item.call_type === 'voice';
              const pList = Array.isArray(item.participants) ? item.participants : [];

              return (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-neutral-900/70 border border-neutral-800 hover:border-neutral-700 transition flex items-center justify-between gap-3 shadow-md"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                      isVoice
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    }`}>
                      {isVoice ? <Phone className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs md:text-sm font-bold text-white">
                          {isVoice ? 'Group Voice Call' : 'Group Video Call'}
                        </h4>
                        <span className="text-[10px] font-semibold text-neutral-400">
                          by {item.caller_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-neutral-400 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-neutral-500" />
                          {formatCallDate(item.started_at)}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 font-mono text-neutral-300">
                          <Clock className="w-3 h-3 text-neutral-500" />
                          {formatDuration(item.duration_seconds)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-neutral-950 border border-neutral-800 text-[11px] text-neutral-300">
                      <Users className="w-3 h-3 text-emerald-400" />
                      <span>{pList.length || 1}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default CallHistoryModal;
