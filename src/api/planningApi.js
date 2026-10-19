import { supabase, isDemoMode } from './supabase';
import {
  getStored,
  setStored,
  STORAGE_KEYS,
  INITIAL_PLANS,
  INITIAL_ASSIGNMENTS,
  INITIAL_PROFILES,
  INITIAL_DEPARTMENTS
} from './mockData';

export const planningApi = {
  async getDailyAllocations(dateStr) {
    if (!isDemoMode && supabase) {
      // Fetch plan for date
      const { data: plan } = await supabase
        .from('daily_plans')
        .select('id, plan_date, created_by')
        .eq('plan_date', dateStr)
        .maybeSingle();

      if (!plan) return { plan: null, allocations: [] };

      // Fetch assignments with profiles and departments
      const { data: assignments, error } = await supabase
        .from('daily_assignments')
        .select(`
          id,
          plan_id,
          user_id,
          department_id,
          user:profiles!daily_assignments_user_id_fkey(id, full_name, email, role, is_active, avatar_url),
          department:departments!daily_assignments_department_id_fkey(id, name, description)
        `)
        .eq('plan_id', plan.id);

      if (error) throw error;
      return { plan, assignments: assignments || [] };
    }

    // Mock Mode
    const plans = getStored(STORAGE_KEYS.PLANS, INITIAL_PLANS);
    const assignments = getStored(STORAGE_KEYS.ASSIGNMENTS, INITIAL_ASSIGNMENTS);
    const profiles = getStored(STORAGE_KEYS.PROFILES, INITIAL_PROFILES);
    const departments = getStored(STORAGE_KEYS.DEPARTMENTS, INITIAL_DEPARTMENTS);

    const plan = plans.find(p => p.plan_date === dateStr) || null;
    if (!plan) return { plan: null, assignments: [] };

    const planAssignments = assignments
      .filter(a => a.plan_id === plan.id)
      .map(a => ({
        ...a,
        user: profiles.find(p => p.id === a.user_id) || null,
        department: departments.find(d => d.id === a.department_id) || null
      }));

    return { plan, assignments: planAssignments };
  },

  async saveDepartmentAllocation({ dateStr, departmentId, userIds, createdBy }) {
    if (!dateStr) throw new Error('Date is required');
    if (!departmentId) throw new Error('Department is required');
    if (!Array.isArray(userIds)) throw new Error('Team members list must be an array');

    if (!isDemoMode && supabase) {
      // 1. Get or create plan
      let { data: plan } = await supabase
        .from('daily_plans')
        .select('*')
        .eq('plan_date', dateStr)
        .maybeSingle();

      if (!plan) {
        let creatorId = createdBy;
        if (creatorId) {
          try {
            const { data: cp } = await supabase
              .from('profiles')
              .select('id')
              .or(`id.eq.${creatorId},auth_user_id.eq.${creatorId}`)
              .maybeSingle();
            creatorId = cp?.id || null;
          } catch {
            creatorId = null;
          }
        }

        const { data: newPlan, error: createPlanErr } = await supabase
          .from('daily_plans')
          .insert([{ plan_date: dateStr, created_by: creatorId }])
          .select()
          .single();
        if (createPlanErr) throw createPlanErr;
        plan = newPlan;
      }

      // 2. Remove existing assignments for this plan & department to cleanly replace
      await supabase
        .from('daily_assignments')
        .delete()
        .eq('plan_id', plan.id)
        .eq('department_id', departmentId);

      // 3. Insert unique user assignments
      if (userIds.length > 0) {
        const uniqueUserIds = Array.from(new Set(userIds));
        const newRows = uniqueUserIds.map(uid => ({
          plan_id: plan.id,
          user_id: uid,
          department_id: departmentId
        }));

        const { error: insertErr } = await supabase
          .from('daily_assignments')
          .insert(newRows);
        if (insertErr) throw insertErr;
      }

      return this.getDailyAllocations(dateStr);
    }

    // Mock Mode
    const plans = getStored(STORAGE_KEYS.PLANS, INITIAL_PLANS);
    let assignments = getStored(STORAGE_KEYS.ASSIGNMENTS, INITIAL_ASSIGNMENTS);

    let plan = plans.find(p => p.plan_date === dateStr);
    if (!plan) {
      plan = {
        id: 'plan-' + Date.now(),
        plan_date: dateStr,
        created_by: createdBy,
        created_at: new Date().toISOString()
      };
      plans.push(plan);
      setStored(STORAGE_KEYS.PLANS, plans);
    }

    // Remove existing assignments for this department on this plan
    assignments = assignments.filter(
      a => !(a.plan_id === plan.id && a.department_id === departmentId)
    );

    // Add unique member assignments
    const uniqueUserIds = Array.from(new Set(userIds));
    uniqueUserIds.forEach((uid, idx) => {
      assignments.push({
        id: `asgn-${Date.now()}-${idx}`,
        plan_id: plan.id,
        user_id: uid,
        department_id: departmentId,
        created_at: new Date().toISOString()
      });
    });

    setStored(STORAGE_KEYS.ASSIGNMENTS, assignments);
    return this.getDailyAllocations(dateStr);
  },

  async getUserAssignmentForDate(userId, dateStr) {
    const { assignments } = await this.getDailyAllocations(dateStr);
    return assignments.find(a => a.user_id === userId) || null;
  },

  async removeAssignment(assignmentId) {
    if (!isDemoMode && supabase) {
      const { error } = await supabase
        .from('daily_assignments')
        .delete()
        .eq('id', assignmentId);
      if (error) throw error;
      return true;
    }

    const assignments = getStored(STORAGE_KEYS.ASSIGNMENTS, INITIAL_ASSIGNMENTS);
    const filtered = assignments.filter(a => a.id !== assignmentId);
    setStored(STORAGE_KEYS.ASSIGNMENTS, filtered);
    return true;
  }
};
