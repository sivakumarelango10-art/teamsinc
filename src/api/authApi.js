import { supabase, isDemoMode } from './supabase';
import { getStored, setStored, STORAGE_KEYS, INITIAL_PROFILES } from './mockData';

export const authApi = {
  async login(email, password) {
    const cleanEmail = email.trim().toLowerCase();

    if (!isDemoMode && supabase) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password
        });
        if (!error && data?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();

          if (profile) return { user: data.user, profile };
        }
      } catch (err) {
        console.warn('Supabase remote sign-in fallback to demo profile:', err);
      }
    }

    // Demo Mode Handler
    const profiles = getStored(STORAGE_KEYS.PROFILES, INITIAL_PROFILES);
    let profile = profiles.find(p => p.email.toLowerCase() === cleanEmail);

    if (!profile) {
      // Auto-create for demo convenience if user typed a new email
      const isFounder = cleanEmail === 'sivakumarelango10@gmail.com';
      profile = {
        id: 'usr-' + Date.now(),
        full_name: cleanEmail.split('@')[0],
        email: cleanEmail,
        role: isFounder ? 'FOUNDER' : 'MEMBER',
        is_active: true,
        created_at: new Date().toISOString()
      };
      profiles.push(profile);
      setStored(STORAGE_KEYS.PROFILES, profiles);
    }

    if (!profile.is_active) {
      throw new Error('This account has been deactivated. Please contact your Founder or Admin.');
    }

    const mockUser = {
      id: profile.id,
      email: profile.email,
      user_metadata: { full_name: profile.full_name, role: profile.role }
    };

    setStored(STORAGE_KEYS.CURRENT_USER, { user: mockUser, profile });
    return { user: mockUser, profile };
  },

  async signInWithGoogle() {
    if (!isDemoMode && supabase) {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) throw error;
      return data;
    }

    // Demo Mode Google login: authenticates as Founder
    return this.login('sivakumarelango10@gmail.com', 'password123');
  },

  async logout() {
    if (!isDemoMode && supabase) {
      await supabase.auth.signOut();
      return;
    }
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  },

  async getCurrentSession() {
    if (!isDemoMode && supabase) {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return null;

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.session.user.id)
        .single();

      return { user: data.session.user, profile };
    }

    const current = getStored(STORAGE_KEYS.CURRENT_USER, null);
    if (!current) return null;

    // Refresh profile in case it was updated in storage
    const profiles = getStored(STORAGE_KEYS.PROFILES, INITIAL_PROFILES);
    const updatedProfile = profiles.find(p => p.id === current.profile.id);
    if (updatedProfile) {
      current.profile = updatedProfile;
      setStored(STORAGE_KEYS.CURRENT_USER, current);
    }
    return current;
  }
};
