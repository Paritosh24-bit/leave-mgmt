import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from './src/db/dbManager';
import { calculateLeaveDays, getDatesInRange } from './src/utils/leaveCalculator';
import { Employee, LeaveRequest, Holiday, Attendance, LeaveType } from './src/types';

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-hrms-token-key-2026';

import { Resend } from 'resend';

// Lazy initialized resend instance
let resendInstance: Resend | null = null;
function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('WARNING: RESEND_API_KEY environment variable is not set. Emails will be logged to console instead of sent.');
    return null;
  }
  if (!resendInstance) {
    resendInstance = new Resend(apiKey);
  }
  return resendInstance;
}

// Helper: Get base portal URL dynamically
function getBaseUrl(req?: express.Request): string {
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  if (req) {
    // Under local testing or certain deployments, x-forwarded-proto isn't always 'https'.
    // Use req.protocol if x-forwarded-proto isn't set, fallback to http. This ensures localhost works as http.
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers.host;
    if (host) {
      return `${proto}://${host}`;
    }
  }
  // Default fallback URL
  return 'https://ais-pre-xkafs2i3h2ticraitudkvu-592850466823.asia-southeast1.run.app';
}

/**
 * Helper: Fetch employee email address dynamically from "Supabase" (represented by DB state)
 */
export function getEmployeeEmail(employeeId: string): string {
  const emp = db.getEmployeeById(employeeId);
  return emp ? emp.email : '';
}

/**
 * Helper: Find all administrator emails dynamically
 */
export function getAdminEmails(): string[] {
  try {
    const list = db.getEmployees().filter(e => e.role === 'Admin' && e.is_active !== false);
    const emails = list.map(e => e.email).filter(Boolean);
    if (emails.length > 0) return emails;
  } catch (err) {
    console.warn("Could not load dynamic admin emails:", err);
  }
  return ['paritoshbadave@gmail.com', 'amey@aconsultancy.marketing'];
}

/**
 * Helper: Send email when new leave request is submitted
 */
