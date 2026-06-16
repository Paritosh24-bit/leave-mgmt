export interface LeaveBalances {
  paid_remaining: number;
  availed: number;
}

export interface Employee {
  id: string; // Internal UUID
  employee_id: string; // EMP001, EMP002...
  full_name: string;
  name: string; // Alias for compatibility
  email: string;
  password_hash: string;
  role: 'Admin' | 'Employee';
  department?: string;
  designation: string;
  salary?: number;
  joining_date: string;
  leave_balance: LeaveBalances;
  is_first_login: boolean;
  is_active: boolean; // For activate/deactivate
  created_at: string;
  updated_at: string;
  is_deleted?: boolean; // For soft delete
  aadhar_number?: string;
  pan_number?: string;
  temp_address?: string;
  perm_address?: string;
  blood_group?: string;
  emergency_contact?: string;
  bank_account_number?: string;
  bank_ifsc_code?: string;
  bank_name?: string;
  bank_branch?: string;
  aadhar_proof?: string; // Stored as file Name, content reference or dataURL
  pan_proof?: string;     // Stored as file Name, content reference or dataURL
  bank_proof?: string;    // Stored as file Name, content reference or dataURL
}

export type LeaveType = 'Leave';

export interface LeaveRequest {
  leave_id: string;
  employee_id: string; // Internal UUID or EMP ID
  employee_name: string; // Cached or joined name
  leave_type: LeaveType;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  reason: string;
  total_leave_days: number;
  sandwich_leave_days: number;
  status: 'Pending' | 'Approved' | 'Rejected';
  applied_date: string;
  approved_by: string | null;
  admin_remarks: string | null;
  breakdown?: {
    regularLeaveDays: number;
    sandwichLeaveDays: number;
    holidayDays: number;
    totalDeduction: number;
    detailedDays: Array<{
      date: string;
      dayOfWeek: string;
      type: string;
    }>;
  };
}

export interface Holiday {
  holiday_id: string;
  holiday_name: string;
  holiday_date: string; // YYYY-MM-DD
  holiday_type: 'National' | 'State' | 'Company' | 'Restricted';
}

export interface Attendance {
  attendance_id: string;
  employee_id: string;
  attendance_date: string; // YYYY-MM-DD
  status: 'Present' | 'Absent' | 'Half Day';
  check_in: string | null; // HH:MM:SS
  check_out: string | null; // HH:MM:SS
}

export interface AuditLog {
  log_id: string;
  action: string;
  user_id: string;
  user_name: string;
  timestamp: string;
  details: string;
}

export interface Notification {
  notification_id: string;
  employee_id: string; // target user id, or 'all'
  title: string;
  message: string;
  type: 'leave_applied' | 'leave_status' | 'holiday' | 'system';
  is_read: boolean;
  created_at: string;
}

export interface DashboardStatsAdmin {
  totalEmployees: number;
  activeEmployees: number;
  employeesOnLeaveToday: number;
  pendingLeaveRequests: number;
  approvedLeaveRequests: number;
  rejectedLeaveRequests: number;
  departmentWiseCount: Record<string, number>;
  attendanceStats: {
    presentToday: number;
    absentToday: number;
    attendancePercentage: number;
  };
  leaveStats: {
    monthlyTrend: Array<{ month: string; approved: number; pending: number }>;
    leaveTypeDistribution: Array<{ name: string; value: number }>;
  };
}

export interface AttendanceSummary {
  present: number;
  absent: number;
  halfDay: number;
  totalDays: number;
  history: Attendance[];
}

export interface PayrollRecord {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_id_display: string;
  department: string;
  month: number;
  year: number;
  monthly_salary: number;
  profile_availed?: number;
  profile_left?: number;
  approved_leaves_used: number;
  remaining_paid_leaves: number;
  unpaid_leaves: number;
  per_day_salary: number;
  salary_deduction: number;
  net_payable_salary: number;
  status: 'Processed' | 'Paid';
  processed_at: string;
  processed_by: string;
}
