import React, { useState, useEffect } from 'react';
import { tasksApi } from '../../api/tasksApi';
import { usersApi } from '../../api/usersApi';
import { departmentsApi } from '../../api/departmentsApi';
import { useAuth } from '../../hooks/useAuth';
import TaskCard from '../../components/tasks/TaskCard';
import TaskForm from '../../components/tasks/TaskForm';
import ConfirmModal from '../../components/common/ConfirmModal';
import EmptyState from '../../components/common/EmptyState';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { CheckSquare, Plus, Search, Filter } from 'lucide-react';

export const Tasks = () => {
  const { user } = useAuth();

  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [assigneeFilter, setAssigneeFilter] = useState('ALL');

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [deleteConfirmTask, setDeleteConfirmTask] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', text: '' });

  const loadData = async () => {
    try {
      setLoading(true);
      const [allTasks, allUsers, allDepts] = await Promise.all([
        tasksApi.getTasks(),
        usersApi.getUsers(),
        departmentsApi.getDepartments()
      ]);
      setTasks(allTasks);
      setMembers(allUsers.filter(u => u.role === 'MEMBER' && u.is_active));
      setDepartments(allDepts);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateOrUpdateTask = async (taskData) => {
    if (editingTask) {
      await tasksApi.updateTask(editingTask.id, taskData);
      setFeedback({ type: 'success', text: `Task "${taskData.title}" updated successfully.` });
    } else {
      await tasksApi.createTask(taskData);
      setFeedback({ type: 'success', text: `Task "${taskData.title}" created successfully.` });
    }
    await loadData();
    setEditingTask(null);
  };

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      await tasksApi.updateTaskStatus(taskId, newStatus);
      await loadData();
    } catch (err) {
      alert(err.message || 'Failed to update task status');
    }
  };

  const handleDeleteTask = async () => {
    if (!deleteConfirmTask) return;
    try {
      setActionLoading(true);
      await tasksApi.deleteTask(deleteConfirmTask.id);
      setFeedback({ type: 'success', text: `Task "${deleteConfirmTask.title}" has been deleted.` });
      setDeleteConfirmTask(null);
      await loadData();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  // Filter Tasks
  const filteredTasks = tasks.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
    const matchesPriority = priorityFilter === 'ALL' || t.priority === priorityFilter;
    const matchesDept = deptFilter === 'ALL' || t.department_id === deptFilter;
    const matchesAssignee = assigneeFilter === 'ALL' || t.assigned_to === assigneeFilter;

    return matchesSearch && matchesStatus && matchesPriority && matchesDept && matchesAssignee;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <CheckSquare className="w-7 h-7 text-indigo-400" />
            Task Management
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Dispatch, track, and update deliverables across your active project departments.
          </p>
        </div>

        <button
          onClick={() => {
            setEditingTask(null);
            setIsFormOpen(true);
          }}
          className="px-4 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition shadow-lg shadow-indigo-600/25 flex items-center gap-2 cursor-pointer self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Task</span>
        </button>
      </div>

      {feedback.text && (
        <div className={`p-3.5 rounded-xl text-xs flex items-center justify-between ${
          feedback.type === 'success'
            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
            : 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
        }`}>
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback({ type: '', text: '' })} className="underline ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* Filter Controls Bar */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col lg:flex-row items-center justify-between gap-3">
        <div className="relative w-full lg:w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500 transition"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full lg:w-auto">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-indigo-500 transition"
          >
            <option value="ALL">All Statuses</option>
            <option value="TODO">To Do</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
          </select>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-indigo-500 transition"
          >
            <option value="ALL">All Priorities</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>

          {/* Department Filter */}
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-indigo-500 transition"
          >
            <option value="ALL">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>

          {/* Assignee Filter */}
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-indigo-500 transition"
          >
            <option value="ALL">All Assignees</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.full_name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tasks Grid */}
      {loading ? (
        <LoadingSpinner text="Fetching tasks..." />
      ) : filteredTasks.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="No tasks match your criteria"
          description="Adjust your search filters or create a new task to get started."
          actionLabel="Create Task"
          onAction={() => {
            setEditingTask(null);
            setIsFormOpen(true);
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredTasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              canManage={true}
              canUpdateStatus={true}
              onStatusChange={handleStatusChange}
              onEdit={(task) => {
                setEditingTask(task);
                setIsFormOpen(true);
              }}
              onDelete={(task) => setDeleteConfirmTask(task)}
            />
          ))}
        </div>
      )}

      {/* Task Form Modal */}
      <TaskForm
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingTask(null);
        }}
        onSubmit={handleCreateOrUpdateTask}
        initialData={editingTask}
        members={members}
        departments={departments}
        currentUserId={user?.id}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteConfirmTask)}
        title="Delete Task"
        message={`Are you sure you want to permanently delete "${deleteConfirmTask?.title}"?`}
        confirmText="Delete Task"
        loading={actionLoading}
        onConfirm={handleDeleteTask}
        onCancel={() => setDeleteConfirmTask(null)}
      />
    </div>
  );
};

export default Tasks;
