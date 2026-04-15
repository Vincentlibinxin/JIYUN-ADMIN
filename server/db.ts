import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

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
        status VARCHAR(32) DEFAULT 'active',
        last_login DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_admin_username (username)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

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
        'INSERT INTO admin_users (username, password, email, role) VALUES (?, ?, ?, ?)',
        [defaultUsername, hashed, defaultEmail, 'super_admin']
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
  dateFilters?: Record<string, [string, string]>
) => {
  const orderBy = toSafeOrderBy(sortKey, sortOrder, USERS_SORT_COLUMNS, 'created_at');
  const { clauses, params } = buildColumnFilters(columnFilters, dateFilters, USERS_SORT_COLUMNS);
  const allClauses = ['deleted_at IS NULL', ...clauses];
  const whereSql = `WHERE ${allClauses.join(' AND ')}`;

  const safePage = toSafeInt(page, 1, 1, Number.MAX_SAFE_INTEGER);
  const safeLimit = toSafeInt(limit, 10, 1, 500);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, username, phone, email, real_name, address, created_at, updated_at
     FROM users
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT ${safeLimit} OFFSET ${offset}`,
    params
  );

  const [countRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) as count FROM users ${whereSql}`,
    params
  );

  const total = Number(countRows?.[0]?.count || 0);
  return {
    data: rows as any[],
    total,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
  };
};

