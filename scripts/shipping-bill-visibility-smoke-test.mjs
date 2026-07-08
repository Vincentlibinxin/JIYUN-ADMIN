import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import mysql from 'mysql2/promise';

dotenv.config({ path: '.env.api' });
dotenv.config({ path: '.env', override: true });

const BASE = process.env.ADMIN_API_BASE || 'http://127.0.0.1:3001/api/admin';
const JWT_SECRET = process.env.JWT_SECRET || '';
const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'jiyun_admin',
};

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

const authHeaders = (token) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

const tokenForAdmin = (adminId) => {
  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET 不可用，无法生成联调 token');
  }
  return jwt.sign({ adminId, type: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
};

const pickTwoProviders = (rows) => {
  const grouped = new Map();
  for (const row of rows) {
    const providerId = Number(row.provider_id);
    if (!Number.isInteger(providerId) || providerId <= 0) continue;
    if (!grouped.has(providerId)) grouped.set(providerId, []);
    grouped.get(providerId).push(row);
  }
  const providerIds = Array.from(grouped.keys());
  if (providerIds.length < 2) return null;
  const ownerProviderId = providerIds[0];
  const agentProviderId = providerIds[1];
  const ownerAdmin = grouped.get(ownerProviderId)[0];
  const agentAdmin = grouped.get(agentProviderId)[0];
  return {
    ownerProviderId,
    agentProviderId,
    ownerAdmin,
    agentAdmin,
  };
};

const ensureCanViewShipBills = async (adminId, token, roleLabel) => {
  const res = await fetch(`${BASE}/session`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, `${roleLabel} 读取 session`);
  const data = await res.json();
  const permissions = Array.isArray(data?.admin?.permissions) ? data.admin.permissions : [];
  if (!permissions.includes('route_transport.view')) {
    throw new Error(`${roleLabel}(adminId=${adminId}) 缺少 route_transport.view 权限`);
  }
};

const run = async () => {
  const pool = mysql.createPool(DB_CONFIG);
  const created = {
    routeId: null,
    voyageId: null,
    billId: null,
    grantCreated: false,
    ownerProviderId: null,
    agentProviderId: null,
  };

  try {
    console.log('STEP 1 选择两个不同物流商的管理员...');
    const [admins] = await pool.query(
      `SELECT id, username,
              COALESCE(logistics_provider_id, role_logistics_provider_id) AS provider_id
       FROM admin_users
       WHERE deleted_at IS NULL
         AND status = 'active'
         AND role_scope = 'logistics'
         AND COALESCE(logistics_provider_id, role_logistics_provider_id) IS NOT NULL
       ORDER BY id ASC`
    );
    const picked = pickTwoProviders(admins);
    if (!picked) {
      throw new Error('需要至少两个不同物流商的 active 物流商管理员账号');
    }

    const ownerAdminId = Number(picked.ownerAdmin.id);
    const agentAdminId = Number(picked.agentAdmin.id);
    created.ownerProviderId = Number(picked.ownerProviderId);
    created.agentProviderId = Number(picked.agentProviderId);
    console.log(`INFO: ownerProvider=${created.ownerProviderId} admin=${ownerAdminId}, agentProvider=${created.agentProviderId} admin=${agentAdminId}`);

    const ownerToken = tokenForAdmin(ownerAdminId);
    const agentToken = tokenForAdmin(agentAdminId);

    console.log('STEP 2 校验两个账号具备航线运输查看权限...');
    await ensureCanViewShipBills(ownerAdminId, ownerToken, 'owner物流商');
    await ensureCanViewShipBills(agentAdminId, agentToken, 'agent物流商');

    const now = Date.now();
    const routeName = `SMOKE_ROUTE_${now}`;
    const voyageName = `SMOKE_VOYAGE_${now}`;

    console.log('STEP 3 用 owner 创建测试航线...');
    const routeRes = await fetch(`${BASE}/ship-routes`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        route_name: routeName,
        route_code: `SR${now}`,
        carrier_type: '海运',
        carrier_tool_name: 'SMOKE',
        carrier: 'SMOKE',
        departure_port: 'CN-SZ',
        destination_port: 'MY-KL',
        description: 'smoke test route',
        is_enabled: true,
      }),
    });
    await assertOk(routeRes, '创建测试航线');
    const routeData = await routeRes.json();
    created.routeId = Number(routeData?.route?.id || 0);
    if (!created.routeId) throw new Error('创建航线成功但未返回 route.id');

    console.log('STEP 4 owner 给 agent 授权该航线...');
    const grantRes = await fetch(`${BASE}/ship-routes/${created.routeId}/grants`, {
      method: 'PUT',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({ grantee_provider_ids: [created.agentProviderId] }),
    });
    await assertOk(grantRes, '更新航线授权');
    created.grantCreated = true;

    console.log('STEP 5 用 owner 创建测试班(航)次...');
    const voyageRes = await fetch(`${BASE}/ship-voyages`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        voyage_name: voyageName,
        vessel_name: 'SMOKE_VESSEL',
        etd: '2030-01-01 10:00:00',
        eta: '2030-01-05 10:00:00',
        route_id: created.routeId,
        is_enabled: true,
      }),
    });
    await assertOk(voyageRes, '创建测试班次');
    const voyageData = await voyageRes.json();
    created.voyageId = Number(voyageData?.voyage?.id || 0);
    if (!created.voyageId) throw new Error('创建班次成功但未返回 voyage.id');

    console.log('STEP 6 用 agent 创建提(运)单（关联 owner 班次）...');
    const blNo = `SMOKE-BL-${now}`;
    const billRes = await fetch(`${BASE}/ship-bills`, {
      method: 'POST',
      headers: authHeaders(agentToken),
      body: JSON.stringify({
        bl_no: blNo,
        shipper: 'Smoke Shipper',
        consignee: 'Smoke Consignee',
        notify_party: 'Smoke Notify',
        departure_port: 'CN-SZ',
        destination_port: 'MY-KL',
        package_count: 1,
        weight: 1,
        volume: 0.01,
        voyage_id: created.voyageId,
        description: 'smoke bill from granted agent',
      }),
    });
    await assertOk(billRes, 'agent 创建提(运)单');
    const billData = await billRes.json();
    created.billId = Number(billData?.bill?.id || 0);
    if (!created.billId) throw new Error('创建提(运)单成功但未返回 bill.id');

    console.log('STEP 7 用 owner 读取提(运)单列表，验证可见性...');
    const listRes = await fetch(`${BASE}/ship-bills?page=1&limit=200`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    await assertOk(listRes, 'owner 查询提(运)单列表');
    const listData = await listRes.json();
    const list = Array.isArray(listData?.data) ? listData.data : [];
    const found = list.find((row) => Number(row?.id) === created.billId);
    if (!found) {
      throw new Error(`owner 未看到 agent 创建的提(运)单，billId=${created.billId}`);
    }
    console.log(`PASS: owner 成功看到 agent 创建提(运)单，billId=${created.billId}`);

    console.log('STEP 8 用 owner 搜索提(运)单，验证搜索可见性...');
    const searchRes = await fetch(`${BASE}/ship-bills/search?q=${encodeURIComponent(blNo)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    await assertOk(searchRes, 'owner 搜索提(运)单');
    const searchData = await searchRes.json();
    const searched = Array.isArray(searchData?.data) ? searchData.data : [];
    const hit = searched.find((row) => Number(row?.id) === created.billId);
    if (!hit) {
      throw new Error(`owner 搜索未命中 agent 创建提(运)单，billId=${created.billId}`);
    }
    console.log('PASS: 搜索可见性通过');

    console.log('DONE: 提(运)单跨代理可见性冒烟通过');
  } finally {
    const conn = await pool.getConnection();
    try {
      console.log('CLEANUP: 清理测试数据...');
      if (created.billId) {
        await conn.execute('DELETE FROM shipping_bills WHERE id = ?', [created.billId]);
      }
      if (created.voyageId) {
        await conn.execute('DELETE FROM shipping_voyages WHERE id = ?', [created.voyageId]);
      }
      if (created.grantCreated && created.routeId && created.ownerProviderId && created.agentProviderId) {
        await conn.execute(
          'DELETE FROM shipping_route_grants WHERE route_id = ? AND owner_provider_id = ? AND grantee_provider_id = ?',
          [created.routeId, created.ownerProviderId, created.agentProviderId]
        );
      }
      if (created.routeId) {
        await conn.execute('DELETE FROM shipping_routes WHERE id = ?', [created.routeId]);
      }
    } finally {
      conn.release();
      await pool.end();
    }
  }
};

run().catch((err) => {
  console.error('FAILED:', err?.message || err);
  process.exitCode = 1;
});
