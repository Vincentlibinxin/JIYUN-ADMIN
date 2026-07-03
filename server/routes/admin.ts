import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Request, Response, Router } from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { uploadToOss, signParcelImages } from '../oss';
import { ALL_PERMISSION_CODES, LOGISTICS_ALLOWED_PERMISSIONS, PERMISSIONS, PermissionCode } from '../permissions';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import {
  batchDeleteAdmins,
  batchDeleteOrders,
  batchDeleteParcels,
  batchUpdateParcelsLogisticsProvider,
  batchDeleteSms,
  batchDeleteUsers,
  createAdmin,
  countActiveSuperAdmins,
  createParcelInbound,
  deleteAdmin,
  deleteOrder,
  deleteParcel,
  getParcelOwnerProviderId,
  getUserOwnerProviderId,
  getOrderOwnerProviderId,
  deleteSms,
  getAdminAuditLogsPaged,
  getAdminById,
  deleteUser,
  getAdminByUsername,
  getPermissionsForRoleFromDb,
  roleExists,
  getRoleNameByCode,
  getRoleRowByCode,
  listRolesWithPermissions,
  createRoleWithPermissions,
  updateRoleWithPermissions,
  deleteRole,
  getAdminsPaged,
  getOrdersPaged,
  getParcelItems,
  getParcelsPaged,
  getParcelsForExport,
  getParcelStatusCounts,
  getParcelStatusLogs,
  getStatusLogsPaged,
  searchAdmins,
  searchOrders,
  searchParcels,
  searchSms,
  getSmsPaged,
  getUsersPaged,
  searchUsersPaged,
  updateUser,
  updateAdminAccount,
  logAdminAudit,
  updateAdminLastLogin,
  updateAdminStatus,
  updateOrderStatus,
  updateParcel,
  updateParcelStatus,
  getLogisticsProvidersPaged,
  searchLogisticsProviders,
  getActiveLogisticsProviders,
  createLogisticsProvider,
  getLogisticsProviderByCode,
  getLogisticsProviderNameById,
  getLogisticsProviderCodeById,
  ensureLogisticsInitialAccess,
  updateLogisticsProvider,
  deleteLogisticsProvider,
  batchDeleteLogisticsProviders,
  getStorageBinsPaged,
  searchStorageBins,
  findDuplicateStorageBin,
  createStorageBin,
  getStorageBinById,
  updateStorageBin,
  deleteStorageBin,
  batchDeleteStorageBins,
  getParcelStatusesPaged,
  searchParcelStatuses,
  getParcelStatusById,
  getEnabledParcelStatuses,
  getEnabledParcelStatusCodesByType,
  findParcelStatusConflict,
  createParcelStatus,
  updateParcelStatusDict,
  deleteParcelStatus,
  batchDeleteParcelStatuses,
  PARCEL_STATUS_TYPE_SET,
} from '../db';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || '';

// Auto-wrap async route handlers to prevent unhandled rejections from crashing the server
const origRoute = router.route.bind(router);
router.route = function patchedRoute(path: string) {
  const route = origRoute(path);
  for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
    const orig = route[method].bind(route);
    (route as any)[method] = function (...handlers: any[]) {
      const wrapped = handlers.map((h: any) =>
        typeof h === 'function' && h.constructor.name === 'AsyncFunction'
          ? (req: Request, res: Response, next: any) =>
              h(req, res, next).catch((err: any) => {
                console.error('[API] route error:', err);
                if (!res.headersSent) res.status(500).json({ error: '服务器内部错误' });
              })
          : h
      );
      return orig(...wrapped);
    };
  }
  return route;
};
for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
  const orig = (router as any)[method].bind(router);
  (router as any)[method] = function (path: string, ...handlers: any[]) {
    const wrapped = handlers.map((h: any) =>
      typeof h === 'function' && h.constructor.name === 'AsyncFunction'
        ? (req: Request, res: Response, next: any) =>
            h(req, res, next).catch((err: any) => {
              console.error('[API] route error:', err);
              if (!res.headersSent) res.status(500).json({ error: '服务器内部错误' });
            })
        : h
    );
    return orig(path, ...wrapped);
  };
}

const parseJsonQuery = <T>(raw: unknown): T | undefined => {
  if (!raw || typeof raw !== 'string') return undefined;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed as T : undefined;
  } catch {
    return undefined;
  }
};
const SESSION_COOKIE_NAME = 'admin_session';
const CSRF_COOKIE_NAME = 'admin_csrf';
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1';

if (!JWT_SECRET || JWT_SECRET.length < 32 || JWT_SECRET === 'please-change-this-secret') {
  throw new Error('[API] JWT_SECRET is missing or too weak.');
}

const ADMIN_STATUS_SET = new Set(['active', 'disabled']);
const ORDER_STATUS_SET = new Set(['pending', 'paid', 'processing', 'shipped', 'completed', 'cancelled']);
// 包裹货物态/信息态的合法值以《包裹状态字典》为准，由 getEnabledParcelStatusCodesByType 动态校验。

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

