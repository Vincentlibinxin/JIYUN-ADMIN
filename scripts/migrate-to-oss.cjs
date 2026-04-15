/**
 * 迁移本地 uploads/parcels/ 中的文件到阿里云 OSS
 * 同时更新数据库中的 image_url
 */
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const envFiles = [
  path.resolve(__dirname, '..', '.env.api'),
  path.resolve(__dirname, '..', '.env'),
];

for (const envFile of envFiles) {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile, override: false });
  }
}

const OSS = require('ali-oss');
const mysql = require('mysql2/promise');

const UPLOAD_DIR = path.resolve(__dirname, '..', 'uploads', 'parcels');

async function main() {
  // 1. 查询数据库中所有包含本地路径的图片 URL
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const [rows] = await conn.query(
    "SELECT id, images FROM parcels WHERE images IS NOT NULL AND images != ''"
  );
  console.log(`数据库中有 ${rows.length} 条包含图片的记录`);

  // 2. 初始化 OSS 客户端
  const ossClient = new OSS({
    region: process.env.OSS_REGION,
    accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    bucket: process.env.OSS_BUCKET,
  });

  // 3. 列出本地文件
  const localFiles = fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR) : [];
  console.log(`本地 uploads/parcels/ 有 ${localFiles.length} 个文件`);

  // 4. 上传本地文件到 OSS 并建立映射: 文件名 -> OSS URL
  const fileMap = {};
  for (const fileName of localFiles) {
    const filePath = path.join(UPLOAD_DIR, fileName);
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) continue;

    const objectName = `parcels/${fileName}`;
    try {
      const result = await ossClient.put(objectName, filePath);
      fileMap[fileName] = result.url;
      console.log(`  ✓ 上传成功: ${fileName} -> ${result.url}`);
    } catch (err) {
      console.error(`  ✗ 上传失败: ${fileName}`, err.message);
    }
  }

  // 5. 更新数据库中的 URL
  let updated = 0;
  for (const row of rows) {
    const imageUrls = row.images.split(',');
    let changed = false;
    const newUrls = imageUrls.map(url => {
      const trimmed = url.trim();
      // 匹配本地路径格式: /uploads/parcels/xxxx.jpg
      const match = trimmed.match(/\/uploads\/parcels\/(.+)$/);
      if (match && fileMap[match[1]]) {
        changed = true;
        return fileMap[match[1]];
      }
      // 已经是完整 URL (http/https) 的跳过
      if (trimmed.startsWith('http')) return trimmed;
      // 只有文件名的情况
      if (fileMap[trimmed]) {
        changed = true;
        return fileMap[trimmed];
      }
      return trimmed;
    });

    if (changed) {
      const newImageUrl = newUrls.join(',');
      await conn.query('UPDATE parcels SET images = ? WHERE id = ?', [newImageUrl, row.id]);
      console.log(`  ✓ 更新 parcel #${row.id}: ${row.images.substring(0, 60)}... -> OSS URL`);
      updated++;
    }
  }

  console.log(`\n完成！上传了 ${Object.keys(fileMap).length} 个文件，更新了 ${updated} 条数据库记录。`);
  await conn.end();
}

main().catch(err => {
  console.error('迁移失败:', err);
  process.exit(1);
});
