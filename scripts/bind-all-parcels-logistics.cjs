require('dotenv').config();
const mysql = require('mysql2/promise');

const PROVIDER_NAME = '俊富物流';
const updateAll = process.argv.includes('--all');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  // 查找或创建物流商
  let [rows] = await conn.execute(
    'SELECT id FROM logistics_providers WHERE name = ? AND deleted_at IS NULL LIMIT 1',
    [PROVIDER_NAME]
  );
  let providerId;
  if (rows.length > 0) {
    providerId = rows[0].id;
    console.log(`物流商「${PROVIDER_NAME}」已存在，id=${providerId}`);
  } else {
    const [result] = await conn.execute(
      "INSERT INTO logistics_providers (name, status) VALUES (?, 'active')",
      [PROVIDER_NAME]
    );
    providerId = result.insertId;
    console.log(`已创建物流商「${PROVIDER_NAME}」，id=${providerId}`);
  }

  // 默认只绑定今天创建的包裹；传 --all 可全量绑定
  const sql = updateAll
    ? 'UPDATE parcels SET logistics_provider_id = ?, updated_at = NOW() WHERE deleted_at IS NULL'
    : 'UPDATE parcels SET logistics_provider_id = ?, updated_at = NOW() WHERE deleted_at IS NULL AND DATE(created_at) = CURDATE()';
  const [upd] = await conn.execute(sql, [providerId]);
  if (updateAll) {
    console.log(`已将 ${upd.affectedRows} 个包裹绑定到「${PROVIDER_NAME}」`);
  } else {
    console.log(`已将今天创建的 ${upd.affectedRows} 个包裹绑定到「${PROVIDER_NAME}」`);
  }

  await conn.end();
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
