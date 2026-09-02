import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { tasksApi } from '../../api/tasksApi';
import { planningApi } from '../../api/planningApi';
import { supabase } from '../../api/supabase';
import TaskCard from '../../components/tasks/TaskCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { Building2, Calendar, CheckSquare } from 'lucide-react';
import { format, addDays } from 'date-fns';

export const MemberDashboard = () => {
  const { user, profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [todayAssignment, setTodayAssignment] = useState(null);
  const [tomorrowAssignment, setTomorrowAssignment] = useState(null);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const tomorrowStr = format(addDays(new Date(), 1), 'yyyy-MM-dd');

  const memberId = profile?.id || user?.id;
  const memberEmail = profile?.email?.toLowerCase() || user?.email?.toLowerCase();

  const loadMemberData = async () => {
    if (!memberId) return;
    try {
      setLoading(true);
      const [userTasks, todayPlan, tomorrowPlan] = await Promise.all([
        tasksApi.getTasks({ assigned_to: memberId, user_email: memberEmail }),
        planningApi.getDailyAllocations(todayStr),
        planningApi.getDailyAllocations(tomorrowStr)
      ]);

      setTasks(userTasks || []);

      const matchesUser = (a) =>
        a.user_id === memberId ||
        (a.user && a.user.email?.toLowerCase() === memberEmail);

      const userToday = todayPlan.assignments?.find(matchesUser) || null;
      const userTomorrow = tomorrowPlan.assignments?.find(matchesUser) || null;

      setTodayAssignment(userToday);
      setTomorrowAssignment(userTomorrow);
    } catch (err) {
      console.error('Failed to load member workspace:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMemberData();

    // Real-time synchronization: Any task assigned or modified reflects instantly
    let channel = null;
    if (supabase) {
      channel = supabase
        .channel('member-tasks-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'tasks' },
          () => {
            loadMemberData();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'daily_assignments' },
          () => {
            loadMemberData();
          }
        )
        .subscribe();
    }

    return () => {
      if (channel && supabase) supabase.removeChannel(channel);
    };
  }, [memberId, memberEmail]);

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      await tasksApi.updateTaskStatus(taskId, newStatus);
      await loadMemberData();
    } catch (err) {
      alert(err.message || 'Failed to update task status');
    }
  };

  if (loading) {
    return <LoadingSpinner text="Synchronizing your daily schedule..." size="large" />;
  }

  const completedCount = tasks.filter(t => t.status === 'COMPLETED').length;
  const inProgressCount = tasks.filter(t => t.status === 'IN_PROGRESS').length;
  const pendingCount = tasks.filter(t => t.status === 'TODO').length;

  return (
    <div className="space-y-8">
      {/* Personalized Welcome Banner */}
      <div className="bg-neutral-950 p-6 sm:p-8 rounded-3xl border border-neutral-800 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-neutral-900 text-white border border-neutral-700 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-neutral-300" />
                Team Workspace
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Hello, {profile?.full_name || 'Teammate'}!
            </h1>
            <p className="text-xs sm:text-sm text-neutral-400 mt-1 max-w-xl">
              Welcome to your daily workspace. Review today's department placement, track active sprint tasks, and update progress in real time.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 text-center min-w-[80px]">
              <div className="text-xl font-extrabold text-white">{inProgressCount}</div>
              <div className="text-[10px] text-neutral-400 uppercase font-semibold">Active</div>
            </div>
            <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 text-center min-w-[80px]">
              <div className="text-xl font-extrabold text-white">{completedCount}</div>
              <div className="text-[10px] text-neutral-400 uppercase font-semibold">Done</div>
            </div>
            <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 text-center min-w-[80px]">
              <div className="text-xl font-extrabold text-neutral-400">{pendingCount}</div>
              <div className="text-[10px] text-neutral-500 uppercase font-semibold">Todo</div>
            </div>
          </div>
        </div>
      </div>

      {/* TODAY'S WORK CARD */}
      <div className="bg-neutral-950 rounded-2xl p-6 border border-neutral-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-neutral-850 gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-neutral-900 text-white border border-neutral-800">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-widest font-extrabold text-neutral-400">
                Daily Assignment
              </span>
              <h3 className="text-lg font-bold text-white">TODAY'S WORK</h3>
            </div>
          </div>

          <div className="text-xs text-neutral-400">
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-black border border-neutral-800">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 block mb-1">
              Assigned Department
            </span>
            <div className="text-base font-bold text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-white" />
              <span>{todayAssignment?.department?.name || 'Unassigned for today'}</span>
            </div>
            <p className="text-xs text-neutral-400 mt-1">
              {todayAssignment?.department?.description || 'Your manager has not assigned you to a specific department for today.'}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-black border border-neutral-800">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 block mb-1">
              Tomorrow's Lookahead
            </span>
            <div className="text-base font-bold text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-neutral-300" />
              <span>{tomorrowAssignment?.department?.name || 'Schedule pending'}</span>
            </div>
            <p className="text-xs text-neutral-400 mt-1">
              {tomorrowAssignment?.department?.description || 'Tomorrow’s department schedule will appear once published by your Admin.'}
            </p>
          </div>
        </div>
      </div>

      {/* MY ASSIGNED TASKS */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-white" />
              My Assigned Tasks
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Click the status buttons on each card to transition your work (To Do → In Progress → Done).
            </p>
          </div>
          <span className="px-3 py-0.5 rounded text-xs font-bold bg-neutral-900 text-white border border-neutral-700">
            {tasks.length} total
          </span>
        </div>

        {tasks.length === 0 ? (
          <EmptyState
            icon={CheckSquare}
            title="All caught up!"
            description="You have no tasks assigned at this moment. Reach out to your Admin or check your daily department."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                canManage={false}
                canUpdateStatus={true}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MemberDashboard;
