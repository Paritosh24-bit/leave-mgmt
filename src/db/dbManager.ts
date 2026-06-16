import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Employee, LeaveRequest, Holiday, Attendance, AuditLog, Notification, PayrollRecord } from '../types';

interface DatabaseSchema {
  employees: Employee[];
  leaveRequests: LeaveRequest[];
  holidays: Holiday[];
  attendance: Attendance[];
  auditLogs: AuditLog[];
  notifications: Notification[];
  payrollRecords?: PayrollRecord[];
}

const DB_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'hrms_db.json');

const DEFAULT_HOLIDAYS: Holiday[] = [
  { holiday_id: 'H101', holiday_name: "Maharashtra Day", holiday_date: '2026-05-01', holiday_type: 'National' },
  { holiday_id: 'H102', holiday_name: "Independence Day", holiday_date: '2026-08-15', holiday_type: 'National' },
  { holiday_id: 'H103', holiday_name: "Raksha Bandhan", holiday_date: '2026-08-28', holiday_type: 'National' },
  { holiday_id: 'H104', holiday_name: "Ganpati", holiday_date: '2026-09-14', holiday_type: 'National' },
  { holiday_id: 'H105', holiday_name: "Anant Chaturdashi", holiday_date: '2026-09-25', holiday_type: 'National' },
  { holiday_id: 'H106', holiday_name: "Gandhi Jayanti", holiday_date: '2026-10-02', holiday_type: 'National' },
  { holiday_id: 'H107', holiday_name: "Dasara", holiday_date: '2026-10-20', holiday_type: 'National' },
  { holiday_id: 'H108_1', holiday_name: "Diwali Holiday (Day 1)", holiday_date: '2026-11-05', holiday_type: 'National' },
  { holiday_id: 'H108_2', holiday_name: "Diwali Holiday (Day 2)", holiday_date: '2026-11-06', holiday_type: 'National' },
  { holiday_id: 'H108_3', holiday_name: "Diwali Holiday (Day 3)", holiday_date: '2026-11-07', holiday_type: 'National' },
  { holiday_id: 'H108_4', holiday_name: "Diwali Holiday (Day 4)", holiday_date: '2026-11-09', holiday_type: 'National' },
  { holiday_id: 'H108_5', holiday_name: "Diwali Holiday (Day 5)", holiday_date: '2026-11-10', holiday_type: 'National' },
  { holiday_id: 'H108_6', holiday_name: "Diwali Holiday (Day 6)", holiday_date: '2026-11-11', holiday_type: 'National' },
  { holiday_id: 'H109', holiday_name: "Christmas", holiday_date: '2026-12-25', holiday_type: 'National' },
  { holiday_id: 'H110', holiday_name: "New Year", holiday_date: '2027-01-01', holiday_type: 'National' },
  { holiday_id: 'H111', holiday_name: "Republic Day", holiday_date: '2027-01-26', holiday_type: 'National' },
  { holiday_id: 'H112', holiday_name: "Holi", holiday_date: '2027-03-22', holiday_type: 'National' },
  { holiday_id: 'H113', holiday_name: "Gudipadwa", holiday_date: '2027-04-07', holiday_type: 'National' }
];

class DBManager {
  private memoryDb: DatabaseSchema | null = null;
  private supabaseClient: SupabaseClient | null = null;
  private useSupabase: boolean = false;
  private supabaseStatus: 'connected' | 'not_configured' | 'error' = 'not_configured';
  private supabaseErrorMessage: string = '';

  constructor() {
    this.loadConfigFromFile();
    this.initSupabaseClient();
    this.ensureDbInitialized();
  }

  private loadConfigFromFile() {
    try {
      const configPath = path.join(DB_DIR, 'supabase_config.json');
      if (fs.existsSync(configPath)) {
        const fileContent = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(fileContent);
        if (config.supabaseUrl && config.supabaseAnonKey) {
          process.env.SUPABASE_URL = config.supabaseUrl;
          process.env.SUPABASE_ANON_KEY = config.supabaseAnonKey;
          console.log('Loaded Supabase config override from data/supabase_config.json');
        }
      }
    } catch (err) {
      console.error('Failed to load Supabase overrides from file:', err);
    }
  }

