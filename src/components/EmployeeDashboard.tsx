import React, { useState, useEffect, useRef } from 'react';
import { 
  User, Calendar, Clock, Bell, Settings, LogOut, CheckCircle2, 
  XCircle, AlertCircle, RefreshCw, Send, ListCollapse, BookOpenCheck,
  Building, Award, ShieldAlert, BadgeCheck, HelpCircle, UserCheck
} from 'lucide-react';
import { LeaveRequest, Holiday, Attendance, Notification, Employee } from '../types';
import Logo from './Logo';

interface EmployeeDashboardProps {
  token: string;
  user: any;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onLogout: () => void;
}

export default function EmployeeDashboard({ token, user, showToast, onLogout }: EmployeeDashboardProps) {
  // Tabs: 'dashboard' | 'apply_leave' | 'profile' | 'holidays'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'apply_leave' | 'profile' | 'holidays'>('dashboard');
  
  // Data State
  const [profile, setProfile] = useState<Employee | null>(null);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  // Leave Form State
  const [leaveType, setLeaveType] = useState<string>('Casual Leave');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [leaveReason, setLeaveReason] = useState('');
  const [calculatingBreakdown, setCalculatingBreakdown] = useState(false);
  const [leaveBreakdown, setLeaveBreakdown] = useState<any>(null);
  const [submittingLeave, setSubmittingLeave] = useState(false);

  // Profile Edit State
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editJoinDate, setEditJoinDate] = useState('');
  const [updatingProfile, setUpdatingProfile] = useState(false);

  // Profile Verification States
  const [aadharNumber, setAadharNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [tempAddress, setTempAddress] = useState('');
  const [permAddress, setPermAddress] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfscCode, setBankIfscCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [aadharProof, setAadharProof] = useState<string | null>(null);
  const [panProof, setPanProof] = useState<string | null>(null);
  const [bankProof, setBankProof] = useState<string | null>(null);

  // Selected file names for visual feedback
  const [aadharFileName, setAadharFileName] = useState('');
  const [panFileName, setPanFileName] = useState('');
  const [bankFileName, setBankFileName] = useState('');

  // Attendance Clock State
  const [currentTime, setCurrentTime] = useState(new Date());
  const [todayAttendance, setTodayAttendance] = useState<Attendance | null>(null);
  const [clocking, setClocking] = useState(false);

  // Helper inside component to check if mandatory profile verification is done
  const isSetupComplete = (p: Employee | null): boolean => {
    if (!p) return false;
    return !!(
      p.aadhar_number &&
      p.pan_number &&
      p.temp_address &&
      p.perm_address &&
      p.blood_group &&
      p.emergency_contact &&
      p.bank_account_number &&
      p.bank_ifsc_code &&
      p.bank_name &&
      p.aadhar_proof &&
      p.pan_proof &&
      p.bank_proof
    );
  };

  // Convert uploaded image file or pdf proof to Base64 dataURL
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'aadhar' | 'pan' | 'bank') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('File is too large. Please upload an image smaller than 5MB.', 'error');
      return;
    }

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
      });

      if (type === 'aadhar') {
        setAadharProof(base64);
        setAadharFileName(file.name);
        showToast('Aadhar proof uploaded successfully.', 'success');
      } else if (type === 'pan') {
        setPanProof(base64);
        setPanFileName(file.name);
        showToast('PAN proof uploaded successfully.', 'success');
      } else if (type === 'bank') {
        setBankProof(base64);
        setBankFileName(file.name);
        showToast('Bank proof uploaded successfully.', 'success');
      }
    } catch (err) {
      showToast('Failed to parse uploaded document.', 'error');
    }
  };

  // Fetch initial employee stats
  const fetchData = async () => {
    try {
      setLoading(true);
      
      const fetchOpts = {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      };

      // Concurrent fetch
      const [pRes, lRes, hRes, aRes, nRes] = await Promise.all([
        fetch('/api/auth/me', fetchOpts),
        fetch('/api/leaves', fetchOpts),
        fetch('/api/holidays', fetchOpts), // public
        fetch('/api/attendance', fetchOpts),
        fetch('/api/notifications', fetchOpts)
      ]);

      if (!pRes.ok) throw new Error('Session expired or error fetching profile');
      
      const pData = await pRes.json();
      const lData = await lRes.json();
      const hData = await hRes.json();
      const aData = await aRes.json();
      const nData = await nRes.json();

      setProfile(pData);
      setEditName(pData.full_name);
      setEditEmail(pData.email);
      setEditJoinDate(pData.joining_date || '');

      // Load existing compliance fields if present
      setAadharNumber(pData.aadhar_number || '');
      setPanNumber(pData.pan_number || '');
      setTempAddress(pData.temp_address || '');
      setPermAddress(pData.perm_address || '');
      setBloodGroup(pData.blood_group || '');
      setEmergencyContact(pData.emergency_contact || '');
      setBankAccountNumber(pData.bank_account_number || '');
      setBankIfscCode(pData.bank_ifsc_code || '');
      setBankName(pData.bank_name || '');
      setBankBranch(pData.bank_branch || '');
      setAadharProof(pData.aadhar_proof || null);
      setPanProof(pData.pan_proof || null);
      setBankProof(pData.bank_proof || null);

      if (pData.aadhar_proof) setAadharFileName('Stored in Cloud (Click/Select to update)');
      if (pData.pan_proof) setPanFileName('Stored in Cloud (Click/Select to update)');
      if (pData.bank_proof) setBankFileName('Stored in Cloud (Click/Select to update)');

      // Sort leaves by applied date descending
      setLeaves((lData as LeaveRequest[]).sort((a,b) => b.applied_date.localeCompare(a.applied_date)));
      setHolidays(hData);
      setAttendance(aData);
      setNotifications(nData);

      // Find today's attendance record
      const todayStr = new Date().toISOString().split('T')[0];
      const todayRecord = (aData as Attendance[]).find(a => a.attendance_date === todayStr);
      setTodayAttendance(todayRecord || null);

      // Force view profile and direct them to fill if setup is not complete!
      const isComplete = !!(
        pData.aadhar_number &&
        pData.pan_number &&
        pData.temp_address &&
        pData.perm_address &&
        pData.blood_group &&
        pData.emergency_contact &&
        pData.bank_account_number &&
        pData.bank_ifsc_code &&
        pData.bank_name &&
        pData.aadhar_proof &&
        pData.pan_proof &&
        pData.bank_proof
      );
      if (!isComplete) {
        setActiveTab('profile');
      }

    } catch (err: any) {
      showToast(err.message || 'Error syncing dashboard data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Live Clock timer
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Recalculate sandwich leave breakdown anytime dates, half-day mode, or leave types change
  useEffect(() => {
    if (startDate && (isHalfDay || endDate)) {
      const calcBreakdown = async () => {
        setCalculatingBreakdown(true);
        try {
          const res = await fetch('/api/leaves/calculate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ 
              startDate, 
              endDate: isHalfDay ? startDate : endDate, 
              employeeId: user.id,
              is_half_day: isHalfDay
            })
          });
          if (res.ok) {
            const data = await res.json();
            setLeaveBreakdown(data);
          }
        } catch (e) {
          console.error(e);
        } finally {
          setCalculatingBreakdown(false);
        }
      };
      
      calcBreakdown();
    } else {
      setLeaveBreakdown(null);
    }
  }, [startDate, endDate, leaveType, isHalfDay]);

  // Handle Handing Check-In
  const handleCheckIn = async () => {
    setClocking(true);
    try {
      const res = await fetch('/api/attendance/check-in', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Check-in failed');
      
      setTodayAttendance(data.record);
      // Update attendance list
      await fetchData();
      showToast('Checked in successfully! Have a great working day.', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setClocking(false);
    }
  };

  // Handle Handing Check-Out
  const handleCheckOut = async () => {
    setClocking(true);
    try {
      const res = await fetch('/api/attendance/check-out', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Check-out failed');
      
      setTodayAttendance(data.record);
      await fetchData();
      showToast('Checked out successfully! Good work today.', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setClocking(false);
    }
  };

  // Handle Applying For Leave
  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || (!isHalfDay && !endDate) || !leaveReason) {
      showToast('All fields are required to submit leave application.', 'warning');
      return;
    }

    if (!isSetupComplete(profile)) {
      showToast('COMPULSORY REQUIREMENT: You must complete your Profile Verification before applying for leave.', 'error');
      setActiveTab('profile');
      return;
    }

    setSubmittingLeave(true);
    try {
      const res = await fetch('/api/leaves', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          leave_type: leaveType,
          start_date: startDate,
          end_date: isHalfDay ? startDate : endDate,
          reason: leaveReason,
          is_half_day: isHalfDay
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit leave application.');
      }

      showToast('Leave request submitted successfully!', 'success');
      // Reset form
      setStartDate('');
      setEndDate('');
      setIsHalfDay(false);
      setLeaveReason('');
      setLeaveBreakdown(null);
      // Refresh
      await fetchData();
      setActiveTab('dashboard');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSubmittingLeave(false);
    }
  };

  // Handle Profile Update
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName || !editEmail) {
      showToast('Name and Email are required.', 'warning');
      return;
    }

    // STRICT LEVEL CHECK for compulsory verification fields
    if (
      !aadharNumber.trim() || 
      !panNumber.trim() || 
      !tempAddress.trim() || 
      !permAddress.trim() || 
      !bloodGroup.trim() || 
      !emergencyContact.trim() || 
      !bankAccountNumber.trim() || 
      !bankIfscCode.trim() || 
      !bankName.trim()
    ) {
      showToast('ALL VERIFICATION FIELDS ARE COMPULSORY under organization policies.', 'error');
      return;
    }

    if (!aadharProof || !panProof || !bankProof) {
      showToast('Please upload Aadhar Card, PAN Card, and Bank Proof document copies.', 'error');
      return;
    }

    if (aadharNumber.replace(/\s/g, '').length < 12) {
      showToast('Please enter a valid 12-digit Aadhar Card number.', 'error');
      return;
    }

    if (panNumber.trim().length !== 10) {
      showToast('PAN Number must be exactly 10 alphanumeric characters.', 'error');
      return;
    }

    setUpdatingProfile(true);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          full_name: editName, 
          email: editEmail, 
          joining_date: editJoinDate,
          aadhar_number: aadharNumber.trim(),
          pan_number: panNumber.trim().toUpperCase(),
          temp_address: tempAddress.trim(),
          perm_address: permAddress.trim(),
          blood_group: bloodGroup.trim(),
          emergency_contact: emergencyContact.trim(),
          bank_account_number: bankAccountNumber.trim(),
          bank_ifsc_code: bankIfscCode.trim().toUpperCase(),
          bank_name: bankName.trim(),
          bank_branch: bankBranch.trim(),
          aadhar_proof: aadharProof,
          pan_proof: panProof,
          bank_proof: bankProof
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Profile update failed.');

      showToast('Onboarding profile & compliance verified successfully!', 'success');
      await fetchData();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setUpdatingProfile(false);
    }
  };

  const markNotificationAsRead = async (notifId: string) => {
    try {
      const res = await fetch(`/api/notifications/${notifId}/read`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setNotifications(prev =>
          prev.map(n => n.notification_id === notifId ? { ...n, is_read: true } : n)
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (loading && !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center space-y-4">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <p className="text-sm font-medium text-slate-600">Loading your secure Employee Portal...</p>
        </div>
      </div>
    );
  }

  const unreadNotifs = notifications.filter(n => !n.is_read);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-12">
      {/* HEADER RAIL */}
      <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white px-6 shadow-sm">
        <div className="flex items-center gap-4">
          <Logo size="sm" />
          <div className="h-6 w-px bg-slate-200 hidden sm:block" />
          <div className="hidden sm:block">
            <h1 className="text-sm font-bold text-slate-900 leading-tight">Employee Portal</h1>
            <p className="text-[10px] text-teal-700 font-bold tracking-wider uppercase">SyncAI Consultancy Pvt Ltd</p>
          </div>
        </div>

        {/* Action Widgets */}
        <div className="flex items-center gap-4">
          {/* Notifications Dropdown (simplifed for single screen workspace) */}
          <div className="relative group">
            <button className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50">
              <Bell className="h-4 w-4 text-slate-600" />
              {unreadNotifs.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                  {unreadNotifs.length}
                </span>
              )}
            </button>
            
            {/* Simple Floating Dropdown list on Hover */}
            <div className="absolute right-0 mt-2 hidden w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-lg group-hover:block z-50">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-xs font-semibold text-slate-800">Recent Alerts</span>
                {unreadNotifs.length > 0 && <span className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-medium">{unreadNotifs.length} new</span>}
              </div>
              <div className="mt-2 space-y-3 max-h-60 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 py-4">No notifications yet.</p>
                ) : (
                  notifications.map((notif) => (
                    <div 
                      key={notif.notification_id} 
                      className={`text-left p-2 rounded-lg transition-colors ${notif.is_read ? 'bg-slate-50/50' : 'bg-indigo-50/40 border-l-2 border-indigo-500'}`}
                      onMouseEnter={() => !notif.is_read && markNotificationAsRead(notif.notification_id)}
                    >
                      <p className="text-xs font-semibold text-slate-900">{notif.title}</p>
                      <p className="text-[11px] text-slate-600 mt-0.5">{notif.message}</p>
                      <span className="text-[9px] text-slate-400 block mt-1">
                        {new Date(notif.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <button 
            onClick={onLogout}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-red-50 hover:text-red-700 hover:border-red-100 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 pt-8">
        
        {/* EMP WELCOME MAT */}
        <div className="mb-8 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-500/10 to-transparent p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight text-slate-950">Welcome, {profile?.full_name}</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 font-medium">
              <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md border border-slate-200/60 font-mono">{profile?.designation}</span>
              <span className="text-slate-400">•</span>
              <span>Joined {profile?.joining_date ? new Date(profile.joining_date).toLocaleDateString() : 'Not Set'}</span>
            </div>
          </div>

          {/* CLOCK ATTENDANCE WIDGET */}
          <div className="flex items-center gap-4 bg-white border border-slate-200 p-4 rounded-xl shadow-sm self-stretch md:self-auto justify-between">
            <div className="space-y-0.5 text-left">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <Clock className="h-3.5 w-3.5 text-indigo-600 animate-pulse" /> Live Clock
              </div>
              <p className="text-md font-mono font-bold text-slate-900">{currentTime.toLocaleTimeString()}</p>
              <p className="text-[10px] text-slate-400 font-medium">{currentTime.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</p>
            </div>
          </div>
        </div>

        {/* TABS NAVIGATION */}
        <div className="mb-6 flex border-b border-slate-200">
          <button
            onClick={() => {
              if (isSetupComplete(profile)) {
                setActiveTab('dashboard');
              } else {
                showToast('MANDATORY COMPLIANCE: Please complete your Profile Verification first.', 'warning');
                setActiveTab('profile');
              }
            }}
            className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'dashboard' 
                ? 'border-indigo-600 text-indigo-600' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Dashboard Overview
          </button>
          <button
            onClick={() => {
              if (isSetupComplete(profile)) {
                setActiveTab('apply_leave');
              } else {
                showToast('MANDATORY COMPLIANCE: Please complete your Profile Verification first.', 'warning');
                setActiveTab('profile');
              }
            }}
            className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'apply_leave' 
                ? 'border-indigo-600 text-indigo-600' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Apply for Leave
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'profile' 
                ? 'border-indigo-600 text-indigo-600' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Personal Profile Verification
          </button>
          <button
            onClick={() => {
              if (isSetupComplete(profile)) {
                setActiveTab('holidays');
              } else {
                showToast('MANDATORY COMPLIANCE: Please complete your Profile Verification first.', 'warning');
                setActiveTab('profile');
              }
            }}
            className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'holidays' 
                ? 'border-indigo-600 text-indigo-600' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Company Holidays ({holidays.length})
          </button>
        </div>

        {/* RENDER ACTIVE TAB */}

        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-fade-in">
            {/* LEAVE BALANCE GRID */}
            <div>
              <h3 className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Live Leave Balances (10 Paid Leaves limit)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="rounded-xl border border-slate-200 border-l-4 border-l-indigo-500 bg-indigo-50/20 p-5 shadow-sm text-left">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Paid Leaves Remaining</p>
                  <p className="text-3xl font-black font-mono text-indigo-700 mt-1">{profile?.leave_balance.paid_remaining ?? 0} Days</p>
                  <p className="text-[10px] text-slate-400 mt-1.5">Starts at 10 paid days per year</p>
                </div>
                <div className="rounded-xl border border-slate-200 border-l-4 border-l-emerald-500 bg-emerald-50/20 p-5 shadow-sm text-left">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Leaves Availed</p>
                  <p className="text-3xl font-black font-mono text-emerald-700 mt-1">{profile?.leave_balance.availed ?? 0} Days</p>
                  <p className="text-[10px] text-slate-400 mt-1.5">Total approved leave days taken</p>
                </div>
              </div>
            </div>

            {/* ATTENDANCE SUMMARY & GENERAL STATS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Profile Details Cards */}
              <div className="lg:col-span-1 space-y-6">
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm text-left space-y-4">
                  <h4 className="font-semibold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
                    <User className="h-4 w-4 text-slate-500" /> Profiling Details
                  </h4>
                  <div className="space-y-3 text-xs leading-relaxed">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Full Name:</span>
                      <span className="font-semibold text-slate-900">{profile?.full_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Email Address:</span>
                      <span className="font-semibold text-slate-900 font-mono">{profile?.email}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Designation:</span>
                      <span className="font-semibold text-slate-900">{profile?.designation}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Joining Date:</span>
                      <span className="font-semibold text-slate-900 font-mono">{profile?.joining_date || 'Not Set'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Portal Access:</span>
                      <span className="font-semibold text-emerald-600 flex items-center gap-1">
                        <BadgeCheck className="h-3.5 w-3.5" /> Employee Role
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Leave request history */}
              <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm text-left">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
                  <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-500" /> Leave Request History
                  </h4>
                  <button
                    onClick={() => setActiveTab('apply_leave')}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 transition-colors"
                  >
                    + Apply For Leave
                  </button>
                </div>

                <div className="overflow-x-auto">
                  {leaves.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 space-y-1">
                      <HelpCircle className="h-8 w-8 mx-auto text-slate-300" />
                      <p className="text-sm">You haven't submitted any leave applications.</p>
                      <p className="text-xs text-slate-400">Apply using the button above.</p>
                    </div>
                  ) : (
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wide font-semibold text-[10px]">
                          <th className="py-2.5">Leave ID</th>
                          <th className="py-2.5">Reason for Leave</th>
                          <th className="py-2.5">Duration</th>
                          <th className="py-2.5">Deduction</th>
                          <th className="py-2.5">Status</th>
                          <th className="py-2.5">Remarks / Approved By</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {leaves.map((req) => {
                          const isPending = req.status === 'Pending';
                          const isApproved = req.status === 'Approved';
                          const isRejected = req.status === 'Rejected';

                          return (
                            <tr key={req.leave_id} className="hover:bg-slate-50/50">
                              <td className="py-3 font-mono text-slate-500">{req.leave_id}</td>
                              <td className="py-3 font-semibold text-slate-900 max-w-xs truncate" title={req.reason}>{req.reason}</td>
                              <td className="py-3">
                                <span className="block font-semibold text-slate-800">{req.start_date}</span>
                                <span className="block text-[10px] text-slate-400">To {req.end_date}</span>
                              </td>
                              <td className="py-3">
                                <span className="block font-bold">{req.total_leave_days} Days</span>
                                {req.sandwich_leave_days > 0 && (
                                  <span className="block text-[10px] text-amber-600">{req.sandwich_leave_days} Sandwich Sunday</span>
                                )}
                              </td>
                              <td className="py-3">
                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  isApproved ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                  isRejected ? 'bg-red-50 text-red-700 border border-red-100' :
                                  'bg-amber-50 text-amber-700 border border-amber-100'
                                }`}>
                                  {isApproved && <CheckCircle2 className="h-3 w-3" />}
                                  {isRejected && <XCircle className="h-3 w-3" />}
                                  {isPending && <AlertCircle className="h-3 w-3" />}
                                  {req.status}
                                </span>
                              </td>
                              <td className="py-3">
                                {req.admin_remarks ? (
                                  <div className="space-y-0.5 max-w-xs">
                                    <p className="text-[10px] text-slate-400">By Admin: {req.approved_by || 'Admin'}</p>
                                    <p className="italic text-slate-600 font-normal">"{req.admin_remarks}"</p>
                                  </div>
                                ) : (
                                  <span className="text-slate-400 font-normal">No remarks yet</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* APPLY LEAVE VIEW (Includes Sandwich Calculator Preview!) */}
        {activeTab === 'apply_leave' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 bg-white border border-slate-200 rounded-2xl p-6 text-left shadow-sm animate-fade-in">
            {/* APPLY FORM */}
            <form onSubmit={handleApplyLeave} className="lg:col-span-2 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Request Leave Annotation</h3>
                <p className="text-xs text-slate-500 mt-1">Submit your request. Sandwich leave rule states that Sundays or company holidays enclosed by leaves are deducted as leaves.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col justify-center bg-indigo-50/40 border border-indigo-100 rounded-xl p-4 text-xs">
                  <span className="font-bold text-indigo-900">Unified Leave System</span>
                  <p className="text-slate-600 mt-1">There are no sub-types. Every employee gets exactly 10 paid leaves a year. Excess days requested are subject to salary cuts.</p>
                </div>

                <div className="flex bg-slate-50 border border-slate-200/60 rounded-xl p-4 items-center justify-between text-xs">
                  <div className="text-left">
                    <span className="text-slate-500">Your Paid Balance Remaining:</span>
                    <p className="text-lg font-bold font-mono text-slate-900 mt-0.5">
                      {profile ? profile.leave_balance.paid_remaining : 0} Days
                    </p>
                    <span className="text-slate-400 text-[10px]">Total Availed: {profile ? profile.leave_balance.availed : 0} Days</span>
                  </div>
                  <HelpCircle className="h-5 w-5 text-indigo-500 animate-pulse" />
                </div>
              </div>

              {/* HALF DAY SWITCH */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-700 block">Apply for Half Day Leave</span>
                  <p className="text-slate-500 mt-1">Check this if you are taking leave for exactly 0.5 days.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isHalfDay}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setIsHalfDay(checked);
                      if (checked && startDate) {
                        setEndDate(startDate);
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (isHalfDay) {
                        setEndDate(e.target.value);
                      }
                    }}
                    className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 px-4 text-slate-900 focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600 sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                    End Date {isHalfDay ? "(Auto matching Start)" : "(Inclusive)"}
                  </label>
                  <input
                    type="date"
                    required={!isHalfDay}
                    disabled={isHalfDay}
                    value={isHalfDay ? startDate : endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={`mt-1.5 block w-full rounded-xl border border-slate-200 py-3 px-4 text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 sm:text-sm ${
                      isHalfDay ? "bg-slate-100 text-slate-400 cursor-not-allowed border-dashed" : "bg-slate-50/50 focus:bg-white"
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Reason for Leave
                </label>
                <textarea
                  required
                  rows={3}
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 px-4 text-slate-900 focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600 sm:text-sm"
                  placeholder="Explain brief justification of your absence..."
                />
              </div>

              <div>
                <button
                  type="submit"
                  disabled={submittingLeave || (leaveBreakdown && leaveBreakdown.totalDeduction === 0)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 disabled:opacity-50"
                >
                  {submittingLeave ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      <span>Submit Leave Application</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* LIVE BREAKDOWN CALCULATION SIDEBAR */}
            <div className="lg:col-span-1 rounded-xl bg-slate-50 border border-slate-200 p-5 space-y-4">
              <h4 className="text-xs uppercase font-bold tracking-wider text-slate-500 flex items-center gap-1.5">
                <BookOpenCheck className="h-4 w-4" /> Sandwich Deductions Engine
              </h4>
              
              {!startDate || !endDate ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  Select start and end dates to preview sandwich leave impact.
                </div>
              ) : calculatingBreakdown ? (
                <div className="text-center py-12 text-xs text-slate-500 font-medium">
                  Calculating dynamic sandwich days...
                </div>
              ) : leaveBreakdown ? (
                <div className="space-y-4">
                  {/* Total Deduction Display */}
                  <div className="bg-indigo-600 text-white rounded-xl p-4 text-center">
                    <p className="text-[10px] uppercase font-bold tracking-widest text-indigo-200">Estimated Leave Deduction</p>
                    <p className="text-3xl font-bold font-mono mt-1">{leaveBreakdown.totalDeduction} Days</p>
                    <p className="text-[11px] text-indigo-100/90 mt-1.5">Saturdays are normal working days</p>
                  </div>

                  {/* Summary counts */}
                  <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                    <div className="bg-white rounded-lg border border-slate-200 p-2">
                      <span className="text-slate-400 block font-semibold">Regular</span>
                      <p className="font-bold font-mono text-slate-900 mt-1">{leaveBreakdown.regularLeaveDays}</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg border border-amber-200 p-2 text-amber-900">
                      <span className="text-amber-600 block font-semibold">Sandwich</span>
                      <p className="font-bold font-mono mt-1">{leaveBreakdown.sandwichLeaveDays}</p>
                    </div>
                    <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-2 text-emerald-950">
                      <span className="text-emerald-600 block font-semibold">Free Hol</span>
                      <p className="font-bold font-mono mt-1">{leaveBreakdown.holidayDays}</p>
                    </div>
                  </div>

                  {/* Detailed Day-by-day Breakdown logs */}
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-200/60 pb-1">Date Breakdown Details</p>
                    {leaveBreakdown.detailedDays.map((v: any, index: number) => {
                      const isDeducted = v.type.includes('Deducted') || v.type.includes('Sandwich');
                      return (
                        <div key={index} className="flex justify-between items-center text-xs py-1 border-b border-slate-200/30">
                          <div className="text-left">
                            <span className="font-semibold text-slate-800">{v.date}</span>
                            <span className="block text-[9px] text-slate-400 font-normal">{v.dayOfWeek}</span>
                          </div>
                          <span className={`inline-block text-[10px] font-bold rounded-md px-1.5 py-0.5 ${
                            v.type.includes('Sandwich') ? 'bg-amber-100 text-amber-700' :
                            v.type.includes('Weekly Off') || v.type.includes('Free') ? 'bg-emerald-50 text-emerald-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {v.type}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* PROFILE TAB */}
        {activeTab === 'profile' && (
          <div className="max-w-3xl mx-auto space-y-6 animate-fade-in text-left">
            {!isSetupComplete(profile) && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm text-left flex items-start gap-3">
                <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5 animate-bounce" />
                <div>
                  <h4 className="text-sm font-bold text-red-800">Compulsory Compliance Verification Required</h4>
                  <p className="text-xs text-red-700 mt-1 leading-relaxed">
                    Under organization policies, all employees are mandatory to fill in Aadhar, PAN, temporary residential address, permanent official address, blood group, emergency contact details, salary bank account credentials, and submit secure file copies of all proof documents. Normal portal operations (including clocks and leave applications) will remain restricted until verification is submitted.
                  </p>
                </div>
              </div>
            )}

            {isSetupComplete(profile) && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm text-left flex items-start gap-3">
                <BadgeCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5 animate-pulse" />
                <div>
                  <h4 className="text-sm font-bold text-emerald-800">Your Identity has been Verified</h4>
                  <p className="text-xs text-emerald-700 mt-1">
                    All compliance profiles & documentation have been safely stored in Supabase with authenticated security encryption. Normal portal usage is fully unlocked.
                  </p>
                </div>
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-6">
                <div>
                  <h3 className="text-md font-bold text-slate-900">Personal & Identity Information</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Please review and save your official credentials below.</p>
                </div>
                <span className={`text-xs font-bold font-mono px-3 py-1 rounded-full border ${
                  isSetupComplete(profile) 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                    : 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse'
                }`}>
                  {isSetupComplete(profile) ? 'Verified & Active' : 'Pending Verification'}
                </span>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-8">
                {/* Section 1: Basic Company details */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider">I. Basic Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">Full Name</label>
                      <input
                        type="text"
                        required
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3 text-sm text-slate-900 focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">Email Address</label>
                      <input
                        type="email"
                        required
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3 text-sm text-slate-900 focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">Joining Date</label>
                      <input
                        type="date"
                        required
                        value={editJoinDate}
                        onChange={(e) => setEditJoinDate(e.target.value)}
                        className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3 text-sm text-slate-900 focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: Identity Credentials */}
                <div className="space-y-4 border-t border-slate-100 pt-6">
                  <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider">II. Official Identity Documents</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">Aadhar Card Number (12 Digits) *</label>
                      <input
                        type="text"
                        placeholder="e.g. 1234 5678 9012"
                        required
                        value={aadharNumber}
                        onChange={(e) => setAadharNumber(e.target.value)}
                        className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3 text-sm text-slate-900 focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">PAN Card Number (10 Characters) *</label>
                      <input
                        type="text"
                        placeholder="e.g. ABCDE1234F"
                        required
                        value={panNumber}
                        maxLength={10}
                        onChange={(e) => setPanNumber(e.target.value)}
                        className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3 text-sm text-slate-900 focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600 font-mono uppercase"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 3: Addresses, Emergency and Blood group */}
                <div className="space-y-4 border-t border-slate-100 pt-6">
                  <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider">III. Contact & Health Demographics</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">Blood Group *</label>
                      <select
                        required
                        value={bloodGroup}
                        onChange={(e) => setBloodGroup(e.target.value)}
                        className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3 text-sm text-slate-900 focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                      >
                        <option value="">-- Choose Blood Group --</option>
                        <option value="A+">A Positive (A+)</option>
                        <option value="B+">B Positive (B+)</option>
                        <option value="O+">O Positive (O+)</option>
                        <option value="AB+">AB Positive (AB+)</option>
                        <option value="A-">A Negative (A-)</option>
                        <option value="B-">B Negative (B-)</option>
                        <option value="O-">O Negative (O-)</option>
                        <option value="AB-">AB Negative (AB-)</option>
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700">Emergency Contact Details (Name, Phone & Relationship) *</label>
                      <input
                        type="text"
                        placeholder="e.g. Mrs. Sunita Sharma (Mother) - 9876543210"
                        required
                        value={emergencyContact}
                        onChange={(e) => setEmergencyContact(e.target.value)}
                        className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3 text-sm text-slate-900 focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">Temporary Residential Address *</label>
                      <textarea
                        required
                        value={tempAddress}
                        onChange={(e) => setTempAddress(e.target.value)}
                        rows={2}
                        placeholder="Current residential location"
                        className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 px-3 text-sm text-slate-900 focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">Permanent Official Address *</label>
                      <textarea
                        required
                        value={permAddress}
                        onChange={(e) => setPermAddress(e.target.value)}
                        rows={2}
                        placeholder="Official permanent record address"
                        className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 px-3 text-sm text-slate-900 focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                      />
                      <button
                        type="button"
                        onClick={() => setPermAddress(tempAddress)}
                        className="text-[10px] text-indigo-600 font-bold hover:underline mt-1"
                      >
                        Copy Temporary Address to Permanent
                      </button>
                    </div>
                  </div>
                </div>

                {/* Section 4: Bank Details */}
                <div className="space-y-4 border-t border-slate-100 pt-6">
                  <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider">IV. Salary Bank Account Details</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700">Bank Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. HDFC Bank, ICICI Bank"
                        required
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3 text-sm text-slate-900 focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">IFSC Code *</label>
                      <input
                        type="text"
                        placeholder="e.g. HDFC0001234"
                        required
                        value={bankIfscCode}
                        onChange={(e) => setBankIfscCode(e.target.value)}
                        className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3 text-sm text-slate-900 focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600 font-mono uppercase"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">Branch Location</label>
                      <input
                        type="text"
                        placeholder="e.g. Mumbai Main"
                        value={bankBranch}
                        onChange={(e) => setBankBranch(e.target.value)}
                        className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3 text-sm text-slate-900 focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                      />
                    </div>
                    <div className="md:col-span-2 col-span-1">
                      <label className="block text-xs font-semibold text-slate-700">Bank Account Number *</label>
                      <input
                        type="text"
                        placeholder="e.g. 501002345678"
                        required
                        value={bankAccountNumber}
                        onChange={(e) => setBankAccountNumber(e.target.value)}
                        className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3 text-sm text-slate-900 focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600 font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 5: Document Proof Uploads */}
                <div className="space-y-4 border-t border-slate-100 pt-6">
                  <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider">V. Upload Compliance Document Proofs *</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Aadhar Proof */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50/30 p-4 flex flex-col justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">Aadhar Card Copy *</span>
                        <p className="text-[10px] text-slate-400 mt-0.5">Upload scanned image (Front & Back) or PDF</p>
                      </div>
                      <div className="space-y-2 mt-4">
                        <label className="flex flex-col items-center justify-center p-3 border border-dashed border-slate-300 rounded-lg bg-white hover:bg-slate-50 cursor-pointer text-center">
                          <span className="text-xs font-medium text-indigo-600">Select file</span>
                          <span className="text-[9px] text-slate-400 mt-1 font-mono truncate max-w-full block">
                            {aadharFileName || 'No proof selected'}
                          </span>
                          <input 
                            type="file" 
                            accept="image/*,application/pdf"
                            onChange={(e) => handleFileChange(e, 'aadhar')} 
                            className="hidden" 
                          />
                        </label>
                        {aadharProof && (
                          <details className="text-left">
                            <summary className="text-[10px] text-indigo-600 hover:underline cursor-pointer font-semibold list-none select-none flex justify-between">
                              <span>👁️ Review Document</span>
                              <span className="text-[8px] text-slate-400 p-0.5 border border-slate-100 bg-slate-50 rounded">Collapsible</span>
                            </summary>
                            <div className="mt-2 border border-slate-200 rounded-lg p-1 bg-white">
                              {aadharProof.startsWith('http://') || aadharProof.startsWith('https://') ? (
                                <div className="flex flex-col gap-1.5 p-1 text-center">
                                  {!aadharProof.toLowerCase().endsWith('.pdf') && (
                                    <img src={aadharProof} alt="Aadhar Card Proof" className="max-h-36 mx-auto rounded object-contain" referrerPolicy="no-referrer" />
                                  )}
                                  <a href={aadharProof} target="_blank" rel="noopener noreferrer" className="text-[10px] text-indigo-600 font-semibold hover:underline flex items-center justify-center gap-1">
                                    🔗 Open File in New Tab
                                  </a>
                                </div>
                              ) : aadharProof.startsWith('data:image/') ? (
                                <img src={aadharProof} alt="Aadhar Card Proof" className="max-h-36 mx-auto rounded object-contain" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="text-[9px] text-slate-500 font-mono break-all p-1 bg-slate-50 max-h-24 overflow-y-auto">
                                  Attachment Stream Loaded Successfully
                                </div>
                              )}
                            </div>
                          </details>
                        )}
                      </div>
                    </div>

                    {/* PAN Proof */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50/30 p-4 flex flex-col justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">PAN Card Copy *</span>
                        <p className="text-[10px] text-slate-400 mt-0.5">Upload a clear photo copy of your PAN number card</p>
                      </div>
                      <div className="space-y-2 mt-4">
                        <label className="flex flex-col items-center justify-center p-3 border border-dashed border-slate-300 rounded-lg bg-white hover:bg-slate-50 cursor-pointer text-center">
                          <span className="text-xs font-medium text-indigo-600">Select file</span>
                          <span className="text-[9px] text-slate-400 mt-1 font-mono truncate max-w-full block">
                            {panFileName || 'No proof selected'}
                          </span>
                          <input 
                            type="file" 
                            accept="image/*,application/pdf"
                            onChange={(e) => handleFileChange(e, 'pan')} 
                            className="hidden" 
                          />
                        </label>
                        {panProof && (
                          <details className="text-left">
                            <summary className="text-[10px] text-indigo-600 hover:underline cursor-pointer font-semibold list-none select-none flex justify-between">
                              <span>👁️ Review Document</span>
                              <span className="text-[8px] text-slate-400 p-0.5 border border-slate-100 bg-slate-50 rounded">Collapsible</span>
                            </summary>
                            <div className="mt-2 border border-slate-200 rounded-lg p-1 bg-white">
                              {panProof.startsWith('http://') || panProof.startsWith('https://') ? (
                                <div className="flex flex-col gap-1.5 p-1 text-center">
                                  {!panProof.toLowerCase().endsWith('.pdf') && (
                                    <img src={panProof} alt="PAN Card Proof" className="max-h-36 mx-auto rounded object-contain" referrerPolicy="no-referrer" />
                                  )}
                                  <a href={panProof} target="_blank" rel="noopener noreferrer" className="text-[10px] text-indigo-600 font-semibold hover:underline flex items-center justify-center gap-1">
                                    🔗 Open File in New Tab
                                  </a>
                                </div>
                              ) : panProof.startsWith('data:image/') ? (
                                <img src={panProof} alt="PAN Card Proof" className="max-h-36 mx-auto rounded object-contain" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="text-[9px] text-slate-500 font-mono break-all p-1 bg-slate-50 max-h-24 overflow-y-auto">
                                  Attachment Stream Loaded Successfully
                                </div>
                              )}
                            </div>
                          </details>
                        )}
                      </div>
                    </div>

                    {/* Bank Account/Cheque Proof */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50/30 p-4 flex flex-col justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">Bank Account proof *</span>
                        <p className="text-[10px] text-slate-400 mt-0.5">Upload cancelled cheque, passbook or statement header</p>
                      </div>
                      <div className="space-y-2 mt-4">
                        <label className="flex flex-col items-center justify-center p-3 border border-dashed border-slate-300 rounded-lg bg-white hover:bg-slate-50 cursor-pointer text-center">
                          <span className="text-xs font-medium text-indigo-600">Select file</span>
                          <span className="text-[9px] text-slate-400 mt-1 font-mono truncate max-w-full block">
                            {bankFileName || 'No proof selected'}
                          </span>
                          <input 
                            type="file" 
                            accept="image/*,application/pdf"
                            onChange={(e) => handleFileChange(e, 'bank')} 
                            className="hidden" 
                          />
                        </label>
                        {bankProof && (
                          <details className="text-left">
                            <summary className="text-[10px] text-indigo-600 hover:underline cursor-pointer font-semibold list-none select-none flex justify-between">
                              <span>👁️ Review Document</span>
                              <span className="text-[8px] text-slate-400 p-0.5 border border-slate-100 bg-slate-50 rounded">Collapsible</span>
                            </summary>
                            <div className="mt-2 border border-slate-200 rounded-lg p-1 bg-white">
                              {bankProof.startsWith('http://') || bankProof.startsWith('https://') ? (
                                <div className="flex flex-col gap-1.5 p-1 text-center">
                                  {!bankProof.toLowerCase().endsWith('.pdf') && (
                                    <img src={bankProof} alt="Bank Proof" className="max-h-36 mx-auto rounded object-contain" referrerPolicy="no-referrer" />
                                  )}
                                  <a href={bankProof} target="_blank" rel="noopener noreferrer" className="text-[10px] text-indigo-600 font-semibold hover:underline flex items-center justify-center gap-1">
                                    🔗 Open File in New Tab
                                  </a>
                                </div>
                              ) : bankProof.startsWith('data:image/') ? (
                                <img src={bankProof} alt="Bank Proof" className="max-h-36 mx-auto rounded object-contain" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="text-[9px] text-slate-500 font-mono break-all p-1 bg-slate-50 max-h-24 overflow-y-auto">
                                  Attachment Stream Loaded Successfully
                                </div>
                              )}
                            </div>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={updatingProfile}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 text-sm font-semibold text-white shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 disabled:opacity-50 transition-all font-sans"
                  >
                    {updatingProfile ? 'Securing details & uploading onto Supabase...' : 'Save & Verify Identity Credentials'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* HOLIDAYS TAB */}
        {activeTab === 'holidays' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 text-left shadow-sm animate-fade-in space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Company & National Holidays (2026)</h3>
              <p className="text-xs text-slate-500 mt-1">Saturdays are working days. Enclosing holidays before and after approved leaves triggers the sandwich policy deduction.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {holidays.map((h) => {
                const dayStr = new Date(h.holiday_date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
                return (
                  <div key={h.holiday_id} className="border border-slate-100 rounded-xl bg-slate-50/50 p-4 flex justify-between items-start">
                    <div>
                      <p className="text-xs font-bold text-slate-900">{h.holiday_name}</p>
                      <p className="text-[11px] text-indigo-600 font-semibold font-mono mt-1">{dayStr}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{h.holiday_date}</p>
                    </div>
                    <span className="text-[9px] uppercase tracking-wider font-bold bg-white border border-slate-200/60 text-slate-500 px-2 py-0.5 rounded-full">
                      {h.holiday_type}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