export async function sendLeaveRequestEmail(leave: LeaveRequest, req?: express.Request) {
  const adminEmails = getAdminEmails();
  const portalUrl = getBaseUrl(req);
  const reviewUrl = `${portalUrl}/?tab=leaves`;
  const emp = db.getEmployeeById(leave.employee_id);
  const dept = emp ? (emp.department || 'Operations') : 'Operations';

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #f8fafc; padding: 40px 20px; color: #1e293b; line-height: 1.5;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        <div style="background-color: #f1f5f9; padding: 25px; text-align: center; border-bottom: 1px solid #e2e8f0;">
          <img src="${portalUrl}/logo.jpg" alt="Company Logo" style="height: 50px; border-radius: 6px; object-fit: contain;" />
          <h2 style="margin: 15px 0 0 0; font-size: 18px; color: #0f172a; text-transform: uppercase; tracking-wider; font-weight: 700;">New Leave Application</h2>
        </div>
        <div style="padding: 35px;">
          <p style="margin-top: 0; font-size: 15px; color: #475569;">Hello Administrator,</p>
          <p style="font-size: 15px; color: #475569;">A new leave request has been submitted and is awaiting your review:</p>
          
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 25px 0;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="padding: 6px 0; font-weight: bold; color: #475569; width: 35%;">Employee Name:</td>
                <td style="padding: 6px 0; color: #0f172a;">${leave.employee_name}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold; color: #475569;">Employee ID:</td>
                <td style="padding: 6px 0; color: #0f172a;">${emp ? emp.employee_id : 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold; color: #475569;">Department:</td>
                <td style="padding: 6px 0; color: #0f172a;">${dept}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold; color: #475569;">Leave Type:</td>
                <td style="padding: 6px 0; color: #0f172a;">${leave.leave_type}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold; color: #475569;">Start Date:</td>
                <td style="padding: 6px 0; color: #0f172a;">${leave.start_date}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold; color: #475569;">End Date:</td>
                <td style="padding: 6px 0; color: #0f172a;">${leave.end_date}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold; color: #475569;">Number of Days:</td>
                <td style="padding: 6px 0; color: #2563eb; font-weight: bold;">${leave.total_leave_days} days</td>
              </tr>
              <tr>
                <td style="padding: 10px 0 6px 0; font-weight: bold; color: #475569; vertical-align: top;">Reason:</td>
                <td style="padding: 10px 0 6px 0; color: #0f172a; font-style: italic;">"${leave.reason}"</td>
              </tr>
            </table>
          </div>

          <div style="text-align: center; margin: 30px 0 10px 0;">
            <a href="${reviewUrl}" style="background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2);">Review Leave Request</a>
          </div>
        </div>
        <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
          This is an automated system notification from your HR Management Portal.
        </div>
      </div>
    </div>
  `;

  // Filter to remove any duplicates or empty strings
  const targetEmails = Array.from(new Set(adminEmails));

  const msg = {
    from: 'Sync AI Consultancy <noreply@syncaiconsultancy.com>',
    to: targetEmails,
    subject: `New Leave Request - ${leave.employee_name}`,
    html: htmlContent,
    reply_to: 'paritoshbadave@gmail.com'
  };

  const client = getResendClient();
  if (client) {
    try {
      await client.emails.send(msg);
      console.log(`[Email Sent] New leave request notification delivered to admin.`);
    } catch (e: any) {
      console.error('Failed to deliver leave request email via Resend:', e?.message || e);
    }
  } else {
    console.log('--- RESEND CONSOLE OUTPUT (MOCK MAIL) ---');
    console.log(JSON.stringify(msg, null, 2));
    console.log('-----------------------------------------');
  }
}

/**
 * Helper: Send email when leave request is Approved
 */
export async function sendLeaveApprovalEmail(employeeId: string, leave: LeaveRequest, req?: express.Request) {
  const empEmail = getEmployeeEmail(employeeId);
  if (!empEmail) {
    console.error(`[Email Error] Cannot trigger approval email. No email registered for Employee ID ${employeeId}`);
    return;
  }
  const portalUrl = getBaseUrl(req);
  const emp = db.getEmployeeById(employeeId);
  const employeeName = emp ? emp.full_name : leave.employee_name;

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #f8fafc; padding: 40px 20px; color: #1e293b; line-height: 1.5;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        <div style="background-color: #ecfdf5; padding: 25px; text-align: center; border-bottom: 1px solid #d1fae5;">
          <img src="${portalUrl}/logo.jpg" alt="Company Logo" style="height: 50px; border-radius: 6px; object-fit: contain;" />
          <h2 style="margin: 15px 0 0 0; font-size: 18px; color: #065f46; text-transform: uppercase; tracking-wider; font-weight: 700;">Leave Approved</h2>
        </div>
        <div style="padding: 35px;">
          <p style="margin-top: 0; font-size: 15px; color: #475569;">Dear ${employeeName},</p>
          <p style="font-size: 15px; color: #475569;">We are pleased to inform you that your leave request has been approved by the HR administration team.</p>
          
          <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 25px 0;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="padding: 6px 0; font-weight: bold; color: #475569; width: 35%;">Leave Type:</td>
                <td style="padding: 6px 0; color: #0f172a;">${leave.leave_type}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold; color: #475569;">Start Date:</td>
                <td style="padding: 6px 0; color: #0f172a;">${leave.start_date}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold; color: #475569;">End Date:</td>
                <td style="padding: 6px 0; color: #0f172a;">${leave.end_date}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold; color: #475569;">Total Calendar Days:</td>
                <td style="padding: 6px 0; color: #059669; font-weight: bold;">${leave.total_leave_days} days</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold; color: #475569;">Status:</td>
                <td style="padding: 6px 0; color: #059669; font-weight: bold; text-transform: uppercase;">Approved</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold; color: #475569;">Approved By:</td>
                <td style="padding: 6px 0; color: #0f172a;">${leave.approved_by || 'HR Administrator'}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold; color: #475569;">Remarks / Comments:</td>
                <td style="padding: 6px 0; color: #0f172a; font-style: italic;">"${leave.admin_remarks || 'Enjoy your time off!'}"</td>
              </tr>
            </table>
          </div>

          <p style="font-size: 13px; color: #94a3b8; font-style: italic;">Approved on ${new Date().toLocaleString()}</p>
        </div>
        <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
          This is an automatic notification regarding your employment leaves. Please log in to the portal to view your updated leaves ledger.
        </div>
      </div>
    </div>
  `;

  const msg = {
    from: 'Sync AI Consultancy <noreply@syncaiconsultancy.com>',
    to: empEmail,
    subject: `Leave Application Approved - ${leave.start_date} to ${leave.end_date}`,
    html: htmlContent,
    reply_to: 'paritoshbadave@gmail.com'
  };

  const client = getResendClient();
  if (client) {
    try {
      await client.emails.send(msg);
      console.log(`[Email Sent] Approval email successfully delivered to ${empEmail}.`);
    } catch (e: any) {
      console.error(`Failed to deliver approval leave email to ${empEmail}:`, e?.message || e);
    }
  } else {
    console.log('--- RESEND CONSOLE OUTPUT (MOCK MAIL) ---');
    console.log(JSON.stringify(msg, null, 2));
    console.log('-----------------------------------------');
  }
}

/**
 * Helper: Send email when leave request is Rejected
 */
export async function sendLeaveRejectionEmail(employeeId: string, leave: LeaveRequest, req?: express.Request) {
  const empEmail = getEmployeeEmail(employeeId);
  if (!empEmail) {
    console.error(`[Email Error] Cannot trigger rejection email. No email registered for Employee ID ${employeeId}`);
    return;
  }
  const portalUrl = getBaseUrl(req);
  const emp = db.getEmployeeById(employeeId);
  const employeeName = emp ? emp.full_name : leave.employee_name;

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #f8fafc; padding: 40px 20px; color: #1e293b; line-height: 1.5;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        <div style="background-color: #fef2f2; padding: 25px; text-align: center; border-bottom: 1px solid #fee2e2;">
          <img src="${portalUrl}/logo.jpg" alt="Company Logo" style="height: 50px; border-radius: 6px; object-fit: contain;" />
          <h2 style="margin: 15px 0 0 0; font-size: 18px; color: #991b1b; text-transform: uppercase; tracking-wider; font-weight: 700;">Leave Rejected</h2>
        </div>
        <div style="padding: 35px;">
          <p style="margin-top: 0; font-size: 15px; color: #475569;">Dear ${employeeName},</p>
          <p style="font-size: 15px; color: #475569;">We are writing to inform you that your leave request has been evaluated and unfortunately rejected at this time due to administrative or scheduling requirements.</p>
          
          <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 25px 0;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="padding: 6px 0; font-weight: bold; color: #475569; width: 35%;">Leave Type:</td>
                <td style="padding: 6px 0; color: #0f172a;">${leave.leave_type}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold; color: #475569;">Start Date:</td>
                <td style="padding: 6px 0; color: #0f172a;">${leave.start_date}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold; color: #475569;">End Date:</td>
                <td style="padding: 6px 0; color: #0f172a;">${leave.end_date}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold; color: #475569;">Total Calendar Days:</td>
                <td style="padding: 6px 0; color: #991b1b; font-weight: bold;">${leave.total_leave_days} days</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold; color: #475569;">Status:</td>
                <td style="padding: 6px 0; color: #991b1b; font-weight: bold; text-transform: uppercase;">Rejected</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold; color: #475569;">Rejected By:</td>
                <td style="padding: 6px 0; color: #0f172a;">${leave.approved_by || 'HR Administrator'}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0 6px 0; font-weight: bold; color: #991b1b; vertical-align: top;">Rejection Reason:</td>
                <td style="padding: 10px 0 6px 0; color: #0f172a; font-style: italic;">"${leave.admin_remarks || 'Not specified.'}"</td>
              </tr>
            </table>
          </div>

          <p style="font-size: 15px; color: #475569;">If you require further clarification or wish to reschedule, please get in touch with your direct manager or the Operations department.</p>
        </div>
        <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
          This is an automatic notification regarding your employment leaves ledger.
        </div>
      </div>
    </div>
  `;

  const msg = {
    from: 'Sync AI Consultancy <noreply@syncaiconsultancy.com>',
    to: empEmail,
    subject: `Leave Application Rejected - ${leave.start_date} to ${leave.end_date}`,
    html: htmlContent,
    reply_to: 'paritoshbadave@gmail.com'
  };

  const client = getResendClient();
  if (client) {
    try {
      await client.emails.send(msg);
      console.log(`[Email Sent] Rejection email successfully delivered to ${empEmail}.`);
    } catch (e: any) {
      console.error(`Failed to deliver rejection leave email to ${empEmail}:`, e?.message || e);
    }
  } else {
    console.log('--- RESEND CONSOLE OUTPUT (MOCK MAIL) ---');
    console.log(JSON.stringify(msg, null, 2));
    console.log('-----------------------------------------');
  }
}

/**
 * Helper: Send email when monthly salary is credited (Monthly Payroll Processing)
 */
export async function sendMonthlyPayrollEmail(employeeId: string, record: any, req?: express.Request) {
  const empEmail = getEmployeeEmail(employeeId);
  if (!empEmail) {
    console.error(`[Email Error] Cannot trigger payroll email. No email registered for Employee ID ${employeeId}`);
    return;
  }
  const portalUrl = getBaseUrl(req);
  const emp = db.getEmployeeById(employeeId);
  const employeeName = emp ? emp.full_name : (record.employee_name || 'Valued Employee');

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const monthLabel = monthNames[record.month - 1] || `Month #${record.month}`;

  const targetEmail = empEmail;
  const subjectPrefix = '';
  const sandboxBanner = '';

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #f8fafc; padding: 40px 20px; color: #1e293b; line-height: 1.5;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        ${sandboxBanner}
        <div style="background-color: #eef2ff; padding: 25px; text-align: center; border-bottom: 1px solid #e0e7ff;">
          <img src="${portalUrl}/logo.jpg" alt="Company Logo" style="height: 50px; border-radius: 6px; object-fit: contain;" />
          <h2 style="margin: 15px 0 0 0; font-size: 18px; color: #3730a3; text-transform: uppercase; tracking-wider; font-weight: 700;">Net Salary Credit & Deduction Advice</h2>
        </div>
        <div style="padding: 35px;">
          <p style="margin-top: 0; font-size: 15px; color: #475569;">Dear ${employeeName},</p>
          <p style="font-size: 15px; color: #475569;">Your salary and standard deduction breakdown for the month of <strong>${monthLabel} ${record.year}</strong> has been successfully processed. The net salary detailed below <strong>will be credited</strong> to your registered bank account at the month end.</p>
          
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 22px; margin: 25px 0;">
            <h3 style="margin-top:0; font-size:14px; text-transform:uppercase; color:#475569; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">Breakdown Statement</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="padding: 8px 0; color: #64748b;">Monthly base salary:</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #0f172a;">₹${record.monthly_salary.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;">Approved Leaves:</td>
                <td style="padding: 6px 0; text-align: right; color: #0f172a;">${record.approved_leaves_used} days</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;">Paid Leaves Used:</td>
                <td style="padding: 6px 0; text-align: right; color: #0f172a;">${record.paid_leaves_used !== undefined ? record.paid_leaves_used : (record.approved_leaves_used - record.unpaid_leaves)} days</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;">Remaining Paid Leaves limit:</td>
                <td style="padding: 6px 0; text-align: right; color: #4f46e5; font-weight: 600;">${record.remaining_paid_leaves} days left</td>
              </tr>
              <tr style="border-bottom: 1px dashed #cbd5e1;">
                <td style="padding: 6px 0 10px 0; color: #ef4444; font-weight: 500;">Unpaid Leaves (Deducted):</td>
                <td style="padding: 6px 0 10px 0; text-align: right; color: #ef4444; font-weight: bold;">${record.unpaid_leaves} days</td>
              </tr>
              <tr>
                <td style="padding: 12px 0 6px 0; color: #ef4444; font-weight: 500;">Salary Deduction amount:</td>
                <td style="padding: 12px 0 6px 0; text-align: right; color: #ef4444; font-weight: bold;">- ₹${record.salary_deduction.toFixed(2)}</td>
              </tr>
              <tr style="border-top: 1px solid #94a3b8;">
                <td style="padding: 12px 0; font-size: 16px; font-weight: bold; color: #0f172a;">Final Net Credited Salary:</td>
                <td style="padding: 12px 0; font-size: 18px; text-align: right; font-weight: 900; color: #4338ca;">₹${record.net_payable_salary.toFixed(2)}</td>
              </tr>
            </table>
          </div>

          <p style="font-size: 14px; color: #475569;">The payslip breakdown is now securely saved and visible inside your Employee Portal dashboard account.</p>
        </div>
        <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
          Confidential &bull; System-generated Payslip
        </div>
      </div>
    </div>
  `;

  const msg = {
    from: 'Sync AI Consultancy <noreply@syncaiconsultancy.com>',
    to: targetEmail,
    subject: `Net Salary Credit & Deduction Advice - ${monthLabel} ${record.year}`,
    html: htmlContent,
    reply_to: 'paritoshbadave@gmail.com'
  };

  const client = getResendClient();
  if (client) {
    try {
      await client.emails.send(msg);
      console.log(`[Email Sent] Payslip successfully delivered to ${targetEmail} (Target: ${empEmail}).`);
    } catch (e: any) {
      console.error(`Failed to deliver payroll payslip to ${targetEmail}:`, e?.message || e);
    }
  } else {
    console.log('--- RESEND CONSOLE OUTPUT (MOCK MAIL) ---');
    console.log(JSON.stringify(msg, null, 2));
    console.log('-----------------------------------------');
  }
}

/**
 * Helper: Send Administrator Payroll Summary Email
 */
export async function sendAdminPayrollSummaryEmail(summary: {
  totalEmployees: number;
  totalPayrollAmount: number;
  totalDeductions: number;
  deductionCount: number;
  month: number;
  year: number;
}, req?: express.Request) {
  const adminEmails = getAdminEmails();
  const portalUrl = getBaseUrl(req);
  const viewUrl = `${portalUrl}/?tab=payroll`;

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const monthLabel = monthNames[summary.month - 1] || `Month #${summary.month}`;

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #f8fafc; padding: 40px 20px; color: #1e293b; line-height: 1.5;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        <div style="background-color: #0f172a; padding: 25px; text-align: center; border-bottom: 1px solid #334155;">
          <img src="${portalUrl}/logo.jpg" alt="Company Logo" style="height: 50px; border-radius: 6px; object-fit: contain;" />
          <h2 style="margin: 15px 0 0 0; font-size: 18px; color: #ffffff; text-transform: uppercase; tracking-wider; font-weight: 700;">Admin Payroll Processing Summary</h2>
        </div>
        <div style="padding: 35px;">
          <p style="margin-top: 0; font-size: 15px; color: #475569;">Hello Administrator,</p>
          <p style="font-size: 15px; color: #475569;">All payroll accounts for the month of <strong>${monthLabel} ${summary.year}</strong> have been successfully finalized and processed.</p>
          
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 25px 0;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="padding: 8px 0; color: #475569; width: 55%; font-weight: 500;">Total Employees Processed:</td>
                <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #0f172a;">${summary.totalEmployees}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #475569; font-weight: 500;">Total Payroll Payable Amount:</td>
                <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #10b981;">₹${summary.totalPayrollAmount.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #475569; font-weight: 500;">Total Unpaid Leave Deductions:</td>
                <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #ef4444;">₹${summary.totalDeductions.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #475569; font-weight: 500;">Employees with Leaves Deductions:</td>
                <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #ef4444;">${summary.deductionCount}</td>
              </tr>
            </table>
          </div>

          <p style="font-size: 15px; color: #475569;">Pay slips have been emailed directly to each employee, and historical records are persistently archived in your database store.</p>

          <div style="text-align: center; margin: 30px 0 10px 0;">
            <a href="${viewUrl}" style="background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.2);">View Payroll Dashboard</a>
          </div>
        </div>
        <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
          HR System Automation Panel
        </div>
      </div>
    </div>
  `;

  // Deduplicate admin emails
  const targetEmails = Array.from(new Set(adminEmails));

  const msg = {
    from: 'Sync AI Consultancy <noreply@syncaiconsultancy.com>',
    to: targetEmails,
    subject: `Payroll Processing Summary - ${monthLabel} ${summary.year}`,
    html: htmlContent,
    reply_to: 'paritoshbadave@gmail.com'
  };

  const client = getResendClient();
  if (client) {
    try {
      await client.emails.send(msg);
      console.log(`[Email Sent] Admin payroll summary delivered to ${targetEmails.join(', ')}.`);
    } catch (e: any) {
      console.error(`Failed to deliver admin payroll summary email:`, e?.message || e);
    }
  } else {
    console.log('--- RESEND CONSOLE OUTPUT (MOCK MAIL) ---');
    console.log(JSON.stringify(msg, null, 2));
    console.log('-----------------------------------------');
  }
}

/**
 * Self-correcting leave balances helper
 */
function syncEmployeeLeaveBalance(employeeId: string) {
  const emp = db.getEmployeeById(employeeId);
  if (!emp) return;

  const approvedLeaves = db.getLeaveRequests().filter(
    l => l.employee_id === employeeId && l.status === 'Approved'
  );

  let approvedSum = 0;
  approvedLeaves.forEach(l => {
    approvedSum += l.total_leave_days || 0;
  });

  const remainingPaid = Math.max(0, 10 - approvedSum);
  const availed = approvedSum;

  emp.leave_balance = {
    paid_remaining: remainingPaid,
    availed: availed
  };

  db.updateEmployee(emp);
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// --- MIDDLEWARES ---

// Authenticate JWT middleware
interface AuthenticatedRequest extends express.Request {
  user?: {
    id: string;
    email: string;
    role: 'Admin' | 'Employee';
    full_name: string;
  };
}

const authenticateJWT = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(' ')[1]; // Bearer TOKEN
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({ error: 'Token is invalid or expired' });
      }
      req.user = user as AuthenticatedRequest['user'];
      next();
    });
  } else {
    res.status(411).json({ error: 'Authorization header is required' });
  }
};

const requireAdmin = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Access denied: Admin role required' });
  }
  next();
};

// --- AUTHENTICATION API ---

// Login Endpoint
app.post('/api/auth/login', (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = db.getEmployeeByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Your account has been deactivated. Contact HR.' });
    }

    let isPassValid = bcrypt.compareSync(password, user.password_hash);
    if (!isPassValid && user.is_first_login && password === '123456') {
      isPassValid = true;
    }

    if (!isPassValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Create JWT token
    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      full_name: user.full_name
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });

    // Return token and user status (especially is_first_login)
    res.json({
      token,
      user: {
        id: user.id,
        employee_id: user.employee_id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        is_first_login: user.is_first_login,
        department: user.department,
        designation: user.designation
      }
    });
  } catch (error) {
    next(error);
  }
});

// Verification OTP codes store for forgot password (in-memory)
interface ForgotPasswordReset {
  email: string;
  otpCode: string;
  expiresAt: number;
}
const forgotPasswordResets = new Map<string, ForgotPasswordReset>();

// 1. Request Password Reset OTP Code via Email
app.post('/api/auth/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const user = db.getEmployees().find(e => e.email.toLowerCase() === trimmedEmail && e.is_active !== false);

    if (!user) {
      // Return a general success message to prevent email exploration but assist real users
      return res.json({
        success: true,
        message: 'A secure 6-digit OTP password reset code has been sent to your email.'
      });
    }

    // Generate a secure 6-digit numeric OTP code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Store in-memory, expires in 15 minutes
    forgotPasswordResets.set(trimmedEmail, {
      email: trimmedEmail,
      otpCode,
      expiresAt: Date.now() + 15 * 60 * 1000
    });

    // Send reset OTP email
    const portalUrl = getBaseUrl(req);
    const htmlContent = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #f8fafc; padding: 40px 20px; color: #1e293b; line-height: 1.5;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          <div style="background-color: #0f172a; padding: 25px; text-align: center; border-bottom: 1px solid #1e293b;">
            <img src="${portalUrl}/logo.jpg" alt="Company Logo" style="height: 50px; border-radius: 6px; object-fit: contain;" />
            <h2 style="margin: 15px 0 0 0; font-size: 18px; color: #ffffff; text-transform: uppercase; font-weight: 700;">Password Recovery Advice</h2>
          </div>
          <div style="padding: 35px; text-align: center;">
            <p style="margin-top: 0; font-size: 15px; color: #475569; text-align: left;">Dear ${user.full_name},</p>
            <p style="font-size: 15px; color: #475569; text-align: left;">We received a request to reset your password. Use the verification OTP code below to authorize this reset. This code is valid for 15 minutes.</p>
            
            <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 12px; padding: 20px; margin: 25px 0; display: inline-block;">
              <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #4f46e5;">${otpCode}</span>
            </div>

            <p style="font-size: 13px; color: #94a3b8; text-align: left;">If you did not request a password reset, you can safely ignore this message. Your password remains unchanged.</p>
          </div>
          <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
            Sync AI Consultancy Authentication Hub
          </div>
        </div>
      </div>
    `;

    const msg = {
      from: 'Sync AI Consultancy <noreply@syncaiconsultancy.com>',
      to: user.email,
      subject: `Your Password Reset Code - ${otpCode}`,
      html: htmlContent,
      reply_to: 'paritoshbadave@gmail.com'
    };

    const client = getResendClient();
    if (client) {
      await client.emails.send(msg);
      console.log(`[Verification Email] Sent forgot password reset OTP code ${otpCode} to ${user.email}.`);
    } else {
      console.log('--- RESEND CONSOLE OUTPUT (MOCK MAIL) ---');
      console.log(JSON.stringify(msg, null, 2));
      console.log('-----------------------------------------');
    }

    res.json({
      success: true,
      message: 'A secure 6-digit OTP password reset code has been sent to your email.'
    });
  } catch (error) {
    next(error);
  }
});

