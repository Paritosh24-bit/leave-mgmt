import { LeaveRequest, Holiday } from '../types';

export interface LeaveBreakdown {
  regularLeaveDays: number;
  sandwichLeaveDays: number;
  holidayDays: number;
  totalDeduction: number;
  detailedDays: Array<{
    date: string;
    dayOfWeek: string;
    type: string;
  }>;
}

/**
 * Normalizes a date to YYYY-MM-DD string
 */
export function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Generates an array of date strings between start and end (inclusive)
 */
export function getDatesInRange(startDateStr: string, endDateStr: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return [];
  }

  const current = new Date(start);
  while (current <= end) {
    dates.push(formatDateStr(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

/**
 * Checks if a given day is Sunday
 */
export function isSunday(dateStr: string): boolean {
  const day = new Date(dateStr).getDay();
  return day === 0;
}

/**
 * Checks if a given day is Saturday
 */
export function isSaturday(dateStr: string): boolean {
  const day = new Date(dateStr).getDay();
  return day === 6;
}

/**
 * Finds the closest preceding working day (not Sunday and not holiday)
 * Returns the date string and whether it was a leave day
 */
function findClosestPrecedingWorkingDay(
  targetDateStr: string,
  requestDatesSet: Set<string>,
  approvedLeaveDatesSet: Set<string>,
  holidayDatesSet: Set<string>
): { dateStr: string; isLeave: boolean } {
  const target = new Date(targetDateStr);
  let current = new Date(target);
  
  // Search back up to 14 days
  for (let i = 1; i <= 14; i++) {
    current.setDate(current.getDate() - 1);
    const currentStr = formatDateStr(current);
    
    // Check if it is a working day (not Sunday, not holiday)
    const isSun = current.getDay() === 0;
    const isHol = holidayDatesSet.has(currentStr);
    
    if (!isSun && !isHol) {
      // It is a working day (can be Saturday or weekday)
      const isLeave = requestDatesSet.has(currentStr) || approvedLeaveDatesSet.has(currentStr);
      return { dateStr: currentStr, isLeave };
    }
  }
  
  return { dateStr: '', isLeave: false };
}

/**
 * Finds the closest succeeding working day (not Sunday and not holiday)
 * Returns the date string and whether it was a leave day
 */
function findClosestSucceedingWorkingDay(
  targetDateStr: string,
  requestDatesSet: Set<string>,
  approvedLeaveDatesSet: Set<string>,
  holidayDatesSet: Set<string>
): { dateStr: string; isLeave: boolean } {
  const target = new Date(targetDateStr);
  let current = new Date(target);
  
  // Search forward up to 14 days
  for (let i = 1; i <= 14; i++) {
    current.setDate(current.getDate() + 1);
    const currentStr = formatDateStr(current);
    
    // Check if it is a working day (not Sunday, not holiday)
    const isSun = current.getDay() === 0;
    const isHol = holidayDatesSet.has(currentStr);
    
    if (!isSun && !isHol) {
      // It is a working day (can be Saturday or weekday)
      const isLeave = requestDatesSet.has(currentStr) || approvedLeaveDatesSet.has(currentStr);
      return { dateStr: currentStr, isLeave };
    }
  }
  
  return { dateStr: '', isLeave: false };
}

/**
 * Dynamic sandwich leave calculation engine
 * Calculates the breakdown of leave days, sandwich leaves, and free holidays
 */
export function calculateLeaveDays(
  startDateStr: string,
  endDateStr: string,
  allHolidays: Holiday[],
  approvedLeaves: LeaveRequest[] = [],
  currentLeaveId?: string, // to ignore current request when recalculating
  isHalfDay?: boolean
): LeaveBreakdown {
  const holidayDatesSet = new Set(allHolidays.map(h => h.holiday_date));
  const requestDates = getDatesInRange(startDateStr, endDateStr);
  const requestDatesSet = new Set(requestDates);
  
  // Collect all approved leave dates of the employee (ignoring current if updating)
  const approvedLeaveDatesSet = new Set<string>();
  approvedLeaves.forEach(req => {
    if (currentLeaveId && req.leave_id === currentLeaveId) return;
    if (req.status === 'Approved') {
      const dates = getDatesInRange(req.start_date, req.end_date);
      dates.forEach(d => approvedLeaveDatesSet.add(d));
    }
  });

  const detailedDays: LeaveBreakdown['detailedDays'] = [];
  let regularLeaveDays = 0;
  let sandwichLeaveDays = 0;
  let holidayDays = 0;
  let totalDeduction = 0;

  const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  for (const dateStr of requestDates) {
    const tempDate = new Date(dateStr);
    const dayOfWeekIdx = tempDate.getDay();
    const dayOfWeek = weekdayNames[dayOfWeekIdx];
    
    const isSun = dayOfWeekIdx === 0;
    const isSat = dayOfWeekIdx === 6;
    const isHol = holidayDatesSet.has(dateStr);

    if (isSun) {
      // Sunday weekly off: check if sandwiched
      const prec = findClosestPrecedingWorkingDay(dateStr, requestDatesSet, approvedLeaveDatesSet, holidayDatesSet);
      const succ = findClosestSucceedingWorkingDay(dateStr, requestDatesSet, approvedLeaveDatesSet, holidayDatesSet);
      
      if (prec.isLeave && succ.isLeave) {
        const val = isHalfDay ? 0.5 : 1;
        sandwichLeaveDays += val;
        totalDeduction += val;
        detailedDays.push({
          date: dateStr,
          dayOfWeek,
          type: isHalfDay ? 'Sunday (Sandwich - Half Day)' : 'Sunday (Sandwich Leave)'
        });
      } else {
        holidayDays++;
        detailedDays.push({
          date: dateStr,
          dayOfWeek,
          type: 'Sunday (Weekly Off - Free)'
        });
      }
    } else if (isHol) {
      // Company Holiday: check if sandwiched
      const prec = findClosestPrecedingWorkingDay(dateStr, requestDatesSet, approvedLeaveDatesSet, holidayDatesSet);
      const succ = findClosestSucceedingWorkingDay(dateStr, requestDatesSet, approvedLeaveDatesSet, holidayDatesSet);
      
      if (prec.isLeave && succ.isLeave) {
        const val = isHalfDay ? 0.5 : 1;
        sandwichLeaveDays += val;
        totalDeduction += val;
        detailedDays.push({
          date: dateStr,
          dayOfWeek,
          type: isHalfDay ? 'Holiday (Sandwich - Half Day)' : 'Holiday (Sandwich Leave)'
        });
      } else {
        holidayDays++;
        detailedDays.push({
          date: dateStr,
          dayOfWeek,
          type: 'Holiday (Free)'
        });
      }
    } else if (isSat) {
      // Saturday: All Saturdays are working days
      const val = isHalfDay ? 0.5 : 1;
      regularLeaveDays += val;
      totalDeduction += val;
      detailedDays.push({
        date: dateStr,
        dayOfWeek,
        type: isHalfDay ? 'Saturday (Half Day - 0.5 Deducted)' : 'Saturday (Deducted)'
      });
    } else {
      // Monday - Friday (regular working day)
      const val = isHalfDay ? 0.5 : 1;
      regularLeaveDays += val;
      totalDeduction += val;
      detailedDays.push({
        date: dateStr,
        dayOfWeek,
        type: isHalfDay ? 'Working Day (Half Day - 0.5 Deducted)' : 'Working Day (Deducted)'
      });
    }
  }

  return {
    regularLeaveDays,
    sandwichLeaveDays,
    holidayDays,
    totalDeduction,
    detailedDays
  };
}
