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
import { usePresence } from '../../context/PresenceContext';
import { supabase } from '../../api/supabase';
import StatCard from '../../components/common/StatCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import UserForm from '../../components/users/UserForm';
import TaskForm from '../../components/tasks/TaskForm';

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

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [allUsers, allTasks, allDepts, memberMap] = await Promise.all([
        usersApi.getUsers(),
        tasksApi.getTasks(),
        departmentsApi.getDepartments(),
        departmentsApi.getAllDepartmentMemberships().catch(() => ({}))
      ]);

      setUsers(allUsers);
      setTasks(allTasks);
      setDepartments(allDepts);
      setMemberships(memberMap || {});
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();

    let channel = null;
    if (supabase) {
      channel = supabase
        .channel('founder-dashboard-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'tasks' },
          () => loadDashboardData()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'daily_assignments' },
          () => loadDashboardData()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'daily_plans' },
          () => loadDashboardData()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'profiles' },
          () => loadDashboardData()
        )
        .subscribe();
    }

    return () => {
      if (channel && supabase) supabase.removeChannel(channel);
    };
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
    </div>
  );
};

export default FounderDashboard;
