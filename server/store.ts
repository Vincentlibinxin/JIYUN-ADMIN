import bcrypt from 'bcryptjs';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export interface User {
  id: number;
  username: string;
  phone: string | null;
  email: string | null;
  real_name: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: number;
  user_id: number;
  total_amount: number;
  currency: string;
  status: string;
  created_at: string;
}

export interface Parcel {
  id: number;
  user_id: number;
  tracking_number: string;
  origin: string;
  destination: string;
  weight: number | null;
  status: string;
  estimated_delivery: string | null;
  created_at: string;
}

export interface SmsInfo {
  id: number;
  phone: string;
  code: string;
  verified: number;
  created_at: string;
  expires_at: string;
}

export interface AdminUser {
  id: number;
  username: string;
  password: string;
  email: string;
  role: string;
  status: string;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

interface DbShape {
  users: User[];
  orders: Order[];
  parcels: Parcel[];
  sms: SmsInfo[];
  admins: AdminUser[];
  nextIds: {
    users: number;
    orders: number;
    parcels: number;
    sms: number;
    admins: number;
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, 'data');
const dbFile = path.join(dataDir, 'db.json');

let db: DbShape | null = null;

const now = (): string => new Date().toISOString();

const daysLater = (days: number): string => {
  const dt = new Date();
  dt.setDate(dt.getDate() + days);
  return dt.toISOString();
};

const createSeed = async (): Promise<DbShape> => {
  const ts = now();
  const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin123456';
  const hashed = await bcrypt.hash(defaultAdminPassword, 10);

  return {
    users: [
      {
        id: 1,
        username: 'user001',
        phone: '13800000001',
        email: 'user001@example.com',
        real_name: '张三',
        address: '台北市信义区 1 号',
        created_at: ts,
        updated_at: ts,
      },
      {
        id: 2,
        username: 'user002',
        phone: '13800000002',
        email: 'user002@example.com',
        real_name: '李四',
        address: '新北市板桥区 2 号',
        created_at: ts,
        updated_at: ts,
      },
      {
        id: 3,
        username: 'user003',
        phone: '13800000003',
        email: 'user003@example.com',
        real_name: '王五',
        address: '台中市西屯区 3 号',
        created_at: ts,
        updated_at: ts,
      },
    ],
    orders: [
      { id: 1, user_id: 1, total_amount: 199, currency: 'TWD', status: 'pending', created_at: ts },
      { id: 2, user_id: 2, total_amount: 329.5, currency: 'TWD', status: 'processing', created_at: ts },
      { id: 3, user_id: 3, total_amount: 128, currency: 'TWD', status: 'completed', created_at: ts },
    ],
    parcels: [
      {
        id: 1,
        user_id: 1,
        tracking_number: 'RT20260001',
        origin: '福州',
        destination: '台北',
        weight: 2.5,
        status: 'pending',
        estimated_delivery: daysLater(5),
        created_at: ts,
      },
      {
        id: 2,
        user_id: 2,
        tracking_number: 'RT20260002',
        origin: '厦门',
        destination: '高雄',
        weight: 1.8,
        status: 'shipping',
        estimated_delivery: daysLater(3),
        created_at: ts,
      },
      {
        id: 3,
        user_id: 3,
        tracking_number: 'RT20260003',
        origin: '泉州',
        destination: '台中',
        weight: 4.2,
        status: 'arrived',
        estimated_delivery: daysLater(1),
        created_at: ts,
      },
    ],
    sms: [
      { id: 1, phone: '13800000001', code: '123456', verified: 1, created_at: ts, expires_at: daysLater(1) },
      { id: 2, phone: '13800000002', code: '234567', verified: 0, created_at: ts, expires_at: daysLater(1) },
      { id: 3, phone: '13800000003', code: '345678', verified: 0, created_at: ts, expires_at: daysLater(1) },
    ],
    admins: [
      {
        id: 1,
        username: process.env.DEFAULT_ADMIN_USERNAME || 'admin',
        password: hashed,
        email: process.env.DEFAULT_ADMIN_EMAIL || 'admin@example.com',
        role: 'super_admin',
        status: 'active',
        last_login: null,
        created_at: ts,
        updated_at: ts,
      },
    ],
    nextIds: {
      users: 4,
      orders: 4,
      parcels: 4,
      sms: 4,
      admins: 2,
    },
  };
};

const ensureDb = async (): Promise<void> => {
  if (db) {
    return;
  }

  await fs.mkdir(dataDir, { recursive: true });

  try {
    const content = await fs.readFile(dbFile, 'utf-8');
    db = JSON.parse(content) as DbShape;
  } catch {
    db = await createSeed();
    await persist();
  }
};

const persist = async (): Promise<void> => {
  if (!db) {
    return;
  }
  await fs.writeFile(dbFile, JSON.stringify(db, null, 2), 'utf-8');
};

const paginate = <T>(list: T[], page: number, limit: number): { data: T[]; total: number; pages: number } => {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10;
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / safeLimit));
  const start = (safePage - 1) * safeLimit;
  return {
    data: list.slice(start, start + safeLimit),
    total,
    pages,
  };
};

