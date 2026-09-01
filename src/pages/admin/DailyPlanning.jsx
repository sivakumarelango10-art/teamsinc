import React, { useState, useEffect } from 'react';
import { planningApi } from '../../api/planningApi';
import { departmentsApi } from '../../api/departmentsApi';
import { usersApi } from '../../api/usersApi';
import { useAuth } from '../../hooks/useAuth';
import DailyPlanner from '../../components/planning/DailyPlanner';
import DepartmentAllocation from '../../components/planning/DepartmentAllocation';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { Calendar, Users, Building2, CheckCircle2, Layers } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export const DailyPlanning = () => {
  const { user } = useAuth();

  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [departments, setDepartments] = useState([]);
  const [members, setMembers] = useState([]);
  const [currentAssignments, setCurrentAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async (dateStr) => {
    try {
      setLoading(true);
      const targetDate = dateStr || selectedDate;
      const [allDepts, allUsers, planData] = await Promise.all([
        departmentsApi.getDepartments(),
        usersApi.getUsers(),
        planningApi.getDailyAllocations(targetDate)
      ]);

      setDepartments(allDepts);
      setMembers(allUsers.filter(u => u.role === 'MEMBER' && u.is_active));
      setCurrentAssignments(planData.assignments || []);
    } catch (err) {
      console.error('Error loading planning data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(selectedDate);
  }, [selectedDate]);

  const handleSaveAllocation = async ({ dateStr, departmentId, userIds }) => {
    await planningApi.saveDepartmentAllocation({
      dateStr,
      departmentId,
      userIds,
      createdBy: user?.id
    });
    // Refresh
    await loadData(dateStr);
  };

  const handleRemoveAssignment = async (assignmentId) => {
    await planningApi.removeAssignment(assignmentId);
    await loadData(selectedDate);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
          <Calendar className="w-7 h-7 text-indigo-400" />
          Daily Workforce Planner
        </h1>
        <p className="text-xs md:text-sm text-slate-400 mt-1">
          Dynamically schedule team members across departments for any target date. Members see their specific allocation when they sign in.
        </p>
      </div>

      {loading && departments.length === 0 ? (
        <LoadingSpinner text="Loading workforce planner..." size="large" />
      ) : (
        <div className="space-y-8">
          {/* Main Interactive Daily Planner */}
          <DailyPlanner
            selectedDate={selectedDate}
            onDateChange={(newDate) => setSelectedDate(newDate)}
            departments={departments}
            members={members}
            currentAssignments={currentAssignments}
            onSaveAllocation={handleSaveAllocation}
            loading={loading}
          />

          {/* Allocation Grid for Selected Date */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    Allocations for {format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy')}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {currentAssignments.length} total team members deployed across {departments.length} departments
                  </p>
                </div>
              </div>
            </div>

            <DepartmentAllocation
              departments={departments}
              assignments={currentAssignments}
              onRemoveAssignment={handleRemoveAssignment}
              canManage={true}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default DailyPlanning;
