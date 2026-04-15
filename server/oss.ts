import OSS from 'ali-oss';
import path from 'path';

let client: OSS | null = null;

function getOssClient(): OSS {
  if (client) return client;
  const region = process.env.OSS_REGION;
  const accessKeyId = process.env.OSS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET;
  const bucket = process.env.OSS_BUCKET;
  if (!region || !accessKeyId || !accessKeySecret || !bucket) {
    throw new Error('[OSS] 缺少必要的环境变量: OSS_REGION, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, OSS_BUCKET');
  }
  client = new OSS({ region, accessKeyId, accessKeySecret, bucket });
  return client;
}

/**
 * 上传文件到阿里云 OSS
 * @param fileBuffer 文件内容
 * @param originalName 原始文件名（用于提取扩展名）
 * @param folder OSS 下的目录前缀，如 "parcels"
 * @returns 可公开访问的 URL
 */
export async function uploadToOss(
  fileBuffer: Buffer,
  originalName: string,
  folder: string = 'parcels'
): Promise<string> {
  const oss = getOssClient();
  const ext = path.extname(originalName);
  const objectName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  const result = await oss.put(objectName, fileBuffer);
  // 优先使用自定义域名
  const customDomain = process.env.OSS_CUSTOM_DOMAIN;
  if (customDomain) {
    return `${customDomain.replace(/\/+$/, '')}/${objectName}`;
  }
  return result.url;
}

/**
 * 为私有 Bucket 中的对象生成临时签名 URL
 * @param url 文件的完整 URL 或 object name
 * @param expires 签名有效时长（秒），默认 1 小时
 * @returns 带签名参数的临时访问 URL
 */
export function signOssUrl(url: string, expires: number = 3600): string {
  const oss = getOssClient();
  let objectName = url;
  try {
    const parsed = new URL(url);
    objectName = parsed.pathname.replace(/^\//, '');
  } catch {
    // 不是完整 URL，当作 object name
  }
  return oss.signatureUrl(objectName, { expires });
}

/**
 * 批量替换 parcel 记录中的图片 URL 为签名 URL
 */
export function signParcelImages<T extends { images?: string | null }>(records: T[]): T[] {
  return records.map(r => {
    if (!r.images) return r;
    const signed = r.images
      .split(',')
      .map(u => u.trim())
      .filter(Boolean)
      .map(u => (u.startsWith('http') ? signOssUrl(u) : u))
      .join(',');
    return { ...r, images: signed };
  });
}

/**
 * 从 OSS 删除文件
 * @param url 文件的完整 URL 或 object name
 */
export async function deleteFromOss(url: string): Promise<void> {
  const oss = getOssClient();
  // 从完整 URL 解析出 object name
  let objectName = url;
  try {
    const parsed = new URL(url);
    objectName = parsed.pathname.replace(/^\//, '');
  } catch {
    // 如果不是完整 URL，当作 object name 处理
  }
  await oss.delete(objectName);
}
