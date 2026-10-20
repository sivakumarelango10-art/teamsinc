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
  Building2,
  Edit2
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { departmentsApi } from '../../api/departmentsApi';
import { format, parseISO } from 'date-fns';
import ImageCropperModal from '../../components/profile/ImageCropperModal';

export const Profile = () => {
  const { user, profile, role, updateCurrentUserProfile, uploadUserAvatar } = useAuth();

  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [avatarPreview, setAvatarPreview] = useState(profile?.avatar_url || null);
  const [userDepartments, setUserDepartments] = useState([]);
  const [saving, setSaving] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [nameError, setNameError] = useState('');

  // Cropper Modal State
  const [cropImageSrc, setCropImageSrc] = useState(null);
  const [isCropperOpen, setIsCropperOpen] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setAvatarUrl(profile.avatar_url || '');
      setAvatarPreview(profile.avatar_url || null);
    }
  }, [profile]);

  useEffect(() => {
    const userId = profile?.id || user?.id;
    if (userId) {
      departmentsApi.getUserDepartments(userId)
        .then(depts => setUserDepartments(depts || []))
        .catch(() => setUserDepartments([]));
    }
  }, [profile?.id, user?.id]);

  // File Selection & Validation
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    // Reset input so user can pick the same file again if desired
    if (e.target) e.target.value = '';
    if (!file) return;

    setErrorMsg('');
    setSuccessMsg('');

    // Validate MIME type
    const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validMimes.includes(file.type.toLowerCase())) {
      setErrorMsg('Please select a supported image file (JPEG, PNG, or WebP).');
      return;
    }

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('Image size exceeds the 5MB limit. Please choose a smaller photo.');
      return;
    }

    // Read image into Data URL for cropper preview
    const reader = new FileReader();
    reader.onload = () => {
      setCropImageSrc(reader.result);
      setIsCropperOpen(true);
    };
    reader.onerror = () => {
      setErrorMsg('Failed to read image file from device. Please try again.');
    };
    reader.readAsDataURL(file);
  };

  // Save Cropped Avatar
  const handleSaveCroppedAvatar = async (croppedFile) => {
    try {
      setAvatarSaving(true);
      setErrorMsg('');
      setSuccessMsg('');

      // 1. Upload cropped image to storage
      const uploadedUrl = await uploadUserAvatar(croppedFile);

      // 2. Persist new avatar URL to user profile
      const updated = await updateCurrentUserProfile({
        avatar_url: uploadedUrl,
        full_name: fullName.trim() || profile?.full_name
      });

      setAvatarUrl(uploadedUrl);
      setAvatarPreview(uploadedUrl);
      setIsCropperOpen(false);
      setCropImageSrc(null);
      setSuccessMsg('Profile picture updated successfully!');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Failed to save profile picture:', err);
      // Clean, actionable user error message without exposing SQL/internal details
      const msg = err.message || '';
      if (msg.includes('subquery')) {
        setErrorMsg('Database configuration error prevented update. Please try again.');
      } else {
        setErrorMsg(msg || 'Failed to update profile picture. Please try again.');
      }
    } finally {
      setAvatarSaving(false);
    }
  };

  // Full Name Input Validation
  const handleNameChange = (e) => {
    const val = e.target.value;
    setFullName(val);
    if (!val.trim()) {
      setNameError('Full name cannot be empty.');
    } else if (val.trim().length < 2) {
      setNameError('Full name must be at least 2 characters.');
    } else if (val.trim().length > 60) {
      setNameError('Full name cannot exceed 60 characters.');
    } else {
      setNameError('');
    }
  };

  // Save Profile Details
  const handleSave = async (e) => {
    e.preventDefault();
    const cleanName = fullName.trim();

    if (!cleanName) {
      setNameError('Full name is required.');
      setErrorMsg('Please enter a valid display name.');
      return;
    }

    if (cleanName.length < 2 || cleanName.length > 60) {
      setErrorMsg('Full name must be between 2 and 60 characters.');
      return;
    }

    try {
      setSaving(true);
      setErrorMsg('');
      setSuccessMsg('');

      await updateCurrentUserProfile({
        full_name: cleanName,
        avatar_url: avatarUrl
      });

      setSuccessMsg('Profile updated successfully!');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Failed to update profile:', err);
      const msg = err.message || '';
      if (msg.includes('subquery')) {
        setErrorMsg('Database error prevented saving. Please try again.');
      } else {
        setErrorMsg(msg || 'Failed to update profile. Please try again.');
      }
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
          <div
            role="status"
            className="p-3.5 rounded-2xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs font-semibold flex items-center gap-2.5 animate-fadeIn"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="p-3.5 rounded-2xl bg-red-950/60 border border-red-800/80 text-red-300 text-xs font-semibold flex items-center gap-2.5 animate-fadeIn"
          >
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
                  alt={fullName || 'Profile Avatar'}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  onError={() => setAvatarPreview(null)}
                />
              ) : (
                <span>{(fullName?.trim().charAt(0) || 'U').toUpperCase()}</span>
              )}
            </div>

            {/* Change Photo Overlay Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-2 -right-2 p-2.5 rounded-2xl bg-white text-black hover:bg-neutral-200 border-2 border-black shadow-lg transition-all duration-150 active:scale-90 cursor-pointer"
              title="Upload and crop photo"
              aria-label="Upload and crop photo"
            >
              <Camera className="w-4 h-4" />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileChange}
              className="hidden"
              aria-label="Upload profile photo"
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
              Click the camera icon to upload and crop a custom photo (JPEG, PNG, WebP up to 5MB).
            </p>
          </div>
        </div>

        {/* Profile Edit Form */}
        <form onSubmit={handleSave} className="space-y-5">
          {/* Full Name */}
          <div className="space-y-1.5">
            <label htmlFor="profile-full-name" className="text-xs font-bold text-neutral-300 block flex items-center justify-between">
              <span>Full Name</span>
              <span className="text-[11px] text-neutral-500 font-normal">Editable</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="profile-full-name"
                type="text"
                value={fullName}
                onChange={handleNameChange}
                placeholder="Your display name"
                maxLength={60}
                className={`w-full pl-10 pr-4 py-2.5 bg-neutral-900 border rounded-2xl text-sm text-white placeholder-neutral-500 focus:outline-none transition ${
                  nameError ? 'border-red-600 focus:border-red-500' : 'border-neutral-800 focus:border-white'
                }`}
                aria-invalid={Boolean(nameError)}
                aria-describedby={nameError ? 'name-error-msg' : undefined}
              />
            </div>
            {nameError && (
              <p id="name-error-msg" className="text-[11px] text-red-400 font-medium">
                {nameError}
              </p>
            )}
          </div>

          {/* Email Address (Read-Only) */}
          <div className="space-y-1.5">
            <label htmlFor="profile-email" className="text-xs font-bold text-neutral-400 block">
              Email Address <span className="text-[10px] text-neutral-500 font-normal">(Primary Google Workspace ID)</span>
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-neutral-600 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="profile-email"
                type="email"
                value={profile?.email || user?.email || ''}
                disabled
                className="w-full pl-10 pr-4 py-2.5 bg-neutral-900/40 border border-neutral-850 rounded-2xl text-sm text-neutral-400 cursor-not-allowed"
              />
            </div>
          </div>

          {/* Role & Access (Read-Only) */}
          <div className="space-y-1.5">
            <label htmlFor="profile-role" className="text-xs font-bold text-neutral-400 block">
              Assigned Role
            </label>
            <div className="relative">
              <Shield className="w-4 h-4 text-neutral-600 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="profile-role"
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
              disabled={saving || Boolean(nameError)}
              className="px-6 py-3 bg-white text-black hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl text-xs font-extrabold transition-all duration-150 active:scale-95 flex items-center gap-2 shadow-lg cursor-pointer"
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

      {/* Image Cropper Modal */}
      <ImageCropperModal
        isOpen={isCropperOpen}
        imageSrc={cropImageSrc}
        saving={avatarSaving}
        onCancel={() => {
          setIsCropperOpen(false);
          setCropImageSrc(null);
        }}
        onSave={handleSaveCroppedAvatar}
      />
    </div>
  );
};

export default Profile;
