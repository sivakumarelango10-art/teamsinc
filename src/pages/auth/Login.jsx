import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import BrandLogo from '../../components/common/BrandLogo';

export const Login = () => {
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');

  const { signInWithGoogle, error: authError } = useAuth();

  const activeError = localError || authError;

  const handleGoogleSignIn = async () => {
    setLocalError('');
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setLocalError(err.message || 'Google sign-in failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden text-neutral-100 selection:bg-white selection:text-black">
      {/* Background subtle radial gradient */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-neutral-900/40 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center">
        <div className="flex justify-center mb-4">
          <BrandLogo size="large" />
        </div>
        <p className="text-xs text-neutral-400">
          Enterprise Task Management & Daily Workforce Allocation System
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-neutral-950 p-8 rounded-2xl border border-neutral-800 shadow-2xl">
          <h2 className="text-xl font-bold text-white mb-1.5">Sign in to TeamSync</h2>
          <p className="text-xs text-neutral-400 mb-6">
            Authentication is restricted to verified team members. Sign in with your registered Google account.
          </p>

          {activeError && (
            <div className="mb-6 p-4 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-white shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold text-white block">Access Restricted</span>
                <span className="text-neutral-300 leading-relaxed block">{activeError}</span>
              </div>
            </div>
          )}

          {/* Google Sign-in Button Only */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-xl text-sm font-bold text-black bg-white hover:bg-neutral-200 transition-all flex items-center justify-center gap-3 shadow-md cursor-pointer disabled:opacity-50 group"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>{loading ? 'Authenticating...' : 'Continue with Google'}</span>
          </button>

          {/* Security Notice */}
          <div className="mt-6 pt-5 border-t border-neutral-900 flex items-center justify-center gap-2 text-center text-[11px] text-neutral-400">
            <ShieldCheck className="w-3.5 h-3.5 text-neutral-400" />
            <span>Secured with Supabase Authentication & RLS</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
