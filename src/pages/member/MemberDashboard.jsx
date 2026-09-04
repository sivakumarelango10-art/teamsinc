import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { tasksApi } from '../../api/tasksApi';
import { departmentsApi } from '../../api/departmentsApi';
import { planningApi } from '../../api/planningApi';
import { supabase } from '../../api/supabase';
import { useRealtime, broadcastRealtimeEvent } from '../../hooks/useRealtime';
import TaskCard from '../../components/tasks/TaskCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { Building2, CheckSquare } from 'lucide-react';
import { format } from 'date-fns';

export const MemberDashboard = () => {
  const { user, profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [userDepartments, setUserDepartments] = useState([]);

  const memberId = profile?.id || user?.id;
  const memberEmail = profile?.email?.toLowerCase() || user?.email?.toLowerCase();

  const loadMemberData = useCallback(async (isSilent = false) => {
    if (!memberId) return;
    try {
      if (!isSilent) setLoading(true);
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const [userTasks, permanentDepts, todayPlan] = await Promise.all([
        tasksApi.getTasks({ assigned_to: memberId, user_email: memberEmail }),
        departmentsApi.getUserDepartments(memberId).catch(() => []),
        planningApi.getDailyAllocations(todayStr).catch(() => ({ plan: null, assignments: [] }))
      ]);

      // Combine permanent department memberships, today's daily allocation, and task departments
      const deptMap = new Map();

      // 1. Permanent department assignments (from Founder / Admin management)
      (permanentDepts || []).forEach(d => {
        if (d?.id) deptMap.set(d.id, { ...d, source: 'permanent' });
      });

      // 2. Today's daily schedule allocation (from Daily Task Allocation)
      if (todayPlan?.assignments?.length) {
        const todayAsgn = todayPlan.assignments.find(a =>
          a.user_id === memberId ||
          (a.user && a.user.email?.toLowerCase() === memberEmail)
        );
        if (todayAsgn?.department?.id && !deptMap.has(todayAsgn.department.id)) {
          deptMap.set(todayAsgn.department.id, { ...todayAsgn.department, source: 'daily' });
        }
      }

      // 3. Departments associated with active deliverables
      (userTasks || []).forEach(t => {
        if (t.department?.id && !deptMap.has(t.department.id)) {
          deptMap.set(t.department.id, { ...t.department, source: 'task' });
        }
      });

      setTasks(userTasks || []);
      setUserDepartments(Array.from(deptMap.values()));
    } catch (err) {
      console.error('Failed to load member workspace:', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [memberId, memberEmail]);

  useEffect(() => {
    loadMemberData(false);
  }, [loadMemberData]);

  // Real-time synchronization: Instant updates on tasks, department memberships, and daily plans
  useRealtime(
    ['tasks', 'daily_assignments', 'department_members', 'departments'],
    () => loadMemberData(true),
    { channelPrefix: 'member_dash', broadcastChannel: 'teamsync_bc_tasks' }
  );

  const handleStatusChange = async (taskId, newStatus) => {
    // 1. Snapshot previous state for rollback
    const prevTasks = [...tasks];
    // 2. Optimistic UI update (0ms latency)
    setTasks(current => current.map(t => (t.id === taskId ? { ...t, status: newStatus } : t)));

    try {
      await tasksApi.updateTaskStatus(taskId, newStatus);
      broadcastRealtimeEvent('teamsync_bc_tasks', { taskId, newStatus });
      loadMemberData(true);
    } catch (err) {
      // Revert optimistic update on network/permission error
      setTasks(prevTasks);
      alert(err.message || 'Failed to update task status');
    }
  };

  if (loading) {
    return <LoadingSpinner text="Synchronizing your workspace..." size="large" />;
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
              Welcome to your daily workspace. Review your department responsibilities, track active deliverables, and update task progress.
            </p>

            {/* Assigned Departments Badges in Welcome Banner */}
            <div className="flex items-center gap-2 flex-wrap mt-4">
              <span className="text-xs font-semibold text-neutral-400">Responsible for:</span>
              {userDepartments.length > 0 ? (
                userDepartments.map(dept => (
                  <span
                    key={dept.id}
                    className="px-2.5 py-1 rounded-xl bg-purple-950/70 text-purple-200 border border-purple-800 text-xs font-bold flex items-center gap-1.5 shadow-sm"
                  >
                    <Building2 className="w-3.5 h-3.5 text-purple-400" />
                    <span>{dept.name}</span>
                  </span>
                ))
              ) : (
                <span className="px-2.5 py-1 rounded-xl bg-neutral-900 text-neutral-400 border border-neutral-800 text-xs">
                  No department assigned yet
                </span>
              )}
            </div>
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

      {/* MY RESPONSIBLE DEPARTMENTS */}
      <div className="bg-neutral-950 rounded-2xl p-6 border border-neutral-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-neutral-850 gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-neutral-900 text-white border border-neutral-800">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-widest font-extrabold text-neutral-400">
                Department Responsibilities
              </span>
              <h3 className="text-lg font-bold text-white">MY ASSIGNED DEPARTMENTS</h3>
            </div>
          </div>

          <span className="text-xs px-2.5 py-1 rounded-full bg-neutral-900 text-neutral-300 border border-neutral-800 font-bold self-start sm:self-auto">
            {userDepartments.length} {userDepartments.length === 1 ? 'Department' : 'Departments'}
          </span>
        </div>

        {userDepartments.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-neutral-850 rounded-2xl bg-neutral-900/20">
            <Building2 className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-white mb-1">No Departments Assigned</h4>
            <p className="text-xs text-neutral-400 max-w-sm mx-auto">
              You are currently not assigned to any department. Contact your Founder or Admin to be assigned to your functional units.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {userDepartments.map(dept => {
              const deptTasks = tasks.filter(t => t.department_id === dept.id);
              return (
                <div
                  key={dept.id}
                  className="p-4 rounded-xl bg-black border border-neutral-800 hover:border-neutral-700 transition flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-purple-400" />
                        <span>{dept.name}</span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-950/60 text-purple-300 border border-purple-800 font-bold">
                        {dept.source === 'daily' ? "Today's Schedule" : dept.source === 'task' ? "Task Assignment" : "Active Member"}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-400 leading-relaxed">
                      {dept.description || 'Core organizational department responsibility.'}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-neutral-850 flex items-center justify-between text-[11px] text-neutral-400">
                    <span>Assigned deliverables:</span>
                    <span className="font-bold text-white">{deptTasks.length} tasks</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
