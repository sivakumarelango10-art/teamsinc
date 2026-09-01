import { supabase } from './supabase';
import { tasksApi } from './tasksApi';
import { chatApi } from './chatApi';

const STORAGE_BUGS_KEY = 'teamsync_bug_reports';

export const bugsApi = {
  async getBugs(filter = {}) {
    if (supabase) {
      try {
        let query = supabase
          .from('bug_reports')
          .select(`
            *,
            reporter:profiles!bug_reports_reported_by_fkey(id, full_name, email, role),
            assignee:profiles!bug_reports_assigned_to_fkey(id, full_name, email, role),
            converted_task:tasks(id, title, status, priority, deadline)
          `)
          .order('created_at', { ascending: false });

        if (filter.status && filter.status !== 'ALL') {
          query = query.eq('status', filter.status);
        }
        if (filter.severity && filter.severity !== 'ALL') {
          query = query.eq('severity', filter.severity);
        }
        if (filter.reported_by) {
          query = query.eq('reported_by', filter.reported_by);
        }
        if (filter.assigned_to) {
          query = query.eq('assigned_to', filter.assigned_to);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
      } catch (err) {
        console.error('Error in getBugs:', err);
      }
    }

    try {
      const stored = localStorage.getItem(STORAGE_BUGS_KEY);
      let bugs = stored ? JSON.parse(stored) : [];
      if (filter.status && filter.status !== 'ALL') {
        bugs = bugs.filter(b => b.status === filter.status);
      }
      if (filter.severity && filter.severity !== 'ALL') {
        bugs = bugs.filter(b => b.severity === filter.severity);
      }
      if (filter.reported_by) {
        bugs = bugs.filter(b => b.reported_by === filter.reported_by);
      }
      return bugs;
    } catch {
      return [];
    }
  },

  async getBugById(id) {
    if (supabase) {
      const { data, error } = await supabase
        .from('bug_reports')
        .select(`
          *,
          reporter:profiles!bug_reports_reported_by_fkey(id, full_name, email, role),
          assignee:profiles!bug_reports_assigned_to_fkey(id, full_name, email, role),
          converted_task:tasks(id, title, status, priority, deadline)
        `)
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    }

    const bugs = await this.getBugs();
    return bugs.find(b => b.id === id) || null;
  },

  async reportBug({
    title,
    description,
    steps_to_reproduce = '',
    severity = 'MEDIUM',
    screenshotFile = null,
    reporterId = null,
    reporterName = 'Team Member',
    reporterEmail = ''
  }) {
    let screenshotUrl = null;

    if (screenshotFile) {
      try {
        const uploadRes = await chatApi.uploadAttachment(screenshotFile);
        if (uploadRes?.url) {
          screenshotUrl = uploadRes.url;
        }
      } catch (err) {
        console.warn('Screenshot upload note, proceeding without attachment:', err);
      }
    }

    if (supabase) {
      // Resolve reporter to profiles.id if UUID matches auth_user_id
      let finalReporterId = reporterId;
      if (reporterId) {
        const { data: p } = await supabase
          .from('profiles')
          .select('id')
          .or(`id.eq.${reporterId},auth_user_id.eq.${reporterId}`)
          .maybeSingle();
        if (p?.id) finalReporterId = p.id;
      }

      const { data, error } = await supabase
        .from('bug_reports')
        .insert([{
          title: title.trim(),
          description: description.trim(),
          steps_to_reproduce: steps_to_reproduce?.trim() || null,
          severity,
          status: 'OPEN',
          reported_by: finalReporterId,
          reporter_name: reporterName,
          reporter_email: reporterEmail,
          screenshot_url: screenshotUrl
        }])
        .select(`
          *,
          reporter:profiles!bug_reports_reported_by_fkey(id, full_name, email, role)
        `)
        .single();

      if (error) {
        console.error('Error in reportBug:', error);
        throw error;
      }
      return data;
    }

    const newBug = {
      id: 'bug-' + Date.now(),
      title: title.trim(),
      description: description.trim(),
      steps_to_reproduce: steps_to_reproduce?.trim() || null,
      severity,
      status: 'OPEN',
      reported_by: reporterId,
      reporter_name: reporterName,
      reporter_email: reporterEmail,
      screenshot_url: screenshotUrl,
      converted_task_id: null,
      assigned_to: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      const bugs = await this.getBugs();
      bugs.unshift(newBug);
      localStorage.setItem(STORAGE_BUGS_KEY, JSON.stringify(bugs));
    } catch {}

    return newBug;
  },

  async updateBug(id, updates) {
    if (supabase) {
      const { data, error } = await supabase
        .from('bug_reports')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select(`
          *,
          reporter:profiles!bug_reports_reported_by_fkey(id, full_name, email, role),
          assignee:profiles!bug_reports_assigned_to_fkey(id, full_name, email, role),
          converted_task:tasks(id, title, status, priority, deadline)
        `)
        .single();

      if (error) throw error;
      return data;
    }

    const bugs = await this.getBugs();
    const updated = bugs.map(b => (b.id === id ? { ...b, ...updates, updated_at: new Date().toISOString() } : b));
    localStorage.setItem(STORAGE_BUGS_KEY, JSON.stringify(updated));
    return updated.find(b => b.id === id);
  },

  /**
   * Convert a Bug Report directly into an assigned Task for any team member
   */
  async convertBugToTask(bugId, taskData) {
    // 1. Create task in public.tasks
    const task = await tasksApi.createTask({
      title: taskData.title || `Fix: ${taskData.bugTitle}`,
      description: taskData.description,
      priority: taskData.priority || 'HIGH',
      deadline: taskData.deadline,
      assigned_to: taskData.assigned_to,
      assigned_by: taskData.assigned_by,
      department_id: taskData.department_id || null,
      status: 'TODO'
    });

    // 2. Link task to bug report and set bug status to IN_PROGRESS
    const updatedBug = await this.updateBug(bugId, {
      converted_task_id: task.id,
      assigned_to: taskData.assigned_to,
      status: 'IN_PROGRESS'
    });

    return { bug: updatedBug, task };
  },

  async deleteBug(id) {
    if (supabase) {
      const { error } = await supabase
        .from('bug_reports')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return true;
    }

    const bugs = await this.getBugs();
    const filtered = bugs.filter(b => b.id !== id);
    localStorage.setItem(STORAGE_BUGS_KEY, JSON.stringify(filtered));
    return true;
  }
};

export default bugsApi;
