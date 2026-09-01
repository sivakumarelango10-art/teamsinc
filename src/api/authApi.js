import { supabase, isDemoMode } from './supabase';
import { getStored, setStored, STORAGE_KEYS, INITIAL_PROFILES, AUTHORIZED_EMAILS } from './mockData';

export const authApi = {
  // Check if an email is authorized (either in whitelist or pre-created by Founder)
  async isEmailAuthorized(email) {
    const cleanEmail = email?.trim().toLowerCase();
    if (!cleanEmail) return false;

    // 1. Check strict pre-approved whitelist
    if (AUTHORIZED_EMAILS.includes(cleanEmail)) {
      return true;
    }

    // 2. Check if a profile was pre-created by the Founder in Supabase
    if (!isDemoMode && supabase) {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id, is_active')
          .eq('email', cleanEmail)
          .maybeSingle();

        if (data) return Boolean(data.is_active);
      } catch (err) {
        console.warn('Error checking authorized email in remote profiles:', err);
      }
    }

    // 3. Check stored profiles
    const profiles = getStored(STORAGE_KEYS.PROFILES, INITIAL_PROFILES);
    const found = profiles.find(p => p.email?.toLowerCase() === cleanEmail);
    return Boolean(found && found.is_active !== false);
  },

  async login(email, password) {
    const cleanEmail = email.trim().toLowerCase();

    // Enforce authorization guard: only authorized emails or founder-created accounts
    const isAuthorized = await this.isEmailAuthorized(cleanEmail);
    if (!isAuthorized) {
      throw new Error(
        'Access denied. Only authorized team members invited by the Founder can sign in. Please contact sivakumarelango10@gmail.com.'
      );
    }

    if (!isDemoMode && supabase) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password
        });
        if (error) throw error;

        if (data?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();

          if (profile) {
            if (!profile.is_active) {
              await supabase.auth.signOut();
              throw new Error('This account has been deactivated by the Founder.');
            }
            return { user: data.user, profile };
          }
        }
      } catch (err) {
        // If credentials failed on remote Supabase but email is authorized, continue to fallback or rethrow
        if (err.message?.includes('Invalid login credentials')) {
          throw err;
        }
        console.warn('Supabase sign-in note:', err.message);
      }
    }

    // Storage lookup for authorized profile
    const profiles = getStored(STORAGE_KEYS.PROFILES, INITIAL_PROFILES);
    let profile = profiles.find(p => p.email.toLowerCase() === cleanEmail);

    if (!profile) {
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
      throw new Error('This account has been deactivated. Please contact the Founder.');
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

    // Default to Founder in local test environment
    return this.login('sivakumarelango10@gmail.com', 'password123');
  },

  async logout() {
    if (!isDemoMode && supabase) {
      await supabase.auth.signOut();
    }
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  },

  async getCurrentSession() {
    if (!isDemoMode && supabase) {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) return null;

      const userEmail = data.session.user.email?.toLowerCase();
      const isAuthorized = await this.isEmailAuthorized(userEmail);
      if (!isAuthorized) {
        await supabase.auth.signOut();
        throw new Error(
          'Access denied. Your email account is not authorized to access TeamSync. Only invited members can sign in.'
        );
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.session.user.id)
        .maybeSingle();

      if (profile && !profile.is_active) {
        await supabase.auth.signOut();
        throw new Error('This account has been deactivated by the Founder.');
      }

      return { user: data.session.user, profile };
    }

    const current = getStored(STORAGE_KEYS.CURRENT_USER, null);
    if (!current) return null;

    // Verify current user still authorized
    if (!AUTHORIZED_EMAILS.includes(current.user.email?.toLowerCase())) {
      const profiles = getStored(STORAGE_KEYS.PROFILES, INITIAL_PROFILES);
      const found = profiles.find(p => p.email?.toLowerCase() === current.user.email?.toLowerCase());
      if (!found) {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
        return null;
      }
    }

    const profiles = getStored(STORAGE_KEYS.PROFILES, INITIAL_PROFILES);
    const updatedProfile = profiles.find(p => p.id === current.profile.id);
    if (updatedProfile) {
      current.profile = updatedProfile;
      setStored(STORAGE_KEYS.CURRENT_USER, current);
    }
    return current;
  }
};
