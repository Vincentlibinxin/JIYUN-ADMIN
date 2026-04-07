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

const buildCreatedAtFilter = (startDate?: string, endDate?: string) => {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const from = normalizeDateOnly(startDate);
  const to = normalizeDateOnly(endDate);

  if (from) {
    clauses.push('created_at >= ?');
    params.push(`${from} 00:00:00`);
  }
  if (to) {
    clauses.push('created_at <= ?');
    params.push(`${to} 23:59:59`);
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
        status VARCHAR(64) DEFAULT 'pending',
        estimated_delivery DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_parcels_user (user_id),
        INDEX idx_parcels_tracking (tracking_number)
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
  return querySingle<any>('SELECT * FROM admin_users WHERE username = ? LIMIT 1', [username]);
};

export const getAdminById = async (adminId: number): Promise<any | null> => {
  return querySingle<any>('SELECT * FROM admin_users WHERE id = ? LIMIT 1', [adminId]);
};

export const updateAdminLastLogin = async (adminId: number): Promise<void> => {
  await pool.execute('UPDATE admin_users SET last_login = NOW() WHERE id = ?', [adminId]);
};

export const getUsersPaged = async (page: number, limit: number) => {
  return toPagedResult(
    page,
    limit,
    async (safeLimit, offset) => {
      const [rows] = await pool.query<mysql.RowDataPacket[]>(
        `SELECT id, username, phone, email, real_name, address, created_at, updated_at
         FROM users
         ORDER BY created_at DESC
         LIMIT ${safeLimit} OFFSET ${offset}`
      );
      return rows as any[];
    },
    getUsersCount
  );
};

export const searchUsers = async (keyword: string): Promise<any[]> => {
  const like = `%${keyword}%`;
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, username, phone, email, real_name, address, created_at, updated_at
     FROM users
     WHERE username LIKE ? OR phone LIKE ? OR email LIKE ? OR real_name LIKE ?
     ORDER BY created_at DESC`,
    [like, like, like, like]
  );
  return rows as any[];
};

export const deleteUser = async (userId: number): Promise<boolean> => {
  const [result] = await pool.execute<mysql.ResultSetHeader>('DELETE FROM users WHERE id = ?', [userId]);
  return result.affectedRows > 0;
};

export const getOrdersPaged = async (page: number, limit: number, startDate?: string, endDate?: string) => {
  const safePage = toSafeInt(page, 1, 1, Number.MAX_SAFE_INTEGER);
  const safeLimit = toSafeInt(limit, 10, 1, 500);
  const offset = (safePage - 1) * safeLimit;
  const { clauses, params } = buildCreatedAtFilter(startDate, endDate);
  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, user_id, total_amount, currency, status, created_at
     FROM orders
     ${whereSql}
     ORDER BY created_at DESC
     LIMIT ${safeLimit} OFFSET ${offset}`,
    params
  );

  const [countRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) as count
     FROM orders
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

export const searchOrders = async (keyword: string, startDate?: string, endDate?: string): Promise<any[]> => {
  const like = `%${keyword}%`;
  const { clauses, params } = buildCreatedAtFilter(startDate, endDate);
  const keywordClause = '(CAST(id AS CHAR) LIKE ? OR CAST(user_id AS CHAR) LIKE ? OR status LIKE ?)';
  const whereSql = clauses.length > 0
    ? `WHERE ${keywordClause} AND ${clauses.join(' AND ')}`
    : `WHERE ${keywordClause}`;

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

export const getSmsPaged = async (page: number, limit: number, startDate?: string, endDate?: string) => {
  const safePage = toSafeInt(page, 1, 1, Number.MAX_SAFE_INTEGER);
  const safeLimit = toSafeInt(limit, 10, 1, 500);
  const offset = (safePage - 1) * safeLimit;
  const { clauses, params } = buildCreatedAtFilter(startDate, endDate);
  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, phone, code, verified, created_at, expires_at
     FROM otp_codes
     ${whereSql}
     ORDER BY created_at DESC
     LIMIT ${safeLimit} OFFSET ${offset}`,
    params
  );

  const [countRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) as count
     FROM otp_codes
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

export const searchSms = async (keyword: string, startDate?: string, endDate?: string): Promise<any[]> => {
  const like = `%${keyword}%`;
  const { clauses, params } = buildCreatedAtFilter(startDate, endDate);
  const keywordClause = `(
    CAST(id AS CHAR) LIKE ?
    OR phone LIKE ?
    OR code LIKE ?
    OR CAST(verified AS CHAR) LIKE ?
  )`;
  const whereSql = clauses.length > 0
    ? `WHERE ${keywordClause} AND ${clauses.join(' AND ')}`
    : `WHERE ${keywordClause}`;

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, phone, code, verified, created_at, expires_at
     FROM otp_codes
     ${whereSql}
     ORDER BY created_at DESC`,
    [like, like, like, like, ...params]
  );
  return rows as any[];
};

export const getParcelsPaged = async (page: number, limit: number, startDate?: string, endDate?: string) => {
  const safePage = toSafeInt(page, 1, 1, Number.MAX_SAFE_INTEGER);
  const safeLimit = toSafeInt(limit, 10, 1, 500);
  const offset = (safePage - 1) * safeLimit;
  const { clauses, params } = buildCreatedAtFilter(startDate, endDate);
  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, user_id, tracking_number, origin, destination, weight, status, estimated_delivery, created_at
     FROM parcels
     ${whereSql}
     ORDER BY created_at DESC
     LIMIT ${safeLimit} OFFSET ${offset}`,
    params
  );

  const [countRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) as count
     FROM parcels
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

export const searchParcels = async (keyword: string, startDate?: string, endDate?: string): Promise<any[]> => {
  const like = `%${keyword}%`;
  const { clauses, params } = buildCreatedAtFilter(startDate, endDate);
  const keywordClause = `(
    CAST(id AS CHAR) LIKE ?
    OR CAST(user_id AS CHAR) LIKE ?
    OR tracking_number LIKE ?
    OR origin LIKE ?
    OR destination LIKE ?
    OR status LIKE ?
  )`;
  const whereSql = clauses.length > 0
    ? `WHERE ${keywordClause} AND ${clauses.join(' AND ')}`
    : `WHERE ${keywordClause}`;

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, user_id, tracking_number, origin, destination, weight, status, estimated_delivery, created_at
     FROM parcels
     ${whereSql}
     ORDER BY created_at DESC`,
    [like, like, like, like, like, like, ...params]
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

export const getAdminsPaged = async (page: number, limit: number) => {
  return toPagedResult(
    page,
    limit,
    async (safeLimit, offset) => {
      const [rows] = await pool.query<mysql.RowDataPacket[]>(
        `SELECT id, username, email, role, status, last_login, created_at, updated_at
         FROM admin_users
         ORDER BY created_at DESC
         LIMIT ${safeLimit} OFFSET ${offset}`
      );
      return rows as any[];
    },
    getAdminsCount
  );
};

export const searchAdmins = async (keyword: string): Promise<any[]> => {
  const like = `%${keyword}%`;
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, username, email, role, status, last_login, created_at, updated_at
     FROM admin_users
     WHERE CAST(id AS CHAR) LIKE ?
       OR username LIKE ?
       OR email LIKE ?
       OR role LIKE ?
       OR status LIKE ?
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
  const [result] = await pool.execute<mysql.ResultSetHeader>('DELETE FROM admin_users WHERE id = ?', [adminId]);
  return result.affectedRows > 0;
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
