import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Fingerprint, ShieldCheck, Smartphone, X } from 'lucide-react';
import { supabase } from '../../api/supabase';

const recentFactorMethod = (methods = []) => {
  const now = Math.floor(Date.now() / 1000);
  const recent = methods.find((item) => {
    const method = String(item?.method || '').toLowerCase();
    const timestamp = Number(item?.timestamp);
    return ['webauthn', 'totp'].includes(method)
      && Number.isFinite(timestamp)
      && timestamp <= now
      && now - timestamp <= 300;
  });
  return recent ? String(recent.method).toLowerCase() : null;
};

const webAuthnAvailable = () => Boolean(
  typeof window !== 'undefined'
  && window.isSecureContext
  && typeof window.PublicKeyCredential !== 'undefined'
  && navigator.credentials
);

const getWebAuthnOptions = () => ({
  rpId: window.location.hostname,
  rpOrigins: [window.location.origin]
});

export const FounderAttendanceVerificationModal = ({ isOpen, onClose, onVerified }) => {
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [factor, setFactor] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState('loading');
  const [webAuthnReady, setWebAuthnReady] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;

    const initialize = async () => {
      setInitializing(true);
      setError('');
      setCode('');
      setEnrollment(null);
      setFactor(null);
      setStep('loading');
      setWebAuthnReady(webAuthnAvailable());

      try {
        if (!supabase) throw new Error('Supabase authentication is not configured.');

        const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assuranceError) throw assuranceError;
        const currentMethod = recentFactorMethod(assurance?.currentAuthenticationMethods || []);
        if (assurance?.currentLevel === 'aal2' && currentMethod) {
          if (!cancelled) {
            setStep('verified');
            await onVerified?.(currentMethod);
          }
          return;
        }

        const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
        if (factorsError) throw factorsError;
        const allFactors = factorsData?.all || [];
        const verifiedWebAuthn = allFactors.find((item) =>
          (item.factor_type === 'webauthn' || item.type === 'webauthn') && item.status === 'verified'
        );
        const verifiedTotp = allFactors.find((item) =>
          (item.factor_type === 'totp' || item.type === 'totp') && item.status === 'verified'
        );

        if (!cancelled) {
          if (webAuthnAvailable() && verifiedWebAuthn) {
            setFactor(verifiedWebAuthn);
            setStep('webauthn-verify');
          } else if (webAuthnAvailable()) {
            setStep('webauthn-register');
          } else if (verifiedTotp) {
            setFactor(verifiedTotp);
            setStep('totp-verify');
          } else {
            setStep('choose-totp');
          }
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

  const confirmRecentMfaAndStart = async (expectedMethod) => {
    const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError) throw assuranceError;

    const method = recentFactorMethod(assurance?.currentAuthenticationMethods || []);
    if (assurance?.currentLevel !== 'aal2' || !method || (expectedMethod && method !== expectedMethod)) {
      throw new Error('Supabase did not confirm a recent AAL2 verification. Attendance was not started.');
    }

    setStep('verified');
    await onVerified?.(method);
  };

  const registerDeviceAuthenticator = async () => {
    if (!webAuthnAvailable()) {
      setError('This browser or device does not support WebAuthn. Use the authenticator-app fallback.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { error: registerError } = await supabase.auth.mfa.webauthn.register({
        friendlyName: 'TeamSync Founder device authenticator',
        webauthn: getWebAuthnOptions()
      }, {
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'preferred',
          userVerification: 'required'
        }
      });

      if (registerError) throw registerError;
      await confirmRecentMfaAndStart('webauthn');
    } catch (err) {
      setError(err.message || 'Device verification could not be completed. You can use the authenticator-app fallback.');
    } finally {
      setLoading(false);
    }
  };

  const verifyDeviceAuthenticator = async () => {
    if (!factor?.id) {
      setError('No verified device authenticator is registered. Set one up or use the authenticator-app fallback.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { error: authenticateError } = await supabase.auth.mfa.webauthn.authenticate({
        factorId: factor.id,
        webauthn: getWebAuthnOptions()
      }, {
        userVerification: 'required'
      });

      if (authenticateError) throw authenticateError;
      await confirmRecentMfaAndStart('webauthn');
    } catch (err) {
      setError(err.message || 'Device verification could not be completed.');
    } finally {
      setLoading(false);
    }
  };

  const beginTotpFallback = async () => {
    setLoading(true);
    setError('');
    setCode('');
    try {
      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;
      const verifiedTotp = (factorsData?.all || []).find((item) =>
        (item.factor_type === 'totp' || item.type === 'totp') && item.status === 'verified'
      );

      if (verifiedTotp) {
        setFactor(verifiedTotp);
        setStep('totp-verify');
        return;
      }

      const pendingTotp = (factorsData?.all || []).find((item) =>
        (item.factor_type === 'totp' || item.type === 'totp') && item.status !== 'verified'
      );
      if (pendingTotp?.id) {
        const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: pendingTotp.id });
        if (removeError) throw removeError;
      }

      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'TeamSync Founder attendance fallback'
      });
      if (enrollError) throw enrollError;
      if (!enrolled?.id || !enrolled?.totp?.qr_code) {
        throw new Error('Supabase did not return a TOTP enrollment QR code.');
      }

      setEnrollment(enrolled);
      setFactor({ id: enrolled.id, factor_type: 'totp', status: 'unverified' });
      setStep('totp-enroll');
    } catch (err) {
      setError(err.message || 'Unable to set up authenticator-app fallback.');
    } finally {
      setLoading(false);
    }
  };

  const verifyTotp = async (event) => {
    event.preventDefault();
    if (!factor?.id || !/^\d{6,8}$/.test(code.trim())) {
      setError('Enter the current 6–8 digit code from your authenticator app.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      if (step === 'totp-enroll') {
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

      await confirmRecentMfaAndStart('totp');
    } catch (err) {
      setError(err.message || 'The authenticator code could not be verified.');
    } finally {
      setLoading(false);
    }
  };

  const qrSrc = enrollment?.totp?.qr_code
    ? `data:image/svg+xml;utf8,${encodeURIComponent(enrollment.totp.qr_code)}`
    : '';

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
            Founder verification prefers your device authenticator (Face ID, Touch ID, Windows Hello, or the device method configured for your passkey). If your device does not support it, use the authenticator-app fallback.
          </div>

          {initializing || step === 'loading' ? (
            <div className="py-8 text-center text-xs text-neutral-400">Preparing secure verification…</div>
          ) : step === 'verified' ? (
            <div className="flex items-center gap-2 text-sm text-emerald-300">
              <CheckCircle2 className="w-5 h-5" /> Founder identity verified for this action.
            </div>
          ) : step === 'webauthn-register' ? (
            <div className="space-y-3">
              <div className="text-center space-y-2">
                <Fingerprint className="w-10 h-10 mx-auto text-amber-300" />
                <p className="text-sm font-semibold text-white">Set up device biometric verification</p>
                <p className="text-xs leading-relaxed text-neutral-400">Your browser will open the device's secure passkey prompt. The device may ask for Face ID, Touch ID, Windows Hello, or another platform verification method.</p>
              </div>
              <button type="button" onClick={registerDeviceAuthenticator} disabled={loading} className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-bold">
                {loading ? 'Waiting for device…' : 'Set up device verification'}
              </button>
              <button type="button" onClick={beginTotpFallback} disabled={loading} className="w-full py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-200 text-xs font-semibold">
                Use authenticator app instead
              </button>
            </div>
          ) : step === 'webauthn-verify' ? (
            <div className="space-y-3">
              <div className="text-center space-y-2">
                <Fingerprint className="w-10 h-10 mx-auto text-amber-300" />
                <p className="text-sm font-semibold text-white">Verify with your device</p>
                <p className="text-xs leading-relaxed text-neutral-400">Approve the secure passkey prompt using the device verification method you enrolled.</p>
              </div>
              <button type="button" onClick={verifyDeviceAuthenticator} disabled={loading} className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-bold">
                {loading ? 'Waiting for device…' : 'Verify with device'}
              </button>
              <button type="button" onClick={beginTotpFallback} disabled={loading} className="w-full py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-200 text-xs font-semibold">
                Use authenticator app instead
              </button>
            </div>
          ) : step === 'choose-totp' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-neutral-300">
                <Smartphone className="w-4 h-4 text-neutral-400" />
                Device passkey verification is unavailable or not configured in this browser.
              </div>
              <button type="button" onClick={beginTotpFallback} disabled={loading} className="w-full py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white text-xs font-semibold">
                {loading ? 'Preparing…' : 'Use authenticator app instead'}
              </button>
            </div>
          ) : step === 'totp-enroll' || step === 'totp-verify' ? (
            <div className="space-y-3">
              {step === 'totp-enroll' && qrSrc && (
                <div className="space-y-3 text-center">
                  <p className="text-xs text-neutral-300">Scan this QR code with your authenticator app, then enter its current code.</p>
                  <div className="inline-flex p-3 rounded-xl bg-white">
                    <img src={qrSrc} alt="Authenticator enrollment QR code" className="w-44 h-44" />
                  </div>
                  <p className="text-[10px] text-neutral-500">Keep the QR code and secret private.</p>
                </div>
              )}
              {step === 'totp-verify' && (
                <p className="text-xs text-neutral-300">Enter the current code from your enrolled authenticator app.</p>
              )}
              <form onSubmit={verifyTotp} className="space-y-3">
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
                  {loading ? 'Verifying…' : step === 'totp-enroll' ? 'Verify and enable authenticator' : 'Verify Founder'}
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-3 text-xs text-neutral-300">
              <p>Unable to initialize device verification. You can still use the authenticator-app fallback.</p>
              <button type="button" onClick={beginTotpFallback} disabled={loading} className="w-full py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white text-xs font-semibold">
                Use authenticator app instead
              </button>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl border border-rose-800 bg-rose-950/30 flex items-start gap-2 text-xs text-rose-200">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {webAuthnReady && ['webauthn-register', 'webauthn-verify'].includes(step) && (
            <p className="text-[10px] text-neutral-500">WebAuthn MFA must be enabled in Supabase Auth for the TeamSync production domain before this device prompt can succeed.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default FounderAttendanceVerificationModal;
