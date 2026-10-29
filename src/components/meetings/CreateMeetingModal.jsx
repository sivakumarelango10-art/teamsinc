import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Calendar,
  Clock,
  Video,
  Users,
  Building2,
  AlertTriangle,
  Plus,
  Trash2,
  Check,
  RefreshCw,
  Globe,
  FileText,
  MapPin,
  Sparkles
} from 'lucide-react';
import { meetingsApi } from '../../api/meetingsApi';
import { usersApi } from '../../api/usersApi';
import { departmentsApi } from '../../api/departmentsApi';

const COMMON_TIMEZONES = [
  'Asia/Kolkata',
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Singapore',
  'Australia/Sydney'
];

const MEETING_TYPES = [
  { value: 'GENERAL', label: 'General Meeting' },
  { value: 'FOUNDER_ALL_HANDS', label: 'Founder All-Hands' },
  { value: 'SPRINT_PLANNING', label: 'Sprint Planning' },
  { value: 'CODE_REVIEW', label: 'Technical / Code Review' },
  { value: 'ONE_ON_ONE', label: '1-on-1 Mentorship' },
  { value: 'LEADERSHIP_ALIGNMENT', label: 'Leadership Alignment' },
  { value: 'DEPARTMENT_SYNC', label: 'Department Sync' }
];

const VISIBILITY_OPTIONS = [
  { value: 'ALL', label: 'Entire Team (All Members)' },
  { value: 'LEADERSHIP_ONLY', label: 'Leadership & Founders Only' },
  { value: 'DEPARTMENT_ONLY', label: 'Specific Department Only' },
  { value: 'INVITED_ONLY', label: 'Invited Participants Only' }
];

