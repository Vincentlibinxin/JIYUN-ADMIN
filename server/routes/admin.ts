import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Request, Response, Router } from 'express';
import jwt from 'jsonwebtoken';
import {
  createAdmin,
  deleteAdmin,
  getAdminAuditLogsPaged,
  getAdminById,
  deleteUser,
  getAdminByUsername,
  getAdminsPaged,
  getOrdersPaged,
  getParcelsPaged,
  getSmsPaged,
  getUsersPaged,
  searchUsers,
  logAdminAudit,
  updateAdminLastLogin,
  updateAdminStatus,
  updateOrderStatus,
  updateParcelStatus,
} from '../db';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || '';
const SESSION_COOKIE_NAME = 'admin_session';
const CSRF_COOKIE_NAME = 'admin_csrf';
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1';

if (!JWT_SECRET || JWT_SECRET.length < 32 || JWT_SECRET === 'please-change-this-secret') {
  throw new Error('[API] JWT_SECRET is missing or too weak.');
}

const ROLE_SET = new Set(['admin', 'super_admin']);
const ADMIN_STATUS_SET = new Set(['active', 'disabled']);
const ORDER_STATUS_SET = new Set(['pending', 'paid', 'processing', 'shipped', 'completed', 'cancelled']);
const PARCEL_STATUS_SET = new Set(['pending', 'received', 'in_transit', 'arrived', 'delivered', 'exception']);

const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 8;

type LoginAttemptState = {
  count: number;
  windowStart: number;
  blockedUntil: number;
};

const loginAttempts = new Map<string, LoginAttemptState>();

const parseCookies = (cookieHeader: string | undefined): Record<string, string> => {
  if (!cookieHeader) return {};
  const output: Record<string, string> = {};
  for (const segment of cookieHeader.split(';')) {
    const [rawKey, ...rawValue] = segment.trim().split('=');
    if (!rawKey) continue;
    output[rawKey] = decodeURIComponent(rawValue.join('='));
  }
  return output;
};

const getRequestIp = (req: Request): string => {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const raw = forwarded || req.ip || req.socket.remoteAddress || 'unknown';
  return raw.replace('::ffff:', '');
};

const issueCsrfToken = (): string => {
  return crypto.randomBytes(24).toString('hex');
};

const setAuthCookies = (res: Response, token: string, csrfToken: string): void => {
  const common = {
    sameSite: 'lax' as const,
    secure: COOKIE_SECURE,
    path: '/api/admin',
    maxAge: 24 * 60 * 60 * 1000,
  };

  res.cookie(SESSION_COOKIE_NAME, token, {
    ...common,
    httpOnly: true,
  });

  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    ...common,
    httpOnly: false,
  });
};

const clearAuthCookies = (res: Response): void => {
  const common = {
    sameSite: 'lax' as const,
    secure: COOKIE_SECURE,
    path: '/api/admin',
  };
  res.clearCookie(SESSION_COOKIE_NAME, common);
  res.clearCookie(CSRF_COOKIE_NAME, common);
};

const getRequestToken = (req: Request): string | null => {
  const headerToken = req.headers.authorization?.split(' ')[1];
  if (headerToken) return headerToken;
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME] || null;
};

const toId = (raw: string): number | null => {
  const normalized = Number(raw);
  if (!Number.isInteger(normalized) || normalized <= 0) return null;
  return normalized;
};

const getLoginKey = (req: Request, username: string): string => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return `${ip}:${username.toLowerCase()}`;
};

const isLoginBlocked = (key: string): boolean => {
  const now = Date.now();
  const state = loginAttempts.get(key);
  if (!state) return false;
  if (state.blockedUntil > now) return true;
  if (now - state.windowStart > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
    return false;
  }
  return false;
};

const getLoginBlockRemainingMs = (key: string): number => {
  const now = Date.now();
  const state = loginAttempts.get(key);
  if (!state) return 0;
  return Math.max(0, state.blockedUntil - now);
};

const markLoginFailure = (key: string): void => {
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || now - current.windowStart > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, {
      count: 1,
      windowStart: now,
      blockedUntil: 0,
    });
    return;
  }

  current.count += 1;
  if (current.count >= MAX_LOGIN_ATTEMPTS) {
    current.blockedUntil = now + LOGIN_BLOCK_MS;
  }
  loginAttempts.set(key, current);
};

const clearLoginFailures = (key: string): void => {
  loginAttempts.delete(key);
};

const csrfGuard = (req: Request, res: Response, next: () => void): void => {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    next();
    return;
  }

  const csrfHeader = String(req.headers['x-csrf-token'] || '').trim();
  const cookies = parseCookies(req.headers.cookie);
  const csrfCookie = String(cookies[CSRF_COOKIE_NAME] || '').trim();

  if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
    res.status(403).json({ error: 'CSRF 校验失败' });
    return;
  }

  next();
};

