import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { tasksApi } from '../../api/tasksApi';
import { usersApi } from '../../api/usersApi';
import { departmentsApi } from '../../api/departmentsApi';
import { useAuth } from '../../hooks/useAuth';
import { useRealtime } from '../../hooks/useRealtime';
import { PlusCircle, ArrowLeft, Check, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import LoadingSpinner from '../../components/common/LoadingSpinner';

export const AssignTask = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [members, setMembers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    assigned_to: '',
    department_id: '',
    priority: 'MEDIUM',
    deadline: format(new Date(), 'yyyy-MM-dd'),
    status: 'TODO'
  });

  const loadOptions = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const [usersList, deptsList] = await Promise.all([
        usersApi.getUsers(),
        departmentsApi.getDepartments()
      ]);
      const activeMembers = usersList.filter(u => u.role === 'MEMBER' && u.is_active);
      setMembers(activeMembers);
      setDepartments(deptsList || []);

      setFormData(prev => ({
        ...prev,
        assigned_to: prev.assigned_to || (activeMembers.length > 0 ? activeMembers[0].id : ''),
        department_id: prev.department_id || (deptsList.length > 0 ? deptsList[0].id : '')
      }));
    } catch (err) {
      console.error('Failed to load form options:', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOptions(false);
  }, [loadOptions]);

  // Real-time synchronization for members and departments
  useRealtime(
    ['profiles', 'departments'],
    () => loadOptions(true),
    { channelPrefix: 'assign_task' }
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      setError('Please provide a task title');
      return;
    }
    if (!formData.assigned_to) {
      setError('Please choose a team member');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      await tasksApi.createTask({
        ...formData,
        assigned_by: user?.id
      });
      setSuccess(true);
      setTimeout(() => {
        navigate('/admin/tasks');
      }, 1000);
    } catch (err) {
      setError(err.message || 'Failed to dispatch task');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingSpinner text="Preparing task dispatch form..." size="large" />;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-900 rounded-xl transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <PlusCircle className="w-6 h-6 text-white" />
            Assign New Task
          </h1>
          <p className="text-xs text-neutral-400 mt-0.5">
            Delegate operational work items with explicit accountability, department tags, and deadlines.
          </p>
        </div>
      </div>

      {success && (
        <div className="p-4 rounded-2xl bg-neutral-900 border border-neutral-700 text-white text-sm flex items-center gap-3">
          <Check className="w-5 h-5 text-white" />
          <span>Task successfully created! Redirecting to Task Board...</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-neutral-900 border border-neutral-700 text-neutral-200 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-neutral-400" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-neutral-950 p-6 sm:p-8 rounded-3xl border border-neutral-800 shadow-2xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
              Task Title *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Implement user authentication flow"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-3 bg-black border border-neutral-800 rounded-xl text-white placeholder-neutral-600 text-sm focus:outline-none focus:border-white transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
              Detailed Description
            </label>
            <textarea
              rows={4}
              placeholder="Provide context, acceptance criteria, wireframe links, or specific instructions..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-3 bg-black border border-neutral-800 rounded-xl text-white placeholder-neutral-600 text-sm focus:outline-none focus:border-white transition"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                Assign To Teammate *
              </label>
              <select
                required
                value={formData.assigned_to}
                onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                className="w-full px-3.5 py-3 bg-black border border-neutral-800 rounded-xl text-white text-sm focus:outline-none focus:border-white transition"
              >
                <option value="">Select Team Member</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name} ({m.email})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                Department
              </label>
              <select
                value={formData.department_id}
                onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
                className="w-full px-3.5 py-3 bg-black border border-neutral-800 rounded-xl text-white text-sm focus:outline-none focus:border-white transition"
              >
                <option value="">Select Department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                Priority
              </label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-black border border-neutral-800 rounded-xl text-white text-sm focus:outline-none focus:border-white transition"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                Initial Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-black border border-neutral-800 rounded-xl text-white text-sm focus:outline-none focus:border-white transition"
              >
                <option value="TODO">To Do</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                Deadline Date *
              </label>
              <input
                type="date"
                required
                value={formData.deadline}
                onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-black border border-neutral-800 rounded-xl text-white text-sm focus:outline-none focus:border-white transition cursor-pointer"
              />
            </div>
          </div>

          <div className="pt-5 border-t border-neutral-850 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate('/admin/tasks')}
              className="px-5 py-2.5 text-sm font-semibold text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 text-sm font-bold text-black bg-white hover:bg-neutral-200 rounded-xl transition shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Dispatching...' : 'Assign Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AssignTask;
