import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Shield,
  CheckSquare,
  CheckCircle2,
  Clock,
  CircleDot,
  Calendar,
  UserPlus,
  PlusCircle,
  ArrowUpRight,
  Building2,
  BarChart3,
  Bug,
  ArrowRight,
  ChevronRight
} from 'lucide-react';
import { format, parseISO, isPast } from 'date-fns';
import { usersApi } from '../../api/usersApi';
import { tasksApi } from '../../api/tasksApi';
import { departmentsApi } from '../../api/departmentsApi';
import { useAuth } from '../../hooks/useAuth';
import { usePresence } from '../../context/PresenceContext';
import { useRealtime } from '../../hooks/useRealtime';
import StatCard from '../../components/common/StatCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import UserForm from '../../components/users/UserForm';
import TaskForm from '../../components/tasks/TaskForm';
import TaskDetailsModal from '../../components/tasks/TaskDetailsModal';
import { TaskStatusBadge, TaskPriorityBadge } from '../../components/tasks/TaskStatusBadge';

export const FounderDashboard = () => {
  const { user } = useAuth();
  const { onlineCount } = usePresence();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [memberships, setMemberships] = useState({});

  // Modals
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [userModalPresetRole, setUserModalPresetRole] = useState('MEMBER');
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskModalInitialData, setTaskModalInitialData] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const loadDashboardData = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const [allUsers, allTasks, allDepts] = await Promise.all([
        usersApi.getUsers(),
        tasksApi.getTasks(),
        departmentsApi.getDepartments()
      ]);

      const memberMap = await departmentsApi.getAllDepartmentMemberships(allUsers).catch(() => ({}));

      setUsers(allUsers);
      setTasks(allTasks);
      setDepartments(allDepts);
      setMemberships(memberMap || {});
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData(false);
  }, [loadDashboardData]);

  // Real-time synchronization across all core company data
  useRealtime(
    ['tasks', 'daily_assignments', 'daily_plans', 'profiles', 'departments', 'department_members', 'bug_reports'],
    () => loadDashboardData(true),
    { channelPrefix: 'founder_dash', broadcastChannel: 'teamsync_bc_founder' }
  );

  const totalTeamMembers = users.filter(u => u.role === 'MEMBER').length;
  const totalAdmins = users.filter(u => u.role === 'ADMIN').length;
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'COMPLETED').length;
  const inProgressTasks = tasks.filter(t => t.status === 'IN_PROGRESS').length;
  const pendingTasks = tasks.filter(t => t.status === 'TODO').length;

  const handleCreateUser = async (formData) => {
    await usersApi.createUser(formData);
    await loadDashboardData();
  };

  const handleCreateTask = async (taskData) => {
    await tasksApi.createTask(taskData);
    await loadDashboardData();
  };

  const openAddUser = (role = 'MEMBER') => {
    setUserModalPresetRole(role);
    setIsUserModalOpen(true);
  };

  if (loading) {
    return <LoadingSpinner text="Aggregating workspace analytics..." size="large" />;
  }

  return (
    <div className="space-y-8">
      {/* Top Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-bold px-2.5 py-0.5 rounded border border-neutral-700 bg-neutral-900 text-white">
              Founder Control Center
            </span>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full border border-emerald-900/60 bg-neutral-900 text-emerald-400 flex items-center gap-1.5 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {onlineCount} Active Online
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight mt-1.5">
            Executive Operations Overview
          </h1>
          <p className="text-xs md:text-sm text-neutral-400 mt-1">
            Real-time telemetry on workforce staffing, department assignments, and project deliverables.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => openAddUser('MEMBER')}
            className="px-3.5 py-2 text-xs font-semibold text-neutral-300 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
          >
            <UserPlus className="w-4 h-4 text-neutral-400" />
            <span>Add User</span>
          </button>

          <button
            onClick={() => openAddUser('ADMIN')}
            className="px-3.5 py-2 text-xs font-semibold text-neutral-300 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
          >
            <Shield className="w-4 h-4 text-neutral-400" />
            <span>Add Admin</span>
          </button>

          <button
            onClick={() => setIsTaskModalOpen(true)}
            className="px-3.5 py-2 text-xs font-bold text-black bg-white hover:bg-neutral-200 rounded-xl transition shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4 text-black" />
            <span>Create Task</span>
          </button>

          <button
            onClick={() => navigate('/admin/daily-planning')}
            className="px-3.5 py-2 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
          >
            <Calendar className="w-4 h-4 text-white" />
            <span>Plan Workforce</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Team Members"
          value={totalTeamMembers}
          subtitle="Active contributors"
          icon={Users}
        />
        <StatCard
          title="Total Admins"
          value={totalAdmins}
          subtitle="Task managers"
          icon={Shield}
        />
        <StatCard
          title="Total Tasks"
          value={totalTasks}
          subtitle="Across all pipelines"
          icon={CheckSquare}
        />
        <StatCard
          title="In Progress"
          value={inProgressTasks}
          subtitle="Currently active"
          icon={Clock}
        />
        <StatCard
          title="Completed"
          value={completedTasks}
          subtitle="Finished deliverables"
          icon={CheckCircle2}
        />
        <StatCard
          title="Pending (Todo)"
          value={pendingTasks}
          subtitle="In queue"
          icon={CircleDot}
        />
      </div>

      {/* Executive Quick Launch Hub */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'User Directory', desc: `${users.length} registered accounts`, icon: Users, path: '/founder/users', color: 'text-white' },
          { label: 'Departments', desc: `${departments.length} functional units`, icon: Building2, path: '/founder/departments', color: 'text-purple-400' },
          { label: 'Workforce Planning', desc: 'Daily task allocation', icon: Calendar, path: '/admin/daily-planning', color: 'text-emerald-400' },
          { label: 'Bug Reports', desc: 'Triage & engineer route', icon: Bug, path: '/founder/bugs', color: 'text-red-400' },
          { label: 'Analytics & Reports', desc: 'Completion metrics', icon: BarChart3, path: '/founder/reports', color: 'text-blue-400' }
        ].map(hub => {
          const Icon = hub.icon;
          return (
            <button
              key={hub.label}
              type="button"
              onClick={() => navigate(hub.path)}
              className="p-4 rounded-2xl bg-neutral-950 hover:bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition flex flex-col justify-between text-left group cursor-pointer shadow-sm"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-8 h-8 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center">
                  <Icon className={`w-4 h-4 ${hub.color}`} />
                </div>
                <ArrowRight className="w-4 h-4 text-neutral-600 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
              </div>
              <div>
                <p className="text-xs font-bold text-white group-hover:text-white transition tracking-tight">{hub.label}</p>
                <p className="text-[11px] text-neutral-500 mt-0.5">{hub.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Two-Column Main Content: Deliverables Pipeline & Department Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Recent Deliverables & Tasks (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-white" />
                <span>Executive Deliverables Pipeline</span>
              </h3>
              <p className="text-xs text-neutral-400">Recent active tasks across all departments</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/admin/tasks')}
              className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 font-semibold transition cursor-pointer"
            >
              <span>View All ({tasks.length})</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {tasks.length === 0 ? (
            <div className="p-8 rounded-2xl bg-neutral-950 border border-neutral-800 text-center">
              <CheckSquare className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
              <p className="text-xs font-bold text-white">No tasks created yet</p>
              <p className="text-[11px] text-neutral-500 mt-1">Use "Create Task" above to assign work items.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {tasks.slice(0, 6).map((t) => {
                const isOverdue = Boolean(t.deadline && t.status !== 'COMPLETED' && isPast(parseISO(t.deadline)));
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTask(t)}
                    className="p-3.5 rounded-2xl bg-neutral-950 hover:bg-neutral-900/80 border border-neutral-800 hover:border-neutral-700 transition flex items-center justify-between gap-3 cursor-pointer group shadow-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <TaskPriorityBadge priority={t.priority} />
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-white group-hover:text-white truncate">
                          {t.title}
                        </h4>
                        <div className="flex items-center gap-2 text-[11px] text-neutral-400 mt-0.5">
                          {t.department?.name && (
                            <span className="text-neutral-400 flex items-center gap-1">
                              <Building2 className="w-3 h-3 text-neutral-500" />
                              {t.department.name}
                            </span>
                          )}
                          <span>•</span>
                          <span>{t.assignee?.full_name || 'Unassigned'}</span>
                          {t.deadline && (
                            <>
                              <span>•</span>
                              <span className={isOverdue ? 'text-red-400 font-bold' : ''}>
                                Due {format(parseISO(t.deadline), 'MMM d')}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <TaskStatusBadge status={t.status} />
                      <ChevronRight className="w-4 h-4 text-neutral-600 group-hover:text-white transition" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Department Workforce Snapshot (1 col) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <Building2 className="w-4 h-4 text-purple-400" />
                <span>Departments</span>
              </h3>
              <p className="text-xs text-neutral-400">Workforce distribution</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/founder/departments')}
              className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 font-semibold transition cursor-pointer"
            >
              <span>Manage</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {departments.length === 0 ? (
            <div className="p-8 rounded-2xl bg-neutral-950 border border-neutral-800 text-center">
              <Building2 className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
              <p className="text-xs font-bold text-white">No departments added</p>
              <p className="text-[11px] text-neutral-500 mt-1">Set up functional departments to organize team members.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {departments.map((dept) => {
                const deptMembers = memberships[dept.id] || [];
                const deptTasks = tasks.filter(t => t.department_id === dept.id);
                return (
                  <div
                    key={dept.id}
                    onClick={() => navigate('/founder/departments')}
                    className="p-3.5 rounded-2xl bg-neutral-950 hover:bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition flex items-center justify-between cursor-pointer group shadow-sm"
                  >
                    <div>
                      <h4 className="text-xs font-bold text-white group-hover:text-purple-300 transition">
                        {dept.name}
                      </h4>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        {deptMembers.length} {deptMembers.length === 1 ? 'member' : 'members'} • {deptTasks.length} active tasks
                      </p>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-neutral-900 text-neutral-300 border border-neutral-800">
                      {deptTasks.filter(t => t.status === 'COMPLETED').length}/{deptTasks.length} done
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <UserForm
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        onSubmit={handleCreateUser}
        initialData={{ role: userModalPresetRole }}
      />

      <TaskForm
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setTaskModalInitialData(null);
        }}
        onSubmit={handleCreateTask}
        members={users.filter(u => u.is_active)}
        departments={departments}
        currentUserId={user?.id}
        initialData={taskModalInitialData}
      />

      <TaskDetailsModal
        task={selectedTask}
        isOpen={Boolean(selectedTask)}
        onClose={() => setSelectedTask(null)}
      />
    </div>
  );
};

export default FounderDashboard;