  public async testAndSaveSupabaseConfig(urlStr: string, keyStr: string): Promise<{ success: boolean; message: string }> {
    const url = urlStr.trim();
    const key = keyStr.trim();

    if (!url || !key) {
      return { success: false, message: 'URL and Anon Key are required.' };
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return { success: false, message: 'Supabase URL must start with http:// or https://' };
    }

    try {
      // 1. Create a potential client to test
      const testClient = createClient(url, key);

      // 2. Perform a test query to verify if table and access works
      const { data, error } = await testClient
        .from('hrms_persistent_db')
        .select('data')
        .eq('id', 1)
        .maybeSingle();

      if (error) {
        if (error.code === '42P01') {
          return {
            success: false,
            message: 'Connected to Supabase! However, the table "hrms_persistent_db" was not found. Please create the table in your Supabase SQL Editor first using: "create table hrms_persistent_db (id bigint primary key, data jsonb, updated_at timestamp with time zone);"'
          };
        }
        throw error;
      }

      // 3. Write config to data/supabase_config.json for persistence across app container updates/reloads
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
      }
      const configPath = path.join(DB_DIR, 'supabase_config.json');
      fs.writeFileSync(configPath, JSON.stringify({ supabaseUrl: url, supabaseAnonKey: key }, null, 2), 'utf-8');

      // 4. Update memory and process environment state
      process.env.SUPABASE_URL = url;
      process.env.SUPABASE_ANON_KEY = key;
      this.supabaseClient = testClient;
      this.useSupabase = true;
      this.supabaseStatus = 'connected';
      this.supabaseErrorMessage = '';

      // 5. Synchronize data: Bidirectional merging to ensure no data is lost!
      const currentLocal = this.memoryDb || this.getInitialSeededData();
      if (data && data.data) {
        const retrievedSchema = data.data as any;
        const isSchemaInitialized = retrievedSchema &&
                                    typeof retrievedSchema === 'object' &&
                                    Array.isArray(retrievedSchema.employees) &&
                                    retrievedSchema.employees.length > 0;

        if (isSchemaInitialized) {
          console.log('Synchronizing state: Bidirectional merge between local cache and Supabase.');
          const mergedSchema = this.mergeDatabaseSchemas(currentLocal, retrievedSchema);
          this.memoryDb = mergedSchema;
          if (!this.useSupabase) {
            fs.writeFileSync(DB_FILE, JSON.stringify(this.memoryDb, null, 2), 'utf-8');
          }
          await this.saveToSupabase(this.memoryDb);
        } else {
          console.log('Synchronizing state: Supabase DB cell is blank. Seeding from current local database cache.');
          await this.saveToSupabase(currentLocal);
        }
      } else {
        console.log('Synchronizing state: Row does not exist in hrms_persistent_db. Inserting current local data.');
        await this.supabaseClient
          .from('hrms_persistent_db')
          .insert([{ id: 1, data: currentLocal, updated_at: new Date().toISOString() }]);
      }

      return { success: true, message: 'Supabase URL and Anon Key are validated and configured successfully! Your data is now fully synchronized.' };
    } catch (err: any) {
      const errMsg = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err)) || 'Unknown connection error';
      return { success: false, message: `Could not connect to Supabase: ${errMsg}. Please check your credentials.` };
    }
  }

  private mergeDatabaseSchemas(local: DatabaseSchema, remote: DatabaseSchema): DatabaseSchema {
    const employeeMap = new Map<string, Employee>();
    
    // Add remote employees
    if (remote.employees && Array.isArray(remote.employees)) {
      remote.employees.forEach(e => {
        if (e && e.id) employeeMap.set(e.id, e);
      });
    }

    // Add/merge local employees
    if (local.employees && Array.isArray(local.employees)) {
      local.employees.forEach(e => {
        if (e && e.id) {
          const existing = employeeMap.get(e.id);
          if (!existing) {
            employeeMap.set(e.id, e);
          } else {
            const extTime = new Date(existing.updated_at || existing.created_at || 0).getTime();
            const locTime = new Date(e.updated_at || e.created_at || 0).getTime();
            if (locTime > extTime) {
              employeeMap.set(e.id, e);
            }
          }
        }
      });
    }

    const leaveMap = new Map<string, LeaveRequest>();
    if (remote.leaveRequests && Array.isArray(remote.leaveRequests)) {
      remote.leaveRequests.forEach(l => {
        if (l && l.leave_id) leaveMap.set(l.leave_id, l);
      });
    }
    if (local.leaveRequests && Array.isArray(local.leaveRequests)) {
      local.leaveRequests.forEach(l => {
        if (l && l.leave_id) {
          const existing = leaveMap.get(l.leave_id);
          if (!existing) {
            leaveMap.set(l.leave_id, l);
          } else if (l.status === 'Approved' && existing.status !== 'Approved') {
            leaveMap.set(l.leave_id, l);
          }
        }
      });
    }

    const holidayMap = new Map<string, Holiday>();
    if (remote.holidays && Array.isArray(remote.holidays)) {
      remote.holidays.forEach(h => {
        if (h && h.holiday_id) holidayMap.set(h.holiday_id, h);
      });
    }
    if (local.holidays && Array.isArray(local.holidays)) {
      local.holidays.forEach(h => {
        if (h && h.holiday_id) holidayMap.set(h.holiday_id, h);
      });
    }

    const attMap = new Map<string, Attendance>();
    if (remote.attendance && Array.isArray(remote.attendance)) {
      remote.attendance.forEach(a => {
        if (a && a.employee_id) attMap.set(`${a.employee_id}_${a.attendance_date}`, a);
      });
    }
    if (local.attendance && Array.isArray(local.attendance)) {
      local.attendance.forEach(a => {
        if (a && a.employee_id) {
          const key = `${a.employee_id}_${a.attendance_date}`;
          attMap.set(key, a);
        }
      });
    }

    const logMap = new Map<string, AuditLog>();
    if (remote.auditLogs && Array.isArray(remote.auditLogs)) {
      remote.auditLogs.forEach(g => {
        if (g && g.log_id) logMap.set(g.log_id, g);
      });
    }
    if (local.auditLogs && Array.isArray(local.auditLogs)) {
      local.auditLogs.forEach(g => {
        if (g && g.log_id) logMap.set(g.log_id, g);
      });
    }

    const notifMap = new Map<string, Notification>();
    if (remote.notifications && Array.isArray(remote.notifications)) {
      remote.notifications.forEach(n => {
        if (n && n.notification_id) notifMap.set(n.notification_id, n);
      });
    }
    if (local.notifications && Array.isArray(local.notifications)) {
      local.notifications.forEach(n => {
        if (n && n.notification_id) notifMap.set(n.notification_id, n);
      });
    }

    const payrollMap = new Map<string, PayrollRecord>();
    if (remote.payrollRecords && Array.isArray(remote.payrollRecords)) {
      remote.payrollRecords.forEach(p => {
        if (p && p.id) payrollMap.set(p.id, p);
      });
    }
    if (local.payrollRecords && Array.isArray(local.payrollRecords)) {
      local.payrollRecords.forEach(p => {
        if (p && p.id) payrollMap.set(p.id, p);
      });
    }

    return {
      employees: Array.from(employeeMap.values()),
      leaveRequests: Array.from(leaveMap.values()),
      holidays: Array.from(holidayMap.values()),
      attendance: Array.from(attMap.values()),
      auditLogs: Array.from(logMap.values()).sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 500),
      notifications: Array.from(notifMap.values()).sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 200),
      payrollRecords: Array.from(payrollMap.values())
    };
  }

  public async forcePushToSupabase(): Promise<{ success: boolean; message: string }> {
    if (!this.useSupabase || !this.supabaseClient) {
      return { success: false, message: 'Supabase is not configured or offline.' };
    }
    this.ensureDbInitialized();
    if (!this.memoryDb) {
      return { success: false, message: 'Local memory database is not loaded/initialized.' };
    }

    try {
      const { error } = await this.supabaseClient
        .from('hrms_persistent_db')
        .upsert({ id: 1, data: this.memoryDb, updated_at: new Date().toISOString() });

      if (error) throw error;
      return { success: true, message: `Successfully pushed all local memory dataset (${this.memoryDb.employees.length} employees) to cell id:1 in Supabase hrms_persistent_db.` };
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      return { success: false, message: `Could not push database to cloud: ${errMsg}` };
    }
  }

  public async forcePullFromSupabase(): Promise<{ success: boolean; message: string }> {
    if (!this.useSupabase || !this.supabaseClient) {
      return { success: false, message: 'Supabase is not configured or offline.' };
    }

    try {
      const { data, error } = await this.supabaseClient
        .from('hrms_persistent_db')
        .select('data, updated_at')
        .eq('id', 1)
        .maybeSingle();

      if (error) throw error;

      if (data && data.data) {
        const remoteData = data.data as DatabaseSchema;
        remoteData.holidays = DEFAULT_HOLIDAYS; // Overwrite
        if (remoteData.employees && Array.isArray(remoteData.employees)) {
          this.memoryDb = remoteData;
          if (!this.useSupabase) {
            fs.writeFileSync(DB_FILE, JSON.stringify(this.memoryDb, null, 2), 'utf-8');
          }
          return { success: true, message: `Successfully pulled and overrode local storage with Supabase cloud backup containing ${remoteData.employees.length} employees.` };
        }
      }
      return { success: false, message: 'Supabase database is empty/blank on index row 1.' };
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      return { success: false, message: `Could not pull database from cloud: ${errMsg}` };
    }
  }

  public async getSupabaseTelemetry(): Promise<{ success: boolean; rowExists: boolean; employeesInCloud: string[]; lastUpdated: string | null; error?: string }> {
    if (!this.useSupabase || !this.supabaseClient) {
      return { success: false, rowExists: false, employeesInCloud: [], lastUpdated: null, error: 'Database is not configured' };
    }
    try {
      const { data, error } = await this.supabaseClient
        .from('hrms_persistent_db')
        .select('data, updated_at')
        .eq('id', 1)
        .maybeSingle();

      if (error) throw error;

      if (data && data.data) {
        const schema = data.data as DatabaseSchema;
        const employeeNames = (schema.employees || [])
          .filter(e => !e.is_deleted)
          .map(e => `${e.name || e.full_name || 'Unnamed'} [${e.employee_id || 'ID unknown'}]`);
        return {
          success: true,
          rowExists: true,
          employeesInCloud: employeeNames,
          lastUpdated: data.updated_at || null
        };
      }
      return {
        success: true,
        rowExists: false,
        employeesInCloud: [],
        lastUpdated: null
      };
    } catch (err: any) {
      return {
        success: false,
        rowExists: false,
        employeesInCloud: [],
        lastUpdated: null,
        error: err?.message || String(err)
      };
    }
  }

  private initSupabaseClient() {
    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_ANON_KEY?.trim();
    
    const isUrlPlaceholder = !url || url === '' || url.includes('YOUR_SUPABASE') || url === 'undefined' || url === 'null';
    const isKeyPlaceholder = !key || key === '' || key.includes('YOUR_SUPABASE') || key === 'undefined' || key === 'null';

    if (!isUrlPlaceholder && !isKeyPlaceholder) {
      try {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          throw new Error('Supabase URL must start with http:// or https://');
        }
        this.supabaseClient = createClient(url, key);
        this.useSupabase = true;
        this.supabaseStatus = 'connected';
      } catch (err: any) {
        const errMsg = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err)) || 'Unknown initialization error';
        console.error('Failed to initialize Supabase client:', errMsg, err);
        this.useSupabase = false;
        this.supabaseStatus = 'error';
        this.supabaseErrorMessage = `Initialization error: ${errMsg}`;
      }
    } else {
      this.useSupabase = false;
      this.supabaseStatus = 'not_configured';
    }
  }

  public getSupabaseStatus() {
    return {
      useSupabase: this.useSupabase,
      status: this.supabaseStatus,
      errorMessage: this.supabaseErrorMessage,
      supabaseUrl: process.env.SUPABASE_URL ? process.env.SUPABASE_URL : null,
      tableName: 'hrms_persistent_db'
    };
  }

  public async retryConnection() {
    this.initSupabaseClient();
    if (this.useSupabase) {
      await this.loadSupabaseIfConfigured();
    }
    return this.getSupabaseStatus();
  }

  public async uploadProofToStorage(employeeId: string, proofType: 'aadhar' | 'pan' | 'bank', base64Data: string): Promise<string> {
    if (!this.useSupabase || !this.supabaseClient) {
      return base64Data;
    }

    if (!base64Data || !base64Data.startsWith('data:')) {
      return base64Data;
    }

    try {
      const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        return base64Data;
      }

      const mimeType = matches[1];
      const base64Buffer = Buffer.from(matches[2], 'base64');
      
      let ext = 'bin';
      if (mimeType.includes('pdf')) ext = 'pdf';
      else if (mimeType.includes('png')) ext = 'png';
      else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
      else if (mimeType.includes('webp')) ext = 'webp';

      const fileName = `emp_${employeeId}_${proofType}_${Date.now()}.${ext}`;

      const { data, error } = await this.supabaseClient.storage
        .from('proofs')
        .upload(fileName, base64Buffer, {
          contentType: mimeType,
          upsert: true
        });

      if (error) {
        console.error(`Supabase storage upload error for ${proofType}:`, error.message);
        return base64Data;
      }

      const { data: publicUrlData } = this.supabaseClient.storage
        .from('proofs')
        .getPublicUrl(fileName);

      if (publicUrlData && publicUrlData.publicUrl) {
        console.log(`Successfully uploaded ${proofType} proof to Supabase Storage: ${publicUrlData.publicUrl}`);
        return publicUrlData.publicUrl;
      }

      return base64Data;
    } catch (err: any) {
      console.error(`Failed to upload ${proofType} to Supabase storage:`, err?.message || err);
      return base64Data;
    }
  }

  public async loadSupabaseIfConfigured() {
    if (!this.useSupabase || !this.supabaseClient) {
      return;
    }
    console.log('Attempting to load HRMS database from Supabase...');
    const supData = await this.loadFromSupabase();
    if (supData) {
      this.memoryDb = supData;
      
      // Overwrite holidays with DEFAULT_HOLIDAYS as requested
      if (this.memoryDb) {
        this.memoryDb.holidays = DEFAULT_HOLIDAYS;
        this.save();
      }

      this.supabaseStatus = 'connected';
      this.supabaseErrorMessage = '';
      console.log('Successfully loaded HRMS database from Supabase.');
      
      // Save loaded data to local JSON file to prevent fallback to stale, blank or reset templates
      try {
        if (!this.useSupabase) {
          if (!fs.existsSync(DB_DIR)) {
            fs.mkdirSync(DB_DIR, { recursive: true });
          }
          fs.writeFileSync(DB_FILE, JSON.stringify(supData, null, 2), 'utf-8');
        }
      } catch (fsErr) {
        console.error('Failed to sync loaded Supabase data to local cached file:', fsErr);
      }
    } else {
      console.log('Supabase failed to load. Falling back to local/cached JSON database.');
    }
  }

  private async loadFromSupabase(): Promise<DatabaseSchema | null> {
    if (!this.supabaseClient) return null;
    try {
      const { data, error } = await this.supabaseClient
        .from('hrms_persistent_db')
        .select('data')
        .eq('id', 1)
        .maybeSingle();

      if (error) {
        if (error.code === '42P01') {
          this.supabaseStatus = 'error';
          this.supabaseErrorMessage = 'Table "hrms_persistent_db" not found in Supabase. Please run the SQL setup script.';
          console.error(this.supabaseErrorMessage);
          return null;
        }
        throw error;
      }

      if (data && data.data) {
        const retrievedSchema = data.data as any;
        const isSchemaInitialized = retrievedSchema && 
                                    typeof retrievedSchema === 'object' && 
                                    Array.isArray(retrievedSchema.employees) && 
                                    retrievedSchema.employees.length > 0;

        if (!isSchemaInitialized) {
          console.log('Supabase schema is uninitialized or empty. Syncing local memory database context to Supabase...');
          
          this.supabaseStatus = 'connected';
          this.supabaseErrorMessage = '';
          
          // Use current local database (which has any newly added employee records!) or seeded defaults
          const localData = this.memoryDb || this.getInitialSeededData();
          await this.saveToSupabase(localData);
          return localData;
        }

        this.supabaseStatus = 'connected';
        this.supabaseErrorMessage = '';
        return retrievedSchema as DatabaseSchema;
      }

      // No data found (row 1 is missing, but table exists and can be written to)
      const seedData = this.getInitialSeededData();
      const { error: insertError } = await this.supabaseClient
        .from('hrms_persistent_db')
        .insert([{ id: 1, data: seedData }]);

      if (insertError) {
        throw insertError;
      }
      this.supabaseStatus = 'connected';
      this.supabaseErrorMessage = '';
      return seedData;
    } catch (err: any) {
      const errMsg = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err)) || 'Unknown database error';
      this.supabaseStatus = 'error';
      this.supabaseErrorMessage = `Database connection error: ${errMsg}`;
      console.error('Error fetching/seeding Supabase database:', errMsg, err);
      return null;
    }
  }

  private ensureDbInitialized() {
    if (this.memoryDb) {
      return;
    }

    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    if (!fs.existsSync(DB_FILE)) {
      const initialSchema = this.getInitialSeededData();
      fs.writeFileSync(DB_FILE, JSON.stringify(initialSchema, null, 2), 'utf-8');
      this.memoryDb = initialSchema;
    } else {
      try {
        const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
        this.memoryDb = JSON.parse(fileContent);

        // Run schema migration on pre-existing data is extremely elegant
        let wasMigrated = false;

        if (this.memoryDb && !this.memoryDb.payrollRecords) {
          this.memoryDb.payrollRecords = [];
          wasMigrated = true;
        }

        if (this.memoryDb && this.memoryDb.employees) {
          this.memoryDb.employees.forEach(emp => {
            // Check if they have old sub-types
            if (emp.leave_balance && ('casual' in emp.leave_balance)) {
              const approvedCount = this.memoryDb!.leaveRequests
                .filter(l => l.employee_id === emp.id && l.status === 'Approved')
                .reduce((acc, curr) => acc + curr.total_leave_days, 0);

              emp.leave_balance = {
                paid_remaining: Math.max(0, 10 - approvedCount),
                availed: approvedCount
              };
              wasMigrated = true;
            }
          });

          // Ensure leave requests types are also updated to generic 'Leave'
          this.memoryDb.leaveRequests.forEach(req => {
            if (req.leave_type !== 'Leave') {
              req.leave_type = 'Leave';
              wasMigrated = true;
            }
          });
        }

        // Always force update holidays list to the new set as requested
        if (this.memoryDb) {
          this.memoryDb.holidays = DEFAULT_HOLIDAYS;
          wasMigrated = true;
        }

        // Ensure dummy admin is present
        this.ensureAdminExists();

        if (wasMigrated) {
          this.save();
        }
      } catch (e) {
        console.error('Error loading database, resetting to seeded data', e);
        const initialSchema = this.getInitialSeededData();
        fs.writeFileSync(DB_FILE, JSON.stringify(initialSchema, null, 2), 'utf-8');
        this.memoryDb = initialSchema;
      }
    }
  }

  private ensureAdminExists() {
    if (!this.memoryDb) return;
    
    // Check and migrate any old admin email to paritoshbadave@gmail.com
    const oldAdminIndex = this.memoryDb.employees.findIndex(e => e.email === 'admin@company.com');
    if (oldAdminIndex !== -1) {
      this.memoryDb.employees[oldAdminIndex].email = 'paritoshbadave@gmail.com';
      this.save();
    }

    // Ensure First Admin exists
    const adminIndex = this.memoryDb.employees.findIndex(e => e.email === 'paritoshbadave@gmail.com');
    if (adminIndex === -1) {
      const adminPassHash = bcrypt.hashSync('Admin@123', 10);
      const adminObj: Employee = {
        id: 'admin-uuid-0000-0000-000000000000',
        employee_id: 'EMP000',
        full_name: 'Paritosh Badave',
        name: 'Paritosh Badave',
        email: 'paritoshbadave@gmail.com',
        password_hash: adminPassHash,
        role: 'Admin',
        department: 'Operations',
        designation: 'HR Administrator',
        joining_date: '2025-01-01',
        leave_balance: { paid_remaining: 10, availed: 0 },
        is_first_login: false,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      this.memoryDb.employees.push(adminObj);
      this.save();
    }

    // Ensure Second Admin exists
    const ameyIndex = this.memoryDb.employees.findIndex(e => e.email === 'amey@aconsultancy.marketing');
    if (ameyIndex === -1) {
      const ameyPassHash = bcrypt.hashSync('admin@123', 10);
      const ameyObj: Employee = {
        id: 'admin-uuid-0000-0000-000000000001',
        employee_id: 'EMP000A',
        full_name: 'Amey Admin',
        name: 'Amey Admin',
        email: 'amey@aconsultancy.marketing',
        password_hash: ameyPassHash,
        role: 'Admin',
        department: 'Operations',
        designation: 'HR Co-Administrator',
        joining_date: '2025-01-01',
        leave_balance: { paid_remaining: 10, availed: 0 },
        is_first_login: false,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      this.memoryDb.employees.push(ameyObj);
      this.save();
    }
  }

  private getInitialSeededData(): DatabaseSchema {
    const adminPassHash = bcrypt.hashSync('Admin@123', 10);
    const ameyPassHash = bcrypt.hashSync('admin@123', 10);
    const tempPassHash = bcrypt.hashSync('123456', 10);
    const regularPassHash = bcrypt.hashSync('Employee@123', 10);

    const now = new Date().toISOString();

    const employees: Employee[] = [
      {
        id: 'admin-uuid-0000-0000-000000000000',
        employee_id: 'EMP000',
        full_name: 'Paritosh Badave',
        name: 'Paritosh Badave',
        email: 'paritoshbadave@gmail.com',
        password_hash: adminPassHash,
        role: 'Admin',
        department: 'Operations',
        designation: 'HR Administrator',
        joining_date: '2025-01-01',
        leave_balance: { paid_remaining: 10, availed: 0 },
        is_first_login: false,
        is_active: true,
        created_at: now,
        updated_at: now
      },
      {
        id: 'admin-uuid-0000-0000-000000000001',
        employee_id: 'EMP000A',
        full_name: 'Amey Admin',
        name: 'Amey Admin',
        email: 'amey@aconsultancy.marketing',
        password_hash: ameyPassHash,
        role: 'Admin',
        department: 'Operations',
        designation: 'HR Co-Administrator',
        joining_date: '2025-01-01',
        leave_balance: { paid_remaining: 10, availed: 0 },
        is_first_login: false,
        is_active: true,
        created_at: now,
        updated_at: now
      },
      {
        id: 'emp-uuid-0001-0000-000000000000',
        employee_id: 'EMP001',
        full_name: 'John Doe',
        name: 'John Doe',
        email: 'john.doe@company.com',
        password_hash: regularPassHash,
        role: 'Employee',
        department: 'Engineering',
        designation: 'Senior Developer',
        joining_date: '2025-03-15',
        leave_balance: { paid_remaining: 8, availed: 2 },
        is_first_login: false,
        is_active: true,
        created_at: now,
        updated_at: now
      },
      {
        id: 'emp-uuid-0002-0000-000000000000',
        employee_id: 'EMP002',
        full_name: 'Sarah Smith',
        name: 'Sarah Smith',
        email: 'sarah.smith@company.com',
        password_hash: tempPassHash,
        role: 'Employee',
        department: 'Marketing',
        designation: 'Campaign Lead',
        joining_date: '2026-05-10',
        leave_balance: { paid_remaining: 10, availed: 0 },
        is_first_login: true, // Needs password change!
        is_active: true,
        created_at: now,
        updated_at: now
      },
      {
        id: 'emp-uuid-0003-0000-000000000000',
        employee_id: 'EMP003',
        full_name: 'Robert Vance',
        name: 'Robert Vance',
        email: 'robert.vance@company.com',
        password_hash: regularPassHash,
        role: 'Employee',
        department: 'Sales',
        designation: 'Account Executive',
        joining_date: '2025-06-01',
        leave_balance: { paid_remaining: 10, availed: 0 },
        is_first_login: false,
        is_active: false, // Deactivated!
        created_at: now,
        updated_at: now
      }
    ];

    const leaveRequests: LeaveRequest[] = [
      {
        leave_id: 'L001',
        employee_id: 'emp-uuid-0001-0000-000000000000',
        employee_name: 'John Doe',
        leave_type: 'Leave',
        start_date: '2026-06-12', // A Friday
        end_date: '2026-06-15',   // A Monday
        reason: 'Family short trip and weekend plan',
        total_leave_days: 4,
        sandwich_leave_days: 1, // Sunday is sandwich
        status: 'Pending',
        applied_date: '2026-06-01T10:30:00Z',
        approved_by: null,
        admin_remarks: null
      },
      {
        leave_id: 'L002',
        employee_id: 'emp-uuid-0001-0000-000000000000',
        employee_name: 'John Doe',
        leave_type: 'Leave',
        start_date: '2026-05-18',
        end_date: '2026-05-19',
        reason: 'High fever and doctor-prescribed rest',
        total_leave_days: 2,
        sandwich_leave_days: 0,
        status: 'Approved',
        applied_date: '2026-05-18T08:00:00Z',
        approved_by: 'System Administrator',
        admin_remarks: 'Approved. Get well soon!'
      },
      {
        leave_id: 'L003',
        employee_id: 'emp-uuid-0003-0000-000000000000',
        employee_name: 'Robert Vance',
        leave_type: 'Leave',
        start_date: '2026-04-10',
        end_date: '2026-04-15',
        reason: 'Personal travel plans overseas',
        total_leave_days: 6,
        sandwich_leave_days: 1, // Spans a Sunday
        status: 'Rejected',
        applied_date: '2026-04-01T11:20:00Z',
        approved_by: 'System Administrator',
        admin_remarks: 'Rejected because of critical sales campaign in April.'
      }
    ];

    const attendance: Attendance[] = [
      // John Doe Attendance for early June
      { attendance_id: 'A001', employee_id: 'emp-uuid-0001-0000-000000000000', attendance_date: '2026-06-01', status: 'Present', check_in: '08:55:12', check_out: '18:02:44' },
      { attendance_id: 'A002', employee_id: 'emp-uuid-0001-0000-000000000000', attendance_date: '2026-06-02', status: 'Present', check_in: '09:02:18', check_out: '18:15:30' },
      { attendance_id: 'A003', employee_id: 'emp-uuid-0001-0000-000000000000', attendance_date: '2026-06-03', status: 'Present', check_in: '08:48:50', check_out: '17:58:12' },
      { attendance_id: 'A004', employee_id: 'emp-uuid-0001-0000-000000000000', attendance_date: '2026-06-04', status: 'Present', check_in: '09:05:00', check_out: '18:10:00' },
      { attendance_id: 'A005', employee_id: 'emp-uuid-0001-0000-000000000000', attendance_date: '2026-06-05', status: 'Present', check_in: '08:50:00', check_out: null }, // today checked-in but not out

      // Sarah Smith Attendance
      { attendance_id: 'A006', employee_id: 'emp-uuid-0002-0000-000000000000', attendance_date: '2026-06-04', status: 'Present', check_in: '09:15:00', check_out: '17:30:22' },
      { attendance_id: 'A007', employee_id: 'emp-uuid-0002-0000-000000000000', attendance_date: '2026-06-05', status: 'Present', check_in: '09:12:00', check_out: null }
    ];

    const auditLogs: AuditLog[] = [
      { log_id: 'LG001', action: 'DB_SEED', user_id: 'SYSTEM', user_name: 'Database Engine', timestamp: now, details: 'Initial system database tables successfully seeded.' },
      { log_id: 'LG002', action: 'USER_CREATE', user_id: 'admin-uuid-0000-0000-000000000000', user_name: 'System Administrator', timestamp: now, details: 'Created Employee accounts John Doe, Sarah Smith, Robert Vance.' }
    ];

    const notifications: Notification[] = [
      {
        notification_id: 'N001',
        employee_id: 'all',
        title: 'Welcome to HRMS',
        message: 'The new HR Database system with sandwich leave rules is officially running!',
        type: 'system',
        is_read: false,
        created_at: now
      },
      {
        notification_id: 'N002',
        employee_id: 'admin-uuid-0000-0000-000000000000',
        title: 'New Leave Request Spanning Sunday',
        message: 'John Doe has requested Casual Leave from 2026-06-12 to 2026-06-15. This spans Sunday and sandwich leave rules apply.',
        type: 'leave_applied',
        is_read: false,
        created_at: '2026-06-01T10:31:00Z'
      }
    ];

    return {
      employees,
      leaveRequests,
      holidays: DEFAULT_HOLIDAYS,
      attendance,
      auditLogs,
      notifications,
      payrollRecords: []
    };
  }

  private save() {
    if (this.memoryDb) {
      if (!this.useSupabase) {
        fs.writeFileSync(DB_FILE, JSON.stringify(this.memoryDb, null, 2), 'utf-8');
      }
      
      // Async Sync to Supabase
      if (this.useSupabase && this.supabaseClient) {
        this.saveToSupabase(this.memoryDb).catch(err => {
          console.error('Failed to sync changes to Supabase:', err);
        });
      }
    }
  }

  private async saveToSupabase(data: DatabaseSchema) {
    if (!this.supabaseClient) return;
    try {
      const { error } = await this.supabaseClient
        .from('hrms_persistent_db')
        .upsert({ id: 1, data, updated_at: new Date().toISOString() });

      if (error) {
        console.error('Error syncing database to Supabase:', error.message || error);
      } else {
        console.log('Database synced successfully to Supabase.');
        this.supabaseStatus = 'connected';
        this.supabaseErrorMessage = '';
      }
    } catch (err: any) {
      console.error('Failed to write to Supabase:', err?.message || err);
    }
  }

  // --- QUERY UTILITIES ---

  public getEmployees(): Employee[] {
    this.ensureDbInitialized();
    return this.memoryDb ? this.memoryDb.employees.filter(e => !e.is_deleted) : [];
  }

  public getEmployeeById(id: string): Employee | undefined {
    this.ensureDbInitialized();
    return this.getEmployees().find(e => e.id === id || e.employee_id === id);
  }

  public getEmployeeByEmail(email: string): Employee | undefined {
    this.ensureDbInitialized();
    return this.getEmployees().find(e => e.email.toLowerCase() === email.toLowerCase());
  }

  public insertEmployee(employee: Employee): Employee {
    this.ensureDbInitialized();
    if (this.memoryDb) {
      this.memoryDb.employees.push(employee);
      this.save();
    }
    return employee;
  }

  public updateEmployee(employee: Employee): Employee {
    this.ensureDbInitialized();
    if (this.memoryDb) {
      const idx = this.memoryDb.employees.findIndex(e => e.id === employee.id);
      if (idx !== -1) {
        this.memoryDb.employees[idx] = { ...this.memoryDb.employees[idx], ...employee, updated_at: new Date().toISOString() };
        this.save();
      }
    }
    return employee;
  }

  public deleteEmployee(id: string): boolean {
    this.ensureDbInitialized();
    if (this.memoryDb) {
      const idx = this.memoryDb.employees.findIndex(e => e.id === id || e.employee_id === id);
      if (idx !== -1) {
        const emp = this.memoryDb.employees[idx];
        // Soft delete preferred!
        emp.is_active = false;
        emp.is_deleted = true;
        emp.updated_at = new Date().toISOString();

        // Also clean up all associated leave requests
        if (this.memoryDb.leaveRequests) {
          this.memoryDb.leaveRequests = this.memoryDb.leaveRequests.filter(
            r => r.employee_id !== emp.id && r.employee_id !== emp.employee_id
          );
        }

        this.save();
        return true;
      }
    }
    return false;
  }

  // --- LEAVE REQUEST UTILITIES ---

  public getLeaveRequests(): LeaveRequest[] {
    this.ensureDbInitialized();
    if (!this.memoryDb) return [];
    
    // Filter out leave requests belonging to deleted employees
    const validEmployees = this.getEmployees();
    const validIds = new Set<string>();
    validEmployees.forEach(e => {
      if (e.id) validIds.add(e.id);
      if (e.employee_id) validIds.add(e.employee_id);
    });
    
    return this.memoryDb.leaveRequests.filter(r => validIds.has(r.employee_id));
  }

  public getLeaveRequestById(id: string): LeaveRequest | undefined {
    this.ensureDbInitialized();
    return this.getLeaveRequests().find(r => r.leave_id === id);
  }

  public insertLeaveRequest(req: LeaveRequest): LeaveRequest {
    this.ensureDbInitialized();
    if (this.memoryDb) {
      this.memoryDb.leaveRequests.push(req);
      this.save();
    }
    return req;
  }

  public updateLeaveRequest(req: LeaveRequest): LeaveRequest {
    this.ensureDbInitialized();
    if (this.memoryDb) {
      const idx = this.memoryDb.leaveRequests.findIndex(r => r.leave_id === req.leave_id);
      if (idx !== -1) {
        this.memoryDb.leaveRequests[idx] = { ...this.memoryDb.leaveRequests[idx], ...req };
        this.save();
      }
    }
    return req;
  }

  // --- HOLIDAYS ---

  public getHolidays(): Holiday[] {
    this.ensureDbInitialized();
    return this.memoryDb ? this.memoryDb.holidays : [];
  }

  public insertHoliday(holiday: Holiday): Holiday {
    this.ensureDbInitialized();
    if (this.memoryDb) {
      this.memoryDb.holidays.push(holiday);
      this.save();
    }
    return holiday;
  }

  public updateHoliday(holiday: Holiday): Holiday {
    this.ensureDbInitialized();
    if (this.memoryDb) {
      const idx = this.memoryDb.holidays.findIndex(h => h.holiday_id === holiday.holiday_id);
      if (idx !== -1) {
        this.memoryDb.holidays[idx] = holiday;
        this.save();
      }
    }
    return holiday;
  }

  public deleteHoliday(holidayId: string): boolean {
    this.ensureDbInitialized();
    if (this.memoryDb) {
      const idx = this.memoryDb.holidays.findIndex(h => h.holiday_id === holidayId);
      if (idx !== -1) {
        this.memoryDb.holidays.splice(idx, 1);
        this.save();
        return true;
      }
    }
    return false;
  }

  // --- ATTENDANCE ---

  public getAttendance(): Attendance[] {
    this.ensureDbInitialized();
    return this.memoryDb ? this.memoryDb.attendance : [];
  }

  public checkIn(employeeId: string, dateStr: string, checkInTime: string): Attendance {
    this.ensureDbInitialized();
    if (this.memoryDb) {
      // Check if already checked in
      const existing = this.memoryDb.attendance.find(a => a.employee_id === employeeId && a.attendance_date === dateStr);
      if (existing) {
        existing.check_in = checkInTime;
        existing.status = 'Present';
        this.save();
        return existing;
      } else {
        const newRecord: Attendance = {
          attendance_id: 'ATT_' + Math.random().toString(36).substr(2, 9).toUpperCase(),
          employee_id: employeeId,
          attendance_date: dateStr,
          status: 'Present',
          check_in: checkInTime,
          check_out: null
        };
        this.memoryDb.attendance.push(newRecord);
        this.save();
        return newRecord;
      }
    }
    throw new Error('Database not initialized');
  }

  public checkOut(employeeId: string, dateStr: string, checkOutTime: string): Attendance | null {
    this.ensureDbInitialized();
    if (this.memoryDb) {
      const existing = this.memoryDb.attendance.find(a => a.employee_id === employeeId && a.attendance_date === dateStr);
      if (existing) {
        existing.check_out = checkOutTime;
        this.save();
        return existing;
      }
    }
    return null;
  }

  public logAttendanceManual(record: Attendance): Attendance {
    this.ensureDbInitialized();
    if (this.memoryDb) {
      const idx = this.memoryDb.attendance.findIndex(a => a.employee_id === record.employee_id && a.attendance_date === record.attendance_date);
      if (idx !== -1) {
        this.memoryDb.attendance[idx] = record;
      } else {
        this.memoryDb.attendance.push(record);
      }
      this.save();
    }
    return record;
  }

  // --- AUDIT LOGS ---

  public getAuditLogs(): AuditLog[] {
    this.ensureDbInitialized();
    return this.memoryDb ? this.memoryDb.auditLogs : [];
  }

  public addAuditLog(action: string, userId: string, userName: string, details: string) {
    this.ensureDbInitialized();
    if (this.memoryDb) {
      const newLog: AuditLog = {
        log_id: 'LOG_' + Math.random().toString(36).substr(2, 9).toUpperCase(),
        action,
        user_id: userId,
        user_name: userName,
        timestamp: new Date().toISOString(),
        details
      };
      this.memoryDb.auditLogs.unshift(newLog); // latest log first
      this.save();
    }
  }

  // --- NOTIFICATIONS ---

  public getNotifications(employeeId: string): Notification[] {
    this.ensureDbInitialized();
    if (!this.memoryDb) return [];
    return this.memoryDb.notifications.filter(n => n.employee_id === employeeId || n.employee_id === 'all');
  }

  public addNotification(employeeId: string, title: string, message: string, type: Notification['type']) {
    this.ensureDbInitialized();
    if (this.memoryDb) {
      const newNotif: Notification = {
        notification_id: 'NOT_' + Math.random().toString(36).substr(2, 9).toUpperCase(),
        employee_id: employeeId,
        title,
        message,
        type,
        is_read: false,
        created_at: new Date().toISOString()
      };
      this.memoryDb.notifications.unshift(newNotif);
      this.save();
    }
  }

  public markNotificationRead(notifId: string): boolean {
    this.ensureDbInitialized();
    if (this.memoryDb) {
      const notif = this.memoryDb.notifications.find(n => n.notification_id === notifId);
      if (notif) {
        notif.is_read = true;
        this.save();
        return true;
      }
    }
    return false;
  }

  // --- PAYROLL MANAGEMENT UTILITIES ---

  public getPayrollRecords(): PayrollRecord[] {
    this.ensureDbInitialized();
    return this.memoryDb && this.memoryDb.payrollRecords ? this.memoryDb.payrollRecords : [];
  }

  public savePayrollRecords(records: PayrollRecord[]): void {
    this.ensureDbInitialized();
    if (this.memoryDb) {
      if (!this.memoryDb.payrollRecords) {
        this.memoryDb.payrollRecords = [];
      }
      records.forEach(newRec => {
        const idx = this.memoryDb!.payrollRecords!.findIndex(
          p => p.employee_id === newRec.employee_id && p.month === newRec.month && p.year === newRec.year
        );
        if (idx !== -1) {
          // Overwrite existing record
          this.memoryDb!.payrollRecords![idx] = newRec;
        } else {
          // Insert new record
          this.memoryDb!.payrollRecords!.push(newRec);
        }
      });
      this.save();
    }
  }
}

export const db = new DBManager();
