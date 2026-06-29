import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { ALL_PERMISSION_CODES, DEFAULT_ROLE_PERMISSIONS, LOGISTICS_ALLOWED_PERMISSIONS, PERMISSIONS, type PermissionCode } from './permissions';

dotenv.config({ path: '.env.api' });
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'jiyun',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  dateStrings: true,
});

const querySingle = async <T>(sql: string, params: unknown[] = []): Promise<T | null> => {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(sql, params);
  return (rows[0] as T) || null;
};

const toSafeInt = (value: number, fallback: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return fallback;
  const normalized = Math.floor(value);
  return Math.min(Math.max(normalized, min), max);
};

const toSafeOrderBy = (
  sortKey: string | undefined,
  sortOrder: string | undefined,
  allowedColumns: Set<string>,
  fallbackColumn: string
): string => {
  const key = String(sortKey || '').trim();
  const normalizedKey = allowedColumns.has(key) ? key : fallbackColumn;
  const normalizedOrder = String(sortOrder || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return `${normalizedKey} ${normalizedOrder}`;
};

const toPagedResult = async <T>(
  page: number,
  limit: number,
  listFn: (safeLimit: number, offset: number) => Promise<T[]>,
  countFn: () => Promise<number>
) => {
  const safePage = toSafeInt(page, 1, 1, Number.MAX_SAFE_INTEGER);
  const safeLimit = toSafeInt(limit, 10, 1, 500);
  const offset = (safePage - 1) * safeLimit;
  const [data, total] = await Promise.all([listFn(safeLimit, offset), countFn()]);
  return {
    data,
    total,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
  };
};

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

const normalizeDateOnly = (value?: string): string | null => {
  const trimmed = String(value || '').trim();
  if (!trimmed || !DATE_ONLY_RE.test(trimmed)) return null;
  return trimmed;
};

const buildCreatedAtFilter = (startDate?: string, endDate?: string, colPrefix: string = '') => {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const from = normalizeDateOnly(startDate);
  const to = normalizeDateOnly(endDate);

  if (from) {
    clauses.push(`${colPrefix}created_at >= ?`);
    params.push(`${from} 00:00:00`);
  }
  if (to) {
    clauses.push(`${colPrefix}created_at <= ?`);
    params.push(`${to} 23:59:59`);
  }

  return { clauses, params };
};

/**
 * Build WHERE clauses for per-column text filters and date range filters.
 * @param columnFilters  e.g. { username: "john", email: "gmail" }
 * @param dateFilters    e.g. { created_at: ["2026-01-01","2026-12-31"] }
 * @param allowedColumns set of column names that are safe to filter on
 * @param colPrefix      optional table alias prefix, e.g. 'p.' for joined queries
 */
const buildColumnFilters = (
  columnFilters: Record<string, string> | undefined,
  dateFilters: Record<string, [string, string]> | undefined,
  allowedColumns: Set<string>,
  colPrefix: string = ''
) => {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (columnFilters) {
    for (const [col, value] of Object.entries(columnFilters)) {
      const trimmed = String(value || '').trim();
      if (!trimmed || !allowedColumns.has(col)) continue;
      clauses.push(`CAST(${colPrefix}${col} AS CHAR) LIKE ?`);
      params.push(`%${trimmed}%`);
    }
  }

  if (dateFilters) {
    for (const [col, range] of Object.entries(dateFilters)) {
      if (!allowedColumns.has(col) || !Array.isArray(range) || range.length !== 2) continue;
      const from = normalizeDateOnly(range[0]);
      const to = normalizeDateOnly(range[1]);
      if (from) {
        clauses.push(`${colPrefix}${col} >= ?`);
        params.push(`${from} 00:00:00`);
      }
      if (to) {
        clauses.push(`${colPrefix}${col} <= ?`);
        params.push(`${to} 23:59:59`);
      }
    }
  }

  return { clauses, params };
};

/**
 * Extract the special __deleted__ filter ('not_deleted' | 'deleted' | 'all')
 * from columnFilters and return a WHERE clause plus cleaned filters.
 * Default (missing / unknown) = 'not_deleted'.
 */
const buildDeletedFilter = (
  columnFilters: Record<string, string> | undefined,
  colPrefix: string = ''
): { clause: string; cleanedFilters: Record<string, string> | undefined } => {
  const cleaned = columnFilters ? { ...columnFilters } : undefined;
  let val: string | undefined;
  if (cleaned && Object.prototype.hasOwnProperty.call(cleaned, '__deleted__')) {
    val = cleaned['__deleted__'];
    delete cleaned['__deleted__'];
  }
  let clause: string;
  if (val === 'deleted') clause = `${colPrefix}deleted_at IS NOT NULL`;
  else if (val === 'all') clause = '1=1';
  else clause = `${colPrefix}deleted_at IS NULL`;
  return { clause, cleanedFilters: cleaned };
};

const getUsersCount = async (): Promise<number> => {
  const row = await querySingle<{ count: number }>('SELECT COUNT(*) as count FROM users');
  return row ? row.count : 0;
};

const getOrdersCount = async (): Promise<number> => {
  const row = await querySingle<{ count: number }>('SELECT COUNT(*) as count FROM orders');
  return row ? row.count : 0;
};

const getParcelsCount = async (): Promise<number> => {
  const row = await querySingle<{ count: number }>('SELECT COUNT(*) as count FROM parcels');
  return row ? row.count : 0;
};

const getSmsCount = async (): Promise<number> => {
  const row = await querySingle<{ count: number }>('SELECT COUNT(*) as count FROM otp_codes');
  return row ? row.count : 0;
};

const getAdminsCount = async (): Promise<number> => {
  const row = await querySingle<{ count: number }>('SELECT COUNT(*) as count FROM admin_users');
  return row ? row.count : 0;
};

const getAdminCount = async (): Promise<number> => {
  const row = await querySingle<{ count: number }>('SELECT COUNT(*) as count FROM admin_users');
  return row ? row.count : 0;
};

const getAuditLogsCount = async (): Promise<number> => {
  const row = await querySingle<{ count: number }>('SELECT COUNT(*) as count FROM admin_audit_logs');
  return row ? row.count : 0;
};

const getSuperAdminCount = async (): Promise<number> => {
  const row = await querySingle<{ count: number }>(
    "SELECT COUNT(*) as count FROM admin_users WHERE role = 'super_admin'"
  );
  return row ? row.count : 0;
};

export const countActiveSuperAdmins = async (): Promise<number> => {
  const row = await querySingle<{ count: number }>(
    "SELECT COUNT(*) as count FROM admin_users WHERE role = 'super_admin' AND deleted_at IS NULL"
  );
  return row ? row.count : 0;
};

export const initDb = async (): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(64) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(32) UNIQUE,
        email VARCHAR(255),
        real_name VARCHAR(255),
        address VARCHAR(255),
        logistics_provider_id INT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Migration: ensure users.logistics_provider_id exists on older databases
    const [userCols] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'`
    );
    const existingUserCols = new Set((userCols as any[]).map((r: any) => r.COLUMN_NAME));
    if (!existingUserCols.has('logistics_provider_id')) {
      await connection.execute(`ALTER TABLE users ADD COLUMN logistics_provider_id INT DEFAULT NULL AFTER address`);
    }

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS otp_codes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        phone VARCHAR(32) NOT NULL,
        code VARCHAR(16) NOT NULL,
        expires_at DATETIME NOT NULL,
        verified TINYINT(1) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_otp_phone (phone),
        INDEX idx_otp_expires (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(64) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        role VARCHAR(32) DEFAULT 'admin',
        role_scope VARCHAR(16) NOT NULL DEFAULT 'platform',
        role_logistics_provider_id INT DEFAULT NULL,
        logistics_provider_id INT DEFAULT NULL,
        status VARCHAR(32) DEFAULT 'active',
        is_system TINYINT(1) NOT NULL DEFAULT 0,
        last_login DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_admin_username (username),
        INDEX idx_admin_role_scope (role_scope),
        INDEX idx_admin_role_provider (role_logistics_provider_id),
        INDEX idx_admin_provider (logistics_provider_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    const [adminUserCols] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_users'`
    );
    const existingAdminUserCols = new Set((adminUserCols as any[]).map((r: any) => r.COLUMN_NAME));
    if (!existingAdminUserCols.has('role_scope')) {
      await connection.execute(`ALTER TABLE admin_users ADD COLUMN role_scope VARCHAR(16) NOT NULL DEFAULT 'platform' AFTER role`);
    }
    if (!existingAdminUserCols.has('role_logistics_provider_id')) {
      await connection.execute(`ALTER TABLE admin_users ADD COLUMN role_logistics_provider_id INT DEFAULT NULL AFTER role_scope`);
    }
    if (!existingAdminUserCols.has('logistics_provider_id')) {
      await connection.execute(`ALTER TABLE admin_users ADD COLUMN logistics_provider_id INT DEFAULT NULL AFTER role_logistics_provider_id`);
    }
    if (!existingAdminUserCols.has('is_system')) {
      await connection.execute(`ALTER TABLE admin_users ADD COLUMN is_system TINYINT(1) NOT NULL DEFAULT 0 AFTER status`);
    }
    const [adminUserIndexes] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_users'`
    );
    const existingAdminUserIndexes = new Set((adminUserIndexes as any[]).map((r: any) => r.INDEX_NAME));
    if (!existingAdminUserIndexes.has('idx_admin_role_scope')) {
      await connection.execute(`ALTER TABLE admin_users ADD INDEX idx_admin_role_scope (role_scope)`);
    }
    if (!existingAdminUserIndexes.has('idx_admin_role_provider')) {
      await connection.execute(`ALTER TABLE admin_users ADD INDEX idx_admin_role_provider (role_logistics_provider_id)`);
    }
    if (!existingAdminUserIndexes.has('idx_admin_provider')) {
      await connection.execute(`ALTER TABLE admin_users ADD INDEX idx_admin_provider (logistics_provider_id)`);
    }

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS admin_roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(32) NOT NULL,
        name VARCHAR(64) NOT NULL,
        scope VARCHAR(16) NOT NULL DEFAULT 'platform',
        logistics_provider_id INT DEFAULT NULL,
        is_system TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_role_scope_provider_code (scope, logistics_provider_id, code),
        INDEX idx_role_scope (scope),
        INDEX idx_role_provider (logistics_provider_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Add role scope/provider columns and indexes to admin_roles for existing databases
    const [roleCols] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_roles'`
    );
    const existingRoleCols = new Set((roleCols as any[]).map((r: any) => r.COLUMN_NAME));
    if (!existingRoleCols.has('scope')) {
      await connection.execute(`ALTER TABLE admin_roles ADD COLUMN scope VARCHAR(16) NOT NULL DEFAULT 'platform' AFTER name`);
    }
    if (!existingRoleCols.has('logistics_provider_id')) {
      await connection.execute(`ALTER TABLE admin_roles ADD COLUMN logistics_provider_id INT DEFAULT NULL AFTER scope`);
    }
    const [roleIndexes] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_roles'`
    );
    const existingRoleIndexes = new Set((roleIndexes as any[]).map((r: any) => r.INDEX_NAME));
    if (existingRoleIndexes.has('uk_role_code')) {
      await connection.execute(`ALTER TABLE admin_roles DROP INDEX uk_role_code`);
    }
    if (!existingRoleIndexes.has('idx_role_scope')) {
      await connection.execute(`ALTER TABLE admin_roles ADD INDEX idx_role_scope (scope)`);
    }
    if (!existingRoleIndexes.has('idx_role_provider')) {
      await connection.execute(`ALTER TABLE admin_roles ADD INDEX idx_role_provider (logistics_provider_id)`);
    }
    if (!existingRoleIndexes.has('uk_role_scope_provider_code')) {
      await connection.execute(`ALTER TABLE admin_roles ADD UNIQUE KEY uk_role_scope_provider_code (scope, logistics_provider_id, code)`);
    }

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS admin_role_permissions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        role_id INT NOT NULL,
        role VARCHAR(32) DEFAULT NULL,
        permission_code VARCHAR(64) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_role_permission_id (role_id, permission_code),
        INDEX idx_role_id (role_id),
        INDEX idx_role (role)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    const [arpCols] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_role_permissions'`
    );
    const existingArpCols = new Set((arpCols as any[]).map((r: any) => r.COLUMN_NAME));
    if (!existingArpCols.has('role_id')) {
      await connection.execute(`ALTER TABLE admin_role_permissions ADD COLUMN role_id INT NULL AFTER id`);
    }
    if (!existingArpCols.has('role')) {
      await connection.execute(`ALTER TABLE admin_role_permissions ADD COLUMN role VARCHAR(32) DEFAULT NULL AFTER role_id`);
    }

    const [arpIndexes] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_role_permissions'`
    );
    const existingArpIndexes = new Set((arpIndexes as any[]).map((r: any) => r.INDEX_NAME));
    if (existingArpIndexes.has('uk_role_permission')) {
      await connection.execute(`ALTER TABLE admin_role_permissions DROP INDEX uk_role_permission`);
    }
    if (!existingArpIndexes.has('idx_role_id')) {
      await connection.execute(`ALTER TABLE admin_role_permissions ADD INDEX idx_role_id (role_id)`);
    }
    if (!existingArpIndexes.has('idx_role')) {
      await connection.execute(`ALTER TABLE admin_role_permissions ADD INDEX idx_role (role)`);
    }

    await connection.execute(`
      UPDATE admin_role_permissions arp
      JOIN admin_roles ar ON ar.code = arp.role
      SET arp.role_id = ar.id
      WHERE arp.role_id IS NULL
    `);

    const [arpNullRows] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS count FROM admin_role_permissions WHERE role_id IS NULL`
    );
    const arpNullCount = Number(arpNullRows?.[0]?.count || 0);
    if (arpNullCount === 0 && existingArpCols.has('role_id')) {
      await connection.execute(`ALTER TABLE admin_role_permissions MODIFY COLUMN role_id INT NOT NULL`);
    }
    if (!existingArpIndexes.has('uk_role_permission_id')) {
      await connection.execute(`ALTER TABLE admin_role_permissions ADD UNIQUE KEY uk_role_permission_id (role_id, permission_code)`);
    }

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS parcels (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        tracking_number VARCHAR(128) UNIQUE NOT NULL,
        origin VARCHAR(255) NOT NULL,
        destination VARCHAR(255) NOT NULL,
        weight DOUBLE,
        length_cm DOUBLE,
        width_cm DOUBLE,
        height_cm DOUBLE,
        volume DOUBLE,
        images TEXT,
        status VARCHAR(64) DEFAULT 'pending',
        estimated_delivery DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_parcels_user (user_id),
        INDEX idx_parcels_tracking (tracking_number)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Add new columns to parcels if they don't exist (for existing databases)
    const [parcelCols] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'parcels'`
    );
    const existingCols = new Set((parcelCols as any[]).map((r: any) => r.COLUMN_NAME));
    if (!existingCols.has('length_cm')) {
      await connection.execute(`ALTER TABLE parcels ADD COLUMN length_cm DOUBLE AFTER weight`);
    }
    if (!existingCols.has('width_cm')) {
      await connection.execute(`ALTER TABLE parcels ADD COLUMN width_cm DOUBLE AFTER length_cm`);
    }
    if (!existingCols.has('height_cm')) {
      await connection.execute(`ALTER TABLE parcels ADD COLUMN height_cm DOUBLE AFTER width_cm`);
    }
    if (!existingCols.has('volume')) {
      await connection.execute(`ALTER TABLE parcels ADD COLUMN volume DOUBLE AFTER height_cm`);
    }
    if (!existingCols.has('images')) {
      await connection.execute(`ALTER TABLE parcels ADD COLUMN images TEXT AFTER volume`);
    }
    if (!existingCols.has('shelf_location')) {
      await connection.execute(`ALTER TABLE parcels ADD COLUMN shelf_location VARCHAR(64) AFTER images`);
    }
    if (!existingCols.has('sub_status')) {
      await connection.execute(`ALTER TABLE parcels ADD COLUMN sub_status VARCHAR(64) DEFAULT NULL AFTER status`);
    }
    if (!existingCols.has('status_remark')) {
      await connection.execute(`ALTER TABLE parcels ADD COLUMN status_remark VARCHAR(255) DEFAULT NULL AFTER sub_status`);
    }
    if (!existingCols.has('status_updated_at')) {
      await connection.execute(`ALTER TABLE parcels ADD COLUMN status_updated_at DATETIME DEFAULT NULL AFTER status_remark`);
    }
    if (!existingCols.has('logistics_provider_id')) {
      await connection.execute(`ALTER TABLE parcels ADD COLUMN logistics_provider_id INT DEFAULT NULL AFTER shelf_location`);
    }

    // Add indexes for status columns if not exist
    const [parcelIndexes] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'parcels'`
    );
    const existingIndexes = new Set((parcelIndexes as any[]).map((r: any) => r.INDEX_NAME));
    if (!existingIndexes.has('idx_parcels_status')) {
      await connection.execute(`ALTER TABLE parcels ADD INDEX idx_parcels_status (status)`);
    }
    if (!existingIndexes.has('idx_parcels_sub_status')) {
      await connection.execute(`ALTER TABLE parcels ADD INDEX idx_parcels_sub_status (sub_status)`);
    }

    // Parcel status change logs
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS parcel_status_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        parcel_id INT NOT NULL,
        from_status VARCHAR(64),
        to_status VARCHAR(64),
        sub_status VARCHAR(64),
        remark VARCHAR(255),
        operator_id INT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_psl_parcel (parcel_id),
        INDEX idx_psl_created (created_at),
        FOREIGN KEY (parcel_id) REFERENCES parcels(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        parcel_id INT,
        total_amount DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(8) DEFAULT 'TWD',
        status VARCHAR(64) DEFAULT 'pending',
        payment_method VARCHAR(64),
        notes VARCHAR(255),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_orders_user (user_id),
        INDEX idx_orders_parcel (parcel_id),
        INDEX idx_orders_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS logistics_providers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        code VARCHAR(64) DEFAULT NULL,
        contact_name VARCHAR(64) DEFAULT NULL,
        contact_phone VARCHAR(32) DEFAULT NULL,
        email VARCHAR(255) DEFAULT NULL,
        website VARCHAR(255) DEFAULT NULL,
        status VARCHAR(32) DEFAULT 'active',
        remark VARCHAR(255) DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME DEFAULT NULL,
        INDEX idx_logistics_name (name),
        INDEX idx_logistics_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        admin_id INT NULL,
        action VARCHAR(64) NOT NULL,
        target_type VARCHAR(64) NULL,
        target_id INT NULL,
        result VARCHAR(32) NOT NULL,
        ip VARCHAR(64) NULL,
        detail VARCHAR(255) NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_audit_admin_id (admin_id),
        INDEX idx_audit_action (action),
        INDEX idx_audit_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    const adminCount = await getAdminCount();
    if (adminCount === 0) {
      const defaultUsername = (process.env.DEFAULT_ADMIN_USERNAME || '').trim();
      const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || '';
      const defaultEmail = (process.env.DEFAULT_ADMIN_EMAIL || '').trim();

      if (!defaultUsername || !defaultPassword || !defaultEmail) {
        throw new Error('[DB] DEFAULT_ADMIN_USERNAME / DEFAULT_ADMIN_PASSWORD / DEFAULT_ADMIN_EMAIL are required for first-time setup.');
      }

      if (defaultPassword.length < 12) {
        throw new Error('[DB] DEFAULT_ADMIN_PASSWORD must be at least 12 characters.');
      }

      const hashed = bcrypt.hashSync(defaultPassword, 10);
      await connection.execute(
        'INSERT INTO admin_users (username, password, email, role, role_scope, role_logistics_provider_id, logistics_provider_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [defaultUsername, hashed, defaultEmail, 'super_admin', 'platform', null, null]
      );
    }

    const superAdminCount = await getSuperAdminCount();
    if (superAdminCount === 0) {
      await connection.execute(
        `UPDATE admin_users
         SET role = 'super_admin', updated_at = NOW()
         WHERE id = (
           SELECT id FROM (
             SELECT id FROM admin_users ORDER BY created_at ASC LIMIT 1
           ) t
         )`
      );
    }

      const DEFAULT_ROLE_NAMES: Record<string, string> = {
        super_admin: '超级管理员',
        admin: '管理员',
      };
      for (const role of Object.keys(DEFAULT_ROLE_PERMISSIONS)) {
        const [roleRows] = await connection.execute<mysql.RowDataPacket[]>(
          'SELECT id FROM admin_roles WHERE code = ? LIMIT 1',
          [role]
        );
        if (roleRows && roleRows.length > 0) continue;
        await connection.execute(
          'INSERT INTO admin_roles (code, name, scope, logistics_provider_id, is_system) VALUES (?, ?, ?, ?, 1)',
          [role, DEFAULT_ROLE_NAMES[role] || role, 'platform', null]
        );
      }

      for (const [role, defaultPermissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
        const roleRow = await querySingle<{ id: number }>(
          'SELECT id FROM admin_roles WHERE code = ? AND scope = ? AND logistics_provider_id <=> ? LIMIT 1',
          [role, 'platform', null]
        );
        const roleId = Number(roleRow?.id || 0);
        if (!roleId) continue;

        const [rows] = await connection.execute<mysql.RowDataPacket[]>(
          'SELECT COUNT(*) as count FROM admin_role_permissions WHERE role_id = ?',
          [roleId]
        );
        const count = Number(rows?.[0]?.count || 0);
        if (count > 0) continue;
        for (const permissionCode of defaultPermissions) {
          await connection.execute(
            'INSERT INTO admin_role_permissions (role_id, role, permission_code) VALUES (?, ?, ?)',
            [roleId, role, permissionCode]
          );
        }
      }

      // 幂等回填：确保内置 admin 角色拥有「角色管理」权限（平台角色 + 物流商角色）。
      // 现有库 admin 已有权限记录，上面的播种会因 count>0 跳过，故此处单独补齐。
      const ROLE_MANAGEMENT_CODES = [
        'role.platform.view', 'role.platform.create', 'role.platform.update', 'role.platform.delete',
        'role.logistics.view', 'role.logistics.create', 'role.logistics.update', 'role.logistics.delete',
      ];
      const adminRoleRow = await querySingle<{ id: number }>(
        'SELECT id FROM admin_roles WHERE code = ? AND scope = ? AND logistics_provider_id <=> ? LIMIT 1',
        ['admin', 'platform', null]
      );
      const adminRoleId = Number(adminRoleRow?.id || 0);
      if (adminRoleId) {
        for (const permissionCode of ROLE_MANAGEMENT_CODES) {
          await connection.execute(
            'INSERT IGNORE INTO admin_role_permissions (role_id, role, permission_code) VALUES (?, ?, ?)',
            [adminRoleId, 'admin', permissionCode]
          );
        }
      }

      // 迁移清理：删除已废弃的旧角色管理权限码（role.* 已拆分为 role.platform.* / role.logistics.*）。
      await connection.execute(
        "DELETE FROM admin_role_permissions WHERE permission_code IN ('role.view', 'role.create', 'role.update', 'role.delete')"
      );

      // 回填：为所有现有物流商补齐【初始角色】与【初始管理员账号】（幂等）。
      const [providerRows] = await connection.execute<mysql.RowDataPacket[]>(
        'SELECT id, code, name FROM logistics_providers WHERE deleted_at IS NULL'
      );
      for (const provider of providerRows as any[]) {
        await ensureLogisticsInitialAccess({ id: provider.id, code: provider.code, name: provider.name });
      }
  } finally {
    connection.release();
  }
};

export const getAdminByUsername = async (username: string): Promise<any | null> => {
  return querySingle<any>('SELECT * FROM admin_users WHERE username = ? AND deleted_at IS NULL LIMIT 1', [username]);
};

export const getAdminById = async (adminId: number): Promise<any | null> => {
  return querySingle<any>('SELECT * FROM admin_users WHERE id = ? AND deleted_at IS NULL LIMIT 1', [adminId]);
};

export const getPermissionsForRoleFromDb = async (
  role: string | undefined | null,
  options?: { scope?: 'platform' | 'logistics'; logistics_provider_id?: number | null }
): Promise<PermissionCode[]> => {
  if (!role) return [];
  // 超级管理员始终拥有全部权限，防止误配置导致系统失控
  if (role === 'super_admin' && (options?.scope || 'platform') === 'platform') return [...ALL_PERMISSION_CODES];

  const scope = options?.scope === 'logistics' ? 'logistics' : 'platform';
  const logisticsProviderId =
    scope === 'logistics'
      ? Number.isInteger(options?.logistics_provider_id) && Number(options?.logistics_provider_id) > 0
        ? Number(options?.logistics_provider_id)
        : null
      : null;

  const roleRow = await getRoleRowByCode(role, { scope, logistics_provider_id: logisticsProviderId });
  let rows: mysql.RowDataPacket[] = [];
  if (roleRow?.id) {
    const [byRoleId] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT permission_code FROM admin_role_permissions WHERE role_id = ? ORDER BY permission_code ASC',
      [roleRow.id]
    );
    rows = byRoleId || [];
  }

  // 兼容历史数据：旧版本仅按 role 字符串存储权限
  if (rows.length === 0) {
    const [legacyRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT permission_code FROM admin_role_permissions WHERE role = ? ORDER BY permission_code ASC',
      [role]
    );
    rows = legacyRows || [];
  }

  if (!rows || rows.length === 0) {
    return DEFAULT_ROLE_PERMISSIONS[role] || [];
  }
  const validSet = new Set<string>(ALL_PERMISSION_CODES);
  return rows
    .map((row: any) => String(row.permission_code || '').trim())
    .filter((code): code is PermissionCode => validSet.has(code));
};

export const getRolePermissionsConfig = async (): Promise<Record<string, PermissionCode[]>> => {
  const roleMap: Record<string, PermissionCode[]> = {};
  for (const role of Object.keys(DEFAULT_ROLE_PERMISSIONS)) {
    roleMap[role] = await getPermissionsForRoleFromDb(role);
  }
  return roleMap;
};

export const replaceRolePermissions = async (role: string, permissions: string[]): Promise<void> => {
  const roleRow = await getRoleRowByCode(role, { scope: 'platform', logistics_provider_id: null });
  if (!roleRow?.id) {
    throw new Error(`Role not found: ${role}`);
  }

  const validSet = new Set<string>(ALL_PERMISSION_CODES);
  const deduped = Array.from(new Set(permissions.map((p) => String(p || '').trim()).filter((p) => validSet.has(p)))) as PermissionCode[];

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('DELETE FROM admin_role_permissions WHERE role_id = ?', [roleRow.id]);
    for (const permissionCode of deduped) {
      await connection.execute(
        'INSERT INTO admin_role_permissions (role_id, role, permission_code) VALUES (?, ?, ?)',
        [roleRow.id, role, permissionCode]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// ====== 角色（RBAC）CRUD ======

export type RoleScope = 'platform' | 'logistics';

interface RoleQueryOptions {
  scope?: RoleScope;
  logistics_provider_id?: number | null;
}

export interface RoleWithPermissions {
  code: string;
  name: string;
  scope: RoleScope;
  logistics_provider_id: number | null;
  is_system: boolean;
  permissions: PermissionCode[];
  admin_count: number;
}

const normalizeRoleQueryOptions = (options?: RoleQueryOptions) => {
  const scope: RoleScope = options?.scope === 'logistics' ? 'logistics' : 'platform';
  const logisticsProviderId =
    scope === 'logistics'
      ? Number.isInteger(options?.logistics_provider_id) && Number(options?.logistics_provider_id) > 0
        ? Number(options?.logistics_provider_id)
        : null
      : null;
  return { scope, logisticsProviderId };
};

export const getRoleRowByCode = async (code: string, options?: RoleQueryOptions) => {
  const { scope, logisticsProviderId } = normalizeRoleQueryOptions(options);
  return querySingle<{ id: number; code: string; name: string; is_system: number; scope: RoleScope; logistics_provider_id: number | null }>(
    'SELECT id, code, name, is_system, scope, logistics_provider_id FROM admin_roles WHERE code = ? AND scope = ? AND logistics_provider_id <=> ? LIMIT 1',
    [code, scope, logisticsProviderId]
  );
};

export const roleExists = async (code: string, options?: RoleQueryOptions): Promise<boolean> => {
  const row = await getRoleRowByCode(code, options);
  return !!row;
};

export const getRoleNameByCode = async (code: string, options?: RoleQueryOptions): Promise<string | null> => {
  const row = await getRoleRowByCode(code, options);
  return row ? row.name : null;
};

export const countAdminsByRole = async (code: string, options?: RoleQueryOptions): Promise<number> => {
  const { scope, logisticsProviderId } = normalizeRoleQueryOptions(options);
  if (scope === 'logistics') {
    const row = await querySingle<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM admin_users a
       WHERE a.role = ?
         AND a.role_scope = 'logistics'
         AND a.role_logistics_provider_id <=> ?
         AND a.deleted_at IS NULL`,
      [code, logisticsProviderId]
    );
    return row ? Number(row.count) : 0;
  }

  const row = await querySingle<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM admin_users
     WHERE role = ?
       AND role_scope = 'platform'
       AND role_logistics_provider_id IS NULL
       AND deleted_at IS NULL`,
    [code]
  );
  return row ? Number(row.count) : 0;
};

export const listRolesWithPermissions = async (scope?: RoleScope, logisticsProviderId?: number | null): Promise<RoleWithPermissions[]> => {
  const whereClauses: string[] = [];
  const args: unknown[] = [];
  if (scope) {
    whereClauses.push('scope = ?');
    args.push(scope);
  }
  if (scope === 'logistics' && logisticsProviderId !== undefined) {
    whereClauses.push('logistics_provider_id <=> ?');
    args.push(logisticsProviderId);
  }
  const where = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';
  const [roles] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, code, name, scope, logistics_provider_id, is_system FROM admin_roles${where} ORDER BY is_system DESC, created_at ASC`,
    args
  );
  const result: RoleWithPermissions[] = [];
  for (const r of roles as any[]) {
    const [permRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT permission_code FROM admin_role_permissions WHERE role_id = ? ORDER BY permission_code ASC',
      [r.id]
    );
    const validSet = new Set<string>(ALL_PERMISSION_CODES);
    const permissions = (permRows || [])
      .map((row: any) => String(row.permission_code || '').trim())
      .filter((code): code is PermissionCode => validSet.has(code));
    const adminCount = await countAdminsByRole(r.code, {
      scope: r.scope === 'logistics' ? 'logistics' : 'platform',
      logistics_provider_id: r.logistics_provider_id === null ? null : Number(r.logistics_provider_id),
    });
    result.push({
      code: r.code,
      name: r.name,
      scope: (r.scope === 'logistics' ? 'logistics' : 'platform'),
      logistics_provider_id: r.logistics_provider_id === null ? null : Number(r.logistics_provider_id),
      is_system: !!r.is_system,
      permissions,
      admin_count: adminCount,
    });
  }
  return result;
};