const normalizeRoleScope = (raw: unknown): 'platform' | 'logistics' => {
  return String(raw || '').trim().toLowerCase() === 'logistics' ? 'logistics' : 'platform';
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

  // Bearer Token 认证天然免疫 CSRF，跳过校验（移动端适配）
  if (req.headers.authorization?.startsWith('Bearer ')) {
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
  adminPermissions?: PermissionCode[];
  adminScope?: 'platform' | 'logistics';
  adminLogisticsProviderId?: number | null;
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

// 管理员增改删权限：平台作用域仅超级管理员可操作；物流商作用域凭 admin.* 权限放行，
// 具体“只能操作本物流商账号”的归属校验在各 handler 内用 getActorProviderFilter/denyCrossProvider 完成。
// 依赖前置的 requirePermission 已填充 req.adminScope / req.adminRole。
const requireAdminManage = async (req: AdminRequest, res: Response, next: () => void): Promise<void> => {
  if (req.adminScope === undefined) {
    const permissions = await loadActorContext(req, res);
    if (!permissions) return;
  }
  if (req.adminScope === 'platform' && req.adminRole !== 'super_admin') {
    await logAdminAudit({
      adminId: req.adminId,
      action: 'admin.role_check',
      result: 'denied',
      ip: getRequestIp(req),
      detail: `role=${req.adminRole} require=super_admin`,
    });
    res.status(403).json({ error: '仅超级管理员可执行此操作' });
    return;
  }
  next();
};

const loadActorContext = async (req: AdminRequest, res: Response): Promise<PermissionCode[] | null> => {
  if (!req.adminId) {
    res.status(401).json({ error: '未授权' });
    return null;
  }
  const admin = await getAdminById(req.adminId);
  if (!admin || admin.status !== 'active') {
    await logAdminAudit({
      adminId: req.adminId,
      action: 'admin.permission_check',
      result: 'denied',
      ip: getRequestIp(req),
      detail: 'inactive_or_missing_admin',
    });
    res.status(401).json({ error: '管理员状态异常' });
    return null;
  }
  const permissions = await getPermissionsForRoleFromDb(admin.role, {
    scope: normalizeRoleScope(admin.role_scope),
    logistics_provider_id: admin.role_logistics_provider_id,
  });
  req.adminRole = admin.role;
  req.adminPermissions = permissions;
  req.adminScope = normalizeRoleScope(admin.role_scope);
  req.adminLogisticsProviderId = admin.logistics_provider_id ?? admin.role_logistics_provider_id ?? null;
  return permissions;
};

// 返回当前操作人的物流商数据过滤ID：
//  - 平台作用域：null（不限制，可见全部数据）
//  - 物流商作用域且有归属物流商：该物流商ID
//  - 物流商作用域但缺失归属：-1（匹配不到任何数据，避免越权可见）
const getActorProviderFilter = (req: AdminRequest): number | null => {
  if (req.adminScope !== 'logistics') return null;
  const pid = Number(req.adminLogisticsProviderId);
  return Number.isInteger(pid) && pid > 0 ? pid : -1;
};

// 校验当前操作人是否有权操作目标资源（按物流商归属）。
// 返回 true 表示已写出错误响应、应中止后续处理；返回 false 表示放行。
const denyCrossProvider = (
  req: AdminRequest,
  res: Response,
  resourceProviderId: number | null | undefined,
): boolean => {
  const filter = getActorProviderFilter(req);
  if (filter === null) return false; // 平台账号：不限制
  if (resourceProviderId === undefined) {
    res.status(404).json({ error: '记录不存在' });
    return true;
  }
  if (Number(resourceProviderId) !== filter) {
    res.status(403).json({ error: '无权操作其他物流商的数据' });
    return true;
  }
  return false;
};

// 角色写操作的归属校验：物流商账号只能操作本物流商作用域的角色。
// 返回 true 表示已写出错误响应、应中止后续处理。
const denyCrossProviderRole = (
  req: AdminRequest,
  res: Response,
  scope: 'platform' | 'logistics',
  logisticsProviderId: number | null,
): boolean => {
  const actor = getActorProviderFilter(req);
  if (actor === null) return false; // 平台账号：不限制
  if (scope !== 'logistics' || logisticsProviderId !== actor) {
    res.status(403).json({ error: '无权操作其他物流商的角色' });
    return true;
  }
  return false;
};

const requirePermission = (code: PermissionCode) => {
  return async (req: AdminRequest, res: Response, next: () => void): Promise<void> => {
    const permissions = await loadActorContext(req, res);
    if (!permissions) return;
    if (!permissions.includes(code)) {
      await logAdminAudit({
        adminId: req.adminId,
        action: 'admin.permission_check',
        result: 'denied',
        ip: getRequestIp(req),
        detail: `role=${req.adminRole} missing=${code}`,
      });
      res.status(403).json({ error: '没有该操作权限' });
      return;
    }
    next();
  };
};

// 仅平台作用域管理员可访问（依赖 requirePermission 已填充 req.adminScope）
const requirePlatformScope = async (req: AdminRequest, res: Response, next: () => void): Promise<void> => {
  if (req.adminScope === undefined) {
    const permissions = await loadActorContext(req, res);
    if (!permissions) return;
  }
  if (req.adminScope !== 'platform') {
    await logAdminAudit({
      adminId: req.adminId,
      action: 'admin.scope_check',
      result: 'denied',
      ip: getRequestIp(req),
      detail: `scope=${req.adminScope} require=platform`,
    });
    res.status(403).json({ error: '仅平台管理员可执行此操作' });
    return;
  }
  next();
};

// 角色管理按作用域区分平台/物流商权限（scope 取自 body 或 query）
const requireRolePermission = (action: 'create' | 'update' | 'delete') => {
  return async (req: AdminRequest, res: Response, next: () => void): Promise<void> => {
    const permissions = await loadActorContext(req, res);
    if (!permissions) return;
    const scopeRaw = String(req.body?.scope ?? req.query?.scope ?? '').trim().toLowerCase();
    const isLogistics = scopeRaw === 'logistics';
    const codeMap = {
      create: isLogistics ? PERMISSIONS.ROLE_LOGISTICS_CREATE : PERMISSIONS.ROLE_PLATFORM_CREATE,
      update: isLogistics ? PERMISSIONS.ROLE_LOGISTICS_UPDATE : PERMISSIONS.ROLE_PLATFORM_UPDATE,
      delete: isLogistics ? PERMISSIONS.ROLE_LOGISTICS_DELETE : PERMISSIONS.ROLE_PLATFORM_DELETE,
    } as const;
    const code = codeMap[action];
    if (!permissions.includes(code)) {
      await logAdminAudit({
        adminId: req.adminId,
        action: 'admin.permission_check',
        result: 'denied',
        ip: getRequestIp(req),
        detail: `role=${req.adminRole} missing=${code}`,
      });
      res.status(403).json({ error: '没有该操作权限' });
      return;
    }
    next();
  };
};

// 角色列表：拥有平台角色或物流商角色查看权限之一即可（客户端按作用域过滤）
const requireAnyRoleView = async (req: AdminRequest, res: Response, next: () => void): Promise<void> => {
  const permissions = await loadActorContext(req, res);
  if (!permissions) return;
  if (!permissions.includes(PERMISSIONS.ROLE_PLATFORM_VIEW) && !permissions.includes(PERMISSIONS.ROLE_LOGISTICS_VIEW)) {
    await logAdminAudit({
      adminId: req.adminId,
      action: 'admin.permission_check',
      result: 'denied',
      ip: getRequestIp(req),
      detail: `role=${req.adminRole} missing=role.view`,
    });
    res.status(403).json({ error: '没有该操作权限' });
    return;
  }
  next();
};

// 防提权护栏：非超管授予角色的权限必须是自身有效权限的子集
const isActorSuperAdmin = (req: AdminRequest): boolean => req.adminRole === 'super_admin';

const checkPermissionSubset = (req: AdminRequest, requested: unknown): string | null => {
  if (isActorSuperAdmin(req)) return null;
  const actor = new Set<string>(req.adminPermissions || []);
  const list = Array.isArray(requested) ? requested : [];
  const invalid = list
    .map((p) => String(p))
    .filter((p) => !actor.has(p));
  if (invalid.length > 0) {
    return `不能授予超出自身权限范围的权限：${invalid.join(', ')}`;
  }
  return null;
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
      token,
      csrfToken,
      admin: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        role_scope: normalizeRoleScope(admin.role_scope),
        role_logistics_provider_id: admin.role_logistics_provider_id ?? null,
        logistics_provider_id: admin.logistics_provider_id ?? null,
        logistics_provider_name: await getLogisticsProviderNameById(admin.logistics_provider_id ?? admin.role_logistics_provider_id ?? null),
        logistics_provider_code: await getLogisticsProviderCodeById(admin.logistics_provider_id ?? admin.role_logistics_provider_id ?? null),
        role_name: await getRoleNameByCode(admin.role, {
          scope: normalizeRoleScope(admin.role_scope),
          logistics_provider_id: admin.role_logistics_provider_id,
        }),
        permissions: await getPermissionsForRoleFromDb(admin.role, {
          scope: normalizeRoleScope(admin.role_scope),
          logistics_provider_id: admin.role_logistics_provider_id,
        }),
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
      role_scope: normalizeRoleScope(admin.role_scope),
      role_logistics_provider_id: admin.role_logistics_provider_id ?? null,
      logistics_provider_id: admin.logistics_provider_id ?? null,
      logistics_provider_name: await getLogisticsProviderNameById(admin.logistics_provider_id ?? admin.role_logistics_provider_id ?? null),
      logistics_provider_code: await getLogisticsProviderCodeById(admin.logistics_provider_id ?? admin.role_logistics_provider_id ?? null),
      role_name: await getRoleNameByCode(admin.role, {
        scope: normalizeRoleScope(admin.role_scope),
        logistics_provider_id: admin.role_logistics_provider_id,
      }),
      permissions: await getPermissionsForRoleFromDb(admin.role, {
        scope: normalizeRoleScope(admin.role_scope),
        logistics_provider_id: admin.role_logistics_provider_id,
      }),
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

router.get('/audit-logs', adminAuth, requirePermission(PERMISSIONS.AUDIT_VIEW), async (req: AdminRequest, res: Response): Promise<void> => {
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

router.get('/roles', adminAuth, requireAnyRoleView, async (req: AdminRequest, res: Response): Promise<void> => {
  const scopeRaw = String(req.query.scope || '').trim().toLowerCase();
  const scope = scopeRaw === 'logistics' ? 'logistics' : scopeRaw === 'platform' ? 'platform' : undefined;
  const providerRaw = String(req.query.logistics_provider_id || '').trim();
  const logisticsProviderId = providerRaw === '' ? undefined : toId(providerRaw);

  if (providerRaw !== '' && logisticsProviderId === null) {
    res.status(400).json({ error: 'logistics_provider_id 不合法' });
    return;
  }
  if (scope !== 'logistics' && logisticsProviderId !== undefined) {
    res.status(400).json({ error: '仅 logistics scope 支持 logistics_provider_id' });
    return;
  }

  // 物流商账号：仅可查看本物流商的角色
  const actorProvider = getActorProviderFilter(req);
  const effScope = actorProvider !== null ? 'logistics' : scope;
  const effProviderId = actorProvider !== null ? actorProvider : logisticsProviderId;

  const roles = await listRolesWithPermissions(effScope, effProviderId);
  res.json({
    roles,
    allPermissions: ALL_PERMISSION_CODES,
  });
});

router.post('/roles', adminAuth, csrfGuard, requireRolePermission('create'), async (req: AdminRequest, res: Response): Promise<void> => {
  const code = String(req.body?.code || '').trim().toLowerCase();
  const name = String(req.body?.name || '').trim();
  const scopeRaw = String(req.body?.scope || '').trim().toLowerCase();
  const scope = scopeRaw === 'logistics' ? 'logistics' : 'platform';
  const logisticsProviderIdRaw = req.body?.logistics_provider_id;
  const logisticsProviderId =
    logisticsProviderIdRaw === undefined || logisticsProviderIdRaw === null || logisticsProviderIdRaw === ''
      ? null
      : toId(String(logisticsProviderIdRaw));
  const permissions = Array.isArray(req.body?.permissions) ? req.body.permissions : [];

  if (!/^[a-z][a-z0-9_]{1,31}$/.test(code)) {
    res.status(400).json({ error: '角色标识不合法（小写字母开头，仅含小写字母/数字/下划线，长度 2-32 位）' });
    return;
  }
  if (!name) {
    res.status(400).json({ error: '角色名称不能为空' });
    return;
  }
  if (code === 'super_admin' || code === 'admin') {
    res.status(409).json({ error: '系统内置角色已存在' });
    return;
  }

  // 防提权护栏：非超管不能授予超出自身权限范围的权限
  const subsetError = checkPermissionSubset(req, permissions);
  if (subsetError) {
    res.status(403).json({ error: subsetError });
    return;
  }

  if (scope === 'logistics' && !logisticsProviderId) {
    res.status(400).json({ error: '物流商角色必须指定 logistics_provider_id' });
    return;
  }
  if (scope === 'platform' && logisticsProviderId) {
    res.status(400).json({ error: '平台角色不允许指定 logistics_provider_id' });
    return;
  }

  // 物流商账号：只能创建本物流商作用域的角色
  if (denyCrossProviderRole(req, res, scope, logisticsProviderId)) {
    return;
  }

  if (scope === 'logistics') {
    const invalid = permissions.find((p: unknown) => !LOGISTICS_ALLOWED_PERMISSIONS.includes(p as PermissionCode));
    if (invalid !== undefined) {
      res.status(400).json({ error: '物流商角色仅可配置包裹、订单、会员、管理员相关权限' });
      return;
    }
  }

  const result = await createRoleWithPermissions({
    code,
    name,
    scope,
    logistics_provider_id: scope === 'logistics' ? logisticsProviderId : null,
    permissions,
  });
  if (result === 'duplicate') {
    await logAdminAudit({
      adminId: req.adminId,
      action: 'admin.role.create',
      result: 'failed',
      ip: getRequestIp(req),
      detail: `duplicate_code=${code}`,
    });
    res.status(409).json({ error: '角色标识已存在' });
    return;
  }

  await logAdminAudit({
    adminId: req.adminId,
    action: 'admin.role.create',
    targetType: 'admin_role',
    result: 'success',
    ip: getRequestIp(req),
    detail: `code=${code}`,
  });
  res.status(201).json({ message: '角色已创建' });
});

router.put('/roles/:code', adminAuth, csrfGuard, requireRolePermission('update'), async (req: AdminRequest, res: Response): Promise<void> => {
  const code = String(req.params.code || '').trim();
  const scopeRaw = String(req.body?.scope || req.query.scope || '').trim().toLowerCase();
  const scope = scopeRaw === 'logistics' ? 'logistics' : 'platform';
  const providerRaw = String(req.body?.logistics_provider_id ?? req.query.logistics_provider_id ?? '').trim();
  const logisticsProviderId = providerRaw === '' ? null : toId(providerRaw);
  const payload: { name?: string; permissions?: string[] } = {};

  if (scope === 'logistics' && !logisticsProviderId) {
    res.status(400).json({ error: '物流商角色必须指定 logistics_provider_id' });
    return;
  }
  if (scope === 'platform' && logisticsProviderId) {
    res.status(400).json({ error: '平台角色不允许指定 logistics_provider_id' });
    return;
  }

  // 物流商账号：只能修改本物流商作用域的角色
  if (denyCrossProviderRole(req, res, scope, logisticsProviderId)) {
    return;
  }

  // 防提权护栏：非超管不能修改系统内置角色
  if (!isActorSuperAdmin(req)) {
    const targetRole = await getRoleRowByCode(code, {
      scope,
      logistics_provider_id: scope === 'logistics' ? logisticsProviderId : null,
    });
    if (targetRole?.is_system) {
      res.status(403).json({ error: '无权修改系统内置角色' });
      return;
    }
  }

  if (typeof req.body?.name === 'string') {
    const n = req.body.name.trim();
    if (!n) {
      res.status(400).json({ error: '角色名称不能为空' });
      return;
    }
    payload.name = n;
  }
  if (Array.isArray(req.body?.permissions)) {
    // 防提权护栏：非超管不能授予超出自身权限范围的权限
    const subsetError = checkPermissionSubset(req, req.body.permissions);
    if (subsetError) {
      res.status(403).json({ error: subsetError });
      return;
    }
    if (scope === 'logistics') {
      const invalid = req.body.permissions.find((p: unknown) => !LOGISTICS_ALLOWED_PERMISSIONS.includes(p as PermissionCode));
      if (invalid !== undefined) {
        res.status(400).json({ error: '物流商角色仅可配置包裹、订单、会员、管理员相关权限' });
        return;
      }
    }
    payload.permissions = req.body.permissions;
  }
  if (payload.name === undefined && payload.permissions === undefined) {
    res.status(400).json({ error: '没有可更新的内容' });
    return;
  }

  const result = await updateRoleWithPermissions(code, payload, {
    scope,
    logistics_provider_id: scope === 'logistics' ? logisticsProviderId : null,
  });
  if (result === 'not_found') {
    res.status(404).json({ error: '角色不存在' });
    return;
  }

  await logAdminAudit({
    adminId: req.adminId,
    action: 'admin.role.update',
    targetType: 'admin_role',
    result: 'success',
    ip: getRequestIp(req),
    detail: `code=${code}`,
  });
  res.json({ message: '角色已更新' });
});

router.delete('/roles/:code', adminAuth, csrfGuard, requireRolePermission('delete'), async (req: AdminRequest, res: Response): Promise<void> => {
  const code = String(req.params.code || '').trim();
  const scopeRaw = String(req.query.scope || '').trim().toLowerCase();
  const scope = scopeRaw === 'logistics' ? 'logistics' : 'platform';
  const providerRaw = String(req.query.logistics_provider_id || '').trim();
  const logisticsProviderId = providerRaw === '' ? null : toId(providerRaw);

  if (scope === 'logistics' && !logisticsProviderId) {
    res.status(400).json({ error: '物流商角色必须指定 logistics_provider_id' });
    return;
  }
  if (scope === 'platform' && logisticsProviderId) {
    res.status(400).json({ error: '平台角色不允许指定 logistics_provider_id' });
    return;
  }

  // 物流商账号：只能删除本物流商作用域的角色
  if (denyCrossProviderRole(req, res, scope, logisticsProviderId)) {
    return;
  }

  const result = await deleteRole(code, {
    scope,
    logistics_provider_id: scope === 'logistics' ? logisticsProviderId : null,
  });

  if (result === 'not_found') {
    res.status(404).json({ error: '角色不存在' });
    return;
  }
  if (result === 'system') {
    res.status(400).json({ error: '系统内置角色不可删除' });
    return;
  }
  if (result === 'in_use') {
    res.status(409).json({ error: '该角色下仍有管理员，无法删除' });
    return;
  }

  await logAdminAudit({
    adminId: req.adminId,
    action: 'admin.role.delete',
    targetType: 'admin_role',
    result: 'success',
    ip: getRequestIp(req),
    detail: `code=${code}`,
  });
  res.json({ message: '角色已删除' });
});

router.get('/users', adminAuth, requirePermission(PERMISSIONS.USER_VIEW), async (req: AdminRequest, res: Response): Promise<void> => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 10);
  const sortKey = String(req.query.sortKey || '').trim() || undefined;
  const sortOrder = String(req.query.sortOrder || '').trim() || undefined;
  const columnFilters = parseJsonQuery<Record<string, string>>(req.query.columnFilters);
  const dateFilters = parseJsonQuery<Record<string, [string, string]>>(req.query.dateFilters);
  const result = await getUsersPaged(page, limit, sortKey, sortOrder, columnFilters, dateFilters, getActorProviderFilter(req));
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

router.get('/users/search', adminAuth, requirePermission(PERMISSIONS.USER_VIEW), async (req: AdminRequest, res: Response): Promise<void> => {
  const keyword = String(req.query.q || '').trim();
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 10);
  const sortKey = String(req.query.sortKey || '').trim() || undefined;
  const sortOrder = String(req.query.sortOrder || '').trim() || undefined;
  if (!keyword) {
    res.status(400).json({ error: '搜索关键词不能为空' });
    return;
  }
  const result = await searchUsersPaged(keyword, page, limit, sortKey, sortOrder, getActorProviderFilter(req));
  res.json({
    data: result.data,
    count: result.total,
    pagination: {
      page,
      limit,
      total: result.total,
      pages: result.pages,
    },
  });
});

router.put('/users/:id', adminAuth, csrfGuard, requirePermission(PERMISSIONS.USER_UPDATE), async (req: AdminRequest, res: Response): Promise<void> => {
  const userId = Number(req.params.id);
  const { logistics_provider_id } = req.body || {};
  if (denyCrossProvider(req, res, await getUserOwnerProviderId(userId))) return;
  try {
    const ok = await updateUser(userId, {
      logistics_provider_id: logistics_provider_id !== undefined && logistics_provider_id !== ''
        ? (Number(logistics_provider_id) > 0 ? Number(logistics_provider_id) : null)
        : undefined,
    });
    if (!ok) {
      res.status(404).json({ error: '会员不存在或无可更新内容' });
      return;
    }
    res.json({ message: '修改成功' });
  } catch (err: any) {
    console.error('[修改会员失败]', err);
    res.status(500).json({ error: '修改失败，请稍后重试' });
  }
});

router.delete('/users/:id', adminAuth, csrfGuard, requirePermission(PERMISSIONS.USER_DELETE), async (req: AdminRequest, res: Response): Promise<void> => {
  const userId = Number(req.params.id);
  if (denyCrossProvider(req, res, await getUserOwnerProviderId(userId))) return;
  const ok = await deleteUser(userId);
  if (!ok) {
    res.status(404).json({ error: '用户不存在' });
    return;
  }
  res.json({ message: '用户已删除' });
});

router.post('/users/batch-delete', adminAuth, csrfGuard, requirePermission(PERMISSIONS.USER_DELETE), async (req: AdminRequest, res: Response): Promise<void> => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: '请提供要删除的ID列表' });
    return;
  }
  const numIds = ids.map(Number).filter(n => Number.isInteger(n) && n > 0);
  const deleted = await batchDeleteUsers(numIds, getActorProviderFilter(req));
  res.json({ message: `已删除 ${deleted} 条记录`, deleted });
});

