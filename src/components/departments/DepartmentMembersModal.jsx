import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { departmentsApi } from '../../api/departmentsApi';
import { usersApi } from '../../api/usersApi';
import { X, Search, Check, Users, Shield, Building2, Loader2, Info } from 'lucide-react';

export const DepartmentMembersModal = ({ department, onClose, onUpdated }) => {
  const [allUsers, setAllUsers] = useState([]);
  const [allMemberships, setAllMemberships] = useState({});
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [users, memberships] = await Promise.all([
          usersApi.getUsers(),
          departmentsApi.getAllDepartmentMemberships()
        ]);
        setAllUsers(users || []);
        setAllMemberships(memberships || {});

        const currentMembers = memberships[department?.id] || [];
        setSelectedUserIds(currentMembers.map(u => u.id));
      } catch (err) {
        console.error('Failed to load department members:', err);
        setError('Failed to load team members');
      } finally {
        setLoading(false);
      }
    };

    if (department) {
      fetchData();
    }
  }, [department]);

  const toggleUser = (userId) => {
    setSelectedUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleSelectAll = () => {
    const activeUserIds = filteredUsers.map(u => u.id);
    setSelectedUserIds(prev => Array.from(new Set([...prev, ...activeUserIds])));
  };

  const handleClearAll = () => {
    const filteredIds = new Set(filteredUsers.map(u => u.id));
    setSelectedUserIds(prev => prev.filter(id => !filteredIds.has(id)));
  };

  const handleSave = async () => {
    if (!department) return;
    try {
      setSaving(true);
      setError('');
      await departmentsApi.setDepartmentMembers(department.id, selectedUserIds);
      if (onUpdated) onUpdated();
      onClose();
    } catch (err) {
      console.error('Failed to save members:', err);
      setError(err.message || 'Failed to save department members');
    } finally {
      setSaving(false);
    }
  };

  const filteredUsers = allUsers.filter(u => {
    const query = searchQuery.toLowerCase();
    const nameMatch = u.full_name?.toLowerCase().includes(query);
    const emailMatch = u.email?.toLowerCase().includes(query);
    const roleMatch = u.role?.toLowerCase().includes(query);
    return nameMatch || emailMatch || roleMatch;
  });

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-neutral-950 border border-neutral-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] modal-enter">
        {/* Header */}
        <div className="p-6 border-b border-neutral-850 flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-neutral-900 border border-neutral-750 flex items-center justify-center shadow-md">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  {department?.name}
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800 text-emerald-400 font-bold uppercase">
                  {selectedUserIds.length} {selectedUserIds.length === 1 ? 'Member' : 'Members'}
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5 line-clamp-1">
                {department?.description || 'Assign members to this department. Team members can belong to multiple departments.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-900 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info Notification */}
        <div className="px-6 py-2.5 bg-neutral-900/50 border-b border-neutral-850 flex items-center justify-between gap-2 text-xs text-neutral-400">
          <span className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-neutral-400" />
            <span>Members can belong to multiple departments simultaneously without restriction.</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-[11px] text-neutral-300 hover:text-white underline cursor-pointer"
            >
              Select Visible
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={handleClearAll}
              className="text-[11px] text-neutral-300 hover:text-white underline cursor-pointer"
            >
              Clear All
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="p-4 border-b border-neutral-850 bg-black/20">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search team members by name, email, or role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-neutral-900 border border-neutral-750 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white transition"
            />
          </div>
        </div>

        {/* Members List */}
        <div className="p-4 overflow-y-auto flex-1 space-y-2">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-neutral-500 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
              <span className="text-xs">Loading team directory...</span>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-12 text-center text-neutral-500 text-xs">
              No team members match your search criteria.
            </div>
          ) : (
            filteredUsers.map((user) => {
              const isSelected = selectedUserIds.includes(user.id);

              // Find other departments this user is in
              const otherDepts = Object.keys(allMemberships)
                .filter(dId => dId !== department?.id && (allMemberships[dId] || []).some(m => m.id === user.id));

              return (
                <div
                  key={user.id}
                  onClick={() => toggleUser(user.id)}
                  className={`p-3 rounded-2xl border transition-all flex items-center justify-between cursor-pointer select-none ${
                    isSelected
                      ? 'bg-neutral-900/90 border-neutral-600 shadow-sm'
                      : 'bg-neutral-950 border-neutral-850 hover:border-neutral-750 hover:bg-neutral-900/40'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Checkbox */}
                    <div
                      className={`w-5 h-5 rounded-lg flex items-center justify-center transition ${
                        isSelected
                          ? 'bg-white text-black'
                          : 'border border-neutral-700 bg-neutral-900'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>

                    {/* User Avatar */}
                    <div className="w-9 h-9 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center text-white font-bold text-xs shrink-0 overflow-hidden">
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
                      ) : (
                        user.full_name?.charAt(0)?.toUpperCase() || 'U'
                      )}
                    </div>

                    {/* User Info */}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">
                          {user.full_name || 'Team Member'}
                        </span>
                        <span className="text-[10px] px-2 py-0.2 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-300 font-semibold uppercase">
                          {user.role}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-400">{user.email}</p>
                    </div>
                  </div>

                  {/* Other Department Memberships badge */}
                  {otherDepts.length > 0 && (
                    <div className="hidden sm:flex items-center gap-1 text-[10px] text-neutral-500">
                      <span>Also in:</span>
                      <span className="text-neutral-300 font-medium">
                        {otherDepts.length} {otherDepts.length === 1 ? 'other dept' : 'other depts'}
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="px-6 py-2 bg-red-950/40 border-t border-red-800/60 text-xs text-red-300">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="p-6 border-t border-neutral-850 flex items-center justify-between bg-black/40">
          <div className="text-xs text-neutral-400">
            Selected: <span className="text-white font-bold">{selectedUserIds.length}</span> members
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-neutral-300 hover:text-white rounded-xl hover:bg-neutral-900 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2.5 text-xs font-bold text-black bg-white hover:bg-neutral-200 rounded-xl transition shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-black" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 text-black" />
                  <span>Save Members</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default DepartmentMembersModal;