interface AdminRequest extends Request {
  adminId?: number;
  adminRole?: string;
}

const adminAuth = (req: AdminRequest, res: Response, next: () => void): void => {
  const token = getRequestToken(req);
  if (!token) {
    res.status(401).json({ error: '未授权' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { adminId: number; type: string };
    if (decoded.type !== 'admin') {
      res.status(403).json({ error: '权限不足' });
      return;
    }
    req.adminId = decoded.adminId;
    next();
  } catch {
    res.status(401).json({ error: '令牌无效或已过期' });
  }
};

const requireSuperAdmin = async (req: AdminRequest, res: Response, next: () => void): Promise<void> => {
  if (!req.adminId) {
    res.status(401).json({ error: '未授权' });
    return;
  }
  const admin = await getAdminById(req.adminId);
  if (!admin || admin.status !== 'active') {
    await logAdminAudit({
      adminId: req.adminId,
      action: 'admin.role_check',
      result: 'denied',
      ip: getRequestIp(req),
      detail: 'inactive_or_missing_admin',
    });
    res.status(401).json({ error: '管理员状态异常' });
    return;
  }
  if (admin.role !== 'super_admin') {
    await logAdminAudit({
      adminId: req.adminId,
      action: 'admin.role_check',
      result: 'denied',
      ip: getRequestIp(req),
      detail: `role=${admin.role}`,
    });
    res.status(403).json({ error: '仅超级管理员可执行此操作' });
    return;
  }
  req.adminRole = admin.role;
  next();
};

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      res.status(400).json({ error: '用户名和密码不能为空' });
      return;
    }

    const loginKey = getLoginKey(req, username);
    const requestIp = getRequestIp(req);
    if (isLoginBlocked(loginKey)) {
      const remainingMs = getLoginBlockRemainingMs(loginKey);
      const retryAfterSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
      const retryAfterAt = new Date(Date.now() + remainingMs).toISOString();

      await logAdminAudit({
        action: 'auth.login',
        result: 'denied',
        ip: requestIp,
        detail: `blocked username=${username}`,
      });
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        error: '登录尝试过于频繁，请稍后再试',
        retryAfterSeconds,
        retryAfterAt,
      });
      return;
    }

    const admin = await getAdminByUsername(username);
    if (!admin) {
      markLoginFailure(loginKey);
      await logAdminAudit({
        action: 'auth.login',
        result: 'failed',
        ip: requestIp,
        detail: `unknown_username=${username}`,
      });
      res.status(401).json({ error: '用户名或密码错误' });
      return;
    }
    if (admin.status !== 'active') {
      markLoginFailure(loginKey);
      await logAdminAudit({
        adminId: admin.id,
        action: 'auth.login',
        result: 'denied',
        ip: requestIp,
        detail: `status=${admin.status}`,
      });
      res.status(403).json({ error: '账号已停用' });
      return;
    }

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) {
      markLoginFailure(loginKey);
      await logAdminAudit({
        adminId: admin.id,
        action: 'auth.login',
        result: 'failed',
        ip: requestIp,
        detail: 'invalid_password',
      });
      res.status(401).json({ error: '用户名或密码错误' });
      return;
    }

    clearLoginFailures(loginKey);
    await updateAdminLastLogin(admin.id);
    const token = jwt.sign({ adminId: admin.id, type: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    const csrfToken = issueCsrfToken();
    setAuthCookies(res, token, csrfToken);

    await logAdminAudit({
      adminId: admin.id,
      action: 'auth.login',
      result: 'success',
      ip: requestIp,
      detail: 'login_success',
    });

    res.json({
      message: '登录成功',
      csrfToken,
      admin: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.get('/session', adminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  if (!req.adminId) {
    res.status(401).json({ error: '未授权' });
    return;
  }
  const admin = await getAdminById(req.adminId);
  if (!admin || admin.status !== 'active') {
    clearAuthCookies(res);
    res.status(401).json({ error: '会话无效' });
    return;
  }

  const cookies = parseCookies(req.headers.cookie);
  const csrfToken = cookies[CSRF_COOKIE_NAME] || issueCsrfToken();
  if (!cookies[CSRF_COOKIE_NAME]) {
    const token = getRequestToken(req);
    if (token) {
      setAuthCookies(res, token, csrfToken);
    }
  }

  res.json({
    admin: {
      id: admin.id,
      username: admin.username,
      email: admin.email,
      role: admin.role,
    },
    csrfToken,
  });
});

router.post('/logout', adminAuth, csrfGuard, async (_req: AdminRequest, res: Response): Promise<void> => {
  await logAdminAudit({
    adminId: _req.adminId,
    action: 'auth.logout',
    result: 'success',
    ip: getRequestIp(_req),
    detail: 'logout_success',
  });
  clearAuthCookies(res);
  res.json({ message: '已登出' });
});

router.post('/session/clear', async (_req: Request, res: Response): Promise<void> => {
  clearAuthCookies(res);
  res.json({ message: '会话已清理' });
});

router.get('/audit-logs', adminAuth, requireSuperAdmin, async (req: AdminRequest, res: Response): Promise<void> => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 50);
  const result = await getAdminAuditLogsPaged(page, limit);
  res.json({
    data: result.data,
    pagination: {
      page,
      limit,
      total: result.total,
      pages: result.pages,
    },
  });
});

router.get('/users', adminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 10);
  const result = await getUsersPaged(page, limit);
  res.json({
    data: result.data,
    pagination: {
      page,
      limit,
      total: result.total,
      pages: result.pages,
    },
  });
});

