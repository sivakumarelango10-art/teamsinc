import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

export const TaskForm = ({
  isOpen,
  onClose,
  onSubmit,
  initialData = null,
  members = [],
  departments = [],
  currentUserId
}) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    assigned_to: '',
    department_id: '',
    priority: 'MEDIUM',
    deadline: format(new Date(), 'yyyy-MM-dd'),
    status: 'TODO'
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData({
        title: initialData.title || '',
        description: initialData.description || '',
        assigned_to: initialData.assigned_to || '',
        department_id: initialData.department_id || '',
        priority: initialData.priority || 'MEDIUM',
        deadline: initialData.deadline || format(new Date(), 'yyyy-MM-dd'),
        status: initialData.status || 'TODO'
      });
    } else {
      setFormData({
        title: '',
        description: '',
        assigned_to: members.length > 0 ? members[0].id : '',
        department_id: departments.length > 0 ? departments[0].id : '',
        priority: 'MEDIUM',
        deadline: format(new Date(), 'yyyy-MM-dd'),
        status: 'TODO'
      });
    }
    setError('');
  }, [initialData, isOpen, members, departments]);

  if (!isOpen) return null;

  const activeMembers = members.filter(m => m.is_active !== false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      setError('Please provide a task title');
      return;
    }
    if (!formData.assigned_to) {
      setError('Please choose an active team member');
      return;
    }
    if (!formData.deadline) {
      setError('Please choose a deadline');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await onSubmit({
        ...formData,
        assigned_by: initialData?.assigned_by || currentUserId
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save task');
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
      <div className="w-full max-w-lg bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl p-6 relative modal-enter">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-xl font-bold text-white mb-4">
          {initialData ? 'Edit Task' : 'Create New Task'}
        </h3>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-neutral-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
              Task Title *
            </label>
            <input
              type="text"
              required
              placeholder="e.g., Design onboarding experience in Figma"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-black border border-neutral-800 rounded-xl text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-white text-sm transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
              Description
            </label>
            <textarea
              rows={3}
              placeholder="Provide context, acceptance criteria, or relevant links..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-black border border-neutral-800 rounded-xl text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-white text-sm transition"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
                Assign To *
              </label>
              <select
                value={formData.assigned_to}
                onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-black border border-neutral-800 rounded-xl text-neutral-100 focus:outline-none focus:border-white text-sm transition"
              >
                <option value="">Select Team Member</option>
                {activeMembers.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.full_name} ({m.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
                Department
              </label>
              <select
                value={formData.department_id}
                onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-black border border-neutral-800 rounded-xl text-neutral-100 focus:outline-none focus:border-white text-sm transition"
              >
                <option value="">Select Department</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
                Priority
              </label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full px-3 py-2 bg-black border border-neutral-800 rounded-xl text-neutral-100 focus:outline-none focus:border-white text-sm transition"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3 py-2 bg-black border border-neutral-800 rounded-xl text-neutral-100 focus:outline-none focus:border-white text-sm transition"
              >
                <option value="TODO">To Do</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
                Deadline *
              </label>
              <input
                type="date"
                required
                value={formData.deadline}
                onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                className="w-full px-3 py-2 bg-black border border-neutral-800 rounded-xl text-neutral-100 focus:outline-none focus:border-white text-sm transition"
              />
            </div>
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-neutral-850">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-sm font-bold text-black bg-white hover:bg-neutral-200 rounded-xl transition shadow-md"
            >
              {loading ? 'Saving...' : initialData ? 'Update Task' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default TaskForm;
