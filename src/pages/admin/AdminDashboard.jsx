import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckSquare,
  CheckCircle2,
  Clock,
  CircleDot,
  Calendar,
  PlusCircle,
  ArrowUpRight,
  Shield
} from 'lucide-react';
import { format, addDays } from 'date-fns';
import { tasksApi } from '../../api/tasksApi';
import { planningApi } from '../../api/planningApi';
import { departmentsApi } from '../../api/departmentsApi';
import { usersApi } from '../../api/usersApi';
import { useAuth } from '../../hooks/useAuth';
import StatCard from '../../components/common/StatCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import DepartmentAllocation from '../../components/planning/DepartmentAllocation';
import TaskForm from '../../components/tasks/TaskForm';

export const AdminDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [members, setMembers] = useState([]);
  const [todayAllocations, setTodayAllocations] = useState([]);
  const [tomorrowAllocations, setTomorrowAllocations] = useState([]);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const tomorrowStr = format(addDays(new Date(), 1), 'yyyy-MM-dd');

  const loadData = async () => {
    try {
      setLoading(true);
      const [allTasks, allDepts, allUsers, todayPlan, tomorrowPlan] = await Promise.all([
        tasksApi.getTasks(),
        departmentsApi.getDepartments(),
        usersApi.getUsers(),
        planningApi.getDailyAllocations(todayStr),
        planningApi.getDailyAllocations(tomorrowStr)
      ]);

      setTasks(allTasks);
      setDepartments(allDepts);
      setMembers(allUsers.filter(u => u.role === 'MEMBER' && u.is_active));
      setTodayAllocations(todayPlan.assignments || []);
      setTomorrowAllocations(tomorrowPlan.assignments || []);
    } catch (err) {
      console.error('Failed to load admin dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const myCreatedTasks = tasks.filter(t => t.assigned_by === user?.id);
  const totalAssignedTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'COMPLETED').length;
  const pendingTasks = tasks.filter(t => t.status === 'TODO').length;
  const inProgressTasks = tasks.filter(t => t.status === 'IN_PROGRESS').length;

  const handleCreateTask = async (taskData) => {
    await tasksApi.createTask(taskData);
    await loadData();
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
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              Task Manager Operations
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight mt-1.5">
            Admin Dashboard
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Dispatch tasks, balance daily team allocations, and monitor execution milestones.
          </p>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsTaskModalOpen(true)}
            className="px-4 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition shadow-lg shadow-indigo-600/25 flex items-center gap-2 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Assign Task</span>
          </button>

          <button
            onClick={() => navigate('/admin/daily-planning')}
            className="px-4 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition shadow-lg shadow-emerald-600/25 flex items-center gap-2 cursor-pointer"
          >
            <Calendar className="w-4 h-4" />
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
          color="indigo"
        />
        <StatCard
          title="Total Assigned Tasks"
          value={totalAssignedTasks}
          subtitle="Across active team"
          icon={CheckSquare}
          color="cyan"
        />
        <StatCard
          title="In Progress"
          value={inProgressTasks}
          subtitle="Being worked on now"
          icon={Clock}
          color="amber"
        />
        <StatCard
          title="Completed"
          value={completedTasks}
          subtitle="Successfully closed"
          icon={CheckCircle2}
          color="emerald"
        />
        <StatCard
          title="Pending (Todo)"
          value={pendingTasks}
          subtitle="Queued up"
          icon={CircleDot}
          color="rose"
        />
      </div>

      {/* Allocations: Today & Tomorrow */}
      <div className="space-y-6">
        {/* Today */}
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
                  {format(new Date(), 'EEEE, MMMM d, yyyy')} — {todayAllocations.length} total members placed
                </p>
              </div>
            </div>

            <button
              onClick={() => navigate('/admin/daily-planning')}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold transition"
            >
              <span>Modify Today's Plan</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>

          <DepartmentAllocation
            departments={departments}
            assignments={todayAllocations}
            canManage={false}
          />
        </div>

        {/* Tomorrow */}
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
                  {format(addDays(new Date(), 1), 'EEEE, MMMM d, yyyy')} — {tomorrowAllocations.length} members planned
                </p>
              </div>
            </div>

            <button
              onClick={() => navigate('/admin/daily-planning')}
              className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold transition"
            >
              <span>Modify Tomorrow's Plan</span>
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

      {/* Task Modal */}
      <TaskForm
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSubmit={handleCreateTask}
        members={members}
        departments={departments}
        currentUserId={user?.id}
      />
    </div>
  );
};

export default AdminDashboard;