export const createRoleWithPermissions = async (params: {
  code: string;
  name: string;
  scope?: RoleScope;
  logistics_provider_id?: number | null;
  permissions: string[];
}): Promise<'created' | 'duplicate'> => {
  const scope: RoleScope = params.scope === 'logistics' ? 'logistics' : 'platform';
  const logisticsProviderId =
    scope === 'logistics'
      ? Number.isInteger(params.logistics_provider_id) && Number(params.logistics_provider_id) > 0
        ? Number(params.logistics_provider_id)
        : null
      : null;

  const exists = await roleExists(params.code, { scope, logistics_provider_id: logisticsProviderId });
  if (exists) return 'duplicate';

  const validSet = new Set<string>(ALL_PERMISSION_CODES);
  const deduped = Array.from(
    new Set(params.permissions.map((p) => String(p || '').trim()).filter((p) => validSet.has(p)))
  );

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [inserted] = await connection.execute<mysql.ResultSetHeader>('INSERT INTO admin_roles (code, name, scope, logistics_provider_id, is_system) VALUES (?, ?, ?, ?, 0)', [
      params.code,
      params.name,
      scope,
      logisticsProviderId,
    ]);
    const roleId = inserted.insertId;
    for (const permissionCode of deduped) {
      await connection.execute('INSERT INTO admin_role_permissions (role_id, role, permission_code) VALUES (?, ?, ?)', [
        roleId,
        params.code,
        permissionCode,
      ]);
    }
    await connection.commit();
    return 'created';
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const updateRoleWithPermissions = async (
  code: string,
  params: { name?: string; permissions?: string[] },
  options?: RoleQueryOptions
): Promise<'updated' | 'not_found'> => {
  const roleRow = await getRoleRowByCode(code, options);
  if (!roleRow) return 'not_found';

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (params.name !== undefined) {
      await connection.execute('UPDATE admin_roles SET name = ?, updated_at = NOW() WHERE id = ?', [
        params.name,
        roleRow.id,
      ]);
    }
    // 超级管理员权限恒为全部，不允许通过此处修改
    if (params.permissions !== undefined && roleRow.code !== 'super_admin') {
      const validSet = new Set<string>(ALL_PERMISSION_CODES);
      const deduped = Array.from(
        new Set(params.permissions.map((p) => String(p || '').trim()).filter((p) => validSet.has(p)))
      );
      await connection.execute('DELETE FROM admin_role_permissions WHERE role_id = ?', [roleRow.id]);
      for (const permissionCode of deduped) {
        await connection.execute('INSERT INTO admin_role_permissions (role_id, role, permission_code) VALUES (?, ?, ?)', [
          roleRow.id,
          roleRow.code,
          permissionCode,
        ]);
      }
    }
    await connection.commit();
    return 'updated';
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const deleteRole = async (code: string, options?: RoleQueryOptions): Promise<'deleted' | 'system' | 'in_use' | 'not_found'> => {
  const role = await getRoleRowByCode(code, options);
  if (!role) return 'not_found';
  if (Number(role.is_system) === 1) return 'system';
  const count = await countAdminsByRole(code, options);
  if (count > 0) return 'in_use';

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('DELETE FROM admin_role_permissions WHERE role_id = ?', [role.id]);
    await connection.execute('DELETE FROM admin_roles WHERE id = ?', [role.id]);
    await connection.commit();
    return 'deleted';
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const updateAdminLastLogin = async (adminId: number): Promise<void> => {
  await pool.execute('UPDATE admin_users SET last_login = NOW() WHERE id = ?', [adminId]);
};

const USERS_SORT_COLUMNS = new Set(['id', 'username', 'phone', 'email', 'real_name', 'address', 'created_at', 'updated_at']);

export const getUsersPaged = async (
  page: number,
  limit: number,
  sortKey?: string,
  sortOrder?: string,
  columnFilters?: Record<string, string>,
  dateFilters?: Record<string, [string, string]>,
  logisticsProviderId?: number | null
) => {
  const orderBy = `u.${toSafeOrderBy(sortKey, sortOrder, USERS_SORT_COLUMNS, 'created_at')}`;

  // Extract logistics_provider filter before passing to buildColumnFilters (joined column)
  const userColFilters = columnFilters ? { ...columnFilters } : undefined;
  let logisticsFilter: string | undefined;
  if (userColFilters && userColFilters['logistics_provider']) {
    logisticsFilter = userColFilters['logistics_provider'];
    delete userColFilters['logistics_provider'];
  }

  const { clause: deletedClause, cleanedFilters } = buildDeletedFilter(userColFilters, 'u.');
  const { clauses, params } = buildColumnFilters(cleanedFilters, dateFilters, USERS_SORT_COLUMNS, 'u.');
  const allClauses = [deletedClause, ...clauses];
  if (logisticsFilter) {
    allClauses.push(`CAST(lp.name AS CHAR) LIKE ?`);
    params.push(`%${logisticsFilter.trim()}%`);
  }
  if (logisticsProviderId !== undefined && logisticsProviderId !== null) {
    allClauses.push('u.logistics_provider_id = ?');
    params.push(logisticsProviderId);
  }
  const whereSql = `WHERE ${allClauses.join(' AND ')}`;

  const safePage = toSafeInt(page, 1, 1, Number.MAX_SAFE_INTEGER);
  const safeLimit = toSafeInt(limit, 10, 1, 500);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT u.id, u.username, u.phone, u.email, u.real_name, u.address,
            u.logistics_provider_id, lp.name AS logistics_provider_name,
            u.created_at, u.updated_at, u.deleted_at
     FROM users u
     LEFT JOIN logistics_providers lp ON u.logistics_provider_id = lp.id
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT ${safeLimit} OFFSET ${offset}`,
    params
  );

  const [countRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) as count FROM users u
     LEFT JOIN logistics_providers lp ON u.logistics_provider_id = lp.id
     ${whereSql}`,
    params
  );

  const total = Number(countRows?.[0]?.count || 0);
  return {
    data: rows as any[],
    total,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
  };
};

export const searchUsersPaged = async (keyword: string, page: number, limit: number, sortKey?: string, sortOrder?: string, logisticsProviderId?: number | null) => {
  const like = `%${keyword}%`;
  const orderBy = `u.${toSafeOrderBy(sortKey, sortOrder, USERS_SORT_COLUMNS, 'created_at')}`;
  const provClause = (logisticsProviderId !== undefined && logisticsProviderId !== null) ? ' AND u.logistics_provider_id = ?' : '';
  const provParams: any[] = provClause ? [logisticsProviderId] : [];
  return toPagedResult(
    page,
    limit,
    async (safeLimit, offset) => {
      const [rows] = await pool.execute<mysql.RowDataPacket[]>(
        `SELECT u.id, u.username, u.phone, u.email, u.real_name, u.address,
                u.logistics_provider_id, lp.name AS logistics_provider_name,
                u.created_at, u.updated_at
         FROM users u
         LEFT JOIN logistics_providers lp ON u.logistics_provider_id = lp.id
         WHERE u.deleted_at IS NULL AND (u.username LIKE ? OR u.phone LIKE ? OR u.email LIKE ? OR u.real_name LIKE ?)${provClause}
         ORDER BY ${orderBy}
         LIMIT ${safeLimit} OFFSET ${offset}`,
        [like, like, like, like, ...provParams]
      );
      return rows as any[];
    },
    async () => {
      const [countRows] = await pool.execute<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) as count
         FROM users u
         WHERE u.deleted_at IS NULL AND (u.username LIKE ? OR u.phone LIKE ? OR u.email LIKE ? OR u.real_name LIKE ?)${provClause}`,
        [like, like, like, like, ...provParams]
      );
      return Number(countRows?.[0]?.count || 0);
    }
  );
};

export const updateUser = async (userId: number, payload: { logistics_provider_id?: number | null }): Promise<boolean> => {
  const sets: string[] = ['updated_at = NOW()'];
  const params: any[] = [];
  if (payload.logistics_provider_id !== undefined) {
    sets.push('logistics_provider_id = ?');
    params.push(payload.logistics_provider_id || null);
  }
  if (sets.length === 1) return false;
  params.push(userId);
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `UPDATE users SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
    params
  );
  return result.affectedRows > 0;
};

export const deleteUser = async (userId: number): Promise<boolean> => {
  const [result] = await pool.execute<mysql.ResultSetHeader>('UPDATE users SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL', [userId]);
  return result.affectedRows > 0;
};

export const deleteOrder = async (orderId: number): Promise<boolean> => {
  const [result] = await pool.execute<mysql.ResultSetHeader>('UPDATE orders SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL', [orderId]);
  return result.affectedRows > 0;
};

export const deleteSms = async (smsId: number): Promise<boolean> => {
  const [result] = await pool.execute<mysql.ResultSetHeader>('UPDATE otp_codes SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL', [smsId]);
  return result.affectedRows > 0;
};

export const deleteParcel = async (parcelId: number): Promise<boolean> => {
  const [result] = await pool.execute<mysql.ResultSetHeader>('UPDATE parcels SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL', [parcelId]);
  return result.affectedRows > 0;
};

const ORDERS_SORT_COLUMNS = new Set(['id', 'user_id', 'total_amount', 'status', 'created_at']);

export const getOrdersPaged = async (
  page: number,
  limit: number,
  startDate?: string,
  endDate?: string,
  sortKey?: string,
  sortOrder?: string,
  columnFilters?: Record<string, string>,
  dateFilters?: Record<string, [string, string]>,
  logisticsProviderId?: number | null
) => {
  const safePage = toSafeInt(page, 1, 1, Number.MAX_SAFE_INTEGER);
  const safeLimit = toSafeInt(limit, 10, 1, 500);
  const offset = (safePage - 1) * safeLimit;
  const dateRange = buildCreatedAtFilter(startDate, endDate);
  const { clause: deletedClause, cleanedFilters } = buildDeletedFilter(columnFilters);
  const colFilter = buildColumnFilters(cleanedFilters, dateFilters, ORDERS_SORT_COLUMNS);
  const allClauses = [deletedClause, ...dateRange.clauses, ...colFilter.clauses];
  const allParams = [...dateRange.params, ...colFilter.params];
  if (logisticsProviderId !== undefined && logisticsProviderId !== null) {
    allClauses.push('user_id IN (SELECT id FROM users WHERE logistics_provider_id = ? AND deleted_at IS NULL)');
    allParams.push(logisticsProviderId);
  }
  const whereSql = `WHERE ${allClauses.join(' AND ')}`;
  const orderBy = toSafeOrderBy(sortKey, sortOrder, ORDERS_SORT_COLUMNS, 'created_at');

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, user_id, total_amount, currency, status, created_at, deleted_at
     FROM orders
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT ${safeLimit} OFFSET ${offset}`,
    allParams
  );

  const [countRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) as count
     FROM orders
     ${whereSql}`,
    allParams
  );

  const total = Number(countRows?.[0]?.count || 0);
  return {
    data: rows as any[],
    total,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
  };
};

export const searchOrders = async (keyword: string, startDate?: string, endDate?: string, logisticsProviderId?: number | null): Promise<any[]> => {
  const like = `%${keyword}%`;
  const { clauses, params } = buildCreatedAtFilter(startDate, endDate);
  const keywordClause = '(CAST(id AS CHAR) LIKE ? OR CAST(user_id AS CHAR) LIKE ? OR status LIKE ?)';
  const allClauses = ['deleted_at IS NULL', keywordClause, ...clauses];
  const provParams: any[] = [];
  if (logisticsProviderId !== undefined && logisticsProviderId !== null) {
    allClauses.push('user_id IN (SELECT id FROM users WHERE logistics_provider_id = ? AND deleted_at IS NULL)');
    provParams.push(logisticsProviderId);
  }
  const whereSql = `WHERE ${allClauses.join(' AND ')}`;

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, user_id, total_amount, currency, status, created_at
     FROM orders
     ${whereSql}
     ORDER BY created_at DESC`,
    [like, like, like, ...params, ...provParams]
  );
  return rows as any[];
};

export const updateOrderStatus = async (orderId: number, status: string): Promise<boolean> => {
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    'UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?',
    [status, orderId]
  );
  return result.affectedRows > 0;
};

const SMS_SORT_COLUMNS = new Set(['id', 'phone', 'code', 'verified', 'expires_at', 'created_at']);

export const getSmsPaged = async (
  page: number,
  limit: number,
  startDate?: string,
  endDate?: string,
  sortKey?: string,
  sortOrder?: string,
  columnFilters?: Record<string, string>,
  dateFilters?: Record<string, [string, string]>
) => {
  const safePage = toSafeInt(page, 1, 1, Number.MAX_SAFE_INTEGER);
  const safeLimit = toSafeInt(limit, 10, 1, 500);
  const offset = (safePage - 1) * safeLimit;
  const dateRange = buildCreatedAtFilter(startDate, endDate);
  const { clause: deletedClause, cleanedFilters } = buildDeletedFilter(columnFilters);
  const colFilter = buildColumnFilters(cleanedFilters, dateFilters, SMS_SORT_COLUMNS);
  const allClauses = [deletedClause, ...dateRange.clauses, ...colFilter.clauses];
  const allParams = [...dateRange.params, ...colFilter.params];
  const whereSql = `WHERE ${allClauses.join(' AND ')}`;
  const orderBy = toSafeOrderBy(sortKey, sortOrder, SMS_SORT_COLUMNS, 'created_at');

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, phone, code, verified, created_at, expires_at, deleted_at
     FROM otp_codes
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT ${safeLimit} OFFSET ${offset}`,
    allParams
  );

  const [countRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) as count
     FROM otp_codes
     ${whereSql}`,
    allParams
  );

  const total = Number(countRows?.[0]?.count || 0);
  return {
    data: rows as any[],
    total,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
  };
};

export const searchSms = async (keyword: string, startDate?: string, endDate?: string): Promise<any[]> => {
  const like = `%${keyword}%`;
  const { clauses, params } = buildCreatedAtFilter(startDate, endDate);
  const keywordClause = `(
    CAST(id AS CHAR) LIKE ?
    OR phone LIKE ?
    OR code LIKE ?
    OR CAST(verified AS CHAR) LIKE ?
  )`;
  const allClauses = ['deleted_at IS NULL', keywordClause, ...clauses];
  const whereSql = `WHERE ${allClauses.join(' AND ')}`;

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, phone, code, verified, created_at, expires_at
     FROM otp_codes
     ${whereSql}
     ORDER BY created_at DESC`,
    [like, like, like, like, ...params]
  );
  return rows as any[];
};