router.get('/orders', adminAuth, requirePermission(PERMISSIONS.ORDER_VIEW), async (req: AdminRequest, res: Response): Promise<void> => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 10);
  const startDate = String(req.query.startDate || '').trim() || undefined;
  const endDate = String(req.query.endDate || '').trim() || undefined;
  const sortKey = String(req.query.sortKey || '').trim() || undefined;
  const sortOrder = String(req.query.sortOrder || '').trim() || undefined;
  const columnFilters = parseJsonQuery<Record<string, string>>(req.query.columnFilters);
  const dateFilters = parseJsonQuery<Record<string, [string, string]>>(req.query.dateFilters);
  const result = await getOrdersPaged(page, limit, startDate, endDate, sortKey, sortOrder, columnFilters, dateFilters, getActorProviderFilter(req));
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

router.get('/orders/search', adminAuth, requirePermission(PERMISSIONS.ORDER_VIEW), async (req: AdminRequest, res: Response): Promise<void> => {
  const keyword = String(req.query.q || '').trim();
  const startDate = String(req.query.startDate || '').trim() || undefined;
  const endDate = String(req.query.endDate || '').trim() || undefined;
  if (!keyword) {
    res.status(400).json({ error: '搜索关键词不能为空' });
    return;
  }
  const data = await searchOrders(keyword, startDate, endDate, getActorProviderFilter(req));
  res.json({ data, count: data.length });
});

router.patch('/orders/:id', adminAuth, csrfGuard, requirePermission(PERMISSIONS.ORDER_UPDATE_STATUS), async (req: AdminRequest, res: Response): Promise<void> => {
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
  if (denyCrossProvider(req, res, await getOrderOwnerProviderId(orderId))) return;
  const ok = await updateOrderStatus(orderId, status);
  if (!ok) {
    res.status(404).json({ error: '订单不存在' });
    return;
  }
  res.json({ message: '订单状态已更新', orderId, status });
});

router.delete('/orders/:id', adminAuth, csrfGuard, requirePermission(PERMISSIONS.ORDER_DELETE), async (req: AdminRequest, res: Response): Promise<void> => {
  const orderId = Number(req.params.id);
  if (denyCrossProvider(req, res, await getOrderOwnerProviderId(orderId))) return;
  const ok = await deleteOrder(orderId);
  if (!ok) {
    res.status(404).json({ error: '订单不存在' });
    return;
  }
  res.json({ message: '订单已删除' });
});

router.post('/orders/batch-delete', adminAuth, csrfGuard, requirePermission(PERMISSIONS.ORDER_DELETE), async (req: AdminRequest, res: Response): Promise<void> => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: '请提供要删除的ID列表' });
    return;
  }
  const numIds = ids.map(Number).filter(n => Number.isInteger(n) && n > 0);
  const deleted = await batchDeleteOrders(numIds, getActorProviderFilter(req));
  res.json({ message: `已删除 ${deleted} 条记录`, deleted });
});

router.get('/sms', adminAuth, requirePermission(PERMISSIONS.SMS_VIEW), async (req: AdminRequest, res: Response): Promise<void> => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 10);
  const startDate = String(req.query.startDate || '').trim() || undefined;
  const endDate = String(req.query.endDate || '').trim() || undefined;
  const sortKey = String(req.query.sortKey || '').trim() || undefined;
  const sortOrder = String(req.query.sortOrder || '').trim() || undefined;
  const columnFilters = parseJsonQuery<Record<string, string>>(req.query.columnFilters);
  const dateFilters = parseJsonQuery<Record<string, [string, string]>>(req.query.dateFilters);
  const result = await getSmsPaged(page, limit, startDate, endDate, sortKey, sortOrder, columnFilters, dateFilters);
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

router.get('/sms/search', adminAuth, requirePermission(PERMISSIONS.SMS_VIEW), async (req: AdminRequest, res: Response): Promise<void> => {
  const keyword = String(req.query.q || '').trim();
  const startDate = String(req.query.startDate || '').trim() || undefined;
  const endDate = String(req.query.endDate || '').trim() || undefined;
  if (!keyword) {
    res.status(400).json({ error: '搜索关键词不能为空' });
    return;
  }
  const data = await searchSms(keyword, startDate, endDate);
  res.json({ data, count: data.length });
});

