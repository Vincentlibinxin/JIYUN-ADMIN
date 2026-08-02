import { randomInt } from 'node:crypto';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config({ path: '.env.api' });
dotenv.config();

const RECOGNITION_CHARS = '37AEFHJKMPRTWXY';
const RECOGNITION_WEIGHTS = [2, 3, 5, 7, 11];

const generateRecognitionCode = () => {
  let body = '';
  for (let index = 0; index < 5; index += 1) {
    body += RECOGNITION_CHARS[randomInt(RECOGNITION_CHARS.length)];
  }
  const sum = [...body].reduce(
    (total, char, index) => total + RECOGNITION_CHARS.indexOf(char) * RECOGNITION_WEIGHTS[index],
    0
  );
  return body + RECOGNITION_CHARS[sum % RECOGNITION_CHARS.length];
};

const isValidRecognitionCode = (value) => {
  if (!new RegExp(`^[${RECOGNITION_CHARS}]{6}$`).test(value)) return false;
  const sum = [...value.slice(0, 5)].reduce(
    (total, char, index) => total + RECOGNITION_CHARS.indexOf(char) * RECOGNITION_WEIGHTS[index],
    0
  );
  return value[5] === RECOGNITION_CHARS[sum % RECOGNITION_CHARS.length];
};

const connection = await mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'jiyun',
});

try {
  await connection.beginTransaction();
  const [allRows] = await connection.execute('SELECT id, recognition_code FROM users FOR UPDATE');
  const usedCodes = new Set(allRows.map((row) => row.recognition_code).filter(Boolean));
  const missingRows = allRows.filter((row) => !row.recognition_code);

  for (const row of missingRows) {
    let recognitionCode;
    do {
      recognitionCode = generateRecognitionCode();
    } while (usedCodes.has(recognitionCode));
    usedCodes.add(recognitionCode);

    const [result] = await connection.execute(
      `UPDATE users
       SET recognition_code = ?, updated_at = NOW()
       WHERE id = ? AND (recognition_code IS NULL OR recognition_code = '')`,
      [recognitionCode, row.id]
    );
    if (result.affectedRows !== 1) {
      throw new Error(`会员 ${row.id} 更新失败`);
    }
  }

  await connection.commit();

  const [rows] = await connection.execute(
    'SELECT id, logistics_provider_id, recognition_code FROM users'
  );
  const invalidCount = rows.filter(
    (row) => !isValidRecognitionCode(row.recognition_code || '')
  ).length;
  const seenKeys = new Set();
  let duplicateCount = 0;
  for (const row of rows) {
    const key = `${row.logistics_provider_id ?? 0}:${row.recognition_code}`;
    if (seenKeys.has(key)) duplicateCount += 1;
    seenKeys.add(key);
  }

  console.log(JSON.stringify({
    updated: missingRows.length,
    total: rows.length,
    missing: rows.filter((row) => !row.recognition_code).length,
    invalid: invalidCount,
    duplicates: duplicateCount,
  }));
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}