const PARCELS_SORT_COLUMNS = new Set(['id', 'user_id', 'tracking_number', 'origin', 'destination', 'weight', 'length_cm', 'width_cm', 'height_cm', 'volume', 'status', 'estimated_delivery', 'created_at']);
const PARCELS_USERNAME_COL = 'username';

export const getParcelsPaged = async (
  page: number,
  limit: number,
  startDate?: string,
  endDate?: string,
  sortKey?: string,
  sortOrder?: string,
  columnFilters?: Record<string, string>,
  dateFilters?: Record<string, [string, string]>,
  logisticsProviderId?: number | null
) => {
  const safePage = toSafeInt(page, 1, 1, Number.MAX_SAFE_INTEGER);
  const safeLimit = toSafeInt(limit, 10, 1, 500);
  const offset = (safePage - 1) * safeLimit;

  // Extract username filter before passing to buildColumnFilters
  const parcelColFilters = columnFilters ? { ...columnFilters } : undefined;
  let usernameFilter: string | undefined;
  if (parcelColFilters && parcelColFilters[PARCELS_USERNAME_COL]) {
    usernameFilter = parcelColFilters[PARCELS_USERNAME_COL];
    delete parcelColFilters[PARCELS_USERNAME_COL];
  }
  let dimensionsFilter: string | undefined;
  if (parcelColFilters && parcelColFilters['dimensions']) {
    dimensionsFilter = parcelColFilters['dimensions'];
    delete parcelColFilters['dimensions'];
  }
  let itemsFilter: string | undefined;
  if (parcelColFilters && parcelColFilters['items']) {
    itemsFilter = parcelColFilters['items'];
    delete parcelColFilters['items'];
  }
  let logisticsFilter: string | undefined;
  if (parcelColFilters && parcelColFilters['logistics_provider']) {
    logisticsFilter = parcelColFilters['logistics_provider'];
    delete parcelColFilters['logistics_provider'];
  }

  const dateRange = buildCreatedAtFilter(startDate, endDate, 'p.');
  const { clause: deletedClause, cleanedFilters } = buildDeletedFilter(parcelColFilters, 'p.');
  const colFilter = buildColumnFilters(cleanedFilters, dateFilters, PARCELS_SORT_COLUMNS, 'p.');
  const allClauses = [deletedClause, ...dateRange.clauses, ...colFilter.clauses];
  const allParams = [...dateRange.params, ...colFilter.params];

  if (usernameFilter) {
    allClauses.push(`CAST(u.username AS CHAR) LIKE ?`);
    allParams.push(`%${usernameFilter.trim()}%`);
  }
  if (dimensionsFilter) {
    allClauses.push(
      `CONCAT_WS('*', p.length_cm, p.width_cm, p.height_cm) LIKE ?`
    );
    allParams.push(`%${dimensionsFilter.trim()}%`);
  }
  if (itemsFilter) {
    allClauses.push(
      `EXISTS (SELECT 1 FROM parcel_items pi WHERE pi.parcel_id = p.id AND pi.name LIKE ?)`
    );
    allParams.push(`%${itemsFilter.trim()}%`);
  }
  if (logisticsFilter) {
    allClauses.push(`CAST(lp.name AS CHAR) LIKE ?`);
    allParams.push(`%${logisticsFilter.trim()}%`);
  }
  if (logisticsProviderId !== undefined && logisticsProviderId !== null) {
    allClauses.push('p.logistics_provider_id = ?');
    allParams.push(logisticsProviderId);
  }

  const whereSql = `WHERE ${allClauses.join(' AND ')}`;
  const safeSort = sortKey === PARCELS_USERNAME_COL ? 'u.username' : undefined;
  const orderBy = safeSort
    ? `${safeSort} ${sortOrder === 'asc' ? 'ASC' : 'DESC'}`
    : `p.${toSafeOrderBy(sortKey, sortOrder, PARCELS_SORT_COLUMNS, 'created_at')}`;

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT p.id, p.user_id, p.tracking_number, p.origin, p.destination,
            p.weight, p.length_cm, p.width_cm, p.height_cm, p.volume, p.images,
            p.status, p.sub_status, p.status_remark, p.status_updated_at,
            p.estimated_delivery, p.created_at, p.deleted_at,
            p.logistics_provider_id, lp.name AS logistics_provider_name,
            u.username AS username,
            (SELECT pi.name FROM parcel_items pi WHERE pi.parcel_id = p.id ORDER BY pi.id LIMIT 1) AS first_item_name,
            (SELECT COUNT(*) FROM parcel_items pi WHERE pi.parcel_id = p.id) AS item_count
     FROM parcels p
     LEFT JOIN users u ON p.user_id = u.id
     LEFT JOIN logistics_providers lp ON p.logistics_provider_id = lp.id
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT ${safeLimit} OFFSET ${offset}`,
    allParams
  );

  const [countRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) as count
     FROM parcels p
     LEFT JOIN users u ON p.user_id = u.id
     LEFT JOIN logistics_providers lp ON p.logistics_provider_id = lp.id
     ${whereSql}`,
    allParams
  );

  const total = Number(countRows?.[0]?.count || 0);
  return {
    data: rows as any[],
    total,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
  };
};

