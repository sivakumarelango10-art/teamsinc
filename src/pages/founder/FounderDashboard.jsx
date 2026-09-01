import React, { useState, useEffect } from 'react';
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
  Sparkles
} from 'lucide-react';
import { format, addDays } from 'date-fns';
import { usersApi } from '../../api/usersApi';
import { tasksApi } from '../../api/tasksApi';
import { planningApi } from '../../api/planningApi';
import { departmentsApi } from '../../api/departmentsApi';
import { useAuth } from '../../hooks/useAuth';
import StatCard from '../../components/common/StatCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import UserForm from '../../components/users/UserForm';
import TaskForm from '../../components/tasks/TaskForm';
import DepartmentAllocation from '../../components/planning/DepartmentAllocation';

export const FounderDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [todayAllocations, setTodayAllocations] = useState([]);
  const [tomorrowAllocations, setTomorrowAllocations] = useState([]);

  // Modals
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [userModalPresetRole, setUserModalPresetRole] = useState('MEMBER');
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const tomorrowStr = format(addDays(new Date(), 1), 'yyyy-MM-dd');

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [allUsers, allTasks, allDepts, todayPlan, tomorrowPlan] = await Promise.all([
        usersApi.getUsers(),
        tasksApi.getTasks(),
        departmentsApi.getDepartments(),
        planningApi.getDailyAllocations(todayStr),
        planningApi.getDailyAllocations(tomorrowStr)
      ]);

      setUsers(allUsers);
      setTasks(allTasks);
      setDepartments(allDepts);
      setTodayAllocations(todayPlan.assignments || []);
      setTomorrowAllocations(tomorrowPlan.assignments || []);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Compute Metrics
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
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">
              Founder Control Center
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight mt-1.5">
            Executive Operations Overview
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Real-time telemetry on workforce staffing, department assignments, and project deliverables.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => openAddUser('MEMBER')}
            className="px-3.5 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
          >
            <UserPlus className="w-4 h-4 text-indigo-400" />
            <span>Add User</span>
          </button>

          <button
            onClick={() => openAddUser('ADMIN')}
            className="px-3.5 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
          >
            <Shield className="w-4 h-4 text-amber-400" />
            <span>Add Admin</span>
          </button>

          <button
            onClick={() => setIsTaskModalOpen(true)}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition shadow-lg shadow-indigo-600/25 flex items-center gap-1.5 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Create Task</span>
          </button>

          <button
            onClick={() => navigate('/admin/daily-planning')}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition shadow-lg shadow-emerald-600/25 flex items-center gap-1.5 cursor-pointer"
          >
            <Calendar className="w-4 h-4" />
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
          color="indigo"
        />
        <StatCard
          title="Total Admins"
          value={totalAdmins}
          subtitle="Task managers"
          icon={Shield}
          color="amber"
        />
        <StatCard
          title="Total Tasks"
          value={totalTasks}
          subtitle="Across all pipelines"
          icon={CheckSquare}
          color="cyan"
        />
        <StatCard
          title="In Progress"
          value={inProgressTasks}
          subtitle="Currently active"
          icon={Clock}
          color="amber"
        />
        <StatCard
          title="Completed"
          value={completedTasks}
          subtitle="Finished deliverables"
          icon={CheckCircle2}
          color="emerald"
        />
        <StatCard
          title="Pending (Todo)"
          value={pendingTasks}
          subtitle="In queue"
          icon={CircleDot}
          color="rose"
        />
      </div>

      {/* Workforce Planning Sections: Today & Tomorrow */}
      <div className="space-y-6">
        {/* Today's Allocation */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  Today's Team Allocation
                </h3>
                <p className="text-xs text-slate-400">
                  {format(new Date(), 'EEEE, MMMM d, yyyy')} — {todayAllocations.length} total assignments
                </p>
              </div>
            </div>

            <button
              onClick={() => navigate('/admin/daily-planning')}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold transition"
            >
              <span>Manage Today</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>

          <DepartmentAllocation
            departments={departments}
            assignments={todayAllocations}
            canManage={false}
          />
        </div>

        {/* Tomorrow's Allocation */}
        <div className="space-y-3 pt-4 border-t border-slate-800/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  Tomorrow's Team Allocation
                </h3>
                <p className="text-xs text-slate-400">
                  {format(addDays(new Date(), 1), 'EEEE, MMMM d, yyyy')} — {tomorrowAllocations.length} planned assignments
                </p>
              </div>
            </div>

            <button
              onClick={() => navigate('/admin/daily-planning')}
              className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold transition"
            >
              <span>Plan Tomorrow</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>

          <DepartmentAllocation
            departments={departments}
            assignments={tomorrowAllocations}
            canManage={false}
          />
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
        onClose={() => setIsTaskModalOpen(false)}
        onSubmit={handleCreateTask}
        members={users.filter(u => u.is_active)}
        departments={departments}
        currentUserId={user?.id}
      />
    </div>
  );
};

export default FounderDashboard;
