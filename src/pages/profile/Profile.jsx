import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  Camera,
  Mail,
  Shield,
  Calendar,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Award,
  Building2
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { departmentsApi } from '../../api/departmentsApi';
import { format, parseISO } from 'date-fns';

export const Profile = () => {
  const { user, profile, role, updateCurrentUserProfile, uploadUserAvatar } = useAuth();

  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [selectedFile, setSelectedFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(profile?.avatar_url || null);
  const [userDepartments, setUserDepartments] = useState([]);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef(null);

  useEffect(() => {
    const userId = profile?.id || user?.id;
    if (userId) {
      departmentsApi.getUserDepartments(userId)
        .then(depts => setUserDepartments(depts || []))
        .catch(() => setUserDepartments([]));
    }
  }, [profile?.id, user?.id]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select a valid image file (PNG, JPG, WebP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('Image size must be less than 5MB.');
      return;
    }

    setSelectedFile(file);
    setErrorMsg('');
    setSuccessMsg('');

    const reader = new FileReader();
    reader.onload = () => {
      setAvatarPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setErrorMsg('Full name cannot be empty.');
      return;
    }

    try {
      setSaving(true);
      setErrorMsg('');
      setSuccessMsg('');

      let uploadedUrl = avatarUrl;
      if (selectedFile) {
        uploadedUrl = await uploadUserAvatar(selectedFile);
        setAvatarUrl(uploadedUrl);
      }

      await updateCurrentUserProfile({
        full_name: fullName.trim(),
        avatar_url: uploadedUrl
      });

      setSelectedFile(null);
      setSuccessMsg('Profile updated successfully!');
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err) {
      console.error('Failed to update profile:', err);
      setErrorMsg(err.message || 'Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const getRoleBadge = () => {
    if (role === 'FOUNDER') {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-black bg-white text-black border border-neutral-200 flex items-center gap-1.5 shadow-sm">
          <Shield className="w-3.5 h-3.5" />
          FOUNDER
        </span>
      );
    }
    if (role === 'FOUNDING_ADVISOR') {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-950/80 text-purple-200 border border-purple-800 flex items-center gap-1.5 shadow-sm">
          <Award className="w-3.5 h-3.5 text-purple-400" />
          FOUNDING ADVISOR
        </span>
      );
    }
    if (role === 'ADMIN') {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-950/80 text-indigo-300 border border-indigo-800 flex items-center gap-1.5 shadow-sm">
          <Shield className="w-3.5 h-3.5 text-indigo-400" />
          ADMIN
        </span>
      );
    }
    return (
      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-neutral-900 text-neutral-300 border border-neutral-700 flex items-center gap-1.5">
        <User className="w-3.5 h-3.5 text-neutral-400" />
        TEAM MEMBER
      </span>
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn pb-10">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2.5">
            <User className="w-7 h-7 text-white" />
            My Profile
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Manage your personal information, profile photo, and account details.
          </p>
        </div>
      </div>

      {/* Main Profile Card */}
      <div className="p-6 sm:p-8 rounded-3xl bg-neutral-950 border border-neutral-800 shadow-2xl space-y-8 relative overflow-hidden">
        {/* Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-indigo-500 to-purple-500" />

        {/* Notifications */}
        {successMsg && (
          <div className="p-3.5 rounded-2xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs font-semibold flex items-center gap-2.5 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-red-950/60 border border-red-800/80 text-red-300 text-xs font-semibold flex items-center gap-2.5 animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Avatar Section */}
        <div className="flex flex-col sm:flex-row items-center gap-6 pb-6 border-b border-neutral-850">
          <div className="relative group shrink-0">
            {/* Avatar Image or Initial */}
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl overflow-hidden bg-neutral-900 border-2 border-neutral-700 flex items-center justify-center text-3xl font-black text-white shadow-xl relative">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt={fullName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{fullName?.charAt(0) || 'U'}</span>
              )}
            </div>

            {/* Change Photo Overlay Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-2 -right-2 p-2.5 rounded-2xl bg-white text-black hover:bg-neutral-200 border-2 border-black shadow-lg transition-all duration-150 active:scale-90 cursor-pointer"
              title="Change profile photo"
            >
              <Camera className="w-4 h-4" />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          <div className="text-center sm:text-left space-y-1.5 min-w-0">
            <div className="flex items-center justify-center sm:justify-start gap-2.5 flex-wrap">
              <h2 className="text-xl font-extrabold text-white truncate">
                {fullName || 'Team Member'}
              </h2>
              {getRoleBadge()}
            </div>
            <p className="text-xs text-neutral-400 flex items-center justify-center sm:justify-start gap-1.5">
              <Mail className="w-3.5 h-3.5 text-neutral-500" />
              <span>{profile?.email || user?.email}</span>
            </p>
            <p className="text-[11px] text-neutral-500">
              Click the camera icon to upload a custom profile picture (PNG, JPG up to 5MB).
            </p>
          </div>
        </div>

        {/* Profile Edit Form */}
        <form onSubmit={handleSave} className="space-y-5">
          {/* Full Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-neutral-300 block">
              Full Name
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                className="w-full pl-10 pr-4 py-2.5 bg-neutral-900 border border-neutral-800 rounded-2xl text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-white transition"
              />
            </div>
          </div>

          {/* Email Address (Read-Only) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-neutral-400 block">
              Email Address <span className="text-[10px] text-neutral-500 font-normal">(Primary Google Workspace ID)</span>
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-neutral-600 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={profile?.email || user?.email || ''}
                disabled
                className="w-full pl-10 pr-4 py-2.5 bg-neutral-900/40 border border-neutral-850 rounded-2xl text-sm text-neutral-400 cursor-not-allowed"
              />
            </div>
          </div>

          {/* Role & Access (Read-Only) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-neutral-400 block">
              Assigned Role
            </label>
            <div className="relative">
              <Shield className="w-4 h-4 text-neutral-600 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={role || 'MEMBER'}
                disabled
                className="w-full pl-10 pr-4 py-2.5 bg-neutral-900/40 border border-neutral-850 rounded-2xl text-sm text-neutral-400 cursor-not-allowed font-mono"
              />
            </div>
          </div>

          {/* Responsible Departments */}
          <div className="space-y-2 pt-1">
            <label className="text-xs font-bold text-neutral-300 block flex items-center justify-between">
              <span>My Responsible Departments</span>
              <span className="text-[10px] text-neutral-500 font-mono">
                {userDepartments.length} assigned
              </span>
            </label>
            {userDepartments.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {userDepartments.map(dept => (
                  <div
                    key={dept.id}
                    className="p-3 rounded-xl bg-neutral-900/80 border border-neutral-800 flex items-start gap-2.5"
                  >
                    <div className="p-1.5 rounded-lg bg-purple-950/60 border border-purple-800 text-purple-400 shrink-0 mt-0.5">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-white">{dept.name}</h5>
                      <p className="text-[11px] text-neutral-400 line-clamp-2 mt-0.5">
                        {dept.description || 'Core department assignment.'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-neutral-900/40 border border-neutral-850 text-xs text-neutral-400 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-neutral-500 shrink-0" />
                <span>No departments assigned yet. Contact your Founder or Admin.</span>
              </div>
            )}
          </div>

          {/* Account Created Date */}
          {profile?.created_at && (
            <div className="pt-2 flex items-center gap-2 text-xs text-neutral-500">
              <Calendar className="w-3.5 h-3.5" />
              <span>Member since {format(parseISO(profile.created_at), 'MMMM d, yyyy')}</span>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 bg-white text-black hover:bg-neutral-200 disabled:opacity-50 rounded-2xl text-xs font-extrabold transition-all duration-150 active:scale-95 flex items-center gap-2 shadow-lg cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving Profile...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Profile;