export const getParcelsForExport = async (
  startDate?: string,
  endDate?: string,
  sortKey?: string,
  sortOrder?: string,
  columnFilters?: Record<string, string>,
  dateFilters?: Record<string, [string, string]>,
  logisticsProviderId?: number | null
) => {
  const parcelColFilters = columnFilters ? { ...columnFilters } : undefined;
  let usernameFilter: string | undefined;
  if (parcelColFilters && parcelColFilters[PARCELS_USERNAME_COL]) {
    usernameFilter = parcelColFilters[PARCELS_USERNAME_COL];
    delete parcelColFilters[PARCELS_USERNAME_COL];
  }
  let dimensionsFilter: string | undefined;
  if (parcelColFilters && parcelColFilters['dimensions']) {
    dimensionsFilter = parcelColFilters['dimensions'];
    delete parcelColFilters['dimensions'];
  }
  let itemsFilter: string | undefined;
  if (parcelColFilters && parcelColFilters['items']) {
    itemsFilter = parcelColFilters['items'];
    delete parcelColFilters['items'];
  }

  const dateRange = buildCreatedAtFilter(startDate, endDate, 'p.');
  const { clause: deletedClause, cleanedFilters } = buildDeletedFilter(parcelColFilters, 'p.');
  const colFilter = buildColumnFilters(cleanedFilters, dateFilters, PARCELS_SORT_COLUMNS, 'p.');
  const allClauses = [deletedClause, ...dateRange.clauses, ...colFilter.clauses];
  const allParams = [...dateRange.params, ...colFilter.params];

  if (usernameFilter) {
    allClauses.push(`CAST(u.username AS CHAR) LIKE ?`);
    allParams.push(`%${usernameFilter.trim()}%`);
  }
  if (dimensionsFilter) {
    allClauses.push(
      `CONCAT_WS('*', p.length_cm, p.width_cm, p.height_cm) LIKE ?`
    );
    allParams.push(`%${dimensionsFilter.trim()}%`);
  }
  if (itemsFilter) {
    allClauses.push(
      `EXISTS (SELECT 1 FROM parcel_items pi WHERE pi.parcel_id = p.id AND pi.name LIKE ?)`
    );
    allParams.push(`%${itemsFilter.trim()}%`);
  }
  if (logisticsProviderId !== undefined && logisticsProviderId !== null) {
    allClauses.push('p.logistics_provider_id = ?');
    allParams.push(logisticsProviderId);
  }

  const whereSql = `WHERE ${allClauses.join(' AND ')}`;
  const safeSort = sortKey === PARCELS_USERNAME_COL ? 'u.username' : undefined;
  const orderBy = safeSort
    ? `${safeSort} ${sortOrder === 'asc' ? 'ASC' : 'DESC'}`
    : `p.${toSafeOrderBy(sortKey, sortOrder, PARCELS_SORT_COLUMNS, 'created_at')}`;

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT p.id, p.user_id, p.tracking_number, p.origin, p.destination,
            p.weight, p.length_cm, p.width_cm, p.height_cm, p.volume,
            p.status, p.sub_status, p.status_remark, p.created_at,
            u.username AS username,
            (SELECT GROUP_CONCAT(pi.name SEPARATOR ',') FROM parcel_items pi WHERE pi.parcel_id = p.id) AS item_names,
            (SELECT GROUP_CONCAT(pi.value SEPARATOR ',') FROM parcel_items pi WHERE pi.parcel_id = p.id) AS item_values,
            (SELECT GROUP_CONCAT(pi.quantity SEPARATOR ',') FROM parcel_items pi WHERE pi.parcel_id = p.id) AS item_quantities
     FROM parcels p
     LEFT JOIN users u ON p.user_id = u.id
     ${whereSql}
     ORDER BY ${orderBy}`,
    allParams
  );

  return rows as any[];
};

export const searchParcels = async (keyword: string, startDate?: string, endDate?: string, logisticsProviderId?: number | null): Promise<any[]> => {
  const like = `%${keyword}%`;
  const { clauses, params } = buildCreatedAtFilter(startDate, endDate, 'p.');
  const keywordClause = `(
    CAST(p.id AS CHAR) LIKE ?
    OR CAST(p.user_id AS CHAR) LIKE ?
    OR p.tracking_number LIKE ?
    OR p.origin LIKE ?
    OR p.destination LIKE ?
    OR p.status LIKE ?
    OR u.username LIKE ?
  )`;
  const allClauses = ['p.deleted_at IS NULL', keywordClause, ...clauses];
  const provParams: any[] = [];
  if (logisticsProviderId !== undefined && logisticsProviderId !== null) {
    allClauses.push('p.logistics_provider_id = ?');
    provParams.push(logisticsProviderId);
  }
  const whereSql = `WHERE ${allClauses.join(' AND ')}`;

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT p.id, p.user_id, p.tracking_number, p.origin, p.destination,
            p.weight, p.length_cm, p.width_cm, p.height_cm, p.volume, p.images,
            p.status, p.sub_status, p.status_remark, p.status_updated_at,
            p.estimated_delivery, p.created_at,
            p.logistics_provider_id, lp.name AS logistics_provider_name,
            u.username AS username,
            (SELECT pi.name FROM parcel_items pi WHERE pi.parcel_id = p.id ORDER BY pi.id LIMIT 1) AS first_item_name,
            (SELECT COUNT(*) FROM parcel_items pi WHERE pi.parcel_id = p.id) AS item_count
     FROM parcels p
     LEFT JOIN users u ON p.user_id = u.id
     LEFT JOIN logistics_providers lp ON p.logistics_provider_id = lp.id
     ${whereSql}
     ORDER BY p.created_at DESC`,
    [like, like, like, like, like, like, like, ...params, ...provParams]
  );
  return rows as any[];
};

