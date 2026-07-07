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

/**
 * 从 columnFilters 中取出并移除多选状态快筛键（逗号分隔的编码列表），
 * 返回去重后的编码数组，供 IN 匹配使用。
 */
const extractStatusInFilter = (
  columnFilters: Record<string, string> | undefined,
  key: string
): string[] => {
  if (!columnFilters || !columnFilters[key]) return [];
  const codes = String(columnFilters[key])
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  delete columnFilters[key];
  return Array.from(new Set(codes));
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

// 《包裹状态字典》内置数据，用于首次初始化 parcel_statuses 表
export const DEFAULT_PARCEL_STATUSES: Array<{
  status_id: number;
  status_code: string;
  status_name: string;
  status_type: '货物态' | '信息态';
  status_category: string;
}> = [
  { status_id: 1001, status_code: 'order_created', status_name: '已下单', status_type: '信息态', status_category: '揽收' },
  { status_id: 1002, status_code: 'awaiting_pickup', status_name: '待揽收', status_type: '货物态', status_category: '揽收' },
  { status_id: 1003, status_code: 'picked_up', status_name: '已揽收', status_type: '货物态', status_category: '揽收' },
  { status_id: 1004, status_code: 'awaiting_warehousing', status_name: '待入库', status_type: '货物态', status_category: '揽收' },
  { status_id: 2001, status_code: 'warehoused', status_name: '已入库', status_type: '货物态', status_category: '仓储处理' },
  { status_id: 2002, status_code: 'awaiting_shelving', status_name: '待上架', status_type: '货物态', status_category: '仓储处理' },
  { status_id: 2003, status_code: 'shelved', status_name: '已上架', status_type: '货物态', status_category: '仓储处理' },
  { status_id: 2004, status_code: 'packing', status_name: '打包中', status_type: '货物态', status_category: '仓储处理' },
  { status_id: 2005, status_code: 'awaiting_dispatch', status_name: '待出库', status_type: '货物态', status_category: '仓储处理' },
  { status_id: 2006, status_code: 'dispatched', status_name: '已出库', status_type: '货物态', status_category: '仓储处理' },
  { status_id: 3001, status_code: 'export_declaration_submitted', status_name: '出口申报', status_type: '信息态', status_category: '出口清关' },
  { status_id: 3002, status_code: 'export_declaration_rejected', status_name: '出口申报退单', status_type: '信息态', status_category: '出口清关' },
  { status_id: 3003, status_code: 'export_risk_control', status_name: '出口系统布控', status_type: '信息态', status_category: '出口清关' },
  { status_id: 3004, status_code: 'export_system_released', status_name: '出口系统放行', status_type: '信息态', status_category: '出口清关' },
  { status_id: 3005, status_code: 'export_customs_clearing', status_name: '出口通关中', status_type: '货物态', status_category: '出口清关' },
  { status_id: 3006, status_code: 'export_customs_inspection', status_name: '出口通关查验', status_type: '货物态', status_category: '出口清关' },
  { status_id: 3007, status_code: 'export_customs_seized', status_name: '出口通关扣货', status_type: '货物态', status_category: '出口清关' },
  { status_id: 3008, status_code: 'export_customs_returned', status_name: '出口通关退运', status_type: '货物态', status_category: '出口清关' },
  { status_id: 3009, status_code: 'export_customs_destroyed', status_name: '出口通关销毁', status_type: '货物态', status_category: '出口清关' },
  { status_id: 3010, status_code: 'export_customs_released', status_name: '出口通关放行', status_type: '货物态', status_category: '出口清关' },
  { status_id: 4001, status_code: 'cross_border_departed', status_name: '跨境干线离港', status_type: '货物态', status_category: '跨境干线运输' },
  { status_id: 4002, status_code: 'cross_border_in_transit', status_name: '跨境干线运输中', status_type: '货物态', status_category: '跨境干线运输' },
  { status_id: 4003, status_code: 'cross_border_transshipment', status_name: '跨境干线中转', status_type: '货物态', status_category: '跨境干线运输' },
  { status_id: 4004, status_code: 'cross_border_arrived', status_name: '跨境干线到港', status_type: '货物态', status_category: '跨境干线运输' },
  { status_id: 5001, status_code: 'import_declaration_submitted', status_name: '进口申报', status_type: '信息态', status_category: '进口清关' },
  { status_id: 5002, status_code: 'import_declaration_rejected', status_name: '进口申报退单', status_type: '信息态', status_category: '进口清关' },
  { status_id: 5003, status_code: 'import_risk_control', status_name: '进口系统布控', status_type: '信息态', status_category: '进口清关' },
  { status_id: 5004, status_code: 'import_system_released', status_name: '进口系统放行', status_type: '信息态', status_category: '进口清关' },
  { status_id: 5005, status_code: 'import_customs_clearing', status_name: '进口通关中', status_type: '货物态', status_category: '进口清关' },
  { status_id: 5006, status_code: 'import_customs_inspection', status_name: '进口通关查验', status_type: '货物态', status_category: '进口清关' },
  { status_id: 5007, status_code: 'import_customs_seized', status_name: '进口通关扣货', status_type: '货物态', status_category: '进口清关' },
  { status_id: 5008, status_code: 'import_customs_returned', status_name: '进口通关退运', status_type: '货物态', status_category: '进口清关' },
  { status_id: 5009, status_code: 'import_customs_destroyed', status_name: '进口通关销毁', status_type: '货物态', status_category: '进口清关' },
  { status_id: 5010, status_code: 'import_customs_released', status_name: '进口通关放行', status_type: '货物态', status_category: '进口清关' },
  { status_id: 6001, status_code: 'destination_dispatch_outbound', status_name: '派送运输出库', status_type: '货物态', status_category: '目的地派送' },
  { status_id: 6002, status_code: 'destination_dispatch_in_transit', status_name: '派送运输中', status_type: '货物态', status_category: '目的地派送' },
  { status_id: 6003, status_code: 'destination_dispatch_inbound', status_name: '派送运输入库', status_type: '货物态', status_category: '目的地派送' },
  { status_id: 6004, status_code: 'out_for_delivery', status_name: '派送中', status_type: '货物态', status_category: '目的地派送' },
  { status_id: 6005, status_code: 'delivery_failed', status_name: '派送失败', status_type: '货物态', status_category: '目的地派送' },
  { status_id: 6006, status_code: 'delivery_exception', status_name: '派送异常', status_type: '货物态', status_category: '目的地派送' },
  { status_id: 6007, status_code: 'delivery_refused', status_name: '派送拒收', status_type: '货物态', status_category: '目的地派送' },
  { status_id: 6101, status_code: 'self_pickup_inbound', status_name: '自提入仓', status_type: '货物态', status_category: '目的地自提' },
  { status_id: 6102, status_code: 'self_pickup_ready', status_name: '自提待取', status_type: '货物态', status_category: '目的地自提' },
  { status_id: 6201, status_code: 'delivered_signed', status_name: '签收完成', status_type: '货物态', status_category: '目的地签收' },
  { status_id: 6202, status_code: 'delivered_signed_by_proxy', status_name: '签收(代收)', status_type: '货物态', status_category: '目的地签收' },
  { status_id: 6203, status_code: 'delivered_self_pickup', status_name: '签收(自提)', status_type: '货物态', status_category: '目的地签收' },
  { status_id: 6301, status_code: 'return_in_progress', status_name: '退件中', status_type: '货物态', status_category: '目的地退件' },
  { status_id: 6302, status_code: 'returned_to_warehouse', status_name: '退回仓库', status_type: '货物态', status_category: '目的地退件' },
  { status_id: 6303, status_code: 'returned_to_sender', status_name: '退回发件人', status_type: '货物态', status_category: '目的地退件' },
  { status_id: 6304, status_code: 'return_completed', status_name: '退件完成', status_type: '货物态', status_category: '目的地退件' },
  { status_id: 9101, status_code: 'cargo_exception', status_name: '货物异常', status_type: '货物态', status_category: '货物异常' },
  { status_id: 9102, status_code: 'cargo_damaged', status_name: '货物破损', status_type: '货物态', status_category: '货物异常' },
  { status_id: 9103, status_code: 'cargo_lost', status_name: '货物丢失', status_type: '货物态', status_category: '货物异常' },
  { status_id: 9201, status_code: 'information_exception', status_name: '信息异常', status_type: '信息态', status_category: '信息异常' },
  { status_id: 9202, status_code: 'recipient_information_error', status_name: '收件信息错误', status_type: '信息态', status_category: '信息异常' },
];

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
        status VARCHAR(64) DEFAULT 'warehoused',
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
    if (!existingCols.has('storage_bin')) {
      await connection.execute(`ALTER TABLE parcels ADD COLUMN storage_bin VARCHAR(64) DEFAULT NULL AFTER shelf_location`);
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

    // 库位管理（按物流商归属）
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS storage_bins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        storage_bin VARCHAR(128) NOT NULL,
        area_zone VARCHAR(32) DEFAULT NULL,
        area_aisle VARCHAR(32) DEFAULT NULL,
        area_section VARCHAR(32) DEFAULT NULL,
        area_tier VARCHAR(32) DEFAULT NULL,
        area_slot VARCHAR(32) DEFAULT NULL,
        size_length DECIMAL(10, 2) DEFAULT NULL,
        size_width DECIMAL(10, 2) DEFAULT NULL,
        size_height DECIMAL(10, 2) DEFAULT NULL,
        volume DECIMAL(12, 2) DEFAULT NULL,
        capacity DECIMAL(12, 2) DEFAULT NULL,
        warehouse VARCHAR(128) NOT NULL,
        description VARCHAR(255) DEFAULT NULL,
        is_enabled TINYINT(1) NOT NULL DEFAULT 1,
        logistics_provider_id INT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_storage_bin (warehouse, storage_bin, logistics_provider_id),
        INDEX idx_storage_bin_provider (logistics_provider_id),
        INDEX idx_storage_bin_warehouse (warehouse)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 单号库 - 号段库（按物流商归属）
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS number_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        number_category VARCHAR(128) NOT NULL,
        description VARCHAR(255) DEFAULT NULL,
        is_enabled TINYINT(1) NOT NULL DEFAULT 1,
        logistics_provider_id INT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_number_category (number_category, logistics_provider_id),
        INDEX idx_number_category_provider (logistics_provider_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 单号库 - 单号（关联号段库）
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS tracking_numbers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        number VARCHAR(128) NOT NULL,
        category_id INT NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'unused',
        used_at DATETIME DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_tracking_number (number),
        INDEX idx_tracking_category (category_id),
        INDEX idx_tracking_status (status),
        CONSTRAINT fk_tracking_category FOREIGN KEY (category_id) REFERENCES number_categories(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 系统设置 - 标签管理（HTML 模板，按物流商归属）
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS label_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        label_name VARCHAR(128) NOT NULL,
        template_html MEDIUMTEXT NOT NULL,
        description VARCHAR(255) DEFAULT NULL,
        is_enabled TINYINT(1) NOT NULL DEFAULT 1,
        logistics_provider_id INT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_label_name (label_name, logistics_provider_id),
        INDEX idx_label_provider (logistics_provider_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 地址簿（按物流商归属，可选关联会员）
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS address_book (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        region VARCHAR(16) NOT NULL,
        province VARCHAR(64) DEFAULT NULL,
        city VARCHAR(64) DEFAULT NULL,
        district VARCHAR(64) DEFAULT NULL,
        street VARCHAR(64) DEFAULT NULL,
        phone VARCHAR(32) NOT NULL,
        address VARCHAR(255) NOT NULL,
        user_id INT DEFAULT NULL,
        logistics_provider_id INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_address_book_provider (logistics_provider_id),
        INDEX idx_address_book_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Migration: ensure address_book 省/市/区县/街道 列存在（老库补齐）
    const [addressBookCols] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'address_book'`
    );
    const existingAddressBookCols = new Set((addressBookCols as any[]).map((r: any) => r.COLUMN_NAME));
    if (!existingAddressBookCols.has('province')) {
      await connection.execute(`ALTER TABLE address_book ADD COLUMN province VARCHAR(64) DEFAULT NULL AFTER region`);
    }
    if (!existingAddressBookCols.has('city')) {
      await connection.execute(`ALTER TABLE address_book ADD COLUMN city VARCHAR(64) DEFAULT NULL AFTER province`);
    }
    if (!existingAddressBookCols.has('district')) {
      await connection.execute(`ALTER TABLE address_book ADD COLUMN district VARCHAR(64) DEFAULT NULL AFTER city`);
    }
    if (!existingAddressBookCols.has('street')) {
      await connection.execute(`ALTER TABLE address_book ADD COLUMN street VARCHAR(64) DEFAULT NULL AFTER district`);
    }

    // 航线运输管理 - 航线（按物流商归属）
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS shipping_routes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        route_name VARCHAR(128) NOT NULL,
        route_code VARCHAR(64) DEFAULT NULL,
        carrier_type VARCHAR(16) NOT NULL DEFAULT '海运',
        carrier_tool_name VARCHAR(128) DEFAULT NULL,
        carrier VARCHAR(128) DEFAULT NULL,
        departure_port VARCHAR(255) DEFAULT NULL,
        destination_port VARCHAR(255) DEFAULT NULL,
        description VARCHAR(255) DEFAULT NULL,
        is_enabled TINYINT(1) NOT NULL DEFAULT 1,
        logistics_provider_id INT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_shipping_route_name (route_name, logistics_provider_id),
        INDEX idx_shipping_route_provider (logistics_provider_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 航线运输管理 - 集装箱（按物流商归属）
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS shipping_containers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        container_no VARCHAR(64) NOT NULL,
        container_type VARCHAR(64) NOT NULL,
        description VARCHAR(255) DEFAULT NULL,
        is_enabled TINYINT(1) NOT NULL DEFAULT 1,
        logistics_provider_id INT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_shipping_container_no (container_no, logistics_provider_id),
        INDEX idx_shipping_container_provider (logistics_provider_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 航线运输管理 - 班(航)次（关联航线，按物流商归属）
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS shipping_voyages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        voyage_name VARCHAR(128) NOT NULL,
        voyage_no VARCHAR(64) DEFAULT NULL,
        etd DATETIME DEFAULT NULL,
        eta DATETIME DEFAULT NULL,
        atd DATETIME DEFAULT NULL,
        ata DATETIME DEFAULT NULL,
        si_cutoff DATETIME DEFAULT NULL,
        cargo_cutoff DATETIME DEFAULT NULL,
        vgm_cutoff DATETIME DEFAULT NULL,
        departure_port VARCHAR(128) DEFAULT NULL,
        destination_port VARCHAR(128) DEFAULT NULL,
        route_id INT DEFAULT NULL,
        description VARCHAR(255) DEFAULT NULL,
        is_enabled TINYINT(1) NOT NULL DEFAULT 1,
        logistics_provider_id INT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_shipping_voyage_name (voyage_name, logistics_provider_id),
        INDEX idx_shipping_voyage_provider (logistics_provider_id),
        INDEX idx_shipping_voyage_route (route_id),
        CONSTRAINT fk_shipping_voyage_route FOREIGN KEY (route_id) REFERENCES shipping_routes(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 航线运输管理 - 提(运)单（关联班次，按物流商归属）
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS shipping_bills (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bl_no VARCHAR(64) DEFAULT NULL,
        shipper VARCHAR(255) NOT NULL,
        consignee VARCHAR(255) NOT NULL,
        notify_party VARCHAR(255) NOT NULL,
        delivery_place VARCHAR(128) DEFAULT NULL,
        departure_port VARCHAR(128) DEFAULT NULL,
        destination_port VARCHAR(128) DEFAULT NULL,
        container_no VARCHAR(64) DEFAULT NULL,
        seal_no VARCHAR(64) DEFAULT NULL,
        package_count INT DEFAULT NULL,
        weight DECIMAL(12, 3) DEFAULT NULL,
        volume DECIMAL(12, 3) DEFAULT NULL,
        marks VARCHAR(255) DEFAULT NULL,
        voyage_id INT DEFAULT NULL,
        cargo_status VARCHAR(64) DEFAULT NULL,
        description VARCHAR(255) DEFAULT NULL,
        logistics_provider_id INT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_shipping_bill_provider (logistics_provider_id),
        INDEX idx_shipping_bill_voyage (voyage_id),
        CONSTRAINT fk_shipping_bill_voyage FOREIGN KEY (voyage_id) REFERENCES shipping_voyages(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 航线运输管理 - 为已存在的 shipping_routes 补充起运港/目的港列（多个港口以 / 分隔）
    const [shipRouteCols] = await connection.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipping_routes'`
    );
    const existingShipRouteCols = new Set((shipRouteCols as any[]).map((r: any) => r.COLUMN_NAME));
    if (!existingShipRouteCols.has('departure_port')) {
      await connection.execute(`ALTER TABLE shipping_routes ADD COLUMN departure_port VARCHAR(255) DEFAULT NULL AFTER carrier`);
    }
    if (!existingShipRouteCols.has('destination_port')) {
      await connection.execute(`ALTER TABLE shipping_routes ADD COLUMN destination_port VARCHAR(255) DEFAULT NULL AFTER departure_port`);
    }

    // 迁移：shipping_bills 删除已废弃字段 bill_no / consignor（幂等）
    const [shipBillCols] = await connection.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipping_bills'`
    );
    const existingShipBillCols = new Set((shipBillCols as any[]).map((r: any) => r.COLUMN_NAME));
    if (existingShipBillCols.has('bill_no')) {
      await connection.execute(`ALTER TABLE shipping_bills DROP COLUMN bill_no`);
    }
    if (existingShipBillCols.has('consignor')) {
      await connection.execute(`ALTER TABLE shipping_bills DROP COLUMN consignor`);
    }
    const [shipBillIdxRows] = await connection.execute(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipping_bills' AND INDEX_NAME = 'uk_shipping_bill_no'`
    );
    if ((shipBillIdxRows as any[]).length > 0) {
      await connection.execute(`ALTER TABLE shipping_bills DROP INDEX uk_shipping_bill_no`);
    }

    // 系统设置 - 包裹状态字典（平台维护）
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS parcel_statuses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        status_id INT NOT NULL,
        status_code VARCHAR(64) NOT NULL,
        status_name VARCHAR(64) NOT NULL,
        status_type VARCHAR(16) NOT NULL DEFAULT '货物态',
        status_category VARCHAR(64) DEFAULT NULL,
        is_enabled TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_parcel_status_id (status_id),
        UNIQUE KEY uk_parcel_status_code (status_code),
        INDEX idx_parcel_status_type (status_type),
        INDEX idx_parcel_status_category (status_category)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 首次初始化：按《包裹状态字典》灌入内置数据（仅当表为空时执行，幂等）
    const [parcelStatusCountRows] = await connection.execute<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM parcel_statuses'
    );
    if (Number(parcelStatusCountRows?.[0]?.count || 0) === 0) {
      for (const item of DEFAULT_PARCEL_STATUSES) {
        await connection.execute(
          `INSERT INTO parcel_statuses (status_id, status_code, status_name, status_type, status_category, is_enabled)
           VALUES (?, ?, ?, ?, ?, 1)`,
          [item.status_id, item.status_code, item.status_name, item.status_type, item.status_category]
        );
      }
    }

    // 迁移：将已存在记录的《状态名称》中"清关"改为"通关"（仅更新 status_name，保留 status_category 分类不变）。
    // 幂等：更新后 status_name 中不再包含"清关"，重复执行不会再命中 LIKE 条件。
    await connection.execute(
      `UPDATE parcel_statuses SET status_name = REPLACE(status_name, '清关', '通关') WHERE status_name LIKE '%清关%'`
    );

    // 迁移：将历史遗留的包裹货物态旧值改为《包裹状态字典》中对应的货物态编码。
    // 幂等：新编码不在旧值集合中，重复执行不会再次命中（WHERE ... IN 旧值集合）。
    const LEGACY_STATUS_CASE = `CASE status
        WHEN 'arrived' THEN 'cross_border_arrived'
        WHEN 'received' THEN 'warehoused'
        WHEN 'in_transit' THEN 'cross_border_in_transit'
        WHEN 'exception' THEN 'cargo_exception'
        WHEN 'pending' THEN 'awaiting_warehousing'
        WHEN 'pickup_pending' THEN 'self_pickup_ready'
        WHEN 'delivered' THEN 'delivered_signed'
        ELSE status END`;
    await connection.execute(
      `UPDATE parcels SET status = ${LEGACY_STATUS_CASE}
       WHERE status IN ('arrived','received','in_transit','exception','pending','pickup_pending','delivered')`
    );
    // 状态流转日志中的货物态编码同步迁移，保证历史记录与新字典一致
    await connection.execute(
      `UPDATE parcel_status_logs SET from_status = ${LEGACY_STATUS_CASE.replace(/status/g, 'from_status')}
       WHERE from_status IN ('arrived','received','in_transit','exception','pending','pickup_pending','delivered')`
    );
    await connection.execute(
      `UPDATE parcel_status_logs SET to_status = ${LEGACY_STATUS_CASE.replace(/status/g, 'to_status')}
       WHERE to_status IN ('arrived','received','in_transit','exception','pending','pickup_pending','delivered')`
    );

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

      // 幂等回填：确保内置 admin 角色拥有「系统设置 - 包裹状态字典」权限（平台专属）。
      const PARCEL_STATUS_CODES = [
        PERMISSIONS.PARCEL_STATUS_VIEW,
        PERMISSIONS.PARCEL_STATUS_CREATE,
        PERMISSIONS.PARCEL_STATUS_UPDATE,
        PERMISSIONS.PARCEL_STATUS_DELETE,
      ];
      if (adminRoleId) {
        for (const permissionCode of PARCEL_STATUS_CODES) {
          await connection.execute(
            'INSERT IGNORE INTO admin_role_permissions (role_id, role, permission_code) VALUES (?, ?, ?)',
            [adminRoleId, 'admin', permissionCode]
          );
        }
      }

      // 幂等回填：确保内置 admin 角色拥有「库位管理」权限（新增模块，历史库需补齐）。
      const STORAGE_BIN_CODES = [
        PERMISSIONS.STORAGE_BIN_VIEW,
        PERMISSIONS.STORAGE_BIN_CREATE,
        PERMISSIONS.STORAGE_BIN_UPDATE,
        PERMISSIONS.STORAGE_BIN_DELETE,
      ];
      if (adminRoleId) {
        for (const permissionCode of STORAGE_BIN_CODES) {
          await connection.execute(
            'INSERT IGNORE INTO admin_role_permissions (role_id, role, permission_code) VALUES (?, ?, ?)',
            [adminRoleId, 'admin', permissionCode]
          );
        }
      }

      // 幂等回填：确保内置 admin 角色拥有「单号库」权限（新增模块，历史库需补齐）。
      const NUMBER_LIB_CODES = [
        PERMISSIONS.NUMBER_LIB_VIEW,
        PERMISSIONS.NUMBER_LIB_CREATE,
        PERMISSIONS.NUMBER_LIB_UPDATE,
        PERMISSIONS.NUMBER_LIB_DELETE,
      ];
      if (adminRoleId) {
        for (const permissionCode of NUMBER_LIB_CODES) {
          await connection.execute(
            'INSERT IGNORE INTO admin_role_permissions (role_id, role, permission_code) VALUES (?, ?, ?)',
            [adminRoleId, 'admin', permissionCode]
          );
        }
      }

      // 幂等回填：确保内置 admin 角色拥有「系统设置 - 标签管理」权限（新增模块，历史库需补齐）。
      const LABEL_CODES = [
        PERMISSIONS.LABEL_VIEW,
        PERMISSIONS.LABEL_CREATE,
        PERMISSIONS.LABEL_UPDATE,
        PERMISSIONS.LABEL_DELETE,
      ];
      if (adminRoleId) {
        for (const permissionCode of LABEL_CODES) {
          await connection.execute(
            'INSERT IGNORE INTO admin_role_permissions (role_id, role, permission_code) VALUES (?, ?, ?)',
            [adminRoleId, 'admin', permissionCode]
          );
        }
      }

      // 幂等回填：确保内置 admin 角色拥有「地址簿」权限（新增模块，历史库需补齐）。
      const ADDRESS_BOOK_CODES = [
        PERMISSIONS.ADDRESS_BOOK_VIEW,
        PERMISSIONS.ADDRESS_BOOK_CREATE,
        PERMISSIONS.ADDRESS_BOOK_UPDATE,
        PERMISSIONS.ADDRESS_BOOK_DELETE,
      ];
      if (adminRoleId) {
        for (const permissionCode of ADDRESS_BOOK_CODES) {
          await connection.execute(
            'INSERT IGNORE INTO admin_role_permissions (role_id, role, permission_code) VALUES (?, ?, ?)',
            [adminRoleId, 'admin', permissionCode]
          );
        }
      }

      // 幂等回填：确保内置 admin 角色拥有「航线运输管理」权限（新增模块，历史库需补齐）。
      const ROUTE_TRANSPORT_CODES = [
        PERMISSIONS.ROUTE_TRANSPORT_VIEW,
        PERMISSIONS.ROUTE_TRANSPORT_CREATE,
        PERMISSIONS.ROUTE_TRANSPORT_UPDATE,
        PERMISSIONS.ROUTE_TRANSPORT_DELETE,
      ];
      if (adminRoleId) {
        for (const permissionCode of ROUTE_TRANSPORT_CODES) {
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

const PARCELS_SORT_COLUMNS = new Set(['id', 'user_id', 'tracking_number', 'origin', 'destination', 'weight', 'length_cm', 'width_cm', 'height_cm', 'volume', 'storage_bin', 'status', 'estimated_delivery', 'created_at']);
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
  // 状态快筛：货物态/信息态多选（IN 匹配），来自《包裹状态快筛栏》
  const statusInFilter = extractStatusInFilter(parcelColFilters, 'status__in');
  const subStatusInFilter = extractStatusInFilter(parcelColFilters, 'sub_status__in');

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
  if (statusInFilter.length) {
    allClauses.push(`p.status IN (${statusInFilter.map(() => '?').join(',')})`);
    allParams.push(...statusInFilter);
  }
  if (subStatusInFilter.length) {
    allClauses.push(`p.sub_status IN (${subStatusInFilter.map(() => '?').join(',')})`);
    allParams.push(...subStatusInFilter);
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
            p.weight, p.length_cm, p.width_cm, p.height_cm, p.volume, p.images, p.storage_bin,
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

/**
 * 统计各货物态/信息态下的包裹数量（仅统计未删除包裹），供《包裹状态快筛栏》展示。
 * 只返回实际存在包裹的状态编码，物流商管理员仅统计自身物流商下的包裹。
 */
export const getParcelStatusCounts = async (
  logisticsProviderId?: number | null
): Promise<{
  cargo: Array<{ code: string; count: number }>;
  info: Array<{ code: string; count: number }>;
}> => {
  const clauses = ['p.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (logisticsProviderId !== undefined && logisticsProviderId !== null) {
    clauses.push('p.logistics_provider_id = ?');
    params.push(logisticsProviderId);
  }
  const whereSql = `WHERE ${clauses.join(' AND ')}`;

  const [cargoRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT p.status AS code, COUNT(*) AS count
     FROM parcels p ${whereSql} AND p.status IS NOT NULL AND p.status <> ''
     GROUP BY p.status`,
    params
  );
  const [infoRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT p.sub_status AS code, COUNT(*) AS count
     FROM parcels p ${whereSql} AND p.sub_status IS NOT NULL AND p.sub_status <> ''
     GROUP BY p.sub_status`,
    params
  );

  return {
    cargo: (cargoRows as any[]).map((r) => ({ code: String(r.code), count: Number(r.count) })),
    info: (infoRows as any[]).map((r) => ({ code: String(r.code), count: Number(r.count) })),
  };
};

export const getParcelsForExport = async (
  keyword?: string,
  selectedIds?: number[],
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
  // 状态快筛：货物态/信息态多选（IN 匹配），来自《包裹状态快筛栏》
  const statusInFilter = extractStatusInFilter(parcelColFilters, 'status__in');
  const subStatusInFilter = extractStatusInFilter(parcelColFilters, 'sub_status__in');

  const dateRange = buildCreatedAtFilter(startDate, endDate, 'p.');
  const { clause: deletedClause, cleanedFilters } = buildDeletedFilter(parcelColFilters, 'p.');
  const colFilter = buildColumnFilters(cleanedFilters, dateFilters, PARCELS_SORT_COLUMNS, 'p.');
  const allClauses = [deletedClause, ...dateRange.clauses, ...colFilter.clauses];
  const allParams = [...dateRange.params, ...colFilter.params];

  const trimmedKeyword = keyword?.trim();
  if (trimmedKeyword) {
    const like = `%${trimmedKeyword}%`;
    allClauses.push(`(
      CAST(p.id AS CHAR) LIKE ?
      OR CAST(p.user_id AS CHAR) LIKE ?
      OR p.tracking_number LIKE ?
      OR p.origin LIKE ?
      OR p.destination LIKE ?
      OR p.status LIKE ?
      OR u.username LIKE ?
    )`);
    allParams.push(like, like, like, like, like, like, like);
  }

  if (selectedIds && selectedIds.length > 0) {
    allClauses.push(`p.id IN (${selectedIds.map(() => '?').join(',')})`);
    allParams.push(...selectedIds);
  }

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
  if (statusInFilter.length) {
    allClauses.push(`p.status IN (${statusInFilter.map(() => '?').join(',')})`);
    allParams.push(...statusInFilter);
  }
  if (subStatusInFilter.length) {
    allClauses.push(`p.sub_status IN (${subStatusInFilter.map(() => '?').join(',')})`);
    allParams.push(...subStatusInFilter);
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
  storage_bin?: string;
  logistics_provider_id?: number | null;
  items: { name: string; value: number; quantity: number }[];
}): Promise<number> => {
  const { tracking_number, weight, length_cm, width_cm, height_cm, volume, images, shelf_location, storage_bin, logistics_provider_id, items } = payload;
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
         images = ?, shelf_location = ?, storage_bin = ?, logistics_provider_id = ?, status = 'warehoused', status_updated_at = NOW(),
         deleted_at = NULL, updated_at = NOW()
         WHERE id = ?`,
        [weight, length_cm, width_cm, height_cm, volume, images || null, shelf_location || null, storage_bin || null, logistics_provider_id || null, parcelId]
      );
      // Remove old items, will re-insert below
      await conn.execute('DELETE FROM parcel_items WHERE parcel_id = ?', [parcelId]);
    } else {
      // Insert new parcel
      const [result] = await conn.execute<mysql.ResultSetHeader>(
        `INSERT INTO parcels (tracking_number, weight, length_cm, width_cm, height_cm, volume, images, shelf_location, storage_bin, logistics_provider_id, origin, destination, status, status_updated_at, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', 'warehoused', NOW(), NULL)`,
        [tracking_number, weight, length_cm, width_cm, height_cm, volume, images || null, shelf_location || null, storage_bin || null, logistics_provider_id || null]
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
  storage_bin?: string;
  logistics_provider_id?: number | null;
  items: { name: string; value: number; quantity: number }[];
}): Promise<boolean> => {
  const { weight, length_cm, width_cm, height_cm, volume, origin, destination, status, sub_status, status_remark, images, storage_bin, logistics_provider_id, items } = payload;
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
    if (storage_bin !== undefined) { sets.push('storage_bin = ?'); params.push(storage_bin || null); }
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
  logisticsProviderId?: number | null,
  roleScope?: 'platform' | 'logistics'
) => {
  const orderBy = toSafeOrderBy(sortKey, sortOrder, ADMINS_SORT_COLUMNS, 'created_at');
  const { clause: deletedClause, cleanedFilters } = buildDeletedFilter(columnFilters);
  const { clauses, params } = buildColumnFilters(cleanedFilters, dateFilters, ADMINS_SORT_COLUMNS);
  const allClauses = [deletedClause, ...clauses];
  if (logisticsProviderId !== undefined && logisticsProviderId !== null) {
    allClauses.push('logistics_provider_id = ?');
    params.push(logisticsProviderId);
  }
  if (roleScope === 'platform' || roleScope === 'logistics') {
    allClauses.push('role_scope = ?');
    params.push(roleScope);
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

export const searchAdmins = async (keyword: string, logisticsProviderId?: number | null, roleScope?: 'platform' | 'logistics'): Promise<any[]> => {
  const like = `%${keyword}%`;
  const provClause = (logisticsProviderId !== undefined && logisticsProviderId !== null) ? ' AND logistics_provider_id = ?' : '';
  const provParams: any[] = provClause ? [logisticsProviderId] : [];
  const scopeClause = (roleScope === 'platform' || roleScope === 'logistics') ? ' AND role_scope = ?' : '';
  const scopeParams: any[] = scopeClause ? [roleScope] : [];
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
     )${provClause}${scopeClause}
     ORDER BY created_at DESC`,
    [like, like, like, like, like, like, like, like, ...provParams, ...scopeParams]
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
  const hashed = await bcrypt.hash(payload.password, 10);
  const roleScope = payload.role_scope === 'logistics' ? 'logistics' : 'platform';
  const roleProviderId = roleScope === 'logistics' ? (payload.role_logistics_provider_id || null) : null;
  const adminProviderId = payload.logistics_provider_id || null;

  // username 有唯一约束（不区分软删除），需连同已软删除的记录一起查重。
  const existingAny = await querySingle<{ id: number; deleted_at: string | null }>(
    'SELECT id, deleted_at FROM admin_users WHERE username = ? LIMIT 1',
    [payload.username]
  );
  if (existingAny) {
    // 仍在使用中的同名账号 → 视为重复
    if (existingAny.deleted_at == null) return null;
    // 命中已软删除的同名账号 → 复活并覆盖为新的账号信息，释放被占用的用户名
    await pool.execute(
      `UPDATE admin_users
         SET password = ?, email = ?, role = ?, role_scope = ?, role_logistics_provider_id = ?,
             logistics_provider_id = ?, status = 'active', is_system = 0, last_login = NULL,
             deleted_at = NULL, updated_at = NOW()
       WHERE id = ?`,
      [hashed, payload.email, payload.role || 'admin', roleScope, roleProviderId, adminProviderId, existingAny.id]
    );
    return {
      id: existingAny.id,
      username: payload.username,
      email: payload.email,
      role: payload.role || 'admin',
      role_scope: roleScope,
      role_logistics_provider_id: roleProviderId,
      logistics_provider_id: adminProviderId,
      status: 'active',
    };
  }

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

export const batchUpdateParcelsLogisticsProvider = async (
  ids: number[],
  targetLogisticsProviderId: number | null,
  actorLogisticsProviderId?: number | null
): Promise<number> => {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const provClause = (actorLogisticsProviderId !== undefined && actorLogisticsProviderId !== null) ? ' AND logistics_provider_id = ?' : '';
  const provParams = provClause ? [actorLogisticsProviderId] : [];
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `UPDATE parcels
     SET logistics_provider_id = ?, updated_at = NOW()
     WHERE id IN (${placeholders}) AND deleted_at IS NULL${provClause}`,
    [targetLogisticsProviderId, ...ids, ...provParams]
  );
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

export const getLogisticsProviderNameById = async (id: number | null | undefined): Promise<string | null> => {
  const providerId = Number(id);
  if (!Number.isInteger(providerId) || providerId <= 0) return null;
  const row = await querySingle<{ name: string }>(
    `SELECT name FROM logistics_providers WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [providerId]
  );
  return row?.name ?? null;
};

export const getLogisticsProviderCodeById = async (id: number | null | undefined): Promise<string | null> => {
  const providerId = Number(id);
  if (!Number.isInteger(providerId) || providerId <= 0) return null;
  const row = await querySingle<{ code: string | null }>(
    `SELECT code FROM logistics_providers WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [providerId]
  );
  const code = row?.code ? String(row.code).trim().toUpperCase() : '';
  return code || null;
};

/**
 * 为指定物流商补齐【初始角色】与【初始管理员账号】（幂等，可重复调用）。
 * - 初始角色：name="Admin"，code="admin"，scope="logistics"，is_system=1（不可删除）
 * - 初始管理员账号：username=admin@<物流商代号的小写形式>，初始密码 88888888，is_system=1（不可删除）
 */
export const ensureLogisticsInitialAccess = async (provider: { id: number; code?: string | null; name?: string | null }): Promise<void> => {
  const providerId = Number(provider.id);
  if (!Number.isInteger(providerId) || providerId <= 0) return;

  const normalizedCode = String(provider.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const codeForUser = (normalizedCode || `lp${providerId}`).toLowerCase();

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
    // 旧物流商角色补齐白名单内所有权限（幂等），避免新增权限后历史角色缺失。
    for (const permissionCode of LOGISTICS_ALLOWED_PERMISSIONS) {
      await pool.execute(
        `INSERT IGNORE INTO admin_role_permissions (role_id, role, permission_code) VALUES (?, ?, ?)`,
        [roleId, 'admin', permissionCode]
      );
    }
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

// ============ 库位管理 ============
const STORAGE_BIN_SORT_COLUMNS = new Set([
  'id', 'storage_bin', 'area_zone', 'area_aisle', 'area_section', 'area_tier', 'area_slot',
  'size_length', 'size_width', 'size_height', 'volume', 'capacity', 'warehouse',
  'is_enabled', 'logistics_provider_id', 'created_at', 'updated_at',
]);

export interface StorageBinPayload {
  storage_bin: string;
  area_zone?: string | null;
  area_aisle?: string | null;
  area_section?: string | null;
  area_tier?: string | null;
  area_slot?: string | null;
  size_length?: number | null;
  size_width?: number | null;
  size_height?: number | null;
  volume?: number | null;
  capacity?: number | null;
  warehouse: string;
  description?: string | null;
  is_enabled?: boolean;
  logistics_provider_id?: number | null;
}

export const getStorageBinsPaged = async (
  page: number,
  limit: number,
  sortKey?: string,
  sortOrder?: string,
  columnFilters?: Record<string, string>,
  dateFilters?: Record<string, [string, string]>,
  providerFilter?: number | null
) => {
  const orderBy = `sb.${toSafeOrderBy(sortKey, sortOrder, STORAGE_BIN_SORT_COLUMNS, 'created_at')}`;
  const { clauses, params } = buildColumnFilters(columnFilters, dateFilters, STORAGE_BIN_SORT_COLUMNS, 'sb.');
  const allClauses = ['1=1', ...clauses];
  if (providerFilter !== null && providerFilter !== undefined) {
    allClauses.push('sb.logistics_provider_id = ?');
    params.push(providerFilter);
  }
  const whereSql = `WHERE ${allClauses.join(' AND ')}`;

  const safePage = toSafeInt(page, 1, 1, Number.MAX_SAFE_INTEGER);
  const safeLimit = toSafeInt(limit, 10, 1, 500);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT sb.id, sb.storage_bin, sb.area_zone, sb.area_aisle, sb.area_section, sb.area_tier, sb.area_slot,
            sb.size_length, sb.size_width, sb.size_height, sb.volume, sb.capacity, sb.warehouse, sb.description,
            sb.is_enabled, sb.logistics_provider_id, sb.created_at, sb.updated_at, lp.name AS logistics_provider_name
     FROM storage_bins sb
     LEFT JOIN logistics_providers lp ON sb.logistics_provider_id = lp.id
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT ${safeLimit} OFFSET ${offset}`,
    params
  );

  const [countRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) as count FROM storage_bins sb ${whereSql}`,
    params
  );

  const total = Number(countRows?.[0]?.count || 0);
  return {
    data: rows as any[],
    total,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
  };
};

export const searchStorageBins = async (keyword: string, providerFilter?: number | null): Promise<any[]> => {
  const like = `%${keyword}%`;
  const clauses = [`(
       CAST(sb.id AS CHAR) LIKE ?
       OR sb.storage_bin LIKE ?
       OR sb.warehouse LIKE ?
       OR sb.area_zone LIKE ?
       OR sb.area_aisle LIKE ?
       OR sb.area_section LIKE ?
       OR sb.description LIKE ?
     )`];
  const params: any[] = [like, like, like, like, like, like, like];
  if (providerFilter !== null && providerFilter !== undefined) {
    clauses.push('sb.logistics_provider_id = ?');
    params.push(providerFilter);
  }
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT sb.id, sb.storage_bin, sb.area_zone, sb.area_aisle, sb.area_section, sb.area_tier, sb.area_slot,
            sb.size_length, sb.size_width, sb.size_height, sb.volume, sb.capacity, sb.warehouse, sb.description,
            sb.is_enabled, sb.logistics_provider_id, sb.created_at, sb.updated_at, lp.name AS logistics_provider_name
     FROM storage_bins sb
     LEFT JOIN logistics_providers lp ON sb.logistics_provider_id = lp.id
     WHERE ${clauses.join(' AND ')}
     ORDER BY sb.created_at DESC`,
    params
  );
  return rows as any[];
};

export const findDuplicateStorageBin = async (
  warehouse: string,
  storageBin: string,
  logisticsProviderId: number | null,
  excludeId?: number
): Promise<boolean> => {
  const params: any[] = [warehouse, storageBin];
  let providerClause: string;
  if (logisticsProviderId === null) {
    providerClause = 'logistics_provider_id IS NULL';
  } else {
    providerClause = 'logistics_provider_id = ?';
    params.push(logisticsProviderId);
  }
  let excludeClause = '';
  if (excludeId !== undefined) {
    excludeClause = ' AND id <> ?';
    params.push(excludeId);
  }
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id FROM storage_bins WHERE warehouse = ? AND storage_bin = ? AND ${providerClause}${excludeClause} LIMIT 1`,
    params
  );
  return rows.length > 0;
};

export const createStorageBin = async (payload: StorageBinPayload) => {
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `INSERT INTO storage_bins
      (storage_bin, area_zone, area_aisle, area_section, area_tier, area_slot,
       size_length, size_width, size_height, volume, capacity, warehouse, description, is_enabled, logistics_provider_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.storage_bin,
      payload.area_zone || null,
      payload.area_aisle || null,
      payload.area_section || null,
      payload.area_tier || null,
      payload.area_slot || null,
      payload.size_length ?? null,
      payload.size_width ?? null,
      payload.size_height ?? null,
      payload.volume ?? null,
      payload.capacity ?? null,
      payload.warehouse,
      payload.description || null,
      payload.is_enabled === false ? 0 : 1,
      payload.logistics_provider_id ?? null,
    ]
  );
  return { id: result.insertId, ...payload };
};

export const getStorageBinById = async (id: number): Promise<any | null> => {
  return querySingle<any>(
    `SELECT id, storage_bin, warehouse, logistics_provider_id FROM storage_bins WHERE id = ? LIMIT 1`,
    [id]
  );
};

export const updateStorageBin = async (id: number, payload: Partial<StorageBinPayload>): Promise<boolean> => {
  const sets: string[] = ['updated_at = NOW()'];
  const params: any[] = [];
  if (payload.storage_bin !== undefined) { sets.push('storage_bin = ?'); params.push(payload.storage_bin); }
  if (payload.area_zone !== undefined) { sets.push('area_zone = ?'); params.push(payload.area_zone || null); }
  if (payload.area_aisle !== undefined) { sets.push('area_aisle = ?'); params.push(payload.area_aisle || null); }
  if (payload.area_section !== undefined) { sets.push('area_section = ?'); params.push(payload.area_section || null); }
  if (payload.area_tier !== undefined) { sets.push('area_tier = ?'); params.push(payload.area_tier || null); }
  if (payload.area_slot !== undefined) { sets.push('area_slot = ?'); params.push(payload.area_slot || null); }
  if (payload.size_length !== undefined) { sets.push('size_length = ?'); params.push(payload.size_length ?? null); }
  if (payload.size_width !== undefined) { sets.push('size_width = ?'); params.push(payload.size_width ?? null); }
  if (payload.size_height !== undefined) { sets.push('size_height = ?'); params.push(payload.size_height ?? null); }
  if (payload.volume !== undefined) { sets.push('volume = ?'); params.push(payload.volume ?? null); }
  if (payload.capacity !== undefined) { sets.push('capacity = ?'); params.push(payload.capacity ?? null); }
  if (payload.warehouse !== undefined) { sets.push('warehouse = ?'); params.push(payload.warehouse); }
  if (payload.description !== undefined) { sets.push('description = ?'); params.push(payload.description || null); }
  if (payload.is_enabled !== undefined) { sets.push('is_enabled = ?'); params.push(payload.is_enabled ? 1 : 0); }
  if (payload.logistics_provider_id !== undefined) { sets.push('logistics_provider_id = ?'); params.push(payload.logistics_provider_id ?? null); }
  params.push(id);
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `UPDATE storage_bins SET ${sets.join(', ')} WHERE id = ?`,
    params
  );
  return result.affectedRows > 0;
};

export const deleteStorageBin = async (id: number): Promise<boolean> => {
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    'DELETE FROM storage_bins WHERE id = ?',
    [id]
  );
  return result.affectedRows > 0;
};

export const batchDeleteStorageBins = async (ids: number[]): Promise<number> => {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `DELETE FROM storage_bins WHERE id IN (${placeholders})`,
    ids
  );
  return result.affectedRows;
};

// ============ 单号库 - 号段库 + 单号（按物流商归属） ============

const NUMBER_CATEGORY_SORT_COLUMNS = new Set([
  'id', 'number_category', 'is_enabled', 'logistics_provider_id', 'created_at', 'updated_at',
]);

// 近期使用窗口（天），用于预计用尽天数的日均消耗估算
const NUMBER_USAGE_WINDOW_DAYS = 7;

export interface NumberCategoryPayload {
  number_category: string;
  description?: string | null;
  is_enabled?: boolean;
  logistics_provider_id?: number | null;
}

// 附加「库存数量（未使用单号数）」与「预计用尽天数」两个计算字段
const NUMBER_CATEGORY_COMPUTED = `
  (SELECT COUNT(*) FROM tracking_numbers tn WHERE tn.category_id = c.id AND tn.status = 'unused') AS unused_count,
  (SELECT COUNT(*) FROM tracking_numbers tn WHERE tn.category_id = c.id AND tn.status = 'used'
     AND tn.used_at >= (NOW() - INTERVAL ${NUMBER_USAGE_WINDOW_DAYS} DAY)) AS used_recent`;

// 由未使用数量与近期使用速率推算预计用尽天数（无近期消耗则返回 null）
const withDepletionDays = (rows: any[]): any[] =>
  rows.map((r) => {
    const unused = Number(r.unused_count || 0);
    const recent = Number(r.used_recent || 0);
    let estimated_depletion_days: number | null = null;
    if (recent > 0) {
      const dailyRate = recent / NUMBER_USAGE_WINDOW_DAYS;
      estimated_depletion_days = dailyRate > 0 ? Math.round(unused / dailyRate) : null;
    }
    const { used_recent, ...rest } = r;
    return { ...rest, unused_count: unused, estimated_depletion_days };
  });

export const getNumberCategoriesPaged = async (
  page: number,
  limit: number,
  sortKey?: string,
  sortOrder?: string,
  columnFilters?: Record<string, string>,
  dateFilters?: Record<string, [string, string]>,
  providerFilter?: number | null
) => {
  const orderBy = `c.${toSafeOrderBy(sortKey, sortOrder, NUMBER_CATEGORY_SORT_COLUMNS, 'created_at')}`;
  const { clauses, params } = buildColumnFilters(columnFilters, dateFilters, NUMBER_CATEGORY_SORT_COLUMNS, 'c.');
  const allClauses = ['1=1', ...clauses];
  if (providerFilter !== null && providerFilter !== undefined) {
    allClauses.push('c.logistics_provider_id = ?');
    params.push(providerFilter);
  }
  const whereSql = `WHERE ${allClauses.join(' AND ')}`;

  const safePage = toSafeInt(page, 1, 1, Number.MAX_SAFE_INTEGER);
  const safeLimit = toSafeInt(limit, 10, 1, 500);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT c.id, c.number_category, c.description, c.is_enabled, c.logistics_provider_id,
            c.created_at, c.updated_at, lp.name AS logistics_provider_name,
            ${NUMBER_CATEGORY_COMPUTED}
     FROM number_categories c
     LEFT JOIN logistics_providers lp ON c.logistics_provider_id = lp.id
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT ${safeLimit} OFFSET ${offset}`,
    params
  );

  const [countRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) as count FROM number_categories c ${whereSql}`,
    params
  );

  const total = Number(countRows?.[0]?.count || 0);
  return {
    data: withDepletionDays(rows as any[]),
    total,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
  };
};

