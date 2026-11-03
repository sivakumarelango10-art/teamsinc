import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, BarChart2, CheckSquare, EyeOff, RefreshCw, Calendar, AlertCircle } from 'lucide-react';
import { collaborationApi } from '../../api/collaborationApi';

export const CreatePollModal = ({
  isOpen,
  onClose,
  channel = 'general',
  conversationId = null,
  currentUserId,
  onPollCreated
}) => {
  const [question, setQuestion] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [isMultipleChoice, setIsMultipleChoice] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [allowVoteChange, setAllowVoteChange] = useState(true);
  const [closesAt, setClosesAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleAddOption = () => {
    if (options.length >= 10) return;
    setOptions(prev => [...prev, '']);
  };

  const handleRemoveOption = (index) => {
    if (options.length <= 2) return;
    setOptions(prev => prev.filter((_, i) => i !== index));
  };

  const handleOptionChange = (index, value) => {
    setOptions(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanQuestion = question.trim();
    if (!cleanQuestion) {
      setError('Please provide a poll question.');
      return;
    }

    const cleanOptions = options.map(o => o.trim()).filter(Boolean);
    if (cleanOptions.length < 2) {
      setError('Please provide at least two valid options.');
      return;
    }

    // Check for duplicate options
    const uniqueOptions = new Set(cleanOptions.map(o => o.toLowerCase()));
    if (uniqueOptions.size !== cleanOptions.length) {
      setError('All options must be unique.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        question: cleanQuestion,
        description: description.trim() || null,
        options: cleanOptions,
        is_multiple_choice: isMultipleChoice,
        is_anonymous: isAnonymous,
        allow_vote_change: allowVoteChange,
        closes_at: closesAt ? new Date(closesAt).toISOString() : null,
        creator_id: currentUserId,
        channel: channel || null,
        conversation_id: conversationId || null
      };

      const poll = await collaborationApi.createPoll(payload);
      if (onPollCreated) {
        onPollCreated(poll);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create poll. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl p-6 relative overflow-hidden modal-enter max-h-[90vh] flex flex-col">
        {/* Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-indigo-500 to-purple-600" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-950/80 border border-purple-800/80 flex items-center justify-center text-purple-300">
              <BarChart2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Create a Poll</h3>
              <p className="text-xs text-neutral-400">Collect opinions and team feedback in real time</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white transition cursor-pointer p-1 rounded-lg hover:bg-neutral-900"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-4 pt-4 pr-1 text-xs text-neutral-200">
          {error && (
            <div className="p-3 rounded-xl bg-red-950/60 border border-red-800/60 text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Question */}
          <div className="space-y-1.5">
            <label className="font-semibold text-white">
              Poll Question <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Which API architecture should we adopt for v2?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500 transition"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="font-semibold text-neutral-300">
              Description <span className="text-neutral-500">(Optional context)</span>
            </label>
            <textarea
              rows={2}
              placeholder="Add extra context, background links, or voting guidelines..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500 transition resize-none"
            />
          </div>

          {/* Options */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-white">
                Options <span className="text-red-400">*</span>
              </label>
              <span className="text-[11px] text-neutral-400">
                {options.length}/10 options
              </span>
            </div>

            <div className="space-y-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="w-6 text-center font-mono text-[11px] text-neutral-500">
                    {idx + 1}.
                  </div>
                  <input
                    type="text"
                    required
                    placeholder={`Option ${idx + 1}`}
                    value={opt}
                    onChange={(e) => handleOptionChange(idx, e.target.value)}
                    className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-white placeholder-neutral-600 focus:outline-none focus:border-purple-500 transition text-xs"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(idx)}
                      className="p-2 text-neutral-500 hover:text-red-400 hover:bg-neutral-900 rounded-xl transition cursor-pointer"
                      title="Remove option"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {options.length < 10 && (
              <button
                type="button"
                onClick={handleAddOption}
                className="mt-2 w-full py-2 border border-dashed border-neutral-700 hover:border-purple-500/80 rounded-xl text-neutral-300 hover:text-purple-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add another option</span>
              </button>
            )}
          </div>

          {/* Settings Grid */}
          <div className="pt-2 border-t border-neutral-800 space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              Poll Settings
            </h4>

            {/* Multiple Choice Toggle */}
            <label className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-900/60 border border-neutral-800/80 cursor-pointer hover:border-neutral-700 transition">
              <div className="flex items-center gap-2.5">
                <CheckSquare className="w-4 h-4 text-purple-400" />
                <div>
                  <div className="font-semibold text-white">Multiple Choice</div>
                  <div className="text-[10px] text-neutral-400">Allow members to select more than one option</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={isMultipleChoice}
                onChange={(e) => setIsMultipleChoice(e.target.checked)}
                className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
              />
            </label>

            {/* Anonymous Toggle */}
            <label className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-900/60 border border-neutral-800/80 cursor-pointer hover:border-neutral-700 transition">
              <div className="flex items-center gap-2.5">
                <EyeOff className="w-4 h-4 text-purple-400" />
                <div>
                  <div className="font-semibold text-white">Anonymous Voting</div>
                  <div className="text-[10px] text-neutral-400">Keep individual voter names private from results</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
              />
            </label>

            {/* Allow Vote Change Toggle */}
            <label className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-900/60 border border-neutral-800/80 cursor-pointer hover:border-neutral-700 transition">
              <div className="flex items-center gap-2.5">
                <RefreshCw className="w-4 h-4 text-purple-400" />
                <div>
                  <div className="font-semibold text-white">Allow Vote Change</div>
                  <div className="text-[10px] text-neutral-400">Voters can alter their selection before poll closes</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={allowVoteChange}
                onChange={(e) => setAllowVoteChange(e.target.checked)}
                className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
              />
            </label>

            {/* Closes At (Optional) */}
            <div className="p-2.5 rounded-xl bg-neutral-900/60 border border-neutral-800/80 space-y-1.5">
              <div className="flex items-center gap-2 text-neutral-300 font-semibold">
                <Calendar className="w-4 h-4 text-purple-400" />
                <span>Closing Deadline (Optional)</span>
              </div>
              <input
                type="datetime-local"
                value={closesAt}
                onChange={(e) => setClosesAt(e.target.value)}
                className="w-full px-3 py-1.5 bg-black border border-neutral-800 rounded-lg text-white text-xs focus:outline-none focus:border-purple-500 transition"
              />
            </div>
          </div>

          {/* Modal Footer */}
          <div className="pt-3 border-t border-neutral-800 flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-neutral-400 hover:text-white font-semibold hover:bg-neutral-900 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs transition cursor-pointer shadow-lg shadow-purple-900/30 flex items-center gap-2"
            >
              {loading ? 'Publishing...' : 'Publish Poll'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default CreatePollModal;
