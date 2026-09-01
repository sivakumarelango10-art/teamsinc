import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Award,
  CheckSquare,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  MessageSquare,
  Users,
  TrendingUp,
  CircleDot,
  Calendar,
  Building2,
  Shield
} from 'lucide-react';
import { tasksApi } from '../../api/tasksApi';
import { usersApi } from '../../api/usersApi';
import { supabase } from '../../api/supabase';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import TaskStatusBadge from '../../components/tasks/TaskStatusBadge';
import TaskDetailsModal from '../../components/tasks/TaskDetailsModal';
import { format, parseISO, isPast } from 'date-fns';

export const AdvisorDashboard = () => {
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [allTasks, allUsers] = await Promise.all([
        tasksApi.getTasks(),
        usersApi.getUsers()
      ]);
      setTasks(allTasks);
      setUsers(allUsers);
    } catch (err) {
      console.error('Failed to load Advisor dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    let channel = null;
    if (supabase) {
      channel = supabase
        .channel('advisor-dashboard-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'tasks' },
          () => loadData()
        )
        .subscribe();
    }

    return () => {
      if (channel && supabase) supabase.removeChannel(channel);
    };
  }, []);

  // Compute Task Metrics
  const totalTasks = tasks.length;
  const todoTasks = tasks.filter(t => t.status === 'TODO').length;
  const inProgressTasks = tasks.filter(t => t.status === 'IN_PROGRESS').length;
  const completedTasks = tasks.filter(t => t.status === 'COMPLETED').length;
  const overdueTasks = tasks.filter(
    t => t.status !== 'COMPLETED' && t.deadline && isPast(parseISO(t.deadline))
  ).length;

  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  if (loading) {
    return <LoadingSpinner text="Loading Founding Advisor Dashboard..." />;
  }

  return (
    <div className="space-y-6">
      {/* 1. Header with Founding Advisor badge */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
              <Award className="w-7 h-7 text-purple-400" />
              Founding Advisor
            </h1>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-950/80 border border-purple-800 text-purple-200 shadow-sm">
              Strategic Oversight
            </span>
          </div>
          <p className="text-xs md:text-sm text-neutral-400 mt-1">
            Monitor team progress, task ownership, and execution.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <Link
            to="/leadership-chat"
            className="px-4 py-2.5 rounded-xl bg-purple-950/80 hover:bg-purple-900/90 text-purple-200 border border-purple-800 flex items-center gap-2 text-xs font-bold transition shadow-sm"
          >
            <MessageSquare className="w-4 h-4 text-purple-400" />
            <span>Leadership Chat</span>
          </Link>
          <Link
            to="/founding-advisor/tasks"
            className="px-4 py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black flex items-center gap-2 text-xs font-bold transition shadow-md"
          >
            <CheckSquare className="w-4 h-4 text-black" />
            <span>View All Tasks</span>
          </Link>
        </div>
      </div>

      {/* 2. Key Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* Total Tasks */}
        <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Tasks</span>
            <CheckSquare className="w-4 h-4 text-neutral-300" />
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-white">{totalTasks}</div>
            <div className="text-[11px] text-neutral-500 mt-0.5">Across all departments</div>
          </div>
        </div>

        {/* Pending */}
        <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Pending</span>
            <CircleDot className="w-4 h-4 text-neutral-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-neutral-200">{todoTasks}</div>
            <div className="text-[11px] text-neutral-500 mt-0.5">Awaiting start</div>
          </div>
        </div>

        {/* In Progress */}
        <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-blue-400">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">In Progress</span>
            <Clock className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-blue-400">{inProgressTasks}</div>
            <div className="text-[11px] text-neutral-500 mt-0.5">Actively worked on</div>
          </div>
        </div>

        {/* Completed */}
        <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Completed</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-emerald-400">{completedTasks}</div>
            <div className="text-[11px] text-emerald-500/80 mt-0.5">{completionRate}% completion rate</div>
          </div>
        </div>

        {/* Overdue */}
        <div className="p-4 rounded-2xl bg-neutral-950 border border-red-950/60 flex flex-col justify-between">
          <div className="flex items-center justify-between text-red-400">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Overdue</span>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-red-400">{overdueTasks}</div>
            <div className="text-[11px] text-red-400/80 mt-0.5">Requires attention</div>
          </div>
        </div>
      </div>

      {/* 3. Progress Overview Bar & Breakdown */}
      <div className="p-5 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-bold text-white tracking-tight">Workforce Execution Progress</h3>
          </div>
          <span className="text-xs font-bold text-white bg-neutral-900 border border-neutral-800 px-2.5 py-1 rounded-full">
            {completionRate}% Delivered
          </span>
        </div>

        {/* Segmented Progress Bar */}
        <div className="w-full h-3 rounded-full bg-neutral-900 overflow-hidden flex">
          <div
            style={{ width: `${totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0}%` }}
            className="bg-emerald-500 transition-all duration-500"
            title={`Completed: ${completedTasks}`}
          />
          <div
            style={{ width: `${totalTasks > 0 ? (inProgressTasks / totalTasks) * 100 : 0}%` }}
            className="bg-blue-500 transition-all duration-500"
            title={`In Progress: ${inProgressTasks}`}
          />
          <div
            style={{ width: `${totalTasks > 0 ? (overdueTasks / totalTasks) * 100 : 0}%` }}
            className="bg-red-500 transition-all duration-500"
            title={`Overdue: ${overdueTasks}`}
          />
          <div
            style={{ width: `${totalTasks > 0 ? (todoTasks / totalTasks) * 100 : 0}%` }}
            className="bg-neutral-700 transition-all duration-500"
            title={`Pending: ${todoTasks}`}
          />
        </div>

        {/* Progress Legend */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs text-neutral-400">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
            <span>Completed ({completedTasks})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
            <span>In Progress ({inProgressTasks})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
            <span>Overdue ({overdueTasks})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-neutral-700 shrink-0" />
            <span>Pending ({todoTasks})</span>
          </div>
        </div>
      </div>

      {/* 4. Recent Tasks Overview */}
      <div className="p-5 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">Recent Task Operations</h3>
            <p className="text-xs text-neutral-400">Latest task assignments and status updates</p>
          </div>
          <Link
            to="/founding-advisor/tasks"
            className="text-xs font-bold text-purple-400 hover:text-purple-300 flex items-center gap-1 transition"
          >
            <span>Full Task Table</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {tasks.length === 0 ? (
          <div className="p-8 text-center text-xs text-neutral-500">
            No active tasks recorded in the system yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-neutral-300">
              <thead className="bg-black/50 uppercase tracking-wider text-[10px] text-neutral-400 border-b border-neutral-800">
                <tr>
                  <th className="px-4 py-3">Task</th>
                  <th className="px-4 py-3">Assigned To</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-850">
                {tasks.slice(0, 8).map((task) => {
                  const isTaskOverdue =
                    task.deadline && isPast(parseISO(task.deadline)) && task.status !== 'COMPLETED';

                  return (
                    <tr
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className="hover:bg-neutral-900/60 transition cursor-pointer"
                    >
                      <td className="px-4 py-3 font-semibold text-white max-w-xs truncate">
                        {task.title}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-neutral-900 border border-neutral-700 flex items-center justify-center font-bold text-[10px] text-white shrink-0">
                            {task.assignee?.full_name?.charAt(0) || 'U'}
                          </div>
                          <span className="text-neutral-200">{task.assignee?.full_name || 'Unassigned'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <TaskStatusBadge status={task.status} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-900 border border-neutral-800 text-neutral-300 uppercase">
                          {task.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={isTaskOverdue ? 'text-red-400 font-bold' : 'text-neutral-300'}>
                          {task.deadline ? format(parseISO(task.deadline), 'MMM d') : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className="text-purple-400 hover:text-purple-300 font-semibold text-[11px]">
                          Inspect
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Task Details Modal */}
      <TaskDetailsModal
        task={selectedTask}
        isOpen={Boolean(selectedTask)}
        onClose={() => setSelectedTask(null)}
      />
    </div>
  );
};

export default AdvisorDashboard;
