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
  
  await conn.execute('ALTER TABLE parcels DROP FOREIGN KEY fk_parcels_user');
  console.log('1. Dropped FK');
  
  await conn.execute('ALTER TABLE parcels MODIFY COLUMN user_id int DEFAULT NULL');
  console.log('2. Column now nullable');
  
  await conn.execute('ALTER TABLE parcels ADD CONSTRAINT fk_parcels_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL');
  console.log('3. FK re-added with ON DELETE SET NULL');
  
  await conn.end();
  console.log('DONE');
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
