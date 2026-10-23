import { supabase, isDemoMode } from './supabase';
import { AUTHORIZED_EMAILS, INITIAL_PROFILES } from './mockData';

const FOUNDER_EMAIL = 'sivakumarelango10@gmail.com';

// Cache in-flight verification requests to avoid duplicate concurrent round-trips
const inFlightVerifications = new Map();

export const authApi = {
  // Verify if an email is registered in the database
  async verifyDatabaseRegistration(email) {
    const cleanEmail = email?.trim().toLowerCase();
    if (!cleanEmail) {
      return { registered: false, profile: null, role: null, error: 'Email address is missing.' };
    }

    if (inFlightVerifications.has(cleanEmail)) {
      return inFlightVerifications.get(cleanEmail);
    }

    const verificationPromise = (async () => {
      try {
        return await this._doVerifyDatabaseRegistration(cleanEmail);
      } finally {
        inFlightVerifications.delete(cleanEmail);
      }
    })();

    inFlightVerifications.set(cleanEmail, verificationPromise);
    return verificationPromise;
  },

  async _doVerifyDatabaseRegistration(cleanEmail) {

    // 1. Direct database check against Supabase profiles table
    if (supabase) {
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .ilike('email', cleanEmail)
          .maybeSingle();

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
          const role = profile.role || 'MEMBER';
          return {
            registered: true,
            profile: { ...profile, role },
            role,
            error: null
          };
        }

        // If unauthenticated (RLS hides profiles table), query safe RPC check
        const { data: isRegistered, error: rpcError } = await supabase
          .rpc('check_email_registered', { email_input: cleanEmail });

        if (!rpcError && isRegistered) {
          return {
            registered: true,
            profile: null,
            role: null,
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
      error: `Access Denied: The email "${cleanEmail}" is not registered in TeamSinc. Only accounts registered by the Founder can sign in.`
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
      if (data?.session?.user) {
        const userEmail = data.session.user.email?.toLowerCase();
        const verification = await this.verifyDatabaseRegistration(userEmail);

        if (!verification.registered) {
          await supabase.auth.signOut();
          throw new Error(verification.error || 'Access Denied: Account not registered.');
        }

        const googleAvatar = data.session.user.user_metadata?.avatar_url || data.session.user.user_metadata?.picture;
        const profileUpdates = {};

        // Link auth_user_id in profiles if not yet linked
        if (verification.profile?.id && verification.profile.auth_user_id !== data.session.user.id) {
          profileUpdates.auth_user_id = data.session.user.id;
        }

        // Sync Google avatar if profile does not yet have an avatar
        if (googleAvatar && (!verification.profile?.avatar_url || verification.profile.avatar_url.trim() === '')) {
          profileUpdates.avatar_url = googleAvatar;
          verification.profile.avatar_url = googleAvatar;
        }

        if (Object.keys(profileUpdates).length > 0 && verification.profile?.id) {
          await supabase
            .from('profiles')
            .update(profileUpdates)
            .eq('id', verification.profile.id);
        }

        return {
          user: data.session.user,
          profile: verification.profile
        };
      }
    }

    // Local workspace session fallback for registered accounts (used in browser testing & offline verification)
    if (typeof localStorage !== 'undefined') {
      const localStored = localStorage.getItem('teamsync_current_user');
      if (localStored) {
        try {
          const parsed = JSON.parse(localStored);
          if (parsed && parsed.email) {
            const verification = await this.verifyDatabaseRegistration(parsed.email);
            if (verification.registered) {
              return {
                user: { id: verification.profile.id, email: parsed.email },
                profile: verification.profile
              };
            }
          }
        } catch {
          // Ignore parse error
        }
      }
    }

    return null;
  },

  // Upload Avatar to Supabase Storage with user-specific isolation
  async uploadAvatar(file, userId) {
    if (!supabase) throw new Error('Supabase client not initialized');
    if (!file) throw new Error('No image file selected');

    // Resolve user ID for tenant isolation
    let effectiveUserId = userId;
    if (!effectiveUserId) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        effectiveUserId = user?.id;
      } catch {}
    }
    const userFolder = effectiveUserId ? effectiveUserId.replace(/[^a-zA-Z0-9-]/g, '') : 'general';
    const ext = file.name ? file.name.split('.').pop().toLowerCase() : 'webp';
    const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'webp';
    const filePath = `avatars/${userFolder}/avatar_${Date.now()}.${safeExt}`;

    // Attempt upload to dedicated avatars bucket, fallback to chat-attachments
    let targetBucket = 'avatars';
    let uploadRes = await supabase.storage
      .from(targetBucket)
      .upload(filePath, file, {
        contentType: file.type || `image/${safeExt}`,
        cacheControl: '3600',
        upsert: true
      });

    if (uploadRes.error && uploadRes.error.message?.toLowerCase().includes('bucket not found')) {
      targetBucket = 'chat-attachments';
      uploadRes = await supabase.storage
        .from(targetBucket)
        .upload(filePath, file, {
          contentType: file.type || `image/${safeExt}`,
          cacheControl: '3600',
          upsert: true
        });
    }

    if (uploadRes.error) {
      console.error('Avatar upload failed:', uploadRes.error);
      throw new Error(uploadRes.error.message || 'Failed to upload avatar image. Please check file format.');
    }

    const { data: publicData } = supabase.storage
      .from(targetBucket)
      .getPublicUrl(filePath);

    return publicData?.publicUrl;
  },

  // Update profile full_name and/or avatar_url
  async updateProfile(profileId, { full_name, avatar_url }) {
    if (!profileId) throw new Error('Profile ID is required.');

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

      if (error) {
        console.error('Database profile update error:', error);
        throw new Error(error.message || 'Failed to update profile record in database.');
      }

      // Invalidate memory cache so subsequent user list / directory queries reflect updates immediately
      try {
        const { invalidateUsersCache } = await import('./usersApi.js');
        invalidateUsersCache();
      } catch {}

      // Broadcast update across active browser tabs
      try {
        const bc = new BroadcastChannel('teamsync_bc_profiles');
        bc.postMessage({ type: 'PROFILE_UPDATED', profileId, data });
        bc.close();
      } catch {}

      // Update Supabase Auth metadata in the background if possible
      try {
        await supabase.auth.updateUser({
          data: {
            full_name: updates.full_name,
            avatar_url: updates.avatar_url
          }
        });
      } catch (authErr) {
        console.warn('Could not update Supabase auth metadata:', authErr);
      }

      return data;
    }

    return { id: profileId, ...updates };
  }
};