router.delete('/sms/:id', adminAuth, csrfGuard, requirePermission(PERMISSIONS.SMS_DELETE), async (req: AdminRequest, res: Response): Promise<void> => {
  const ok = await deleteSms(Number(req.params.id));
  if (!ok) {
    res.status(404).json({ error: '记录不存在' });
    return;
  }
  res.json({ message: '记录已删除' });
});

router.post('/sms/batch-delete', adminAuth, csrfGuard, requirePermission(PERMISSIONS.SMS_DELETE), async (req: AdminRequest, res: Response): Promise<void> => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: '请提供要删除的ID列表' });
    return;
  }
  const numIds = ids.map(Number).filter(n => Number.isInteger(n) && n > 0);
  const deleted = await batchDeleteSms(numIds);
  res.json({ message: `已删除 ${deleted} 条记录`, deleted });
});

router.get('/parcels', adminAuth, requirePermission(PERMISSIONS.PARCEL_VIEW), async (req: AdminRequest, res: Response): Promise<void> => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 10);
  const startDate = String(req.query.startDate || '').trim() || undefined;
  const endDate = String(req.query.endDate || '').trim() || undefined;
  const sortKey = String(req.query.sortKey || '').trim() || undefined;
  const sortOrder = String(req.query.sortOrder || '').trim() || undefined;
  const columnFilters = parseJsonQuery<Record<string, string>>(req.query.columnFilters);
  const dateFilters = parseJsonQuery<Record<string, [string, string]>>(req.query.dateFilters);
  const result = await getParcelsPaged(page, limit, startDate, endDate, sortKey, sortOrder, columnFilters, dateFilters, getActorProviderFilter(req));
  res.json({
    data: signParcelImages(result.data),
    pagination: {
      page,
      limit,
      total: result.total,
      pages: result.pages,
    },
  });
});

router.get('/parcels/export', adminAuth, requirePermission(PERMISSIONS.PARCEL_EXPORT), async (req: AdminRequest, res: Response): Promise<void> => {
  const startDate = String(req.query.startDate || '').trim() || undefined;
  const endDate = String(req.query.endDate || '').trim() || undefined;
  const sortKey = String(req.query.sortKey || '').trim() || undefined;
  const sortOrder = String(req.query.sortOrder || '').trim() || undefined;
  const columnFilters = parseJsonQuery<Record<string, string>>(req.query.columnFilters);
  const dateFilters = parseJsonQuery<Record<string, [string, string]>>(req.query.dateFilters);
  const rows = await getParcelsForExport(startDate, endDate, sortKey, sortOrder, columnFilters, dateFilters, getActorProviderFilter(req));
  res.json({ data: rows, count: rows.length });
});

router.get('/parcels/search', adminAuth, requirePermission(PERMISSIONS.PARCEL_VIEW), async (req: AdminRequest, res: Response): Promise<void> => {
  const keyword = String(req.query.q || '').trim();
  const startDate = String(req.query.startDate || '').trim() || undefined;
  const endDate = String(req.query.endDate || '').trim() || undefined;
  if (!keyword) {
    res.status(400).json({ error: '搜索关键词不能为空' });
    return;
  }
  const data = await searchParcels(keyword, startDate, endDate, getActorProviderFilter(req));
  res.json({ data: signParcelImages(data), count: data.length });
});

router.get('/parcels/status-logs', adminAuth, requirePermission(PERMISSIONS.PARCEL_VIEW), async (req: AdminRequest, res: Response): Promise<void> => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const keyword = typeof req.query.keyword === 'string' ? req.query.keyword : undefined;
  const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
  const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;
  const result = await getStatusLogsPaged(page, limit, keyword, startDate, endDate, getActorProviderFilter(req));
  res.json(result);
});

// 《包裹状态快筛栏》：统计各货物态/信息态下的包裹数量
router.get('/parcels/status-counts', adminAuth, requirePermission(PERMISSIONS.PARCEL_VIEW), async (req: AdminRequest, res: Response): Promise<void> => {
  const data = await getParcelStatusCounts(getActorProviderFilter(req));
  res.json(data);
});

router.patch('/parcels/:id', adminAuth, csrfGuard, requirePermission(PERMISSIONS.PARCEL_UPDATE_STATUS), async (req: AdminRequest, res: Response): Promise<void> => {
  const status = String(req.body?.status || '').trim();
  const cargoStatusCodes = await getEnabledParcelStatusCodesByType('货物态');
  if (!cargoStatusCodes.has(status)) {
    res.status(400).json({ error: '货物态不合法' });
    return;
  }
  const parcelId = toId(req.params.id);
  if (!parcelId) {
    res.status(400).json({ error: '包裹ID不合法' });
    return;
  }
  if (denyCrossProvider(req, res, await getParcelOwnerProviderId(parcelId))) return;
  const subStatus = req.body?.sub_status !== undefined ? String(req.body.sub_status || '').trim() || null : undefined;
  if (subStatus && !(await getEnabledParcelStatusCodesByType('信息态')).has(subStatus)) {
    res.status(400).json({ error: '信息态不合法' });
    return;
  }
  const statusRemark = req.body?.status_remark !== undefined ? String(req.body.status_remark || '').trim().slice(0, 255) || null : undefined;
  const operatorId = (req as any).adminId || null;
  const ok = await updateParcelStatus(parcelId, status, subStatus, statusRemark, operatorId);
  if (!ok) {
    res.status(404).json({ error: '包裹不存在' });
    return;
  }
  res.json({ message: '包裹状态已更新', parcelId, status, sub_status: subStatus });
});

router.get('/parcels/:id/status-logs', adminAuth, requirePermission(PERMISSIONS.PARCEL_VIEW), async (req: AdminRequest, res: Response): Promise<void> => {
  const parcelId = toId(req.params.id);
  if (!parcelId) {
    res.status(400).json({ error: '包裹ID不合法' });
    return;
  }
  if (denyCrossProvider(req, res, await getParcelOwnerProviderId(parcelId))) return;
  const logs = await getParcelStatusLogs(parcelId);
  res.json({ data: logs });
});

const parcelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp|bmp)$/i.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 jpg/png/gif/webp/bmp 图片格式'));
    }
  },
});

router.post('/parcels/inbound', adminAuth, csrfGuard, requirePermission(PERMISSIONS.PARCEL_CREATE), parcelUpload.array('files', 10), async (req: AdminRequest, res: Response): Promise<void> => {
  const { tracking_number, weight, length_cm, width_cm, height_cm, shelf_location, logistics_provider_id, items: itemsJson } = req.body;
  if (!tracking_number || typeof tracking_number !== 'string' || !tracking_number.trim()) {
    res.status(400).json({ error: '包裹单号不能为空' });
    return;
  }
  const w = Number(weight);
  const l = Number(length_cm);
  const wi = Number(width_cm);
  const h = Number(height_cm);
  if (isNaN(w) || w <= 0 || isNaN(l) || l <= 0 || isNaN(wi) || wi <= 0 || isNaN(h) || h <= 0) {
    res.status(400).json({ error: '重量和尺寸必须为正数' });
    return;
  }
  let items: { name: string; value: number; quantity: number }[];
  try {
    const parsed = JSON.parse(itemsJson);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error();
    items = parsed.map((it: any) => ({
      name: String(it?.name || '').trim(),
      value: Number(it?.value),
      quantity: Number(it?.quantity),
    }));
    for (const item of items) {
      if (!item.name) throw new Error('物品名称不能为空');
      if (!Number.isFinite(item.value) || item.value < 0) throw new Error('物品价值无效');
      if (!Number.isInteger(item.quantity) || item.quantity < 1) throw new Error('物品数量无效');
    }
  } catch {
    res.status(400).json({ error: '至少需要一个物品，且物品信息必须完整' });
    return;
  }
  const volume = parseFloat((l * wi * h).toFixed(2));
  const files = (req.files || []) as Express.Multer.File[];
  const ossUrls = await Promise.all(files.map(f => uploadToOss(f.buffer, f.originalname, 'parcels')));
  const imageUrls = ossUrls.join(',');
  // 物流商账号：入库包裹强制归属本物流商
  const actorProvider = getActorProviderFilter(req);
  const resolvedProviderId = actorProvider !== null
    ? (actorProvider > 0 ? actorProvider : null)
    : (logistics_provider_id !== undefined && logistics_provider_id !== ''
      ? (Number(logistics_provider_id) > 0 ? Number(logistics_provider_id) : null)
      : undefined);
  try {
    const insertId = await createParcelInbound({
      tracking_number: tracking_number.trim(),
      weight: w,
      length_cm: l,
      width_cm: wi,
      height_cm: h,
      volume,
      images: imageUrls || undefined,
      shelf_location: typeof shelf_location === 'string' ? shelf_location.trim() || undefined : undefined,
      logistics_provider_id: resolvedProviderId,
      items: items.map(it => ({ name: it.name.trim(), value: it.value, quantity: it.quantity })),
    });
    res.json({ message: '入库成功', parcelId: insertId });
  } catch (err: any) {
    console.error('[入库失败]', err);
    res.status(500).json({ error: '入库失败，请稍后重试' });
  }
});

router.get('/parcels/:id/items', adminAuth, requirePermission(PERMISSIONS.PARCEL_VIEW), async (req: AdminRequest, res: Response): Promise<void> => {
  const parcelId = Number(req.params.id);
  if (denyCrossProvider(req, res, await getParcelOwnerProviderId(parcelId))) return;
  const items = await getParcelItems(parcelId);
  res.json({ data: items });
});