export const updateParcelStatus = async (
  parcelId: number,
  status: string,
  subStatus?: string | null,
  statusRemark?: string | null,
  operatorId?: number | null
): Promise<boolean> => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Get current status for logging
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      'SELECT status, sub_status FROM parcels WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [parcelId]
    );
    if (!rows.length) {
      await conn.rollback();
      return false;
    }
    const fromStatus = rows[0].status;

    // Update parcel status
    const sets: string[] = ['status = ?', 'status_updated_at = NOW()', 'updated_at = NOW()'];
    const params: any[] = [status];
    if (subStatus !== undefined) { sets.push('sub_status = ?'); params.push(subStatus || null); }
    if (statusRemark !== undefined) { sets.push('status_remark = ?'); params.push(statusRemark || null); }
    params.push(parcelId);

    const [result] = await conn.execute<mysql.ResultSetHeader>(
      `UPDATE parcels SET ${sets.join(', ')} WHERE id = ?`,
      params
    );
    if (result.affectedRows === 0) {
      await conn.rollback();
      return false;
    }

    // Insert status change log
    await conn.execute(
      `INSERT INTO parcel_status_logs (parcel_id, from_status, to_status, sub_status, remark, operator_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [parcelId, fromStatus, status, subStatus || null, statusRemark || null, operatorId || null]
    );

    await conn.commit();
    return true;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

export const createParcelInbound = async (payload: {
  tracking_number: string;
  weight: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  volume: number;
  images?: string;
  shelf_location?: string;
  logistics_provider_id?: number | null;
  items: { name: string; value: number; quantity: number }[];
}): Promise<number> => {
  const { tracking_number, weight, length_cm, width_cm, height_cm, volume, images, shelf_location, logistics_provider_id, items } = payload;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Check if parcel with same tracking number already exists (including soft-deleted)
    const [existing] = await conn.execute<mysql.RowDataPacket[]>(
      'SELECT id FROM parcels WHERE tracking_number = ? LIMIT 1',
      [tracking_number]
    );

    let parcelId: number;
    if (existing.length > 0) {
      // Update existing parcel with new inbound info (restore if soft-deleted)
      parcelId = existing[0].id;
      await conn.execute(
        `UPDATE parcels SET weight = ?, length_cm = ?, width_cm = ?, height_cm = ?, volume = ?,
         images = ?, shelf_location = ?, logistics_provider_id = ?, status = 'arrived', status_updated_at = NOW(),
         deleted_at = NULL, updated_at = NOW()
         WHERE id = ?`,
        [weight, length_cm, width_cm, height_cm, volume, images || null, shelf_location || null, logistics_provider_id || null, parcelId]
      );
      // Remove old items, will re-insert below
      await conn.execute('DELETE FROM parcel_items WHERE parcel_id = ?', [parcelId]);
    } else {
      // Insert new parcel
      const [result] = await conn.execute<mysql.ResultSetHeader>(
        `INSERT INTO parcels (tracking_number, weight, length_cm, width_cm, height_cm, volume, images, shelf_location, logistics_provider_id, origin, destination, status, status_updated_at, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', 'arrived', NOW(), NULL)`,
        [tracking_number, weight, length_cm, width_cm, height_cm, volume, images || null, shelf_location || null, logistics_provider_id || null]
      );
      parcelId = result.insertId;
    }

    for (const item of items) {
      await conn.execute(
        `INSERT INTO parcel_items (parcel_id, name, value, quantity) VALUES (?, ?, ?, ?)`,
        [parcelId, item.name, item.value, item.quantity]
      );
    }
    await conn.commit();
    return parcelId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

