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
  ArrowUpRight
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
            <span className="text-xs font-bold px-2.5 py-0.5 rounded border border-neutral-700 bg-neutral-900 text-white">
              Founder Control Center
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

      {/* Workforce Planning Sections: Today & Tomorrow */}
      <div className="space-y-6">
        {/* Today's Allocation */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-neutral-900 text-white border border-neutral-800">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  Today's Team Allocation
                </h3>
                <p className="text-xs text-neutral-400">
                  {format(new Date(), 'EEEE, MMMM d, yyyy')} — {todayAllocations.length} total assignments
                </p>
              </div>
            </div>

            <button
              onClick={() => navigate('/admin/daily-planning')}
              className="text-xs text-white hover:text-neutral-300 flex items-center gap-1 font-semibold transition"
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
        <div className="space-y-3 pt-4 border-t border-neutral-850">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-neutral-900 text-white border border-neutral-800">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  Tomorrow's Team Allocation
                </h3>
                <p className="text-xs text-neutral-400">
                  {format(addDays(new Date(), 1), 'EEEE, MMMM d, yyyy')} — {tomorrowAllocations.length} planned assignments
                </p>
              </div>
            </div>

            <button
              onClick={() => navigate('/admin/daily-planning')}
              className="text-xs text-white hover:text-neutral-300 flex items-center gap-1 font-semibold transition"
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
