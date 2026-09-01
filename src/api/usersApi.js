import { supabase, isDemoMode } from './supabase';
import { getStored, setStored, STORAGE_KEYS, INITIAL_PROFILES } from './mockData';

const FOUNDER_EMAIL = 'sivakumarelango10@gmail.com';

export const usersApi = {
  async getUsers() {
    if (!isDemoMode && supabase) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }

    return getStored(STORAGE_KEYS.PROFILES, INITIAL_PROFILES);
  },

  async getUserById(id) {
    if (!isDemoMode && supabase) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    }

    const profiles = getStored(STORAGE_KEYS.PROFILES, INITIAL_PROFILES);
    return profiles.find(u => u.id === id) || null;
  },

  async createUser(userData) {
    const cleanEmail = userData.email.trim().toLowerCase();
    const isFounderEmail = cleanEmail === FOUNDER_EMAIL;

    const role = isFounderEmail ? 'FOUNDER' : (userData.role || 'MEMBER');

    if (!isDemoMode && supabase) {
      // In Supabase, creating a user is typically done via signUp or an admin edge function.
      // Here we insert directly to profiles for schema demonstration
      const { data, error } = await supabase
        .from('profiles')
        .insert([{
          full_name: userData.full_name,
          email: cleanEmail,
          role,
          is_active: userData.is_active !== undefined ? userData.is_active : true
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    const profiles = getStored(STORAGE_KEYS.PROFILES, INITIAL_PROFILES);
    if (profiles.some(p => p.email.toLowerCase() === cleanEmail)) {
      throw new Error(`A user with email "${cleanEmail}" already exists.`);
    }

    const newUser = {
      id: 'usr-' + Date.now(),
      full_name: userData.full_name,
      email: cleanEmail,
      role,
      is_active: userData.is_active !== undefined ? userData.is_active : true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    profiles.unshift(newUser);
    setStored(STORAGE_KEYS.PROFILES, profiles);
    return newUser;
  },

  async updateUser(id, updates) {
    const profiles = getStored(STORAGE_KEYS.PROFILES, INITIAL_PROFILES);
    const existing = profiles.find(p => p.id === id);

    if (!existing) throw new Error('User not found');

    // Protect Founder from being altered maliciously
    if (existing.email.toLowerCase() === FOUNDER_EMAIL) {
      if (updates.role && updates.role !== 'FOUNDER') {
        throw new Error('The primary Founder role cannot be changed.');
      }
      if (updates.is_active === false) {
        throw new Error('The primary Founder account cannot be deactivated.');
      }
    }

    if (!isDemoMode && supabase) {
      const { data, error } = await supabase
        .from('profiles')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    const updated = profiles.map(p => {
      if (p.id === id) {
        return {
          ...p,
          ...updates,
          updated_at: new Date().toISOString()
        };
      }
      return p;
    });

    setStored(STORAGE_KEYS.PROFILES, updated);
    return updated.find(p => p.id === id);
  },

  async toggleUserStatus(id, isActive) {
    return this.updateUser(id, { is_active: isActive });
  },

  async deleteUser(id) {
    const profiles = getStored(STORAGE_KEYS.PROFILES, INITIAL_PROFILES);
    const target = profiles.find(p => p.id === id);

    if (target && target.email.toLowerCase() === FOUNDER_EMAIL) {
      throw new Error('The primary Founder cannot be deleted.');
    }

    if (!isDemoMode && supabase) {
      const { error } = await supabase.from('profiles').delete().eq('id', id);
      if (error) throw error;
      return true;
    }

    const filtered = profiles.filter(p => p.id !== id);
    setStored(STORAGE_KEYS.PROFILES, filtered);
    return true;
  }
};