router.put('/parcels/:id', adminAuth, csrfGuard, requirePermission(PERMISSIONS.PARCEL_UPDATE), parcelUpload.array('files', 10), async (req: AdminRequest, res: Response): Promise<void> => {
  const parcelId = Number(req.params.id);
  if (denyCrossProvider(req, res, await getParcelOwnerProviderId(parcelId))) return;
  const { weight, length_cm, width_cm, height_cm, origin, destination, status, sub_status, status_remark, items: itemsJson, existing_images, logistics_provider_id } = req.body;
  const w = Number(weight);
  const l = Number(length_cm);
  const wi = Number(width_cm);
  const h = Number(height_cm);
  if (isNaN(w) || w <= 0 || isNaN(l) || l <= 0 || isNaN(wi) || wi <= 0 || isNaN(h) || h <= 0) {
    res.status(400).json({ error: '重量和尺寸必须为正数' });
    return;
  }
  // 货物态/信息态必须取自《包裹状态字典》对应类型的启用值
  const editStatus = typeof status === 'string' ? status.trim() : '';
  if (editStatus && !(await getEnabledParcelStatusCodesByType('货物态')).has(editStatus)) {
    res.status(400).json({ error: '货物态不合法' });
    return;
  }
  const editSubStatus = typeof sub_status === 'string' ? sub_status.trim() : '';
  if (editSubStatus && !(await getEnabledParcelStatusCodesByType('信息态')).has(editSubStatus)) {
    res.status(400).json({ error: '信息态不合法' });
    return;
  }
  let items: { name: string; value: number; quantity: number }[];
  try {
    const parsed = JSON.parse(itemsJson);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error();
    items = parsed.map((it: any) => ({
      name: String(it?.name || '').trim(),
      value: Number(it?.value),
      quantity: Number(it?.quantity),
    }));
    for (const item of items) {
      if (!item.name) throw new Error();
      if (!Number.isFinite(item.value) || item.value < 0) throw new Error();
      if (!Number.isInteger(item.quantity) || item.quantity < 1) throw new Error();
    }
  } catch {
    res.status(400).json({ error: '至少需要一个物品，且物品信息必须完整' });
    return;
  }
  const volume = parseFloat((l * wi * h).toFixed(2));
  const files = (req.files || []) as Express.Multer.File[];
  const newImageUrls = await Promise.all(files.map(f => uploadToOss(f.buffer, f.originalname, 'parcels')));
  const existingUrls = typeof existing_images === 'string' && existing_images.trim() ? existing_images.split(',').filter(Boolean) : [];
  const allImages = [...existingUrls, ...newImageUrls].join(',');
  // 物流商账号：不允许将包裹转移给其他物流商
  const editActorProvider = getActorProviderFilter(req);
  const editProviderId = editActorProvider !== null
    ? (editActorProvider > 0 ? editActorProvider : null)
    : (logistics_provider_id !== undefined && logistics_provider_id !== ''
      ? (Number(logistics_provider_id) > 0 ? Number(logistics_provider_id) : null)
      : undefined);
  try {
    const ok = await updateParcel(parcelId, {
      weight: w,
      length_cm: l,
      width_cm: wi,
      height_cm: h,
      volume,
      origin: typeof origin === 'string' ? origin.trim() : undefined,
      destination: typeof destination === 'string' ? destination.trim() : undefined,
      status: typeof status === 'string' ? status.trim() : undefined,
      sub_status: typeof sub_status === 'string' ? sub_status.trim() : undefined,
      status_remark: typeof status_remark === 'string' ? status_remark.trim() : undefined,
      images: allImages || undefined,
      logistics_provider_id: editProviderId,
      items: items.map(it => ({ name: it.name.trim(), value: it.value, quantity: it.quantity })),
    });
    if (!ok) {
      res.status(404).json({ error: '包裹不存在' });
      return;
    }
    res.json({ message: '修改成功' });
  } catch (err: any) {
    console.error('[修改包裹失败]', err);
    res.status(500).json({ error: '修改失败，请稍后重试' });
  }
});

router.delete('/parcels/:id', adminAuth, csrfGuard, requirePermission(PERMISSIONS.PARCEL_DELETE), async (req: AdminRequest, res: Response): Promise<void> => {
  const parcelId = Number(req.params.id);
  if (denyCrossProvider(req, res, await getParcelOwnerProviderId(parcelId))) return;
  const ok = await deleteParcel(parcelId);
  if (!ok) {
    res.status(404).json({ error: '包裹不存在' });
    return;
  }
  res.json({ message: '包裹已删除' });
});

router.post('/parcels/batch-delete', adminAuth, csrfGuard, requirePermission(PERMISSIONS.PARCEL_DELETE), async (req: AdminRequest, res: Response): Promise<void> => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: '请提供要删除的ID列表' });
    return;
  }
  const numIds = ids.map(Number).filter(n => Number.isInteger(n) && n > 0);
  const deleted = await batchDeleteParcels(numIds, getActorProviderFilter(req));
  res.json({ message: `已删除 ${deleted} 条记录`, deleted });
});

router.post('/parcels/batch-update-logistics', adminAuth, csrfGuard, requirePermission(PERMISSIONS.PARCEL_UPDATE), async (req: AdminRequest, res: Response): Promise<void> => {
  const ids = req.body?.ids;
  const logisticsProviderId = Number(req.body?.logistics_provider_id);
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: '请提供要更新的ID列表' });
    return;
  }
  if (!Number.isInteger(logisticsProviderId) || logisticsProviderId <= 0) {
    res.status(400).json({ error: '请选择有效的物流商' });
    return;
  }
  const numIds = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (numIds.length === 0) {
    res.status(400).json({ error: 'ID列表不合法' });
    return;
  }

  const actorProvider = getActorProviderFilter(req);
  if (actorProvider !== null && actorProvider !== logisticsProviderId) {
    res.status(403).json({ error: '无权将包裹调整为其他物流商' });
    return;
  }

  const activeProviders = await getActiveLogisticsProviders();
  if (!activeProviders.some((p: any) => Number(p.id) === logisticsProviderId)) {
    res.status(400).json({ error: '目标物流商不存在或已停用' });
    return;
  }

  const updated = await batchUpdateParcelsLogisticsProvider(numIds, logisticsProviderId, actorProvider);
  res.json({ message: `已更新 ${updated} 条包裹物流商`, updated });
});

router.get('/admins', adminAuth, requirePermission(PERMISSIONS.ADMIN_VIEW), async (req: AdminRequest, res: Response): Promise<void> => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 10);
  const sortKey = String(req.query.sortKey || '').trim() || undefined;
  const sortOrder = String(req.query.sortOrder || '').trim() || undefined;
  const columnFilters = parseJsonQuery<Record<string, string>>(req.query.columnFilters);
  const dateFilters = parseJsonQuery<Record<string, [string, string]>>(req.query.dateFilters);
  const scopeParam = String(req.query.scope || '').trim();
  const roleScope = scopeParam === 'platform' || scopeParam === 'logistics' ? scopeParam : undefined;
  const result = await getAdminsPaged(page, limit, sortKey, sortOrder, columnFilters, dateFilters, getActorProviderFilter(req), roleScope);
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

router.get('/admins/search', adminAuth, requirePermission(PERMISSIONS.ADMIN_VIEW), async (req: AdminRequest, res: Response): Promise<void> => {
  const keyword = String(req.query.q || '').trim();
  if (!keyword) {
    res.status(400).json({ error: '搜索关键词不能为空' });
    return;
  }
  const scopeParam = String(req.query.scope || '').trim();
  const roleScope = scopeParam === 'platform' || scopeParam === 'logistics' ? scopeParam : undefined;
  const data = await searchAdmins(keyword, getActorProviderFilter(req), roleScope);
  res.json({ data, count: data.length });
});

