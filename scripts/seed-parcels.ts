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

const origins = ['台北仓', '深圳仓', '广州仓', '香港仓', '东京仓'];
const destinations = ['台北市', '新北市', '桃园市', '台中市', '高雄市', '台南市'];
const statuses = ['pending', 'received', 'in_transit', 'arrived', 'delivered', 'exception'];

const randFrom = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

const randWeight = (): number => Number((Math.random() * 9.5 + 0.3).toFixed(2));

const randFutureDatetime = (): string => {
  const now = new Date();
  const plusDays = Math.floor(Math.random() * 25) + 1;
  now.setDate(now.getDate() + plusDays);
  return now.toISOString().slice(0, 19).replace('T', ' ');
};

const genTrackingNumber = (index: number): string => {
  const ts = Date.now().toString().slice(-8);
  const rand = Math.floor(Math.random() * 900000 + 100000);
  return `JY${ts}${index.toString().padStart(3, '0')}${rand}`;
};

const main = async () => {
  const amountArg = Number(process.argv[2] || 100);
  const amount = Number.isFinite(amountArg) && amountArg > 0 ? Math.floor(amountArg) : 100;

  const [userRows] = await pool.query<mysql.RowDataPacket[]>('SELECT id FROM users ORDER BY id ASC');
  const userIds = userRows.map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0);

  if (userIds.length === 0) {
    console.warn('[seed-parcels] users 表暂无数据，将使用 user_id=1 作为逻辑关联值。');
  }

  const values: Array<[number, string, string, string, number, string, string]> = [];

  for (let i = 0; i < amount; i += 1) {
    const userId = userIds.length > 0 ? randFrom(userIds) : 1;
    values.push([
      userId,
      genTrackingNumber(i),
      randFrom(origins),
      randFrom(destinations),
      randWeight(),
      randFrom(statuses),
      randFutureDatetime(),
    ]);
  }

  const sql = `
    INSERT INTO parcels (
      user_id,
      tracking_number,
      origin,
      destination,
      weight,
      status,
      estimated_delivery
    ) VALUES ?
  `;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(sql, [values]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }

  console.log(`[seed-parcels] 已插入 ${amount} 条 parcels 随机数据。`);
};

main().catch((error) => {
  console.error('[seed-parcels] 执行失败:', error);
  process.exit(1);
});