// 2. Execute Password Reset via OTP Verification
app.post('/api/auth/reset-password', async (req, res, next) => {
  try {
    const { email, otpCode, newPassword } = req.body;

    if (!email || !otpCode || !newPassword) {
      return res.status(400).json({ error: 'Email, Verification OTP, and New Password are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const resetRecord = forgotPasswordResets.get(trimmedEmail);

    if (!resetRecord) {
      return res.status(400).json({ error: 'No active password reset request found. Please request a new verification code.' });
    }

    if (resetRecord.otpCode !== otpCode.trim()) {
      return res.status(400).json({ error: 'Incorrect 6-digit verification code. Please check your email and try again.' });
    }

    if (Date.now() > resetRecord.expiresAt) {
      forgotPasswordResets.delete(trimmedEmail);
      return res.status(400).json({ error: 'Your password reset OTP code has expired. Please request a new one.' });
    }

    // OTP matches and is not expired
    const user = db.getEmployees().find(e => e.email.toLowerCase() === trimmedEmail && e.is_active !== false);
    if (!user) {
      return res.status(404).json({ error: 'Employee account not found.' });
    }

    // Save newly hashed password from public reset flow
    user.password_hash = bcrypt.hashSync(newPassword, 10);
    user.is_first_login = false; // Bypass the temporary password flow since they chose their own!
    user.updated_at = new Date().toISOString();
    db.updateEmployee(user);

    // Log the event immutably
    db.addAuditLog(
      'AUTH_PASSWORD_RESET',
      user.id,
      user.full_name,
      `User successfully completed password reset via dynamic OTP verification email.`
    );

    // Send confirmation email
    const portalUrl = getBaseUrl(req);
    const htmlConfirm = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #f8fafc; padding: 40px 20px; color: #1e293b; line-height: 1.5;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          <div style="background-color: #10b981; padding: 25px; text-align: center; border-bottom: 1px solid #059669;">
            <img src="${portalUrl}/logo.jpg" alt="Company Logo" style="height: 50px; border-radius: 6px; object-fit: contain;" />
            <h2 style="margin: 15px 0 0 0; font-size: 18px; color: #ffffff; text-transform: uppercase; font-weight: 700;">Password Updated Successfully</h2>
          </div>
          <div style="padding: 35px;">
            <p style="margin-top: 0; font-size: 15px; color: #475569;">Dear ${user.full_name},</p>
            <p style="font-size: 15px; color: #475569;">This is a quick security confirmation that your workspace HR Portal password was successfully updated today.</p>
            <p style="font-size: 15px; color: #475569;">You can now log in using your registered email and your new password.</p>
            
            <div style="text-align: center; margin: 30px 0 10px 0;">
              <a href="${portalUrl}" style="background-color: #10b981; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">Log In to HR Portal</a>
            </div>

            <p style="font-size: 13px; color: #94a3b8; font-style: italic; margin-top: 25px;">If you did not authorize this change, please immediately reset your password again or notify an HR system administrator.</p>
          </div>
          <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
            Sync AI Consultancy Support Service
          </div>
        </div>
      </div>
    `;

    const msg = {
      from: 'Sync AI Consultancy <noreply@syncaiconsultancy.com>',
      to: user.email,
      subject: 'Security Alert: Password Changed Successfully',
      html: htmlConfirm,
      reply_to: 'paritoshbadave@gmail.com'
    };

    const client = getResendClient();
    if (client) {
      await client.emails.send(msg);
    }

    // Done with this instance
    forgotPasswordResets.delete(trimmedEmail);

    res.json({
      success: true,
      message: 'Your password was successfully updated. You can now sign in.'
    });
  } catch (error) {
    next(error);
  }
});

// Change Password Endpoint (First Login Flow & Manual Changes)
app.post('/api/auth/change-password', authenticateJWT, (req: AuthenticatedRequest, res) => {
  const { oldPassword, newPassword } = req.body;
  const userPayload = req.user!;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long' });
  }

  const user = db.getEmployeeById(userPayload.id);
  if (!user) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  // Verify old password (skip this check on first login, as they set a new password directly without entering old)
  if (!user.is_first_login) {
    const isOldValid = bcrypt.compareSync(oldPassword, user.password_hash);
    if (!isOldValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
  }

  // Update password
  user.password_hash = bcrypt.hashSync(newPassword, 10);
  user.is_first_login = false;
  db.updateEmployee(user);

  db.addAuditLog(
    'PASSWORD_CHANGE',
    user.id,
    user.full_name,
    `Password updated successfully. First login completed.`
  );

  res.json({ message: 'Password changed successfully' });
});

// Get Current User Info
app.get('/api/auth/me', authenticateJWT, (req: AuthenticatedRequest, res) => {
  const user = db.getEmployeeById(req.user!.id);
  if (!user) {
    return res.status(404).json({ error: 'User profile not found' });
  }
  res.json({
    id: user.id,
    employee_id: user.employee_id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    department: user.department,
    designation: user.designation,
    joining_date: user.joining_date,
    leave_balance: user.leave_balance,
    is_active: user.is_active,
    is_first_login: user.is_first_login,
    aadhar_number: user.aadhar_number,
    pan_number: user.pan_number,
    temp_address: user.temp_address,
    perm_address: user.perm_address,
    blood_group: user.blood_group,
    emergency_contact: user.emergency_contact,
    bank_account_number: user.bank_account_number,
    bank_ifsc_code: user.bank_ifsc_code,
    bank_name: user.bank_name,
    bank_branch: user.bank_branch,
    aadhar_proof: user.aadhar_proof,
    pan_proof: user.pan_proof,
    bank_proof: user.bank_proof
  });
});

// Update personal profile (Employees can update their email/personal info safely)
app.put('/api/auth/profile', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  const {
    full_name,
    email,
    joining_date,
    aadhar_number,
    pan_number,
    temp_address,
    perm_address,
    blood_group,
    emergency_contact,
    bank_account_number,
    bank_ifsc_code,
    bank_name,
    bank_branch,
    aadhar_proof,
    pan_proof,
    bank_proof
  } = req.body;

  const user = db.getEmployeeById(req.user!.id);
  if (!user) {
    return res.status(404).json({ error: 'User profile not found' });
  }

  if (email && email.toLowerCase() !== user.email.toLowerCase()) {
    const existing = db.getEmployeeByEmail(email);
    if (existing) {
      return res.status(400).json({ error: 'Email is already taken' });
    }
    user.email = email;
  }

  if (full_name) {
    user.full_name = full_name;
    user.name = full_name;
  }

  if (joining_date) {
    user.joining_date = joining_date;
  }

  let finalAadharProof = user.aadhar_proof || null;
  let finalPanProof = user.pan_proof || null;
  let finalBankProof = user.bank_proof || null;

  if (aadhar_proof) {
    finalAadharProof = await db.uploadProofToStorage(user.id, 'aadhar', aadhar_proof);
  }
  if (pan_proof) {
    finalPanProof = await db.uploadProofToStorage(user.id, 'pan', pan_proof);
  }
  if (bank_proof) {
    finalBankProof = await db.uploadProofToStorage(user.id, 'bank', bank_proof);
  }

  // Update new mandatory verification details supporting automatic Cloud DB Sync persistence
  if (aadhar_number !== undefined) user.aadhar_number = aadhar_number;
  if (pan_number !== undefined) user.pan_number = pan_number;
  if (temp_address !== undefined) user.temp_address = temp_address;
  if (perm_address !== undefined) user.perm_address = perm_address;
  if (blood_group !== undefined) user.blood_group = blood_group;
  if (emergency_contact !== undefined) user.emergency_contact = emergency_contact;
  if (bank_account_number !== undefined) user.bank_account_number = bank_account_number;
  if (bank_ifsc_code !== undefined) user.bank_ifsc_code = bank_ifsc_code;
  if (bank_name !== undefined) user.bank_name = bank_name;
  if (bank_branch !== undefined) user.bank_branch = bank_branch;
  user.aadhar_proof = finalAadharProof;
  user.pan_proof = finalPanProof;
  user.bank_proof = finalBankProof;

  db.updateEmployee(user);
  db.addAuditLog('PROFILE_UPDATE', user.id, user.full_name, `Employee updated mandatory profile verification details.`);

  res.json({ message: 'Profile updated successfully', user });
});

// --- EMPLOYEE MANAGEMENT API (ADMIN ONLY) ---

// Get active employees list
app.get('/api/employees', authenticateJWT, requireAdmin, (req, res) => {
  const list = db.getEmployees();
  res.json(list);
});

// Get specific employee profile
app.get('/api/employees/:id', authenticateJWT, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const current = req.user!;

  // Security: Non-admins can only fetch their own profile
  if (current.role !== 'Admin' && current.id !== id) {
    return res.status(403).json({ error: 'Access denied: You can only access your own profile.' });
  }

  const target = db.getEmployeeById(id);
  if (!target) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  // Return employee with password removed for safety
  const { password_hash, ...safeObject } = target;
  res.json(safeObject);
});

// Create Employee (Admin Only)
app.post('/api/employees', authenticateJWT, requireAdmin, async (req: AuthenticatedRequest, res) => {
  const { 
    full_name, email, department, designation, joining_date, initial_leave_balance, salary,
    aadhar_number, pan_number, temp_address, perm_address, blood_group, emergency_contact,
    bank_account_number, bank_ifsc_code, bank_name, bank_branch, aadhar_proof, pan_proof, bank_proof,
    role
  } = req.body;

  if (!full_name || !email || !designation) {
    return res.status(400).json({ error: 'Please provide all required fields (Full Name, Email, Designation)' });
  }

  const existing = db.getEmployeeByEmail(email);
  if (existing) {
    return res.status(400).json({ error: 'An employee with this email already exists' });
  }

  // Generate Employee ID
  const allEmps = db.getEmployees();
  const numericIds = allEmps
    .map(e => parseInt(e.employee_id.replace('EMP', ''), 10))
    .filter(id => !isNaN(id));
  const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 0;
  const nextEmployeeId = `EMP${String(maxId + 1).padStart(3, '0')}`;

  // Generate temporary password (123456)
  const tempPassword = '123456';
  const passwordHash = bcrypt.hashSync(tempPassword, 10);

  // Set default initial balances
  let paid_remaining = 10;
  let availed = 0;
  if (initial_leave_balance) {
    if (typeof initial_leave_balance === 'object') {
      paid_remaining = initial_leave_balance.paid_remaining !== undefined ? Number(initial_leave_balance.paid_remaining) : 10;
      availed = initial_leave_balance.availed !== undefined ? Number(initial_leave_balance.availed) : 0;
    } else {
      paid_remaining = Number(initial_leave_balance);
    }
  }

  const balances = {
    paid_remaining,
    availed
  };

  const finalDept = department || '';
  const finalJoinDate = joining_date || '';
  const parsedSalary = salary !== undefined && salary !== null && salary !== '' ? Number(salary) : undefined;
  
  const generatedId = 'emp-' + Math.random().toString(36).substr(2, 9);
  
  let finalAadharProof = aadhar_proof || null;
  let finalPanProof = pan_proof || null;
  let finalBankProof = bank_proof || null;

  if (aadhar_proof) {
    finalAadharProof = await db.uploadProofToStorage(generatedId, 'aadhar', aadhar_proof);
  }
  if (pan_proof) {
    finalPanProof = await db.uploadProofToStorage(generatedId, 'pan', pan_proof);
  }
  if (bank_proof) {
    finalBankProof = await db.uploadProofToStorage(generatedId, 'bank', bank_proof);
  }

  const newEmp: Employee = {
    id: generatedId,
    employee_id: nextEmployeeId,
    full_name,
    name: full_name,
    email: email.toLowerCase(),
    password_hash: passwordHash,
    role: (role === 'Admin' || role === 'Employee') ? role : 'Employee',
    department: finalDept,
    designation,
    salary: parsedSalary,
    joining_date: finalJoinDate,
    leave_balance: balances,
    is_first_login: true,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    aadhar_number: aadhar_number || '',
    pan_number: pan_number || '',
    temp_address: temp_address || '',
    perm_address: perm_address || '',
    blood_group: blood_group || '',
    emergency_contact: emergency_contact || '',
    bank_account_number: bank_account_number || '',
    bank_ifsc_code: bank_ifsc_code || '',
    bank_name: bank_name || '',
    bank_branch: bank_branch || '',
    aadhar_proof: finalAadharProof,
    pan_proof: finalPanProof,
    bank_proof: finalBankProof
  };

  db.insertEmployee(newEmp);

  // Log audit info
  db.addAuditLog(
    'EMPLOYEE_CREATE',
    req.user!.id,
    req.user!.full_name,
    `Added Employee ${nextEmployeeId} - ${full_name} (${email})`
  );

  // Add notification
  db.addNotification(
    newEmp.id,
    'Welcome to the Company Portal!',
    `Your supervisor registered your account. Please log in using temporary password: ${tempPassword}`,
    'system'
  );

  res.status(201).json({
    message: 'Employee created successfully',
    employee_id: nextEmployeeId,
    temporary_password: tempPassword,
    employee: {
      id: newEmp.id,
      employee_id: newEmp.employee_id,
      full_name: newEmp.full_name,
      email: newEmp.email,
      department: newEmp.department,
      designation: newEmp.designation,
      joining_date: newEmp.joining_date
    }
  });
});

// Edit Employee (Admin Only)
app.put('/api/employees/:id', authenticateJWT, requireAdmin, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { 
    full_name, email, department, designation, joining_date, leave_balance, is_active, salary,
    aadhar_number, pan_number, temp_address, perm_address, blood_group, emergency_contact,
    bank_account_number, bank_ifsc_code, bank_name, bank_branch, aadhar_proof, pan_proof, bank_proof,
    role
  } = req.body;

  const emp = db.getEmployeeById(id);
  if (!emp) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  if (email && email.toLowerCase() !== emp.email.toLowerCase()) {
    const existing = db.getEmployeeByEmail(email);
    if (existing) {
      return res.status(400).json({ error: 'Email is already taken by another user' });
    }
    emp.email = email.toLowerCase();
  }

  if (full_name) {
    emp.full_name = full_name;
    emp.name = full_name;
  }
  if (department) emp.department = department;
  if (designation) emp.designation = designation;
  if (joining_date) emp.joining_date = joining_date;
  if (role === 'Admin' || role === 'Employee') emp.role = role;
  if (leave_balance) emp.leave_balance = leave_balance;
  if (is_active !== undefined) emp.is_active = is_active;
  
  if (salary !== undefined) {
    emp.salary = (salary === '' || salary === null) ? undefined : Number(salary);
  }

  let finalAadharProof = emp.aadhar_proof || null;
  let finalPanProof = emp.pan_proof || null;
  let finalBankProof = emp.bank_proof || null;

  if (aadhar_proof) {
    finalAadharProof = await db.uploadProofToStorage(emp.id, 'aadhar', aadhar_proof);
  }
  if (pan_proof) {
    finalPanProof = await db.uploadProofToStorage(emp.id, 'pan', pan_proof);
  }
  if (bank_proof) {
    finalBankProof = await db.uploadProofToStorage(emp.id, 'bank', bank_proof);
  }

  if (aadhar_number !== undefined) emp.aadhar_number = aadhar_number;
  if (pan_number !== undefined) emp.pan_number = pan_number;
  if (temp_address !== undefined) emp.temp_address = temp_address;
  if (perm_address !== undefined) emp.perm_address = perm_address;
  if (blood_group !== undefined) emp.blood_group = blood_group;
  if (emergency_contact !== undefined) emp.emergency_contact = emergency_contact;
  if (bank_account_number !== undefined) emp.bank_account_number = bank_account_number;
  if (bank_ifsc_code !== undefined) emp.bank_ifsc_code = bank_ifsc_code;
  if (bank_name !== undefined) emp.bank_name = bank_name;
  if (bank_branch !== undefined) emp.bank_branch = bank_branch;
  emp.aadhar_proof = finalAadharProof;
  emp.pan_proof = finalPanProof;
  emp.bank_proof = finalBankProof;

  db.updateEmployee(emp);

  db.addAuditLog(
    'EMPLOYEE_UPDATE',
    req.user!.id,
    req.user!.full_name,
    `Updated Employee ID: ${emp.employee_id} (${emp.full_name})`
  );

  res.json({ message: 'Employee updated successfully', employee: emp });
});

// Reset Password (Admin Only)
app.post('/api/employees/:id/reset-password', authenticateJWT, requireAdmin, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const emp = db.getEmployeeById(id);
  if (!emp) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const tempPassword = '123456';
  emp.password_hash = bcrypt.hashSync(tempPassword, 10);
  emp.is_first_login = true;
  db.updateEmployee(emp);

  db.addAuditLog(
    'PASSWORD_RESET',
    req.user!.id,
    req.user!.full_name,
    `Reset password for Employee ID: ${emp.employee_id} (${emp.full_name})`
  );

  res.json({
    message: `Password reset has been triggered.`,
    temporary_password: tempPassword
  });
});

// Delete Employee (Admin Only - soft delete)
app.delete('/api/employees/:id', authenticateJWT, requireAdmin, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;

  if (id === req.user!.id) {
    return res.status(400).json({ error: 'For system safety, you cannot delete your own Administrator account.' });
  }

  const emp = db.getEmployeeById(id);
  if (!emp) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  db.deleteEmployee(id);
  db.addAuditLog(
    'EMPLOYEE_DELETE',
    req.user!.id,
    req.user!.full_name,
    `Soft-deleted Employee ID: ${emp.employee_id} (${emp.full_name})`
  );

  res.json({ message: 'Employee deleted successfully (soft delete applied)' });
});

// --- LEAVE MANAGEMENT API ---

// Get Leaves List (Conditional based on Role)
app.get('/api/leaves', authenticateJWT, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  let leaves = db.getLeaveRequests();

  if (user.role !== 'Admin') {
    leaves = leaves.filter(l => l.employee_id === user.id);
  }

  res.json(leaves);
});

// Calculate sandbox sandwich leave (useful for forms previewing)
app.post('/api/leaves/calculate', authenticateJWT, (req, res) => {
  const { startDate, endDate, employeeId, is_half_day } = req.body;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required' });
  }

  const holidays = db.getHolidays();
  
  // Fetch existing approved leaves of this employee to check for continuous multi-request sandwiching
  let existingLeaves: LeaveRequest[] = [];
  if (employeeId) {
    existingLeaves = db.getLeaveRequests().filter(l => l.employee_id === employeeId && l.status === 'Approved');
  }

  const breakdown = calculateLeaveDays(startDate, endDate, holidays, existingLeaves, undefined, is_half_day);
  res.json(breakdown);
});

// Apply For Leave (Employee or Admin applying on half)
app.post('/api/leaves', authenticateJWT, (req: AuthenticatedRequest, res) => {
  const { start_date, end_date, reason, is_half_day } = req.body as { start_date: string; end_date: string; reason: string; is_half_day?: boolean };
  const userPayload = req.user!;

  if (!start_date || !end_date || !reason) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const emp = db.getEmployeeById(userPayload.id);
  if (!emp) {
    return res.status(404).json({ error: 'Employee details not found' });
  }

  const holidays = db.getHolidays();
  const existingLeaves = db.getLeaveRequests().filter(l => l.employee_id === emp.id);

  // Check duplicate dates overlap
  const requestDates = getDatesInRange(start_date, end_date);
  const overlapping = existingLeaves.some(req => {
    if (req.status === 'Rejected') return false;
    const reqDates = getDatesInRange(req.start_date, req.end_date);
    return requestDates.some(rd => reqDates.includes(rd));
  });

  if (overlapping) {
    return res.status(400).json({ error: 'Leave request overlaps with another applied/approved leave!' });
  }

  const breakdown = calculateLeaveDays(start_date, end_date, holidays, existingLeaves, undefined, is_half_day);

  const calendarDaysCount = is_half_day ? (getDatesInRange(start_date, end_date).length * 0.5) : getDatesInRange(start_date, end_date).length;

  // Create Leave Application
  const newLeave: LeaveRequest = {
    leave_id: 'L_' + Math.random().toString(36).substr(2, 9).toUpperCase(),
    employee_id: emp.id,
    employee_name: emp.full_name,
    leave_type: 'Leave',
    start_date,
    end_date,
    reason,
    total_leave_days: calendarDaysCount,
    sandwich_leave_days: breakdown.sandwichLeaveDays,
    status: 'Pending',
    applied_date: new Date().toISOString(),
    approved_by: null,
    admin_remarks: null,
    breakdown // Store breakdown for audit visibility
  };

  db.insertLeaveRequest(newLeave);

  // Send email to administrator Paritosh dynamically
  sendLeaveRequestEmail(newLeave, req).catch(err => {
    console.error('Asynchronous leave request email dispatch failed:', err);
  });

  // Log audit
  db.addAuditLog(
    'LEAVE_APPLY',
    emp.id,
    emp.full_name,
    `Applied for leave (${start_date} to ${end_date}) totaling ${breakdown.totalDeduction} days.`
  );

  // Notify admins
  db.addNotification(
    'admin-uuid-0000-0000-000000000000', // notify default admin
    `New Leave Request - ${emp.full_name}`,
    `${emp.full_name} applied for leave from ${start_date} to ${end_date}. (${breakdown.totalDeduction} days deduction)`,
    'leave_applied'
  );

  res.status(201).json({
    message: 'Leave application submitted successfully.',
    leaveRequest: newLeave
  });
});

// Approve Leave Request (Admin Only)
app.post('/api/leaves/:id/approve', authenticateJWT, requireAdmin, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { admin_remarks } = req.body;

  const leave = db.getLeaveRequestById(id);
  if (!leave) {
    return res.status(404).json({ error: 'Leave request not found' });
  }

  if (leave.status !== 'Pending') {
    return res.status(400).json({ error: 'Leave request has already been processed.' });
  }

  const emp = db.getEmployeeById(leave.employee_id);
  if (!emp) {
    return res.status(404).json({ error: 'Employee on this application not found' });
  }

  // Update leave status
  leave.status = 'Approved';
  leave.approved_by = req.user!.full_name;
  leave.admin_remarks = admin_remarks || 'Approved by HR Administrator.';
  db.updateLeaveRequest(leave);

  // Dynamically recalculate and update employee profile balances exactly according to 10-paid-leave formula
  syncEmployeeLeaveBalance(emp.id);

  // Send Email Notification to dynamic employee email Address
  sendLeaveApprovalEmail(emp.id, leave, req).catch(err => {
    console.error('Async leave approval notification email dispatch failed:', err);
  });

  // Log audit
  db.addAuditLog(
    'LEAVE_APPROVE',
    req.user!.id,
    req.user!.full_name,
    `Approved Leave Request ID: ${leave.leave_id} for ${emp.full_name}. Registered ${leave.total_leave_days} days.`
  );

  // Notify Employee
  db.addNotification(
    emp.id,
    'Your leave has been Approved!',
    `Your request for leave (${leave.start_date} to ${leave.end_date}) was approved. Remarks: ${leave.admin_remarks}`,
    'leave_status'
  );

  res.json({ message: 'Leave request approved successfully.', leaveRequest: leave });
});

// Reject Leave Request (Admin Only)
app.post('/api/leaves/:id/reject', authenticateJWT, requireAdmin, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { admin_remarks } = req.body;

  const leave = db.getLeaveRequestById(id);
  if (!leave) {
    return res.status(404).json({ error: 'Leave request not found' });
  }

  if (leave.status !== 'Pending') {
    return res.status(400).json({ error: 'Leave request has already been processed.' });
  }

  // Update Status
  leave.status = 'Rejected';
  leave.approved_by = req.user!.full_name;
  leave.admin_remarks = admin_remarks || 'Rejected by HR Administrator.';
  db.updateLeaveRequest(leave);

  const emp = db.getEmployeeById(leave.employee_id);

  // Send Rejection Email Notification via Resend
  if (emp) {
    sendLeaveRejectionEmail(emp.id, leave, req).catch(err => {
      console.error('Async leave rejection notification email dispatch failed:', err);
    });
  }

  // Log audit
  db.addAuditLog(
    'LEAVE_REJECT',
    req.user!.id,
    req.user!.full_name,
    `Rejected Leave Request ID: ${leave.leave_id} for ${emp ? emp.full_name : 'Unknown'}.`
  );

  // Notify Employee
  if (emp) {
    db.addNotification(
      emp.id,
      'Your leave has been Rejected',
      `Your request for ${leave.leave_type} (${leave.start_date} to ${leave.end_date}) was rejected. Remarks: ${leave.admin_remarks}`,
      'leave_status'
    );
  }

  res.json({ message: 'Leave request rejected.', leaveRequest: leave });
});

// --- HOLIDAY CALENDAR API ---

// Get holidays list
app.get('/api/holidays', (req, res) => {
  res.json(db.getHolidays());
});

// Add holiday (Admin Only)
app.post('/api/holidays', authenticateJWT, requireAdmin, (req: AuthenticatedRequest, res) => {
  const { holiday_name, holiday_date, holiday_type } = req.body;
  if (!holiday_name || !holiday_date || !holiday_type) {
    return res.status(400).json({ error: 'All parameters (holiday_name, holiday_date, holiday_type) are required.' });
  }

  const existing = db.getHolidays().find(h => h.holiday_date === holiday_date);
  if (existing) {
    return res.status(400).json({ error: `A holiday already exists on ${holiday_date}: ${existing.holiday_name}` });
  }

  const newHol: Holiday = {
    holiday_id: 'H_' + Math.random().toString(36).substr(2, 9).toUpperCase(),
    holiday_name,
    holiday_date,
    holiday_type
  };

  db.insertHoliday(newHol);

  // Log audit
  db.addAuditLog(
    'HOLIDAY_CREATE',
    req.user!.id,
    req.user!.full_name,
    `Added company holiday: ${holiday_name} (${holiday_date})`
  );

  // Notify everyone
  db.addNotification(
    'all',
    'New Holiday Added!',
    `${holiday_name} has been declared a ${holiday_type} holiday on ${holiday_date}.`,
    'holiday'
  );

  res.status(201).json(newHol);
});

// Delete holiday (Admin Only)
app.delete('/api/holidays/:id', authenticateJWT, requireAdmin, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const holidays = db.getHolidays();
  const hol = holidays.find(h => h.holiday_id === id);
  if (!hol) {
    return res.status(404).json({ error: 'Holiday not found' });
  }

  db.deleteHoliday(id);

  // Log audit
  db.addAuditLog(
    'HOLIDAY_DELETE',
    req.user!.id,
    req.user!.full_name,
    `Deleted company holiday: ${hol.holiday_name} (${hol.holiday_date})`
  );

  res.json({ message: 'Holiday deleted successfully' });
});

// --- ATTENDANCE TRACKING API ---

// Get Attendance records
app.get('/api/attendance', authenticateJWT, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  let attendance = db.getAttendance();

  if (user.role !== 'Admin') {
    attendance = attendance.filter(a => a.employee_id === user.id);
  }

  res.json(attendance);
});

// Check-In (Current user)
app.post('/api/attendance/check-in', authenticateJWT, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const todayStr = new Date().toISOString().split('T')[0];
  const nowTime = new Date().toTimeString().split(' ')[0]; // HH:MM:SS

  const record = db.checkIn(user.id, todayStr, nowTime);
  db.addAuditLog('ATTENDANCE_CHECK_IN', user.id, user.full_name, `Checked in today at ${nowTime}.`);

  res.json({ message: 'Checked in successfully!', record });
});

// Check-Out (Current user)
app.post('/api/attendance/check-out', authenticateJWT, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const todayStr = new Date().toISOString().split('T')[0];
  const nowTime = new Date().toTimeString().split(' ')[0];

  const record = db.checkOut(user.id, todayStr, nowTime);
  if (!record) {
    return res.status(400).json({ error: 'Cannot find check-in record for today. Check in first!' });
  }

  db.addAuditLog('ATTENDANCE_CHECK_OUT', user.id, user.full_name, `Checked out today at ${nowTime}.`);
  res.json({ message: 'Checked out successfully!', record });
});

// Log Attendance manually (Admin Only)
app.post('/api/attendance/manual', authenticateJWT, requireAdmin, (req: AuthenticatedRequest, res) => {
  const { employee_id, attendance_date, status, check_in, check_out } = req.body;

  if (!employee_id || !attendance_date || !status) {
    return res.status(400).json({ error: 'employee_id, attendance_date, and status are required' });
  }

  const newRec: Attendance = {
    attendance_id: 'ATT_' + Math.random().toString(36).substr(2, 9).toUpperCase(),
    employee_id,
    attendance_date,
    status,
    check_in: check_in || null,
    check_out: check_out || null
  };

  db.logAttendanceManual(newRec);

  const emp = db.getEmployeeById(employee_id);
  db.addAuditLog(
    'ATTENDANCE_MANUAL',
    req.user!.id,
    req.user!.full_name,
    `Manually logged attendance for ${emp ? emp.full_name : employee_id} on ${attendance_date}: Status: ${status}`
  );

  res.status(201).json(newRec);
});

// --- DASHBOARD STATISTICS & REPORTING ---

app.get('/api/dashboard/stats', authenticateJWT, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const todayStr = new Date().toISOString().split('T')[0];

  const employees = db.getEmployees();
  const holidays = db.getHolidays();
  const attendance = db.getAttendance();
  const leaves = db.getLeaveRequests();

  if (user.role === 'Admin') {
    // ADMIN DASHBOARD STATISTICS
    const totalEmployees = employees.length;
    const activeEmployees = employees.filter(e => e.is_active).length;

    // Employees on leave today
    const leavesToday = leaves.filter(l => {
      if (l.status !== 'Approved') return false;
      const dates = getDatesInRange(l.start_date, l.end_date);
      return dates.includes(todayStr);
    });

    const pendingLeaves = leaves.filter(l => l.status === 'Pending').length;
    const approvedLeavesCount = leaves.filter(l => l.status === 'Approved').length;
    const rejectedLeavesCount = leaves.filter(l => l.status === 'Rejected').length;

    // Dept counts
    const departmentWiseCount: Record<string, number> = {};
    employees.forEach(e => {
      if (e.is_active) {
        const deptKey = e.department || 'Not Set';
        departmentWiseCount[deptKey] = (departmentWiseCount[deptKey] || 0) + 1;
      }
    });

    // Attendance stats
    const todayAtt = attendance.filter(a => a.attendance_date === todayStr);
    const presentToday = todayAtt.filter(a => a.status === 'Present').length;
    const absentToday = activeEmployees - presentToday - leavesToday.length;
    const attendancePercentage = activeEmployees > 0 ? (presentToday / activeEmployees) * 100 : 0;

    // Recharts Data
    // 1. Monthly Approved/Pending trend
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyTrend = months.map((month, idx) => {
      // Keep it simple, count items by month index from applied_date
      const idxStr = String(idx).padStart(2, '0');
      const inMonth = leaves.filter(l => {
        const m = l.applied_date ? l.applied_date.substring(5, 7) : '';
        return m === idxStr || (idx + 1 === parseInt(m, 10));
      });
      return {
        month,
        approved: inMonth.filter(l => l.status === 'Approved').length,
        pending: inMonth.filter(l => l.status === 'Pending').length
      };
    });

    // 2. Leave type distribution
    const leaveTypeDistribution = [
      { name: 'Approved Leaves', value: approvedLeavesCount }
    ];

    res.json({
      role: 'Admin',
      stats: {
        totalEmployees,
        activeEmployees,
        employeesOnLeaveToday: leavesToday.length,
        employeesOnLeaveNames: leavesToday.map(l => l.employee_name),
        pendingLeaveRequests: pendingLeaves,
        approvedLeaveRequests: approvedLeavesCount,
        rejectedLeaveRequests: rejectedLeavesCount,
        departmentWiseCount,
        attendanceStats: {
          presentToday,
          absentToday: Math.max(0, absentToday),
          attendancePercentage: Math.round(attendancePercentage)
        },
        leaveStats: {
          monthlyTrend,
          leaveTypeDistribution
        }
      }
    });

  } else {
    // EMPLOYEE PORTAL DASHBOARD STATISTICS
    const emp = db.getEmployeeById(user.id);
    if (!emp) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const empLeaves = leaves.filter(l => l.employee_id === user.id);
    const empAtt = attendance.filter(a => a.employee_id === user.id);

    // Calculate attendee summary
    const presentCount = empAtt.filter(a => a.status === 'Present').length;
    const halfDayCount = empAtt.filter(a => a.status === 'Half Day').length;
    const absentCount = empAtt.filter(a => a.status === 'Absent').length;

    res.json({
      role: 'Employee',
      stats: {
        employee_id: emp.employee_id,
        full_name: emp.full_name,
        department: emp.department,
        designation: emp.designation,
        joining_date: emp.joining_date,
        leave_balance: emp.leave_balance,
        leaveHistoryCount: empLeaves.length,
        pendingLeaves: empLeaves.filter(l => l.status === 'Pending').length,
        approvedLeaves: empLeaves.filter(l => l.status === 'Approved').length,
        rejectedLeaves: empLeaves.filter(l => l.status === 'Rejected').length,
        attendanceSummary: {
          present: presentCount,
          absent: absentCount,
          halfDay: halfDayCount,
          totalLogged: empAtt.length
        }
      }
    });
  }
});

// --- NOTIFICATIONS API ---

app.get('/api/notifications', authenticateJWT, (req: AuthenticatedRequest, res) => {
  const notifs = db.getNotifications(req.user!.id);
  res.json(notifs);
});

app.post('/api/notifications/:id/read', authenticateJWT, (req, res) => {
  const success = db.markNotificationRead(req.params.id);
  res.json({ success });
});

// --- PAYROLL MANAGEMENT SYSTEM (ADMIN ONLY) ---

// Helper function to extract deduction dates and weights for an approved leave
function getPayrollDeductionDatesAndWeights(l: LeaveRequest): Array<{ date: string; weight: number }> {
  const dates = getDatesInRange(l.start_date, l.end_date);
  const isHalf = l.breakdown?.detailedDays?.[0]?.type?.toLowerCase()?.includes('half day') || false;
  const weight = isHalf ? 0.5 : 1;
  return dates.map(d => ({ date: d, weight }));
}

// Internal function to calculate payroll on the fly
function generateDraftPayroll(Y: number, M: number) {
  const employees = db.getEmployees();
  const allLeaveRequests = db.getLeaveRequests().filter(l => l.status === 'Approved');
  const monthPrefix = `${Y}-${String(M).padStart(2, '0')}`;
  const daysInMonth = new Date(Y, M, 0).getDate();

  return employees.map(emp => {
    const monthlySalary = emp.salary || 0;
    const perDaySalary = Number((monthlySalary / daysInMonth).toFixed(4));

    // Get all approved leaves of this employee sorted chronologically
    const empLeaves = allLeaveRequests
      .filter(l => l.employee_id === emp.id)
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());

    // Track accumulated leaves chronologically across year Y
    let accumulatedApprovedDays = 0;
    let paidDaysInTargetMonth = 0;
    let unpaidDaysInTargetMonth = 0;

    const leaveHistoryDetail = empLeaves.map(l => {
      const daysOfThisLeave = getPayrollDeductionDatesAndWeights(l);
      let leavePaidCount = 0;
      let leaveUnpaidCount = 0;

      daysOfThisLeave.forEach(day => {
        // Only evaluate if it belongs to year Y
        if (new Date(day.date).getFullYear() !== Y) return;

        accumulatedApprovedDays += day.weight;

        // Is it part of the target month M?
        const isInMonth = day.date.startsWith(monthPrefix);

        if (accumulatedApprovedDays <= 10) {
          leavePaidCount += day.weight;
          if (isInMonth) {
            paidDaysInTargetMonth += day.weight;
          }
        } else {
          // Splitting handle if it crossed exactly at this day
          const prevAccumulated = accumulatedApprovedDays - day.weight;
          if (prevAccumulated < 10) {
            const paidPart = 10 - prevAccumulated;
            const unpaidPart = day.weight - paidPart;
            leavePaidCount += paidPart;
            leaveUnpaidCount += unpaidPart;
            if (isInMonth) {
              paidDaysInTargetMonth += paidPart;
              unpaidDaysInTargetMonth += unpaidPart;
            }
          } else {
            leaveUnpaidCount += day.weight;
            if (isInMonth) {
              unpaidDaysInTargetMonth += day.weight;
            }
          }
        }
      });

      return {
        leave_id: l.leave_id,
        start_date: l.start_date,
        end_date: l.end_date,
        total_days: l.total_leave_days,
        reason: l.reason,
        paid_days: leavePaidCount,
        unpaid_days: leaveUnpaidCount,
        status: l.status
      };
    });

    const approvedLeavesUsedInMonth = paidDaysInTargetMonth + unpaidDaysInTargetMonth;
    const remainingPaidLeaves = Math.max(0, 10 - accumulatedApprovedDays);
    const salaryDeduction = Number((perDaySalary * unpaidDaysInTargetMonth).toFixed(2));
    const netPayableSalary = Number(Math.max(0, monthlySalary - salaryDeduction).toFixed(2));

    return {
      employee_id: emp.id,
      employee_name: emp.full_name,
      employee_id_display: emp.employee_id,
      department: emp.department || 'Operations',
      monthly_salary: monthlySalary,
      profile_availed: emp.leave_balance?.availed !== undefined ? emp.leave_balance.availed : accumulatedApprovedDays,
      profile_left: emp.leave_balance?.paid_remaining !== undefined ? emp.leave_balance.paid_remaining : remainingPaidLeaves,
      approved_leaves_used: approvedLeavesUsedInMonth,
      remaining_paid_leaves: emp.leave_balance?.paid_remaining !== undefined ? emp.leave_balance.paid_remaining : remainingPaidLeaves,
      unpaid_leaves: unpaidDaysInTargetMonth,
      per_day_salary: perDaySalary,
      salary_deduction: salaryDeduction,
      net_payable_salary: netPayableSalary,
      leave_history: leaveHistoryDetail,
      month: M,
      year: Y
    };
  });
}

// 1. Calculate Dynamically computed payroll details on-the-fly (Admin Only)
app.get('/api/payroll/calculate', authenticateJWT, requireAdmin, (req, res) => {
  const month = parseInt(req.query.month as string);
  const year = parseInt(req.query.year as string);

  if (!month || !year || isNaN(month) || isNaN(year)) {
    return res.status(400).json({ error: 'Please select a valid Month and Year combination.' });
  }

  try {
    const list = generateDraftPayroll(year, month);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: `Failed to calculate payroll: ${err?.message || err}` });
  }
});

// 2. Fetch locked/saved payroll records history (Admin Only)
app.get('/api/payroll/history', authenticateJWT, requireAdmin, (req, res) => {
  const records = db.getPayrollRecords();
  res.json(records);
});

// 3. Freeze & save payroll calculation records for future logs viewing (Admin Only)
app.post('/api/payroll/save', authenticateJWT, requireAdmin, (req: AuthenticatedRequest, res) => {
  const { month, year, records } = req.body;

  if (!month || !year || !Array.isArray(records)) {
    return res.status(400).json({ error: 'Month, Year, and valid records array are required.' });
  }

  try {
    const processedBy = req.user!.full_name;
    const processedAt = new Date().toISOString();

    const stampedRecords = records.map((r: any) => ({
      id: r.id || `PAY_${year}_${String(month).padStart(2, '0')}_${r.employee_id.substring(0, 8)}`,
      employee_id: r.employee_id,
      employee_name: r.employee_name,
      employee_id_display: r.employee_id_display,
      department: r.department,
      month: parseInt(month),
      year: parseInt(year),
      monthly_salary: parseFloat(r.monthly_salary),
      profile_availed: r.profile_availed !== undefined ? parseFloat(r.profile_availed) : undefined,
      profile_left: r.profile_left !== undefined ? parseFloat(r.profile_left) : undefined,
      approved_leaves_used: parseFloat(r.approved_leaves_used),
      remaining_paid_leaves: parseFloat(r.remaining_paid_leaves),
      unpaid_leaves: parseFloat(r.unpaid_leaves),
      per_day_salary: parseFloat(r.per_day_salary),
      salary_deduction: parseFloat(r.salary_deduction),
      net_payable_salary: parseFloat(r.net_payable_salary),
      status: 'Processed' as const,
      processed_at: processedAt,
      processed_by: processedBy
    }));

    db.savePayrollRecords(stampedRecords);

    // 1. Send Salary Advice Emails to all dynamic employee addresses asynchronously
    stampedRecords.forEach((record: any) => {
      sendMonthlyPayrollEmail(record.employee_id, record, req).catch(err => {
        console.error(`Async payslip email dispatch failed for ${record.employee_name}:`, err);
      });
    });

    // 2. Compute dynamic payroll summary stats
    let totalPayrollAmount = 0;
    let totalDeductions = 0;
    let deductionCount = 0;

    stampedRecords.forEach((record: any) => {
      totalPayrollAmount += record.net_payable_salary || 0;
      totalDeductions += record.salary_deduction || 0;
      if (record.salary_deduction > 0) {
        deductionCount++;
      }
    });

    // 3. Send Payroll Summary Email to paritoshbadave@gmail.com
    sendAdminPayrollSummaryEmail({
      totalEmployees: stampedRecords.length,
      totalPayrollAmount,
      totalDeductions,
      deductionCount,
      month: parseInt(month),
      year: parseInt(year)
    }, req).catch(err => {
      console.error('Async administrator payroll summary email dispatch failed:', err);
    });

    // Audit logs
    db.addAuditLog(
      'PAYROLL_PROCESS',
      req.user!.id,
      processedBy,
      `Saved & processed ${stampedRecords.length} payroll records for Month: ${month}, Year: ${year}.`
    );

    res.json({
      success: true,
      message: `Successfully processed and saved ${stampedRecords.length} payroll records in payroll history.`
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to save payroll records: ${err?.message || err}` });
  }
});

// 4. Manually trigger salary credit & deduction email advice (Admin Only)
app.post('/api/payroll/send-advice', authenticateJWT, requireAdmin, async (req, res) => {
  const { employeeId, record } = req.body;

  if (!employeeId || !record) {
    return res.status(400).json({ error: 'Employee ID and record details are required.' });
  }

  try {
    await sendMonthlyPayrollEmail(employeeId, record, req);
    res.json({
      success: true,
      message: `Salary Deduction & Net Salary Credit Advice email successfully dispatched manually to the employee.`
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to dispatch salary advice email: ${err?.message || err}` });
  }
});

// --- AUDIT LOGS FOR ADMIN ---
app.get('/api/audit-logs', authenticateJWT, requireAdmin, (req, res) => {
  res.json(db.getAuditLogs());
});

// --- DATABASE PERSISTENCE STATUS ---
app.get('/api/db/status', (req, res) => {
  res.json(db.getSupabaseStatus());
});

app.post('/api/db/retry', async (req, res) => {
  const status = await db.retryConnection();
  res.json(status);
});

app.post('/api/db/configure', async (req, res) => {
  const { supabaseUrl, supabaseAnonKey } = req.body;
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(400).json({ error: 'Supabase URL and Anon Key are required.' });
  }
  const result = await db.testAndSaveSupabaseConfig(supabaseUrl, supabaseAnonKey);
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }
  res.json({ message: result.message, status: db.getSupabaseStatus() });
});

// --- CLOUD DATABASE TELEMETRY & FORCE SYNC ---
app.get('/api/db/telemetry', async (req, res) => {
  const tel = await db.getSupabaseTelemetry();
  res.json(tel);
});

app.post('/api/db/force-push', async (req, res) => {
  const result = await db.forcePushToSupabase();
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }
  res.json(result);
});

app.post('/api/db/force-pull', async (req, res) => {
  const result = await db.forcePullFromSupabase();
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }
  res.json(result);
});

// --- GLOBAL ERROR MAPPING FOR API ---
app.use('/api', (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Uncaught Server Error on API route:', err);
  res.status(500).json({
    error: err.message || 'An unexpected internal server error occurred.'
  });
});

// --- VITE MIDDLEWARE OR STATIC SERVER AT BOTTOM ---

const startServer = async () => {
  // Load data from Supabase if configured (non-blocking fallback to local JSON file)
  try {
    await db.loadSupabaseIfConfigured();
  } catch (err) {
    console.error('Error in startup database synchronization:', err);
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HRMS Server running on http://0.0.0.0:${PORT}`);
  });
};

startServer().catch(err => {
  console.error('Failed to start HRMS server:', err);
});
