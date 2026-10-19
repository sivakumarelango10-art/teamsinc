import { supabase, isDemoMode } from './supabase.js';
import { getStored, setStored, STORAGE_KEYS, INITIAL_PROFILES } from './mockData.js';

const FOUNDER_EMAIL = 'sivakumarelango10@gmail.com';

// Lightweight memory cache with 15-second TTL for instant page-to-page navigation
let usersCache = null;
let usersCacheTime = 0;
const CACHE_TTL_MS = 15000;

export const invalidateUsersCache = () => {
  usersCache = null;
  usersCacheTime = 0;
};

async function assertCanManageUsers() {
  if (supabase) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        if (user.email.toLowerCase() === FOUNDER_EMAIL) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('email', user.email.toLowerCase())
          .maybeSingle();

        if (profile && profile.role !== 'ADMIN' && profile.role !== 'FOUNDER') {
          const error = new Error('Forbidden: Members have read-only access to user management.');
          error.status = 403;
          error.statusCode = 403;
          throw error;
        }
      }
    } catch (err) {
      if (err.status === 403 || err.statusCode === 403) throw err;
    }
  }
}

export const usersApi = {
  async getUsers(forceRefresh = false) {
    if (!forceRefresh && usersCache && (Date.now() - usersCacheTime < CACHE_TTL_MS)) {
      return usersCache;
    }

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .order('role', { ascending: false })
          .order('full_name', { ascending: true });

        if (error) throw error;
        usersCache = data || [];
        usersCacheTime = Date.now();
        return usersCache;
      } catch (err) {
        console.error('Error fetching users from Supabase:', err);
      }
    }

    const fallback = getStored(STORAGE_KEYS.PROFILES, INITIAL_PROFILES);
    usersCache = fallback;
    usersCacheTime = Date.now();
    return fallback;
  },

  async getUserById(id) {
    if (supabase) {
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
    await assertCanManageUsers();

    const cleanEmail = userData.email.trim().toLowerCase();
    const isFounderEmail = cleanEmail === FOUNDER_EMAIL;
    const role = isFounderEmail ? 'FOUNDER' : (userData.role || 'MEMBER');

    if (supabase) {
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
      invalidateUsersCache();
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
    invalidateUsersCache();
    return newUser;
  },

  async updateUser(id, updates) {
    await assertCanManageUsers();

    if (supabase) {
      // Protect Founder from being altered maliciously
      const { data: target } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', id)
        .maybeSingle();

      if (target?.email?.toLowerCase() === FOUNDER_EMAIL) {
        if (updates.role && updates.role !== 'FOUNDER') {
          throw new Error('The Founder role cannot be changed.');
        }
        if (updates.is_active === false) {
          throw new Error('The Founder account cannot be deactivated.');
        }
      }

      const { data, error } = await supabase
        .from('profiles')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      invalidateUsersCache();
      return data;
    }

    const profiles = getStored(STORAGE_KEYS.PROFILES, INITIAL_PROFILES);
    const existing = profiles.find(p => p.id === id);
    if (!existing) throw new Error('User not found');

    if (existing.email.toLowerCase() === FOUNDER_EMAIL) {
      if (updates.role && updates.role !== 'FOUNDER') {
        throw new Error('The Founder role cannot be changed.');
      }
      if (updates.is_active === false) {
        throw new Error('The Founder account cannot be deactivated.');
      }
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
    invalidateUsersCache();
    return updated.find(p => p.id === id);
  },

  async changeUserRole(id, newRole) {
    return this.updateUser(id, { role: newRole });
  },

  async toggleUserStatus(id, isActive) {
    return this.updateUser(id, { is_active: isActive });
  },

  async deleteUser(id) {
    await assertCanManageUsers();

    if (supabase) {
      const { data: target } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', id)
        .maybeSingle();

      if (target?.email?.toLowerCase() === FOUNDER_EMAIL) {
        throw new Error('The primary Founder account cannot be deleted.');
      }

      const { error } = await supabase.from('profiles').delete().eq('id', id);
      if (error) throw error;
      invalidateUsersCache();
      return true;
    }

    const profiles = getStored(STORAGE_KEYS.PROFILES, INITIAL_PROFILES);
    const target = profiles.find(p => p.id === id);
    if (target?.email?.toLowerCase() === FOUNDER_EMAIL) {
      throw new Error('The primary Founder account cannot be deleted.');
    }

    const filtered = profiles.filter(p => p.id !== id);
    setStored(STORAGE_KEYS.PROFILES, filtered);
    invalidateUsersCache();
    return true;
  }
};
