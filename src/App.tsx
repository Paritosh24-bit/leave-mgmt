import React, { useState, useEffect } from 'react';
import { Shield, Sparkles, Building2, BellRing, Info, ShieldCheck, HelpCircle } from 'lucide-react';
import Login from './components/Login';
import FirstLogin from './components/FirstLogin';
import EmployeeDashboard from './components/EmployeeDashboard';
import AdminDashboard from './components/AdminDashboard';

// Type definitions for local state
interface ActiveUser {
  id: string;
  employee_id: string;
  full_name: string;
  email: string;
  role: 'Admin' | 'Employee';
  is_first_login: boolean;
  department?: string;
  designation: string;
}

interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('hrms_token'));
  const [user, setUser] = useState<ActiveUser | null>(() => {
    const cached = localStorage.getItem('hrms_user');
    return cached ? JSON.parse(cached) : null;
  });

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Function to show elegant toast notifications
  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const handleLoginSuccess = (newToken: string, loggedUser: ActiveUser) => {
    setToken(newToken);
    setUser(loggedUser);
    localStorage.setItem('hrms_token', newToken);
    localStorage.setItem('hrms_user', JSON.stringify(loggedUser));
  };

  const handlePasswordChanged = (updatedUser: ActiveUser) => {
    setUser(updatedUser);
    localStorage.setItem('hrms_user', JSON.stringify(updatedUser));
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('hrms_token');
    localStorage.removeItem('hrms_user');
    showToast('Signed out successfully. Have a safe day!', 'info');
  };

  // Keep session alive or fetch fresh info if cached token exists
  useEffect(() => {
    if (token) {
      fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => {
        if (!res.ok) {
          throw new Error('Session validation failed');
        }
        return res.json();
      })
      .then(data => {
        // Refresh local details
        setUser(data);
        localStorage.setItem('hrms_user', JSON.stringify(data));
      })
      .catch(() => {
        // Token might have expired, clear it
        setToken(null);
        setUser(null);
        localStorage.removeItem('hrms_token');
        localStorage.removeItem('hrms_user');
      });
    }
  }, [token]);

  // Routing Selection logic
  const renderCoreView = () => {
    if (!token || !user) {
      return <Login onLoginSuccess={handleLoginSuccess} showToast={showToast} />;
    }

    if (user.is_first_login) {
      return (
        <FirstLogin 
          token={token} 
          user={user} 
          onPasswordChanged={handlePasswordChanged} 
          showToast={showToast} 
          onLogout={handleLogout} 
        />
      );
    }

    if (user.role === 'Admin') {
      return (
        <AdminDashboard 
          token={token} 
          user={user} 
          showToast={showToast} 
          onLogout={handleLogout} 
        />
      );
    }

    // Role is standard Employee
    return (
      <EmployeeDashboard 
        token={token} 
        user={user} 
        showToast={showToast} 
        onLogout={handleLogout} 
      />
    );
  };

  return (
    <div className="relative min-h-screen font-sans antialiased select-none selection:bg-indigo-600 selection:text-white">
      {/* RENDER THE ACTIVE PORTAL SCREEN */}
      {renderCoreView()}

      {/* RENDER TOAST ALERTS OVERLAY */}
      <div id="toast-overlay" className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => {
          const isSuccess = t.type === 'success';
          const isError = t.type === 'error';
          const isWarning = t.type === 'warning';
          
          return (
            <div
              id={`toast-${t.id}`}
              key={t.id}
              className={`pointer-events-auto flex items-start gap-3 rounded-xl p-4 shadow-lg text-xs font-semibold select-text border transition-all duration-300 animate-slide-in text-slate-900 ${
                isSuccess ? 'bg-emerald-50 border-emerald-200' :
                isError ? 'bg-red-50 border-red-205' :
                isWarning ? 'bg-amber-50 border-amber-200' :
                'bg-blue-50 border-blue-200'
              }`}
            >
              <div className="mt-0.5">
                {isSuccess && <ShieldCheck className="h-4 w-4 text-emerald-600" />}
                {isError && <Shield className="h-4 w-4 text-red-600" />}
                {isWarning && <Info className="h-4 w-4 text-amber-600" />}
                {t.type === 'info' && <HelpCircle className="h-4 w-4 text-blue-600" />}
              </div>
              <p className="flex-1 text-left leading-relaxed">{t.message}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