export const searchNumberCategories = async (keyword: string, providerFilter?: number | null): Promise<any[]> => {
  const like = `%${keyword}%`;
  const clauses = [`(
       CAST(c.id AS CHAR) LIKE ?
       OR c.number_category LIKE ?
       OR c.description LIKE ?
     )`];
  const params: any[] = [like, like, like];
  if (providerFilter !== null && providerFilter !== undefined) {
    clauses.push('c.logistics_provider_id = ?');
    params.push(providerFilter);
  }
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT c.id, c.number_category, c.description, c.is_enabled, c.logistics_provider_id,
            c.created_at, c.updated_at, lp.name AS logistics_provider_name,
            ${NUMBER_CATEGORY_COMPUTED}
     FROM number_categories c
     LEFT JOIN logistics_providers lp ON c.logistics_provider_id = lp.id
     WHERE ${clauses.join(' AND ')}
     ORDER BY c.created_at DESC`,
    params
  );
  return withDepletionDays(rows as any[]);
};

export const findDuplicateNumberCategory = async (
  numberCategory: string,
  logisticsProviderId: number | null,
  excludeId?: number
): Promise<boolean> => {
  const params: any[] = [numberCategory];
  let providerClause: string;
  if (logisticsProviderId === null) {
    providerClause = 'logistics_provider_id IS NULL';
  } else {
    providerClause = 'logistics_provider_id = ?';
    params.push(logisticsProviderId);
  }
  let excludeClause = '';
  if (excludeId !== undefined) {
    excludeClause = ' AND id <> ?';
    params.push(excludeId);
  }
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id FROM number_categories WHERE number_category = ? AND ${providerClause}${excludeClause} LIMIT 1`,
    params
  );
  return rows.length > 0;
};