export const getParcelItems = async (parcelId: number): Promise<{ id: number; name: string; value: number; quantity: number }[]> => {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    'SELECT id, name, value, quantity FROM parcel_items WHERE parcel_id = ? ORDER BY id',
    [parcelId]
  );
  return (rows as any[]).map(r => ({
    id: r.id,
    name: r.name,
    value: Number(r.value),
    quantity: Number(r.quantity),
  }));
};

export const updateParcel = async (parcelId: number, payload: {
  weight: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  volume: number;
  origin?: string;
  destination?: string;
  status?: string;
  sub_status?: string;
  status_remark?: string;
  images?: string;
  logistics_provider_id?: number | null;
  items: { name: string; value: number; quantity: number }[];
}): Promise<boolean> => {
  const { weight, length_cm, width_cm, height_cm, volume, origin, destination, status, sub_status, status_remark, images, logistics_provider_id, items } = payload;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const sets: string[] = ['weight = ?', 'length_cm = ?', 'width_cm = ?', 'height_cm = ?', 'volume = ?', 'updated_at = NOW()'];
    const params: any[] = [weight, length_cm, width_cm, height_cm, volume];
    if (origin !== undefined) { sets.push('origin = ?'); params.push(origin); }
    if (destination !== undefined) { sets.push('destination = ?'); params.push(destination); }
    if (status !== undefined) { sets.push('status = ?'); sets.push('status_updated_at = NOW()'); params.push(status); }
    if (sub_status !== undefined) { sets.push('sub_status = ?'); params.push(sub_status || null); }
    if (status_remark !== undefined) { sets.push('status_remark = ?'); params.push(status_remark || null); }
    if (images !== undefined) { sets.push('images = ?'); params.push(images || null); }
    if (logistics_provider_id !== undefined) { sets.push('logistics_provider_id = ?'); params.push(logistics_provider_id || null); }
    params.push(parcelId);
    const [result] = await conn.execute<mysql.ResultSetHeader>(
      `UPDATE parcels SET ${sets.join(', ')} WHERE id = ?`,
      params
    );
    if (result.affectedRows === 0) {
      await conn.rollback();
      return false;
    }
    await conn.execute('DELETE FROM parcel_items WHERE parcel_id = ?', [parcelId]);
    for (const item of items) {
      await conn.execute(
        'INSERT INTO parcel_items (parcel_id, name, value, quantity) VALUES (?, ?, ?, ?)',
        [parcelId, item.name, item.value, item.quantity]
      );
    }
    await conn.commit();
    return true;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

export const getParcelStatusLogs = async (parcelId: number): Promise<any[]> => {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT psl.id, psl.parcel_id, psl.from_status, psl.to_status, psl.sub_status,
            psl.remark, psl.operator_id, psl.created_at,
            a.username AS operator_name
     FROM parcel_status_logs psl
     LEFT JOIN admin_users a ON psl.operator_id = a.id
     WHERE psl.parcel_id = ?
     ORDER BY psl.created_at DESC`,
    [parcelId]
  );
  return rows as any[];
};

export const getStatusLogsPaged = async (
  page: number,
  limit: number,
  keyword?: string,
  startDate?: string,
  endDate?: string,
  logisticsProviderId?: number | null,
) => {
  const safePage = toSafeInt(page, 1, 1, Number.MAX_SAFE_INTEGER);
  const safeLimit = toSafeInt(limit, 20, 1, 500);
  const offset = (safePage - 1) * safeLimit;

  const allClauses: string[] = [];
  const allParams: any[] = [];

  if (keyword && keyword.trim()) {
    const like = `%${keyword.trim()}%`;
    allClauses.push(`(
      CAST(psl.parcel_id AS CHAR) LIKE ?
      OR p.tracking_number LIKE ?
      OR psl.from_status LIKE ?
      OR psl.to_status LIKE ?
      OR psl.remark LIKE ?
      OR a.username LIKE ?
    )`);
    allParams.push(like, like, like, like, like, like);
  }
  if (startDate) { allClauses.push('psl.created_at >= ?'); allParams.push(startDate); }
  if (endDate) { allClauses.push('psl.created_at <= ?'); allParams.push(endDate + ' 23:59:59'); }
  if (logisticsProviderId !== undefined && logisticsProviderId !== null) {
    allClauses.push('p.logistics_provider_id = ?');
    allParams.push(logisticsProviderId);
  }

  const whereSql = allClauses.length > 0 ? `WHERE ${allClauses.join(' AND ')}` : '';

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT psl.id, psl.parcel_id, psl.from_status, psl.to_status, psl.sub_status,
            psl.remark, psl.operator_id, psl.created_at,
            a.username AS operator_name,
            p.tracking_number
     FROM parcel_status_logs psl
     LEFT JOIN admin_users a ON psl.operator_id = a.id
     LEFT JOIN parcels p ON psl.parcel_id = p.id
     ${whereSql}
     ORDER BY psl.created_at DESC
     LIMIT ${safeLimit} OFFSET ${offset}`,
    allParams
  );

  const [countRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) as count
     FROM parcel_status_logs psl
     LEFT JOIN admin_users a ON psl.operator_id = a.id
     LEFT JOIN parcels p ON psl.parcel_id = p.id
     ${whereSql}`,
    allParams
  );

  const total = Number(countRows?.[0]?.count || 0);
  return {
    data: rows as any[],
    total,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
  };
};

const ADMINS_SORT_COLUMNS = new Set(['id', 'username', 'email', 'role', 'role_scope', 'role_logistics_provider_id', 'logistics_provider_id', 'status', 'last_login', 'created_at']);

export const getAdminsPaged = async (
  page: number,
  limit: number,
  sortKey?: string,
  sortOrder?: string,
  columnFilters?: Record<string, string>,
  dateFilters?: Record<string, [string, string]>,
  logisticsProviderId?: number | null
) => {
  const orderBy = toSafeOrderBy(sortKey, sortOrder, ADMINS_SORT_COLUMNS, 'created_at');
  const { clause: deletedClause, cleanedFilters } = buildDeletedFilter(columnFilters);
  const { clauses, params } = buildColumnFilters(cleanedFilters, dateFilters, ADMINS_SORT_COLUMNS);
  const allClauses = [deletedClause, ...clauses];
  if (logisticsProviderId !== undefined && logisticsProviderId !== null) {
    allClauses.push('logistics_provider_id = ?');
    params.push(logisticsProviderId);
  }
  const whereSql = `WHERE ${allClauses.join(' AND ')}`;

  const safePage = toSafeInt(page, 1, 1, Number.MAX_SAFE_INTEGER);
  const safeLimit = toSafeInt(limit, 10, 1, 500);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, username, email, role, role_scope, role_logistics_provider_id, logistics_provider_id, status, is_system, last_login, created_at, updated_at, deleted_at
     FROM admin_users
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT ${safeLimit} OFFSET ${offset}`,
    params
  );

  const [countRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) as count FROM admin_users ${whereSql}`,
    params
  );

  const total = Number(countRows?.[0]?.count || 0);
  return {
    data: rows as any[],
    total,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
  };
};

export const searchAdmins = async (keyword: string, logisticsProviderId?: number | null): Promise<any[]> => {
  const like = `%${keyword}%`;
  const provClause = (logisticsProviderId !== undefined && logisticsProviderId !== null) ? ' AND logistics_provider_id = ?' : '';
  const provParams: any[] = provClause ? [logisticsProviderId] : [];
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, username, email, role, role_scope, role_logistics_provider_id, logistics_provider_id, status, is_system, last_login, created_at, updated_at
     FROM admin_users
     WHERE deleted_at IS NULL AND (
       CAST(id AS CHAR) LIKE ?
       OR username LIKE ?
       OR email LIKE ?
       OR role LIKE ?
       OR role_scope LIKE ?
       OR CAST(role_logistics_provider_id AS CHAR) LIKE ?
       OR CAST(logistics_provider_id AS CHAR) LIKE ?
       OR status LIKE ?
     )${provClause}
     ORDER BY created_at DESC`,
    [like, like, like, like, like, like, like, like, ...provParams]
  );
  return rows as any[];
};

