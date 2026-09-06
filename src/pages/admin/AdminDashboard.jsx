import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckSquare,
  CheckCircle2,
  Clock,
  CircleDot,
  Calendar,
  PlusCircle,
  ArrowUpRight,
  Shield,
  Building2,
  Bug,
  MessageSquare,
  ArrowRight,
  ChevronRight
} from 'lucide-react';
import { format, parseISO, isPast } from 'date-fns';
import { tasksApi } from '../../api/tasksApi';
import { departmentsApi } from '../../api/departmentsApi';
import { usersApi } from '../../api/usersApi';
import { useAuth } from '../../hooks/useAuth';
import { useRealtime } from '../../hooks/useRealtime';
import StatCard from '../../components/common/StatCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import TaskForm from '../../components/tasks/TaskForm';
import TaskDetailsModal from '../../components/tasks/TaskDetailsModal';
import { TaskStatusBadge, TaskPriorityBadge } from '../../components/tasks/TaskStatusBadge';

export const AdminDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [members, setMembers] = useState([]);
  const [memberships, setMemberships] = useState({});
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskModalInitialData, setTaskModalInitialData] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const loadData = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const [allTasks, allDepts, allUsers] = await Promise.all([
        tasksApi.getTasks(),
        departmentsApi.getDepartments(),
        usersApi.getUsers()
      ]);

      const memberMap = await departmentsApi.getAllDepartmentMemberships(allUsers).catch(() => ({}));

      setTasks(allTasks);
      setDepartments(allDepts);
      setUsers(allUsers);
      setMembers(allUsers.filter(u => u.role === 'MEMBER' && u.is_active));
      setMemberships(memberMap || {});
    } catch (err) {
      console.error('Failed to load admin dashboard:', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // Real-time synchronization across tasks, schedules, members, and departments
  useRealtime(
    ['tasks', 'daily_assignments', 'daily_plans', 'profiles', 'departments'],
    () => loadData(true),
    { channelPrefix: 'admin_dash', broadcastChannel: 'teamsync_bc_admin' }
  );

  const myCreatedTasks = tasks.filter(t => t.assigned_by === user?.id);
  const totalAssignedTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'COMPLETED').length;
  const pendingTasks = tasks.filter(t => t.status === 'TODO').length;
  const inProgressTasks = tasks.filter(t => t.status === 'IN_PROGRESS').length;

  const handleCreateTask = async (taskData) => {
    await tasksApi.createTask(taskData);
    await loadData(true);
  };

  if (loading) {
    return <LoadingSpinner text="Loading Admin console..." size="large" />;
  }

  return (
    <div className="space-y-8">
      {/* Welcome & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2.5 py-0.5 rounded border border-neutral-700 bg-neutral-900 text-white flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-white" />
              Task Manager Operations
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight mt-1.5">
            Admin Dashboard
          </h1>
          <p className="text-xs md:text-sm text-neutral-400 mt-1">
            Dispatch tasks, balance daily team allocations, and monitor execution milestones.
          </p>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsTaskModalOpen(true)}
            className="px-4 py-2.5 text-xs font-bold text-black bg-white hover:bg-neutral-200 rounded-xl transition shadow-md flex items-center gap-2 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4 text-black" />
            <span>Assign Task</span>
          </button>

          <button
            onClick={() => navigate('/admin/daily-planning')}
            className="px-4 py-2.5 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 rounded-xl transition flex items-center gap-2 cursor-pointer"
          >
            <Calendar className="w-4 h-4 text-white" />
            <span>Create Daily Plan</span>
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Tasks Created By You"
          value={myCreatedTasks.length}
          subtitle="Your direct assignments"
          icon={CheckSquare}
        />
        <StatCard
          title="Total Assigned Tasks"
          value={totalAssignedTasks}
          subtitle="Across active team"
          icon={CheckSquare}
        />
        <StatCard
          title="In Progress"
          value={inProgressTasks}
          subtitle="Being worked on now"
          icon={Clock}
        />
        <StatCard
          title="Completed"
          value={completedTasks}
          subtitle="Successfully closed"
          icon={CheckCircle2}
        />
        <StatCard
          title="Pending (Todo)"
          value={pendingTasks}
          subtitle="Queued up"
          icon={CircleDot}
        />
      </div>

      {/* Quick Launch Hub */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Assign New Task', desc: 'Create operational work', icon: PlusCircle, path: '/admin/assign-task', color: 'text-white' },
          { label: 'Daily Planning', desc: 'Workforce allocation', icon: Calendar, path: '/admin/daily-planning', color: 'text-emerald-400' },
          { label: 'All Tasks Board', desc: `${totalAssignedTasks} total deliverables`, icon: CheckSquare, path: '/admin/tasks', color: 'text-blue-400' },
          { label: 'Bug Reports Hub', desc: 'Triage reported issues', icon: Bug, path: '/admin/bugs', color: 'text-red-400' },
          { label: 'Team Chat', desc: 'Real-time discussions', icon: MessageSquare, path: '/chat', color: 'text-purple-400' }
        ].map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => navigate(item.path)}
              className="p-4 rounded-2xl bg-neutral-950 hover:bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition flex flex-col justify-between text-left group cursor-pointer shadow-sm"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-8 h-8 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center">
                  <Icon className={`w-4 h-4 ${item.color}`} />
                </div>
                <ArrowRight className="w-4 h-4 text-neutral-600 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
              </div>
              <div>
                <p className="text-xs font-bold text-white group-hover:text-white transition tracking-tight">{item.label}</p>
                <p className="text-[11px] text-neutral-500 mt-0.5">{item.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Deliverables Pipeline */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-white" />
              <span>Operations Deliverables Pipeline</span>
            </h3>
            <p className="text-xs text-neutral-400">Review status and deadlines across assigned work items</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/admin/tasks')}
            className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 font-semibold transition cursor-pointer"
          >
            <span>View All Tasks ({totalAssignedTasks})</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {tasks.length === 0 ? (
          <div className="p-8 rounded-2xl bg-neutral-950 border border-neutral-800 text-center">
            <CheckSquare className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
            <p className="text-xs font-bold text-white">No tasks created yet</p>
            <p className="text-[11px] text-neutral-500 mt-1">Use "Assign Task" to dispatch deliverables to teammates.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {tasks.slice(0, 6).map((t) => {
              const isOverdue = Boolean(t.deadline && t.status !== 'COMPLETED' && isPast(parseISO(t.deadline)));
              return (
                <div
                  key={t.id}
                  onClick={() => setSelectedTask(t)}
                  className="p-4 rounded-2xl bg-neutral-950 hover:bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition flex flex-col justify-between space-y-3 cursor-pointer group shadow-sm"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <TaskPriorityBadge priority={t.priority} />
                      {t.department?.name && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-900 text-neutral-400 border border-neutral-800 flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-neutral-500" />
                          {t.department.name}
                        </span>
                      )}
                    </div>
                    <h4 className="text-xs font-bold text-white group-hover:text-white transition line-clamp-2">
                      {t.title}
                    </h4>
                  </div>

                  <div className="pt-2 border-t border-neutral-850 flex items-center justify-between text-[11px] text-neutral-400">
                    <span className="truncate max-w-[130px] text-neutral-300">
                      {t.assignee?.full_name || 'Unassigned'}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {t.deadline && (
                        <span className={isOverdue ? 'text-red-400 font-bold' : ''}>
                          Due {format(parseISO(t.deadline), 'MMM d')}
                        </span>
                      )}
                      <TaskStatusBadge status={t.status} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Task Creation Modal */}
      <TaskForm
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setTaskModalInitialData(null);
        }}
        onSubmit={handleCreateTask}
        members={members}
        departments={departments}
        currentUserId={user?.id}
        initialData={taskModalInitialData}
      />

      {/* Task Details Modal */}
      <TaskDetailsModal
        task={selectedTask}
        isOpen={Boolean(selectedTask)}
        onClose={() => setSelectedTask(null)}
      />
    </div>
  );
};

export default AdminDashboard;
