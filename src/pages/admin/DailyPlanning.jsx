import React, { useState, useEffect, useCallback } from 'react';
import { tasksApi } from '../../api/tasksApi';
import { departmentsApi } from '../../api/departmentsApi';
import { usersApi } from '../../api/usersApi';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../api/supabase';
import { useRealtime } from '../../hooks/useRealtime';
import DailyTaskAllocation from '../../components/planning/DailyTaskAllocation';
import TaskForm from '../../components/tasks/TaskForm';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { Calendar, PlusCircle, CheckSquare, Clock } from 'lucide-react';
import { format, parseISO, addDays } from 'date-fns';

export const DailyPlanning = () => {
  const { user } = useAuth();

  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [tasks, setTasks] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [memberships, setMemberships] = useState({});
  const [loading, setLoading] = useState(true);

  // Modals
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskModalInitialData, setTaskModalInitialData] = useState(null);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const tomorrowStr = format(addDays(new Date(), 1), 'yyyy-MM-dd');

  const loadData = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const [allTasks, allDepts, allUsers, memberMap] = await Promise.all([
        tasksApi.getTasks(),
        departmentsApi.getDepartments(),
        usersApi.getUsers(),
        departmentsApi.getAllDepartmentMemberships().catch(() => ({}))
      ]);

      setTasks(allTasks);
      setDepartments(allDepts);
      setUsers(allUsers);
      setMemberships(memberMap || {});
    } catch (err) {
      console.error('Error loading daily task allocation data:', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // Real-time synchronization across tasks, daily plans, assignments, and departments
  useRealtime(
    ['tasks', 'daily_plans', 'daily_assignments', 'departments', 'department_members'],
    () => loadData(true),
    { channelPrefix: 'daily_planning', broadcastChannel: 'teamsync_bc_daily_plans' }
  );

  const handleCreateTask = async (taskData) => {
    try {
      await tasksApi.createTask({
        ...taskData,
        assigned_by: user?.id,
        created_by: user?.id,
        deadline: taskData.deadline || selectedDate
      });

      try {
        const bc = new BroadcastChannel('teamsync_task_updates');
        bc.postMessage({ type: 'TASK_CREATED' });
        bc.close();
      } catch {}

      await loadData(true);
      setIsTaskModalOpen(false);
      setTaskModalInitialData(null);
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header with Date Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Calendar className="w-7 h-7 text-white" />
            <span>Daily Task Allocation</span>
          </h1>
          <p className="text-xs md:text-sm text-neutral-400 mt-1">
            Allocate and schedule daily deliverables across team members. Track real-time progress and completion for any date.
          </p>
        </div>

        {/* Date Filter Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setSelectedDate(todayStr)}
            className={`px-3 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
              selectedDate === todayStr
                ? 'bg-white text-black shadow-md'
                : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(tomorrowStr)}
            className={`px-3 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
              selectedDate === tomorrowStr
                ? 'bg-white text-black shadow-md'
                : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
            }`}
          >
            Tomorrow
          </button>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs text-white font-mono outline-none focus:border-white transition cursor-pointer"
          />

          <button
            type="button"
            onClick={() => {
              setTaskModalInitialData({ deadline: selectedDate });
              setIsTaskModalOpen(true);
            }}
            className="px-4 py-2 rounded-xl bg-white text-black hover:bg-neutral-200 text-xs font-bold flex items-center gap-1.5 shadow-md transition cursor-pointer"
          >
            <PlusCircle className="w-4 h-4 text-black" />
            <span>Allocate Task</span>
          </button>
        </div>
      </div>

      {loading && users.length === 0 ? (
        <LoadingSpinner text="Loading daily task allocations..." size="large" />
      ) : (
        <div className="space-y-6">
          <DailyTaskAllocation
            tasks={tasks}
            users={users}
            departments={departments}
            memberships={memberships}
            selectedDate={selectedDate}
            title={`Task Allocations (${format(parseISO(selectedDate), 'MMMM d, yyyy')})`}
            subtitle={`Deliverables and action items scheduled for ${format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy')}`}
            canManage={true}
            onOpenTaskModal={(initial) => {
              setTaskModalInitialData({ ...initial, deadline: selectedDate });
              setIsTaskModalOpen(true);
            }}
            onManageLink={null}
          />
        </div>
      )}

      {/* Task Creation Modal */}
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

export default DailyPlanning;
