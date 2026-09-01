import React, { useState, useEffect } from 'react';
import { Calendar, Users, Building2, Check, CheckSquare, Square, Search, AlertCircle, Sparkles } from 'lucide-react';
import { format, addDays, parseISO } from 'date-fns';

export const DailyPlanner = ({
  selectedDate,
  onDateChange,
  departments = [],
  members = [],
  currentAssignments = [],
  onSaveAllocation,
  loading = false
}) => {
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });
  const [isSaving, setIsSaving] = useState(false);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const tomorrowStr = format(addDays(new Date(), 1), 'yyyy-MM-dd');

  // Initialize selected department
  useEffect(() => {
    if (departments.length > 0 && !selectedDeptId) {
      setSelectedDeptId(departments[0].id);
    }
  }, [departments, selectedDeptId]);

  // When date or department changes, pre-fill members currently assigned to this department on this date
  useEffect(() => {
    if (!selectedDeptId) return;

    const assignedForDept = currentAssignments
      .filter(a => a.department_id === selectedDeptId)
      .map(a => a.user_id);

    setSelectedUserIds(assignedForDept);
    setStatusMsg({ type: '', text: '' });
  }, [selectedDeptId, selectedDate, currentAssignments]);

  // Filter only active members per Rule 8
  const activeMembers = members.filter(m => m.is_active !== false);

  const filteredMembers = activeMembers.filter(m =>
    m.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleUser = (userId) => {
    setSelectedUserIds(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const selectAll = () => {
    setSelectedUserIds(filteredMembers.map(m => m.id));
  };

  const clearAll = () => {
    setSelectedUserIds([]);
  };

  const handleSave = async () => {
    if (!selectedDeptId) {
      setStatusMsg({ type: 'error', text: 'Please select a department' });
      return;
    }

    try {
      setIsSaving(true);
      setStatusMsg({ type: '', text: '' });
      await onSaveAllocation({
        dateStr: selectedDate,
        departmentId: selectedDeptId,
        userIds: selectedUserIds
      });
      setStatusMsg({
        type: 'success',
        text: `Successfully allocated ${selectedUserIds.length} member(s) to ${departments.find(d => d.id === selectedDeptId)?.name} for ${format(parseISO(selectedDate), 'MMMM d, yyyy')}.`
      });
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to save daily plan' });
    } finally {
      setIsSaving(false);
    }
  };

  // Find if user is assigned elsewhere today
  const getOtherDepartmentName = (userId) => {
    const otherAsgn = currentAssignments.find(
      a => a.user_id === userId && a.department_id !== selectedDeptId
    );
    if (otherAsgn) {
      return otherAsgn.department?.name || 'Another Department';
    }
    return null;
  };

  return (
    <div className="glass-card rounded-2xl p-6 border border-slate-800">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-400" />
            Daily Team Planner
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Allocate workforce members to departments for specific operational dates.
          </p>
        </div>

        {/* Date Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => onDateChange(todayStr)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              selectedDate === todayStr
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => onDateChange(tomorrowStr)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              selectedDate === tomorrowStr
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Tomorrow
          </button>
          <div className="relative">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-xs focus:outline-none focus:border-indigo-500 transition"
            />
          </div>
        </div>
      </div>

      {statusMsg.text && (
        <div className={`mt-4 p-3.5 rounded-xl text-xs flex items-center gap-2 ${
          statusMsg.type === 'success'
            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
            : 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
        }`}>
          {statusMsg.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Step 1 & 2: Department Selection */}
      <div className="mt-6">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
          Select Department
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {departments.map((dept) => {
            const isSelected = selectedDeptId === dept.id;
            const assignedCount = currentAssignments.filter(a => a.department_id === dept.id).length;

            return (
              <button
                key={dept.id}
                type="button"
                onClick={() => setSelectedDeptId(dept.id)}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                  isSelected
                    ? 'bg-indigo-600/15 border-indigo-500 text-white shadow-lg shadow-indigo-600/10'
                    : 'bg-slate-900/40 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-850'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <Building2 className={`w-4 h-4 ${isSelected ? 'text-indigo-400' : 'text-slate-500'}`} />
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    isSelected ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {assignedCount}
                  </span>
                </div>
                <span className="text-xs font-semibold truncate w-full">{dept.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 3: Team Members Selection Checklist */}
      <div className="mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Select Team Members
            </label>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Selected: {selectedUserIds.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search member..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500 transition w-44"
              />
            </div>
            <button
              type="button"
              onClick={selectAll}
              className="px-2.5 py-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-800 rounded-xl transition"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-80 overflow-y-auto pr-1">
          {filteredMembers.map((m) => {
            const isChecked = selectedUserIds.includes(m.id);
            const otherDept = getOtherDepartmentName(m.id);

            return (
              <div
                key={m.id}
                onClick={() => toggleUser(m.id)}
                className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                  isChecked
                    ? 'bg-indigo-600/10 border-indigo-500/60 text-white'
                    : 'bg-slate-950/60 border-slate-800/80 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-5 h-5 rounded flex items-center justify-center transition ${
                    isChecked ? 'text-indigo-400' : 'text-slate-600'
                  }`}>
                    {isChecked ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                  </div>

                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate flex items-center gap-1.5">
                      <span>{m.full_name}</span>
                      <span className="text-[10px] text-slate-500 font-normal">({m.role})</span>
                    </div>
                    {otherDept && !isChecked && (
                      <div className="text-[10px] text-amber-400/80 truncate">
                        Currently in: {otherDept}
                      </div>
                    )}
                    {isChecked && (
                      <div className="text-[10px] text-indigo-400 font-medium">
                        Allocated to this dept
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step 4: Save Plan CTA */}
      <div className="mt-6 pt-5 border-t border-slate-800 flex items-center justify-between">
        <div className="text-xs text-slate-400">
          Target Date: <strong className="text-slate-200">{format(parseISO(selectedDate), 'MMMM d, yyyy')}</strong>
        </div>

        <button
          type="button"
          disabled={isSaving || loading}
          onClick={handleSave}
          className="px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition shadow-lg shadow-indigo-600/25 flex items-center gap-2 disabled:opacity-50 cursor-pointer"
        >
          <Sparkles className="w-4 h-4" />
          {isSaving ? 'Saving Plan...' : 'SAVE PLAN'}
        </button>
      </div>
    </div>
  );
};

export default DailyPlanner;
