require('dotenv').config();
const mysql = require('mysql2/promise');

const PROVIDER_NAME = '好运物流';

const TRACKING_NUMBERS = [
  '92840542082',
  'M&F0009693214#6#6',
  'MSF0009696814-6-5',
  'MSF0009696814-6-2',
  'MSF0009696814-6-4',
  'MSF0009696814-6-3',
  'MSF0009696814-6-1',
  'TY260106031394',
  'TY260106031393',
  'M00000114',
  'M00000113',
  'M00000117',
  'M00000116',
  'M00000115',
  'M00000112',
  '82343056740002',
  '82342105915',
  '760210046352',
  '76021001746600010001',
  'S70148014238001',
  '82343056740001',
  'YT7595420257889',
  'DPK301826113269',
  '82343056740',
  '78971366793617',
  'YT7595419871472',
  'YT7595420338360',
  'YT7595418152390',
  'YT7595462924079',
  '76021005132200010001',
  'DPK301826089736',
  'SF2054470107419',
  'SF5127259449407',
  'SF5127610702459',
  '76021837058100040001',
  '76021837058100040003',
  '76021837448131040002',
  '760218370581',
  '82485506821',
  '800178507619',
  '30194405563500010001',
];

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

  // 按单号绑定
  const placeholders = TRACKING_NUMBERS.map(() => '?').join(', ');
  const [upd] = await conn.execute(
    `UPDATE parcels SET logistics_provider_id = ?, updated_at = NOW()
     WHERE deleted_at IS NULL AND tracking_number IN (${placeholders})`,
    [providerId, ...TRACKING_NUMBERS]
  );
  console.log(`已将 ${upd.affectedRows} 个包裹绑定到「${PROVIDER_NAME}」`);

  // 检查未匹配到的单号
  const [matched] = await conn.execute(
    `SELECT tracking_number FROM parcels
     WHERE deleted_at IS NULL AND tracking_number IN (${placeholders})`,
    TRACKING_NUMBERS
  );
  const matchedSet = new Set(matched.map(r => r.tracking_number));
  const missing = TRACKING_NUMBERS.filter(t => !matchedSet.has(t));
  if (missing.length > 0) {
    console.log(`\n未找到对应包裹的单号（${missing.length} 个）：`);
    missing.forEach(t => console.log(`  - ${t}`));
  } else {
    console.log('所有单号均已匹配。');
  }

  await conn.end();
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
