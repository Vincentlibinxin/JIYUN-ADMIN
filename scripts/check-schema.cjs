require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const [rows] = await conn.execute('SHOW CREATE TABLE parcels');
  console.log(rows[0]['Create Table']);
  await conn.end();
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
