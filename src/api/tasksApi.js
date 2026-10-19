import { supabase, isDemoMode } from './supabase.js';
import { getStored, setStored, STORAGE_KEYS, INITIAL_TASKS, INITIAL_PROFILES, INITIAL_DEPARTMENTS } from './mockData.js';

// In-memory profile resolution cache to eliminate repeated round-trips
const profileIdCache = new Map();

export const resolveProfileId = async (idOrEmail) => {
  if (!idOrEmail) return null;
  const key = String(idOrEmail).trim().toLowerCase();
  if (profileIdCache.has(key)) {
    return profileIdCache.get(key);
  }

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);

  if (supabase) {
    try {
      const filterClause = isUUID
        ? `id.eq.${idOrEmail},auth_user_id.eq.${idOrEmail}`
        : `email.ilike.${idOrEmail}`;

      const { data } = await supabase
        .from('profiles')
        .select('id')
        .or(filterClause)
        .maybeSingle();

      if (data?.id) {
        profileIdCache.set(key, data.id);
        profileIdCache.set(data.id.toLowerCase(), data.id);
        return data.id;
      }
    } catch {
      // Fallback
    }
  }

  if (isUUID) {
    profileIdCache.set(key, idOrEmail);
  }
  return idOrEmail;
};

export const tasksApi = {
  async getTasks(filter = {}) {
    if (supabase) {
      let query = supabase
        .from('tasks')
        .select(`
          *,
          assignee:profiles!tasks_assigned_to_fkey(id, full_name, email, role, avatar_url),
          creator:profiles!tasks_assigned_by_fkey(id, full_name, email, role, avatar_url),
          department:departments(id, name)
        `)
        .order('created_at', { ascending: false });

      if (filter.assigned_to) {
        const targetId = await resolveProfileId(filter.assigned_to);
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
          assignee:profiles!tasks_assigned_to_fkey(id, full_name, email, role, avatar_url),
          creator:profiles!tasks_assigned_by_fkey(id, full_name, email, role, avatar_url),
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
      const [assigneeId, creatorId] = await Promise.all([
        taskData.assigned_to ? resolveProfileId(taskData.assigned_to) : Promise.resolve(null),
        taskData.assigned_by ? resolveProfileId(taskData.assigned_by) : Promise.resolve(null)
      ]);

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
          assignee:profiles!tasks_assigned_to_fkey(id, full_name, email, role, avatar_url),
          creator:profiles!tasks_assigned_by_fkey(id, full_name, email, role, avatar_url),
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
          assignee:profiles!tasks_assigned_to_fkey(id, full_name, email, role, avatar_url),
          creator:profiles!tasks_assigned_by_fkey(id, full_name, email, role, avatar_url),
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

export default tasksApi;
