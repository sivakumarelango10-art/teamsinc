import { supabase, isDemoMode } from './supabase';
import { getStored, setStored, STORAGE_KEYS, INITIAL_DEPARTMENTS } from './mockData';

export const departmentsApi = {
  async getDepartments() {
    if (!isDemoMode && supabase) {
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return data;
    }

    return getStored(STORAGE_KEYS.DEPARTMENTS, INITIAL_DEPARTMENTS);
  },

  async createDepartment({ name, description }) {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error('Department name is required');

    if (!isDemoMode && supabase) {
      const { data, error } = await supabase
        .from('departments')
        .insert([{ name: trimmedName, description }])
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    const list = getStored(STORAGE_KEYS.DEPARTMENTS, INITIAL_DEPARTMENTS);
    if (list.some(d => d.name.toLowerCase() === trimmedName.toLowerCase())) {
      throw new Error(`A department named "${trimmedName}" already exists.`);
    }

    const newDept = {
      id: 'dept-' + Date.now(),
      name: trimmedName,
      description: description || '',
      created_at: new Date().toISOString()
    };

    list.push(newDept);
    setStored(STORAGE_KEYS.DEPARTMENTS, list);
    return newDept;
  },

  async updateDepartment(id, { name, description }) {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error('Department name is required');

    if (!isDemoMode && supabase) {
      const { data, error } = await supabase
        .from('departments')
        .update({ name: trimmedName, description })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    const list = getStored(STORAGE_KEYS.DEPARTMENTS, INITIAL_DEPARTMENTS);
    if (list.some(d => d.id !== id && d.name.toLowerCase() === trimmedName.toLowerCase())) {
      throw new Error(`A department named "${trimmedName}" already exists.`);
    }

    const updated = list.map(d => {
      if (d.id === id) {
        return { ...d, name: trimmedName, description: description || '' };
      }
      return d;
    });

    setStored(STORAGE_KEYS.DEPARTMENTS, updated);
    return updated.find(d => d.id === id);
  },

  async deleteDepartment(id) {
    if (!isDemoMode && supabase) {
      const { error } = await supabase.from('departments').delete().eq('id', id);
      if (error) throw error;
      return true;
    }

    const list = getStored(STORAGE_KEYS.DEPARTMENTS, INITIAL_DEPARTMENTS);
    const filtered = list.filter(d => d.id !== id);
    setStored(STORAGE_KEYS.DEPARTMENTS, filtered);
    return true;
  }
};
