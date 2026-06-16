import React, { useState, useEffect } from 'react';
import { Lock, Mail, Building, ShieldAlert, RefreshCw, KeyRound, ArrowLeft } from 'lucide-react';
import Logo from './Logo';

interface LoginProps {
  onLoginSuccess: (token: string, user: any) => void;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export default function Login({ onLoginSuccess, showToast }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [dbStatus, setDbStatus] = useState<{ useSupabase: boolean; status: string; errorMessage: string; tableName: string; supabaseUrl?: string } | null>(null);
  const [retrying, setRetrying] = useState(false);

  // Forgot Password / Reset Password states
  const [authMode, setAuthMode] = useState<'login' | 'forgot' | 'reset'>('login');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [resetOtp, setResetOtp] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  // Supabase Configuration Modal States
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [inputUrl, setInputUrl] = useState('');
  const [inputKey, setInputKey] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [configError, setConfigError] = useState('');

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) {
      setErrorMsg('Please enter your email address.');
      return;
    }
    setErrorMsg('');
    setForgotLoading(true);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to request password reset code.');
      }

      showToast(data.message || 'OTP verification code sent successfully!', 'success');
      // Autofill email and switch
      setAuthMode('reset');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error executing OTP request.');
      showToast(err.message || 'OTP request failed', 'error');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail || !resetOtp || !resetPassword || !resetPasswordConfirm) {
      setErrorMsg('Please fill out all reset password fields.');
      return;
    }
    if (resetPassword !== resetPasswordConfirm) {
      setErrorMsg('Passwords do not match. Please verify.');
      return;
    }
    if (resetPassword.length < 6) {
      setErrorMsg('New password must be at least 6 characters long.');
      return;
    }
    setErrorMsg('');
    setResetLoading(true);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: forgotEmail,
          otpCode: resetOtp,
          newPassword: resetPassword
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to complete password reset.');
      }

      showToast(data.message || 'Password successfully updated!', 'success');
      setResetOtp('');
      setResetPassword('');
      setResetPasswordConfirm('');
      setEmail(forgotEmail); // Autofill email on standard sign-in!
      setAuthMode('login');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error updating password.');
      showToast(err.message || 'Password reset failed', 'error');
    } finally {
      setResetLoading(false);
    }
  };

  useEffect(() => {
    fetch('/api/db/status')
      .then(res => res.json())
      .then(data => setDbStatus(data))
      .catch(err => console.error('Error fetching database status:', err));
  }, []);

  const handleRetryConnection = async () => {
    setRetrying(true);
    try {
      const response = await fetch('/api/db/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      setDbStatus(data);
      if (data.status === 'connected') {
        showToast('Successfully connected to Supabase database!', 'success');
      } else {
        showToast('Connection attempt completed. Database or schema cache not loaded yet.', 'warning');
      }
    } catch (err: any) {
      console.error(err);
      showToast('Error retrying connection: ' + (err.message || err), 'error');
    } finally {
      setRetrying(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigError('');
    setSavingConfig(true);

    try {
      const response = await fetch('/api/db/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supabaseUrl: inputUrl,
          supabaseAnonKey: inputKey
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update database configuration.');
      }

      showToast(data.message || 'Supabase connected and credentials synchronized!', 'success');
      setDbStatus(data.status);
      setShowConfigModal(false);
    } catch (err: any) {
      console.error(err);
      setConfigError(err.message || 'Could not verify database credentials.');
      showToast(err.message || 'Database configuration error', 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }
    setErrorMsg('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Your custom deployment is currently only serving front-end static files (the server returned HTML instead of API JSON). To resolve this, start your backend server by running "npm run build" and then "npm run start" on your hosting server, instead of deploying only the static "dist" folder to a static host.');
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed. Please check your credentials.');
      }

      showToast(`Welcome back, ${data.user.full_name}!`, 'success');
      onLoginSuccess(data.token, data.user);
    } catch (err: any) {
      setErrorMsg(err.message || 'Server error occurred');
      showToast(err.message || 'Could not sign in', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-slate-100 bg-white p-8 shadow-sm">
        <div className="text-center flex flex-col items-center">
          <Logo size="md" className="mx-auto" />
          <h2 className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-600">
            Employee Leave Management Portal
          </h2>

          {dbStatus && (
            <div className="mt-3 flex flex-col items-center">
              {dbStatus.useSupabase ? (
                dbStatus.status === 'connected' ? (
                  <div className="text-center">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 border border-emerald-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      Connected to Supabase (Persistent)
                    </span>
                  </div>
                ) : (
                  <div className="text-center max-w-sm space-y-1">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-800 border border-rose-200 animate-pulse">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
                      Supabase Connection Offline
                    </span>
                    <p className="text-[10px] text-rose-600 font-medium">
                      {dbStatus.errorMessage}
                    </p>
                    {dbStatus.errorMessage && (
                      <div className="mt-2 text-left space-y-2">
                        <p className="text-[9px] text-slate-500 font-medium">To fix, copy & run this script in your Supabase SQL Editor:</p>
                        <div className="bg-slate-50 p-2 rounded border border-slate-200 font-mono text-[9px] text-slate-600 select-all whitespace-pre">
{`CREATE TABLE IF NOT EXISTS hrms_persistent_db (
  id INT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Disable Row Level Security (RLS) for simple setup
ALTER TABLE hrms_persistent_db DISABLE ROW LEVEL SECURITY;

-- Seed the initial row
INSERT INTO hrms_persistent_db (id, data) 
VALUES (1, '{}'::jsonb) 
ON CONFLICT (id) DO NOTHING;`}
                        </div>
                        <button
                          type="button"
                          onClick={handleRetryConnection}
                          disabled={retrying}
                          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition duration-150 disabled:opacity-50 shadow-sm cursor-pointer"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
                          {retrying ? 'Connecting to Supabase...' : "I've run the SQL - Test Connection Again"}
                        </button>
                      </div>
                    )}
                  </div>
                )
              ) : (
                <div className="text-center space-y-1">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 border border-slate-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                    Using Temporary Local JSON
                  </span>
                  <p className="text-[10px] text-slate-400 max-w-xs leading-relaxed mx-auto">
                    Configured via the backend system environment variables.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            <ShieldAlert className="h-5 w-5 shrink-0 text-red-500" />
            <span>{errorMsg}</span>
          </div>
        )}

        {authMode === 'login' && (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label htmlFor="email-address" className="block text-xs font-medium uppercase tracking-wider text-slate-600">
                  Email Address
                </label>
                <div className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Mail className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    id="email-address"
                    name="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-3 text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600 sm:text-sm"
                    placeholder="name@company.com"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="block text-xs font-medium uppercase tracking-wider text-slate-600">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotEmail(email);
                      setErrorMsg('');
                      setAuthMode('forgot');
                    }}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-505 hover:underline cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Lock className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-3 text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600 sm:text-sm"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </div>

            <div>
              <button
                id="login-btn"
                type="submit"
                disabled={loading}
                className="flex w-full justify-center rounded-xl bg-slate-900 py-3 text-sm font-medium text-white shadow-sm hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  'Sign In to Dashboard'
                )}
              </button>
            </div>
          </form>
        )}

        {authMode === 'forgot' && (
          <form className="mt-8 space-y-6" onSubmit={handleRequestOtp}>
            <div className="space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                Enter your registered HR Portal email. We will search for your account and send you a secure 6-digit verification code.
              </p>
              <div>
                <label htmlFor="forgot-email-address" className="block text-xs font-medium uppercase tracking-wider text-slate-600">
                  Work Email Address
                </label>
                <div className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Mail className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    id="forgot-email-address"
                    name="forgotEmail"
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-3 text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600 sm:text-sm"
                    placeholder="name@company.com"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                id="forgot-submit-btn"
                type="submit"
                disabled={forgotLoading}
                className="flex w-full justify-center rounded-xl bg-indigo-600 py-3 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 disabled:opacity-50 cursor-pointer"
              >
                {forgotLoading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  'Send Verification OTP Code'
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setErrorMsg('');
                  setAuthMode('login');
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-sm"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Sign In
              </button>
            </div>
          </form>
        )}

        {authMode === 'reset' && (
          <form className="mt-8 space-y-6" onSubmit={handleResetPassword}>
            <div className="space-y-4">
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 leading-relaxed text-xs text-indigo-800">
                A 6-digit password reset OTP has been sent to <strong>{forgotEmail}</strong>. Please check your spam folder if it doesn't arrive within 1 minute.
              </div>

              <div>
                <label htmlFor="reset-otp" className="block text-xs font-medium uppercase tracking-wider text-slate-600">
                  6-Digit Verification OTP
                </label>
                <div className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <KeyRound className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    id="reset-otp"
                    name="otp"
                    type="text"
                    required
                    maxLength={6}
                    value={resetOtp}
                    onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, ''))}
                    className="block w-full text-center tracking-[0.5em] font-mono rounded-xl border border-slate-200 bg-slate-50/50 py-3 px-3 text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600 sm:text-sm"
                    placeholder="000000"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="reset-pwd" className="block text-xs font-medium uppercase tracking-wider text-slate-600">
                  New Secure Password
                </label>
                <div className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Lock className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    id="reset-pwd"
                    name="newPassword"
                    type="password"
                    required
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    className="block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-3 text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600 sm:text-sm"
                    placeholder="Min. 6 characters"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="reset-pwd-confirm" className="block text-xs font-medium uppercase tracking-wider text-slate-600">
                  Confirm New Password
                </label>
                <div className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Lock className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    id="reset-pwd-confirm"
                    name="confirmPassword"
                    type="password"
                    required
                    value={resetPasswordConfirm}
                    onChange={(e) => setResetPasswordConfirm(e.target.value)}
                    className="block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-3 text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600 sm:text-sm"
                    placeholder="Confirm password"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                id="reset-submit-btn"
                type="submit"
                disabled={resetLoading}
                className="flex w-full justify-center rounded-xl bg-emerald-600 py-3 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 disabled:opacity-50 cursor-pointer text-xs font-bold"
              >
                {resetLoading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  'Reset Password & Return'
                )}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg('');
                    setAuthMode('forgot');
                  }}
                  className="flex-1 text-center font-semibold text-xs text-indigo-600 hover:text-indigo-500 py-2 border border-indigo-150 rounded-xl hover:bg-indigo-50/30 transition cursor-pointer"
                >
                  Resend Code
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg('');
                    setAuthMode('login');
                  }}
                  className="flex-1 text-center font-semibold text-xs text-slate-600 hover:text-slate-550 py-2 border border-slate-200 rounded-xl hover:bg-slate-50/50 transition cursor-pointer"
                >
                  Back to Sign In
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
