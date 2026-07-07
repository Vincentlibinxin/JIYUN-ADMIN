import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config({ path: '.env.api' });
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'jiyun_admin',
});

try {
  const [rows] = await pool.query('SELECT id, username, role, status FROM admin_users WHERE deleted_at IS NULL ORDER BY id ASC');
  console.log(JSON.stringify(rows, null, 2));
} finally {
  await pool.end();
}