router.post('/admins', adminAuth, csrfGuard, requirePermission(PERMISSIONS.ADMIN_CREATE), requireAdminManage, async (req: AdminRequest, res: Response): Promise<void> => {
  const { username, password, email, role, role_scope, role_logistics_provider_id, logistics_provider_id } = req.body as {
    username?: string;
    password?: string;
    email?: string;
    role?: string;
    role_scope?: string;
    role_logistics_provider_id?: number | string | null;
    logistics_provider_id?: number | string | null;
  };

  if (!username || !password) {
    await logAdminAudit({
      adminId: req.adminId,
      action: 'admin.create',
      result: 'failed',
      ip: getRequestIp(req),
      detail: 'missing_required_fields',
    });
    res.status(400).json({ error: '用户名和密码不能为空' });
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
  const normalizedRoleScope = normalizeRoleScope(role_scope);
  const normalizedRoleProviderId = normalizedRoleScope === 'logistics' ? toId(String(role_logistics_provider_id ?? '')) : null;
  const normalizedAdminProviderId = logistics_provider_id === undefined || logistics_provider_id === null || logistics_provider_id === ''
    ? null
    : toId(String(logistics_provider_id));

  if (normalizedRoleScope === 'logistics' && !normalizedRoleProviderId) {
    res.status(400).json({ error: '物流商角色必须指定 role_logistics_provider_id' });
    return;
  }
  if (normalizedRoleScope === 'platform' && normalizedRoleProviderId) {
    res.status(400).json({ error: '平台角色不允许指定 role_logistics_provider_id' });
    return;
  }
  if (normalizedRoleScope === 'logistics' && (!normalizedAdminProviderId || normalizedAdminProviderId !== normalizedRoleProviderId)) {
    res.status(400).json({ error: '物流商管理员归属必须与角色归属一致' });
    return;
  }

  // 物流商账号：只能在本物流商范围内创建 logistics 作用域管理员，不能创建平台/其他物流商账号
  const actorProviderForCreate = getActorProviderFilter(req);
  if (actorProviderForCreate !== null) {
    if (normalizedRoleScope !== 'logistics') {
      res.status(403).json({ error: '物流商账号只能创建物流商作用域的管理员' });
      return;
    }
    if (normalizedRoleProviderId !== actorProviderForCreate || normalizedAdminProviderId !== actorProviderForCreate) {
      res.status(403).json({ error: '无权为其他物流商创建管理员' });
      return;
    }
  }

  if (!(await roleExists(normalizedRole, { scope: normalizedRoleScope, logistics_provider_id: normalizedRoleProviderId }))) {
    await logAdminAudit({
      adminId: req.adminId,
      action: 'admin.create',
      result: 'failed',
      ip: getRequestIp(req),
      detail: `invalid_role=${normalizedRole},scope=${normalizedRoleScope},provider=${normalizedRoleProviderId ?? 'null'}`,
    });
    res.status(400).json({ error: '管理员角色不合法' });
    return;
  }

  if (normalizedRole === 'super_admin' && normalizedRoleScope === 'platform') {
    const superAdminCount = await countActiveSuperAdmins();
    if (superAdminCount >= 1) {
      await logAdminAudit({
        adminId: req.adminId,
        action: 'admin.create',
        result: 'denied',
        ip: getRequestIp(req),
        detail: 'super_admin_already_exists',
      });
      res.status(409).json({ error: '超级管理员只能有一个，无法继续添加' });
      return;
    }
  }

  // 物流商管理员账号：填写内容仅字母+数字，创建成功后自动拼接 @<物流商代号>
  let finalUsername = username.trim();
  if (normalizedRoleScope === 'logistics') {
    const baseUsername = finalUsername;
    if (!/^[A-Za-z0-9]+$/.test(baseUsername)) {
      await logAdminAudit({
        adminId: req.adminId,
        action: 'admin.create',
        result: 'failed',
        ip: getRequestIp(req),
        detail: 'invalid_logistics_username',
      });
      res.status(400).json({ error: '物流商管理员账号只能包含字母和数字' });
      return;
    }
    const providerCode = await getLogisticsProviderCodeById(normalizedAdminProviderId);
    if (!providerCode) {
      res.status(400).json({ error: '归属物流商不存在或缺少代号' });
      return;
    }
    finalUsername = `${baseUsername}@${providerCode}`;
  }

  const admin = await createAdmin({
    username: finalUsername,
    password,
    email: (email || '').trim(),
    role: normalizedRole,
    role_scope: normalizedRoleScope,
    role_logistics_provider_id: normalizedRoleProviderId,
    logistics_provider_id: normalizedAdminProviderId,
  });

  if (!admin) {
    await logAdminAudit({
      adminId: req.adminId,
      action: 'admin.create',
      result: 'failed',
      ip: getRequestIp(req),
      detail: `duplicate_username=${finalUsername}`,
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

router.patch('/admins/:id', adminAuth, csrfGuard, requirePermission(PERMISSIONS.ADMIN_UPDATE_STATUS), requireAdminManage, async (req: AdminRequest, res: Response): Promise<void> => {
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

  // 物流商账号：只能修改本物流商归属的管理员状态
  if (getActorProviderFilter(req) !== null) {
    const target = await getAdminById(adminId);
    if (denyCrossProvider(req, res, target?.logistics_provider_id)) return;
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

router.put('/admins/:id', adminAuth, csrfGuard, requirePermission(PERMISSIONS.ADMIN_UPDATE), requireAdminManage, async (req: AdminRequest, res: Response): Promise<void> => {
  const adminId = toId(req.params.id);
  if (!adminId) {
    res.status(400).json({ error: '管理员ID不合法' });
    return;
  }

  const { username, email, role, role_scope, role_logistics_provider_id, logistics_provider_id, password } = req.body as {
    username?: string;
    email?: string;
    role?: string;
    role_scope?: string;
    role_logistics_provider_id?: number | string | null;
    logistics_provider_id?: number | string | null;
    password?: string;
  };

  const payload: {
    username?: string;
    email?: string;
    role?: string;
    role_scope?: 'platform' | 'logistics';
    role_logistics_provider_id?: number | null;
    logistics_provider_id?: number | null;
    password?: string;
  } = {};

  const targetAdmin = await getAdminById(adminId);
  if (!targetAdmin) {
    res.status(404).json({ error: '管理员不存在' });
    return;
  }

  // 物流商账号：只能修改本物流商归属的管理员
  const actorProviderForUpdate = getActorProviderFilter(req);
  if (actorProviderForUpdate !== null && denyCrossProvider(req, res, targetAdmin.logistics_provider_id)) {
    return;
  }

  if (typeof username === 'string') {
    const v = username.trim();
    if (!v) {
      res.status(400).json({ error: '用户名不能为空' });
      return;
    }
    // 账号（用户名）创建后不可修改：仅允许提交与现有账号一致的值，否则拒绝
    if (v !== targetAdmin.username) {
      res.status(400).json({ error: '管理员账号不可修改' });
      return;
    }
  }
  if (typeof email === 'string') {
    payload.email = email.trim();
  }
  if (typeof role === 'string') {
    const v = role.trim();
    payload.role = v;
  }
  if (role_scope !== undefined) {
    payload.role_scope = normalizeRoleScope(role_scope);
  }
  if (role_logistics_provider_id !== undefined) {
    payload.role_logistics_provider_id = role_logistics_provider_id === null || role_logistics_provider_id === ''
      ? null
      : toId(String(role_logistics_provider_id));
  }
  if (logistics_provider_id !== undefined) {
    payload.logistics_provider_id = logistics_provider_id === null || logistics_provider_id === ''
      ? null
      : toId(String(logistics_provider_id));
  }
  if (typeof password === 'string' && password.length > 0) {
    if (password.length < 12) {
      res.status(400).json({ error: '密码至少需要 12 位' });
      return;
    }
    payload.password = password;
  }

  const nextRole = payload.role ?? targetAdmin.role;
  const nextRoleScope = payload.role_scope ?? normalizeRoleScope(targetAdmin.role_scope);
  const nextRoleProviderId = payload.role_logistics_provider_id !== undefined
    ? payload.role_logistics_provider_id
    : (targetAdmin.role_logistics_provider_id ?? null);
  const nextAdminProviderId = payload.logistics_provider_id !== undefined
    ? payload.logistics_provider_id
    : (targetAdmin.logistics_provider_id ?? null);

  if (nextRoleScope === 'logistics' && !nextRoleProviderId) {
    res.status(400).json({ error: '物流商角色必须指定 role_logistics_provider_id' });
    return;
  }
  if (nextRoleScope === 'platform' && nextRoleProviderId) {
    res.status(400).json({ error: '平台角色不允许指定 role_logistics_provider_id' });
    return;
  }
  if (nextRoleScope === 'logistics' && (!nextAdminProviderId || nextAdminProviderId !== nextRoleProviderId)) {
    res.status(400).json({ error: '物流商管理员归属必须与角色归属一致' });
    return;
  }

  // 物流商账号：不能把管理员迁移到平台或其他物流商
  if (actorProviderForUpdate !== null) {
    if (nextRoleScope !== 'logistics' || nextRoleProviderId !== actorProviderForUpdate || nextAdminProviderId !== actorProviderForUpdate) {
      res.status(403).json({ error: '无权将管理员变更到其他物流商或平台' });
      return;
    }
  }

  if (!(await roleExists(nextRole, { scope: nextRoleScope, logistics_provider_id: nextRoleProviderId }))) {
    res.status(400).json({ error: '管理员角色不合法' });
    return;
  }

  if (
    nextRole === 'super_admin'
    && nextRoleScope === 'platform'
    && !(targetAdmin.role === 'super_admin' && normalizeRoleScope(targetAdmin.role_scope) === 'platform')
  ) {
    const superAdminCount = await countActiveSuperAdmins();
    if (superAdminCount >= 1) {
      await logAdminAudit({
        adminId: req.adminId,
        action: 'admin.update_account',
        targetType: 'admin_user',
        targetId: adminId,
        result: 'denied',
        ip: getRequestIp(req),
        detail: 'super_admin_already_exists',
      });
      res.status(409).json({ error: '超级管理员只能有一个，无法继续添加' });
      return;
    }
  }

  if (adminId === req.adminId && (nextRole !== 'super_admin' || nextRoleScope !== 'platform')) {
    res.status(400).json({ error: '不能修改当前登录账号的超级管理员角色' });
    return;
  }

  if (Object.keys(payload).length === 0) {
    res.status(400).json({ error: '没有可更新的字段' });
    return;
  }

  const result = await updateAdminAccount(adminId, payload);
  if (result === 'duplicate_username') {
    res.status(409).json({ error: '管理员账号已存在' });
    return;
  }
  if (result === 'not_found') {
    res.status(404).json({ error: '管理员不存在' });
    return;
  }

  await logAdminAudit({
    adminId: req.adminId,
    action: 'admin.update_account',
    targetType: 'admin_user',
    targetId: adminId,
    result: 'success',
    ip: getRequestIp(req),
    detail: `fields=${Object.keys(payload).join(',')}`,
  });

  res.json({ message: '管理员信息已更新' });
});

router.delete('/admins/:id', adminAuth, csrfGuard, requirePermission(PERMISSIONS.ADMIN_DELETE), requireAdminManage, async (req: AdminRequest, res: Response): Promise<void> => {
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

  const target = await getAdminById(adminId);
  if (target && Number(target.is_system) === 1) {
    await logAdminAudit({
      adminId: req.adminId,
      action: 'admin.delete',
      targetType: 'admin_user',
      targetId: adminId,
      result: 'denied',
      ip: getRequestIp(req),
      detail: 'system_admin_protected',
    });
    res.status(400).json({ error: '物流商初始管理员账号不可删除' });
    return;
  }

  // 物流商账号：只能删除本物流商归属的管理员
  if (getActorProviderFilter(req) !== null && denyCrossProvider(req, res, target?.logistics_provider_id)) {
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

router.post('/admins/batch-delete', adminAuth, csrfGuard, requirePermission(PERMISSIONS.ADMIN_DELETE), requireAdminManage, async (req: AdminRequest, res: Response): Promise<void> => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: '请提供要删除的ID列表' });
    return;
  }
  const numIds = ids.map(Number).filter(n => Number.isInteger(n) && n > 0);
  // 排除当前登录管理员
  const safeIds = numIds.filter(id => id !== req.adminId);
  if (safeIds.length === 0) {
    res.status(400).json({ error: '不能删除当前登录账号' });
    return;
  }
  const deleted = await batchDeleteAdmins(safeIds, getActorProviderFilter(req));
  res.json({ message: `已删除 ${deleted} 条记录`, deleted });
});

// ==================== 物流商管理 ====================
const LOGISTICS_STATUS_SET = new Set(['active', 'inactive']);

router.get('/logistics', adminAuth, requirePermission(PERMISSIONS.LOGISTICS_VIEW), async (req: AdminRequest, res: Response): Promise<void> => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 10));
  const sortKey = String(req.query.sortKey || '').trim() || undefined;
  const sortOrder = String(req.query.sortOrder || '').trim() || undefined;
  const columnFilters = parseJsonQuery<Record<string, string>>(req.query.columnFilters);
  const dateFilters = parseJsonQuery<Record<string, [string, string]>>(req.query.dateFilters);
  const result = await getLogisticsProvidersPaged(page, limit, sortKey, sortOrder, columnFilters, dateFilters);
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

router.get('/logistics/search', adminAuth, requirePermission(PERMISSIONS.LOGISTICS_VIEW), async (req: AdminRequest, res: Response): Promise<void> => {
  const keyword = String(req.query.q || '').trim();
  if (!keyword) {
    res.status(400).json({ error: '搜索关键词不能为空' });
    return;
  }
  const data = await searchLogisticsProviders(keyword);
  res.json({ data, count: data.length });
});

router.get('/logistics/options', adminAuth, requirePermission(PERMISSIONS.LOGISTICS_VIEW), async (_req: AdminRequest, res: Response): Promise<void> => {
  const data = await getActiveLogisticsProviders();
  res.json({ data });
});

router.post('/logistics', adminAuth, csrfGuard, requirePermission(PERMISSIONS.LOGISTICS_CREATE), requireSuperAdmin, async (req: AdminRequest, res: Response): Promise<void> => {
  const { name, code, contact_name, contact_phone, email, website, status, remark } = req.body as Record<string, string>;
  if (!name || !name.trim()) {
    res.status(400).json({ error: '物流商名称不能为空' });
    return;
  }
  // 代号用于生成【初始管理员账号】admin@代号，必须以小写字母开头且仅含小写字母或数字
  const normalizedCode = typeof code === 'string' ? code.trim().toLowerCase() : '';
  if (!/^[a-z][a-z0-9]*$/.test(normalizedCode)) {
    res.status(400).json({ error: '物流商代号必须以小写字母开头，仅含小写字母或数字（用于生成初始管理员账号 admin@代号）' });
    return;
  }
  const duplicate = await getLogisticsProviderByCode(normalizedCode);
  if (duplicate) {
    res.status(409).json({ error: '物流商代号已存在' });
    return;
  }
  const normalizedStatus = LOGISTICS_STATUS_SET.has(String(status)) ? String(status) : 'active';
  const provider = await createLogisticsProvider({
    name: name.trim(),
    code: normalizedCode,
    contact_name: typeof contact_name === 'string' ? contact_name.trim() : undefined,
    contact_phone: typeof contact_phone === 'string' ? contact_phone.trim() : undefined,
    email: typeof email === 'string' ? email.trim() : undefined,
    website: typeof website === 'string' ? website.trim() : undefined,
    status: normalizedStatus,
    remark: typeof remark === 'string' ? remark.trim() : undefined,
  });
  // 自动创建【初始角色】Admin/admin 与【初始管理员账号】admin@代号（初始密码 88888888）
  await ensureLogisticsInitialAccess({ id: provider.id, code: normalizedCode, name: provider.name });
  await logAdminAudit({
    adminId: req.adminId,
    action: 'logistics.create',
    targetType: 'logistics_provider',
    targetId: provider.id,
    result: 'success',
    ip: getRequestIp(req),
    detail: `created_name=${provider.name}`,
  });
  res.status(201).json({ message: '物流商已创建', provider });
});

router.put('/logistics/:id', adminAuth, csrfGuard, requirePermission(PERMISSIONS.LOGISTICS_UPDATE), requireSuperAdmin, async (req: AdminRequest, res: Response): Promise<void> => {
  const id = toId(req.params.id);
  if (!id) {
    res.status(400).json({ error: '物流商ID不合法' });
    return;
  }
  const { name, code, contact_name, contact_phone, email, website, status, remark } = req.body as Record<string, string>;
  if (name !== undefined && !String(name).trim()) {
    res.status(400).json({ error: '物流商名称不能为空' });
    return;
  }
  if (status !== undefined && !LOGISTICS_STATUS_SET.has(String(status))) {
    res.status(400).json({ error: '物流商状态不合法' });
    return;
  }
  const ok = await updateLogisticsProvider(id, {
    name: name !== undefined ? String(name).trim() : undefined,
    code: code !== undefined ? String(code).trim() : undefined,
    contact_name: contact_name !== undefined ? String(contact_name).trim() : undefined,
    contact_phone: contact_phone !== undefined ? String(contact_phone).trim() : undefined,
    email: email !== undefined ? String(email).trim() : undefined,
    website: website !== undefined ? String(website).trim() : undefined,
    status: status !== undefined ? String(status) : undefined,
    remark: remark !== undefined ? String(remark).trim() : undefined,
  });
  if (!ok) {
    res.status(404).json({ error: '物流商不存在' });
    return;
  }
  await logAdminAudit({
    adminId: req.adminId,
    action: 'logistics.update',
    targetType: 'logistics_provider',
    targetId: id,
    result: 'success',
    ip: getRequestIp(req),
    detail: 'logistics_updated',
  });
  res.json({ message: '物流商已更新', id });
});

router.delete('/logistics/:id', adminAuth, csrfGuard, requirePermission(PERMISSIONS.LOGISTICS_DELETE), requireSuperAdmin, async (req: AdminRequest, res: Response): Promise<void> => {
  const id = toId(req.params.id);
  if (!id) {
    res.status(400).json({ error: '物流商ID不合法' });
    return;
  }
  const ok = await deleteLogisticsProvider(id);
  if (!ok) {
    res.status(404).json({ error: '物流商不存在' });
    return;
  }
  await logAdminAudit({
    adminId: req.adminId,
    action: 'logistics.delete',
    targetType: 'logistics_provider',
    targetId: id,
    result: 'success',
    ip: getRequestIp(req),
    detail: 'logistics_deleted',
  });
  res.json({ message: '物流商已删除', id });
});

router.post('/logistics/batch-delete', adminAuth, csrfGuard, requirePermission(PERMISSIONS.LOGISTICS_DELETE), requireSuperAdmin, async (req: AdminRequest, res: Response): Promise<void> => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: '请提供要删除的ID列表' });
    return;
  }
  const numIds = ids.map(Number).filter(n => Number.isInteger(n) && n > 0);
  if (numIds.length === 0) {
    res.status(400).json({ error: 'ID列表不合法' });
    return;
  }
  const deleted = await batchDeleteLogisticsProviders(numIds);
  res.json({ message: `已删除 ${deleted} 条记录`, deleted });
});

// ==================== 库位管理 ====================
// 校验并归一化数字（长/宽/高/容积/载重），空值返回 null，非法返回 undefined 表示错误
const normalizeStorageBinNumber = (value: unknown): number | null | undefined => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
};

// 由 area 参数组合生成库位号，用 "-" 隔开（至少填一个）
const buildStorageBinCode = (parts: Array<string | undefined>): string => {
  return parts.map((p) => String(p ?? '').trim()).filter((p) => p !== '').join('-');
};

// 从请求体解析并校验库位公共字段，出错时写响应并返回 null
const parseStorageBinBody = (
  body: Record<string, any>,
  res: Response
): {
  storage_bin: string;
  area_zone: string | null;
  area_aisle: string | null;
  area_section: string | null;
  area_tier: string | null;
  area_slot: string | null;
  size_length: number | null;
  size_width: number | null;
  size_height: number | null;
  volume: number | null;
  capacity: number | null;
  warehouse: string;
  description: string | null;
  is_enabled: boolean;
} | null => {
  const warehouse = String(body.warehouse ?? '').trim();
  if (!warehouse) {
    res.status(400).json({ error: '仓库名称不能为空' });
    return null;
  }
  const area_zone = String(body.area_zone ?? '').trim();
  const area_aisle = String(body.area_aisle ?? '').trim();
  const area_section = String(body.area_section ?? '').trim();
  const area_tier = String(body.area_tier ?? '').trim();
  const area_slot = String(body.area_slot ?? '').trim();
  const storage_bin = buildStorageBinCode([area_zone, area_aisle, area_section, area_tier, area_slot]);
  if (!storage_bin) {
    res.status(400).json({ error: '区/排/架/层/位 至少填写其中一项' });
    return null;
  }

  const size_length = normalizeStorageBinNumber(body.size_length);
  const size_width = normalizeStorageBinNumber(body.size_width);
  const size_height = normalizeStorageBinNumber(body.size_height);
  const volume = normalizeStorageBinNumber(body.volume);
  const capacity = normalizeStorageBinNumber(body.capacity);
  if ([size_length, size_width, size_height, volume, capacity].some((v) => v === undefined)) {
    res.status(400).json({ error: '长/宽/高/容积/载重 必须为非负数字' });
    return null;
  }

  return {
    storage_bin,
    area_zone: area_zone || null,
    area_aisle: area_aisle || null,
    area_section: area_section || null,
    area_tier: area_tier || null,
    area_slot: area_slot || null,
    size_length: size_length as number | null,
    size_width: size_width as number | null,
    size_height: size_height as number | null,
    volume: volume as number | null,
    capacity: capacity as number | null,
    warehouse,
    description: String(body.description ?? '').trim() || null,
    is_enabled: body.is_enabled === undefined ? true : Boolean(body.is_enabled),
  };
};

router.get('/storage-bins', adminAuth, requirePermission(PERMISSIONS.STORAGE_BIN_VIEW), async (req: AdminRequest, res: Response): Promise<void> => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 10));
  const sortKey = String(req.query.sortKey || '').trim() || undefined;
  const sortOrder = String(req.query.sortOrder || '').trim() || undefined;
  const columnFilters = parseJsonQuery<Record<string, string>>(req.query.columnFilters);
  const dateFilters = parseJsonQuery<Record<string, [string, string]>>(req.query.dateFilters);
  const result = await getStorageBinsPaged(page, limit, sortKey, sortOrder, columnFilters, dateFilters, getActorProviderFilter(req));
  res.json({
    data: result.data,
    pagination: { page, limit, total: result.total, pages: result.pages },
  });
});

