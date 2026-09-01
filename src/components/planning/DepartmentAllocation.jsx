import React from 'react';
import { Building2, X } from 'lucide-react';

export const DepartmentAllocation = ({
  departments = [],
  assignments = [],
  onRemoveAssignment,
  canManage = false
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {departments.map((dept) => {
        const deptAssignments = assignments.filter(a => a.department_id === dept.id);
        const count = deptAssignments.length;

        return (
          <div
            key={dept.id}
            className="bg-neutral-950 rounded-2xl p-5 border border-neutral-800 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-800">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-neutral-900 text-white border border-neutral-800">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">{dept.name}</h4>
                    <p className="text-[11px] text-neutral-400 line-clamp-1">{dept.description}</p>
                  </div>
                </div>
                <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-neutral-900 text-white border border-neutral-700">
                  {count} {count === 1 ? 'member' : 'members'}
                </span>
              </div>

              {count === 0 ? (
                <p className="text-xs text-neutral-500 italic py-4 text-center">
                  No members allocated for this date.
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {deptAssignments.map((asgn) => (
                    <div
                      key={asgn.id}
                      className="flex items-center justify-between p-2 rounded-xl bg-neutral-900/60 border border-neutral-800 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-6 h-6 rounded bg-neutral-800 text-white border border-neutral-700 flex items-center justify-center font-bold text-[10px]">
                          {asgn.user?.full_name?.charAt(0) || 'U'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-neutral-200 truncate">
                            {asgn.user?.full_name || 'Team Member'}
                          </p>
                          <p className="text-[10px] text-neutral-500 truncate">
                            {asgn.user?.email}
                          </p>
                        </div>
                      </div>

                      {canManage && onRemoveAssignment && (
                        <button
                          type="button"
                          onClick={() => onRemoveAssignment(asgn.id)}
                          className="p-1 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded transition"
                          title="Remove assignment"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DepartmentAllocation;
