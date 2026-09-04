import { supabase, isDemoMode } from './supabase';
import { getStored, setStored, STORAGE_KEYS, INITIAL_DEPARTMENTS } from './mockData';
import { usersApi } from './usersApi';

const STORAGE_MEMBERS_KEY = STORAGE_KEYS.DEPARTMENT_MEMBERS || 'teamsync_department_members';

// Helper to get raw membership mapping: { [department_id]: [userId1, userId2, ...] }
const getStoredMemberships = () => {
  try {
    const raw = localStorage.getItem(STORAGE_MEMBERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const setStoredMemberships = (memberships) => {
  try {
    localStorage.setItem(STORAGE_MEMBERS_KEY, JSON.stringify(memberships));
  } catch (err) {
    console.error('Failed to store department memberships:', err);
  }
};

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
      // Clean up memberships
      const memberships = getStoredMemberships();
      delete memberships[id];
      setStoredMemberships(memberships);
      return true;
    }

    const list = getStored(STORAGE_KEYS.DEPARTMENTS, INITIAL_DEPARTMENTS);
    const filtered = list.filter(d => d.id !== id);
    setStored(STORAGE_KEYS.DEPARTMENTS, filtered);

    const memberships = getStoredMemberships();
    delete memberships[id];
    setStoredMemberships(memberships);
    return true;
  },

  // ─── Department Members Management (Many-to-Many, No Restrictions) ────────

  /**
   * Get all member profiles assigned to a specific department
   */
  async getDepartmentMembers(departmentId, preloadedUsers = null) {
    const allUsers = preloadedUsers || (await usersApi.getUsers().catch(() => []));
    const memberships = getStoredMemberships();
    const userIds = memberships[departmentId] || [];
    return allUsers.filter(u => userIds.includes(u.id));
  },

  /**
   * Get all department memberships mapping: { [departmentId]: [profileObj, ...] }
   */
  async getAllDepartmentMemberships(preloadedUsers = null) {
    const allUsers = preloadedUsers || (await usersApi.getUsers().catch(() => []));
    const memberships = getStoredMemberships();
    const result = {};

    Object.keys(memberships).forEach(deptId => {
      const uIds = memberships[deptId] || [];
      result[deptId] = allUsers.filter(u => uIds.includes(u.id));
    });

    return result;
  },

  /**
   * Set / Replace full member assignment list for a department
   * @param {string} departmentId
   * @param {string[]} userIds - Array of user profile IDs
   */
  async setDepartmentMembers(departmentId, userIds = []) {
    const memberships = getStoredMemberships();
    memberships[departmentId] = Array.from(new Set(userIds));
    setStoredMemberships(memberships);
    return this.getDepartmentMembers(departmentId);
  },

  /**
   * Add a single member to a department (member can be in multiple departments)
   */
  async addMemberToDepartment(departmentId, userId) {
    const memberships = getStoredMemberships();
    const current = memberships[departmentId] || [];
    if (!current.includes(userId)) {
      memberships[departmentId] = [...current, userId];
      setStoredMemberships(memberships);
    }
    return this.getDepartmentMembers(departmentId);
  },

  /**
   * Remove a member from a department
   */
  async removeMemberFromDepartment(departmentId, userId) {
    const memberships = getStoredMemberships();
    const current = memberships[departmentId] || [];
    memberships[departmentId] = current.filter(id => id !== userId);
    setStoredMemberships(memberships);
    return this.getDepartmentMembers(departmentId);
  },

  /**
   * Get all departments that a specific user belongs to
   */
  async getUserDepartments(userId) {
    const [departments, memberships] = await Promise.all([
      this.getDepartments(),
      Promise.resolve(getStoredMemberships())
    ]);

    return departments.filter(d => {
      const uIds = memberships[d.id] || [];
      return uIds.includes(userId);
    });
  }
};

export default departmentsApi;