router.get('/storage-bins/search', adminAuth, requirePermission(PERMISSIONS.STORAGE_BIN_VIEW), async (req: AdminRequest, res: Response): Promise<void> => {
  const keyword = String(req.query.q || '').trim();
  if (!keyword) {
    res.status(400).json({ error: '搜索关键词不能为空' });
    return;
  }
  const data = await searchStorageBins(keyword, getActorProviderFilter(req));
  res.json({ data, count: data.length });
});

router.post('/storage-bins', adminAuth, csrfGuard, requirePermission(PERMISSIONS.STORAGE_BIN_CREATE), async (req: AdminRequest, res: Response): Promise<void> => {
  const parsed = parseStorageBinBody(req.body || {}, res);
  if (!parsed) return;

  // 物流商账号：库位强制归属本物流商；平台账号：读取 body 指定的物流商（可空）
  const actorProvider = getActorProviderFilter(req);
  const resolvedProviderId = actorProvider !== null
    ? (actorProvider > 0 ? actorProvider : null)
    : (req.body?.logistics_provider_id !== undefined && req.body?.logistics_provider_id !== '' && req.body?.logistics_provider_id !== null
      ? (Number(req.body.logistics_provider_id) > 0 ? Number(req.body.logistics_provider_id) : null)
      : null);

  const duplicate = await findDuplicateStorageBin(parsed.warehouse, parsed.storage_bin, resolvedProviderId);
  if (duplicate) {
    res.status(409).json({ error: '同一仓库+物流商下该库位号已存在' });
    return;
  }

  const bin = await createStorageBin({ ...parsed, logistics_provider_id: resolvedProviderId });
  await logAdminAudit({
    adminId: req.adminId,
    action: 'storage_bin.create',
    targetType: 'storage_bin',
    targetId: bin.id,
    result: 'success',
    ip: getRequestIp(req),
    detail: `storage_bin=${parsed.storage_bin} warehouse=${parsed.warehouse}`,
  });
  res.status(201).json({ message: '库位已创建', bin });
});

