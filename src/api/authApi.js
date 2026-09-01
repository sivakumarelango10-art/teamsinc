import { supabase, isDemoMode } from './supabase';
import { AUTHORIZED_EMAILS, INITIAL_PROFILES } from './mockData';

const FOUNDER_EMAIL = 'sivakumarelango10@gmail.com';

export const authApi = {
  // Verify if an email is registered in the database
  async verifyDatabaseRegistration(email) {
    const cleanEmail = email?.trim().toLowerCase();
    if (!cleanEmail) {
      return { registered: false, profile: null, role: null, error: 'Email address is missing.' };
    }

    // 1. Direct database check against Supabase profiles table
    if (supabase) {
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .ilike('email', cleanEmail)
          .maybeSingle();

        if (error) {
          console.warn('Database registration query error:', error);
        }

        if (profile) {
          if (!profile.is_active) {
            return {
              registered: false,
              profile: null,
              role: null,
              error: 'Your account has been deactivated by the Founder.'
            };
          }

          // Return verified profile with database assigned role
          const role = cleanEmail === FOUNDER_EMAIL ? 'FOUNDER' : (profile.role || 'MEMBER');
          return {
            registered: true,
            profile: { ...profile, role },
            role,
            error: null
          };
        }
      } catch (err) {
        console.error('Error verifying database registration in Supabase:', err);
      }
    }

    // 2. Strict Whitelist Fallback
    if (cleanEmail === FOUNDER_EMAIL) {
      return {
        registered: true,
        profile: {
          id: 'usr-founder-1',
          full_name: 'Sivakumar Elango',
          email: cleanEmail,
          role: 'FOUNDER',
          is_active: true
        },
        role: 'FOUNDER',
        error: null
      };
    }

    if (AUTHORIZED_EMAILS.includes(cleanEmail)) {
      const match = INITIAL_PROFILES.find(p => p.email.toLowerCase() === cleanEmail);
      return {
        registered: true,
        profile: match || {
          id: 'usr-' + cleanEmail.split('@')[0],
          full_name: cleanEmail.split('@')[0],
          email: cleanEmail,
          role: 'MEMBER',
          is_active: true
        },
        role: 'MEMBER',
        error: null
      };
    }

    return {
      registered: false,
      profile: null,
      role: null,
      error: `Access Denied: The email "${cleanEmail}" is not registered in TeamSync. Only accounts registered by the Founder can sign in.`
    };
  },

  // Google OAuth sign-in only
  async signInWithGoogle() {
    if (!supabase) {
      throw new Error('Supabase client is not configured. Please check environment variables.');
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });

    if (error) throw error;
    return data;
  },

  async logout() {
    if (supabase) {
      await supabase.auth.signOut();
    }
    localStorage.removeItem('teamsync_current_user');
  },

  // Retrieve currently active session from Supabase
  async getCurrentSession() {
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      if (!data?.session?.user) return null;

      const userEmail = data.session.user.email?.toLowerCase();
      const verification = await this.verifyDatabaseRegistration(userEmail);

      if (!verification.registered) {
        await supabase.auth.signOut();
        throw new Error(verification.error || 'Access Denied: Account not registered.');
      }

      // Link auth_user_id in profiles if not yet linked
      if (verification.profile?.id && verification.profile.auth_user_id !== data.session.user.id) {
        await supabase
          .from('profiles')
          .update({ auth_user_id: data.session.user.id })
          .eq('id', verification.profile.id);
      }

      return {
        user: data.session.user,
        profile: verification.profile
      };
    }

    return null;
  },

  // Upload Avatar to Supabase Storage
  async uploadAvatar(file) {
    if (!supabase) throw new Error('Supabase client not initialized');
    if (!file) throw new Error('No image file selected');

    const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `avatars/${Date.now()}_${cleanName}`;

    const { error: uploadError } = await supabase.storage
      .from('chat-attachments')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (uploadError) {
      console.error('Avatar upload failed:', uploadError);
      throw new Error(uploadError.message || 'Failed to upload avatar image');
    }

    const { data: publicData } = supabase.storage
      .from('chat-attachments')
      .getPublicUrl(filePath);

    return publicData?.publicUrl;
  },

  // Update profile full_name and/or avatar_url
  async updateProfile(profileId, { full_name, avatar_url }) {
    const updates = {
      updated_at: new Date().toISOString()
    };
    if (full_name !== undefined) updates.full_name = full_name.trim();
    if (avatar_url !== undefined) updates.avatar_url = avatar_url;

    if (supabase) {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', profileId)
        .select()
        .single();

      if (error) throw error;

      // Update Supabase Auth metadata
      try {
        await supabase.auth.updateUser({
          data: {
            full_name: updates.full_name,
            avatar_url: updates.avatar_url
          }
        });
      } catch (authErr) {
        console.warn('Could not update user metadata:', authErr);
      }

      return data;
    }

    return { id: profileId, ...updates };
  }
};
