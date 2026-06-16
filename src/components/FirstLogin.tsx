import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ShieldAlert, KeyRound, ArrowRight } from 'lucide-react';

interface FirstLoginProps {
  token: string;
  user: any;
  onPasswordChanged: (updatedUser: any) => void;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onLogout: () => void;
}

export default function FirstLogin({ token, user, onPasswordChanged, showToast, onLogout }: FirstLoginProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [showNewPass, setShowNewPass] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) {
      setErrorMsg('All fields are required.');
      return;
    }

    if (newPassword.length < 6) {
      setErrorMsg('New password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('New passwords do not match.');
      return;
    }

    setErrorMsg('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ oldPassword: '123456', newPassword })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update password');
      }

      showToast('Password changed successfully! Welcome to the portal.', 'success');
      
      // Update local state to clear is_first_login
      const updatedUser = { ...user, is_first_login: false };
      onPasswordChanged(updatedUser);
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during password change.');
      showToast(err.message || 'Password update failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-slate-100 bg-white p-8 shadow-sm">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500 text-white">
            <KeyRound className="h-6 w-6" />
          </div>
          <h2 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900">
            First Time Password Change
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            For security reasons, newly registered employees are required to change their temporary password before gaining access.
          </p>
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            <ShieldAlert className="h-5 w-5 shrink-0 text-red-500" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                New Password
              </label>
              <div className="relative mt-1">
                <input
                  type={showNewPass ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 px-4 pr-12 text-slate-900 focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600 sm:text-sm"
                  placeholder="At least 6 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPass(!showNewPass)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                >
                  {showNewPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Confirm New Password
              </label>
              <div className="relative mt-1">
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 px-4 text-slate-900 focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600 sm:text-sm"
                  placeholder="Confirm new password"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 disabled:opacity-50"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <span>Change Password</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="block w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
            >
              Back to Login Screen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
