import bcrypt from 'bcryptjs';
import { Request, Response, Router } from 'express';
import jwt from 'jsonwebtoken';
import {
  createAdmin,
  deleteAdmin,
  deleteUser,
  getAdminByUsername,
  getAdminsPaged,
  getOrdersPaged,
  getParcelsPaged,
  getSmsPaged,
  getUsersPaged,
  searchUsers,
  updateAdminLastLogin,
  updateAdminStatus,
  updateOrderStatus,
  updateParcelStatus,
} from '../db';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'jiyun-admin-local-secret';

interface AdminRequest extends Request {
  adminId?: number;
}

const adminAuth = (req: AdminRequest, res: Response, next: () => void): void => {
  const token = req.headers.authorization?.split(' ')[1];
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

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      res.status(400).json({ error: '用户名和密码不能为空' });
      return;
    }

    const admin = await getAdminByUsername(username);
    if (!admin) {
      res.status(401).json({ error: '用户名或密码错误' });
      return;
    }
    if (admin.status !== 'active') {
      res.status(403).json({ error: '账号已停用' });
      return;
    }

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) {
      res.status(401).json({ error: '用户名或密码错误' });
      return;
    }

    await updateAdminLastLogin(admin.id);
    const token = jwt.sign({ adminId: admin.id, type: 'admin' }, JWT_SECRET, { expiresIn: '24h' });

    res.json({
      message: '登录成功',
      token,
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

router.delete('/users/:id', adminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
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

router.patch('/orders/:id', adminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const status = String(req.body?.status || '').trim();
  if (!status) {
    res.status(400).json({ error: '状态不能为空' });
    return;
  }
  const orderId = Number(req.params.id);
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

router.patch('/parcels/:id', adminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const status = String(req.body?.status || '').trim();
  if (!status) {
    res.status(400).json({ error: '状态不能为空' });
    return;
  }
  const parcelId = Number(req.params.id);
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

router.post('/admins', adminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const { username, password, email, role } = req.body as {
    username?: string;
    password?: string;
    email?: string;
    role?: string;
  };

  if (!username || !password || !email) {
    res.status(400).json({ error: '用户名、密码和邮箱不能为空' });
    return;
  }

  const admin = await createAdmin({
    username,
    password,
    email,
    role: role || 'admin',
  });

  if (!admin) {
    res.status(409).json({ error: '管理员已存在' });
    return;
  }

  res.status(201).json({ message: '管理员已创建', admin });
});

router.patch('/admins/:id', adminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const status = String(req.body?.status || '').trim();
  if (!status) {
    res.status(400).json({ error: '状态不能为空' });
    return;
  }
  const adminId = Number(req.params.id);
  const ok = await updateAdminStatus(adminId, status);
  if (!ok) {
    res.status(404).json({ error: '管理员不存在' });
    return;
  }
  res.json({ message: '管理员状态已更新', adminId, status });
});

router.delete('/admins/:id', adminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const adminId = Number(req.params.id);
  const ok = await deleteAdmin(adminId);
  if (!ok) {
    res.status(404).json({ error: '管理员不存在' });
    return;
  }
  res.json({ message: '管理员已删除', adminId });
});

export default router;