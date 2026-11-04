import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ShieldCheck, X } from 'lucide-react';
import { supabase } from '../../api/supabase';

const isRecentTotpMethod = (methods = []) => {
  const now = Math.floor(Date.now() / 1000);
  return methods.some((item) => {
    const method = String(item?.method || '').toLowerCase();
    const timestamp = Number(item?.timestamp);
    return method === 'totp'
      && Number.isFinite(timestamp)
      && timestamp <= now
      && now - timestamp <= 300;
  });
};

export const FounderAttendanceVerificationModal = ({ isOpen, onClose, onVerified }) => {
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [factor, setFactor] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState('loading');

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;

    const initialize = async () => {
      setInitializing(true);
      setError('');
      setCode('');
      setStep('loading');
      try {
        if (!supabase) throw new Error('Supabase authentication is not configured.');

        const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assuranceError) throw assuranceError;
        if (assurance?.currentLevel === 'aal2' && isRecentTotpMethod(assurance.currentAuthenticationMethods || [])) {
          if (!cancelled) {
            setStep('verified');
            await onVerified?.();
          }
          return;
        }

        const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
        if (factorsError) throw factorsError;
        const allFactors = factorsData?.all || [];
        const verifiedTotp = allFactors.find((item) =>
          (item.factor_type === 'totp' || item.type === 'totp') && item.status === 'verified'
        );

        if (verifiedTotp) {
          if (!cancelled) {
            setFactor(verifiedTotp);
            setStep('verify');
          }
          return;
        }

        // Remove an abandoned, unverified enrollment before creating a fresh QR code.
        const pendingTotp = allFactors.find((item) =>
          (item.factor_type === 'totp' || item.type === 'totp') && item.status !== 'verified'
        );
        if (pendingTotp?.id) {
          const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: pendingTotp.id });
          if (removeError) throw removeError;
        }

        const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: 'TeamSync Founder Attendance Verification'
        });
        if (enrollError) throw enrollError;
        if (!enrolled?.id || !enrolled?.totp?.qr_code) {
          throw new Error('Supabase did not return a TOTP enrollment QR code.');
        }
        if (!cancelled) {
          setEnrollment(enrolled);
          setFactor({ id: enrolled.id, factor_type: 'totp', status: 'unverified' });
          setStep('enroll');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Unable to initialize secure Founder verification.');
          setStep('error');
        }
      } finally {
        if (!cancelled) setInitializing(false);
      }
    };

    initialize();
    return () => { cancelled = true; };
  }, [isOpen]);

  if (!isOpen) return null;

  const verify = async (event) => {
    event.preventDefault();
    if (!factor?.id || !/^\d{6,8}$/.test(code.trim())) {
      setError('Enter the current 6–8 digit code from your authenticator app.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      if (step === 'enroll') {
        const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id });
        if (challengeError) throw challengeError;
        const { error: verifyError } = await supabase.auth.mfa.verify({
          factorId: factor.id,
          challengeId: challenge.id,
          code: code.trim()
        });
        if (verifyError) throw verifyError;
      } else {
        const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
          factorId: factor.id,
          code: code.trim()
        });
        if (verifyError) throw verifyError;
      }

      const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) throw assuranceError;
      if (assurance?.currentLevel !== 'aal2' || !isRecentTotpMethod(assurance.currentAuthenticationMethods || [])) {
        throw new Error('Supabase did not confirm a recent AAL2 authenticator verification. Attendance was not started.');
      }

      setStep('verified');
      await onVerified?.();
    } catch (err) {
      setError(err.message || 'The authenticator code could not be verified.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" role="presentation">
      <div className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-950 shadow-2xl overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="founder-attendance-verify-title">
        <div className="flex items-center justify-between p-5 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-300">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 id="founder-attendance-verify-title" className="text-sm font-bold text-white">Verify Founder identity</h2>
              <p className="text-[11px] text-neutral-400">Required before opening attendance</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800" aria-label="Close verification">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="p-3 rounded-xl border border-amber-800/50 bg-amber-950/20 text-[11px] leading-relaxed text-amber-100/90">
            This step uses your enrolled Supabase authenticator (TOTP MFA). It is a secure second-factor check, not Face ID or facial recognition. Device biometrics are not guaranteed by this method.
          </div>

          {initializing || step === 'loading' ? (
            <div className="py-8 text-center text-xs text-neutral-400">Preparing secure verification…</div>
          ) : step === 'verified' ? (
            <div className="flex items-center gap-2 text-sm text-emerald-300">
              <CheckCircle2 className="w-5 h-5" /> Founder identity verified for this action.
            </div>
          ) : (
            <>
              {step === 'enroll' && enrollment?.totp?.qr_code && (
                <div className="space-y-3 text-center">
                  <p className="text-xs text-neutral-300">Scan this QR code with your authenticator app, then enter the generated code.</p>
                  <div className="inline-flex p-3 rounded-xl bg-white">
                    <img src={enrollment.totp.qr_code} alt="Authenticator enrollment QR code" className="w-44 h-44" />
                  </div>
                  <p className="text-[10px] text-neutral-500">Keep your authenticator secret private. Do not share a screenshot of this QR code.</p>
                </div>
              )}

              {step === 'verify' && (
                <p className="text-xs text-neutral-300">Enter the current code from your enrolled authenticator app.</p>
              )}

              <form onSubmit={verify} className="space-y-3">
                <label className="block text-xs font-medium text-neutral-300" htmlFor="founder-totp-code">Authenticator code</label>
                <input
                  id="founder-totp-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6,8}"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="Enter code"
                  className="w-full px-3 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-center text-lg tracking-[0.35em] font-mono text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button type="submit" disabled={loading || !/^\d{6,8}$/.test(code)} className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-bold transition">
                  {loading ? 'Verifying…' : step === 'enroll' ? 'Verify and enable authenticator' : 'Verify Founder'}
                </button>
              </form>
            </>
          )}

          {error && (
            <div className="p-3 rounded-xl border border-rose-800 bg-rose-950/30 flex items-start gap-2 text-xs text-rose-200">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FounderAttendanceVerificationModal;
