import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { tasksApi } from '../../api/tasksApi';
import TaskCard from '../../components/tasks/TaskCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { CheckSquare, Search } from 'lucide-react';

export const MyTasks = () => {
  const { user } = useAuth();

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const loadTasks = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const userTasks = await tasksApi.getTasks({ assigned_to: user.id });
      setTasks(userTasks);
    } catch (err) {
      console.error('Failed to load my tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [user?.id]);

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      await tasksApi.updateTaskStatus(taskId, newStatus);
      await loadTasks();
    } catch (err) {
      alert(err.message || 'Failed to update status');
    }
  };

  const filteredTasks = tasks.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
          <CheckSquare className="w-7 h-7 text-white" />
          My Tasks
        </h1>
        <p className="text-xs md:text-sm text-neutral-400 mt-1">
          Review deliverables assigned to you. Transition task cards to signal execution progress.
        </p>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search my tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-3.5 py-2 bg-black border border-neutral-800 rounded-xl text-white placeholder-neutral-600 text-xs focus:outline-none focus:border-white transition"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black border border-neutral-800 w-full sm:w-auto overflow-x-auto">
          {['ALL', 'TODO', 'IN_PROGRESS', 'COMPLETED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                statusFilter === st
                  ? 'bg-white text-black shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {st === 'ALL' ? 'All' : st === 'TODO' ? 'To Do' : st === 'IN_PROGRESS' ? 'In Progress' : 'Completed'}
            </button>
          ))}
        </div>
      </div>

      {/* Task List */}
      {loading ? (
        <LoadingSpinner text="Fetching assigned tasks..." />
      ) : filteredTasks.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="No tasks found"
          description="There are no tasks matching your selected filter."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              canManage={false}
              canUpdateStatus={true}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default MyTasks;
