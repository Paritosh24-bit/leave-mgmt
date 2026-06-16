import React, { useState, useEffect } from 'react';
import { 
  Users, UserPlus, Calendar, Clock, Check, X, Shield, Plus, Trash, Edit, 
  Search, Filter, Download, Info, CheckCircle2, XCircle, AlertCircle, 
  UserSquare2, ArrowUpRight, HelpCircle, KeyRound, RefreshCw, Eye, ToggleLeft, ToggleRight, LogOut
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line 
} from 'recharts';
import { Employee, LeaveRequest, Holiday, Attendance, AuditLog } from '../types';
import { exportToCSV } from '../utils/csvExport';
import Logo from './Logo';
import PayrollManager from './PayrollManager';

interface AdminDashboardProps {
  token: string;
  user: any;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onLogout: () => void;
}

export default function AdminDashboard({ token, user, showToast, onLogout }: AdminDashboardProps) {
  // Tabs: 'dashboard' | 'employees' | 'leaves' | 'holidays' | 'audit' | 'database' | 'payroll'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'employees' | 'leaves' | 'holidays' | 'audit' | 'database' | 'payroll'>('dashboard');

  // Database Telemetry State
  const [dbTelemetry, setDbTelemetry] = useState<{ success: boolean; rowExists: boolean; employeesInCloud: string[]; lastUpdated: string | null; error?: string } | null>(null);
  const [loadingTelemetry, setLoadingTelemetry] = useState(false);
  const [syncingCloud, setSyncingCloud] = useState<'push' | 'pull' | null>(null);
  const [unlockSync, setUnlockSync] = useState(false);

  // Core Data State
  const [stats, setStats] = useState<any>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter State
  const [empSearch, setEmpSearch] = useState('');
  const [empDeptFilter, setEmpDeptFilter] = useState('All');
  const [leaveStatusFilter, setLeaveStatusFilter] = useState('All');

  // Month-wise leaves selection
  const [leaveSelectedMonth, setLeaveSelectedMonth] = useState<number>(new Date().getMonth() + 1); // e.g. 6 for June
  const [leaveSelectedYear, setLeaveSelectedYear] = useState<number>(2026); // Default 2026 for system clock

  // Employee CRUD Modal/Form state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  
  // Add/Edit Form Fields
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formDept, setFormDept] = useState('Consulting');
  const [formDesig, setFormDesig] = useState('');
  const [formSalary, setFormSalary] = useState('');
  const [formJoinDate, setFormJoinDate] = useState('');
  const [formPaidRemaining, setFormPaidRemaining] = useState(10);
  const [formAvailed, setFormAvailed] = useState(0);
  const [formRole, setFormRole] = useState<'Admin' | 'Employee'>('Employee');

  // Administrative form compliance states
  const [formAadharNumber, setFormAadharNumber] = useState('');
  const [formPanNumber, setFormPanNumber] = useState('');
  const [formTempAddress, setFormTempAddress] = useState('');
  const [formPermAddress, setFormPermAddress] = useState('');
  const [formBloodGroup, setFormBloodGroup] = useState('');
  const [formEmergencyContact, setFormEmergencyContact] = useState('');
  const [formBankAccountNumber, setFormBankAccountNumber] = useState('');
  const [formBankIfscCode, setFormBankIfscCode] = useState('');
  const [formBankName, setFormBankName] = useState('');
  const [formBankBranch, setFormBankBranch] = useState('');
  const [formAadharProof, setFormAadharProof] = useState<string | null>(null);
  const [formPanProof, setFormPanProof] = useState<string | null>(null);
  const [formBankProof, setFormBankProof] = useState<string | null>(null);

  // Parse uploaded proof file for administrators
  const handleAdminFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'aadhar' | 'pan' | 'bank') => {
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
        setFormAadharProof(base64);
        showToast('Aadhar proof uploaded successfully.', 'success');
      } else if (type === 'pan') {
        setFormPanProof(base64);
        showToast('PAN proof uploaded successfully.', 'success');
      } else if (type === 'bank') {
        setFormBankProof(base64);
        showToast('Bank proof uploaded successfully.', 'success');
      }
    } catch (err) {
      showToast('Failed to parse uploaded document.', 'error');
    }
  };
  
  // Success dialog from backend
  const [actionSuccessCreds, setActionSuccessCreds] = useState<{ id: string; password?: string } | null>(null);

  // Custom non-blocking confirmation dialog state targets inside iframe sandbox environment
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ id: string; name: string } | null>(null);
  const [resetConfirmTarget, setResetConfirmTarget] = useState<{ id: string; name: string } | null>(null);

  // Leave approval remarks
  const [adminRemarks, setAdminRemarks] = useState('');

  // Leave rejection modal states
  const [rejectLeaveId, setRejectLeaveId] = useState<string | null>(null);
  const [rejectRemarks, setRejectRemarks] = useState('');

  // Holiday CRUD Form
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayType, setNewHolidayType] = useState<'National' | 'State' | 'Company' | 'Restricted'>('National');

  const fetchAdminData = async () => {
    try {
      setLoading(true);
      const fetchOpts = {
        headers: { 'Authorization': `Bearer ${token}` }
      };

      const [statsRes, empRes, leaveRes, holRes, attRes, logRes] = await Promise.all([
        fetch('/api/dashboard/stats', fetchOpts),
        fetch('/api/employees', fetchOpts),
        fetch('/api/leaves', fetchOpts),
        fetch('/api/holidays', fetchOpts),
        fetch('/api/attendance', fetchOpts),
        fetch('/api/audit-logs', fetchOpts)
      ]);

      if (!statsRes.ok) throw new Error('API Sync Failed or Admin Unauthorized');

      const statsData = await statsRes.json();
      const empData = await empRes.json();
      const leaveData = await leaveRes.json();
      const holData = await holRes.json();
      const attData = await attRes.json();
      const logData = await logRes.json();

      setStats(statsData.stats);
      setEmployees(empData);
      setLeaves((leaveData as LeaveRequest[]).sort((a,b) => b.applied_date.localeCompare(a.applied_date)));
      setHolidays(holData);
      setAttendance(attData);
      setAuditLogs(logData);
    } catch (err: any) {
      showToast(err.message || 'Error occurred loading system records.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchTelemetry = async () => {
    try {
      setLoadingTelemetry(true);
      const res = await fetch('/api/db/telemetry', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setDbTelemetry(data);
    } catch (err: any) {
      console.error('Failed to load DB telemetry:', err);
    } finally {
      setLoadingTelemetry(false);
    }
  };

  const handleForcePush = async () => {
    try {
      setSyncingCloud('push');
      showToast('Initiating Force Push to Supabase...', 'info');
      const res = await fetch('/api/db/force-push', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Push failed');
      showToast(data.message || 'Push sync successful!', 'success');
      await Promise.all([fetchAdminData(), fetchTelemetry()]);
    } catch (err: any) {
      showToast(err.message || 'Push failed', 'error');
    } finally {
      setSyncingCloud(null);
    }
  };

  const handleForcePull = async () => {
    try {
      setSyncingCloud('pull');
      showToast('Initiating Force Pull from Supabase...', 'info');
      const res = await fetch('/api/db/force-pull', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Pull failed');
      showToast(data.message || 'Pull sync successful!', 'success');
      await Promise.all([fetchAdminData(), fetchTelemetry()]);
    } catch (err: any) {
      showToast(err.message || 'Pull failed', 'error');
    } finally {
      setSyncingCloud(null);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam && ['dashboard', 'employees', 'leaves', 'holidays', 'audit', 'database', 'payroll'].includes(tabParam)) {
      setActiveTab(tabParam as any);
      // Clean query parameter from URL to make experience native
      const newUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({ path: newUrl }, '', newUrl);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'database') {
      fetchTelemetry();
    }
  }, [activeTab]);

  // Submit Add Employee form
  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formEmail || !formDesig) {
      showToast('Name, Email, and Designation are required.', 'warning');
      return;
    }

    try {
      const response = await fetch('/api/employees', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          full_name: formName,
          email: formEmail,
          designation: formDesig,
          salary: formSalary,
          department: formDept,
          joining_date: formJoinDate,
          role: formRole,
          initial_leave_balance: {
            paid_remaining: formPaidRemaining,
            availed: formAvailed
          },
          aadhar_number: formAadharNumber.trim(),
          pan_number: formPanNumber.trim().toUpperCase(),
          temp_address: formTempAddress.trim(),
          perm_address: formPermAddress.trim(),
          blood_group: formBloodGroup.trim(),
          emergency_contact: formEmergencyContact.trim(),
          bank_account_number: formBankAccountNumber.trim(),
          bank_ifsc_code: formBankIfscCode.trim().toUpperCase(),
          bank_name: formBankName.trim(),
          bank_branch: formBankBranch.trim(),
          aadhar_proof: formAadharProof,
          pan_proof: formPanProof,
          bank_proof: formBankProof
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to register employee');

      showToast(`Employee ${data.employee_id} created successfully!`, 'success');
      
      // Store credentials briefly to display temporary password
      setActionSuccessCreds({
        id: data.employee_id,
        password: data.temporary_password
      });

      // Clear Form
      setFormName('');
      setFormEmail('');
      setFormDesig('');
      setFormSalary('');
      setFormJoinDate('');
      setFormDept('Consulting');
      setFormRole('Employee');
      setFormAadharNumber('');
      setFormPanNumber('');
      setFormTempAddress('');
      setFormPermAddress('');
      setFormBloodGroup('');
      setFormEmergencyContact('');
      setFormBankAccountNumber('');
      setFormBankIfscCode('');
      setFormBankName('');
      setFormBankBranch('');
      setFormAadharProof(null);
      setFormPanProof(null);
      setFormBankProof(null);

      await fetchAdminData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Submit Edit Employee form
  const handleEditEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;

    try {
      const response = await fetch(`/api/employees/${editingEmployee.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          full_name: formName,
          email: formEmail,
          designation: formDesig,
          salary: formSalary,
          department: formDept,
          joining_date: formJoinDate,
          role: formRole,
          leave_balance: {
            paid_remaining: formPaidRemaining,
            availed: formAvailed
          },
          aadhar_number: formAadharNumber.trim(),
          pan_number: formPanNumber.trim().toUpperCase(),
          temp_address: formTempAddress.trim(),
          perm_address: formPermAddress.trim(),
          blood_group: formBloodGroup.trim(),
          emergency_contact: formEmergencyContact.trim(),
          bank_account_number: formBankAccountNumber.trim(),
          bank_ifsc_code: formBankIfscCode.trim().toUpperCase(),
          bank_name: formBankName.trim(),
          bank_branch: formBankBranch.trim(),
          aadhar_proof: formAadharProof,
          pan_proof: formPanProof,
          bank_proof: formBankProof
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update employee details');

      showToast('Employee updated successfully.', 'success');
      setEditingEmployee(null); // close state
      setShowAddModal(false);
      // Clear
      setFormName('');
      setFormEmail('');
      setFormDesig('');
      setFormSalary('');
      setFormJoinDate('');
      setFormDept('Consulting');
      setFormRole('Employee');
      setFormAadharNumber('');
      setFormPanNumber('');
      setFormTempAddress('');
      setFormPermAddress('');
      setFormBloodGroup('');
      setFormEmergencyContact('');
      setFormBankAccountNumber('');
      setFormBankIfscCode('');
      setFormBankName('');
      setFormBankBranch('');
      setFormAadharProof(null);
      setFormPanProof(null);
      setFormBankProof(null);

      await fetchAdminData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Open Edit Employee Setup
  const startEditEmployee = (emp: Employee) => {
    setEditingEmployee(emp);
    setFormName(emp.full_name);
    setFormEmail(emp.email);
    setFormDept(emp.department || 'Consulting');
    setFormRole(emp.role || 'Employee');
    setFormDesig(emp.designation);
    setFormSalary(emp.salary !== undefined && emp.salary !== null ? String(emp.salary) : '');
    setFormJoinDate(emp.joining_date);
    setFormPaidRemaining(emp.leave_balance.paid_remaining);
    setFormAvailed(emp.leave_balance.availed);

    // Set compliance fields
    setFormAadharNumber(emp.aadhar_number || '');
    setFormPanNumber(emp.pan_number || '');
    setFormTempAddress(emp.temp_address || '');
    setFormPermAddress(emp.perm_address || '');
    setFormBloodGroup(emp.blood_group || '');
    setFormEmergencyContact(emp.emergency_contact || '');
    setFormBankAccountNumber(emp.bank_account_number || '');
    setFormBankIfscCode(emp.bank_ifsc_code || '');
    setFormBankName(emp.bank_name || '');
    setFormBankBranch(emp.bank_branch || '');
    setFormAadharProof(emp.aadhar_proof || null);
    setFormPanProof(emp.pan_proof || null);
    setFormBankProof(emp.bank_proof || null);
    
    setActionSuccessCreds(null);
    setShowAddModal(true);

    // Scroll smoothly to form container so it opens instantly on user's current screen
    setTimeout(() => {
      const container = document.getElementById('employee-form-container');
      if (container) {
        container.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  // Reset password triggers (opens custom modal)
  const handleResetPassword = async (id: string, empName: string) => {
    setResetConfirmTarget({ id, name: empName });
  };

  // Actual execute of password reset
  const handleConfirmReset = async () => {
    if (!resetConfirmTarget) return;
    const { id, name } = resetConfirmTarget;
    try {
      const res = await fetch(`/api/employees/${id}/reset-password`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Password reset failed');

      showToast(`Password successfully reset for ${name}.`, 'success');
      setActionSuccessCreds({
        id: name,
        password: data.temporary_password
      });
      setResetConfirmTarget(null);
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  // Toggle active/deactive state
  const handleToggleActive = async (emp: Employee) => {
    try {
      const res = await fetch(`/api/employees/${emp.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ is_active: !emp.is_active })
      });
      if (!res.ok) throw new Error('Failed to toggle status');

      showToast(`Employee ${emp.full_name} has been ${!emp.is_active ? 'activated' : 'deactivated'}`, 'success');
      await fetchAdminData();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  // Soft Delete Employee (opens custom modal)
  const handleDeleteEmployee = async (id: string, empName: string) => {
    setDeleteConfirmTarget({ id, name: empName });
  };

  // Actual execute of soft delete
  const handleConfirmDelete = async () => {
    if (!deleteConfirmTarget) return;
    const { id, name } = deleteConfirmTarget;
    try {
      const res = await fetch(`/api/employees/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Deletion failed');

      showToast(`Employee record for ${name} deleted successfully.`, 'success');
      setDeleteConfirmTarget(null);
      await fetchAdminData();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  // Approve Leave Request
  const handleApproveLeave = async (leaveId: string) => {
    try {
      const res = await fetch(`/api/leaves/${leaveId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ admin_remarks: adminRemarks })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to approve leave');

      showToast('Leave request approved successfully.', 'success');
      setAdminRemarks('');
      await fetchAdminData();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  // Reject Leave Request
  const handleRejectLeave = async (leaveId: string, customRemarks: string) => {
    if (!customRemarks) {
      showToast('Please insert custom remarks justifying the leave rejection.', 'warning');
      return;
    }

    try {
      const res = await fetch(`/api/leaves/${leaveId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ admin_remarks: customRemarks })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reject leave');

      showToast('Leave request rejected successfully.', 'success');
      setRejectLeaveId(null);
      setRejectRemarks('');
      await fetchAdminData();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  // Add Company Holiday
  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHolidayName || !newHolidayDate) {
      showToast('Please input holiday name and date.', 'warning');
      return;
    }

    try {
      const res = await fetch('/api/holidays', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          holiday_name: newHolidayName,
          holiday_date: newHolidayDate,
          holiday_type: newHolidayType
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast(`Holiday ${newHolidayName} declared successfully.`, 'success');
      setNewHolidayName('');
      setNewHolidayDate('');
      await fetchAdminData();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  // Delete Holiday
  const handleDeleteHoliday = async (holidayId: string) => {
    try {
      const res = await fetch(`/api/holidays/${holidayId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Deletion failed');

      showToast('Holiday deleted successfully.', 'success');
      await fetchAdminData();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  // TRIGGERS CSV EXPORTS
  const downloadEmployeesCSV = () => {
    exportToCSV(employees, 'Employees_Report', [
      { label: 'Employee ID', key: 'employee_id' },
      { label: 'Full Name', key: 'full_name' },
      { label: 'Email', key: 'email' },
      { label: 'Designation', key: 'designation' },
      { label: 'Joining Date', key: 'joining_date' },
      { label: 'Active', key: (row) => row.is_active ? 'YES' : 'NO' },
      { label: 'Remaining Paid', key: (row) => String(row.leave_balance.paid_remaining ?? 10) },
      { label: 'Availed', key: (row) => String(row.leave_balance.availed ?? 0) },
    ]);
    showToast('Employee listing report exported successfully!', 'success');
  };

  const downloadLeavesCSV = () => {
    exportToCSV(leaves, 'Leaves_Approval_Report', [
      { label: 'Leave ID', key: 'leave_id' },
      { label: 'Employee ID', key: 'employee_id' },
      { label: 'Employee Name', key: 'employee_name' },
      { label: 'Leave Type', key: 'leave_type' },
      { label: 'Start Date', key: 'start_date' },
      { label: 'End Date', key: 'end_date' },
      { label: 'Total Deduction Days', key: 'total_leave_days' },
      { label: 'Sandwich Days', key: 'sandwich_leave_days' },
      { label: 'Status', key: 'status' },
      { label: 'Approved/Processed By', key: (row) => row.approved_by || 'Unprocessed' },
      { label: 'Remarks', key: (row) => row.admin_remarks || '' },
    ]);
    showToast('Leave requests report exported successfully!', 'success');
  };

  // Filters Employees
  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch = emp.full_name.toLowerCase().includes(empSearch.toLowerCase()) || 
                          emp.employee_id.toLowerCase().includes(empSearch.toLowerCase()) ||
                          emp.email.toLowerCase().includes(empSearch.toLowerCase());
    return matchesSearch;
  });

  // Filters Leaves
  const filteredLeaves = leaves.filter((req) => {
    return leaveStatusFilter === 'All' || req.status === leaveStatusFilter;
  });

  // Define color array for Recharts Pie
  const COLORS = ['#ef4444', '#0ea5e9', '#f59e0b', '#6366f1', '#94a3b8'];

  if (loading && !stats) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center space-y-4">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <p className="text-sm font-medium text-slate-600">Loading secure Admin records...</p>
        </div>
      </div>
    );
  }

  // Formatting departement charts data
  const departmentChartData = stats ? Object.entries(stats.departmentWiseCount).map(([name, value]) => ({ name, count: value })) : [];

  // Filter approved leaves by selected month and year
  const leavesInSelectedMonth = leaves.filter(l => {
    if (l.status !== 'Approved') return false;
    
    // Parse l.start_date and l.end_date (YYYY-MM-DD)
    const [startY, startMVal] = l.start_date.split('-').map(Number);
    const [endY, endMVal] = l.end_date.split('-').map(Number);
    
    const selectedDateStart = new Date(leaveSelectedYear, leaveSelectedMonth - 1, 1);
    const selectedDateEnd = new Date(leaveSelectedYear, leaveSelectedMonth, 0); // Last day of selected month
    
    const leaveStart = new Date(l.start_date);
    const leaveEnd = new Date(l.end_date);
    
    // Check overlap of intervals
    return leaveStart <= selectedDateEnd && leaveEnd >= selectedDateStart;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-12">
      {/* HEADER RAIL */}
      <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white px-6 shadow-sm">
        <div className="flex items-center gap-4">
          <Logo size="sm" />
          <div className="h-6 w-px bg-slate-200 hidden sm:block" />
          <div className="hidden sm:block">
            <h1 className="text-sm font-bold text-slate-900 leading-tight">Admin Portal</h1>
            <p className="text-[10px] text-teal-700 font-bold tracking-wider uppercase">SyncAI Consultancy Pvt Ltd</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
            Active Administrator Session
          </span>
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
        
        {/* UPPER HUD - COUNTERS CARD TRACKS */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
          {[
            { label: 'Total Employees', value: stats?.totalEmployees, desc: 'registered in system' },
            { label: 'Active Personnel', value: stats?.activeEmployees, desc: 'active logic access' },
            { label: 'On Leave Today', value: stats?.employeesOnLeaveToday, desc: 'approved absence' },
            { label: 'Pending Leaves', value: stats?.pendingLeaveRequests, desc: 'requires review', highlight: stats?.pendingLeaveRequests > 0 },
            { label: 'Approved Leaves', value: stats?.approvedLeaveRequests, desc: 'historic approved' },
            { label: 'Rejected Leaves', value: stats?.rejectedLeaveRequests, desc: 'not approved' }
          ].map((c, i) => (
            <div key={i} className={`rounded-xl border p-4 bg-white shadow-sm text-left ${c.highlight ? 'border-amber-400 bg-amber-50/20' : 'border-slate-200'}`}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{c.label}</p>
              <h3 className="text-2xl font-black font-mono text-slate-900 mt-1">{c.value}</h3>
              <p className="text-[9px] text-slate-400 mt-1">{c.desc}</p>
            </div>
          ))}
        </div>

        {/* TABS SELECT */}
        <div className="mb-6 flex overflow-x-auto border-b border-slate-200">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`pb-3 px-4 text-sm font-semibold border-b-2 whitespace-nowrap transition-all ${
              activeTab === 'dashboard' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Dashboard Analytics
          </button>
          <button
            onClick={() => { setActiveTab('employees'); setActionSuccessCreds(null); }}
            className={`pb-3 px-4 text-sm font-semibold border-b-2 whitespace-nowrap transition-all ${
              activeTab === 'employees' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Manage Employees ({employees.length})
          </button>
          <button
            onClick={() => setActiveTab('leaves')}
            className={`pb-3 px-4 text-sm font-semibold border-b-2 whitespace-nowrap transition-all ${
              activeTab === 'leaves' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Leave Applications ({leaves.length})
          </button>
          <button
            id="payroll-tab-nav"
            onClick={() => setActiveTab('payroll')}
            className={`pb-3 px-4 text-sm font-semibold border-b-2 whitespace-nowrap transition-all ${
              activeTab === 'payroll' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Payroll Ledger 💸
          </button>
          <button
            onClick={() => setActiveTab('holidays')}
            className={`pb-3 px-4 text-sm font-semibold border-b-2 whitespace-nowrap transition-all ${
              activeTab === 'holidays' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Manage Holidays ({holidays.length})
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`pb-3 px-4 text-sm font-semibold border-b-2 whitespace-nowrap transition-all ${
              activeTab === 'audit' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            System Audit Logs
          </button>
          <button
            onClick={() => setActiveTab('database')}
            className={`pb-3 px-4 text-sm font-semibold border-b-2 whitespace-nowrap transition-all ${
              activeTab === 'database' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            🔌 Cloud Database Sync
          </button>
        </div>

        {/* RENDER TAB CONTENTS */}

        {/* 1. DASHBOARD ANALYTICS */}
        {activeTab === 'dashboard' && stats && (
          <div className="space-y-8 animate-fade-in text-left">
            
            {/* Roster & Review Panels */}

            {/* LOWER PORTION: EMPLOYEES ON LEAVE TODAY & INSTANT ACTIONS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Month-Wise Approved Leaves Explorer (replaces daily absentees) */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 font-sans">
                    <Calendar className="h-4 w-4 text-indigo-500" /> Month-Wise Approved Leaves
                  </h4>
                  
                  {/* Selectors */}
                  <div className="flex items-center gap-2">
                    <select
                      value={leaveSelectedMonth}
                      onChange={(e) => setLeaveSelectedMonth(Number(e.target.value))}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:bg-white focus:outline-none cursor-pointer"
                    >
                      {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((name, idx) => (
                        <option key={idx} value={idx + 1}>{name}</option>
                      ))}
                    </select>
                    
                    <select
                      value={leaveSelectedYear}
                      onChange={(e) => setLeaveSelectedYear(Number(e.target.value))}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:bg-white focus:outline-none cursor-pointer"
                    >
                      {[2025, 2026, 2027].map((yr) => (
                        <option key={yr} value={yr}>{yr}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {leavesInSelectedMonth.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 py-12">
                    No approved leaves found for {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][leaveSelectedMonth - 1]} {leaveSelectedYear}.
                  </p>
                ) : (
                  <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                    <div className="mb-1 text-[10px] text-slate-400 font-bold uppercase tracking-wider flex justify-between bg-slate-50 px-3 py-1.5 rounded border border-slate-100">
                      <span>Employee & Period</span>
                      <span>Deduction Duration</span>
                    </div>
                    {leavesInSelectedMonth.map((l) => (
                      <div key={l.leave_id} className="flex justify-between items-center bg-slate-50 hover:bg-slate-100 rounded-xl p-3 text-xs border border-slate-100 transition-colors">
                        <div>
                          <span className="font-semibold text-slate-800 block">{l.employee_name}</span>
                          <span className="text-[10px] text-slate-500 block mt-0.5">
                            {new Date(l.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} -{' '}
                            {new Date(l.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                          {l.reason && (
                            <span className="text-[10px] italic text-slate-400 block mt-0.5">"{l.reason}"</span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-[11px] font-bold text-teal-800 bg-teal-50 border border-teal-150 px-2.5 py-0.5 rounded-full">
                            {l.total_leave_days} {l.total_leave_days === 1 ? 'Day' : 'Days'} Approved
                          </span>
                        </div>
                      </div>
                    ))}
                    
                    {/* Month aggregate sum of approved days */}
                    <div className="mt-3 pt-3 border-t border-slate-150 flex justify-between items-center text-xs text-slate-500 font-semibold">
                      <span>Total Month Absence Days:</span>
                      <span className="text-slate-900 font-bold text-xs bg-indigo-50 border border-indigo-150 px-2 py-0.5 rounded-lg">
                        {leavesInSelectedMonth.reduce((acc, curr) => acc + curr.total_leave_days, 0)} Approved Days
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Pending approval alert zone */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 text-amber-500" /> Pending Leave Requests Review
                </h4>
                {leaves.filter(l => l.status === 'Pending').length === 0 ? (
                  <p className="text-center text-xs text-slate-400 py-12">No pending leaves require your immediate action approval!</p>
                ) : (
                  <div className="space-y-3 max-h-60 overflow-y-auto">
                    {leaves.filter(l => l.status === 'Pending').map((l) => (
                      <div key={l.leave_id} className="flex justify-between items-center p-3 rounded-lg border border-amber-100 bg-amber-50/20 text-xs">
                        <div>
                          <span className="font-semibold text-slate-900 block">{l.employee_name} ({l.leave_type})</span>
                          <span className="text-[10px] text-slate-400 block">{l.start_date} to {l.end_date} ({l.total_leave_days} days)</span>
                        </div>
                        <button
                          onClick={() => setActiveTab('leaves')}
                          className="flex items-center gap-0.5 font-bold text-indigo-700 hover:text-indigo-500 px-2 py-1 bg-indigo-50 rounded text-[11px]"
                        >
                          Review ↳
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* 2. MANAGE EMPLOYEES TABS (CRUD) */}
        {activeTab === 'employees' && (
          <div className="space-y-6 animate-fade-in text-left">
            
            {/* SEARCH AND TRIGGER FILTERS */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-white border border-slate-200 p-4 rounded-xl">
              <div className="flex flex-1 items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3">
                    <Search className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search by Employee ID, Name, Email"
                    value={empSearch}
                    onChange={(e) => setEmpSearch(e.target.value)}
                    className="block w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 focus:bg-white"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={downloadEmployeesCSV}
                  className="flex items-center gap-1 text-[11px] font-bold border border-slate-200 hover:bg-slate-50 rounded-lg py-2 px-3 bg-white"
                >
                  <Download className="h-3.5 w-3.5" /> CSV Export
                </button>
                <button
                  onClick={() => {
                    setEditingEmployee(null);
                    setFormName('');
                    setFormEmail('');
                    setFormDesig('');
                    setFormDept('Consulting');
                    setFormSalary('');
                    setFormJoinDate('');
                    setFormPaidRemaining(10);
                    setFormAvailed(0);
                    const nextVal = !showAddModal;
                    setShowAddModal(nextVal);
                    setActionSuccessCreds(null);
                    if (nextVal) {
                      setTimeout(() => {
                        const container = document.getElementById('employee-form-container');
                        if (container) {
                          container.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                      }, 100);
                    }
                  }}
                  className="flex items-center gap-1 text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-2 px-3 shadow-sm"
                >
                  <UserPlus className="h-3.5 w-3.5" /> Add Employee
                </button>
              </div>
            </div>

            {/* TEMPORARY CREDENTIALS ALERT BOX (Super crucial for admin display after creation!) */}
            {actionSuccessCreds && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                  <KeyRound className="h-5 w-5 text-amber-500" />
                  <span>Temporary Employee Credentials Generated!</span>
                </div>
                <p className="text-xs text-amber-900/80 leading-relaxed">
                  Provide these credentials to the employee. They will be forced to change this temporary password during their first-time login flow.
                </p>
                <div className="flex gap-4 text-xs font-mono bg-white p-3 rounded-lg border border-amber-200/50 max-w-md">
                  <div>
                    <span className="text-slate-400 font-semibold block uppercase text-[9px]">ID / Username</span>
                    <span className="font-bold text-slate-850 font-sans">{actionSuccessCreds.id}</span>
                  </div>
                  <div className="border-r border-slate-200"></div>
                  <div>
                    <span className="text-slate-400 font-semibold block uppercase text-[9px]">Temporary Password</span>
                    <span className="font-bold text-indigo-700 select-all">{actionSuccessCreds.password}</span>
                  </div>
                </div>
              </div>
            )}

            {/* DUAL MODE FORM (Used for Adding OR Editing Employee records) */}
            {showAddModal && (
              <div id="employee-form-container" className="bg-white border border-slate-200 rounded-2xl p-6 shadow-md transition-all">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-6">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <UserPlus className="h-4 w-4 text-slate-500" />
                    {editingEmployee ? `Edit Employee Record: ${editingEmployee.employee_id}` : 'Create New Employee Access Profile'}
                  </h3>
                  <button
                    onClick={() => { setShowAddModal(false); setEditingEmployee(null); }}
                    className="text-xs font-bold text-slate-400 hover:text-slate-600"
                  >
                    Close Form ✕
                  </button>
                </div>

                <form onSubmit={editingEmployee ? handleEditEmployee : handleCreateEmployee} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">Full Name</label>
                      <input
                        type="text"
                        required
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 focus:bg-white"
                        placeholder="John Doe"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">Email Address</label>
                      <input
                        type="email"
                        required
                        value={formEmail}
                        onChange={(e) => setFormEmail(e.target.value)}
                        className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 focus:bg-white"
                        placeholder="john@company.com"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">Designation Role</label>
                      <input
                        type="text"
                        required
                        value={formDesig}
                        onChange={(e) => setFormDesig(e.target.value)}
                        className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 focus:bg-white"
                        placeholder="Lead Architect"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">Employee Salary (Monthly / Annual)</label>
                      <input
                        type="number"
                        value={formSalary}
                        onChange={(e) => setFormSalary(e.target.value)}
                        className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 focus:bg-white"
                        placeholder="e.g. 75000"
                      />
                    </div>
                  </div>

                   <div className={`grid grid-cols-1 ${editingEmployee ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-6`}>
                    {editingEmployee && (
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">Department Name</label>
                        <select
                          value={formDept}
                          onChange={(e) => setFormDept(e.target.value)}
                          className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 focus:bg-white"
                        >
                          <option value="Consulting">Consulting</option>
                          <option value="Engineering">Engineering</option>
                          <option value="Marketing">Marketing</option>
                          <option value="Sales">Sales</option>
                          <option value="Operations">Operations</option>
                          <option value="Finance">Finance</option>
                          <option value="HR">HR</option>
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">Portal Privilege Role</label>
                      <select
                        value={formRole}
                        onChange={(e) => setFormRole(e.target.value as 'Admin' | 'Employee')}
                        className="mt-1.5 block w-full rounded-xl border border-indigo-200 bg-indigo-50/40 py-2.5 px-3.5 text-xs text-indigo-900 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 focus:bg-white"
                      >
                        <option value="Employee">Employee (Standard Access)</option>
                        <option value="Admin">Admin</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">Joining Date</label>
                      <input
                        type="date"
                        value={formJoinDate}
                        onChange={(e) => setFormJoinDate(e.target.value)}
                        className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-605 focus:bg-white"
                      />
                    </div>
                  </div>

                  {/* INITIAL LEAVE BALANCES FOR UNIFIED PATH */}
                  <div className="border-t border-slate-100 pt-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Set Employee Leave Balances</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] text-slate-500 font-semibold block uppercase">Paid Leaves Remaining</label>
                        <input
                          type="number"
                          step="0.5"
                          value={formPaidRemaining}
                          onChange={(e) => setFormPaidRemaining(parseFloat(e.target.value) || 0)}
                          className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2 px-3 text-xs text-center font-bold"
                        />
                        <span className="text-[9px] text-slate-400">Policy allowance defaults to 10 paid days annually</span>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 font-semibold block uppercase">Total Leaves Availed</label>
                        <input
                          type="number"
                          step="0.5"
                          value={formAvailed}
                          onChange={(e) => setFormAvailed(parseFloat(e.target.value) || 0)}
                          className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2 px-3 text-xs text-center font-bold"
                        />
                        <span className="text-[9px] text-slate-400">Cumulative count of approved days taken</span>
                      </div>
                    </div>
                  </div>

                  {/* COMPLIANCE & IDENTITY DATA SECTION (Admin Management Mode) */}
                  {editingEmployee && (
                    <div className="border-t border-slate-100 pt-6">
                      <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                      🔒 Official Identity & Bank Compliance Records
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">Aadhar Card Number (12 Digits)</label>
                        <input
                          type="text"
                          value={formAadharNumber}
                          onChange={(e) => setFormAadharNumber(e.target.value)}
                          className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3.5 text-xs text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 focus:bg-white"
                          placeholder="e.g. 1234 5678 9012"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700">PAN Card Number (10 Alphanumeric)</label>
                        <input
                          type="text"
                          value={formPanNumber}
                          maxLength={10}
                          onChange={(e) => setFormPanNumber(e.target.value)}
                          className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3.5 text-xs text-slate-900 font-mono uppercase focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 focus:bg-white"
                          placeholder="e.g. ABCDE1234F"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">Blood Group</label>
                        <select
                          value={formBloodGroup}
                          onChange={(e) => setFormBloodGroup(e.target.value)}
                          className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 focus:bg-white"
                        >
                          <option value="">-- Choose Blood --</option>
                          <option value="A+">A+</option>
                          <option value="B+">B+</option>
                          <option value="O+">O+</option>
                          <option value="AB+">AB+</option>
                          <option value="A-">A-</option>
                          <option value="B-">B-</option>
                          <option value="O-">O-</option>
                          <option value="AB-">AB-</option>
                        </select>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-slate-700">Emergency Contact Details (Name, Phone & Rel)</label>
                        <input
                          type="text"
                          value={formEmergencyContact}
                          onChange={(e) => setFormEmergencyContact(e.target.value)}
                          className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 focus:bg-white"
                          placeholder="e.g. Mrs. Sunita Sharma (Mother) - 9876543210"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">Temporary Residential Address</label>
                        <textarea
                          value={formTempAddress}
                          onChange={(e) => setFormTempAddress(e.target.value)}
                          rows={2}
                          placeholder="Current residential location"
                          className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 focus:bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700">Permanent Official Address</label>
                        <textarea
                          value={formPermAddress}
                          onChange={(e) => setFormPermAddress(e.target.value)}
                          rows={2}
                          placeholder="Permanent registered address"
                          className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 focus:bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => setFormPermAddress(formTempAddress)}
                          className="text-[10px] text-indigo-600 font-bold hover:underline mt-1 block text-left"
                        >
                          Copy Temporary Address to Permanent
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-slate-700">Bank Name</label>
                        <input
                          type="text"
                          value={formBankName}
                          onChange={(e) => setFormBankName(e.target.value)}
                          className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 focus:bg-white"
                          placeholder="e.g. HDFC Bank"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">IFSC Code</label>
                        <input
                          type="text"
                          value={formBankIfscCode}
                          onChange={(e) => setFormBankIfscCode(e.target.value)}
                          className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3.5 text-xs text-slate-900 font-mono uppercase focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 focus:bg-white"
                          placeholder="e.g. HDFC0001234"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">Branch Name</label>
                        <input
                          type="text"
                          value={formBankBranch}
                          onChange={(e) => setFormBankBranch(e.target.value)}
                          className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 focus:bg-white"
                          placeholder="Mumbai Cent"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-slate-700">Bank Account Number</label>
                        <input
                          type="text"
                          value={formBankAccountNumber}
                          onChange={(e) => setFormBankAccountNumber(e.target.value)}
                          className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3.5 text-xs text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 focus:bg-white"
                          placeholder="e.g. 501002345678"
                        />
                      </div>
                    </div>

                    {/* Document Proof Reviewers */}
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-6 mb-3">Review & Upload Identity Proofs</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Aadhar */}
                      <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/40">
                        <span className="text-[11px] font-bold text-slate-800 block">Aadhar Card Proof</span>
                        <label className="mt-2 flex flex-col items-center justify-center p-2 border border-dashed border-slate-300 rounded bg-white hover:bg-slate-50 cursor-pointer text-center text-[10px]">
                          <span className="text-xs text-indigo-600 font-medium">Upload File</span>
                          <input type="file" accept="image/*,application/pdf" onChange={(e) => handleAdminFileChange(e, 'aadhar')} className="hidden" />
                        </label>
                        {formAadharProof && (
                          <details className="mt-2 text-left">
                            <summary className="text-[9px] text-indigo-600 hover:underline cursor-pointer font-bold list-none flex justify-between select-none">
                              <span>👁️ Review Document</span>
                              <span className="text-[8px] text-slate-400">Toggle</span>
                            </summary>
                            <div className="mt-1.5 border border-slate-100 rounded p-1 bg-white">
                              {formAadharProof.startsWith('http://') || formAadharProof.startsWith('https://') ? (
                                <div className="flex flex-col gap-1.5 p-1 text-center">
                                  {!formAadharProof.toLowerCase().endsWith('.pdf') && (
                                    <img src={formAadharProof} alt="Aadhar Proof" className="max-h-28 mx-auto rounded object-contain" referrerPolicy="no-referrer" />
                                  )}
                                  <a href={formAadharProof} target="_blank" rel="noopener noreferrer" className="text-[10px] text-indigo-600 font-semibold hover:underline flex items-center justify-center gap-1">
                                    🔗 Open File in New Tab
                                  </a>
                                </div>
                              ) : formAadharProof.startsWith('data:image/') ? (
                                <img src={formAadharProof} alt="Aadhar Proof" className="max-h-24 mx-auto rounded object-contain" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="text-[9px] text-slate-500 font-mono break-all p-1 bg-slate-50 max-h-16 overflow-y-auto">
                                  Attachment Stream Loaded Successfully
                                </div>
                              )}
                            </div>
                          </details>
                        )}
                      </div>

                      {/* PAN */}
                      <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/40">
                        <span className="text-[11px] font-bold text-slate-800 block">PAN Card Proof</span>
                        <label className="mt-2 flex flex-col items-center justify-center p-2 border border-dashed border-slate-300 rounded bg-white hover:bg-slate-50 cursor-pointer text-center text-[10px]">
                          <span className="text-xs text-indigo-600 font-medium">Upload File</span>
                          <input type="file" accept="image/*,application/pdf" onChange={(e) => handleAdminFileChange(e, 'pan')} className="hidden" />
                        </label>
                        {formPanProof && (
                          <details className="mt-2 text-left">
                            <summary className="text-[9px] text-indigo-600 hover:underline cursor-pointer font-bold list-none flex justify-between select-none">
                              <span>👁️ Review Document</span>
                              <span className="text-[8px] text-slate-400">Toggle</span>
                            </summary>
                            <div className="mt-1.5 border border-slate-100 rounded p-1 bg-white">
                              {formPanProof.startsWith('http://') || formPanProof.startsWith('https://') ? (
                                <div className="flex flex-col gap-1.5 p-1 text-center">
                                  {!formPanProof.toLowerCase().endsWith('.pdf') && (
                                    <img src={formPanProof} alt="PAN Proof" className="max-h-28 mx-auto rounded object-contain" referrerPolicy="no-referrer" />
                                  )}
                                  <a href={formPanProof} target="_blank" rel="noopener noreferrer" className="text-[10px] text-indigo-600 font-semibold hover:underline flex items-center justify-center gap-1">
                                    🔗 Open File in New Tab
                                  </a>
                                </div>
                              ) : formPanProof.startsWith('data:image/') ? (
                                <img src={formPanProof} alt="PAN Proof" className="max-h-24 mx-auto rounded object-contain" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="text-[9px] text-slate-500 font-mono break-all p-1 bg-slate-50 max-h-16 overflow-y-auto">
                                  Attachment Stream Loaded Successfully
                                </div>
                              )}
                            </div>
                          </details>
                        )}
                      </div>

                      {/* Bank cancel cheque */}
                      <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/40">
                        <span className="text-[11px] font-bold text-slate-800 block">Bank Account Proof</span>
                        <label className="mt-2 flex flex-col items-center justify-center p-2 border border-dashed border-slate-300 rounded bg-white hover:bg-slate-50 cursor-pointer text-center text-[10px]">
                          <span className="text-xs text-indigo-600 font-medium">Upload File</span>
                          <input type="file" accept="image/*,application/pdf" onChange={(e) => handleAdminFileChange(e, 'bank')} className="hidden" />
                        </label>
                        {formBankProof && (
                          <details className="mt-2 text-left">
                            <summary className="text-[9px] text-indigo-600 hover:underline cursor-pointer font-bold list-none flex justify-between select-none">
                              <span>👁️ Review Document</span>
                              <span className="text-[8px] text-slate-400">Toggle</span>
                            </summary>
                            <div className="mt-1.5 border border-slate-100 rounded p-1 bg-white">
                              {formBankProof.startsWith('http://') || formBankProof.startsWith('https://') ? (
                                <div className="flex flex-col gap-1.5 p-1 text-center">
                                  {!formBankProof.toLowerCase().endsWith('.pdf') && (
                                    <img src={formBankProof} alt="Bank Proof" className="max-h-28 mx-auto rounded object-contain" referrerPolicy="no-referrer" />
                                  )}
                                  <a href={formBankProof} target="_blank" rel="noopener noreferrer" className="text-[10px] text-indigo-600 font-semibold hover:underline flex items-center justify-center gap-1">
                                    🔗 Open File in New Tab
                                  </a>
                                </div>
                              ) : formBankProof.startsWith('data:image/') ? (
                                <img src={formBankProof} alt="Bank Proof" className="max-h-24 mx-auto rounded object-contain" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="text-[9px] text-slate-500 font-mono break-all p-1 bg-slate-50 max-h-16 overflow-y-auto">
                                  Attachment Stream Loaded Successfully
                                </div>
                              )}
                            </div>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                  )}

                  <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                    <button
                      type="button"
                      onClick={() => { setShowAddModal(false); setEditingEmployee(null); }}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-semibold text-slate-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-slate-900 hover:bg-slate-800 rounded-lg text-xs font-semibold text-white shadow-sm"
                    >
                      {editingEmployee ? 'Update Profile' : 'Register Profile'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* TABULAR EMPLOYEE ROSTER LISTING */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wide font-bold text-[10px]">
                    <th className="py-3">Employee ID</th>
                    <th className="py-3">Employee Info</th>
                    <th className="py-3">Designation / Role</th>
                    <th className="py-3 text-center">Remaining leave balances</th>
                    <th className="py-3 text-center">Portal Status</th>
                    <th className="py-3 text-center font-semibold">Utility Operations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredEmployees.map((emp) => {
                    const isSelf = emp.id === user.id || emp.email.toLowerCase() === user.email.toLowerCase();
                    return (
                      <tr key={emp.id} className="hover:bg-slate-50/50">
                        <td className="py-3.5 pl-1 font-mono text-[11px] font-bold tracking-tight text-slate-600">{emp.employee_id}</td>
                        <td className="py-3.5">
                          <div className="space-y-0.5">
                            <span className="font-bold text-slate-900 block text-xs">{emp.full_name}</span>
                            <span className="text-slate-400 block font-normal text-[11px] font-mono">{emp.email}</span>
                          </div>
                        </td>
                        <td className="py-3.5">
                          <span className="font-semibold text-indigo-700 block text-xs">
                            {emp.role === 'Admin' ? 'Admin' : emp.designation}
                          </span>
                          {emp.salary !== undefined && emp.salary !== null && emp.salary !== 0 && (
                            <span className="text-slate-500 font-semibold font-mono text-[10px] block mt-0.5 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 w-fit">
                              Salary: ₹{Number(emp.salary).toLocaleString()}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 text-center">
                          {/* Balances list */}
                          <div className="inline-flex gap-2 text-[10px] font-mono font-bold bg-slate-50/70 p-1.5 rounded-lg border border-slate-100">
                            <span className="text-indigo-600">Remaining Paid:{emp.leave_balance.paid_remaining ?? 0}</span>
                            <span className="text-slate-300">|</span>
                            <span className="text-emerald-600">Availed:{emp.leave_balance.availed ?? 0}</span>
                          </div>
                        </td>
                        <td className="py-3.5 text-center">
                          {emp.role === 'Admin' ? (
                            <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full font-bold">
                              Admin
                            </span>
                          ) : (
                            <div className="flex flex-col items-center gap-1.5">
                              <div className="flex gap-1 justify-center">
                                {emp.is_active ? (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                    ● Active
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                    ○ Suspended
                                  </span>
                                )}
                                {emp.is_first_login && (
                                  <span className="text-[8px] uppercase font-semibold text-amber-600 bg-amber-50 px-1 rounded block flex items-center">
                                    Needs Reset
                                  </span>
                                )}
                              </div>
                              {/* Verification compliance badge in Administrator list view */}
                              {(
                                emp.aadhar_number?.trim() &&
                                emp.pan_number?.trim() &&
                                emp.temp_address?.trim() &&
                                emp.perm_address?.trim() &&
                                emp.blood_group?.trim() &&
                                emp.emergency_contact?.trim() &&
                                emp.bank_account_number?.trim() &&
                                emp.bank_ifsc_code?.trim() &&
                                emp.bank_name?.trim() &&
                                emp.aadhar_proof &&
                                emp.pan_proof &&
                                emp.bank_proof
                              ) ? (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                  ✓ Verified
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-100 cursor-help" title="Mandatory profile documents/details are incomplete">
                                  ⚠️ Pending Profile
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 text-center">
                          {isSelf ? (
                            <span className="text-[11px] text-slate-400 italic font-normal">Self (Active Session)</span>
                          ) : (
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => startEditEmployee(emp)}
                                className="p-1 text-slate-500 hover:text-indigo-600"
                                title="Edit employee metadata"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleToggleActive(emp)}
                                className={`p-1 ${emp.is_active ? 'text-emerald-500 hover:text-slate-700' : 'text-slate-400 hover:text-emerald-500'}`}
                                title={emp.is_active ? 'Deactivate user access' : 'Activate user access'}
                              >
                                {emp.is_active ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                              </button>
                              <button
                                onClick={() => handleResetPassword(emp.id, emp.full_name)}
                                className="p-1 text-slate-500 hover:text-amber-500"
                                title="Reset credentials"
                              >
                                <KeyRound className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteEmployee(emp.id, emp.full_name)}
                                className="p-1 text-slate-400 hover:text-red-500"
                                title="Soft delete employee record"
                              >
                                <Trash className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          </div>
        )}

        {/* 3. LEAVE APPLICATIONS PROCESSOR */}
        {activeTab === 'leaves' && (
          <div className="space-y-6 animate-fade-in text-left">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-white border border-slate-200 p-4 rounded-xl">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-slate-400" />
                <select
                  value={leaveStatusFilter}
                  onChange={(e) => setLeaveStatusFilter(e.target.value)}
                  className="border border-slate-200 rounded-lg bg-white py-1.5 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-600"
                >
                  <option value="All">All Applied States</option>
                  <option value="Pending">Pending Review</option>
                  <option value="Approved">Approved Actions</option>
                  <option value="Rejected">Rejected Actions</option>
                </select>
              </div>

              <button
                onClick={downloadLeavesCSV}
                className="flex items-center gap-1 text-[11px] font-bold border border-slate-200 hover:bg-slate-50 rounded-lg py-2 px-3 bg-white"
              >
                <Download className="h-3.5 w-3.5" /> Export All Requests CSV
              </button>
            </div>

            {/* TEXTAREA FOR REMARKS FOR THE ADMIN */}
            <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-4 gap-3 flex flex-col items-start">
              <span className="text-[11px] uppercase tracking-wider font-bold text-amber-800 flex items-center gap-1">
                <Info className="h-4 w-4" /> Admin Action Remarks Buffer
              </span>
              <p className="text-[11px] text-amber-800 leading-normal">
                To approve or reject leave requests in the list below, type your remarks here FIRST, then click Approve or Reject button of the target leave. Rejections REQUIRE remarks!
              </p>
              <textarea
                value={adminRemarks}
                onChange={(e) => setAdminRemarks(e.target.value)}
                placeholder="Insert remarks e.g. 'Project critical, requested to postpone' or 'Approved. Have a great vacation!'"
                className="w-full text-xs p-2.5 rounded-lg border border-amber-200 bg-white focus:outline-none text-slate-800 focus:ring-1 focus:ring-indigo-600"
              />
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wide font-semibold text-[10px]">
                    <th className="py-3">Request ID</th>
                    <th className="py-3">Employee</th>
                    <th className="py-3">Type & Reason</th>
                    <th className="py-3">Requested Range</th>
                    <th className="py-3">Total Deduction</th>
                    <th className="py-3">Status State</th>
                    <th className="py-3 text-center">Process Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {filteredLeaves.map((req) => {
                    const isPending = req.status === 'Pending';
                    const isApproved = req.status === 'Approved';
                    const isRejected = req.status === 'Rejected';

                    return (
                      <tr key={req.leave_id} className="hover:bg-slate-50/50">
                        <td className="py-4 font-mono font-bold text-slate-500 text-[11px]">{req.leave_id}</td>
                        <td className="py-4 font-black text-slate-900 border-r border-slate-50 pr-4">{req.employee_name}</td>
                        <td className="py-4 max-w-xs pr-4">
                          <span className="font-bold text-indigo-700 block">{req.leave_type}</span>
                          <span className="text-[11px] text-slate-500 font-normal italic block">"{req.reason}"</span>
                        </td>
                        <td className="py-4 font-mono select-all">
                          <div>
                            <span className="font-bold text-slate-800">{req.start_date}</span>
                            <span className="block text-[10px] text-slate-400 font-sans font-normal">to {req.end_date}</span>
                          </div>
                        </td>
                        <td className="py-4">
                          <span className="block font-black text-slate-900">{req.total_leave_days} Days</span>
                          {req.sandwich_leave_days > 0 && (
                            <span className="text-[10px] text-orange-600 font-medium block">Spans {req.sandwich_leave_days} Sunday Sandwich</span>
                          )}
                        </td>
                        <td className="py-4">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                            isApproved ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                            isRejected ? 'bg-red-50 text-red-700 border border-red-100' :
                            'bg-amber-50 text-amber-700 border border-amber-100'
                          }`}>
                            {req.status}
                          </span>
                          {req.admin_remarks && (
                            <p className="text-[9px] font-normal italic text-slate-500 mt-1 max-w-xxs">Remarks: "{req.admin_remarks}"</p>
                          )}
                        </td>
                        <td className="py-4 text-center">
                          {isPending ? (
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleApproveLeave(req.leave_id)}
                                className="flex items-center gap-0.5 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 text-emerald-700 text-[10px] font-bold rounded"
                              >
                                <Check className="h-3 w-3" /> Approve
                              </button>
                              <button
                                onClick={() => {
                                  setRejectLeaveId(req.leave_id);
                                  setRejectRemarks('');
                                }}
                                className="flex items-center gap-0.5 px-2.5 py-1 bg-red-50 hover:bg-red-100 border border-red-100 text-red-700 text-[10px] font-bold rounded"
                              >
                                <X className="h-3 w-3" /> Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[11px] font-normal">Processed by admin</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          </div>
        )}

        {/* 4. MANAGE COMPANYS HOLIDAYS */}
        {activeTab === 'holidays' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 text-left animate-fade-in">
            {/* ADD HOLIDAY FORM */}
            <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm self-start">
              <h4 className="text-xs uppercase font-bold tracking-wider text-slate-500 border-b border-slate-100 pb-2 mb-4 flex items-center gap-1">
                <Plus className="h-4 w-4" /> Add Company/National Holiday
              </h4>
              <form onSubmit={handleAddHoliday} className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500">Holiday Label</label>
                  <input
                    type="text"
                    required
                    value={newHolidayName}
                    onChange={(e) => setNewHolidayName(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-900 focus:outline-none"
                    placeholder="New Year Block, Autumn break"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500">Declared Date</label>
                  <input
                    type="date"
                    required
                    value={newHolidayDate}
                    onChange={(e) => setNewHolidayDate(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500">Holiday Type Category</label>
                  <select
                    value={newHolidayType}
                    onChange={(e) => setNewHolidayType(e.target.value as any)}
                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-900 focus:outline-none"
                  >
                    <option>National</option>
                    <option>State</option>
                    <option>Company</option>
                    <option>Restricted</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-sm transition-colors"
                >
                  Declare Holiday
                </button>
              </form>
            </div>

            {/* LIST OF CURRENT DECLARED HOLIDAYS */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div>
                <h3 className="font-bold text-md text-slate-900">Declared Company Holidays (2026)</h3>
                <p className="text-xs text-slate-400 mt-1">Holidays will be dynamically sandwiched if enclosed between leave dates.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {holidays.map((h) => {
                  const dayStr = new Date(h.holiday_date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
                  return (
                    <div key={h.holiday_id} className="border border-slate-100 rounded-xl bg-slate-50/50 p-4 flex justify-between items-start">
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-slate-900">{h.holiday_name}</p>
                        <p className="text-[11px] text-indigo-600 font-semibold font-mono">{dayStr}</p>
                        <p className="text-[10px] text-slate-400">{h.holiday_date}</p>
                      </div>
                      <div className="flex flex-col items-end gap-3">
                        <span className="text-[9px] uppercase tracking-wider font-bold bg-white border border-slate-200/60 text-slate-500 px-2 py-0.5 rounded-full">
                          {h.holiday_type}
                        </span>
                        <button
                          onClick={() => handleDeleteHoliday(h.holiday_id)}
                          className="text-slate-400 hover:text-red-600 transition-colors"
                          title="Delete Holiday"
                        >
                          <Trash className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}

        {/* 5. SYSTEM AUDIT LOGS */}
        {activeTab === 'audit' && (
          <div className="space-y-4 animate-fade-in text-left">
            <div>
              <h3 className="font-bold text-md text-slate-900">Admin Portal System Audit Trails</h3>
              <p className="text-xs text-slate-400 mt-1">Immutably logs all structural changes, credential resets, account registrations, and leave actions.</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wide font-semibold text-[10px]">
                    <th className="py-2.5 pl-1">Timestamp</th>
                    <th className="py-2.5">Action Event</th>
                    <th className="py-2.5">Triggered By</th>
                    <th className="py-2.5">Log Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {auditLogs.map((log) => (
                    <tr key={log.log_id} className="hover:bg-slate-50/50">
                      <td className="py-2.5 pl-1 font-mono text-[10px] text-slate-400 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="py-2.5">
                        <span className="inline-block text-[10px] font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-mono">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2.5 font-bold text-slate-900">{log.user_name}</td>
                      <td className="py-2.5 max-w-sm text-slate-600 font-normal leading-relaxed">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 6. CLOUD DATABASE SYNC MANAGER */}
        {activeTab === 'database' && (
          <div className="space-y-6 animate-fade-in text-left">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-md text-slate-900">Cloud Database Sync & Recovery Manager</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Inspect real-time cloud schemas, synchronize records, and manage bidirectional replication with your Supabase server.
                </p>
              </div>
              <button
                type="button"
                onClick={fetchTelemetry}
                disabled={loadingTelemetry}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition flex items-center gap-1.5 shadow-sm max-w-max cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingTelemetry ? 'animate-spin' : ''}`} />
                Fetch Live Cloud State
              </button>
            </div>

            {/* SYNC PANEL COMPARISON CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Local Instance Storage</span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black font-mono text-slate-800">{employees.length}</span>
                    <span className="text-xs text-slate-400">Employees Cached</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    These profiles, attendance schedules, and approved logs live in the server container's JSON database file cache and drive immediate page navigation.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                  Path: data/hrms_db.json
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Supabase Cloud Payload</span>
                  <div className="flex items-baseline gap-2 mt-2">
                    {loadingTelemetry ? (
                      <span className="text-xl font-bold text-slate-400 animate-pulse">Querying...</span>
                    ) : dbTelemetry?.success ? (
                      <>
                        <span className="text-3xl font-black font-mono text-indigo-700">
                          {dbTelemetry.employeesInCloud.length}
                        </span>
                        <span className="text-xs text-slate-400">Employees in Cloud</span>
                      </>
                    ) : (
                      <>
                        <span className="text-3xl font-black font-mono text-rose-600">Offline</span>
                        <span className="text-xs text-slate-400">or Missing Row</span>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    This represents records physically saved on your Supabase remote server database table <code className="bg-slate-100 rounded px-1 text-slate-700">hrms_persistent_db</code> at primary cell index row <code className="bg-slate-100 rounded px-1 text-indigo-600">id = 1</code>.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-bold text-indigo-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 animate-pulse"></span>
                  {dbTelemetry?.lastUpdated ? `Backup Date: ${new Date(dbTelemetry.lastUpdated).toLocaleString()}` : 'No Cloud Timestamp Checked'}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">Sync Comparison</span>
                  <div className="mt-3">
                    {loadingTelemetry ? (
                      <div className="h-7 w-24 bg-slate-100 rounded animate-pulse" />
                    ) : dbTelemetry?.success ? (
                      employees.length === dbTelemetry.employeesInCloud.length ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-800">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          Perfectly Synced
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-bold text-amber-800">
                          <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                          Deltas Found ({Math.abs(employees.length - dbTelemetry.employeesInCloud.length)} out)
                        </span>
                      )
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-3 py-1 text-xs font-bold text-red-800">
                        <XCircle className="h-3.5 w-3.5 text-red-600" />
                        Not Syncing Right Now
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    Automatic sync writes to Supabase asynchronously on every individual database insertion, status switch, or leave resolution event. Use the manual tools below to override or align databases.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] font-bold text-slate-500">
                  Target Table: public.hrms_persistent_db
                </div>
              </div>
            </div>

            {/* MANUAL REPLICATION UTILITIES SECTION */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              
              {/* FORCE PUSH BOX */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-700">📤 Push Local Cache to Supabase</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Uploads your complete local dataset (current lists of employees, leaves, and activity logs) and overrides the remote server. Useful to force-seed a newly created Supabase project.
                  </p>
                </div>
                
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleForcePush}
                    disabled={syncingCloud !== null}
                    className="w-full rounded-xl bg-slate-900 border border-slate-900 py-2.5 text-xs font-bold text-white hover:bg-slate-800 transition flex items-center justify-center gap-2 shadow-md hover:shadow-lg disabled:opacity-50 cursor-pointer"
                  >
                    {syncingCloud === 'push' ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Writing payload to Supabase...
                      </>
                    ) : (
                      <>
                        <span>Force Send Local Cache to Cloud (Upsert)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* FORCE PULL BOX */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-rose-700">📥 Pull Remote Backup to Local cache</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Downloads the persistent schema row from Supabase and overwrites your current local file. Action is irreversible and replaces all local session changes.
                  </p>
                </div>

                <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-xl p-3 text-[11px] text-rose-800 leading-relaxed">
                  <input
                    type="checkbox"
                    id="unlock-pull-cb"
                    checked={unlockSync}
                    onChange={(e) => setUnlockSync(e.target.checked)}
                    className="mt-0.5 rounded border-rose-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                  />
                  <label htmlFor="unlock-pull-cb" className="font-medium select-none cursor-pointer">
                    I understand this will hard-override local state and replace any local employee registrations done offline.
                  </label>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={handleForcePull}
                    disabled={!unlockSync || syncingCloud !== null}
                    className="w-full rounded-xl bg-rose-50 border border-rose-200 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
                  >
                    {syncingCloud === 'pull' ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Downloading and writing locally...
                      </>
                    ) : (
                      <>
                        <span>Force Load Remote Supabase Backup</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

            </div>

            {/* SCHEMA DATA ENGINE INSPECTOR (TELEMETRY VISIBILITY GRID) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div>
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-800">📋 Real-Time Supabase Cloud Payload Viewer</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Inspects the contents of the database row directly from your Supabase connection. It live-lists every employee registered inside the JSON pay-cell on the cloud server.
                </p>
              </div>

              {loadingTelemetry ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3">
                  <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
                  <p className="text-xs text-slate-400">Contacting Supabase API...</p>
                </div>
              ) : dbTelemetry?.success ? (
                dbTelemetry.employeesInCloud.length > 0 ? (
                  <div className="border border-slate-100 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Employee Record Index Row 1 Data (JSON payload)
                    </div>
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-72 overflow-y-auto">
                      {dbTelemetry.employeesInCloud.map((emp, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-lg border border-indigo-50 bg-indigo-50/10 px-3 py-2 text-xs font-medium text-slate-700">
                          <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                          <span className="truncate">{emp}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center space-y-1">
                    <AlertCircle className="h-6 w-6 text-slate-400 mx-auto" />
                    <p className="text-xs font-semibold text-slate-600">Supabase Table Row is Uninitialized</p>
                    <p className="text-[11px] text-slate-400">Click &quot;Force Send Local Cache to Cloud&quot; to seed this blank table.</p>
                  </div>
                )
              ) : (
                <div className="rounded-xl border border-red-100 bg-red-50/30 p-6 text-center space-y-2">
                  <XCircle className="h-6 w-6 text-red-500 mx-auto" />
                  <p className="text-xs font-bold text-red-800">Connection Failed</p>
                  <p className="text-[11px] text-red-500 max-w-md mx-auto">
                    {dbTelemetry?.error || 'Could not fetch record list. Please check your Supabase credential configuration on the login page.'}
                  </p>
                </div>
              )}
            </div>

          </div>
        )}

        {/* 7. PAYROLL LEDGER & SALARY CALCULATOR */}
        {activeTab === 'payroll' && (
          <PayrollManager token={token} showToast={showToast} />
        )}

        {/* CUSTOM CONFIRM DELETE MODAL */}
        {deleteConfirmTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs px-4">
            <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-xl animate-fade-in text-left">
              <h3 className="text-sm font-bold uppercase tracking-wider text-red-600 mb-2">Confirm Delete Record</h3>
              <p className="text-xs text-slate-600 leading-relaxed mb-6">
                Are you sure you want to delete the employee record for <strong className="text-slate-900">{deleteConfirmTarget.name}</strong>? This deactivates their portal access and securely archives their active record statistics.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmTarget(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 transition-colors shadow-sm shadow-red-100"
                >
                  Yes, Delete Record
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CUSTOM CONFIRM PASSWORD RESET MODAL */}
        {resetConfirmTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs px-4">
            <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-xl animate-fade-in text-left">
              <h3 className="text-sm font-bold uppercase tracking-wider text-amber-600 mb-2">Confirm Credentials Reset</h3>
              <p className="text-xs text-slate-600 leading-relaxed mb-6">
                Are you sure you want to reset password credentials for <strong className="text-slate-900">{resetConfirmTarget.name}</strong>? This will generate a temporary passcode and expire their current login.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setResetConfirmTarget(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReset}
                  className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 transition-colors shadow-sm shadow-amber-100"
                >
                  Yes, Reset Credentials
                </button>
              </div>
            </div>
          </div>
        )}

        {/* LEAVE REJECTION POPUP MODAL */}
        {rejectLeaveId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs px-4">
            <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-xl animate-fade-in text-left">
              <h3 className="text-sm font-bold uppercase tracking-wider text-red-650 mb-2">Rejection Justification</h3>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                Please provide the justification or details for rejecting this leave application request.
              </p>
              <textarea
                value={rejectRemarks}
                onChange={(e) => setRejectRemarks(e.target.value)}
                placeholder="Reason for rejection (e.g., critical deadlines, insufficient coverage, etc.)"
                rows={4}
                className="w-full text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 focus:bg-white focus:border-red-500 rounded-xl p-3 outline-hidden mb-6 resize-none"
              />
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setRejectLeaveId(null);
                    setRejectRemarks('');
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleRejectLeave(rejectLeaveId, rejectRemarks)}
                  disabled={!rejectRemarks.trim()}
                  className="rounded-xl bg-red-600 disabled:bg-red-200 disabled:text-red-400 px-5 py-2 text-xs font-bold text-white hover:bg-red-700 transition-colors shadow-sm cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
