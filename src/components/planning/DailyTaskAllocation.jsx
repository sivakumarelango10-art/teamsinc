import React, { useState, useMemo } from 'react';
import {
  Calendar,
  CheckSquare,
  Clock,
  CheckCircle2,
  CircleDot,
  AlertCircle,
  PlusCircle,
  Search,
  ArrowUpRight,
  User,
  Shield,
  Building2,
  ChevronRight,
  Filter
} from 'lucide-react';
import { format, parseISO, isToday, isTomorrow, isPast } from 'date-fns';
import { useNavigate } from 'react-router-dom';

const PRIORITY_BADGES = {
  URGENT: { bg: 'bg-red-500/10 text-red-400 border-red-500/30', label: 'Urgent' },
  HIGH: { bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30', label: 'High' },
  MEDIUM: { bg: 'bg-blue-500/10 text-blue-400 border-blue-500/30', label: 'Medium' },
  LOW: { bg: 'bg-neutral-500/10 text-neutral-400 border-neutral-700', label: 'Low' }
};

const STATUS_BADGES = {
  TODO: { bg: 'bg-neutral-800 text-neutral-300 border-neutral-700', icon: CircleDot, label: 'Todo' },
  IN_PROGRESS: { bg: 'bg-amber-950/60 text-amber-300 border-amber-800/80', icon: Clock, label: 'In Progress' },
  COMPLETED: { bg: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/80', icon: CheckCircle2, label: 'Completed' }
};

export const DailyTaskAllocation = ({
  tasks = [],
  users = [],
  departments = [],
  memberships = {},
  selectedDate,
  title = "Today's Task Allocation",
  subtitle,
  canManage = true,
  onOpenTaskModal,
  onManageLink = '/admin/daily-planning'
}) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const targetDateStr = selectedDate || format(new Date(), 'yyyy-MM-dd');

  // Filter active team members (exclude deactivated accounts)
  const activeMembers = useMemo(() => {
    return users.filter(u => u.is_active !== false);
  }, [users]);

  // Map tasks to members for the selected date
  const memberAllocationData = useMemo(() => {
    return activeMembers.map(member => {
      // Find tasks assigned to this member
      const memberTasks = tasks.filter(t => {
        if (t.assigned_to !== member.id) return false;
        if (!t.deadline) return true; // Include undated tasks in today's active pool
        return t.deadline === targetDateStr || (isToday(parseISO(targetDateStr)) && isPast(parseISO(t.deadline)) && t.status !== 'COMPLETED');
      });

      // Filter by status if selected
      const filteredTasks = statusFilter === 'ALL'
        ? memberTasks
        : memberTasks.filter(t => t.status === statusFilter);

      const completed = memberTasks.filter(t => t.status === 'COMPLETED').length;
      const inProgress = memberTasks.filter(t => t.status === 'IN_PROGRESS').length;
      const pending = memberTasks.filter(t => t.status === 'TODO').length;
      const total = memberTasks.length;
      const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

      // Find departments this member belongs to
      const memberDepts = departments.filter(dept => {
        const memberList = memberships[dept.id] || [];
        return memberList.some(m => m.id === member.id);
      });

      return {
        member,
        tasks: filteredTasks,
        allTasksCount: total,
        completed,
        inProgress,
        pending,
        progressPercent,
        departments: memberDepts
      };
    }).filter(item => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return (
        item.member.full_name?.toLowerCase().includes(query) ||
        item.member.email?.toLowerCase().includes(query) ||
        item.departments.some(d => d.name.toLowerCase().includes(query)) ||
        item.tasks.some(t => t.title.toLowerCase().includes(query))
      );
    });
  }, [activeMembers, tasks, targetDateStr, statusFilter, departments, memberships, searchQuery]);

  const totalAllocatedTasks = useMemo(() => {
    return memberAllocationData.reduce((acc, curr) => acc + curr.allTasksCount, 0);
  }, [memberAllocationData]);

  const totalCompletedTasks = useMemo(() => {
    return memberAllocationData.reduce((acc, curr) => acc + curr.completed, 0);
  }, [memberAllocationData]);

  const totalInProgressTasks = useMemo(() => {
    return memberAllocationData.reduce((acc, curr) => acc + curr.inProgress, 0);
  }, [memberAllocationData]);

  return (
    <div className="space-y-4">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-neutral-900 text-white border border-neutral-800 shadow-sm">
            <CheckSquare className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span>{title}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-850 text-neutral-300 font-normal border border-neutral-700">
                {totalAllocatedTasks} tasks
              </span>
            </h3>
            <p className="text-xs text-neutral-400">
              {subtitle || `${format(parseISO(targetDateStr), 'EEEE, MMMM d, yyyy')} — ${totalCompletedTasks}/${totalAllocatedTasks} completed (${totalInProgressTasks} in progress)`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canManage && onOpenTaskModal && (
            <button
              type="button"
              onClick={() => onOpenTaskModal()}
              className="px-3 py-1.5 text-xs font-bold text-black bg-white hover:bg-neutral-200 rounded-xl transition shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5 text-black" />
              <span>Allocate Task</span>
            </button>
          )}

          {onManageLink && (
            <button
              type="button"
              onClick={() => navigate(onManageLink)}
              className="px-3 py-1.5 text-xs font-bold text-neutral-300 hover:text-white bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 rounded-xl transition shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <span>Manage Planner</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-2xl bg-neutral-950 border border-neutral-850">
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search member or task..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-neutral-900 border border-neutral-800 focus:border-white text-white placeholder:text-neutral-500 outline-none transition"
          />
        </div>

        {/* Status Filter Chips */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <span className="text-[11px] font-semibold text-neutral-500 mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3" /> Status:
          </span>
          {[
            { id: 'ALL', label: 'All' },
            { id: 'TODO', label: 'Todo' },
            { id: 'IN_PROGRESS', label: 'In Progress' },
            { id: 'COMPLETED', label: 'Completed' }
          ].map(chip => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setStatusFilter(chip.id)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition cursor-pointer shrink-0 ${
                statusFilter === chip.id
                  ? 'bg-white text-black font-bold shadow-sm'
                  : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Member Task Allocation Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {memberAllocationData.map(({ member, tasks: memberTasks, allTasksCount, completed, inProgress, pending, progressPercent, departments: memberDepts }) => (
          <div
            key={member.id}
            className="rounded-2xl bg-neutral-950 border border-neutral-850 p-4.5 flex flex-col justify-between hover:border-neutral-700 transition shadow-sm space-y-3.5 group"
          >
            {/* Member Profile Header */}
            <div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-neutral-800 to-neutral-700 border border-neutral-700 flex items-center justify-center font-bold text-white text-xs shrink-0 overflow-hidden shadow-inner">
                    {member.avatar_url ? (
                      <img src={member.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      member.full_name?.charAt(0).toUpperCase() || 'U'
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white group-hover:text-white transition flex items-center gap-1.5">
                      <span>{member.full_name}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-900 text-neutral-400 border border-neutral-800 font-mono">
                        {member.role}
                      </span>
                    </h4>
                    <p className="text-[11px] text-neutral-400 truncate max-w-[170px]">
                      {member.email}
                    </p>
                  </div>
                </div>

                {/* Task Count Badge */}
                <div className="text-right">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    allTasksCount === 0
                      ? 'bg-neutral-900 text-neutral-500 border-neutral-800'
                      : completed === allTasksCount
                      ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
                      : 'bg-neutral-900 text-white border-neutral-700'
                  }`}>
                    {allTasksCount === 0 ? 'No tasks' : `${completed}/${allTasksCount} Done`}
                  </span>
                </div>
              </div>

              {/* Department Badges */}
              {memberDepts.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
                  {memberDepts.map(d => (
                    <span
                      key={d.id}
                      className="px-2 py-0.5 rounded-md bg-neutral-900 border border-neutral-800 text-[10px] text-neutral-300 flex items-center gap-1"
                    >
                      <Building2 className="w-2.5 h-2.5 text-neutral-400" />
                      <span>{d.name}</span>
                    </span>
                  ))}
                </div>
              )}

              {/* Completion Rate Progress Bar */}
              {allTasksCount > 0 && (
                <div className="space-y-1 mb-2">
                  <div className="flex justify-between text-[10px] text-neutral-400">
                    <span>Task Progress</span>
                    <span className="font-mono text-white font-bold">{progressPercent}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-neutral-900 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Task Item List for this Member */}
            <div className="space-y-2 flex-1">
              {memberTasks.length === 0 ? (
                <div className="py-5 px-3 rounded-xl border border-dashed border-neutral-850 text-center bg-neutral-900/30">
                  <p className="text-[11px] text-neutral-500">No tasks allocated for this date</p>
                  {canManage && onOpenTaskModal && (
                    <button
                      type="button"
                      onClick={() => onOpenTaskModal({ assigned_to: member.id })}
                      className="mt-1.5 text-[11px] text-white hover:underline font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <PlusCircle className="w-3 h-3" />
                      <span>Assign Task</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {memberTasks.map(task => {
                    const statusMeta = STATUS_BADGES[task.status] || STATUS_BADGES.TODO;
                    const priorityMeta = PRIORITY_BADGES[task.priority] || PRIORITY_BADGES.MEDIUM;
                    const StatusIcon = statusMeta.icon;

                    return (
                      <div
                        key={task.id}
                        className="p-2.5 rounded-xl bg-neutral-900/70 border border-neutral-800/80 hover:border-neutral-700 transition flex flex-col gap-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h5 className="text-xs font-semibold text-white leading-snug line-clamp-2">
                            {task.title}
                          </h5>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 ${priorityMeta.bg}`}>
                            {priorityMeta.label}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-neutral-400 pt-0.5 border-t border-neutral-850">
                          <span className={`px-1.5 py-0.5 rounded border text-[9px] font-medium flex items-center gap-1 ${statusMeta.bg}`}>
                            <StatusIcon className="w-2.5 h-2.5" />
                            <span>{statusMeta.label}</span>
                          </span>

                          {task.deadline && (
                            <span className="font-mono text-[10px] text-neutral-400">
                              {task.deadline === targetDateStr ? 'Today' : format(parseISO(task.deadline), 'MMM d')}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quick Allocate Task for this Member */}
            {canManage && onOpenTaskModal && (
              <div className="pt-2 border-t border-neutral-850/80 flex justify-end">
                <button
                  type="button"
                  onClick={() => onOpenTaskModal({ assigned_to: member.id })}
                  className="w-full py-1.5 px-3 rounded-xl bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 hover:border-neutral-700 text-[11px] font-bold text-neutral-300 hover:text-white transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <PlusCircle className="w-3 h-3 text-neutral-400" />
                  <span>Allocate Task to {member.full_name?.split(' ')[0]}</span>
                </button>
              </div>
            )}
          </div>
        ))}

        {memberAllocationData.length === 0 && (
          <div className="col-span-full py-12 text-center rounded-2xl border border-dashed border-neutral-800 bg-neutral-950 p-6">
            <CheckSquare className="w-10 h-10 text-neutral-600 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-white mb-1">No Team Members Found</h4>
            <p className="text-xs text-neutral-400 max-w-sm mx-auto">
              {searchQuery ? `No members match search query "${searchQuery}".` : 'Add team members to start allocating daily tasks.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DailyTaskAllocation;