export const initStore = async (): Promise<void> => {
  await ensureDb();
};

export const getAdminByUsername = async (username: string): Promise<AdminUser | null> => {
  await ensureDb();
  return db!.admins.find((item) => item.username === username) || null;
};

export const updateAdminLastLogin = async (adminId: number): Promise<void> => {
  await ensureDb();
  const admin = db!.admins.find((item) => item.id === adminId);
  if (admin) {
    admin.last_login = now();
    admin.updated_at = now();
    await persist();
  }
};

export const getUsersPaged = async (page: number, limit: number) => {
  await ensureDb();
  const sorted = [...db!.users].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return paginate(sorted, page, limit);
};

export const searchUsers = async (keyword: string): Promise<User[]> => {
  await ensureDb();
  const query = keyword.toLowerCase();
  return db!.users.filter((item) =>
    [item.username, item.phone || '', item.email || '', item.real_name || '']
      .join('|')
      .toLowerCase()
      .includes(query)
  );
};

export const deleteUser = async (userId: number): Promise<boolean> => {
  await ensureDb();
  const before = db!.users.length;
  db!.users = db!.users.filter((item) => item.id !== userId);
  if (db!.users.length === before) {
    return false;
  }
  db!.orders = db!.orders.filter((item) => item.user_id !== userId);
  db!.parcels = db!.parcels.filter((item) => item.user_id !== userId);
  await persist();
  return true;
};

export const getOrdersPaged = async (page: number, limit: number) => {
  await ensureDb();
  const sorted = [...db!.orders].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return paginate(sorted, page, limit);
};

export const updateOrderStatus = async (orderId: number, status: string): Promise<boolean> => {
  await ensureDb();
  const target = db!.orders.find((item) => item.id === orderId);
  if (!target) {
    return false;
  }
  target.status = status;
  await persist();
  return true;
};

export const getSmsPaged = async (page: number, limit: number) => {
  await ensureDb();
  const sorted = [...db!.sms].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return paginate(sorted, page, limit);
};

export const getParcelsPaged = async (page: number, limit: number) => {
  await ensureDb();
  const sorted = [...db!.parcels].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return paginate(sorted, page, limit);
};

export const updateParcelStatus = async (parcelId: number, status: string): Promise<boolean> => {
  await ensureDb();
  const target = db!.parcels.find((item) => item.id === parcelId);
  if (!target) {
    return false;
  }
  target.status = status;
  await persist();
  return true;
};

export const getAdminsPaged = async (page: number, limit: number) => {
  await ensureDb();
  const list = db!.admins.map(({ password, ...rest }) => rest);
  const sorted = [...list].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return paginate(sorted, page, limit);
};

export const createAdmin = async (payload: {
  username: string;
  password: string;
  email: string;
  role: string;
}) => {
  await ensureDb();
  if (db!.admins.some((item) => item.username === payload.username)) {
    return null;
  }

  const id = db!.nextIds.admins++;
  const ts = now();
  const hashed = await bcrypt.hash(payload.password, 10);
  const admin: AdminUser = {
    id,
    username: payload.username,
    password: hashed,
    email: payload.email,
    role: payload.role || 'admin',
    status: 'active',
    last_login: null,
    created_at: ts,
    updated_at: ts,
  };
  db!.admins.push(admin);
  await persist();

  const { password, ...safe } = admin;
  return safe;
};

export const updateAdminStatus = async (adminId: number, status: string): Promise<boolean> => {
  await ensureDb();
  const target = db!.admins.find((item) => item.id === adminId);
  if (!target) {
    return false;
  }
  target.status = status;
  target.updated_at = now();
  await persist();
  return true;
};

export const deleteAdmin = async (adminId: number): Promise<boolean> => {
  await ensureDb();
  const before = db!.admins.length;
  db!.admins = db!.admins.filter((item) => item.id !== adminId);
  if (db!.admins.length === before) {
    return false;
  }
  await persist();
  return true;
};