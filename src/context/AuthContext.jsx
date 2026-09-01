import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { authApi } from '../api/authApi';
import { supabase } from '../api/supabase';
import notificationService from '../utils/notificationService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const currentUserRef = useRef(null);
  currentUserRef.current = user;

  useEffect(() => {
    // 1. Initial Session Check on app mount
    const initAuth = async () => {
      try {
        setLoading(true);
        const session = await authApi.getCurrentSession();
        if (session) {
          setUser(session.user);
          setProfile(session.profile);
        } else {
          setUser(null);
          setProfile(null);
        }
      } catch (err) {
        console.error('Session initialization error:', err);
        setError(err.message);
        setUser(null);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    // 2. Listen to Supabase Auth state changes (OAuth callbacks, token refresh, sign-out)
    let authSubscription = null;
    if (supabase) {
      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
          const email = session.user.email?.toLowerCase();
          const verification = await authApi.verifyDatabaseRegistration(email);

          if (!verification.registered) {
            console.warn('Blocked unauthorized sign-in attempt for:', email);
            await supabase.auth.signOut();
            setUser(null);
            setProfile(null);
            setError(verification.error || 'Access Denied: Your email is not registered in TeamSync.');
            return;
          }

          // Link auth_user_id in profiles if not yet linked
          if (verification.profile?.id && verification.profile.auth_user_id !== session.user.id) {
            await supabase
              .from('profiles')
              .update({ auth_user_id: session.user.id })
              .eq('id', verification.profile.id);
          }

          setUser(session.user);
          setProfile(verification.profile);
          setError(null);

          // Initialize Web Push subscription asynchronously (non-blocking)
          // Requires VITE_VAPID_PUBLIC_KEY; degrades gracefully if not set.
          const profileId = verification.profile?.id;
          if (profileId) {
            notificationService.initWebPush(profileId).catch(() => {});
          }

        } else if (event === 'SIGNED_OUT') {
          // Clean up push subscription for this device on logout
          const prevProfile = currentUserRef.current;
          if (prevProfile?.id) {
            notificationService.onLogout(prevProfile.id).catch(() => {});
          }
          setUser(null);
          setProfile(null);
        }
      });
      authSubscription = data.subscription;
    }

    // 3. Supabase Realtime Listener for Profile & Role Changes
    let profileChannel = null;
    if (supabase) {
      profileChannel = supabase
        .channel('realtime-profile-updates')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'profiles' },
          (payload) => {
            const updatedProfile = payload.new;
            const currentEmail = currentUserRef.current?.email?.toLowerCase();
            if (updatedProfile && currentEmail && updatedProfile.email?.toLowerCase() === currentEmail) {
              console.log('Realtime role change applied for current user:', updatedProfile.role);
              setProfile(prev => ({
                ...(prev || {}),
                ...updatedProfile
              }));
            }
          }
        )
        .subscribe();
    }

    // 4. Cross-tab BroadcastChannel for role changes
    let bc = null;
    try {
      bc = new BroadcastChannel('teamsync_role_changes');
      bc.onmessage = (event) => {
        if (event.data?.type === 'ROLE_CHANGED' && event.data.email) {
          const currentEmail = currentUserRef.current?.email?.toLowerCase();
          if (event.data.email.toLowerCase() === currentEmail) {
            setProfile(prev => ({
              ...(prev || {}),
              role: event.data.role
            }));
          }
        }
      };
    } catch {
      // BroadcastChannel unavailable
    }

    return () => {
      authSubscription?.unsubscribe();
      if (profileChannel) supabase.removeChannel(profileChannel);
      if (bc) bc.close();
    };
  }, []);

  const signInWithGoogle = async () => {
    setError(null);
    try {
      setLoading(true);
      await authApi.signInWithGoogle();
    } catch (err) {
      setError(err.message || 'Google sign-in failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setProfile(null);
      setError(null);
    }
  };

  const refreshProfile = async () => {
    if (user?.email) {
      const verification = await authApi.verifyDatabaseRegistration(user.email);
      if (verification.registered) {
        setProfile(verification.profile);
      }
    }
  };

  const role = profile?.role || null;
  const isFounder = role === 'FOUNDER';
  const isAdmin = role === 'ADMIN';
  const isMember = role === 'MEMBER';

  const value = {
    user,
    profile,
    role,
    isFounder,
    isAdmin,
    isMember,
    loading,
    error,
    signInWithGoogle,
    logout,
    refreshProfile
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export { AuthContext };
export default AuthProvider;
