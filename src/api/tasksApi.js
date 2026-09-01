import { supabase, isDemoMode } from './supabase';
import { getStored, setStored, STORAGE_KEYS, INITIAL_TASKS, INITIAL_PROFILES, INITIAL_DEPARTMENTS } from './mockData';

export const tasksApi = {
  async getTasks(filter = {}) {
    if (!isDemoMode && supabase) {
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
        query = query.eq('assigned_to', filter.assigned_to);
      }
      if (filter.assigned_by) {
        query = query.eq('assigned_by', filter.assigned_by);
      }
      if (filter.status) {
        query = query.eq('status', filter.status);
      }
      if (filter.department_id) {
        query = query.eq('department_id', filter.department_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    }

    // Mock mode join
    const tasks = getStored(STORAGE_KEYS.TASKS, INITIAL_TASKS);
    const profiles = getStored(STORAGE_KEYS.PROFILES, INITIAL_PROFILES);
    const departments = getStored(STORAGE_KEYS.DEPARTMENTS, INITIAL_DEPARTMENTS);

    let result = tasks.map(task => {
      const assignee = profiles.find(p => p.id === task.assigned_to) || null;
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
      result = result.filter(t => t.assigned_to === filter.assigned_to);
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
    if (filter.priority && filter.priority !== 'ALL') {
      result = result.filter(t => t.priority === filter.priority);
    }

    return result;
  },

  async createTask(taskData) {
    if (!taskData.title) throw new Error('Task title is required');
    if (!taskData.assigned_to) throw new Error('Please select an assignee');
    if (!taskData.assigned_by) throw new Error('Creator ID is missing');
    if (!taskData.deadline) throw new Error('Please select a deadline');

    if (!isDemoMode && supabase) {
      const { data, error } = await supabase
        .from('tasks')
        .insert([{
          title: taskData.title.trim(),
          description: taskData.description || '',
          status: taskData.status || 'TODO',
          priority: taskData.priority || 'MEDIUM',
          deadline: taskData.deadline,
          assigned_to: taskData.assigned_to,
          assigned_by: taskData.assigned_by,
          department_id: taskData.department_id || null
        }])
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
    if (!isDemoMode && supabase) {
      const { data, error } = await supabase
        .from('tasks')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
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

  async updateTaskStatus(id, status) {
    return this.updateTask(id, { status });
  },

  async deleteTask(id) {
    if (!isDemoMode && supabase) {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
      return true;
    }

    const tasks = getStored(STORAGE_KEYS.TASKS, INITIAL_TASKS);
    const filtered = tasks.filter(t => t.id !== id);
    setStored(STORAGE_KEYS.TASKS, filtered);
    return true;
  }
};