router.put('/storage-bins/:id', adminAuth, csrfGuard, requirePermission(PERMISSIONS.STORAGE_BIN_UPDATE), async (req: AdminRequest, res: Response): Promise<void> => {
  const id = toId(req.params.id);
  if (!id) {
    res.status(400).json({ error: '库位ID不合法' });
    return;
  }
  const existing = await getStorageBinById(id);
  if (!existing) {
    res.status(404).json({ error: '库位不存在' });
    return;
  }
  if (denyCrossProvider(req, res, existing.logistics_provider_id)) return;

  const parsed = parseStorageBinBody(req.body || {}, res);
  if (!parsed) return;

  // 物流商账号：不允许改变归属；平台账号：可指定物流商
  const actorProvider = getActorProviderFilter(req);
  const resolvedProviderId = actorProvider !== null
    ? existing.logistics_provider_id
    : (req.body?.logistics_provider_id !== undefined && req.body?.logistics_provider_id !== '' && req.body?.logistics_provider_id !== null
      ? (Number(req.body.logistics_provider_id) > 0 ? Number(req.body.logistics_provider_id) : null)
      : null);

  const duplicate = await findDuplicateStorageBin(parsed.warehouse, parsed.storage_bin, resolvedProviderId, id);
  if (duplicate) {
    res.status(409).json({ error: '同一仓库+物流商下该库位号已存在' });
    return;
  }

  const ok = await updateStorageBin(id, { ...parsed, logistics_provider_id: resolvedProviderId });
  if (!ok) {
    res.status(404).json({ error: '库位不存在' });
    return;
  }
  await logAdminAudit({
    adminId: req.adminId,
    action: 'storage_bin.update',
    targetType: 'storage_bin',
    targetId: id,
    result: 'success',
    ip: getRequestIp(req),
    detail: 'storage_bin_updated',
  });
  res.json({ message: '库位已更新', id });
});

router.delete('/storage-bins/:id', adminAuth, csrfGuard, requirePermission(PERMISSIONS.STORAGE_BIN_DELETE), async (req: AdminRequest, res: Response): Promise<void> => {
  const id = toId(req.params.id);
  if (!id) {
    res.status(400).json({ error: '库位ID不合法' });
    return;
  }
  const existing = await getStorageBinById(id);
  if (!existing) {
    res.status(404).json({ error: '库位不存在' });
    return;
  }
  if (denyCrossProvider(req, res, existing.logistics_provider_id)) return;

  const ok = await deleteStorageBin(id);
  if (!ok) {
    res.status(404).json({ error: '库位不存在' });
    return;
  }
  await logAdminAudit({
    adminId: req.adminId,
    action: 'storage_bin.delete',
    targetType: 'storage_bin',
    targetId: id,
    result: 'success',
    ip: getRequestIp(req),
    detail: 'storage_bin_deleted',
  });
  res.json({ message: '库位已删除', id });
});

router.post('/storage-bins/batch-delete', adminAuth, csrfGuard, requirePermission(PERMISSIONS.STORAGE_BIN_DELETE), async (req: AdminRequest, res: Response): Promise<void> => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: '请提供要删除的ID列表' });
    return;
  }
  const numIds = ids.map(Number).filter(n => Number.isInteger(n) && n > 0);
  if (numIds.length === 0) {
    res.status(400).json({ error: 'ID列表不合法' });
    return;
  }
  // 物流商账号：仅允许删除本物流商的库位
  const actorProvider = getActorProviderFilter(req);
  let allowedIds = numIds;
  if (actorProvider !== null) {
    const checked = await Promise.all(numIds.map(async (id) => {
      const bin = await getStorageBinById(id);
      return bin && Number(bin.logistics_provider_id) === actorProvider ? id : null;
    }));
    allowedIds = checked.filter((v): v is number => v !== null);
    if (allowedIds.length === 0) {
      res.status(403).json({ error: '无权删除其他物流商的库位' });
      return;
    }
  }
  const deleted = await batchDeleteStorageBins(allowedIds);
  res.json({ message: `已删除 ${deleted} 条记录`, deleted });
});

// ============ 系统设置 - 包裹状态字典（仅平台管理员） ============
router.get('/parcel-statuses', adminAuth, requirePermission(PERMISSIONS.PARCEL_STATUS_VIEW), requirePlatformScope, async (req: AdminRequest, res: Response): Promise<void> => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 20));
  const sortKey = String(req.query.sortKey || '').trim() || undefined;
  const sortOrder = String(req.query.sortOrder || '').trim() || undefined;
  const columnFilters = parseJsonQuery<Record<string, string>>(req.query.columnFilters);
  const dateFilters = parseJsonQuery<Record<string, [string, string]>>(req.query.dateFilters);
  const result = await getParcelStatusesPaged(page, limit, sortKey, sortOrder, columnFilters, dateFilters);
  res.json({
    data: result.data,
    pagination: { page, limit, total: result.total, pages: result.pages },
  });
});

router.get('/parcel-statuses/search', adminAuth, requirePermission(PERMISSIONS.PARCEL_STATUS_VIEW), requirePlatformScope, async (req: AdminRequest, res: Response): Promise<void> => {
  const keyword = String(req.query.q || '').trim();
  if (!keyword) {
    res.status(400).json({ error: '搜索关键词不能为空' });
    return;
  }
  const data = await searchParcelStatuses(keyword);
  res.json({ data, count: data.length });
});

// 供包裹管理下拉/标签使用：任何可查看包裹的管理员均可读取启用中的状态字典项
router.get('/parcel-statuses/options', adminAuth, requirePermission(PERMISSIONS.PARCEL_VIEW), async (_req: AdminRequest, res: Response): Promise<void> => {
  const data = await getEnabledParcelStatuses();
  res.json({ data });
});

const validateParcelStatusInput = (body: Record<string, unknown>): { error?: string; value?: { status_id: number; status_code: string; status_name: string; status_type: string; status_category: string | null; is_enabled: boolean } } => {
  const statusId = Number(body.status_id);
  if (!Number.isInteger(statusId) || statusId <= 0) {
    return { error: '状态ID必须为正整数' };
  }
  const statusCode = String(body.status_code ?? '').trim();
  if (!/^[a-z][a-z0-9_]*$/.test(statusCode)) {
    return { error: '状态编码必须以小写字母开头，仅含小写字母、数字或下划线' };
  }
  const statusName = String(body.status_name ?? '').trim();
  if (!statusName) {
    return { error: '状态名称不能为空' };
  }
  const statusType = String(body.status_type ?? '').trim();
  if (!PARCEL_STATUS_TYPE_SET.has(statusType)) {
    return { error: '状态类型必须为「货物态」或「信息态」' };
  }
  const statusCategory = String(body.status_category ?? '').trim();
  const isEnabled = body.is_enabled === undefined ? true : Boolean(body.is_enabled);
  return {
    value: {
      status_id: statusId,
      status_code: statusCode,
      status_name: statusName,
      status_type: statusType,
      status_category: statusCategory || null,
      is_enabled: isEnabled,
    },
  };
};

router.post('/parcel-statuses', adminAuth, csrfGuard, requirePermission(PERMISSIONS.PARCEL_STATUS_CREATE), requirePlatformScope, async (req: AdminRequest, res: Response): Promise<void> => {
  const { error, value } = validateParcelStatusInput(req.body as Record<string, unknown>);
  if (error || !value) {
    res.status(400).json({ error });
    return;
  }
  const conflict = await findParcelStatusConflict(value.status_id, value.status_code);
  if (conflict) {
    res.status(409).json({ error: conflict.status_id === value.status_id ? '状态ID已存在' : '状态编码已存在' });
    return;
  }
  const created = await createParcelStatus(value);
  await logAdminAudit({
    adminId: req.adminId,
    action: 'parcel_status.create',
    targetType: 'parcel_status',
    targetId: created.id,
    result: 'success',
    ip: getRequestIp(req),
    detail: `created_code=${value.status_code}`,
  });
  res.status(201).json({ message: '包裹状态已创建', id: created.id });
});

router.put('/parcel-statuses/:id', adminAuth, csrfGuard, requirePermission(PERMISSIONS.PARCEL_STATUS_UPDATE), requirePlatformScope, async (req: AdminRequest, res: Response): Promise<void> => {
  const id = toId(req.params.id);
  if (!id) {
    res.status(400).json({ error: '状态记录ID不合法' });
    return;
  }
  const existing = await getParcelStatusById(id);
  if (!existing) {
    res.status(404).json({ error: '包裹状态不存在' });
    return;
  }
  const { error, value } = validateParcelStatusInput(req.body as Record<string, unknown>);
  if (error || !value) {
    res.status(400).json({ error });
    return;
  }
  const conflict = await findParcelStatusConflict(value.status_id, value.status_code, id);
  if (conflict) {
    res.status(409).json({ error: conflict.status_id === value.status_id ? '状态ID已存在' : '状态编码已存在' });
    return;
  }
  const ok = await updateParcelStatusDict(id, value);
  if (!ok) {
    res.status(404).json({ error: '包裹状态不存在' });
    return;
  }
  await logAdminAudit({
    adminId: req.adminId,
    action: 'parcel_status.update',
    targetType: 'parcel_status',
    targetId: id,
    result: 'success',
    ip: getRequestIp(req),
    detail: 'parcel_status_updated',
  });
  res.json({ message: '包裹状态已更新', id });
});

router.delete('/parcel-statuses/:id', adminAuth, csrfGuard, requirePermission(PERMISSIONS.PARCEL_STATUS_DELETE), requirePlatformScope, async (req: AdminRequest, res: Response): Promise<void> => {
  const id = toId(req.params.id);
  if (!id) {
    res.status(400).json({ error: '状态记录ID不合法' });
    return;
  }
  const ok = await deleteParcelStatus(id);
  if (!ok) {
    res.status(404).json({ error: '包裹状态不存在' });
    return;
  }
  await logAdminAudit({
    adminId: req.adminId,
    action: 'parcel_status.delete',
    targetType: 'parcel_status',
    targetId: id,
    result: 'success',
    ip: getRequestIp(req),
    detail: 'parcel_status_deleted',
  });
  res.json({ message: '包裹状态已删除', id });
});

router.post('/parcel-statuses/batch-delete', adminAuth, csrfGuard, requirePermission(PERMISSIONS.PARCEL_STATUS_DELETE), requirePlatformScope, async (req: AdminRequest, res: Response): Promise<void> => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: '请提供要删除的ID列表' });
    return;
  }
  const numIds = ids.map(Number).filter(n => Number.isInteger(n) && n > 0);
  if (numIds.length === 0) {
    res.status(400).json({ error: 'ID列表不合法' });
    return;
  }
  const deleted = await batchDeleteParcelStatuses(numIds);
  res.json({ message: `已删除 ${deleted} 条记录`, deleted });
});

export default router;