export const createNumberCategory = async (payload: NumberCategoryPayload) => {
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `INSERT INTO number_categories (number_category, description, is_enabled, logistics_provider_id)
     VALUES (?, ?, ?, ?)`,
    [
      payload.number_category,
      payload.description || null,
      payload.is_enabled === false ? 0 : 1,
      payload.logistics_provider_id ?? null,
    ]
  );
  return { id: result.insertId, ...payload };
};

export const getNumberCategoryById = async (id: number): Promise<any | null> => {
  return querySingle<any>(
    `SELECT id, number_category, logistics_provider_id FROM number_categories WHERE id = ? LIMIT 1`,
    [id]
  );
};

export const updateNumberCategory = async (id: number, payload: Partial<NumberCategoryPayload>): Promise<boolean> => {
  const sets: string[] = ['updated_at = NOW()'];
  const params: any[] = [];
  if (payload.number_category !== undefined) { sets.push('number_category = ?'); params.push(payload.number_category); }
  if (payload.description !== undefined) { sets.push('description = ?'); params.push(payload.description || null); }
  if (payload.is_enabled !== undefined) { sets.push('is_enabled = ?'); params.push(payload.is_enabled ? 1 : 0); }
  if (payload.logistics_provider_id !== undefined) { sets.push('logistics_provider_id = ?'); params.push(payload.logistics_provider_id ?? null); }
  params.push(id);
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `UPDATE number_categories SET ${sets.join(', ')} WHERE id = ?`,
    params
  );
  return result.affectedRows > 0;
};