export const createAdmin = async (payload: {
  username: string;
  password: string;
  email: string;
  role: string;
  role_scope?: 'platform' | 'logistics';
  role_logistics_provider_id?: number | null;
  logistics_provider_id?: number | null;
}) => {
  const existing = await getAdminByUsername(payload.username);
  if (existing) return null;

  const hashed = await bcrypt.hash(payload.password, 10);
  const roleScope = payload.role_scope === 'logistics' ? 'logistics' : 'platform';
  const roleProviderId = roleScope === 'logistics' ? (payload.role_logistics_provider_id || null) : null;
  const adminProviderId = payload.logistics_provider_id || null;
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    'INSERT INTO admin_users (username, password, email, role, role_scope, role_logistics_provider_id, logistics_provider_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [payload.username, hashed, payload.email, payload.role || 'admin', roleScope, roleProviderId, adminProviderId, 'active']
  );
  return {
    id: result.insertId,
    username: payload.username,
    email: payload.email,
    role: payload.role || 'admin',
    role_scope: roleScope,
    role_logistics_provider_id: roleProviderId,
    logistics_provider_id: adminProviderId,
    status: 'active',
  };
};

export const updateAdminAccount = async (
  adminId: number,
  payload: {
    username?: string;
    email?: string;
    role?: string;
    role_scope?: 'platform' | 'logistics';
    role_logistics_provider_id?: number | null;
    logistics_provider_id?: number | null;
    password?: string;
  }
): Promise<'updated' | 'duplicate_username' | 'not_found'> => {
  const sets: string[] = ['updated_at = NOW()'];
  const params: any[] = [];

  if (payload.username !== undefined) {
    const username = payload.username.trim();
    const [dupeRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT id FROM admin_users WHERE username = ? AND id <> ? AND deleted_at IS NULL LIMIT 1',
      [username, adminId]
    );
    if (dupeRows.length > 0) {
      return 'duplicate_username';
    }
    sets.push('username = ?');
    params.push(username);
  }
  if (payload.email !== undefined) {
    sets.push('email = ?');
    params.push(payload.email.trim());
  }
  if (payload.role !== undefined) {
    sets.push('role = ?');
    params.push(payload.role.trim());
  }
  if (payload.role_scope !== undefined) {
    sets.push('role_scope = ?');
    params.push(payload.role_scope === 'logistics' ? 'logistics' : 'platform');
  }
  if (payload.role_logistics_provider_id !== undefined) {
    sets.push('role_logistics_provider_id = ?');
    params.push(payload.role_logistics_provider_id || null);
  }
  if (payload.logistics_provider_id !== undefined) {
    sets.push('logistics_provider_id = ?');
    params.push(payload.logistics_provider_id || null);
  }
  if (payload.password !== undefined) {
    const hashed = await bcrypt.hash(payload.password, 10);
    sets.push('password = ?');
    params.push(hashed);
  }

  if (sets.length === 1) {
    return 'not_found';
  }

  params.push(adminId);
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `UPDATE admin_users SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
    params
  );
  if (result.affectedRows === 0) {
    return 'not_found';
  }
  return 'updated';
};

export const updateAdminStatus = async (adminId: number, status: string): Promise<boolean> => {
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    'UPDATE admin_users SET status = ?, updated_at = NOW() WHERE id = ?',
    [status, adminId]
  );
  return result.affectedRows > 0;
};

export const deleteAdmin = async (adminId: number): Promise<boolean> => {
  const [result] = await pool.execute<mysql.ResultSetHeader>('UPDATE admin_users SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL', [adminId]);
  return result.affectedRows > 0;
};

export const batchDeleteUsers = async (ids: number[], logisticsProviderId?: number | null): Promise<number> => {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const provClause = (logisticsProviderId !== undefined && logisticsProviderId !== null) ? ' AND logistics_provider_id = ?' : '';
  const provParams = provClause ? [logisticsProviderId] : [];
  const [result] = await pool.execute<mysql.ResultSetHeader>(`UPDATE users SET deleted_at = NOW() WHERE id IN (${placeholders}) AND deleted_at IS NULL${provClause}`, [...ids, ...provParams]);
  return result.affectedRows;
};

export const batchDeleteOrders = async (ids: number[], logisticsProviderId?: number | null): Promise<number> => {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const provClause = (logisticsProviderId !== undefined && logisticsProviderId !== null) ? ' AND user_id IN (SELECT id FROM users WHERE logistics_provider_id = ?)' : '';
  const provParams = provClause ? [logisticsProviderId] : [];
  const [result] = await pool.execute<mysql.ResultSetHeader>(`UPDATE orders SET deleted_at = NOW() WHERE id IN (${placeholders}) AND deleted_at IS NULL${provClause}`, [...ids, ...provParams]);
  return result.affectedRows;
};

export const batchDeleteSms = async (ids: number[]): Promise<number> => {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const [result] = await pool.execute<mysql.ResultSetHeader>(`UPDATE otp_codes SET deleted_at = NOW() WHERE id IN (${placeholders}) AND deleted_at IS NULL`, ids);
  return result.affectedRows;
};

export const batchDeleteParcels = async (ids: number[], logisticsProviderId?: number | null): Promise<number> => {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const provClause = (logisticsProviderId !== undefined && logisticsProviderId !== null) ? ' AND logistics_provider_id = ?' : '';
  const provParams = provClause ? [logisticsProviderId] : [];
  const [result] = await pool.execute<mysql.ResultSetHeader>(`UPDATE parcels SET deleted_at = NOW() WHERE id IN (${placeholders}) AND deleted_at IS NULL${provClause}`, [...ids, ...provParams]);
  return result.affectedRows;
};

export const batchDeleteAdmins = async (ids: number[], logisticsProviderId?: number | null): Promise<number> => {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const provClause = (logisticsProviderId !== undefined && logisticsProviderId !== null) ? ' AND logistics_provider_id = ?' : '';
  const provParams = provClause ? [logisticsProviderId] : [];
  // 初始管理员账号（is_system=1）不可删除
  const [result] = await pool.execute<mysql.ResultSetHeader>(`UPDATE admin_users SET deleted_at = NOW() WHERE id IN (${placeholders}) AND deleted_at IS NULL AND is_system = 0${provClause}`, [...ids, ...provParams]);
  return result.affectedRows;
};

// 资源归属查询：返回资源所属物流商ID；记录不存在返回 undefined，未绑定物流商返回 null
export const getParcelOwnerProviderId = async (parcelId: number): Promise<number | null | undefined> => {
  const row = await querySingle<{ logistics_provider_id: number | null }>(
    'SELECT logistics_provider_id FROM parcels WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [parcelId]
  );
  return row ? (row.logistics_provider_id ?? null) : undefined;
};

export const getUserOwnerProviderId = async (userId: number): Promise<number | null | undefined> => {
  const row = await querySingle<{ logistics_provider_id: number | null }>(
    'SELECT logistics_provider_id FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [userId]
  );
  return row ? (row.logistics_provider_id ?? null) : undefined;
};

export const getOrderOwnerProviderId = async (orderId: number): Promise<number | null | undefined> => {
  const row = await querySingle<{ logistics_provider_id: number | null }>(
    'SELECT u.logistics_provider_id FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE o.id = ? AND o.deleted_at IS NULL LIMIT 1',
    [orderId]
  );
  return row ? (row.logistics_provider_id ?? null) : undefined;
};

const LOGISTICS_SORT_COLUMNS = new Set(['id', 'name', 'code', 'contact_name', 'contact_phone', 'email', 'website', 'status', 'created_at']);

export const getLogisticsProvidersPaged = async (
  page: number,
  limit: number,
  sortKey?: string,
  sortOrder?: string,
  columnFilters?: Record<string, string>,
  dateFilters?: Record<string, [string, string]>
) => {
  const orderBy = toSafeOrderBy(sortKey, sortOrder, LOGISTICS_SORT_COLUMNS, 'created_at');
  const { clause: deletedClause, cleanedFilters } = buildDeletedFilter(columnFilters);
  const { clauses, params } = buildColumnFilters(cleanedFilters, dateFilters, LOGISTICS_SORT_COLUMNS);
  const allClauses = [deletedClause, ...clauses];
  const whereSql = `WHERE ${allClauses.join(' AND ')}`;

  const safePage = toSafeInt(page, 1, 1, Number.MAX_SAFE_INTEGER);
  const safeLimit = toSafeInt(limit, 10, 1, 500);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, name, code, contact_name, contact_phone, email, website, status, remark, created_at, updated_at, deleted_at
     FROM logistics_providers
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT ${safeLimit} OFFSET ${offset}`,
    params
  );

  const [countRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) as count FROM logistics_providers ${whereSql}`,
    params
  );

  const total = Number(countRows?.[0]?.count || 0);
  return {
    data: rows as any[],
    total,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
  };
};

export const searchLogisticsProviders = async (keyword: string): Promise<any[]> => {
  const like = `%${keyword}%`;
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, name, code, contact_name, contact_phone, email, website, status, remark, created_at, updated_at
     FROM logistics_providers
     WHERE deleted_at IS NULL AND (
       CAST(id AS CHAR) LIKE ?
       OR name LIKE ?
       OR code LIKE ?
       OR contact_name LIKE ?
       OR contact_phone LIKE ?
       OR status LIKE ?
     )
     ORDER BY created_at DESC`,
    [like, like, like, like, like, like]
  );
  return rows as any[];
};

