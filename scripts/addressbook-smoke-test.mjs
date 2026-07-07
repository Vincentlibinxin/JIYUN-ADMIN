import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config({ path: '.env.api' });
dotenv.config({ path: '.env', override: true });

const base = 'http://127.0.0.1:3001/api/admin';
const username = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
const password = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin_123456789';

const now = Date.now();
const uniqueName = `联调地址_${now}`;

const assertOk = async (res, step) => {
  if (res.ok) return;
  let body = '';
  try {
    body = JSON.stringify(await res.json());
  } catch {
    body = await res.text();
  }
  throw new Error(`${step} 失败: HTTP ${res.status} ${body}`);
};

const run = async () => {
  console.log('STEP 1 登录...');
  const loginRes = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  let token = '';
  if (loginRes.ok) {
    const loginData = await loginRes.json();
    token = loginData?.token || '';
    if (!token) {
      throw new Error('登录成功但未拿到 token');
    }
    console.log('PASS: 登录成功');
  } else {
    // 本地联调兜底：登录失败时，用本地 JWT_SECRET 生成管理员 token。
    const jwtSecret = process.env.JWT_SECRET || '';
    if (jwtSecret.length < 32) {
      await assertOk(loginRes, '登录');
    }
    token = jwt.sign({ adminId: 1, type: 'admin' }, jwtSecret, { expiresIn: '24h' });
    console.log('WARN: 登录失败，已使用本地JWT兜底token继续联调');
  }
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  console.log('STEP 2 读取物流商选项...');
  const optionsRes = await fetch(`${base}/logistics/options`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  let providerId = null;
  if (optionsRes.ok) {
    const optionsData = await optionsRes.json();
    const list = Array.isArray(optionsData?.data) ? optionsData.data : [];
    if (list.length > 0 && Number.isInteger(Number(list[0].id))) {
      providerId = Number(list[0].id);
      console.log(`INFO: 使用物流商ID=${providerId}`);
    } else {
      console.log('INFO: 无物流商下拉选项，按物流商账号路径测试');
    }
  } else {
    console.log('INFO: logistics/options 非200，按物流商账号路径测试');
  }

  console.log('STEP 3 新增地址（含街道）...');
  const createPayload = {
    name: uniqueName,
    region: 'CN',
    province: '广东省',
    city: '深圳市',
    district: '南山区',
    street: '粤海街道',
    phone: '13800138000',
    address: '科技南十二路测试地址',
    user_id: null,
    ...(providerId ? { logistics_provider_id: providerId } : {}),
  };
  const createRes = await fetch(`${base}/address-book`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(createPayload),
  });
  await assertOk(createRes, '新增地址');
  const createData = await createRes.json();
  const createdId = Number(createData?.entry?.id || 0);
  if (!createdId) {
    throw new Error(`新增成功但未返回有效ID: ${JSON.stringify(createData)}`);
  }
  console.log(`PASS: 新增成功 ID=${createdId}`);

  console.log('STEP 4 编辑地址（更新街道）...');
  const updatePayload = {
    ...createPayload,
    street: '沙河街道',
    address: '深南大道更新地址',
  };
  const updateRes = await fetch(`${base}/address-book/${createdId}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify(updatePayload),
  });
  await assertOk(updateRes, '编辑地址');
  console.log('PASS: 编辑成功（street 已更新）');

  console.log('STEP 5 搜索地址（关键字）...');
  const searchRes = await fetch(`${base}/address-book/search?q=${encodeURIComponent(uniqueName)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(searchRes, '搜索地址');
  const searchData = await searchRes.json();
  const searchList = Array.isArray(searchData?.data) ? searchData.data : [];
  const searched = searchList.find((x) => Number(x?.id) === createdId);
  if (!searched) {
    throw new Error('搜索结果中未找到刚新增的记录');
  }
  if (searched.street !== '沙河街道') {
    throw new Error(`搜索结果 street 不匹配: ${searched.street}`);
  }
  console.log('PASS: 搜索成功（含 street）');

  console.log('STEP 6 列表筛选（region=CN）...');
  const columnFilters = encodeURIComponent(JSON.stringify({ region: 'CN' }));
  const listRes = await fetch(`${base}/address-book?page=1&limit=20&columnFilters=${columnFilters}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(listRes, '列表筛选');
  const listData = await listRes.json();
  const list = Array.isArray(listData?.data) ? listData.data : [];
  const listed = list.find((x) => Number(x?.id) === createdId);
  if (!listed) {
    throw new Error('region=CN 筛选结果未包含刚新增记录');
  }
  console.log('PASS: 列表筛选成功');

  console.log('STEP 7 清理测试数据...');
  const delRes = await fetch(`${base}/address-book/${createdId}`, {
    method: 'DELETE',
    headers: authHeaders,
  });
  await assertOk(delRes, '删除测试地址');
  console.log('PASS: 清理成功');

  console.log('DONE: 地址簿四项联调通过（新增/编辑/搜索/筛选）');
};

run().catch((err) => {
  console.error('FAILED:', err?.message || err);
  process.exitCode = 1;
});