export const deleteNumberCategory = async (id: number): Promise<boolean> => {
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    'DELETE FROM number_categories WHERE id = ?',
    [id]
  );
  return result.affectedRows > 0;
};

export const batchDeleteNumberCategories = async (ids: number[]): Promise<number> => {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `DELETE FROM number_categories WHERE id IN (${placeholders})`,
    ids
  );
  return result.affectedRows;
};

// ---------- 单号（tracking_numbers） ----------

const TRACKING_NUMBER_SORT_COLUMNS = new Set(['id', 'number', 'status', 'used_at', 'created_at']);

export const getTrackingNumbersPaged = async (
  categoryId: number,
  page: number,
  limit: number,
  sortKey?: string,
  sortOrder?: string,
  columnFilters?: Record<string, string>,
  dateFilters?: Record<string, [string, string]>
) => {
  const orderBy = `tn.${toSafeOrderBy(sortKey, sortOrder, TRACKING_NUMBER_SORT_COLUMNS, 'created_at')}`;
  const { clauses, params } = buildColumnFilters(columnFilters, dateFilters, TRACKING_NUMBER_SORT_COLUMNS, 'tn.');
  const allClauses = ['tn.category_id = ?', ...clauses];
  const baseParams = [categoryId, ...params];
  const whereSql = `WHERE ${allClauses.join(' AND ')}`;

  const safePage = toSafeInt(page, 1, 1, Number.MAX_SAFE_INTEGER);
  const safeLimit = toSafeInt(limit, 10, 1, 500);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT tn.id, tn.number, tn.status, tn.used_at, tn.created_at
     FROM tracking_numbers tn
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT ${safeLimit} OFFSET ${offset}`,
    baseParams
  );

  const [countRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) as count FROM tracking_numbers tn ${whereSql}`,
    baseParams
  );

  const total = Number(countRows?.[0]?.count || 0);
  return {
    data: rows as any[],
    total,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
  };
};

