import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CheckSquare,
  Search,
  Filter,
  ArrowUpDown,
  Calendar,
  Building2,
  Users,
  AlertTriangle,
  Clock,
  Eye,
  CheckCircle2,
  CircleDot
} from 'lucide-react';
import { tasksApi } from '../../api/tasksApi';
import { usersApi } from '../../api/usersApi';
import { departmentsApi } from '../../api/departmentsApi';
import { supabase } from '../../api/supabase';
import { useRealtime } from '../../hooks/useRealtime';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import TaskStatusBadge from '../../components/tasks/TaskStatusBadge';
import TaskDetailsModal from '../../components/tasks/TaskDetailsModal';
import Avatar from '../../components/common/Avatar';
import { format, parseISO, isPast } from 'date-fns';

export const AdvisorTasks = () => {
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [assigneeFilter, setAssigneeFilter] = useState('ALL');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('DEADLINE_ASC'); // DEADLINE_ASC, DEADLINE_DESC, CREATED_DESC, PRIORITY_DESC

  // Inspection Modal
  const [selectedTask, setSelectedTask] = useState(null);

  const loadData = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const [allTasks, allUsers, allDepts] = await Promise.all([
        tasksApi.getTasks(),
        usersApi.getUsers(),
        departmentsApi.getDepartments()
      ]);
      setTasks(allTasks || []);
      setUsers(allUsers || []);
      setDepartments(allDepts || []);
    } catch (err) {
      console.error('Failed to load tasks for Founding Advisor:', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // Real-time synchronization for advisor tasks inspection
  useRealtime(
    ['tasks', 'profiles', 'departments'],
    () => loadData(true),
    { channelPrefix: 'advisor_tasks', broadcastChannel: 'teamsync_bc_tasks' }
  );

  const priorityWeights = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

  // Filtered & Sorted Tasks
  const processedTasks = useMemo(() => {
    return tasks
      .filter((t) => {
        // Search Filter
        const query = searchQuery.trim().toLowerCase();
        if (query) {
          const matchTitle = t.title?.toLowerCase().includes(query);
          const matchDesc = t.description?.toLowerCase().includes(query);
          const matchAssignee = t.assignee?.full_name?.toLowerCase().includes(query);
          if (!matchTitle && !matchDesc && !matchAssignee) return false;
        }

        // Status Filter
        if (statusFilter === 'OVERDUE') {
          const isOverdue = t.deadline && isPast(parseISO(t.deadline)) && t.status !== 'COMPLETED';
          if (!isOverdue) return false;
        } else if (statusFilter !== 'ALL') {
          if (t.status !== statusFilter) return false;
        }

        // Priority Filter
        if (priorityFilter !== 'ALL' && t.priority !== priorityFilter) {
          return false;
        }

        // Assignee Filter
        if (assigneeFilter !== 'ALL') {
          if (t.assigned_to !== assigneeFilter && t.assignee?.id !== assigneeFilter) {
            return false;
          }
        }

        // Department Filter
        if (deptFilter !== 'ALL') {
          if (t.department_id !== deptFilter && t.department?.id !== deptFilter) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'DEADLINE_ASC') {
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline) - new Date(b.deadline);
        }
        if (sortBy === 'DEADLINE_DESC') {
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(b.deadline) - new Date(a.deadline);
        }
        if (sortBy === 'PRIORITY_DESC') {
          return (priorityWeights[b.priority] || 0) - (priorityWeights[a.priority] || 0);
        }
        // Default: CREATED_DESC
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });
  }, [tasks, searchQuery, statusFilter, priorityFilter, assigneeFilter, deptFilter, sortBy]);

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('ALL');
    setPriorityFilter('ALL');
    setAssigneeFilter('ALL');
    setDeptFilter('ALL');
    setSortBy('DEADLINE_ASC');
  };

  const hasActiveFilters =
    searchQuery ||
    statusFilter !== 'ALL' ||
    priorityFilter !== 'ALL' ||
    assigneeFilter !== 'ALL' ||
    deptFilter !== 'ALL';

  return (
    <div className="space-y-6">
      {/* 1. Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <CheckSquare className="w-7 h-7 text-purple-400" />
            Task Oversight & Assignment
          </h1>
          <p className="text-xs md:text-sm text-neutral-400 mt-1">
            Complete high-level view of all team tasks, ownership status, and deadlines.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-neutral-400 bg-neutral-900 border border-neutral-800 px-3.5 py-2 rounded-xl">
          <Eye className="w-4 h-4 text-purple-400" />
          <span>Founding Advisor Read-Only Mode</span>
        </div>
      </div>

      {/* 2. Search & Filter Bar */}
      <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search tasks by title, description, or assigned member..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-black border border-neutral-800 rounded-xl text-white placeholder-neutral-600 text-xs focus:outline-none focus:border-purple-500 transition"
          />
        </div>

        {/* Filter Dropdowns Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {/* Status Filter */}
          <div>
            <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-black border border-neutral-800 rounded-xl text-neutral-200 text-xs focus:outline-none focus:border-purple-500 transition"
            >
              <option value="ALL">All Statuses</option>
              <option value="TODO">Pending (TODO)</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="OVERDUE">Overdue Tasks</option>
            </select>
          </div>

          {/* Priority Filter */}
          <div>
            <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
              Priority
            </label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="w-full px-3 py-2 bg-black border border-neutral-800 rounded-xl text-neutral-200 text-xs focus:outline-none focus:border-purple-500 transition"
            >
              <option value="ALL">All Priorities</option>
              <option value="URGENT">Urgent</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          {/* Assignee Filter */}
          <div>
            <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
              Assigned To
            </label>
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="w-full px-3 py-2 bg-black border border-neutral-800 rounded-xl text-neutral-200 text-xs focus:outline-none focus:border-purple-500 transition truncate"
            >
              <option value="ALL">All Assignees</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.role})
                </option>
              ))}
            </select>
          </div>

          {/* Department Filter */}
          <div>
            <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
              Department
            </label>
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="w-full px-3 py-2 bg-black border border-neutral-800 rounded-xl text-neutral-200 text-xs focus:outline-none focus:border-purple-500 transition"
            >
              <option value="ALL">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sort By */}
          <div>
            <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
              Sort By
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-3 py-2 bg-black border border-neutral-800 rounded-xl text-neutral-200 text-xs focus:outline-none focus:border-purple-500 transition"
            >
              <option value="DEADLINE_ASC">Due Date: Earliest First</option>
              <option value="DEADLINE_DESC">Due Date: Latest First</option>
              <option value="PRIORITY_DESC">Priority: Highest First</option>
              <option value="CREATED_DESC">Created: Newest First</option>
            </select>
          </div>
        </div>

        {/* Active Filter Tags & Reset */}
        {hasActiveFilters && (
          <div className="flex items-center justify-between pt-2 border-t border-neutral-900 text-xs">
            <span className="text-neutral-400">
              Showing <span className="text-white font-bold">{processedTasks.length}</span> of {tasks.length} tasks
            </span>
            <button
              type="button"
              onClick={resetFilters}
              className="text-purple-400 hover:text-purple-300 font-semibold cursor-pointer transition"
            >
              Reset All Filters
            </button>
          </div>
        )}
      </div>

      {/* 3. Task Table */}
      {loading ? (
        <LoadingSpinner text="Retrieving team task records..." />
      ) : processedTasks.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-neutral-950 border border-neutral-800 space-y-3">
          <CheckSquare className="w-8 h-8 text-neutral-600 mx-auto" />
          <h3 className="text-sm font-bold text-white">No tasks matching current filters</h3>
          <p className="text-xs text-neutral-400 max-w-sm mx-auto">
            Try adjusting your search keywords, status filter, or assignee selection.
          </p>
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="px-4 py-2 text-xs font-semibold bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl border border-neutral-800 transition"
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-950">
          <table className="w-full text-left text-xs text-neutral-300">
            <thead className="bg-black text-[11px] font-semibold uppercase tracking-wider text-neutral-400 border-b border-neutral-800">
              <tr>
                <th className="px-5 py-4">Task Details</th>
                <th className="px-5 py-4">Assigned To</th>
                <th className="px-5 py-4">Department</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Priority</th>
                <th className="px-5 py-4">Due Date</th>
                <th className="px-5 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-850">
              {processedTasks.map((task) => {
                const isTaskOverdue =
                  task.deadline && isPast(parseISO(task.deadline)) && task.status !== 'COMPLETED';

                return (
                  <tr
                    key={task.id}
                    onClick={() => setSelectedTask(task)}
                    className="hover:bg-neutral-900/60 transition cursor-pointer"
                  >
                    {/* Task Title & Description */}
                    <td className="px-5 py-4 max-w-xs md:max-w-sm">
                      <div className="font-bold text-white text-sm tracking-tight truncate">
                        {task.title}
                      </div>
                      {task.description && (
                        <div className="text-neutral-400 text-xs truncate mt-0.5 max-w-xs">
                          {task.description}
                        </div>
                      )}
                    </td>

                    {/* Assigned To */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <Avatar
                          src={task.assignee?.avatar_url}
                          name={task.assignee?.full_name}
                          size="sm"
                          rounded="rounded-lg"
                        />
                        <div>
                          <div className="font-semibold text-neutral-200">
                            {task.assignee?.full_name || 'Unassigned'}
                          </div>
                          <div className="text-[10px] text-neutral-400 truncate max-w-[140px]">
                            {task.assignee?.email}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Department */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-neutral-900 border border-neutral-800 text-neutral-300">
                        <Building2 className="w-3 h-3 text-neutral-500" />
                        {task.department?.name || 'General'}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <TaskStatusBadge status={task.status} />
                    </td>

                    {/* Priority */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-neutral-900 border border-neutral-800 text-neutral-300">
                        {task.priority}
                      </span>
                    </td>

                    {/* Due Date */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                        <span
                          className={`font-semibold ${
                            isTaskOverdue ? 'text-red-400 font-bold' : 'text-neutral-300'
                          }`}
                        >
                          {task.deadline ? format(parseISO(task.deadline), 'MMM d, yyyy') : 'No deadline'}
                        </span>
                        {isTaskOverdue && (
                          <span className="text-[10px] bg-red-950 text-red-400 px-1.5 py-0.5 rounded border border-red-800 font-bold ml-1">
                            OVERDUE
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Inspect button */}
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTask(task);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-purple-300 hover:text-white bg-purple-950/60 hover:bg-purple-900/80 border border-purple-800/80 rounded-xl transition cursor-pointer"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Task Details Modal */}
      <TaskDetailsModal
        task={selectedTask}
        isOpen={Boolean(selectedTask)}
        onClose={() => setSelectedTask(null)}
      />
    </div>
  );
};

export default AdvisorTasks;
