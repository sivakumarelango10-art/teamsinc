import { supabase, isDemoMode } from './supabase';
import { getStored, setStored, STORAGE_KEYS, INITIAL_TASKS, INITIAL_PROFILES, INITIAL_DEPARTMENTS } from './mockData';

export const tasksApi = {
  async getTasks(filter = {}) {
    if (supabase) {
      let query = supabase
        .from('tasks')
        .select(`
          *,
          assignee:profiles!tasks_assigned_to_fkey(id, full_name, email, role),
          creator:profiles!tasks_assigned_by_fkey(id, full_name, email, role),
          department:departments(id, name)
        `)
        .order('created_at', { ascending: false });

      if (filter.assigned_to) {
        // Resolve target profile ID
        let targetId = filter.assigned_to;
        try {
          const { data: p } = await supabase
            .from('profiles')
            .select('id')
            .or(`id.eq.${filter.assigned_to},auth_user_id.eq.${filter.assigned_to}${filter.user_email ? `,email.ilike.${filter.user_email}` : ''}`)
            .maybeSingle();
          if (p?.id) targetId = p.id;
        } catch {
          // fallback to original ID
        }
        query = query.eq('assigned_to', targetId);
      }

      if (filter.assigned_by) {
        query = query.eq('assigned_by', filter.assigned_by);
      }
      if (filter.status && filter.status !== 'ALL') {
        query = query.eq('status', filter.status);
      }
      if (filter.department_id && filter.department_id !== 'ALL') {
        query = query.eq('department_id', filter.department_id);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error in getTasks:', error);
        throw error;
      }
      return data || [];
    }

    // Mock mode join
    const tasks = getStored(STORAGE_KEYS.TASKS, INITIAL_TASKS);
    const profiles = getStored(STORAGE_KEYS.PROFILES, INITIAL_PROFILES);
    const departments = getStored(STORAGE_KEYS.DEPARTMENTS, INITIAL_DEPARTMENTS);

    let result = tasks.map(task => {
      const assignee = profiles.find(p => p.id === task.assigned_to || (task.assignee && p.email === task.assignee.email)) || null;
      const creator = profiles.find(p => p.id === task.assigned_by) || null;
      const department = departments.find(d => d.id === task.department_id) || null;

      return {
        ...task,
        assignee,
        creator,
        department
      };
    });

    if (filter.assigned_to) {
      result = result.filter(t => 
        t.assigned_to === filter.assigned_to || 
        (filter.user_email && t.assignee?.email?.toLowerCase() === filter.user_email.toLowerCase())
      );
    }
    if (filter.assigned_by) {
      result = result.filter(t => t.assigned_by === filter.assigned_by);
    }
    if (filter.status && filter.status !== 'ALL') {
      result = result.filter(t => t.status === filter.status);
    }
    if (filter.department_id && filter.department_id !== 'ALL') {
      result = result.filter(t => t.department_id === filter.department_id);
    }

    return result;
  },

  async getTaskById(id) {
    if (supabase) {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          assignee:profiles!tasks_assigned_to_fkey(id, full_name, email, role),
          creator:profiles!tasks_assigned_by_fkey(id, full_name, email, role),
          department:departments(id, name)
        `)
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    }

    const tasks = await this.getTasks();
    return tasks.find(t => t.id === id) || null;
  },

  async createTask(taskData) {
    if (supabase) {
      // Resolve assignee to a valid profiles.id
      let assigneeId = taskData.assigned_to;
      if (assigneeId) {
        const { data: ap } = await supabase
          .from('profiles')
          .select('id')
          .or(`id.eq.${assigneeId},auth_user_id.eq.${assigneeId}`)
          .maybeSingle();
        if (ap?.id) assigneeId = ap.id;
      }

      // Resolve creator to a valid profiles.id
      let creatorId = taskData.assigned_by;
      if (creatorId) {
        const { data: cp } = await supabase
          .from('profiles')
          .select('id')
          .or(`id.eq.${creatorId},auth_user_id.eq.${creatorId}`)
          .maybeSingle();
        creatorId = cp?.id || null;
      }

      const { data, error } = await supabase
        .from('tasks')
        .insert([{
          title: taskData.title.trim(),
          description: taskData.description || '',
          status: taskData.status || 'TODO',
          priority: taskData.priority || 'MEDIUM',
          deadline: taskData.deadline,
          assigned_to: assigneeId,
          assigned_by: creatorId,
          department_id: taskData.department_id || null
        }])
        .select(`
          *,
          assignee:profiles!tasks_assigned_to_fkey(id, full_name, email, role),
          creator:profiles!tasks_assigned_by_fkey(id, full_name, email, role),
          department:departments(id, name)
        `)
        .single();

      if (error) {
        console.error('Error in createTask:', error);
        throw error;
      }
      return data;
    }

    const tasks = getStored(STORAGE_KEYS.TASKS, INITIAL_TASKS);
    const newTask = {
      id: 'task-' + Date.now(),
      title: taskData.title.trim(),
      description: taskData.description || '',
      status: taskData.status || 'TODO',
      priority: taskData.priority || 'MEDIUM',
      deadline: taskData.deadline,
      assigned_to: taskData.assigned_to,
      assigned_by: taskData.assigned_by,
      department_id: taskData.department_id || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    tasks.unshift(newTask);
    setStored(STORAGE_KEYS.TASKS, tasks);
    return newTask;
  },

  async updateTask(id, updates) {
    if (supabase) {
      const { data, error } = await supabase
        .from('tasks')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select(`
          *,
          assignee:profiles!tasks_assigned_to_fkey(id, full_name, email, role),
          creator:profiles!tasks_assigned_by_fkey(id, full_name, email, role),
          department:departments(id, name)
        `)
        .single();
      if (error) throw error;
      return data;
    }

    const tasks = getStored(STORAGE_KEYS.TASKS, INITIAL_TASKS);
    const updated = tasks.map(t => {
      if (t.id === id) {
        return {
          ...t,
          ...updates,
          updated_at: new Date().toISOString()
        };
      }
      return t;
    });

    setStored(STORAGE_KEYS.TASKS, updated);
    return updated.find(t => t.id === id);
  },

  async updateTaskStatus(id, newStatus) {
    return this.updateTask(id, { status: newStatus });
  },

  async deleteTask(id) {
    if (supabase) {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return true;
    }

    const tasks = getStored(STORAGE_KEYS.TASKS, INITIAL_TASKS);
    const filtered = tasks.filter(t => t.id !== id);
    setStored(STORAGE_KEYS.TASKS, filtered);
    return true;
  }
};
