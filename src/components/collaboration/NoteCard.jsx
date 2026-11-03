import React, { useState } from 'react';
import {
  FileText,
  CheckSquare,
  Square,
  Lock,
  Globe,
  Tag,
  CheckCircle2,
  Calendar,
  ExternalLink
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { collaborationApi } from '../../api/collaborationApi';

export const NoteCard = ({
  note,
  currentUserId,
  onOpenTask,
  isCompact = false
}) => {
  const [todoItems, setTodoItems] = useState(note?.todo_items || []);
  const [togglingId, setTogglingId] = useState(null);

  if (!note) return null;

  const isAuthor = currentUserId === note.author_id;
  const isTodo = note.category === 'TODO' || (todoItems && todoItems.length > 0);

  const completedCount = todoItems.filter(t => t.is_completed).length;
  const totalCount = todoItems.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const handleToggleItem = async (item) => {
    const nextCompleted = !item.is_completed;
    // Optimistic update
    setTodoItems(prev => prev.map(t => t.id === item.id ? { ...t, is_completed: nextCompleted } : t));
    setTogglingId(item.id);

    try {
      await collaborationApi.toggleTodoItem(item.id, nextCompleted);
    } catch (err) {
      // Revert on error
      setTodoItems(prev => prev.map(t => t.id === item.id ? { ...t, is_completed: item.is_completed } : t));
      console.error('Failed to toggle todo item:', err);
    } finally {
      setTogglingId(null);
    }
  };

  const getCategoryColor = (cat) => {
    switch (cat) {
      case 'TODO': return 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80';
      case 'MEETING': return 'bg-blue-950/80 text-blue-300 border-blue-800/80';
      case 'IDEA': return 'bg-amber-950/80 text-amber-300 border-amber-800/80';
      case 'TASK_NOTE': return 'bg-purple-950/80 text-purple-300 border-purple-800/80';
      default: return 'bg-neutral-800 text-neutral-300 border-neutral-700';
    }
  };

  return (
    <div className={`w-full max-w-md my-2 rounded-2xl bg-neutral-950/90 border border-neutral-800 shadow-xl overflow-hidden text-neutral-200 transition ${isCompact ? 'p-3' : ''}`}>
      {/* Header */}
      <div className="p-3.5 bg-neutral-900/80 border-b border-neutral-800 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-950/80 border border-blue-800/80 flex items-center justify-center text-blue-300 shrink-0">
            {isTodo ? <CheckSquare className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${getCategoryColor(note.category)}`}>
                {note.category || 'NOTE'}
              </span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                note.visibility === 'PERSONAL'
                  ? 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                  : 'bg-indigo-950/80 text-indigo-300 border border-indigo-800/80'
              }`}>
                {note.visibility === 'PERSONAL' ? (
                  <>
                    <Lock className="w-2.5 h-2.5" /> Personal
                  </>
                ) : (
                  <>
                    <Globe className="w-2.5 h-2.5" /> Shared
                  </>
                )}
              </span>
            </div>
            <h4 className="text-sm font-bold text-white mt-1 leading-snug">
              {note.title}
            </h4>
          </div>
        </div>
      </div>

      {/* Linked Task Callout if present */}
      {note.task && (
        <div className="mx-3.5 mt-3 p-2 rounded-xl bg-purple-950/30 border border-purple-800/50 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-purple-300 min-w-0 flex-1">
            <Tag className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[11px] text-neutral-400 font-medium">Linked Task:</span>
            <span className="font-bold truncate text-white">{note.task.title}</span>
          </div>
          {onOpenTask && (
            <button
              type="button"
              onClick={() => onOpenTask(note.task.id)}
              className="p-1 text-purple-400 hover:text-white transition cursor-pointer"
              title="View task details"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Note Content */}
      {note.content && (
        <div className="px-4 py-3 text-xs text-neutral-300 leading-relaxed whitespace-pre-wrap">
          {note.content}
        </div>
      )}

      {/* To-Do List Items */}
      {isTodo && todoItems.length > 0 && (
        <div className="p-3.5 pt-1 space-y-2.5">
          {/* Progress Bar */}
          <div className="space-y-1 pb-1">
            <div className="flex items-center justify-between text-[11px] text-neutral-400 font-mono">
              <span>{completedCount} of {totalCount} completed</span>
              <span className="font-bold text-white">{progressPercent}%</span>
            </div>
            <div className="h-1.5 w-full bg-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Checklist */}
          <div className="space-y-1.5">
            {todoItems.map((item) => {
              const isChecked = item.is_completed;
              return (
                <div
                  key={item.id}
                  onClick={() => handleToggleItem(item)}
                  className={`p-2 rounded-xl border transition-all flex items-start gap-2.5 cursor-pointer text-xs select-none ${
                    isChecked
                      ? 'bg-neutral-900/40 border-neutral-850 opacity-60'
                      : 'bg-neutral-900/80 border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  <div className="pt-0.5 shrink-0">
                    {isChecked ? (
                      <CheckSquare className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Square className="w-4 h-4 text-neutral-500 hover:text-neutral-300" />
                    )}
                  </div>
                  <span className={`flex-1 leading-snug break-words ${isChecked ? 'line-through text-neutral-500' : 'text-neutral-200'}`}>
                    {item.text}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer Meta */}
      <div className="p-3 bg-neutral-900/60 border-t border-neutral-850 flex items-center justify-between text-[11px] text-neutral-400">
        <div className="flex items-center gap-1.5">
          <span>By {note.author?.full_name || 'Team Member'}</span>
        </div>
        {note.created_at && (
          <div className="flex items-center gap-1 font-mono text-[10px]">
            <Calendar className="w-3 h-3 text-neutral-500" />
            <span>{format(parseISO(note.created_at), 'MMM d, h:mm a')}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default NoteCard;
