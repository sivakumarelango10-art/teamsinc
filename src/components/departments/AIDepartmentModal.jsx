import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Bot,
  X,
  Loader2,
  Building2,
  CheckCircle2,
  Plus,
  Users,
  Briefcase,
  AlertCircle,
  Lightbulb
} from 'lucide-react';
import { geminiApi } from '../../api/geminiApi';
import { departmentsApi } from '../../api/departmentsApi';

export const AIDepartmentModal = ({ isOpen, onClose, currentDepartments = [], onCreated }) => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [savingIds, setSavingIds] = useState(new Set());
  const [createdCount, setCreatedCount] = useState(0);

  // Close modal on ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleGenerate = async (preset = null) => {
    const query = preset || prompt.trim();
    if (!query && !preset) {
      setError('Please provide organizational focus or select a preset.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setResult(null);

      const plan = await geminiApi.generateDepartmentSuggestions({
        prompt: query,
        currentDepartments
      });

      setResult(plan);
    } catch (err) {
      console.error('AI Department Generation error:', err);
      setError(err.message || 'Failed to generate department recommendations.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDepartment = async (dept, index) => {
    try {
      setSavingIds(prev => new Set([...prev, index]));
      await departmentsApi.createDepartment({
        name: dept.name,
        description: dept.description
      });
      setCreatedCount(prev => prev + 1);
      if (onCreated) onCreated();
    } catch (err) {
      setError(`Failed to create ${dept.name}: ${err.message}`);
    } finally {
      setSavingIds(prev => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

  const handleCreateAll = async () => {
    if (!result?.departments?.length) return;
    try {
      setLoading(true);
      for (let i = 0; i < result.departments.length; i++) {
        const d = result.departments[i];
        await departmentsApi.createDepartment({
          name: d.name,
          description: d.description
        });
      }
      if (onCreated) onCreated();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create departments');
    } finally {
      setLoading(false);
    }
  };

  const PRESETS = [
    'AI / Machine Learning & Core Engineering',
    'Full-Stack Web & Mobile Product Suite',
    'Enterprise Operations, Security & DevOps',
    'Product Design, UX Research & Quality Assurance'
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-neutral-950 border border-neutral-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] modal-enter">
        {/* Header */}
        <div className="p-6 border-b border-neutral-850 flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl overflow-hidden shadow-md shrink-0 border border-neutral-750 bg-black">
              <img src="/ai-logo.png" alt="AI" className="w-full h-full object-cover" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>AI Department Architect</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-950 border border-purple-800 text-purple-300 font-bold uppercase">
                  Enterprise AI
                </span>
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Generate high-performance department structures, missions, and scopes tailored to your vision.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-900 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="p-3.5 rounded-2xl bg-red-950/60 border border-red-800 text-red-300 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Prompt Input */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-neutral-300 block">
              Describe your company vision, product focus, or organizational goals:
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. We are building a high-scale real-time collaboration suite. Suggest engineering, QA, design, and growth departments with clear responsibility boundaries."
              rows={3}
              className="w-full p-3.5 bg-neutral-900 border border-neutral-800 rounded-2xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500 transition resize-none leading-relaxed"
            />

            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase font-bold text-neutral-500 mr-1 flex items-center gap-1">
                <Lightbulb className="w-3 h-3 text-amber-400" /> Quick Presets:
              </span>
              {PRESETS.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setPrompt(p);
                    handleGenerate(p);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 text-[11px] text-neutral-300 font-medium transition cursor-pointer"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => handleGenerate()}
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-white text-black hover:bg-neutral-200 disabled:opacity-50 text-xs font-bold transition flex items-center gap-2 shadow-md cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Architecting Departments...</span>
                </>
              ) : (
                <>
                  <Bot className="w-4 h-4 text-purple-600" />
                  <span>Generate Structure</span>
                </>
              )}
            </button>
          </div>

          {/* AI Result Cards */}
          {result && (
            <div className="space-y-4 pt-4 border-t border-neutral-850 animate-fadeIn">
              {result.strategicRationale && (
                <div className="p-3.5 rounded-2xl bg-purple-950/30 border border-purple-800/50 text-xs text-purple-200">
                  <span className="font-bold text-purple-300">Executive Rationale: </span>
                  {result.strategicRationale}
                </div>
              )}

              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                  Recommended Departments ({result.departments?.length || 0})
                </h3>
                {result.departments?.length > 0 && (
                  <button
                    type="button"
                    onClick={handleCreateAll}
                    disabled={loading}
                    className="text-xs text-purple-400 hover:text-purple-300 font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create All Departments</span>
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {result.departments?.map((dept, index) => {
                  const isSaving = savingIds.has(index);
                  return (
                    <div
                      key={index}
                      className="p-4 rounded-2xl bg-neutral-900/70 border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:border-neutral-700 transition"
                    >
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-purple-400" />
                          <h4 className="text-sm font-bold text-white">{dept.name}</h4>
                          {dept.suggestedHeadcount && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 font-medium">
                              ~{dept.suggestedHeadcount} Staff
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-neutral-400 leading-relaxed">
                          {dept.description}
                        </p>
                        {dept.keyRoles?.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap pt-1">
                            {dept.keyRoles.map((r, ri) => (
                              <span
                                key={ri}
                                className="text-[10px] px-2 py-0.5 rounded bg-neutral-950 border border-neutral-800 text-neutral-400 font-mono"
                              >
                                {r}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCreateDepartment(dept, index)}
                        disabled={isSaving}
                        className="px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white border border-neutral-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition shrink-0 cursor-pointer disabled:opacity-50"
                      >
                        {isSaving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                        <span>Create</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AIDepartmentModal;
