import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../api/authApi';
import { supabase } from '../api/supabase';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
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
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setProfile(null);
        }
      });

      return () => {
        subscription?.unsubscribe();
      };
    }
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