router.get('/users/search', adminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const keyword = String(req.query.q || '').trim();
  if (!keyword) {
    res.status(400).json({ error: '搜索关键词不能为空' });
    return;
  }
  const data = await searchUsers(keyword);
  res.json({ data, count: data.length });
});

router.delete('/users/:id', adminAuth, csrfGuard, async (req: AdminRequest, res: Response): Promise<void> => {
  const ok = await deleteUser(Number(req.params.id));
  if (!ok) {
    res.status(404).json({ error: '用户不存在' });
    return;
  }
  res.json({ message: '用户已删除' });
});

router.get('/orders', adminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 10);
  const result = await getOrdersPaged(page, limit);
  res.json({
    data: result.data,
    pagination: {
      page,
      limit,
      total: result.total,
      pages: result.pages,
    },
  });
});

router.patch('/orders/:id', adminAuth, csrfGuard, async (req: AdminRequest, res: Response): Promise<void> => {
  const status = String(req.body?.status || '').trim();
  if (!ORDER_STATUS_SET.has(status)) {
    res.status(400).json({ error: '订单状态不合法' });
    return;
  }
  const orderId = toId(req.params.id);
  if (!orderId) {
    res.status(400).json({ error: '订单ID不合法' });
    return;
  }
  const ok = await updateOrderStatus(orderId, status);
  if (!ok) {
    res.status(404).json({ error: '订单不存在' });
    return;
  }
  res.json({ message: '订单状态已更新', orderId, status });
});

router.get('/sms', adminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 10);
  const result = await getSmsPaged(page, limit);
  res.json({
    data: result.data,
    pagination: {
      page,
      limit,
      total: result.total,
      pages: result.pages,
    },
  });
});

router.get('/parcels', adminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 10);
  const result = await getParcelsPaged(page, limit);
  res.json({
    data: result.data,
    pagination: {
      page,
      limit,
      total: result.total,
      pages: result.pages,
    },
  });
});

router.patch('/parcels/:id', adminAuth, csrfGuard, async (req: AdminRequest, res: Response): Promise<void> => {
  const status = String(req.body?.status || '').trim();
  if (!PARCEL_STATUS_SET.has(status)) {
    res.status(400).json({ error: '包裹状态不合法' });
    return;
  }
  const parcelId = toId(req.params.id);
  if (!parcelId) {
    res.status(400).json({ error: '包裹ID不合法' });
    return;
  }
  const ok = await updateParcelStatus(parcelId, status);
  if (!ok) {
    res.status(404).json({ error: '包裹不存在' });
    return;
  }
  res.json({ message: '包裹状态已更新', parcelId, status });
});

router.get('/admins', adminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 10);
  const result = await getAdminsPaged(page, limit);
  res.json({
    data: result.data,
    pagination: {
      page,
      limit,
      total: result.total,
      pages: result.pages,
    },
  });
});

