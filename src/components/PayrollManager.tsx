import React, { useState, useEffect } from 'react';
import { 
  Users, 
  DollarSign, 
  TrendingDown, 
  AlertCircle, 
  Search, 
  Eye, 
  RefreshCw, 
  Lock, 
  CheckCircle2, 
  Calendar, 
  Info, 
  FileSpreadsheet, 
  X,
  History,
  Calculator,
  Mail
} from 'lucide-react';
import { exportToCSV } from '../utils/csvExport';

interface PayrollManagerProps {
  token: string;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export default function PayrollManager({ token, showToast }: PayrollManagerProps) {
  // Current local date defaults (June 2026 based on mock system state)
  const [selectedMonth, setSelectedMonth] = useState<number>(6); // June
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // View Mode: 'calculations' (live calculations) or 'archives' (previously saved/frozen payroll logs)
  const [viewMode, setViewMode] = useState<'calculations' | 'archives'>('calculations');

  // Backend States
  const [livePayroll, setLivePayroll] = useState<any[]>([]);
  const [archivedPayroll, setArchivedPayroll] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [sendingEmail, setSendingEmail] = useState<boolean>(false);

  // Modal State
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);

  // Send single payroll email advice manually
  const handleSendSingleEmailAdvice = async (record: any) => {
    if (!record || !record.employee_id) return;
    setSendingEmail(true);
    try {
      const response = await fetch('/api/payroll/send-advice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          employeeId: record.employee_id,
          record: record
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Failed to dispatch advice email.');
      }

      showToast(resData.message || 'Deduction & Net Salary advice email sent successfully.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Email dispatch failed.', 'error');
    } finally {
      setSendingEmail(false);
    }
  };

