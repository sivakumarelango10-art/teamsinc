import React, { useState, useEffect } from 'react';
import { departmentsApi } from '../../api/departmentsApi';
import { planningApi } from '../../api/planningApi';
import { Building2, Plus, Edit2, Trash2, Calendar, X, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import ConfirmModal from '../../components/common/ConfirmModal';
import LoadingSpinner from '../../components/common/LoadingSpinner';

export const Departments = () => {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [allocations, setAllocations] = useState([]);

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [deleteConfirmDept, setDeleteConfirmDept] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [deptList, planData] = await Promise.all([
        departmentsApi.getDepartments(),
        planningApi.getDailyAllocations(selectedDate)
      ]);
      setDepartments(deptList);
      setAllocations(planData.assignments || []);
    } catch (err) {
      console.error('Failed to load departments data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  const handleOpenCreate = () => {
    setEditingDept(null);
    setFormData({ name: '', description: '' });
    setError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (dept) => {
    setEditingDept(dept);
    setFormData({ name: dept.name, description: dept.description || '' });
    setError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Department name is required');
      return;
    }

    try {
      setSaving(true);
      setError('');
      if (editingDept) {
        await departmentsApi.updateDepartment(editingDept.id, formData);
      } else {
        await departmentsApi.createDepartment(formData);
      }
      setIsModalOpen(false);
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to save department');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmDept) return;
    try {
      setSaving(true);
      await departmentsApi.deleteDepartment(deleteConfirmDept.id);
      setDeleteConfirmDept(null);
      await loadData();
    } catch (err) {
      alert(err.message || 'Failed to delete department');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Building2 className="w-7 h-7 text-white" />
            Department Management
          </h1>
          <p className="text-xs md:text-sm text-neutral-400 mt-1">
            Organize functional operational departments and inspect active workforce assignments.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Date Picker Filter */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs text-neutral-300">
            <Calendar className="w-4 h-4 text-neutral-400" />
            <span>Date:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent border-0 text-white font-medium focus:outline-none cursor-pointer"
            />
          </div>

          <button
            onClick={handleOpenCreate}
            className="px-4 py-2.5 text-xs font-bold text-black bg-white hover:bg-neutral-200 rounded-xl transition shadow-md flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-black" />
            <span>Add Department</span>
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner text="Loading departments..." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {departments.map((dept) => {
            const assignedMembers = allocations.filter(a => a.department_id === dept.id);

            return (
              <div
                key={dept.id}
                className="bg-neutral-950 rounded-2xl p-5 border border-neutral-800 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="p-2.5 rounded-xl bg-neutral-900 text-white border border-neutral-800">
                      <Building2 className="w-5 h-5" />
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(dept)}
                        className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-900 rounded-lg transition"
                        title="Edit Department"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmDept(dept)}
                        className="p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900 rounded-lg transition"
                        title="Delete Department"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-white mb-1">{dept.name}</h3>
                  <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed mb-4">
                    {dept.description || 'No description provided.'}
                  </p>
                </div>

                <div className="pt-3 border-t border-neutral-850">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-neutral-400 font-medium">
                      Assigned on {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}:
                    </span>
                    <span className="font-bold text-white">
                      {assignedMembers.length} {assignedMembers.length === 1 ? 'member' : 'members'}
                    </span>
                  </div>

                  {assignedMembers.length > 0 ? (
                    <div className="flex -space-x-2 overflow-hidden py-1">
                      {assignedMembers.map((asgn) => (
                        <div
                          key={asgn.id}
                          title={asgn.user?.full_name}
                          className="w-7 h-7 rounded bg-neutral-900 text-white border border-neutral-800 flex items-center justify-center text-[10px] font-bold"
                        >
                          {asgn.user?.full_name?.charAt(0) || 'U'}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-neutral-500 italic py-1">
                      No members assigned on this date.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl p-6 relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-5 right-5 text-neutral-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-white mb-4">
              {editingDept ? 'Edit Department' : 'Create Department'}
            </h3>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-neutral-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
                  Department Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Designing"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-black border border-neutral-800 rounded-xl text-white placeholder-neutral-600 focus:outline-none focus:border-white text-sm transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
                  Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Describe the department responsibilities..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-black border border-neutral-800 rounded-xl text-white placeholder-neutral-600 focus:outline-none focus:border-white text-sm transition"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-neutral-850">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-sm font-bold text-black bg-white hover:bg-neutral-200 rounded-xl transition shadow-md"
                >
                  {saving ? 'Saving...' : editingDept ? 'Save Changes' : 'Create Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={Boolean(deleteConfirmDept)}
        title="Delete Department"
        message={`Are you sure you want to delete "${deleteConfirmDept?.name}"? Tasks and assignments linked to this department will be unassigned.`}
        confirmText="Delete Department"
        loading={saving}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirmDept(null)}
      />
    </div>
  );
};

export default Departments;