// 批量导入单号：去重（同批 + 库内已存在）后插入，返回新增数与跳过数
export const addTrackingNumbers = async (categoryId: number, numbers: string[]): Promise<{ inserted: number; skipped: number }> => {
  const unique = Array.from(new Set(numbers.map((n) => String(n || '').trim()).filter((n) => n !== '')));
  if (unique.length === 0) return { inserted: 0, skipped: 0 };
  const values = unique.map(() => '(?, ?, \'unused\')').join(', ');
  const params: any[] = [];
  for (const n of unique) {
    params.push(n, categoryId);
  }
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `INSERT IGNORE INTO tracking_numbers (number, category_id, status) VALUES ${values}`,
    params
  );
  const inserted = result.affectedRows;
  return { inserted, skipped: unique.length - inserted };
};

export const getTrackingNumberById = async (id: number): Promise<any | null> => {
  return querySingle<any>(
    `SELECT tn.id, tn.number, tn.status, tn.category_id, c.logistics_provider_id
     FROM tracking_numbers tn
     JOIN number_categories c ON tn.category_id = c.id
     WHERE tn.id = ? LIMIT 1`,
    [id]
  );
};

export const deleteTrackingNumber = async (id: number): Promise<boolean> => {
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    'DELETE FROM tracking_numbers WHERE id = ?',
    [id]
  );
  return result.affectedRows > 0;
};

export const batchDeleteTrackingNumbers = async (categoryId: number, ids: number[]): Promise<number> => {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `DELETE FROM tracking_numbers WHERE category_id = ? AND id IN (${placeholders})`,
    [categoryId, ...ids]
  );
  return result.affectedRows;
};

// ============ 地址簿（按物流商归属，可选关联会员） ============

const ADDRESS_BOOK_SORT_COLUMNS = new Set([
  'id', 'name', 'region', 'province', 'city', 'district', 'street', 'phone', 'address', 'user_id', 'logistics_provider_id', 'created_at', 'updated_at',
]);

export interface AddressBookPayload {
  name: string;
  region: string;
  province?: string | null;
  city?: string | null;
  district?: string | null;
  street?: string | null;
  phone: string;
  address: string;
  user_id?: number | null;
  logistics_provider_id?: number | null;
}

export const getAddressBookPaged = async (
  page: number,
  limit: number,
  sortKey?: string,
  sortOrder?: string,
  columnFilters?: Record<string, string>,
  dateFilters?: Record<string, [string, string]>,
  providerFilter?: number | null
) => {
  const orderBy = `ab.${toSafeOrderBy(sortKey, sortOrder, ADDRESS_BOOK_SORT_COLUMNS, 'created_at')}`;
  const { clauses, params } = buildColumnFilters(columnFilters, dateFilters, ADDRESS_BOOK_SORT_COLUMNS, 'ab.');
  const allClauses = ['1=1', ...clauses];
  if (providerFilter !== null && providerFilter !== undefined) {
    allClauses.push('ab.logistics_provider_id = ?');
    params.push(providerFilter);
  }
  const whereSql = `WHERE ${allClauses.join(' AND ')}`;

  const safePage = toSafeInt(page, 1, 1, Number.MAX_SAFE_INTEGER);
  const safeLimit = toSafeInt(limit, 10, 1, 500);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT ab.id, ab.name, ab.region, ab.province, ab.city, ab.district, ab.street, ab.phone, ab.address, ab.user_id, ab.logistics_provider_id,
            ab.created_at, ab.updated_at, lp.name AS logistics_provider_name,
            u.username AS member_username, u.real_name AS member_real_name
     FROM address_book ab
     LEFT JOIN logistics_providers lp ON ab.logistics_provider_id = lp.id
     LEFT JOIN users u ON ab.user_id = u.id
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT ${safeLimit} OFFSET ${offset}`,
    params
  );

  const [countRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) as count FROM address_book ab ${whereSql}`,
    params
  );

  const total = Number(countRows?.[0]?.count || 0);
  return {
    data: rows as any[],
    total,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
  };
};

export const searchAddressBook = async (keyword: string, providerFilter?: number | null): Promise<any[]> => {
  const like = `%${keyword}%`;
  const clauses = [`(
       CAST(ab.id AS CHAR) LIKE ?
       OR ab.name LIKE ?
       OR ab.phone LIKE ?
       OR ab.address LIKE ?
       OR ab.province LIKE ?
       OR ab.city LIKE ?
       OR ab.district LIKE ?
        OR ab.street LIKE ?
       OR u.username LIKE ?
       OR u.real_name LIKE ?
     )`];
      const params: any[] = [like, like, like, like, like, like, like, like, like, like];
  if (providerFilter !== null && providerFilter !== undefined) {
    clauses.push('ab.logistics_provider_id = ?');
    params.push(providerFilter);
  }
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT ab.id, ab.name, ab.region, ab.province, ab.city, ab.district, ab.street, ab.phone, ab.address, ab.user_id, ab.logistics_provider_id,
            ab.created_at, ab.updated_at, lp.name AS logistics_provider_name,
            u.username AS member_username, u.real_name AS member_real_name
     FROM address_book ab
     LEFT JOIN logistics_providers lp ON ab.logistics_provider_id = lp.id
     LEFT JOIN users u ON ab.user_id = u.id
     WHERE ${clauses.join(' AND ')}
     ORDER BY ab.created_at DESC`,
    params
  );
  return rows as any[];
};

export const createAddressBook = async (payload: AddressBookPayload) => {
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `INSERT INTO address_book (name, region, province, city, district, street, phone, address, user_id, logistics_provider_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.name,
      payload.region,
      payload.province ?? null,
      payload.city ?? null,
      payload.district ?? null,
      payload.street ?? null,
      payload.phone,
      payload.address,
      payload.user_id ?? null,
      payload.logistics_provider_id ?? null,
    ]
  );
  return { id: result.insertId, ...payload };
};

export const getAddressBookById = async (id: number): Promise<any | null> => {
  return querySingle<any>(
    `SELECT id, name, region, province, city, district, street, phone, address, user_id, logistics_provider_id FROM address_book WHERE id = ? LIMIT 1`,
    [id]
  );
};

export const updateAddressBook = async (id: number, payload: Partial<AddressBookPayload>): Promise<boolean> => {
  const sets: string[] = ['updated_at = NOW()'];
  const params: any[] = [];
  if (payload.name !== undefined) { sets.push('name = ?'); params.push(payload.name); }
  if (payload.region !== undefined) { sets.push('region = ?'); params.push(payload.region); }
  if (payload.province !== undefined) { sets.push('province = ?'); params.push(payload.province ?? null); }
  if (payload.city !== undefined) { sets.push('city = ?'); params.push(payload.city ?? null); }
  if (payload.district !== undefined) { sets.push('district = ?'); params.push(payload.district ?? null); }
  if (payload.street !== undefined) { sets.push('street = ?'); params.push(payload.street ?? null); }
  if (payload.phone !== undefined) { sets.push('phone = ?'); params.push(payload.phone); }
  if (payload.address !== undefined) { sets.push('address = ?'); params.push(payload.address); }
  if (payload.user_id !== undefined) { sets.push('user_id = ?'); params.push(payload.user_id ?? null); }
  if (payload.logistics_provider_id !== undefined) { sets.push('logistics_provider_id = ?'); params.push(payload.logistics_provider_id ?? null); }
  params.push(id);
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `UPDATE address_book SET ${sets.join(', ')} WHERE id = ?`,
    params
  );
  return result.affectedRows > 0;
};

export const deleteAddressBook = async (id: number): Promise<boolean> => {
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    'DELETE FROM address_book WHERE id = ?',
    [id]
  );
  return result.affectedRows > 0;
};

export const batchDeleteAddressBook = async (ids: number[]): Promise<number> => {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `DELETE FROM address_book WHERE id IN (${placeholders})`,
    ids
  );
  return result.affectedRows;
};

// ============ 航线运输管理 - 航线 shipping_routes（按物流商归属） ============

export const SHIPPING_CARRIER_TYPES = ['海运', '空运', '陆运', '铁路', '水运', '其它'];

const SHIPPING_ROUTE_SORT_COLUMNS = new Set([
  'id', 'route_name', 'route_code', 'carrier_type', 'carrier_tool_name', 'carrier', 'departure_port', 'destination_port', 'is_enabled', 'logistics_provider_id', 'created_at', 'updated_at',
]);

export interface ShippingRoutePayload {
  route_name: string;
  route_code?: string | null;
  carrier_type: string;
  carrier_tool_name?: string | null;
  carrier?: string | null;
  departure_port?: string | null;
  destination_port?: string | null;
  description?: string | null;
  is_enabled?: boolean;
  logistics_provider_id?: number | null;
}

export const getShippingRoutesPaged = async (
  page: number,
  limit: number,
  sortKey?: string,
  sortOrder?: string,
  columnFilters?: Record<string, string>,
  dateFilters?: Record<string, [string, string]>,
  providerFilter?: number | null
) => {
  const orderBy = `r.${toSafeOrderBy(sortKey, sortOrder, SHIPPING_ROUTE_SORT_COLUMNS, 'created_at')}`;
  const { clauses, params } = buildColumnFilters(columnFilters, dateFilters, SHIPPING_ROUTE_SORT_COLUMNS, 'r.');
  const allClauses = ['1=1', ...clauses];
  if (providerFilter !== null && providerFilter !== undefined) {
    allClauses.push('r.logistics_provider_id = ?');
    params.push(providerFilter);
  }
  const whereSql = `WHERE ${allClauses.join(' AND ')}`;
  const safePage = toSafeInt(page, 1, 1, Number.MAX_SAFE_INTEGER);
  const safeLimit = toSafeInt(limit, 10, 1, 500);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT r.id, r.route_name, r.route_code, r.carrier_type, r.carrier_tool_name, r.carrier, r.departure_port, r.destination_port, r.description,
            r.is_enabled, r.logistics_provider_id, r.created_at, r.updated_at, lp.name AS logistics_provider_name
     FROM shipping_routes r
     LEFT JOIN logistics_providers lp ON r.logistics_provider_id = lp.id
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT ${safeLimit} OFFSET ${offset}`,
    params
  );
  const [countRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) as count FROM shipping_routes r ${whereSql}`,
    params
  );
  const total = Number(countRows?.[0]?.count || 0);
  return { data: rows as any[], total, pages: Math.max(1, Math.ceil(total / safeLimit)) };
};

export const searchShippingRoutes = async (keyword: string, providerFilter?: number | null): Promise<any[]> => {
  const like = `%${keyword}%`;
  const clauses = [`(
       CAST(r.id AS CHAR) LIKE ?
       OR r.route_name LIKE ?
       OR r.route_code LIKE ?
       OR r.carrier_type LIKE ?
       OR r.carrier_tool_name LIKE ?
       OR r.carrier LIKE ?
       OR r.departure_port LIKE ?
       OR r.destination_port LIKE ?
       OR r.description LIKE ?
     )`];
  const params: any[] = [like, like, like, like, like, like, like, like, like];
  if (providerFilter !== null && providerFilter !== undefined) {
    clauses.push('r.logistics_provider_id = ?');
    params.push(providerFilter);
  }
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT r.id, r.route_name, r.route_code, r.carrier_type, r.carrier_tool_name, r.carrier, r.departure_port, r.destination_port, r.description,
            r.is_enabled, r.logistics_provider_id, r.created_at, r.updated_at, lp.name AS logistics_provider_name
     FROM shipping_routes r
     LEFT JOIN logistics_providers lp ON r.logistics_provider_id = lp.id
     WHERE ${clauses.join(' AND ')}
     ORDER BY r.created_at DESC`,
    params
  );
  return rows as any[];
};

// 启用中的航线选项（供班次选择关联航线）
export const getEnabledShippingRoutes = async (providerFilter?: number | null): Promise<any[]> => {
  const params: any[] = [];
  let providerClause = '';
  if (providerFilter !== null && providerFilter !== undefined) {
    providerClause = 'AND logistics_provider_id = ?';
    params.push(providerFilter);
  }
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, route_name, route_code, carrier_type, departure_port, destination_port FROM shipping_routes WHERE is_enabled = 1 ${providerClause} ORDER BY route_name ASC`,
    params
  );
  return rows as any[];
};