export const searchUsersPaged = async (keyword: string, page: number, limit: number, sortKey?: string, sortOrder?: string) => {
  const like = `%${keyword}%`;
  const orderBy = toSafeOrderBy(sortKey, sortOrder, USERS_SORT_COLUMNS, 'created_at');
  return toPagedResult(
    page,
    limit,
    async (safeLimit, offset) => {
      const [rows] = await pool.execute<mysql.RowDataPacket[]>(
        `SELECT id, username, phone, email, real_name, address, created_at, updated_at
         FROM users
         WHERE deleted_at IS NULL AND (username LIKE ? OR phone LIKE ? OR email LIKE ? OR real_name LIKE ?)
         ORDER BY ${orderBy}
         LIMIT ${safeLimit} OFFSET ${offset}`,
        [like, like, like, like]
      );
      return rows as any[];
    },
    async () => {
      const [countRows] = await pool.execute<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) as count
         FROM users
         WHERE deleted_at IS NULL AND (username LIKE ? OR phone LIKE ? OR email LIKE ? OR real_name LIKE ?)`,
        [like, like, like, like]
      );
      return Number(countRows?.[0]?.count || 0);
    }
  );
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
  dateFilters?: Record<string, [string, string]>
) => {
  const safePage = toSafeInt(page, 1, 1, Number.MAX_SAFE_INTEGER);
  const safeLimit = toSafeInt(limit, 10, 1, 500);
  const offset = (safePage - 1) * safeLimit;
  const dateRange = buildCreatedAtFilter(startDate, endDate);
  const colFilter = buildColumnFilters(columnFilters, dateFilters, ORDERS_SORT_COLUMNS);
  const allClauses = ['deleted_at IS NULL', ...dateRange.clauses, ...colFilter.clauses];
  const allParams = [...dateRange.params, ...colFilter.params];
  const whereSql = `WHERE ${allClauses.join(' AND ')}`;
  const orderBy = toSafeOrderBy(sortKey, sortOrder, ORDERS_SORT_COLUMNS, 'created_at');

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, user_id, total_amount, currency, status, created_at
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

export const searchOrders = async (keyword: string, startDate?: string, endDate?: string): Promise<any[]> => {
  const like = `%${keyword}%`;
  const { clauses, params } = buildCreatedAtFilter(startDate, endDate);
  const keywordClause = '(CAST(id AS CHAR) LIKE ? OR CAST(user_id AS CHAR) LIKE ? OR status LIKE ?)';
  const allClauses = ['deleted_at IS NULL', keywordClause, ...clauses];
  const whereSql = `WHERE ${allClauses.join(' AND ')}`;

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, user_id, total_amount, currency, status, created_at
     FROM orders
     ${whereSql}
     ORDER BY created_at DESC`,
    [like, like, like, ...params]
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
  const colFilter = buildColumnFilters(columnFilters, dateFilters, SMS_SORT_COLUMNS);
  const allClauses = ['deleted_at IS NULL', ...dateRange.clauses, ...colFilter.clauses];
  const allParams = [...dateRange.params, ...colFilter.params];
  const whereSql = `WHERE ${allClauses.join(' AND ')}`;
  const orderBy = toSafeOrderBy(sortKey, sortOrder, SMS_SORT_COLUMNS, 'created_at');

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, phone, code, verified, created_at, expires_at
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
  dateFilters?: Record<string, [string, string]>
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

  const dateRange = buildCreatedAtFilter(startDate, endDate, 'p.');
  const colFilter = buildColumnFilters(parcelColFilters, dateFilters, PARCELS_SORT_COLUMNS, 'p.');
  const allClauses = ['p.deleted_at IS NULL', ...dateRange.clauses, ...colFilter.clauses];
  const allParams = [...dateRange.params, ...colFilter.params];

  if (usernameFilter) {
    allClauses.push(`CAST(u.username AS CHAR) LIKE ?`);
    allParams.push(`%${usernameFilter.trim()}%`);
  }

  const whereSql = `WHERE ${allClauses.join(' AND ')}`;
  const safeSort = sortKey === PARCELS_USERNAME_COL ? 'u.username' : undefined;
  const orderBy = safeSort
    ? `${safeSort} ${sortOrder === 'asc' ? 'ASC' : 'DESC'}`
    : `p.${toSafeOrderBy(sortKey, sortOrder, PARCELS_SORT_COLUMNS, 'created_at')}`;

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT p.id, p.user_id, p.tracking_number, p.origin, p.destination,
            p.weight, p.length_cm, p.width_cm, p.height_cm, p.volume, p.images,
            p.status, p.estimated_delivery, p.created_at,
            u.username AS username,
            (SELECT pi.name FROM parcel_items pi WHERE pi.parcel_id = p.id ORDER BY pi.id LIMIT 1) AS first_item_name,
            (SELECT COUNT(*) FROM parcel_items pi WHERE pi.parcel_id = p.id) AS item_count
     FROM parcels p
     LEFT JOIN users u ON p.user_id = u.id
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT ${safeLimit} OFFSET ${offset}`,
    allParams
  );

  const [countRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) as count
     FROM parcels p
     LEFT JOIN users u ON p.user_id = u.id
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

export const searchParcels = async (keyword: string, startDate?: string, endDate?: string): Promise<any[]> => {
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
  const whereSql = `WHERE ${allClauses.join(' AND ')}`;

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT p.id, p.user_id, p.tracking_number, p.origin, p.destination,
            p.weight, p.length_cm, p.width_cm, p.height_cm, p.volume, p.images,
            p.status, p.estimated_delivery, p.created_at,
            u.username AS username,
            (SELECT pi.name FROM parcel_items pi WHERE pi.parcel_id = p.id ORDER BY pi.id LIMIT 1) AS first_item_name,
            (SELECT COUNT(*) FROM parcel_items pi WHERE pi.parcel_id = p.id) AS item_count
     FROM parcels p
     LEFT JOIN users u ON p.user_id = u.id
     ${whereSql}
     ORDER BY p.created_at DESC`,
    [like, like, like, like, like, like, like, ...params]
  );
  return rows as any[];
};

