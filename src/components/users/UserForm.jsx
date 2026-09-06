import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertCircle } from 'lucide-react';

export const UserForm = ({
  isOpen,
  onClose,
  onSubmit,
  initialData = null
}) => {
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    role: 'MEMBER',
    is_active: true
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isPrimaryFounder = initialData?.email?.toLowerCase() === 'sivakumarelango10@gmail.com';

  useEffect(() => {
    if (initialData) {
      setFormData({
        full_name: initialData.full_name || '',
        email: initialData.email || '',
        role: initialData.role || 'MEMBER',
        is_active: initialData.is_active !== undefined ? initialData.is_active : true
      });
    } else {
      setFormData({
        full_name: '',
        email: '',
        role: 'MEMBER',
        is_active: true
      });
    }
    setError('');
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.full_name.trim()) {
      setError('Full name is required');
      return;
    }
    if (!formData.email.trim()) {
      setError('Email is required');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await onSubmit(formData);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save user');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl p-6 relative modal-enter">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-xl font-bold text-white mb-4">
          {initialData ? 'Edit User' : 'Add New User'}
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
              Full Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. John Doe"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-black border border-neutral-800 rounded-xl text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-white text-sm transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
              Email Address *
            </label>
            <input
              type="email"
              required
              disabled={Boolean(initialData)}
              placeholder="e.g. john@company.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-black border border-neutral-800 rounded-xl text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-white text-sm transition disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
              Role *
            </label>
            <select
              disabled={isPrimaryFounder}
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-black border border-neutral-800 rounded-xl text-neutral-100 focus:outline-none focus:border-white text-sm transition disabled:opacity-50"
            >
              <option value="MEMBER">Member (Standard Teammate)</option>
              <option value="ADMIN">Admin / Task Manager</option>
              <option value="FOUNDING_ADVISOR">Founding Advisor (High-Level Oversight)</option>
              <option value="FOUNDER">Founder (Full Administrative Access)</option>
            </select>
            {isPrimaryFounder && (
              <p className="mt-1 text-[11px] text-neutral-400">
                The primary Founder role cannot be altered.
              </p>
            )}
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                disabled={isPrimaryFounder}
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4 rounded text-black bg-black border-neutral-800 focus:ring-white"
              />
              <span className="text-sm font-medium text-neutral-300">
                Active Account
              </span>
            </label>
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-neutral-850">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-sm font-bold text-black bg-white hover:bg-neutral-200 rounded-xl transition shadow-md"
            >
              {loading ? 'Saving...' : initialData ? 'Save Changes' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default UserForm;
