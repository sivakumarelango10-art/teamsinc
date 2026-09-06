import { supabase } from './supabase.js';
import { tasksApi, resolveProfileId } from './tasksApi.js';
import { chatApi } from './chatApi.js';
import { departmentsApi } from './departmentsApi.js';
import { usersApi } from './usersApi.js';

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
      const finalReporterId = reporterId ? await resolveProfileId(reporterId) : null;

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

      // Background AI Auto-Triage & Auto-Assignment for Critical / Urgent bugs
      this.autoTriageAndAssign(data).catch(err => console.warn('Auto-triage background notice:', err));

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
      this.autoTriageAndAssign(newBug).catch(err => console.warn('Auto-triage fallback notice:', err));
    } catch {}

    return newBug;
  },

  /**
   * Automated AI Bug Triage & Auto-Assignment Engine
   * Classifies root cause, maps target department, and automatically assigns Critical bugs!
   */
  async autoTriageAndAssign(bug) {
    if (!bug) return;
    try {
      const [departments, users] = await Promise.all([
        departmentsApi.getDepartments().catch(() => []),
        usersApi.getUsers().catch(() => [])
      ]);

      const { geminiApi } = await import('./geminiApi');
      const triage = await geminiApi.classifyAndRouteBug({
        bugTitle: bug.title,
        bugDescription: bug.description,
        stepsToReproduce: bug.steps_to_reproduce,
        departments,
        severity: bug.severity
      });

      if (!triage) return;

      let targetDeptId = triage.suggestedDepartmentId;
      if (!targetDeptId && triage.suggestedDepartmentName) {
        const foundDept = departments.find(
          d => d.name.toLowerCase() === triage.suggestedDepartmentName.toLowerCase()
        );
        if (foundDept) targetDeptId = foundDept.id;
      }

      // If severity is CRITICAL, automatically convert to high-priority task assigned to the target department & its members!
      if (bug.severity === 'CRITICAL' || triage.recommendedSeverity === 'CRITICAL') {
        let assignedMember = null;
        let deptMembers = [];

        // 1. Check which members belong to that specific department
        if (targetDeptId) {
          deptMembers = await departmentsApi.getDepartmentMembers(targetDeptId).catch(() => []);
        }

        const activeDeptMembers = deptMembers.filter(m => m.is_active);

        if (activeDeptMembers.length > 0) {
          // Select the primary member or engineer from that department
          assignedMember = activeDeptMembers[0];
        } else {
          // Fallback if no members have been assigned to that department yet: Pick Operations Admin or Founder
          const activeUsers = users.filter(u => u.is_active);
          assignedMember =
            activeUsers.find(u => u.role === 'ADMIN' || u.role === 'FOUNDER') ||
            activeUsers[0];
        }

        if (assignedMember && !bug.converted_task_id) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const deadlineStr = tomorrow.toISOString().split('T')[0];

          const taskDescription = [
            `🚨 [CRITICAL AI EMERGENCY TRIAGE - AUTO-ASSIGNED]`,
            `\n• Target Department: ${triage.suggestedDepartmentName || 'Engineering'}`,
            `• Assigned Department Member: ${assignedMember.full_name} (${assignedMember.role})`,
            `• Error Domain: ${triage.errorDomain || 'System Core'}`,
            `• Root Cause Hypothesis: ${triage.rootCauseSummary || 'Critical stability defect requiring immediate fix.'}`,
            triage.actionableSteps?.length ? `\n• Actionable Resolution Steps:\n${triage.actionableSteps.map(s => `  - ${s}`).join('\n')}` : '',
            `\n• Issue Description:\n${bug.description}`,
            bug.steps_to_reproduce ? `\n• Steps to Reproduce:\n${bug.steps_to_reproduce}` : '',
            bug.screenshot_url ? `\n• Reference Screenshot: ${bug.screenshot_url}` : '',
            `\nReported by: ${bug.reporter_name || 'Team Member'}`
          ].filter(Boolean).join('\n');

          await this.convertBugToTask(bug.id, {
            title: `[CRITICAL FIX] ${bug.title}`,
            description: taskDescription,
            priority: 'URGENT',
            deadline: deadlineStr,
            assigned_to: assignedMember.id,
            assigned_by: bug.reported_by || assignedMember.id,
            department_id: targetDeptId || null
          });
        }
      }
    } catch (err) {
      console.warn('Auto-triage engine execution note:', err);
    }
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