export const CreateMeetingModal = ({ isOpen, onClose, onSuccess }) => {
  const [mode, setMode] = useState('single'); // 'single' | 'multiple' | 'recurring'
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Available users and departments for selectors
  const [usersList, setUsersList] = useState([]);
  const [departmentsList, setDepartmentsList] = useState([]);

  // Default timezone
  const defaultTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
    } catch {
      return 'Asia/Kolkata';
    }
  }, []);

  // Today's date YYYY-MM-DD
  const todayStr = useMemo(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  }, []);

  // --- Single Meeting State ---
  const [singleForm, setSingleForm] = useState({
    title: '',
    date: todayStr,
    startTime: '10:00',
    endTime: '11:00',
    timezone: defaultTz,
    meetingLink: '',
    meetingType: 'GENERAL',
    location: '',
    description: '',
    agenda: '',
    additionalNotes: '',
    visibility: 'ALL',
    departmentId: '',
    reminderMinutes: 15,
    participantIds: []
  });

  // --- Multiple Sessions State ---
  const [multiCommon, setMultiCommon] = useState({
    seriesTitle: '',
    description: '',
    agenda: '',
    meetingType: 'GENERAL',
    visibility: 'ALL',
    departmentId: '',
    timezone: defaultTz,
    defaultLink: '',
    participantIds: []
  });

  const [multiSessions, setMultiSessions] = useState([
    { id: 1, title: '', date: todayStr, startTime: '10:00', endTime: '11:00', meetingLink: '' },
    { id: 2, title: '', date: todayStr, startTime: '14:00', endTime: '15:00', meetingLink: '' }
  ]);

  // --- Recurring Series State ---
  const [recurringForm, setRecurringForm] = useState({
    title: '',
    date: todayStr,
    startTime: '10:00',
    endTime: '11:00',
    timezone: defaultTz,
    meetingLink: '',
    meetingType: 'GENERAL',
    description: '',
    agenda: '',
    visibility: 'ALL',
    departmentId: '',
    pattern: 'WEEKLY', // 'DAILY', 'WEEKDAYS', 'WEEKLY', 'MONTHLY'
    selectedDays: [1, 3, 5], // Monday (1), Wednesday (3), Friday (5)
    occurrences: 6,
    participantIds: []
  });

  // Overlap warnings
  const [overlapWarning, setOverlapWarning] = useState(null);

  // Fetch users and departments
  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    Promise.all([
      usersApi.getUsers().catch(() => []),
      departmentsApi.getDepartments().catch(() => [])
    ]).then(([users, depts]) => {
      if (mounted) {
        setUsersList(users || []);
        setDepartmentsList(depts || []);
      }
    });

    return () => {
      mounted = false;
    };
  }, [isOpen]);

  // Compute duration in minutes
  const singleDuration = useMemo(() => {
    try {
      const [sh, sm] = singleForm.startTime.split(':').map(Number);
      const [eh, em] = singleForm.endTime.split(':').map(Number);
      const diff = (eh * 60 + em) - (sh * 60 + sm);
      if (diff <= 0) return 'Invalid time range';
      const hours = Math.floor(diff / 60);
      const mins = diff % 60;
      if (hours > 0 && mins > 0) return `${hours} hr ${mins} min`;
      if (hours > 0) return `${hours} hr${hours > 1 ? 's' : ''}`;
      return `${mins} min`;
    } catch {
      return '';
    }
  }, [singleForm.startTime, singleForm.endTime]);

  // Check overlap for single meeting
  useEffect(() => {
    if (mode !== 'single' || !singleForm.date || !singleForm.startTime || !singleForm.endTime) {
      setOverlapWarning(null);
      return;
    }

    const startIso = new Date(`${singleForm.date}T${singleForm.startTime}:00`).toISOString();
    const endIso = new Date(`${singleForm.date}T${singleForm.endTime}:00`).toISOString();

    if (new Date(endIso) <= new Date(startIso)) {
      setOverlapWarning(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await meetingsApi.checkOverlap(startIso, endIso);
        if (res.hasOverlap && res.conflicts?.length > 0) {
          setOverlapWarning(`Warning: This time slot overlaps with "${res.conflicts[0].title}".`);
        } else {
          setOverlapWarning(null);
        }
      } catch {
        setOverlapWarning(null);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [mode, singleForm.date, singleForm.startTime, singleForm.endTime]);

  if (!isOpen) return null;

  // Add another session in multi-mode
  const handleAddSession = () => {
    const nextId = (multiSessions[multiSessions.length - 1]?.id || 0) + 1;
    setMultiSessions([
      ...multiSessions,
      {
        id: nextId,
        title: '',
        date: todayStr,
        startTime: '11:00',
        endTime: '12:00',
        meetingLink: multiCommon.defaultLink || ''
      }
    ]);
  };

  const handleRemoveSession = (id) => {
    if (multiSessions.length <= 1) return;
    setMultiSessions(multiSessions.filter(s => s.id !== id));
  };

  const handleUpdateSession = (id, field, value) => {
    setMultiSessions(multiSessions.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  // Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (mode === 'single') {
        const startIso = new Date(`${singleForm.date}T${singleForm.startTime}:00`).toISOString();
        const endIso = new Date(`${singleForm.date}T${singleForm.endTime}:00`).toISOString();

        if (new Date(endIso) <= new Date(startIso)) {
          throw new Error('Meeting end time must be after start time.');
        }

        const payload = {
          title: singleForm.title.trim(),
          description: singleForm.description.trim(),
          agenda: singleForm.agenda.trim(),
          additionalNotes: singleForm.additionalNotes.trim(),
          startTime: startIso,
          endTime: endIso,
          timezone: singleForm.timezone,
          meetingLink: singleForm.meetingLink.trim(),
          meetingType: singleForm.meetingType,
          location: singleForm.location.trim() || null,
          visibility: singleForm.visibility,
          departmentId: singleForm.visibility === 'DEPARTMENT_ONLY' && singleForm.departmentId ? singleForm.departmentId : null,
          reminderMinutes: Number(singleForm.reminderMinutes) || 15,
          participantIds: singleForm.participantIds
        };

        const result = await meetingsApi.createMeeting(payload);
        if (onSuccess) onSuccess(result.meeting);
        onClose();

      } else if (mode === 'multiple') {
        if (!multiCommon.seriesTitle.trim()) {
          throw new Error('Series title is required for multiple sessions.');
        }
        if (multiSessions.length === 0) {
          throw new Error('Please add at least one session.');
        }

        const formattedSessions = multiSessions.map((s, idx) => {
          const sessionTitle = s.title.trim() || `${multiCommon.seriesTitle} - Session ${idx + 1}`;
          const link = s.meetingLink.trim() || multiCommon.defaultLink.trim();
          const startIso = new Date(`${s.date}T${s.startTime}:00`).toISOString();
          const endIso = new Date(`${s.date}T${s.endTime}:00`).toISOString();

          if (new Date(endIso) <= new Date(startIso)) {
            throw new Error(`Session ${idx + 1} (${sessionTitle}): End time must be after start time.`);
          }
          if (!link) {
            throw new Error(`Session ${idx + 1} (${sessionTitle}): Meeting link is required.`);
          }

          return {
            title: sessionTitle,
            startTime: startIso,
            endTime: endIso,
            meetingLink: link,
            meetingType: multiCommon.meetingType,
            description: multiCommon.description.trim(),
            agenda: multiCommon.agenda.trim()
          };
        });

        const payload = {
          seriesTitle: multiCommon.seriesTitle.trim(),
          description: multiCommon.description.trim(),
          meetingType: multiCommon.meetingType,
          timezone: multiCommon.timezone,
          visibility: multiCommon.visibility,
          departmentId: multiCommon.visibility === 'DEPARTMENT_ONLY' && multiCommon.departmentId ? multiCommon.departmentId : null,
          participantIds: multiCommon.participantIds,
          sessions: formattedSessions
        };

        const result = await meetingsApi.createMultipleSessions(payload);
        if (onSuccess) onSuccess(result.meetings);
        onClose();

      } else if (mode === 'recurring') {
        if (!recurringForm.title.trim()) {
          throw new Error('Meeting title is required.');
        }
        if (!recurringForm.meetingLink.trim()) {
          throw new Error('Meeting link is required.');
        }

        const startIso = new Date(`${recurringForm.date}T${recurringForm.startTime}:00`).toISOString();
        const endIso = new Date(`${recurringForm.date}T${recurringForm.endTime}:00`).toISOString();

        if (new Date(endIso) <= new Date(startIso)) {
          throw new Error('End time must be after start time.');
        }

        const payload = {
          seriesTitle: recurringForm.title.trim(),
          description: recurringForm.description.trim(),
          meetingType: recurringForm.meetingType,
          timezone: recurringForm.timezone,
          visibility: recurringForm.visibility,
          departmentId: recurringForm.visibility === 'DEPARTMENT_ONLY' && recurringForm.departmentId ? recurringForm.departmentId : null,
          participantIds: recurringForm.participantIds,
          isRecurring: true,
          recurrenceRule: {
            frequency: recurringForm.pattern,
            daysOfWeek: recurringForm.pattern === 'WEEKLY' ? recurringForm.selectedDays : undefined,
            count: Number(recurringForm.occurrences) || 5,
            initialStartTime: startIso,
            initialEndTime: endIso,
            meetingLink: recurringForm.meetingLink.trim(),
            title: recurringForm.title.trim()
          }
        };

        const result = await meetingsApi.createMultipleSessions(payload);
        if (onSuccess) onSuccess(result.meetings);
        onClose();
      }
    } catch (err) {
      setError(err.message || 'An error occurred while creating meetings.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-3xl bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="px-6 py-5 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Schedule Meeting</h2>
              <p className="text-xs text-neutral-400">Plan single sessions, bulk multi-date meetings, or recurring series</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Workflow Mode Tabs */}
        <div className="px-6 pt-4 border-b border-neutral-800 flex gap-2 bg-neutral-900/20">
          <button
            type="button"
            onClick={() => setMode('single')}
            className={`pb-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${
              mode === 'single'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Single Meeting
          </button>
          <button
            type="button"
            onClick={() => setMode('multiple')}
            className={`pb-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${
              mode === 'multiple'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            Multiple Sessions
          </button>
          <button
            type="button"
            onClick={() => setMode('recurring')}
            className={`pb-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${
              mode === 'recurring'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Recurring Series
          </button>
        </div>

        {/* Error / Overlap Alerts */}
        <div className="px-6 pt-4">
          {error && (
            <div className="mb-3 p-3 rounded-xl bg-red-950/60 border border-red-800/80 text-red-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {overlapWarning && (
            <div className="mb-3 p-3 rounded-xl bg-amber-950/50 border border-amber-600/50 text-amber-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{overlapWarning}</span>
            </div>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="px-6 py-4 max-h-[70vh] overflow-y-auto space-y-5">
          {/* ================= MODE A: SINGLE MEETING ================= */}
          {mode === 'single' && (
            <div className="space-y-4">
              {/* Title & Meeting Type */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-xs font-medium text-neutral-300">
                    Meeting Title <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SINC Weekly Team Sync"
                    value={singleForm.title}
                    onChange={(e) => setSingleForm({ ...singleForm, title: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-white placeholder-neutral-500 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-neutral-300">Meeting Type</label>
                  <select
                    value={singleForm.meetingType}
                    onChange={(e) => setSingleForm({ ...singleForm, meetingType: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-white text-sm focus:border-blue-500 focus:outline-none"
                  >
                    {MEETING_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Date, Start Time, End Time & Duration */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-xl bg-neutral-900/50 border border-neutral-800/80">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-neutral-300">
                    Date <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={singleForm.date}
                    onChange={(e) => setSingleForm({ ...singleForm, date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-white text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-neutral-300">
                    Start Time <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="time"
                    required
                    value={singleForm.startTime}
                    onChange={(e) => setSingleForm({ ...singleForm, startTime: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-white text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-neutral-300">
                    End Time <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="time"
                    required
                    value={singleForm.endTime}
                    onChange={(e) => setSingleForm({ ...singleForm, endTime: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-white text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5 flex flex-col justify-end">
                  <span className="text-[11px] text-neutral-400 font-medium">Computed Duration</span>
                  <div className="px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-blue-400 text-xs font-mono font-semibold flex items-center justify-between">
                    <Clock className="w-3.5 h-3.5 text-neutral-400" />
                    <span>{singleDuration}</span>
                  </div>
                </div>
              </div>

              {/* Meeting Link & Timezone */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-xs font-medium text-neutral-300 flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5 text-blue-400" />
                    Meeting Link (Google Meet, MS Teams, Zoom) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://meet.google.com/abc-defg-hij"
                    value={singleForm.meetingLink}
                    onChange={(e) => setSingleForm({ ...singleForm, meetingLink: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-white placeholder-neutral-500 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-neutral-300 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-neutral-400" />
                    Timezone
                  </label>
                  <select
                    value={singleForm.timezone}
                    onChange={(e) => setSingleForm({ ...singleForm, timezone: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-white text-sm focus:border-blue-500 focus:outline-none font-mono text-xs"
                  >
                    {COMMON_TIMEZONES.map(tz => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Visibility & Department Scope */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-neutral-300">Visibility & Access</label>
                  <select
                    value={singleForm.visibility}
                    onChange={(e) => setSingleForm({ ...singleForm, visibility: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-white text-sm focus:border-blue-500 focus:outline-none"
                  >
                    {VISIBILITY_OPTIONS.map(v => (
                      <option key={v.value} value={v.value}>{v.label}</option>
                    ))}
                  </select>
                </div>

                {singleForm.visibility === 'DEPARTMENT_ONLY' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-neutral-300">Target Department</label>
                    <select
                      value={singleForm.departmentId}
                      onChange={(e) => setSingleForm({ ...singleForm, departmentId: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-white text-sm focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">Select a department...</option>
                      {departmentsList.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Agenda & Description */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-neutral-300">Agenda & Key Discussion Points</label>
                  <textarea
                    rows={2}
                    placeholder="1. Review sprint deliverables&#10;2. Product roadmap update&#10;3. Q&A"
                    value={singleForm.agenda}
                    onChange={(e) => setSingleForm({ ...singleForm, agenda: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-white placeholder-neutral-500 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-neutral-300">Description & Additional Notes (Optional)</label>
                  <textarea
                    rows={2}
                    placeholder="Any prerequisites or preparation needed before joining..."
                    value={singleForm.description}
                    onChange={(e) => setSingleForm({ ...singleForm, description: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-white placeholder-neutral-500 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ================= MODE B: MULTIPLE SESSIONS ================= */}
          {mode === 'multiple' && (
            <div className="space-y-4">
              {/* Common Series Metadata */}
              <div className="p-4 rounded-xl bg-neutral-900/40 border border-neutral-800 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-xs font-medium text-neutral-300">
                      Series / Master Title <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. SINC Leadership Sync Series"
                      value={multiCommon.seriesTitle}
                      onChange={(e) => setMultiCommon({ ...multiCommon, seriesTitle: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-white text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-neutral-300">Default Meeting Link</label>
                    <input
                      type="url"
                      placeholder="https://meet.google.com/xyz-uvwx-rst"
                      value={multiCommon.defaultLink}
                      onChange={(e) => setMultiCommon({ ...multiCommon, defaultLink: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-white text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Sessions List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-neutral-300 tracking-wide uppercase">
                    Configured Sessions ({multiSessions.length})
                  </label>
                  <button
                    type="button"
                    onClick={handleAddSession}
                    className="px-3 py-1.5 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 text-xs font-medium flex items-center gap-1.5 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Another Session
                  </button>
                </div>

                {multiSessions.map((session, index) => (
                  <div key={session.id} className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-neutral-300 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-neutral-800 text-neutral-400 text-[10px] flex items-center justify-center font-bold">
                          {index + 1}
                        </span>
                        Session #{index + 1}
                      </span>
                      {multiSessions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSession(session.id)}
                          className="p-1 text-neutral-500 hover:text-red-400 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
                      <div>
                        <input
                          type="text"
                          placeholder={`Session ${index + 1} Title`}
                          value={session.title}
                          onChange={(e) => handleUpdateSession(session.id, 'title', e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 text-white text-xs"
                        />
                      </div>
                      <div>
                        <input
                          type="date"
                          required
                          value={session.date}
                          onChange={(e) => handleUpdateSession(session.id, 'date', e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 text-white text-xs"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <input
                          type="time"
                          required
                          value={session.startTime}
                          onChange={(e) => handleUpdateSession(session.id, 'startTime', e.target.value)}
                          className="w-1/2 px-2 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 text-white text-xs"
                        />
                        <span className="text-neutral-500 text-xs">-</span>
                        <input
                          type="time"
                          required
                          value={session.endTime}
                          onChange={(e) => handleUpdateSession(session.id, 'endTime', e.target.value)}
                          className="w-1/2 px-2 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 text-white text-xs"
                        />
                      </div>
                      <div>
                        <input
                          type="url"
                          required
                          placeholder="Session Meeting URL"
                          value={session.meetingLink}
                          onChange={(e) => handleUpdateSession(session.id, 'meetingLink', e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 text-white text-xs"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ================= MODE C: RECURRING SERIES ================= */}
          {mode === 'recurring' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-neutral-300">
                    Recurring Meeting Title <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SINC Weekly Standup"
                    value={recurringForm.title}
                    onChange={(e) => setRecurringForm({ ...recurringForm, title: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-white text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-neutral-300">
                    Meeting Link <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://meet.google.com/abc-defg-hij"
                    value={recurringForm.meetingLink}
                    onChange={(e) => setRecurringForm({ ...recurringForm, meetingLink: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-white text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 rounded-xl bg-neutral-900/40 border border-neutral-800">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-neutral-300">Start Date</label>
                  <input
                    type="date"
                    required
                    value={recurringForm.date}
                    onChange={(e) => setRecurringForm({ ...recurringForm, date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-white text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-neutral-300">Start Time</label>
                  <input
                    type="time"
                    required
                    value={recurringForm.startTime}
                    onChange={(e) => setRecurringForm({ ...recurringForm, startTime: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-white text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-neutral-300">End Time</label>
                  <input
                    type="time"
                    required
                    value={recurringForm.endTime}
                    onChange={(e) => setRecurringForm({ ...recurringForm, endTime: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-white text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-neutral-300">Cadence</label>
                  <select
                    value={recurringForm.pattern}
                    onChange={(e) => setRecurringForm({ ...recurringForm, pattern: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-white text-sm"
                  >
                    <option value="DAILY">Every Day</option>
                    <option value="WEEKDAYS">Mon - Fri (Weekdays)</option>
                    <option value="WEEKLY">Weekly (Selected Days)</option>
                    <option value="MONTHLY">Monthly</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-4 p-3 rounded-xl bg-neutral-900/30 border border-neutral-800">
                <div className="flex-1 space-y-1">
                  <span className="text-xs font-semibold text-white">Number of Occurrences</span>
                  <p className="text-[11px] text-neutral-400">Total individual meeting records to automatically generate</p>
                </div>
                <input
                  type="number"
                  min="2"
                  max="24"
                  value={recurringForm.occurrences}
                  onChange={(e) => setRecurringForm({ ...recurringForm, occurrences: e.target.value })}
                  className="w-20 px-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 text-white text-sm text-center font-mono"
                />
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-4 border-t border-neutral-800 flex items-center justify-between">
            <span className="text-xs text-neutral-400">
              {mode === 'single' && 'Saves 1 meeting to calendar'}
              {mode === 'multiple' && `Saves ${multiSessions.length} independent meeting sessions`}
              {mode === 'recurring' && `Generates ${recurringForm.occurrences} real database occurrences`}
            </span>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 text-xs font-medium transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-blue-500/20 transition"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Scheduling...
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Confirm & Schedule
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateMeetingModal;