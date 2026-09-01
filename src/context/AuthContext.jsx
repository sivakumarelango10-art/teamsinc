import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../api/authApi';
import { supabase, isDemoMode } from '../api/supabase';
import { INITIAL_PROFILES } from '../api/mockData';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
        setLoading(true);
        const session = await authApi.getCurrentSession();
        if (session) {
          setUser(session.user);
          setProfile(session.profile);
        }
      } catch (err) {
        console.error('Session initialization error:', err);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    // Listen to Supabase auth events (OAuth redirect completion, token refresh, etc.)
    if (!isDemoMode && supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
          const { data: userProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          setUser(session.user);
          if (userProfile) {
            setProfile(userProfile);
          } else {
            const isFounder = session.user.email?.toLowerCase() === 'sivakumarelango10@gmail.com';
            setProfile({
              id: session.user.id,
              full_name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
              email: session.user.email,
              role: isFounder ? 'FOUNDER' : 'MEMBER',
              is_active: true
            });
          }
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

  const login = async (email, password) => {
    setError(null);
    try {
      setLoading(true);
      const res = await authApi.login(email, password);
      setUser(res.user);
      setProfile(res.profile);
      return res;
    } catch (err) {
      setError(err.message || 'Login failed');
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
    }
  };

  // Quick switcher helper to switch between demo roles in 1 click
  const switchDemoRole = async (targetRole) => {
    let email = 'sivakumarelango10@gmail.com'; // Default Founder
    if (targetRole === 'ADMIN') email = 'admin@teamsync.com';
    if (targetRole === 'MEMBER') email = 'david@teamsync.com';

    return await login(email, 'password123');
  };

  const refreshProfile = async () => {
    if (user?.id) {
      const session = await authApi.getCurrentSession();
      if (session?.profile) {
        setProfile(session.profile);
      }
    }
  };

  const signInWithGoogle = async () => {
    setError(null);
    try {
      setLoading(true);
      const res = await authApi.signInWithGoogle();
      if (res?.user) {
        setUser(res.user);
        setProfile(res.profile);
      }
      return res;
    } catch (err) {
      setError(err.message || 'Google sign-in failed');
      throw err;
    } finally {
      setLoading(false);
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
    login,
    logout,
    signInWithGoogle,
    switchDemoRole,
    refreshProfile
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export { AuthContext };
export default AuthProvider;
