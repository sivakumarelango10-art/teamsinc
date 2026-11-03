import React, { useState, useEffect, useCallback } from 'react';
import { BarChart2, CheckCircle2, Circle, CheckSquare, Square, Lock, Unlock, Clock, Users, ShieldAlert, Award } from 'lucide-react';
import { collaborationApi } from '../../api/collaborationApi';

export const PollCard = ({
  pollId,
  initialData = null,
  currentUserId,
  currentUserName,
  currentUserRole = 'MEMBER',
  onVoteSuccess
}) => {
  const [poll, setPoll] = useState(initialData);
  const [selectedOptions, setSelectedOptions] = useState([]);
  const [loading, setLoading] = useState(!initialData);
  const [voting, setVoting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');
  const [showVoters, setShowVoters] = useState(false);

  const fetchPollData = useCallback(async () => {
    const id = pollId || initialData?.id;
    if (!id) return;
    try {
      const data = await collaborationApi.getPoll(id, currentUserId);
      if (data) {
        setPoll(data);
        // Pre-select options user already voted for
        const preselected = (data.options || [])
          .filter(opt => opt.hasVoted)
          .map(opt => opt.id);
        setSelectedOptions(preselected);
      }
    } catch (err) {
      console.warn('Failed to fetch poll:', err);
    } finally {
      setLoading(false);
    }
  }, [pollId, initialData?.id, currentUserId]);

  useEffect(() => {
    fetchPollData();
    // Refresh periodically if poll is active
    const interval = setInterval(fetchPollData, 10000);
    return () => clearInterval(interval);
  }, [fetchPollData]);

  if (loading && !poll) {
    return (
      <div className="p-4 rounded-2xl bg-neutral-900/80 border border-neutral-800 text-neutral-400 text-xs flex items-center gap-2 animate-pulse">
        <BarChart2 className="w-4 h-4 animate-spin text-purple-400" />
        <span>Loading poll details...</span>
      </div>
    );
  }

  if (!poll) return null;

  const isClosed = poll.is_closed || (poll.closes_at && new Date(poll.closes_at) <= new Date());
  const canClose = !isClosed && (currentUserId === poll.creator_id || ['FOUNDER', 'ADMIN', 'FOUNDING_ADVISOR'].includes(currentUserRole));
  const hasUserVoted = poll.userHasVoted || (poll.options || []).some(o => o.hasVoted);
  const canVote = !isClosed && (!hasUserVoted || poll.allow_vote_change);

  const handleToggleOption = (optId) => {
    if (!canVote) return;
    setError('');

    if (poll.is_multiple_choice) {
      setSelectedOptions(prev => 
        prev.includes(optId) ? prev.filter(id => id !== optId) : [...prev, optId]
      );
    } else {
      setSelectedOptions([optId]);
    }
  };

  const handleVoteSubmit = async () => {
    if (selectedOptions.length === 0) {
      setError('Please select at least one option.');
      return;
    }
    setVoting(true);
    setError('');
    try {
      await collaborationApi.votePoll({
        poll_id: poll.id,
        option_ids: selectedOptions,
        voter_id: currentUserId,
        voter_name: currentUserName
      });
      await fetchPollData();
      if (onVoteSuccess) onVoteSuccess(poll.id);
    } catch (err) {
      setError(err.message || 'Failed to submit vote');
    } finally {
      setVoting(false);
    }
  };

  const handleClosePoll = async () => {
    if (!window.confirm('Are you sure you want to end this poll early? No more votes will be accepted.')) return;
    setClosing(true);
    try {
      await collaborationApi.closePoll(poll.id, currentUserId, currentUserRole);
      await fetchPollData();
    } catch (err) {
      setError(err.message || 'Failed to close poll');
    } finally {
      setClosing(false);
    }
  };

  const totalVoters = poll.totalVotersCount || 0;

  return (
    <div className="w-full max-w-md my-2 rounded-2xl bg-neutral-950/90 border border-neutral-800 shadow-xl overflow-hidden text-neutral-200">
      {/* Header Bar */}
      <div className="p-3.5 bg-neutral-900/80 border-b border-neutral-800 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-purple-950/80 border border-purple-800/80 flex items-center justify-center text-purple-300 shrink-0">
            <BarChart2 className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-300 border border-purple-800/60">
                Poll
              </span>
              {isClosed ? (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-950/80 text-red-300 border border-red-800/60 flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" /> Closed
                </span>
              ) : (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 flex items-center gap-1">
                  <Unlock className="w-2.5 h-2.5" /> Active
                </span>
              )}
              {poll.is_anonymous && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
                  Anonymous
                </span>
              )}
            </div>
            <h4 className="text-sm font-bold text-white mt-1 leading-snug">
              {poll.question}
            </h4>
          </div>
        </div>
      </div>

      {poll.description && (
        <div className="px-4 pt-2.5 text-xs text-neutral-400 leading-relaxed">
          {poll.description}
        </div>
      )}

      {/* Options List */}
      <div className="p-4 space-y-2.5">
        {(poll.options || []).map((opt) => {
          const isSelected = selectedOptions.includes(opt.id);
          const percentage = opt.percentage || 0;
          const voteCount = opt.voteCount || 0;

          return (
            <div
              key={opt.id}
              onClick={() => canVote && handleToggleOption(opt.id)}
              className={`relative overflow-hidden rounded-xl border transition-all select-none ${
                canVote ? 'cursor-pointer hover:border-neutral-600' : 'cursor-default'
              } ${
                isSelected
                  ? 'border-purple-500/80 bg-purple-950/20'
                  : 'border-neutral-800 bg-neutral-900/40'
              }`}
            >
              {/* Animated Progress Bar fill */}
              <div
                className={`absolute top-0 bottom-0 left-0 transition-all duration-500 ${
                  isSelected ? 'bg-purple-600/25' : 'bg-neutral-800/50'
                }`}
                style={{ width: `${percentage}%` }}
              />

              {/* Option content */}
              <div className="relative p-2.5 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {canVote ? (
                    poll.is_multiple_choice ? (
                      isSelected ? (
                        <CheckSquare className="w-4 h-4 text-purple-400 shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-neutral-500 shrink-0" />
                      )
                    ) : isSelected ? (
                      <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 text-neutral-500 shrink-0" />
                    )
                  ) : opt.hasVoted ? (
                    <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                  ) : null}

                  <span className={`font-medium truncate ${isSelected ? 'text-white font-semibold' : 'text-neutral-200'}`}>
                    {opt.text}
                  </span>
                </div>

                {/* Percentage & Vote Count */}
                <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
                  <span className="font-bold text-white">{percentage}%</span>
                  <span className="text-neutral-400 text-[10px]">({voteCount})</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="mx-4 mb-3 p-2 rounded-lg bg-red-950/60 border border-red-800/60 text-red-300 text-xs flex items-center gap-2">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Footer Controls & Stats */}
      <div className="p-3 bg-neutral-900/60 border-t border-neutral-850 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-[11px] text-neutral-400">
          <Users className="w-3.5 h-3.5 text-neutral-500" />
          <span>{totalVoters} {totalVoters === 1 ? 'voter' : 'voters'}</span>
          <span>·</span>
          <span>{poll.is_multiple_choice ? 'Multiple choice' : 'Single choice'}</span>
        </div>

        <div className="flex items-center gap-2">
          {canVote && (
            <button
              type="button"
              disabled={voting || selectedOptions.length === 0}
              onClick={handleVoteSubmit}
              className="px-3 py-1 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs transition cursor-pointer shadow-sm"
            >
              {voting ? 'Saving...' : hasUserVoted ? 'Update Vote' : 'Vote'}
            </button>
          )}

          {canClose && (
            <button
              type="button"
              disabled={closing}
              onClick={handleClosePoll}
              className="px-2.5 py-1 rounded-xl bg-neutral-800 hover:bg-red-950 hover:text-red-300 text-neutral-400 text-[11px] font-semibold border border-neutral-700 transition cursor-pointer"
            >
              {closing ? 'Closing...' : 'Close Poll'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PollCard;

