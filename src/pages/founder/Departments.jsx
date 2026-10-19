import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { departmentsApi } from '../../api/departmentsApi';
import { useRealtime, broadcastRealtimeEvent } from '../../hooks/useRealtime';
import { Building2, Plus, Edit2, Trash2, X, AlertCircle, UserPlus, Users, UserMinus, Bot } from 'lucide-react';
import ConfirmModal from '../../components/common/ConfirmModal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import AIDepartmentModal from '../../components/departments/AIDepartmentModal';
import DepartmentMembersModal from '../../components/departments/DepartmentMembersModal';

export const Departments = () => {
  const [departments, setDepartments] = useState([]);
  const [memberships, setMemberships] = useState({});
  const [loading, setLoading] = useState(true);

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [managingDeptMembers, setManagingDeptMembers] = useState(null);
  const [editingDept, setEditingDept] = useState(null);
  const [deleteConfirmDept, setDeleteConfirmDept] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const [deptList, memberMap] = await Promise.all([
        departmentsApi.getDepartments(),
        departmentsApi.getAllDepartmentMemberships()
      ]);
      setDepartments(deptList || []);
      setMemberships(memberMap || {});
    } catch (err) {
      console.error('Failed to load departments data:', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // Real-time synchronization for departments and memberships
  useRealtime(
    ['departments', 'department_members'],
    () => loadData(true),
    { channelPrefix: 'departments_page', broadcastChannel: 'teamsync_bc_departments' }
  );

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
      broadcastRealtimeEvent('teamsync_bc_departments');
      await loadData(true);
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
      broadcastRealtimeEvent('teamsync_bc_departments');
      await loadData(true);
    } catch (err) {
      alert(err.message || 'Failed to delete department');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickRemoveMember = async (deptId, userId) => {
    try {
      await departmentsApi.removeMemberFromDepartment(deptId, userId);
      broadcastRealtimeEvent('teamsync_bc_departments');
      await loadData(true);
    } catch (err) {
      console.error('Failed to remove member:', err);
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
            Create departments and assign team members. Members can belong to multiple departments simultaneously without restrictions.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setIsAiModalOpen(true)}
            className="px-3.5 py-2.5 text-xs font-bold text-purple-300 bg-purple-950/60 hover:bg-purple-900/80 border border-purple-800/80 rounded-xl transition shadow-md flex items-center gap-2 cursor-pointer"
            title="Use AI to architect and generate department structures"
          >
            <Bot className="w-4 h-4 text-purple-400" />
            <span>AI Architect</span>
          </button>

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
      ) : departments.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-neutral-800 rounded-3xl bg-neutral-950 flex flex-col items-center justify-center">
          <Building2 className="w-12 h-12 text-neutral-600 mb-3" />
          <h3 className="text-base font-bold text-white mb-1">No Departments Found</h3>
          <p className="text-xs text-neutral-400 mb-4 max-w-sm">
            Create your company departments manually or use the AI Architect to generate department structures instantly.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsAiModalOpen(true)}
              className="px-4 py-2 text-xs font-bold text-purple-300 bg-purple-950 border border-purple-800 rounded-xl hover:bg-purple-900 transition flex items-center gap-2"
            >
              <Bot className="w-4 h-4 text-purple-400" />
              <span>Use AI Architect</span>
            </button>
            <button
              onClick={handleOpenCreate}
              className="px-4 py-2 text-xs font-bold text-black bg-white rounded-xl hover:bg-neutral-200 transition flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add Department</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {departments.map((dept) => {
            const deptMembers = memberships[dept.id] || [];

            return (
              <div
                key={dept.id}
                className="bg-neutral-950 rounded-2xl p-5 border border-neutral-800 flex flex-col justify-between hover:border-neutral-750 transition duration-200 group/card shadow-lg"
              >
                <div>
                  {/* Card Top Row */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-neutral-900 text-white border border-neutral-800 flex items-center justify-center shadow-xs">
                      <Building2 className="w-5 h-5 text-neutral-200" />
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(dept)}
                        className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-900 rounded-lg transition cursor-pointer"
                        title="Edit Department"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmDept(dept)}
                        className="p-1.5 text-neutral-400 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition cursor-pointer"
                        title="Delete Department"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <h3 className="text-base font-bold text-white mb-1.5 tracking-tight">{dept.name}</h3>
                  <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed mb-4 min-h-[32px]">
                    {dept.description || 'No description provided.'}
                  </p>
                </div>

                {/* Assigned Members Section */}
                <div className="pt-4 border-t border-neutral-850 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-medium">
                      <Users className="w-3.5 h-3.5 text-neutral-500" />
                      <span>Assigned Members</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-900 text-neutral-300 font-bold border border-neutral-800">
                        {deptMembers.length}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setManagingDeptMembers(dept)}
                      className="px-2.5 py-1 text-[11px] font-bold text-neutral-200 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                      title="Manage department members"
                    >
                      <UserPlus className="w-3.5 h-3.5 text-purple-400" />
                      <span>Assign</span>
                    </button>
                  </div>

                  {/* Members Pill List */}
                  {deptMembers.length > 0 ? (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 no-scrollbar">
                      {deptMembers.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between p-1.5 rounded-xl bg-neutral-900/60 border border-neutral-850 hover:border-neutral-750 transition text-xs group"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-6 h-6 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-center text-[10px] font-bold text-white shrink-0 overflow-hidden">
                              {m.avatar_url ? (
                                <img
                                  src={m.avatar_url}
                                  alt={m.full_name}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                              ) : (
                                m.full_name?.charAt(0)?.toUpperCase() || 'U'
                              )}
                            </div>
                            <div className="min-w-0">
                              <span className="text-white font-medium text-xs truncate block">
                                {m.full_name || 'Team Member'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-400 font-semibold uppercase">
                              {m.role}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleQuickRemoveMember(dept.id, m.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-neutral-500 hover:text-red-400 rounded-md transition cursor-pointer"
                              title="Remove from department"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      onClick={() => setManagingDeptMembers(dept)}
                      className="p-3 rounded-xl border border-dashed border-neutral-850 hover:border-neutral-750 bg-neutral-900/30 text-center cursor-pointer transition"
                    >
                      <p className="text-[11px] text-neutral-500 hover:text-neutral-300 flex items-center justify-center gap-1.5 font-medium">
                        <Plus className="w-3.5 h-3.5 text-neutral-400" />
                        <span>Assign team members</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
        >
          <div className="w-full max-w-md bg-neutral-950 border border-neutral-800 rounded-3xl shadow-2xl p-6 relative modal-enter">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-5 right-5 text-neutral-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white mb-4">
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
                  className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-xs font-bold text-black bg-white hover:bg-neutral-200 rounded-xl transition shadow-md cursor-pointer"
                >
                  {saving ? 'Saving...' : editingDept ? 'Save Changes' : 'Create Department'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Department Members Management Modal */}
      {managingDeptMembers && (
        <DepartmentMembersModal
          department={managingDeptMembers}
          onClose={() => setManagingDeptMembers(null)}
          onUpdated={loadData}
        />
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

      {/* AI Department Architect Modal */}
      <AIDepartmentModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        currentDepartments={departments}
        onCreated={loadData}
      />
    </div>
  );
};

export default Departments;