  // Months listing
  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
  ];

  // Lifelong selection from year 2020 to 2045
  const years = Array.from({ length: 26 }, (_, i) => 2020 + i);

  // Fetch Payroll Calculations
  const fetchCalculations = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/payroll/calculate?month=${selectedMonth}&year=${selectedYear}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        throw new Error('Failed to compute live payroll records.');
      }
      const data = await response.json();
      setLivePayroll(data);
    } catch (err: any) {
      showToast(err?.message || 'Failed load calculation.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Fetch Saved Archives
  const fetchArchives = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/payroll/history', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        throw new Error('Failed to retrieve saved payroll archives.');
      }
      const data = await response.json();
      setArchivedPayroll(data);
    } catch (err: any) {
      showToast(err?.message || 'Failed to pull history logs.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Sync on month/year or viewMode change
  useEffect(() => {
    if (viewMode === 'calculations') {
      fetchCalculations();
    } else {
      fetchArchives();
    }
  }, [selectedMonth, selectedYear, viewMode]);

  // Handle Save / Freeze Payroll record run
  const handleSavePayroll = async () => {
    if (livePayroll.length === 0) {
      showToast('No active records to save/freeze for this month.', 'warning');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/payroll/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          month: selectedMonth,
          year: selectedYear,
          records: livePayroll
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Failed to save payroll logs.');
      }

      showToast(resData.message || 'Payroll Period Locked & Saved Successfully.', 'success');
      // Trigger a direct pull to refresh state
      fetchArchives();
      setViewMode('archives');
    } catch (err: any) {
      showToast(err?.message || 'Save error occurred.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadCSV = () => {
    if (filteredRecords.length === 0) return;
    
    const mappings = [
      { label: 'Employee Name', key: 'employee_name' },
      { label: 'Employee ID', key: 'employee_id_display' },
      { label: 'Monthly Base Salary (INR)', key: (rec: any) => String(rec.monthly_salary || 0) },
      { label: 'Leaves Availed', key: (rec: any) => String(rec.profile_availed !== undefined ? rec.profile_availed : (rec.leave_balance?.availed ?? 0)) },
      { label: 'Leaves Left', key: (rec: any) => String(rec.profile_left !== undefined ? rec.profile_left : (rec.remaining_paid_leaves ?? rec.leave_balance?.paid_remaining ?? 0)) },
      { label: 'Unpaid Leaves', key: (rec: any) => String(rec.unpaid_leaves || 0) },
      { label: 'Salary Deduction (INR)', key: (rec: any) => String(rec.salary_deduction || 0) },
      { label: 'Net Payable Salary (INR)', key: (rec: any) => String(rec.net_payable_salary || 0) },
      { label: 'Status', key: (rec: any) => rec.is_locked ? 'Locked (Saved Archive)' : 'Estimated (Live Draft)' }
    ];

    exportToCSV(
      filteredRecords,
      `Payroll_Ledger_${currentMonthLabel}_${selectedYear}`,
      mappings as any
    );
    showToast(`Successfully downloaded payroll ledger for ${currentMonthLabel} ${selectedYear}!`, 'success');
  };

  // List of active grid records depending on viewMode
  const activeRecordsList = viewMode === 'calculations' 
    ? livePayroll 
    : archivedPayroll.filter(p => p.month === selectedMonth && p.year === selectedYear);

  // Apply Search Filter on the frontend
  const filteredRecords = activeRecordsList.filter((rec: any) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch = !query || 
      rec.employee_name.toLowerCase().includes(query) || 
      rec.employee_id_display.toLowerCase().includes(query);

    return matchesSearch;
  });

  // KPI Calculations
  const kpiTotalEmployees = filteredRecords.length;
  
  const kpiTotalPayroll = filteredRecords.reduce((acc, curr) => {
    return acc + (parseFloat(curr.net_payable_salary) || 0);
  }, 0);

  const kpiTotalDeductions = filteredRecords.reduce((acc, curr) => {
    return acc + (parseFloat(curr.salary_deduction) || 0);
  }, 0);

  const kpiUnpaidLeavesCount = filteredRecords.filter((r: any) => r.unpaid_leaves > 0).length;

  const currentMonthLabel = months.find(m => m.value === selectedMonth)?.label || '';

  return (
    <div id="payroll-management-container" className="space-y-6 animate-fade-in text-left">
      
      {/* TITLE & HEADER BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 text-white rounded-2xl p-6 shadow-md shadow-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Calculator className="h-5 w-5" />
            </span>
            <h2 className="text-lg font-bold tracking-tight">Payroll Management System</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Calculate salaries, compute leaf deduction rates, keep historical archives, and lock payroll periods with complete ledger security.
          </p>
        </div>

        {/* WORKSPACE MODE PICKER */}
        <div className="flex items-center gap-1.5 bg-slate-800 p-1 rounded-xl self-start md:self-center border border-slate-700/60">
          <button
            id="calculations-view-btn"
            onClick={() => setViewMode('calculations')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'calculations' 
                ? 'bg-indigo-600 text-white shadow-sm' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Calculator className="h-3.5 w-3.5" />
            Live Calculations
          </button>
          <button
            id="archives-view-btn"
            onClick={() => setViewMode('archives')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'archives' 
                ? 'bg-indigo-600 text-white shadow-sm' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            Locked Archives
          </button>
        </div>
      </div>

      {/* DETAILED FILTERS GRID */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          
          {/* MONTH SELECT */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Payroll Month</label>
            <div className="relative">
              <select
                id="payroll-month-select"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="w-full text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2.5 outline-hidden appearance-none cursor-pointer"
              >
                {months.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-[10px]">▼</span>
            </div>
          </div>

          {/* YEAR SELECT */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Payroll Year</label>
            <div className="relative">
              <select
                id="payroll-year-select"
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="w-full text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2.5 outline-hidden appearance-none cursor-pointer"
              >
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-[10px]">▼</span>
            </div>
          </div>

          {/* INLINE EMPLOYEE SEARCH */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Employee Search</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <Search className="h-3.5 w-3.5" />
              </span>
              <input
                id="payroll-employee-search"
                type="text"
                placeholder="Search name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl pl-9 pr-3 py-2.5 outline-hidden"
              />
            </div>
          </div>

        </div>
      </div>

      {/* SUMMARY KPI CARDS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* STAT 1 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4 hover:border-slate-300 transition duration-300">
          <div className="p-3.5 rounded-xl bg-indigo-50 text-indigo-600">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Employees</span>
            <span className="text-xl font-extrabold text-slate-800 block mt-0.5">{kpiTotalEmployees}</span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">active in period</span>
          </div>
        </div>

        {/* STAT 2 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4 hover:border-slate-300 transition duration-300">
          <div className="p-3.5 rounded-xl bg-emerald-50 text-emerald-600">
            <DollarSign className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Payroll</span>
            <span className="text-xl font-extrabold text-slate-800 block mt-0.5">₹{kpiTotalPayroll.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
            <span className="text-[10px] text-emerald-500 font-semibold mt-0.5 block flex items-center gap-0.5">Net cash payable</span>
          </div>
        </div>

        {/* STAT 3 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4 hover:border-slate-300 transition duration-300">
          <div className="p-3.5 rounded-xl bg-rose-50 text-rose-600">
            <TrendingDown className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Deductions</span>
            <span className="text-xl font-extrabold text-rose-600 block mt-0.5">₹{kpiTotalDeductions.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">from unpaid leaves</span>
          </div>
        </div>

        {/* STAT 4 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4 hover:border-slate-300 transition duration-300">
          <div className="p-3.5 rounded-xl bg-amber-50 text-amber-600">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Unpaid Leaves Used</span>
            <span className="text-xl font-extrabold text-amber-600 block mt-0.5">{kpiUnpaidLeavesCount}</span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">employees with deducts</span>
          </div>
        </div>

      </div>

      {/* DRAFT NOTIFIER / SAVE PROMPT PANEL */}
      {viewMode === 'calculations' ? (
        <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-indigo-600">
              <Info className="h-4.5 w-4.5" />
            </span>
            <div>
              <p className="text-xs font-bold text-slate-900 leading-tight">Draft Calculation Mode Active</p>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                Salary rates, per-day breakdowns, and deductions are computed dynamically based on approved leaves. Click &quot;Save &amp; Freeze Payroll&quot; to lock this ledger. **Once frozen, an automated Net Credit &amp; Deduction advice email is instantly dispatched to each employee using the portal's secure consultancy email domain.**
              </p>
            </div>
          </div>
          <button
            id="lock-payroll-btn"
            type="button"
            onClick={handleSavePayroll}
            disabled={saving || loading || filteredRecords.length === 0}
            className="rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white disabled:text-slate-400 px-4 py-2.5 text-xs font-bold flex items-center gap-2 transition shadow-sm max-w-max shrink-0 cursor-pointer"
          >
            {saving ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Lock className="h-3.5 w-3.5" />
            )}
            Save &amp; Freeze Payroll Period
          </button>
        </div>
      ) : (
        <div className="bg-emerald-50/30 border border-emerald-100 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-emerald-600 mt-0.5">
            <CheckCircle2 className="h-4.5 w-4.5" />
          </span>
          <div>
            <p className="text-xs font-bold text-slate-900">Archives Safe Storage View Active</p>
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
              Displaying permanently locked ledger payroll history records for {currentMonthLabel} {selectedYear}. These logs remain securely stored and unaffected by future leaf status alterations.
            </p>
          </div>
        </div>
      )}

      {/* PAYROLL DIRECTORY CONTROLLERS */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        
        {/* HEADER */}
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500">
            Payroll Ledger List — {currentMonthLabel} {selectedYear} ({filteredRecords.length} records)
          </h3>
          <div className="flex items-center gap-3">
            {filteredRecords.length > 0 && (
              <button
                type="button"
                onClick={handleDownloadCSV}
                className="inline-flex items-center gap-1 bg-emerald-655 hover:bg-emerald-700 text-white font-bold text-[10px] uppercase tracking-wide px-3 py-1.5 rounded-lg border border-emerald-100 hover:border-emerald-200 transition shadow-xs cursor-pointer bg-emerald-600"
                title="Download current processed ledger rows as a CSV table"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>Download Ledger CSV</span>
              </button>
            )}
            {loading && (
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-500" />
                Computing...
              </span>
            )}
          </div>
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100">
                <th className="py-3.5 px-5">Employee</th>
                <th className="py-3.5 px-4 font-mono">ID</th>
                <th className="py-3.5 px-4 text-right">Salary</th>
                <th className="py-3.5 px-4 text-center">Leaves Availed</th>
                <th className="py-3.5 px-4 text-center text-emerald-600">Leaves Left</th>
                <th className="py-3.5 px-4 text-center text-rose-500">Months Unpaid</th>
                <th className="py-3.5 px-4 text-right text-rose-500">Deduction</th>
                <th className="py-3.5 px-5 text-right font-bold text-indigo-600 bg-slate-50/50">Net Salary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.length > 0 ? (
                filteredRecords.map((rec: any, idx: number) => {
                  const currentLeft = rec.profile_left !== undefined ? rec.profile_left : rec.remaining_paid_leaves;
                  const currentAvailed = rec.profile_availed !== undefined ? rec.profile_availed : 0;
                  return (
                    <tr 
                      key={idx} 
                      onClick={() => setSelectedRecord(rec)}
                      className="group hover:bg-slate-50 transition duration-150 cursor-pointer"
                      title="Click row to open detailed calculation worksheet"
                    >
                      
                      {/* Name */}
                      <td className="py-3 px-5 font-semibold text-slate-800 flex items-center justify-between gap-1.5">
                        <span>{rec.employee_name}</span>
                        <Eye className="h-3.5 w-3.5 text-slate-300 opacity-0 group-hover:opacity-100 group-hover:text-indigo-600 transition shrink-0" />
                      </td>

                      {/* ID display */}
                      <td className="py-3 px-4 font-mono text-slate-500">
                        {rec.employee_id_display}
                      </td>

                      {/* Monthly Base */}
                      <td className="py-3 px-4 text-right text-slate-600 font-medium">
                        ₹{(rec.monthly_salary || 0).toLocaleString('en-IN')}
                      </td>

                      {/* Profile Availed */}
                      <td className="py-3 px-4 text-center font-bold text-indigo-700">
                        {currentAvailed}
                      </td>

                      {/* Profile Paid Left */}
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          currentLeft > 0 
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                            : 'bg-slate-100 text-slate-400'
                        }`}>
                          {currentLeft}
                        </span>
                      </td>

                      {/* Unpaid */}
                      <td className="py-3 px-4 text-center font-bold text-slate-850 bg-rose-50/10">
                        <span className={rec.unpaid_leaves > 0 ? 'text-rose-600 font-extrabold' : 'text-slate-400'}>
                          {rec.unpaid_leaves}
                        </span>
                      </td>

                      {/* Deduction */}
                      <td className="py-3 px-4 text-right font-semibold text-red-600 bg-red-50/10">
                        {rec.salary_deduction > 0 ? `₹${parseFloat(rec.salary_deduction).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}
                      </td>

                      {/* Net Payable */}
                      <td className="py-3 px-5 text-right font-extrabold text-slate-900 bg-indigo-50/10 text-indigo-600">
                        ₹{parseFloat(rec.net_payable_salary).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>

                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-450 space-y-2">
                    <Calendar className="h-8 w-8 text-slate-300 mx-auto" />
                    <p className="text-xs font-medium text-slate-550">No processed records found</p>
                    <p className="text-[10px] text-slate-400">
                      {searchQuery 
                        ? 'Try clearing search parameters.' 
                        : 'Change target month/year parameters or approve leaves to show calculations.'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETAILED LEDGER PAYROLL modal POPUP */}
      {selectedRecord && (
        <div id="payroll-details-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs px-4">
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl animate-fade-in text-left overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* MODAL HEADER */}
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <div>
                <span className="text-[9px] font-bold uppercase tracking-widest text-indigo-300">Detailed Payroll Worksheet Breakdown</span>
                <h4 className="font-extrabold text-sm mt-0.5">{selectedRecord.employee_name} ({selectedRecord.employee_id_display})</h4>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* MODAL CONTENT SCROLLABLE */}
            <div className="p-6 space-y-6 overflow-y-auto">
              
              {/* PRIMARY CALCULATION METRICS BOX */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6">
                
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold uppercase">Basic Monthly Salary</span>
                  <span className="text-sm font-extrabold text-slate-800">₹{selectedRecord.monthly_salary.toLocaleString('en-IN')}</span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 block font-bold uppercase">Calendar Days in Month</span>
                  <span className="text-sm font-extrabold text-slate-800">
                    {new Date(selectedRecord.year, selectedRecord.month, 0).getDate()} days
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 block font-bold uppercase">computed Per-Day Salary</span>
                  <span className="text-sm font-extrabold text-slate-800">₹{parseFloat(selectedRecord.per_day_salary).toFixed(2)}</span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 block font-bold uppercase">Approved Month Leaves</span>
                  <span className="text-sm font-extrabold text-slate-800">{selectedRecord.approved_leaves_used} days</span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 block font-bold uppercase text-red-500">Unpaid Leaves</span>
                  <span className="text-sm font-extrabold text-red-650">{selectedRecord.unpaid_leaves} days</span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 block font-bold uppercase text-indigo-600">Profile Availed Leaves</span>
                  <span className="text-sm font-extrabold text-indigo-700">
                    {selectedRecord.profile_availed !== undefined ? selectedRecord.profile_availed : 0} days
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 block font-bold uppercase text-emerald-600">Profile Paid Left</span>
                  <span className="text-sm font-extrabold text-emerald-700">
                    {selectedRecord.profile_left !== undefined ? selectedRecord.profile_left : selectedRecord.remaining_paid_leaves} days
                  </span>
                </div>

              </div>

              {/* MATHEMATICAL LEDGER FORMULA BREAKDOWN */}
              <div className="border border-indigo-100 bg-indigo-50/20 rounded-xl p-4 space-y-3.5">
                <h5 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Calculator className="h-4 w-4 text-indigo-600" />
                  Deductive Mathematical Statement & Formula
                </h5>
                <div className="space-y-2 text-xs font-medium text-slate-600 leading-relaxed">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span>1. Per-Day Calculation:</span>
                    <span className="font-mono text-slate-800">
                      ₹{selectedRecord.monthly_salary.toLocaleString()} base / {new Date(selectedRecord.year, selectedRecord.month, 0).getDate()} calendar days = <strong>₹{parseFloat(selectedRecord.per_day_salary).toFixed(2)} / day</strong>
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span>2. Deductions Accumulated:</span>
                    <span className="font-mono text-slate-800 text-rose-600 font-bold">
                      ₹{parseFloat(selectedRecord.per_day_salary).toFixed(2)} cost × {selectedRecord.unpaid_leaves} unpaid days = <strong>₹{parseFloat(selectedRecord.salary_deduction).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong>
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="font-semibold text-slate-900">3. Net Payable Salary:</span>
                    <span className="font-mono text-indigo-600 font-extrabold text-sm decoration-3">
                      ₹{selectedRecord.monthly_salary.toLocaleString()} Base — ₹{parseFloat(selectedRecord.salary_deduction).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Deducts = <span>₹{parseFloat(selectedRecord.net_payable_salary).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* ANNUAL APPROVED LEAVE SEQUENCE INTEGRATION LOG */}
              <div className="space-y-2.5">
                <h5 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <FileSpreadsheet className="h-4 w-4 text-slate-500" />
                  Chronological Year Leave Ledger — Year {selectedRecord.year}
                </h5>
                
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-[11px]">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-200">
                        <th className="py-2.5 px-3">Leave Range</th>
                        <th className="py-2.5 px-3">Total Days</th>
                        <th className="py-2.5 px-3 uppercase text-[9px] text-emerald-600">Paid Days</th>
                        <th className="py-2.5 px-3 uppercase text-[9px] text-red-500">Unpaid Days</th>
                        <th className="py-2.5 px-3">Remarks / Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-600">
                      {selectedRecord.leave_history && selectedRecord.leave_history.length > 0 ? (
                        selectedRecord.leave_history.map((lh: any, idx: number) => {
                          return (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3 font-semibold text-slate-700">
                                {lh.start_date} to {lh.end_date}
                              </td>
                              <td className="py-2.5 px-3 text-center text-slate-800 font-medium">
                                {lh.total_days}
                              </td>
                              <td className="py-2.5 px-3 text-center text-emerald-600 font-bold bg-emerald-50/10">
                                {lh.paid_days}
                              </td>
                              <td className="py-2.5 px-3 text-center text-rose-600 font-bold bg-red-50/10">
                                {lh.unpaid_days}
                              </td>
                              <td className="py-2.5 px-3 italic text-slate-400 max-w-xs truncate">
                                {lh.reason || 'No details provided'}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-slate-400">
                            No approved annual leaves recorded for this employee in year {selectedRecord.year}.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

            {/* MODAL FOOTER */}
            <div className="bg-slate-50 border-t border-slate-100 px-5 py-3.5 flex justify-between items-center text-xs">
              <span className="text-slate-400 flex items-center gap-1">
                {selectedRecord.processed_by ? (
                  <>
                    <Lock className="h-3 w-3 inline text-slate-400" /> 
                    Processed by <strong>{selectedRecord.processed_by}</strong> on {new Date(selectedRecord.processed_at).toLocaleDateString()}
                  </>
                ) : (
                  <>
                    <Calculator className="h-3 w-3 inline text-slate-400" />
                    Real-Time computed from active approved leaves
                  </>
                )}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={sendingEmail}
                  onClick={() => handleSendSingleEmailAdvice(selectedRecord)}
                  className="rounded-xl bg-indigo-600 border border-transparent px-4 py-2 font-bold text-white hover:bg-indigo-700 disabled:bg-indigo-200 transition flex items-center gap-1.5 cursor-pointer"
                  title="Send or resend net salary & deduction email advice sheet to this employee"
                >
                  {sendingEmail ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <Mail className="h-3.5 w-3.5" />
                  )}
                  Send Email Advice
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRecord(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  Close Summary
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