export const findDuplicateShippingRoute = async (
  routeName: string,
  logisticsProviderId: number | null,
  excludeId?: number
): Promise<boolean> => {
  const params: any[] = [routeName];
  const providerClause = logisticsProviderId === null ? 'logistics_provider_id IS NULL' : (params.push(logisticsProviderId), 'logistics_provider_id = ?');
  let excludeClause = '';
  if (excludeId !== undefined) { excludeClause = ' AND id <> ?'; params.push(excludeId); }
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id FROM shipping_routes WHERE route_name = ? AND ${providerClause}${excludeClause} LIMIT 1`,
    params
  );
  return rows.length > 0;
};

export const createShippingRoute = async (payload: ShippingRoutePayload) => {
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `INSERT INTO shipping_routes (route_name, route_code, carrier_type, carrier_tool_name, carrier, departure_port, destination_port, description, is_enabled, logistics_provider_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.route_name,
      payload.route_code ?? null,
      payload.carrier_type,
      payload.carrier_tool_name ?? null,
      payload.carrier ?? null,
      payload.departure_port ?? null,
      payload.destination_port ?? null,
      payload.description ?? null,
      payload.is_enabled === false ? 0 : 1,
      payload.logistics_provider_id ?? null,
    ]
  );
  return { id: result.insertId, ...payload };
};

export const getShippingRouteById = async (id: number): Promise<any | null> => {
  return querySingle<any>(`SELECT * FROM shipping_routes WHERE id = ? LIMIT 1`, [id]);
};

export const updateShippingRoute = async (id: number, payload: Partial<ShippingRoutePayload>): Promise<boolean> => {
  const sets: string[] = ['updated_at = NOW()'];
  const params: any[] = [];
  if (payload.route_name !== undefined) { sets.push('route_name = ?'); params.push(payload.route_name); }
  if (payload.route_code !== undefined) { sets.push('route_code = ?'); params.push(payload.route_code ?? null); }
  if (payload.carrier_type !== undefined) { sets.push('carrier_type = ?'); params.push(payload.carrier_type); }
  if (payload.carrier_tool_name !== undefined) { sets.push('carrier_tool_name = ?'); params.push(payload.carrier_tool_name ?? null); }
  if (payload.carrier !== undefined) { sets.push('carrier = ?'); params.push(payload.carrier ?? null); }
  if (payload.departure_port !== undefined) { sets.push('departure_port = ?'); params.push(payload.departure_port ?? null); }
  if (payload.destination_port !== undefined) { sets.push('destination_port = ?'); params.push(payload.destination_port ?? null); }
  if (payload.description !== undefined) { sets.push('description = ?'); params.push(payload.description ?? null); }
  if (payload.is_enabled !== undefined) { sets.push('is_enabled = ?'); params.push(payload.is_enabled ? 1 : 0); }
  if (payload.logistics_provider_id !== undefined) { sets.push('logistics_provider_id = ?'); params.push(payload.logistics_provider_id ?? null); }
  params.push(id);
  const [result] = await pool.execute<mysql.ResultSetHeader>(`UPDATE shipping_routes SET ${sets.join(', ')} WHERE id = ?`, params);
  return result.affectedRows > 0;
};

export const deleteShippingRoute = async (id: number): Promise<boolean> => {
  const [result] = await pool.execute<mysql.ResultSetHeader>('DELETE FROM shipping_routes WHERE id = ?', [id]);
  return result.affectedRows > 0;
};

export const batchDeleteShippingRoutes = async (ids: number[]): Promise<number> => {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const [result] = await pool.execute<mysql.ResultSetHeader>(`DELETE FROM shipping_routes WHERE id IN (${placeholders})`, ids);
  return result.affectedRows;
};

// ============ 航线运输管理 - 集装箱 shipping_containers（按物流商归属） ============

const SHIPPING_CONTAINER_SORT_COLUMNS = new Set([
  'id', 'container_no', 'container_type', 'is_enabled', 'logistics_provider_id', 'created_at', 'updated_at',
]);

export interface ShippingContainerPayload {
  container_no: string;
  container_type: string;
  description?: string | null;
  is_enabled?: boolean;
  logistics_provider_id?: number | null;
}

export const getShippingContainersPaged = async (
  page: number,
  limit: number,
  sortKey?: string,
  sortOrder?: string,
  columnFilters?: Record<string, string>,
  dateFilters?: Record<string, [string, string]>,
  providerFilter?: number | null
) => {
  const orderBy = `c.${toSafeOrderBy(sortKey, sortOrder, SHIPPING_CONTAINER_SORT_COLUMNS, 'created_at')}`;
  const { clauses, params } = buildColumnFilters(columnFilters, dateFilters, SHIPPING_CONTAINER_SORT_COLUMNS, 'c.');
  const allClauses = ['1=1', ...clauses];
  if (providerFilter !== null && providerFilter !== undefined) {
    allClauses.push('c.logistics_provider_id = ?');
    params.push(providerFilter);
  }
  const whereSql = `WHERE ${allClauses.join(' AND ')}`;
  const safePage = toSafeInt(page, 1, 1, Number.MAX_SAFE_INTEGER);
  const safeLimit = toSafeInt(limit, 10, 1, 500);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT c.id, c.container_no, c.container_type, c.description, c.is_enabled, c.logistics_provider_id,
            c.created_at, c.updated_at, lp.name AS logistics_provider_name
     FROM shipping_containers c
     LEFT JOIN logistics_providers lp ON c.logistics_provider_id = lp.id
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT ${safeLimit} OFFSET ${offset}`,
    params
  );
  const [countRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) as count FROM shipping_containers c ${whereSql}`,
    params
  );
  const total = Number(countRows?.[0]?.count || 0);
  return { data: rows as any[], total, pages: Math.max(1, Math.ceil(total / safeLimit)) };
};

export const searchShippingContainers = async (keyword: string, providerFilter?: number | null): Promise<any[]> => {
  const like = `%${keyword}%`;
  const clauses = [`(
       CAST(c.id AS CHAR) LIKE ?
       OR c.container_no LIKE ?
       OR c.container_type LIKE ?
       OR c.description LIKE ?
     )`];
  const params: any[] = [like, like, like, like];
  if (providerFilter !== null && providerFilter !== undefined) {
    clauses.push('c.logistics_provider_id = ?');
    params.push(providerFilter);
  }
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT c.id, c.container_no, c.container_type, c.description, c.is_enabled, c.logistics_provider_id,
            c.created_at, c.updated_at, lp.name AS logistics_provider_name
     FROM shipping_containers c
     LEFT JOIN logistics_providers lp ON c.logistics_provider_id = lp.id
     WHERE ${clauses.join(' AND ')}
     ORDER BY c.created_at DESC`,
    params
  );
  return rows as any[];
};

// 启用中的集装箱选项（供提运单选择集装箱号）
export const getEnabledShippingContainers = async (providerFilter?: number | null): Promise<any[]> => {
  const params: any[] = [];
  let providerClause = '';
  if (providerFilter !== null && providerFilter !== undefined) {
    providerClause = 'AND logistics_provider_id = ?';
    params.push(providerFilter);
  }
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, container_no, container_type FROM shipping_containers WHERE is_enabled = 1 ${providerClause} ORDER BY container_no ASC`,
    params
  );
  return rows as any[];
};

export const findDuplicateShippingContainer = async (
  containerNo: string,
  logisticsProviderId: number | null,
  excludeId?: number
): Promise<boolean> => {
  const params: any[] = [containerNo];
  const providerClause = logisticsProviderId === null ? 'logistics_provider_id IS NULL' : (params.push(logisticsProviderId), 'logistics_provider_id = ?');
  let excludeClause = '';
  if (excludeId !== undefined) { excludeClause = ' AND id <> ?'; params.push(excludeId); }
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id FROM shipping_containers WHERE container_no = ? AND ${providerClause}${excludeClause} LIMIT 1`,
    params
  );
  return rows.length > 0;
};

export const createShippingContainer = async (payload: ShippingContainerPayload) => {
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `INSERT INTO shipping_containers (container_no, container_type, description, is_enabled, logistics_provider_id)
     VALUES (?, ?, ?, ?, ?)`,
    [
      payload.container_no,
      payload.container_type,
      payload.description ?? null,
      payload.is_enabled === false ? 0 : 1,
      payload.logistics_provider_id ?? null,
    ]
  );
  return { id: result.insertId, ...payload };
};

export const getShippingContainerById = async (id: number): Promise<any | null> => {
  return querySingle<any>(`SELECT * FROM shipping_containers WHERE id = ? LIMIT 1`, [id]);
};

export const updateShippingContainer = async (id: number, payload: Partial<ShippingContainerPayload>): Promise<boolean> => {
  const sets: string[] = ['updated_at = NOW()'];
  const params: any[] = [];
  if (payload.container_no !== undefined) { sets.push('container_no = ?'); params.push(payload.container_no); }
  if (payload.container_type !== undefined) { sets.push('container_type = ?'); params.push(payload.container_type); }
  if (payload.description !== undefined) { sets.push('description = ?'); params.push(payload.description ?? null); }
  if (payload.is_enabled !== undefined) { sets.push('is_enabled = ?'); params.push(payload.is_enabled ? 1 : 0); }
  if (payload.logistics_provider_id !== undefined) { sets.push('logistics_provider_id = ?'); params.push(payload.logistics_provider_id ?? null); }
  params.push(id);
  const [result] = await pool.execute<mysql.ResultSetHeader>(`UPDATE shipping_containers SET ${sets.join(', ')} WHERE id = ?`, params);
  return result.affectedRows > 0;
};

export const deleteShippingContainer = async (id: number): Promise<boolean> => {
  const [result] = await pool.execute<mysql.ResultSetHeader>('DELETE FROM shipping_containers WHERE id = ?', [id]);
  return result.affectedRows > 0;
};

export const batchDeleteShippingContainers = async (ids: number[]): Promise<number> => {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const [result] = await pool.execute<mysql.ResultSetHeader>(`DELETE FROM shipping_containers WHERE id IN (${placeholders})`, ids);
  return result.affectedRows;
};

// ============ 航线运输管理 - 班(航)次 shipping_voyages（关联航线，按物流商归属） ============

const SHIPPING_VOYAGE_SORT_COLUMNS = new Set([
  'id', 'voyage_name', 'voyage_no', 'etd', 'eta', 'atd', 'ata', 'si_cutoff', 'cargo_cutoff', 'vgm_cutoff',
  'departure_port', 'destination_port', 'route_id', 'is_enabled', 'logistics_provider_id', 'created_at', 'updated_at',
]);

export interface ShippingVoyagePayload {
  voyage_name: string;
  voyage_no?: string | null;
  etd?: string | null;
  eta?: string | null;
  atd?: string | null;
  ata?: string | null;
  si_cutoff?: string | null;
  cargo_cutoff?: string | null;
  vgm_cutoff?: string | null;
  departure_port?: string | null;
  destination_port?: string | null;
  route_id?: number | null;
  description?: string | null;
  is_enabled?: boolean;
  logistics_provider_id?: number | null;
}

export const getShippingVoyagesPaged = async (
  page: number,
  limit: number,
  sortKey?: string,
  sortOrder?: string,
  columnFilters?: Record<string, string>,
  dateFilters?: Record<string, [string, string]>,
  providerFilter?: number | null
) => {
  const orderBy = `v.${toSafeOrderBy(sortKey, sortOrder, SHIPPING_VOYAGE_SORT_COLUMNS, 'created_at')}`;
  const { clauses, params } = buildColumnFilters(columnFilters, dateFilters, SHIPPING_VOYAGE_SORT_COLUMNS, 'v.');
  const allClauses = ['1=1', ...clauses];
  if (providerFilter !== null && providerFilter !== undefined) {
    allClauses.push('v.logistics_provider_id = ?');
    params.push(providerFilter);
  }
  const whereSql = `WHERE ${allClauses.join(' AND ')}`;
  const safePage = toSafeInt(page, 1, 1, Number.MAX_SAFE_INTEGER);
  const safeLimit = toSafeInt(limit, 10, 1, 500);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT v.id, v.voyage_name, v.voyage_no, v.etd, v.eta, v.atd, v.ata, v.si_cutoff, v.cargo_cutoff, v.vgm_cutoff,
            v.departure_port, v.destination_port, v.route_id, v.description, v.is_enabled, v.logistics_provider_id,
            v.created_at, v.updated_at, lp.name AS logistics_provider_name, r.route_name AS route_name
     FROM shipping_voyages v
     LEFT JOIN logistics_providers lp ON v.logistics_provider_id = lp.id
     LEFT JOIN shipping_routes r ON v.route_id = r.id
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT ${safeLimit} OFFSET ${offset}`,
    params
  );
  const [countRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) as count FROM shipping_voyages v ${whereSql}`,
    params
  );
  const total = Number(countRows?.[0]?.count || 0);
  return { data: rows as any[], total, pages: Math.max(1, Math.ceil(total / safeLimit)) };
};

export const searchShippingVoyages = async (keyword: string, providerFilter?: number | null): Promise<any[]> => {
  const like = `%${keyword}%`;
  const clauses = [`(
       CAST(v.id AS CHAR) LIKE ?
       OR v.voyage_name LIKE ?
       OR v.voyage_no LIKE ?
       OR v.departure_port LIKE ?
       OR v.destination_port LIKE ?
       OR r.route_name LIKE ?
       OR v.description LIKE ?
     )`];
  const params: any[] = [like, like, like, like, like, like, like];
  if (providerFilter !== null && providerFilter !== undefined) {
    clauses.push('v.logistics_provider_id = ?');
    params.push(providerFilter);
  }
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT v.id, v.voyage_name, v.voyage_no, v.etd, v.eta, v.atd, v.ata, v.si_cutoff, v.cargo_cutoff, v.vgm_cutoff,
            v.departure_port, v.destination_port, v.route_id, v.description, v.is_enabled, v.logistics_provider_id,
            v.created_at, v.updated_at, lp.name AS logistics_provider_name, r.route_name AS route_name
     FROM shipping_voyages v
     LEFT JOIN logistics_providers lp ON v.logistics_provider_id = lp.id
     LEFT JOIN shipping_routes r ON v.route_id = r.id
     WHERE ${clauses.join(' AND ')}
     ORDER BY v.created_at DESC`,
    params
  );
  return rows as any[];
};