export const updateParcelStatus = async (parcelId: number, status: string): Promise<boolean> => {
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    'UPDATE parcels SET status = ?, updated_at = NOW() WHERE id = ?',
    [status, parcelId]
  );
  return result.affectedRows > 0;
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
  items: { name: string; value: number; quantity: number }[];
}): Promise<number> => {
  const { tracking_number, weight, length_cm, width_cm, height_cm, volume, images, shelf_location, items } = payload;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute<mysql.ResultSetHeader>(
      `INSERT INTO parcels (tracking_number, weight, length_cm, width_cm, height_cm, volume, images, shelf_location, origin, destination, status, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '', 'arrived', NULL)`,
      [tracking_number, weight, length_cm, width_cm, height_cm, volume, images || null, shelf_location || null]
    );
    const parcelId = result.insertId;
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
  return rows as any[];
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
  images?: string;
  items: { name: string; value: number; quantity: number }[];
}): Promise<boolean> => {
  const { weight, length_cm, width_cm, height_cm, volume, origin, destination, status, images, items } = payload;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const sets: string[] = ['weight = ?', 'length_cm = ?', 'width_cm = ?', 'height_cm = ?', 'volume = ?', 'updated_at = NOW()'];
    const params: any[] = [weight, length_cm, width_cm, height_cm, volume];
    if (origin !== undefined) { sets.push('origin = ?'); params.push(origin); }
    if (destination !== undefined) { sets.push('destination = ?'); params.push(destination); }
    if (status !== undefined) { sets.push('status = ?'); params.push(status); }
    if (images !== undefined) { sets.push('images = ?'); params.push(images || null); }
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

const ADMINS_SORT_COLUMNS = new Set(['id', 'username', 'email', 'role', 'status', 'last_login', 'created_at']);

export const getAdminsPaged = async (
  page: number,
  limit: number,
  sortKey?: string,
  sortOrder?: string,
  columnFilters?: Record<string, string>,
  dateFilters?: Record<string, [string, string]>
) => {
  const orderBy = toSafeOrderBy(sortKey, sortOrder, ADMINS_SORT_COLUMNS, 'created_at');
  const { clauses, params } = buildColumnFilters(columnFilters, dateFilters, ADMINS_SORT_COLUMNS);
  const allClauses = ['deleted_at IS NULL', ...clauses];
  const whereSql = `WHERE ${allClauses.join(' AND ')}`;

  const safePage = toSafeInt(page, 1, 1, Number.MAX_SAFE_INTEGER);
  const safeLimit = toSafeInt(limit, 10, 1, 500);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, username, email, role, status, last_login, created_at, updated_at
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

export const searchAdmins = async (keyword: string): Promise<any[]> => {
  const like = `%${keyword}%`;
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, username, email, role, status, last_login, created_at, updated_at
     FROM admin_users
     WHERE deleted_at IS NULL AND (
       CAST(id AS CHAR) LIKE ?
       OR username LIKE ?
       OR email LIKE ?
       OR role LIKE ?
       OR status LIKE ?
     )
     ORDER BY created_at DESC`,
    [like, like, like, like, like]
  );
  return rows as any[];
};

export const createAdmin = async (payload: { username: string; password: string; email: string; role: string }) => {
  const existing = await getAdminByUsername(payload.username);
  if (existing) return null;

  const hashed = await bcrypt.hash(payload.password, 10);
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    'INSERT INTO admin_users (username, password, email, role, status) VALUES (?, ?, ?, ?, ?)',
    [payload.username, hashed, payload.email, payload.role || 'admin', 'active']
  );
  return {
    id: result.insertId,
    username: payload.username,
    email: payload.email,
    role: payload.role || 'admin',
    status: 'active',
  };
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

export const batchDeleteUsers = async (ids: number[]): Promise<number> => {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const [result] = await pool.execute<mysql.ResultSetHeader>(`UPDATE users SET deleted_at = NOW() WHERE id IN (${placeholders}) AND deleted_at IS NULL`, ids);
  return result.affectedRows;
};

export const batchDeleteOrders = async (ids: number[]): Promise<number> => {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const [result] = await pool.execute<mysql.ResultSetHeader>(`UPDATE orders SET deleted_at = NOW() WHERE id IN (${placeholders}) AND deleted_at IS NULL`, ids);
  return result.affectedRows;
};

export const batchDeleteSms = async (ids: number[]): Promise<number> => {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const [result] = await pool.execute<mysql.ResultSetHeader>(`UPDATE otp_codes SET deleted_at = NOW() WHERE id IN (${placeholders}) AND deleted_at IS NULL`, ids);
  return result.affectedRows;
};

export const batchDeleteParcels = async (ids: number[]): Promise<number> => {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const [result] = await pool.execute<mysql.ResultSetHeader>(`UPDATE parcels SET deleted_at = NOW() WHERE id IN (${placeholders}) AND deleted_at IS NULL`, ids);
  return result.affectedRows;
};

export const batchDeleteAdmins = async (ids: number[]): Promise<number> => {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const [result] = await pool.execute<mysql.ResultSetHeader>(`UPDATE admin_users SET deleted_at = NOW() WHERE id IN (${placeholders}) AND deleted_at IS NULL`, ids);
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
