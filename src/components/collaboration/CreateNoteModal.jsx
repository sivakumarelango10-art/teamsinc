import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  FileText,
  CheckSquare,
  Plus,
  Trash2,
  Lock,
  Globe,
  Tag,
  Share2,
  AlertCircle
} from 'lucide-react';
import { collaborationApi } from '../../api/collaborationApi';
import { tasksApi } from '../../api/tasksApi';

export const CreateNoteModal = ({
  isOpen,
  onClose,
  initialType = 'GENERAL', // 'GENERAL' | 'TODO' | 'TASK'
  defaultTaskId = null,
  channel = 'general',
  conversationId = null,
  currentUserId,
  onNoteCreated
}) => {
  const [category, setCategory] = useState(initialType === 'TODO' ? 'TODO' : 'GENERAL');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState('SHARED'); // 'PERSONAL' | 'SHARED'
  const [taskId, setTaskId] = useState(defaultTaskId || '');
  const [todoItems, setTodoItems] = useState(['', '']);
  const [tasks, setTasks] = useState([]);
  const [shareToChat, setShareToChat] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialType === 'TODO') setCategory('TODO');
    if (defaultTaskId) {
      setTaskId(defaultTaskId);
      setCategory('TASK_NOTE');
    }
  }, [initialType, defaultTaskId]);

  useEffect(() => {
    if (isOpen) {
      // Load user's tasks for task-linking option
      tasksApi.getTasks().then(res => {
        setTasks(res || []);
      }).catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddTodoItem = () => {
    setTodoItems(prev => [...prev, '']);
  };

  const handleRemoveTodoItem = (index) => {
    if (todoItems.length <= 1) return;
    setTodoItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleTodoChange = (index, value) => {
    setTodoItems(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError('Please provide a note title.');
      return;
    }

    let cleanTodos = [];
    if (category === 'TODO') {
      cleanTodos = todoItems.map(t => t.trim()).filter(Boolean);
      if (cleanTodos.length === 0) {
        setError('Please provide at least one to-do item.');
        return;
      }
    }

    setLoading(true);
    try {
      const payload = {
        title: cleanTitle,
        content: content.trim(),
        category: category,
        visibility: visibility,
        task_id: taskId || null,
        author_id: currentUserId,
        channel: channel || null,
        conversation_id: conversationId || null,
        todo_items: cleanTodos.map(t => ({ text: t, is_completed: false }))
      };

      const note = await collaborationApi.createNote(payload);
      if (onNoteCreated) {
        onNoteCreated(note, shareToChat);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create note. Please try again.');
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
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-950/80 border border-blue-800/80 flex items-center justify-center text-blue-300">
              {category === 'TODO' ? <CheckSquare className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                {category === 'TODO' ? 'Create To-Do Checklist' : 'Create Team Note'}
              </h3>
              <p className="text-xs text-neutral-400">Collaborative notes, checklists, and task memos</p>
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

          {/* Category Tabs */}
          <div className="grid grid-cols-3 gap-2 p-1 bg-neutral-900 border border-neutral-800 rounded-xl">
            {[
              { id: 'GENERAL', label: 'General Note', icon: FileText },
              { id: 'TODO', label: 'To-Do List', icon: CheckSquare },
              { id: 'TASK_NOTE', label: 'Task Memo', icon: Tag }
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = category === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCategory(tab.id)}
                  className={`py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    isActive
                      ? 'bg-white text-black shadow-sm font-bold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <label className="font-semibold text-white">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder={category === 'TODO' ? 'e.g. Deployment Checklist for v2.4' : 'e.g. Sprint Architecture Sync Memo'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 transition text-xs"
            />
          </div>

          {/* Task Link Selection if applicable */}
          {(category === 'TASK_NOTE' || defaultTaskId) && (
            <div className="space-y-1.5">
              <label className="font-semibold text-neutral-300">
                Link to Task
              </label>
              <select
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
                className="w-full px-3.5 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-white focus:outline-none focus:border-blue-500 transition text-xs"
              >
                <option value="">Select an associated task...</option>
                {tasks.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({t.status})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Note Content / Checklist */}
          {category === 'TODO' ? (
            <div className="space-y-2">
              <label className="font-semibold text-white">
                Checklist Items <span className="text-red-400">*</span>
              </label>
              <div className="space-y-2">
                {todoItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-neutral-500 shrink-0" />
                    <input
                      type="text"
                      required
                      placeholder={`Action item ${idx + 1}`}
                      value={item}
                      onChange={(e) => handleTodoChange(idx, e.target.value)}
                      className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 transition text-xs"
                    />
                    {todoItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveTodoItem(idx)}
                        className="p-2 text-neutral-500 hover:text-red-400 hover:bg-neutral-900 rounded-xl transition cursor-pointer"
                        title="Remove item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleAddTodoItem}
                className="mt-2 w-full py-2 border border-dashed border-neutral-700 hover:border-blue-500/80 rounded-xl text-neutral-300 hover:text-blue-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add checklist item</span>
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="font-semibold text-white">
                Note Content
              </label>
              <textarea
                rows={5}
                placeholder="Write your note, meeting minutes, architecture decisions, or team memo..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 transition resize-none leading-relaxed text-xs"
              />
            </div>
          )}

          {/* Visibility Controls */}
          <div className="pt-2 border-t border-neutral-800 space-y-2">
            <label className="font-semibold text-neutral-300">Visibility</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setVisibility('SHARED')}
                className={`p-2.5 rounded-xl border text-left transition flex items-center gap-2 cursor-pointer ${
                  visibility === 'SHARED'
                    ? 'bg-blue-950/40 border-blue-500 text-white'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                <Globe className="w-4 h-4 text-blue-400 shrink-0" />
                <div>
                  <div className="font-bold text-xs">Shared Note</div>
                  <div className="text-[10px] text-neutral-400">Visible to channel & team</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setVisibility('PERSONAL')}
                className={`p-2.5 rounded-xl border text-left transition flex items-center gap-2 cursor-pointer ${
                  visibility === 'PERSONAL'
                    ? 'bg-neutral-800 border-neutral-600 text-white'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                <Lock className="w-4 h-4 text-neutral-400 shrink-0" />
                <div>
                  <div className="font-bold text-xs">Personal Note</div>
                  <div className="text-[10px] text-neutral-400">Only visible to you</div>
                </div>
              </button>
            </div>
          </div>

          {/* Share to Chat Toggle */}
          {visibility === 'SHARED' && (
            <label className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-900/60 border border-neutral-800 cursor-pointer hover:border-neutral-700 transition">
              <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-blue-400" />
                <span className="font-semibold text-white">Publish card to current chat</span>
              </div>
              <input
                type="checkbox"
                checked={shareToChat}
                onChange={(e) => setShareToChat(e.target.checked)}
                className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
              />
            </label>
          )}

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
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs transition cursor-pointer shadow-lg shadow-blue-900/30 flex items-center gap-2"
            >
              {loading ? 'Saving...' : 'Create Note'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default CreateNoteModal;