// 启用中的班次选项（供提运单选择关联班次，返回起运港/目的港用于默认填充）
export const getEnabledShippingVoyages = async (providerFilter?: number | null): Promise<any[]> => {
  const params: any[] = [];
  let providerClause = '';
  if (providerFilter !== null && providerFilter !== undefined) {
    providerClause = 'AND logistics_provider_id = ?';
    params.push(providerFilter);
  }
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, voyage_name, voyage_no, departure_port, destination_port FROM shipping_voyages WHERE is_enabled = 1 ${providerClause} ORDER BY voyage_name ASC`,
    params
  );
  return rows as any[];
};

export const findDuplicateShippingVoyage = async (
  voyageName: string,
  logisticsProviderId: number | null,
  excludeId?: number
): Promise<boolean> => {
  const params: any[] = [voyageName];
  const providerClause = logisticsProviderId === null ? 'logistics_provider_id IS NULL' : (params.push(logisticsProviderId), 'logistics_provider_id = ?');
  let excludeClause = '';
  if (excludeId !== undefined) { excludeClause = ' AND id <> ?'; params.push(excludeId); }
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id FROM shipping_voyages WHERE voyage_name = ? AND ${providerClause}${excludeClause} LIMIT 1`,
    params
  );
  return rows.length > 0;
};

export const createShippingVoyage = async (payload: ShippingVoyagePayload) => {
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `INSERT INTO shipping_voyages
       (voyage_name, voyage_no, etd, eta, atd, ata, si_cutoff, cargo_cutoff, vgm_cutoff, departure_port, destination_port, route_id, description, is_enabled, logistics_provider_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.voyage_name,
      payload.voyage_no ?? null,
      payload.etd ?? null,
      payload.eta ?? null,
      payload.atd ?? null,
      payload.ata ?? null,
      payload.si_cutoff ?? null,
      payload.cargo_cutoff ?? null,
      payload.vgm_cutoff ?? null,
      payload.departure_port ?? null,
      payload.destination_port ?? null,
      payload.route_id ?? null,
      payload.description ?? null,
      payload.is_enabled === false ? 0 : 1,
      payload.logistics_provider_id ?? null,
    ]
  );
  return { id: result.insertId, ...payload };
};

export const getShippingVoyageById = async (id: number): Promise<any | null> => {
  return querySingle<any>(`SELECT * FROM shipping_voyages WHERE id = ? LIMIT 1`, [id]);
};

export const updateShippingVoyage = async (id: number, payload: Partial<ShippingVoyagePayload>): Promise<boolean> => {
  const sets: string[] = ['updated_at = NOW()'];
  const params: any[] = [];
  if (payload.voyage_name !== undefined) { sets.push('voyage_name = ?'); params.push(payload.voyage_name); }
  if (payload.voyage_no !== undefined) { sets.push('voyage_no = ?'); params.push(payload.voyage_no ?? null); }
  if (payload.etd !== undefined) { sets.push('etd = ?'); params.push(payload.etd ?? null); }
  if (payload.eta !== undefined) { sets.push('eta = ?'); params.push(payload.eta ?? null); }
  if (payload.atd !== undefined) { sets.push('atd = ?'); params.push(payload.atd ?? null); }
  if (payload.ata !== undefined) { sets.push('ata = ?'); params.push(payload.ata ?? null); }
  if (payload.si_cutoff !== undefined) { sets.push('si_cutoff = ?'); params.push(payload.si_cutoff ?? null); }
  if (payload.cargo_cutoff !== undefined) { sets.push('cargo_cutoff = ?'); params.push(payload.cargo_cutoff ?? null); }
  if (payload.vgm_cutoff !== undefined) { sets.push('vgm_cutoff = ?'); params.push(payload.vgm_cutoff ?? null); }
  if (payload.departure_port !== undefined) { sets.push('departure_port = ?'); params.push(payload.departure_port ?? null); }
  if (payload.destination_port !== undefined) { sets.push('destination_port = ?'); params.push(payload.destination_port ?? null); }
  if (payload.route_id !== undefined) { sets.push('route_id = ?'); params.push(payload.route_id ?? null); }
  if (payload.description !== undefined) { sets.push('description = ?'); params.push(payload.description ?? null); }
  if (payload.is_enabled !== undefined) { sets.push('is_enabled = ?'); params.push(payload.is_enabled ? 1 : 0); }
  if (payload.logistics_provider_id !== undefined) { sets.push('logistics_provider_id = ?'); params.push(payload.logistics_provider_id ?? null); }
  params.push(id);
  const [result] = await pool.execute<mysql.ResultSetHeader>(`UPDATE shipping_voyages SET ${sets.join(', ')} WHERE id = ?`, params);
  return result.affectedRows > 0;
};

export const deleteShippingVoyage = async (id: number): Promise<boolean> => {
  const [result] = await pool.execute<mysql.ResultSetHeader>('DELETE FROM shipping_voyages WHERE id = ?', [id]);
  return result.affectedRows > 0;
};

export const batchDeleteShippingVoyages = async (ids: number[]): Promise<number> => {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const [result] = await pool.execute<mysql.ResultSetHeader>(`DELETE FROM shipping_voyages WHERE id IN (${placeholders})`, ids);
  return result.affectedRows;
};

// ============ 航线运输管理 - 提(运)单 shipping_bills（关联班次，按物流商归属） ============

const SHIPPING_BILL_SORT_COLUMNS = new Set([
  'id', 'bl_no', 'shipper', 'consignee', 'notify_party', 'delivery_place', 'departure_port', 'destination_port',
  'container_no', 'seal_no', 'package_count', 'weight', 'volume', 'marks', 'voyage_id', 'cargo_status',
  'logistics_provider_id', 'created_at', 'updated_at',
]);

export interface ShippingBillPayload {
  bl_no?: string | null;
  shipper: string;
  consignee: string;
  notify_party: string;
  delivery_place?: string | null;
  departure_port?: string | null;
  destination_port?: string | null;
  container_no?: string | null;
  seal_no?: string | null;
  package_count?: number | null;
  weight?: number | null;
  volume?: number | null;
  marks?: string | null;
  voyage_id?: number | null;
  cargo_status?: string | null;
  description?: string | null;
  logistics_provider_id?: number | null;
}

export const getShippingBillsPaged = async (
  page: number,
  limit: number,
  sortKey?: string,
  sortOrder?: string,
  columnFilters?: Record<string, string>,
  dateFilters?: Record<string, [string, string]>,
  providerFilter?: number | null
) => {
  const orderBy = `b.${toSafeOrderBy(sortKey, sortOrder, SHIPPING_BILL_SORT_COLUMNS, 'created_at')}`;
  const { clauses, params } = buildColumnFilters(columnFilters, dateFilters, SHIPPING_BILL_SORT_COLUMNS, 'b.');
  const allClauses = ['1=1', ...clauses];
  if (providerFilter !== null && providerFilter !== undefined) {
    allClauses.push('b.logistics_provider_id = ?');
    params.push(providerFilter);
  }
  const whereSql = `WHERE ${allClauses.join(' AND ')}`;
  const safePage = toSafeInt(page, 1, 1, Number.MAX_SAFE_INTEGER);
  const safeLimit = toSafeInt(limit, 10, 1, 500);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      `SELECT b.id, b.bl_no, b.shipper, b.consignee, b.notify_party, b.delivery_place, b.departure_port, b.destination_port,
        b.container_no, b.seal_no, b.package_count, b.weight, b.volume, b.marks, b.voyage_id, b.cargo_status,
            b.description, b.logistics_provider_id, b.created_at, b.updated_at,
            lp.name AS logistics_provider_name, v.voyage_name AS voyage_name
     FROM shipping_bills b
     LEFT JOIN logistics_providers lp ON b.logistics_provider_id = lp.id
     LEFT JOIN shipping_voyages v ON b.voyage_id = v.id
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT ${safeLimit} OFFSET ${offset}`,
    params
  );
  const [countRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) as count FROM shipping_bills b ${whereSql}`,
    params
  );
  const total = Number(countRows?.[0]?.count || 0);
  return { data: rows as any[], total, pages: Math.max(1, Math.ceil(total / safeLimit)) };
};

export const searchShippingBills = async (keyword: string, providerFilter?: number | null): Promise<any[]> => {
  const like = `%${keyword}%`;
  const clauses = [`(
       CAST(b.id AS CHAR) LIKE ?
       OR b.bl_no LIKE ?
       OR b.shipper LIKE ?
       OR b.consignee LIKE ?
       OR b.notify_party LIKE ?
       OR b.container_no LIKE ?
       OR b.departure_port LIKE ?
       OR b.destination_port LIKE ?
       OR v.voyage_name LIKE ?
       OR b.description LIKE ?
     )`];
  const params: any[] = [like, like, like, like, like, like, like, like, like, like];
  if (providerFilter !== null && providerFilter !== undefined) {
    clauses.push('b.logistics_provider_id = ?');
    params.push(providerFilter);
  }
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT b.id, b.bl_no, b.shipper, b.consignee, b.notify_party, b.delivery_place, b.departure_port, b.destination_port,
            b.container_no, b.seal_no, b.package_count, b.weight, b.volume, b.marks, b.voyage_id, b.cargo_status,
            b.description, b.logistics_provider_id, b.created_at, b.updated_at,
            lp.name AS logistics_provider_name, v.voyage_name AS voyage_name
     FROM shipping_bills b
     LEFT JOIN logistics_providers lp ON b.logistics_provider_id = lp.id
     LEFT JOIN shipping_voyages v ON b.voyage_id = v.id
     WHERE ${clauses.join(' AND ')}
     ORDER BY b.created_at DESC`,
    params
  );
  return rows as any[];
};

export const createShippingBill = async (payload: ShippingBillPayload) => {
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `INSERT INTO shipping_bills
       (bl_no, shipper, consignee, notify_party, delivery_place, departure_port, destination_port, container_no, seal_no,
        package_count, weight, volume, marks, voyage_id, cargo_status, description, logistics_provider_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.bl_no ?? null,
      payload.shipper,
      payload.consignee,
      payload.notify_party,
      payload.delivery_place ?? null,
      payload.departure_port ?? null,
      payload.destination_port ?? null,
      payload.container_no ?? null,
      payload.seal_no ?? null,
      payload.package_count ?? null,
      payload.weight ?? null,
      payload.volume ?? null,
      payload.marks ?? null,
      payload.voyage_id ?? null,
      payload.cargo_status ?? null,
      payload.description ?? null,
      payload.logistics_provider_id ?? null,
    ]
  );
  return { id: result.insertId, ...payload };
};

export const getShippingBillById = async (id: number): Promise<any | null> => {
  return querySingle<any>(`SELECT * FROM shipping_bills WHERE id = ? LIMIT 1`, [id]);
};

