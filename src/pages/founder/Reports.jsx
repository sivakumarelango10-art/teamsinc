import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { tasksApi } from '../../api/tasksApi';
import { usersApi } from '../../api/usersApi';
import { departmentsApi } from '../../api/departmentsApi';
import { planningApi } from '../../api/planningApi';
import { supabase } from '../../api/supabase';
import { useRealtime } from '../../hooks/useRealtime';
import { BarChart3, CheckCircle2, Clock, Users, Building2, AlertTriangle, ArrowUpRight } from 'lucide-react';
import { format, isPast, parseISO } from 'date-fns';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import StatCard from '../../components/common/StatCard';

export const Reports = () => {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [todayAssignments, setTodayAssignments] = useState([]);

  const fetchData = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const [allTasks, allUsers, allDepts, todayPlan] = await Promise.all([
        tasksApi.getTasks(),
        usersApi.getUsers(),
        departmentsApi.getDepartments(),
        planningApi.getDailyAllocations(todayStr)
      ]);

      setTasks(allTasks || []);
      setUsers(allUsers || []);
      setDepartments(allDepts || []);
      setTodayAssignments(todayPlan.assignments || []);
    } catch (err) {
      console.error('Error fetching analytics data:', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  // Real-time synchronization for workforce analytics
  useRealtime(
    ['tasks', 'daily_assignments', 'profiles', 'departments'],
    () => fetchData(true),
    { channelPrefix: 'reports_realtime' }
  );

  if (loading) {
    return <LoadingSpinner text="Computing workforce analytics..." size="large" />;
  }

  // 1. Task Status Distribution (Memoized)
  const { completedCount, inProgressCount, todoCount, completionRate, statusData } = useMemo(() => {
    let completed = 0;
    let inProgress = 0;
    let todo = 0;

    tasks.forEach(t => {
      if (t.status === 'COMPLETED') completed++;
      else if (t.status === 'IN_PROGRESS') inProgress++;
      else if (t.status === 'TODO') todo++;
    });

    const rate = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0;
    const data = [
      { name: 'Completed', value: completed, color: '#ffffff' },
      { name: 'In Progress', value: inProgress, color: '#a3a3a3' },
      { name: 'Pending (Todo)', value: todo, color: '#404040' }
    ];

    return {
      completedCount: completed,
      inProgressCount: inProgress,
      todoCount: todo,
      completionRate: rate,
      statusData: data
    };
  }, [tasks]);

  // 2. Tasks by Department (Memoized)
  const tasksByDepartment = useMemo(() => {
    return departments.map(d => ({
      name: d.name,
      tasks: tasks.filter(t => t.department_id === d.id).length
    }));
  }, [departments, tasks]);

  // 3. Tasks by Member (Memoized & capped to top 12 active contributors for 200-user scalability)
  const tasksByMember = useMemo(() => {
    const activeMembers = users.filter(u => u.role === 'MEMBER' && u.is_active);
    const list = activeMembers.map(m => {
      let completed = 0;
      let active = 0;
      tasks.forEach(t => {
        if (t.assigned_to === m.id) {
          if (t.status === 'COMPLETED') completed++;
          else active++;
        }
      });
      return {
        name: m.full_name ? m.full_name.split(' ')[0] : 'Member',
        completed,
        active,
        total: completed + active
      };
    });

    return list.sort((a, b) => b.total - a.total).slice(0, 12);
  }, [users, tasks]);

  // 4. Daily Workforce Allocation (Today, Memoized)
  const workforceByDept = useMemo(() => {
    return departments.map(d => ({
      name: d.name,
      allocatedMembers: todayAssignments.filter(a => a.department_id === d.id).length
    }));
  }, [departments, todayAssignments]);

  // 5. Department Breakdown Metrics Table Data (Memoized)
  const departmentTableData = useMemo(() => {
    return departments.map(d => {
      const deptTasks = tasks.filter(t => t.department_id === d.id);
      const completed = deptTasks.filter(t => t.status === 'COMPLETED').length;
      const inProgress = deptTasks.filter(t => t.status === 'IN_PROGRESS').length;
      const todo = deptTasks.filter(t => t.status === 'TODO').length;
      const rate = deptTasks.length > 0 ? Math.round((completed / deptTasks.length) * 100) : 0;
      const headcount = todayAssignments.filter(a => a.department_id === d.id).length;
      const overdue = deptTasks.filter(
        t => t.deadline && isPast(parseISO(t.deadline)) && t.status !== 'COMPLETED'
      ).length;

      return {
        id: d.id,
        name: d.name,
        headcount,
        totalTasks: deptTasks.length,
        inProgress,
        completed,
        todo,
        rate,
        overdue
      };
    });
  }, [departments, tasks, todayAssignments]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
          <BarChart3 className="w-7 h-7 text-white" />
          Executive Analytics & Reports
        </h1>
        <p className="text-xs md:text-sm text-neutral-400 mt-1">
          Visual metrics on task completion velocity, department workload balance, and daily workforce density.
        </p>
      </div>

      {/* Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Completion Rate"
          value={`${completionRate}%`}
          subtitle={`${completedCount} of ${tasks.length} tasks finished`}
          icon={CheckCircle2}
        />
        <StatCard
          title="Active Work Items"
          value={inProgressCount + todoCount}
          subtitle="Currently ongoing"
          icon={Clock}
        />
        <StatCard
          title="Staffed Headcount"
          value={todayAssignments.length}
          subtitle="Assigned across departments"
          icon={Users}
        />
        <StatCard
          title="Active Departments"
          value={departments.length}
          subtitle="Operational units"
          icon={Building2}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Tasks by Department */}
        <div className="bg-neutral-950 p-6 rounded-2xl border border-neutral-800">
          <h3 className="text-base font-bold text-white mb-1">Tasks by Department</h3>
          <p className="text-xs text-neutral-400 mb-6">Distribution of task volume across functional teams</p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tasksByDepartment} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <XAxis dataKey="name" stroke="#525252" fontSize={11} angle={-25} textAnchor="end" />
                <YAxis stroke="#525252" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#262626', borderRadius: '0.75rem', fontSize: '12px', color: '#ffffff' }}
                />
                <Bar dataKey="tasks" fill="#ffffff" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Daily Workforce Allocation Today */}
        <div className="bg-neutral-950 p-6 rounded-2xl border border-neutral-800">
          <h3 className="text-base font-bold text-white mb-1">Today's Workforce Allocation</h3>
          <p className="text-xs text-neutral-400 mb-6">Headcount deployed per department for {format(new Date(), 'MMM d, yyyy')}</p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workforceByDept} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <XAxis dataKey="name" stroke="#525252" fontSize={11} angle={-25} textAnchor="end" />
                <YAxis stroke="#525252" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#262626', borderRadius: '0.75rem', fontSize: '12px', color: '#ffffff' }}
                />
                <Bar dataKey="allocatedMembers" fill="#a3a3a3" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Workload by Member */}
        <div className="bg-neutral-950 p-6 rounded-2xl border border-neutral-800">
          <h3 className="text-base font-bold text-white mb-1">Workload by Team Member</h3>
          <p className="text-xs text-neutral-400 mb-6">Top contributors: Completed vs active tasks assigned</p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tasksByMember} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                <XAxis dataKey="name" stroke="#525252" fontSize={11} />
                <YAxis stroke="#525252" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#262626', borderRadius: '0.75rem', fontSize: '12px', color: '#ffffff' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="completed" name="Completed" stackId="a" fill="#ffffff" radius={[0, 0, 0, 0]} />
                <Bar dataKey="active" name="Active" stackId="a" fill="#525252" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Overall Task Pipeline Status */}
        <div className="bg-neutral-950 p-6 rounded-2xl border border-neutral-800">
          <h3 className="text-base font-bold text-white mb-1">Task Pipeline Status</h3>
          <p className="text-xs text-neutral-400 mb-6">Proportion of finished vs ongoing deliverables</p>
          <div className="h-64 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={85}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#262626', borderRadius: '0.75rem', fontSize: '12px', color: '#ffffff' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Operational Breakdown Table */}
      <div className="bg-neutral-950 p-6 rounded-2xl border border-neutral-800 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-purple-400" />
              <span>Department Operational Breakdown</span>
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Granular status metrics, workforce density, and completion velocity across all departments
            </p>
          </div>
          <span className="text-[11px] font-semibold text-neutral-400 bg-neutral-900 px-2.5 py-1 rounded-lg border border-neutral-800 w-fit">
            {departments.length} Active Departments
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-neutral-800">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-neutral-900/90 text-neutral-300 font-semibold border-b border-neutral-800">
              <tr>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3 text-center">Staffed Today</th>
                <th className="px-4 py-3 text-center">Total Tasks</th>
                <th className="px-4 py-3 text-center">In Progress</th>
                <th className="px-4 py-3 text-center">Completed</th>
                <th className="px-4 py-3">Completion Rate</th>
                <th className="px-4 py-3 text-right">Risk Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/80 text-neutral-200">
              {departmentTableData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-neutral-500">
                    No department data available.
                  </td>
                </tr>
              ) : (
                departmentTableData.map((dept) => (
                  <tr key={dept.id} className="hover:bg-neutral-900/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-white">
                      {dept.name}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-neutral-800 text-neutral-200 border border-neutral-700">
                        {dept.headcount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-mono">
                      {dept.totalTasks}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-amber-400 font-medium font-mono">{dept.inProgress}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-emerald-400 font-medium font-mono">{dept.completed}</span>
                    </td>
                    <td className="px-4 py-3 min-w-[140px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-white rounded-full transition-all duration-300"
                            style={{ width: `${dept.rate}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-semibold text-neutral-300 w-8 text-right font-mono">
                          {dept.rate}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {dept.overdue > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-400 bg-red-950/40 border border-red-800/60 px-2 py-0.5 rounded-md">
                          <AlertTriangle className="w-3 h-3" />
                          <span>{dept.overdue} Overdue</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/30 border border-emerald-800/40 px-2 py-0.5 rounded-md">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>On Track</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Reports;