router.post('/admins', adminAuth, csrfGuard, requireSuperAdmin, async (req: AdminRequest, res: Response): Promise<void> => {
  const { username, password, email, role } = req.body as {
    username?: string;
    password?: string;
    email?: string;
    role?: string;
  };

  if (!username || !password || !email) {
    await logAdminAudit({
      adminId: req.adminId,
      action: 'admin.create',
      result: 'failed',
      ip: getRequestIp(req),
      detail: 'missing_required_fields',
    });
    res.status(400).json({ error: '用户名、密码和邮箱不能为空' });
    return;
  }

  if (password.length < 12) {
    await logAdminAudit({
      adminId: req.adminId,
      action: 'admin.create',
      result: 'failed',
      ip: getRequestIp(req),
      detail: 'weak_password',
    });
    res.status(400).json({ error: '密码至少需要 12 位' });
    return;
  }

  const normalizedRole = String(role || 'admin').trim();
  if (!ROLE_SET.has(normalizedRole)) {
    await logAdminAudit({
      adminId: req.adminId,
      action: 'admin.create',
      result: 'failed',
      ip: getRequestIp(req),
      detail: `invalid_role=${normalizedRole}`,
    });
    res.status(400).json({ error: '管理员角色不合法' });
    return;
  }

  const admin = await createAdmin({
    username: username.trim(),
    password,
    email: email.trim(),
    role: normalizedRole,
  });

  if (!admin) {
    await logAdminAudit({
      adminId: req.adminId,
      action: 'admin.create',
      result: 'failed',
      ip: getRequestIp(req),
      detail: `duplicate_username=${username.trim()}`,
    });
    res.status(409).json({ error: '管理员已存在' });
    return;
  }

  await logAdminAudit({
    adminId: req.adminId,
    action: 'admin.create',
    targetType: 'admin_user',
    targetId: admin.id,
    result: 'success',
    ip: getRequestIp(req),
    detail: `created_username=${admin.username}`,
  });

  res.status(201).json({ message: '管理员已创建', admin });
});

router.patch('/admins/:id', adminAuth, csrfGuard, requireSuperAdmin, async (req: AdminRequest, res: Response): Promise<void> => {
  const status = String(req.body?.status || '').trim();
  if (!ADMIN_STATUS_SET.has(status)) {
    await logAdminAudit({
      adminId: req.adminId,
      action: 'admin.update_status',
      result: 'failed',
      ip: getRequestIp(req),
      detail: `invalid_status=${status}`,
    });
    res.status(400).json({ error: '管理员状态不合法' });
    return;
  }
  const adminId = toId(req.params.id);
  if (!adminId) {
    await logAdminAudit({
      adminId: req.adminId,
      action: 'admin.update_status',
      result: 'failed',
      ip: getRequestIp(req),
      detail: 'invalid_admin_id',
    });
    res.status(400).json({ error: '管理员ID不合法' });
    return;
  }

  if (adminId === req.adminId) {
    await logAdminAudit({
      adminId: req.adminId,
      action: 'admin.update_status',
      targetType: 'admin_user',
      targetId: adminId,
      result: 'denied',
      ip: getRequestIp(req),
      detail: 'self_status_change_blocked',
    });
    res.status(400).json({ error: '不能修改当前登录账号状态' });
    return;
  }

  const ok = await updateAdminStatus(adminId, status);
  if (!ok) {
    await logAdminAudit({
      adminId: req.adminId,
      action: 'admin.update_status',
      targetType: 'admin_user',
      targetId: adminId,
      result: 'failed',
      ip: getRequestIp(req),
      detail: 'target_not_found',
    });
    res.status(404).json({ error: '管理员不存在' });
    return;
  }

  await logAdminAudit({
    adminId: req.adminId,
    action: 'admin.update_status',
    targetType: 'admin_user',
    targetId: adminId,
    result: 'success',
    ip: getRequestIp(req),
    detail: `status=${status}`,
  });
  res.json({ message: '管理员状态已更新', adminId, status });
});

router.delete('/admins/:id', adminAuth, csrfGuard, requireSuperAdmin, async (req: AdminRequest, res: Response): Promise<void> => {
  const adminId = toId(req.params.id);
  if (!adminId) {
    await logAdminAudit({
      adminId: req.adminId,
      action: 'admin.delete',
      result: 'failed',
      ip: getRequestIp(req),
      detail: 'invalid_admin_id',
    });
    res.status(400).json({ error: '管理员ID不合法' });
    return;
  }

  if (adminId === req.adminId) {
    await logAdminAudit({
      adminId: req.adminId,
      action: 'admin.delete',
      targetType: 'admin_user',
      targetId: adminId,
      result: 'denied',
      ip: getRequestIp(req),
      detail: 'self_delete_blocked',
    });
    res.status(400).json({ error: '不能删除当前登录账号' });
    return;
  }

  const ok = await deleteAdmin(adminId);
  if (!ok) {
    await logAdminAudit({
      adminId: req.adminId,
      action: 'admin.delete',
      targetType: 'admin_user',
      targetId: adminId,
      result: 'failed',
      ip: getRequestIp(req),
      detail: 'target_not_found',
    });
    res.status(404).json({ error: '管理员不存在' });
    return;
  }

  await logAdminAudit({
    adminId: req.adminId,
    action: 'admin.delete',
    targetType: 'admin_user',
    targetId: adminId,
    result: 'success',
    ip: getRequestIp(req),
    detail: 'admin_deleted',
  });
  res.json({ message: '管理员已删除', adminId });
});

export default router;