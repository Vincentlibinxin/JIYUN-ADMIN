require('dotenv').config();
const mysql = require('mysql2/promise');

const TARGET = 'superadmin';

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    const [supers] = await conn.execute(
      "SELECT id, username, email, role, status, created_at FROM admin_users WHERE role = 'super_admin' AND deleted_at IS NULL ORDER BY created_at ASC"
    );
    console.log('当前超级管理员账号：');
    supers.forEach((r) => console.log(`  id=${r.id} username=${r.username} email=${r.email} status=${r.status}`));

    if (supers.length === 0) {
      console.log('结果：未找到超级管理员账号，未做修改。');
      return;
    }
    if (supers.length > 1) {
      console.log(`结果：存在 ${supers.length} 个超级管理员账号，为避免误改已中止。请指明要改的账号。`);
      return;
    }

    const target = supers[0];
    if (target.username === TARGET) {
      console.log(`结果：超级管理员账号已是 "${TARGET}"，无需修改。`);
      return;
    }

    const [conflicts] = await conn.execute(
      'SELECT id, username, role FROM admin_users WHERE username = ? AND deleted_at IS NULL AND id <> ?',
      [TARGET, target.id]
    );
    if (conflicts.length > 0) {
      console.log(`结果：账号 "${TARGET}" 已被其他账号占用（id=${conflicts[0].id}），未做修改。`);
      return;
    }

    await conn.execute('UPDATE admin_users SET username = ?, updated_at = NOW() WHERE id = ?', [TARGET, target.id]);
    console.log(`结果：已将超级管理员账号由 "${target.username}" 改为 "${TARGET}"（id=${target.id}）。`);
  } finally {
    await conn.end();
  }
})().catch((e) => {
  console.error('ERR:', e.message);
  process.exit(1);
});