export const updateShippingBill = async (id: number, payload: Partial<ShippingBillPayload>): Promise<boolean> => {
  const sets: string[] = ['updated_at = NOW()'];
  const params: any[] = [];
  if (payload.bl_no !== undefined) { sets.push('bl_no = ?'); params.push(payload.bl_no ?? null); }
  if (payload.shipper !== undefined) { sets.push('shipper = ?'); params.push(payload.shipper); }
  if (payload.consignee !== undefined) { sets.push('consignee = ?'); params.push(payload.consignee); }
  if (payload.notify_party !== undefined) { sets.push('notify_party = ?'); params.push(payload.notify_party); }
  if (payload.delivery_place !== undefined) { sets.push('delivery_place = ?'); params.push(payload.delivery_place ?? null); }
  if (payload.departure_port !== undefined) { sets.push('departure_port = ?'); params.push(payload.departure_port ?? null); }
  if (payload.destination_port !== undefined) { sets.push('destination_port = ?'); params.push(payload.destination_port ?? null); }
  if (payload.container_no !== undefined) { sets.push('container_no = ?'); params.push(payload.container_no ?? null); }
  if (payload.seal_no !== undefined) { sets.push('seal_no = ?'); params.push(payload.seal_no ?? null); }
  if (payload.package_count !== undefined) { sets.push('package_count = ?'); params.push(payload.package_count ?? null); }
  if (payload.weight !== undefined) { sets.push('weight = ?'); params.push(payload.weight ?? null); }
  if (payload.volume !== undefined) { sets.push('volume = ?'); params.push(payload.volume ?? null); }
  if (payload.marks !== undefined) { sets.push('marks = ?'); params.push(payload.marks ?? null); }
  if (payload.voyage_id !== undefined) { sets.push('voyage_id = ?'); params.push(payload.voyage_id ?? null); }
  if (payload.cargo_status !== undefined) { sets.push('cargo_status = ?'); params.push(payload.cargo_status ?? null); }
  if (payload.description !== undefined) { sets.push('description = ?'); params.push(payload.description ?? null); }
  if (payload.logistics_provider_id !== undefined) { sets.push('logistics_provider_id = ?'); params.push(payload.logistics_provider_id ?? null); }
  params.push(id);
  const [result] = await pool.execute<mysql.ResultSetHeader>(`UPDATE shipping_bills SET ${sets.join(', ')} WHERE id = ?`, params);
  return result.affectedRows > 0;
};

export const deleteShippingBill = async (id: number): Promise<boolean> => {
  const [result] = await pool.execute<mysql.ResultSetHeader>('DELETE FROM shipping_bills WHERE id = ?', [id]);
  return result.affectedRows > 0;
};

export const batchDeleteShippingBills = async (ids: number[]): Promise<number> => {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const [result] = await pool.execute<mysql.ResultSetHeader>(`DELETE FROM shipping_bills WHERE id IN (${placeholders})`, ids);
  return result.affectedRows;
};

// ============ 系统设置 - 标签管理（HTML 模板，按物流商归属） ============

const LABEL_SORT_COLUMNS = new Set([
  'id', 'label_name', 'is_enabled', 'logistics_provider_id', 'created_at', 'updated_at',
]);

export interface LabelTemplatePayload {
  label_name: string;
  template_html: string;
  description?: string | null;
  is_enabled?: boolean;
  logistics_provider_id?: number | null;
}

export const getLabelTemplatesPaged = async (
  page: number,
  limit: number,
  sortKey?: string,
  sortOrder?: string,
  columnFilters?: Record<string, string>,
  dateFilters?: Record<string, [string, string]>,
  providerFilter?: number | null
) => {
  const orderBy = `lt.${toSafeOrderBy(sortKey, sortOrder, LABEL_SORT_COLUMNS, 'created_at')}`;
  const { clauses, params } = buildColumnFilters(columnFilters, dateFilters, LABEL_SORT_COLUMNS, 'lt.');
  const allClauses = ['1=1', ...clauses];
  if (providerFilter !== null && providerFilter !== undefined) {
    allClauses.push('lt.logistics_provider_id = ?');
    params.push(providerFilter);
  }
  const whereSql = `WHERE ${allClauses.join(' AND ')}`;

  const safePage = toSafeInt(page, 1, 1, Number.MAX_SAFE_INTEGER);
  const safeLimit = toSafeInt(limit, 10, 1, 500);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT lt.id, lt.label_name, lt.template_html, lt.description, lt.is_enabled,
            lt.logistics_provider_id, lt.created_at, lt.updated_at, lp.name AS logistics_provider_name
     FROM label_templates lt
     LEFT JOIN logistics_providers lp ON lt.logistics_provider_id = lp.id
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT ${safeLimit} OFFSET ${offset}`,
    params
  );

  const [countRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) as count FROM label_templates lt ${whereSql}`,
    params
  );

  const total = Number(countRows?.[0]?.count || 0);
  return {
    data: rows as any[],
    total,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
  };
};

export const searchLabelTemplates = async (keyword: string, providerFilter?: number | null): Promise<any[]> => {
  const like = `%${keyword}%`;
  const clauses = [`(
       CAST(lt.id AS CHAR) LIKE ?
       OR lt.label_name LIKE ?
       OR lt.description LIKE ?
     )`];
  const params: any[] = [like, like, like];
  if (providerFilter !== null && providerFilter !== undefined) {
    clauses.push('lt.logistics_provider_id = ?');
    params.push(providerFilter);
  }
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT lt.id, lt.label_name, lt.template_html, lt.description, lt.is_enabled,
            lt.logistics_provider_id, lt.created_at, lt.updated_at, lp.name AS logistics_provider_name
     FROM label_templates lt
     LEFT JOIN logistics_providers lp ON lt.logistics_provider_id = lp.id
     WHERE ${clauses.join(' AND ')}
     ORDER BY lt.created_at DESC`,
    params
  );
  return rows as any[];
};

export const findDuplicateLabelName = async (
  labelName: string,
  logisticsProviderId: number | null,
  excludeId?: number
): Promise<boolean> => {
  const params: any[] = [labelName];
  let providerClause: string;
  if (logisticsProviderId === null) {
    providerClause = 'logistics_provider_id IS NULL';
  } else {
    providerClause = 'logistics_provider_id = ?';
    params.push(logisticsProviderId);
  }
  let excludeClause = '';
  if (excludeId !== undefined) {
    excludeClause = ' AND id <> ?';
    params.push(excludeId);
  }
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id FROM label_templates WHERE label_name = ? AND ${providerClause}${excludeClause} LIMIT 1`,
    params
  );
  return rows.length > 0;
};

export const createLabelTemplate = async (payload: LabelTemplatePayload) => {
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `INSERT INTO label_templates (label_name, template_html, description, is_enabled, logistics_provider_id)
     VALUES (?, ?, ?, ?, ?)`,
    [
      payload.label_name,
      payload.template_html,
      payload.description || null,
      payload.is_enabled === false ? 0 : 1,
      payload.logistics_provider_id ?? null,
    ]
  );
  return { id: result.insertId, ...payload };
};

export const getLabelTemplateById = async (id: number): Promise<any | null> => {
  return querySingle<any>(
    `SELECT id, label_name, logistics_provider_id FROM label_templates WHERE id = ? LIMIT 1`,
    [id]
  );
};

export const updateLabelTemplate = async (id: number, payload: Partial<LabelTemplatePayload>): Promise<boolean> => {
  const sets: string[] = ['updated_at = NOW()'];
  const params: any[] = [];
  if (payload.label_name !== undefined) { sets.push('label_name = ?'); params.push(payload.label_name); }
  if (payload.template_html !== undefined) { sets.push('template_html = ?'); params.push(payload.template_html); }
  if (payload.description !== undefined) { sets.push('description = ?'); params.push(payload.description || null); }
  if (payload.is_enabled !== undefined) { sets.push('is_enabled = ?'); params.push(payload.is_enabled ? 1 : 0); }
  if (payload.logistics_provider_id !== undefined) { sets.push('logistics_provider_id = ?'); params.push(payload.logistics_provider_id ?? null); }
  params.push(id);
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `UPDATE label_templates SET ${sets.join(', ')} WHERE id = ?`,
    params
  );
  return result.affectedRows > 0;
};

export const deleteLabelTemplate = async (id: number): Promise<boolean> => {
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    'DELETE FROM label_templates WHERE id = ?',
    [id]
  );
  return result.affectedRows > 0;
};

export const batchDeleteLabelTemplates = async (ids: number[]): Promise<number> => {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `DELETE FROM label_templates WHERE id IN (${placeholders})`,
    ids
  );
  return result.affectedRows;
};

// ============ 系统设置 - 包裹状态字典 ============
const PARCEL_STATUS_SORT_COLUMNS = new Set(['id', 'status_id', 'status_code', 'status_name', 'status_type', 'status_category', 'is_enabled', 'created_at', 'updated_at']);
export const PARCEL_STATUS_TYPE_SET = new Set(['货物态', '信息态']);

export const getParcelStatusesPaged = async (
  page: number,
  limit: number,
  sortKey?: string,
  sortOrder?: string,
  columnFilters?: Record<string, string>,
  dateFilters?: Record<string, [string, string]>
) => {
  const orderBy = toSafeOrderBy(sortKey, sortOrder, PARCEL_STATUS_SORT_COLUMNS, 'status_id');
  const { clauses, params } = buildColumnFilters(columnFilters, dateFilters, PARCEL_STATUS_SORT_COLUMNS);
  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  const safePage = toSafeInt(page, 1, 1, Number.MAX_SAFE_INTEGER);
  const safeLimit = toSafeInt(limit, 10, 1, 500);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, status_id, status_code, status_name, status_type, status_category, is_enabled, created_at, updated_at
     FROM parcel_statuses
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT ${safeLimit} OFFSET ${offset}`,
    params
  );

  const [countRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) as count FROM parcel_statuses ${whereSql}`,
    params
  );

  const total = Number(countRows?.[0]?.count || 0);
  return {
    data: rows as any[],
    total,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
  };
};

export const searchParcelStatuses = async (keyword: string): Promise<any[]> => {
  const like = `%${keyword}%`;
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, status_id, status_code, status_name, status_type, status_category, is_enabled, created_at, updated_at
     FROM parcel_statuses
     WHERE CAST(status_id AS CHAR) LIKE ?
       OR status_code LIKE ?
       OR status_name LIKE ?
       OR status_type LIKE ?
       OR status_category LIKE ?
     ORDER BY status_id ASC`,
    [like, like, like, like, like]
  );
  return rows as any[];
};

export const getParcelStatusById = async (id: number): Promise<any | null> => {
  return querySingle<any>('SELECT * FROM parcel_statuses WHERE id = ? LIMIT 1', [id]);
};

// 返回所有启用状态项（用于包裹管理下拉与标签映射）
export const getEnabledParcelStatuses = async (): Promise<Array<{
  status_code: string;
  status_name: string;
  status_type: string;
  status_category: string | null;
}>> => {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT status_code, status_name, status_type, status_category
     FROM parcel_statuses WHERE is_enabled = 1 ORDER BY status_id ASC`
  );
  return rows as any[];
};

// 返回指定状态类型（货物态/信息态）下所有启用的状态编码集合，用于接口层校验
export const getEnabledParcelStatusCodesByType = async (type: string): Promise<Set<string>> => {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT status_code FROM parcel_statuses WHERE is_enabled = 1 AND status_type = ?`,
    [type]
  );
  return new Set((rows as any[]).map((r: any) => r.status_code));
};

export const findParcelStatusConflict = async (
  statusId: number,
  statusCode: string,
  excludeId?: number
): Promise<{ status_id: number; status_code: string } | null> => {
  const params: any[] = [statusId, statusCode];
  let sql = 'SELECT status_id, status_code FROM parcel_statuses WHERE (status_id = ? OR status_code = ?)';
  if (excludeId) {
    sql += ' AND id <> ?';
    params.push(excludeId);
  }
  sql += ' LIMIT 1';
  return querySingle<{ status_id: number; status_code: string }>(sql, params);
};

export const createParcelStatus = async (payload: {
  status_id: number;
  status_code: string;
  status_name: string;
  status_type: string;
  status_category?: string | null;
  is_enabled?: boolean;
}) => {
  const statusType = PARCEL_STATUS_TYPE_SET.has(payload.status_type) ? payload.status_type : '货物态';
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `INSERT INTO parcel_statuses (status_id, status_code, status_name, status_type, status_category, is_enabled)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      payload.status_id,
      payload.status_code,
      payload.status_name,
      statusType,
      payload.status_category || null,
      payload.is_enabled === false ? 0 : 1,
    ]
  );
  return { id: result.insertId };
};

export const updateParcelStatusDict = async (id: number, payload: {
  status_id?: number;
  status_code?: string;
  status_name?: string;
  status_type?: string;
  status_category?: string | null;
  is_enabled?: boolean;
}): Promise<boolean> => {
  const sets: string[] = ['updated_at = NOW()'];
  const params: any[] = [];
  if (payload.status_id !== undefined) { sets.push('status_id = ?'); params.push(payload.status_id); }
  if (payload.status_code !== undefined) { sets.push('status_code = ?'); params.push(payload.status_code); }
  if (payload.status_name !== undefined) { sets.push('status_name = ?'); params.push(payload.status_name); }
  if (payload.status_type !== undefined) { sets.push('status_type = ?'); params.push(PARCEL_STATUS_TYPE_SET.has(payload.status_type) ? payload.status_type : '货物态'); }
  if (payload.status_category !== undefined) { sets.push('status_category = ?'); params.push(payload.status_category || null); }
  if (payload.is_enabled !== undefined) { sets.push('is_enabled = ?'); params.push(payload.is_enabled ? 1 : 0); }
  params.push(id);
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `UPDATE parcel_statuses SET ${sets.join(', ')} WHERE id = ?`,
    params
  );
  return result.affectedRows > 0;
};

export const deleteParcelStatus = async (id: number): Promise<boolean> => {
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    'DELETE FROM parcel_statuses WHERE id = ?',
    [id]
  );
  return result.affectedRows > 0;
};

export const batchDeleteParcelStatuses = async (ids: number[]): Promise<number> => {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `DELETE FROM parcel_statuses WHERE id IN (${placeholders})`,
    ids
  );
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
