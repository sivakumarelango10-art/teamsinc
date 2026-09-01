import React, { useState, useEffect } from 'react';
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
import { BarChart3, CheckCircle2, Clock, Calendar, Users, Building2, TrendingUp } from 'lucide-react';
import { format, addDays } from 'date-fns';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import StatCard from '../../components/common/StatCard';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#3b82f6', '#8b5cf6'];

export const Reports = () => {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [todayAssignments, setTodayAssignments] = useState([]);

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [allTasks, allUsers, allDepts, todayPlan] = await Promise.all([
          tasksApi.getTasks(),
          usersApi.getUsers(),
          departmentsApi.getDepartments(),
          planningApi.getDailyAllocations(todayStr)
        ]);

        setTasks(allTasks);
        setUsers(allUsers);
        setDepartments(allDepts);
        setTodayAssignments(todayPlan.assignments || []);
      } catch (err) {
        console.error('Error fetching analytics data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return <LoadingSpinner text="Computing workforce analytics..." size="large" />;
  }

  // 1. Task Status Distribution
  const completedCount = tasks.filter(t => t.status === 'COMPLETED').length;
  const inProgressCount = tasks.filter(t => t.status === 'IN_PROGRESS').length;
  const todoCount = tasks.filter(t => t.status === 'TODO').length;
  const completionRate = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  const statusData = [
    { name: 'Completed', value: completedCount, color: '#10b981' },
    { name: 'In Progress', value: inProgressCount, color: '#f59e0b' },
    { name: 'Pending (Todo)', value: todoCount, color: '#6366f1' }
  ];

  // 2. Tasks by Department
  const tasksByDepartment = departments.map(d => ({
    name: d.name,
    tasks: tasks.filter(t => t.department_id === d.id).length
  }));

  // 3. Tasks by Member
  const activeMembers = users.filter(u => u.role === 'MEMBER' && u.is_active);
  const tasksByMember = activeMembers.map(m => ({
    name: m.full_name.split(' ')[0], // First name for clean axis
    completed: tasks.filter(t => t.assigned_to === m.id && t.status === 'COMPLETED').length,
    active: tasks.filter(t => t.assigned_to === m.id && t.status !== 'COMPLETED').length
  }));

  // 4. Daily Workforce Allocation (Today)
  const workforceByDept = departments.map(d => ({
    name: d.name,
    allocatedMembers: todayAssignments.filter(a => a.department_id === d.id).length
  }));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
          <BarChart3 className="w-7 h-7 text-indigo-400" />
          Executive Analytics & Reports
        </h1>
        <p className="text-xs md:text-sm text-slate-400 mt-1">
          Visual metrics on task completion velocity, department workload balance, and daily workforce density.
        </p>
      </div>

      {/* Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Task Completion Rate"
          value={`${completionRate}%`}
          subtitle={`${completedCount} of ${tasks.length} tasks finished`}
          icon={CheckCircle2}
          color="emerald"
        />
        <StatCard
          title="Active Work Items"
          value={inProgressCount + todoCount}
          subtitle="Currently ongoing"
          icon={Clock}
          color="amber"
        />
        <StatCard
          title="Today's Staffed Headcount"
          value={todayAssignments.length}
          subtitle="Assigned across departments"
          icon={Users}
          color="indigo"
        />
        <StatCard
          title="Active Departments"
          value={departments.length}
          subtitle="Operational units"
          icon={Building2}
          color="cyan"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Tasks by Department */}
        <div className="glass-panel p-6 rounded-3xl border border-slate-800">
          <h3 className="text-base font-bold text-white mb-1">Tasks by Department</h3>
          <p className="text-xs text-slate-400 mb-6">Distribution of task volume across functional teams</p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tasksByDepartment} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} angle={-25} textAnchor="end" />
                <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                />
                <Bar dataKey="tasks" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Daily Workforce Allocation Today */}
        <div className="glass-panel p-6 rounded-3xl border border-slate-800">
          <h3 className="text-base font-bold text-white mb-1">Today's Workforce Allocation</h3>
          <p className="text-xs text-slate-400 mb-6">Headcount deployed per department for {format(new Date(), 'MMM d, yyyy')}</p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workforceByDept} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} angle={-25} textAnchor="end" />
                <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                />
                <Bar dataKey="allocatedMembers" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Workload by Member */}
        <div className="glass-panel p-6 rounded-3xl border border-slate-800">
          <h3 className="text-base font-bold text-white mb-1">Workload by Team Member</h3>
          <p className="text-xs text-slate-400 mb-6">Completed vs active tasks assigned to teammates</p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tasksByMember} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="completed" name="Completed" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="active" name="Active" stackId="a" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Overall Task Pipeline Status */}
        <div className="glass-panel p-6 rounded-3xl border border-slate-800">
          <h3 className="text-base font-bold text-white mb-1">Task Pipeline Status</h3>
          <p className="text-xs text-slate-400 mb-6">Relative proportions of todo, active, and completed deliverables</p>
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
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;