export const getActiveLogisticsProviders = async (): Promise<any[]> => {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, name, code FROM logistics_providers
     WHERE deleted_at IS NULL AND status = 'active'
     ORDER BY name ASC`
  );
  return rows as any[];
};

export const createLogisticsProvider = async (payload: {
  name: string;
  code?: string;
  contact_name?: string;
  contact_phone?: string;
  email?: string;
  website?: string;
  status?: string;
  remark?: string;
}) => {
  const status = payload.status === 'inactive' ? 'inactive' : 'active';
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `INSERT INTO logistics_providers (name, code, contact_name, contact_phone, email, website, status, remark)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.name,
      payload.code || null,
      payload.contact_name || null,
      payload.contact_phone || null,
      payload.email || null,
      payload.website || null,
      status,
      payload.remark || null,
    ]
  );
  return { id: result.insertId, ...payload, status };
};

export const getLogisticsProviderByCode = async (code: string): Promise<{ id: number; name: string; code: string | null } | null> => {
  const normalized = String(code || '').trim().toLowerCase();
  if (!normalized) return null;
  return querySingle<{ id: number; name: string; code: string | null }>(
    `SELECT id, name, code FROM logistics_providers WHERE LOWER(code) = ? AND deleted_at IS NULL LIMIT 1`,
    [normalized]
  );
};

/**
 * 为指定物流商补齐【初始角色】与【初始管理员账号】（幂等，可重复调用）。
 * - 初始角色：name="Admin"，code="admin"，scope="logistics"，is_system=1（不可删除）
 * - 初始管理员账号：username=admin@<物流商代号>，初始密码 88888888，is_system=1（不可删除）
 */
export const ensureLogisticsInitialAccess = async (provider: { id: number; code?: string | null; name?: string | null }): Promise<void> => {
  const providerId = Number(provider.id);
  if (!Number.isInteger(providerId) || providerId <= 0) return;

  const normalizedCode = String(provider.code || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const codeForUser = normalizedCode || `lp${providerId}`;

  // 1) 初始角色 Admin / admin（物流商作用域）
  const existingRole = await querySingle<{ id: number }>(
    `SELECT id FROM admin_roles WHERE code = ? AND scope = ? AND logistics_provider_id <=> ? LIMIT 1`,
    ['admin', 'logistics', providerId]
  );
  let roleId = Number(existingRole?.id || 0);
  if (!roleId) {
    const [inserted] = await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO admin_roles (code, name, scope, logistics_provider_id, is_system) VALUES (?, ?, ?, ?, 1)`,
      ['admin', 'Admin', 'logistics', providerId]
    );
    roleId = inserted.insertId;
    for (const permissionCode of LOGISTICS_ALLOWED_PERMISSIONS) {
      await pool.execute(
        `INSERT IGNORE INTO admin_role_permissions (role_id, role, permission_code) VALUES (?, ?, ?)`,
        [roleId, 'admin', permissionCode]
      );
    }
  } else {
    // 确保 is_system 标记存在（旧数据补标记，防止被删除）
    await pool.execute(`UPDATE admin_roles SET is_system = 1 WHERE id = ?`, [roleId]);
    // 旧物流商角色补发「概览首页」权限（该权限为新增项，历史角色尚未拥有）
    await pool.execute(
      `INSERT IGNORE INTO admin_role_permissions (role_id, role, permission_code) VALUES (?, ?, ?)`,
      [roleId, 'admin', PERMISSIONS.OVERVIEW_VIEW]
    );
  }

  // 2) 初始管理员账号 admin@<代号>
  const username = `admin@${codeForUser}`;
  const existingAdmin = await querySingle<{ id: number }>(
    `SELECT id FROM admin_users WHERE username = ? LIMIT 1`,
    [username]
  );
  if (!existingAdmin) {
    const hashed = await bcrypt.hash('88888888', 10);
    await pool.execute(
      `INSERT INTO admin_users (username, password, email, role, role_scope, role_logistics_provider_id, logistics_provider_id, status, is_system)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [username, hashed, `${username}.local`, 'admin', 'logistics', providerId, providerId, 'active']
    );
  } else {
    await pool.execute(`UPDATE admin_users SET is_system = 1 WHERE id = ?`, [existingAdmin.id]);
  }
};

export const updateLogisticsProvider = async (id: number, payload: {
  name?: string;
  code?: string;
  contact_name?: string;
  contact_phone?: string;
  email?: string;
  website?: string;
  status?: string;
  remark?: string;
}): Promise<boolean> => {
  const sets: string[] = ['updated_at = NOW()'];
  const params: any[] = [];
  if (payload.name !== undefined) { sets.push('name = ?'); params.push(payload.name); }
  if (payload.code !== undefined) { sets.push('code = ?'); params.push(payload.code || null); }
  if (payload.contact_name !== undefined) { sets.push('contact_name = ?'); params.push(payload.contact_name || null); }
  if (payload.contact_phone !== undefined) { sets.push('contact_phone = ?'); params.push(payload.contact_phone || null); }
  if (payload.email !== undefined) { sets.push('email = ?'); params.push(payload.email || null); }
  if (payload.website !== undefined) { sets.push('website = ?'); params.push(payload.website || null); }
  if (payload.status !== undefined) { sets.push('status = ?'); params.push(payload.status === 'inactive' ? 'inactive' : 'active'); }
  if (payload.remark !== undefined) { sets.push('remark = ?'); params.push(payload.remark || null); }
  params.push(id);
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `UPDATE logistics_providers SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
    params
  );
  return result.affectedRows > 0;
};

export const deleteLogisticsProvider = async (id: number): Promise<boolean> => {
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    'UPDATE logistics_providers SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  return result.affectedRows > 0;
};

export const batchDeleteLogisticsProviders = async (ids: number[]): Promise<number> => {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const [result] = await pool.execute<mysql.ResultSetHeader>(`UPDATE logistics_providers SET deleted_at = NOW() WHERE id IN (${placeholders}) AND deleted_at IS NULL`, ids);
  return result.affectedRows;
};

export const logAdminAudit = async (payload: {
  adminId?: number | null;
  action: string;
  targetType?: string | null;
  targetId?: number | null;
  result: 'success' | 'failed' | 'denied';
  ip?: string | null;
  detail?: string | null;
}): Promise<void> => {
  await pool.execute(
    `INSERT INTO admin_audit_logs
      (admin_id, action, target_type, target_id, result, ip, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.adminId ?? null,
      payload.action,
      payload.targetType ?? null,
      payload.targetId ?? null,
      payload.result,
      payload.ip ?? null,
      payload.detail ?? null,
    ]
  );
};

export const getAdminAuditLogsPaged = async (page: number, limit: number) => {
  return toPagedResult(
    page,
    limit,
    async (safeLimit, offset) => {
      const [rows] = await pool.query<mysql.RowDataPacket[]>(
        `SELECT id, admin_id, action, target_type, target_id, result, ip, detail, created_at
         FROM admin_audit_logs
         ORDER BY created_at DESC
         LIMIT ${safeLimit} OFFSET ${offset}`
      );
      return rows as any[];
    },
    getAuditLogsCount
  );
};
