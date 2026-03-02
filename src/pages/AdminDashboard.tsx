import { useState, useEffect } from 'react';
import { Home, Users, User, ShoppingCart, MessageCircle, Package, ClipboardList, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Pagination from '../components/Pagination';
import { API_BASE } from '../lib/config';

interface User {
  id: number;
  username: string;
  phone: string | null;
  email: string | null;
  real_name: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
}

interface Order {
  id: number;
  user_id: number;
  total_amount: number | string;
  currency: string;
  status: string;
  created_at: string;
}

interface Parcel {
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

interface SmsInfo {
  id: number;
  phone: string;
  code: string;
  verified: number;
  created_at: string;
  expires_at: string;
}

interface AdminUser {
  id: number;
  username: string;
  email: string;
  role: string;
  status: string;
  last_login: string | null;
  created_at: string;
}

interface Stats {
  totalUsers: number;
  totalOrders: number;
  totalParcels: number;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [activeMenu, setActiveMenu] = useState('overview');
  const [users, setUsers] = useState<User[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [smsItems, setSmsItems] = useState<SmsInfo[]>([]);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<Stats>({ totalUsers: 0, totalOrders: 0, totalParcels: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [smsLoading, setSmsLoading] = useState(false);
  const [parcelsLoading, setParcelsLoading] = useState(false);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [orderPage, setOrderPage] = useState(1);
  const [orderPageSize, setOrderPageSize] = useState(50);
  const [orderTotalPages, setOrderTotalPages] = useState(1);
  const [orderTotalItems, setOrderTotalItems] = useState(0);
  const [smsPage, setSmsPage] = useState(1);
  const [smsPageSize, setSmsPageSize] = useState(50);
  const [smsTotalPages, setSmsTotalPages] = useState(1);
  const [smsTotalItems, setSmsTotalItems] = useState(0);
  const [parcelPage, setParcelPage] = useState(1);
  const [parcelPageSize, setParcelPageSize] = useState(50);
  const [parcelTotalPages, setParcelTotalPages] = useState(1);
  const [parcelTotalItems, setParcelTotalItems] = useState(0);
  const [adminPage, setAdminPage] = useState(1);
  const [adminPageSize, setAdminPageSize] = useState(50);
  const [adminTotalPages, setAdminTotalPages] = useState(1);
  const [adminTotalItems, setAdminTotalItems] = useState(0);
  const [newAdmin, setNewAdmin] = useState({ username: '', password: '', email: '', role: 'admin' });
  const [adminUser, setAdminUser] = useState<any>(() => {
    const raw = localStorage.getItem('adminUser');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });

  const forceRelogin = () => {
    sessionStorage.setItem('adminAuthExpired', '1');
    sessionStorage.removeItem('adminCsrfToken');
    localStorage.removeItem('adminUser');
    navigate('/login');
  };

  const getCsrfToken = (): string => {
    return sessionStorage.getItem('adminCsrfToken') || '';
  };

  const adminFetch = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const method = (init.method || 'GET').toUpperCase();
    const headers = new Headers(init.headers || {});
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      const csrfToken = getCsrfToken();
      if (csrfToken) {
        headers.set('X-CSRF-Token', csrfToken);
      }
      if (!headers.has('Content-Type') && init.body) {
        headers.set('Content-Type', 'application/json');
      }
    }

    return fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });
  };

  const ensureAuthorized = (response: Response): boolean => {
    if (response.status === 401) {
      setError('登入狀態已過期，請重新登入');
      forceRelogin();
      return false;
    }
    return true;
  };

  const ensureSession = async (): Promise<boolean> => {
    try {
      const response = await adminFetch('/admin/session');
      if (!ensureAuthorized(response)) return false;
      if (!response.ok) return false;
      const data = await response.json();
      const admin = data?.admin || null;
      if (admin) {
        setAdminUser(admin);
        localStorage.setItem('adminUser', JSON.stringify(admin));
      }
      if (data?.csrfToken) {
        sessionStorage.setItem('adminCsrfToken', data.csrfToken);
      }
      return true;
    } catch {
      forceRelogin();
      return false;
    }
  };

  useEffect(() => {
    let mounted = true;
    const boot = async () => {
      const ok = await ensureSession();
      if (!ok || !mounted) return;
      fetchUsers();
      fetchOrders();
      fetchParcels();
    };
    boot();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  useEffect(() => {
    if (activeTab === 'sms') {
      fetchSms();
    }
    if (activeTab === 'admins') {
      fetchAdmins();
    }
  }, [activeTab]);

  const fetchUsers = async (page: number = 1, size: number = pageSize) => {
    try {
      setLoading(true);
      const response = await adminFetch(`/admin/users?page=${page}&limit=${size}`);
      if (!ensureAuthorized(response)) return;
      if (!response.ok) throw new Error('fetch users failed');
      const data = await response.json();
      setUsers(data.data || []);
      setCurrentPage(page);
      setPageSize(size);
      setTotalPages(data.pagination?.pages || 1);
      setStats(prev => ({ ...prev, totalUsers: data.pagination?.total || 0 }));
    } catch (err) {
      setError('讀取會員失敗');
    } finally {
      setLoading(false);
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
    fetchUsers(1, newSize);
  };

  const fetchOrders = async (page: number = 1, size: number = orderPageSize) => {
    try {
      setOrdersLoading(true);
      const response = await adminFetch(`/admin/orders?page=${page}&limit=${size}`);
      if (!ensureAuthorized(response)) return;
      if (!response.ok) throw new Error('fetch orders failed');
      const data = await response.json();
      setOrders(data.data || []);
      setOrderPage(page);
      setOrderPageSize(size);
      setOrderTotalPages(data.pagination?.pages || 1);
      setOrderTotalItems(data.pagination?.total || 0);
      setStats(prev => ({ ...prev, totalOrders: data.pagination?.total || 0 }));
    } catch (err) {
      setError('讀取訂單失敗');
    } finally {
      setOrdersLoading(false);
    }
  };

  const handleOrderPageSizeChange = (newSize: number) => {
    setOrderPageSize(newSize);
    setOrderPage(1);
    fetchOrders(1, newSize);
  };

  const fetchSms = async (page: number = 1, size: number = smsPageSize) => {
    try {
      setSmsLoading(true);
      const response = await adminFetch(`/admin/sms?page=${page}&limit=${size}`);
      if (!ensureAuthorized(response)) return;
      if (!response.ok) throw new Error('fetch sms failed');
      const data = await response.json();
      setSmsItems(data.data || []);
      setSmsPage(page);
      setSmsPageSize(size);
      setSmsTotalPages(data.pagination?.pages || 1);
      setSmsTotalItems(data.pagination?.total || 0);
    } catch (err) {
      setError('讀取簡訊紀錄失敗');
    } finally {
      setSmsLoading(false);
    }
  };

  const handleSmsPageSizeChange = (newSize: number) => {
    setSmsPageSize(newSize);
    setSmsPage(1);
    fetchSms(1, newSize);
  };

  const fetchParcels = async (page: number = 1, size: number = parcelPageSize) => {
    try {
      setParcelsLoading(true);
      const response = await adminFetch(`/admin/parcels?page=${page}&limit=${size}`);
      if (!ensureAuthorized(response)) return;
      if (!response.ok) throw new Error('fetch parcels failed');
      const data = await response.json();
      setParcels(data.data || []);
      setParcelPage(page);
      setParcelPageSize(size);
      setParcelTotalPages(data.pagination?.pages || 1);
      setParcelTotalItems(data.pagination?.total || 0);
      setStats(prev => ({ ...prev, totalParcels: data.pagination?.total || 0 }));
    } catch (err) {
      setError('讀取包裹失敗');
    } finally {
      setParcelsLoading(false);
    }
  };

  const handleParcelPageSizeChange = (newSize: number) => {
    setParcelPageSize(newSize);
    setParcelPage(1);
    fetchParcels(1, newSize);
  };

  const fetchAdmins = async (page: number = 1, size: number = adminPageSize) => {
    try {
      setAdminsLoading(true);
      const response = await adminFetch(`/admin/admins?page=${page}&limit=${size}`);
      if (!ensureAuthorized(response)) return;
      if (!response.ok) throw new Error('fetch admins failed');
      const data = await response.json();
      setAdmins(data.data || []);
      setAdminPage(page);
      setAdminPageSize(size);
      setAdminTotalPages(data.pagination?.pages || 1);
      setAdminTotalItems(data.pagination?.total || 0);
    } catch (err) {
      setError('讀取管理員失敗');
    } finally {
      setAdminsLoading(false);
    }
  };

  const handleAdminPageSizeChange = (newSize: number) => {
    setAdminPageSize(newSize);
    setAdminPage(1);
    fetchAdmins(1, newSize);
  };

  const searchUsers = async () => {
    if (!searchQuery.trim()) {
      setCurrentPage(1);
      fetchUsers(1);
      return;
    }

    try {
      setLoading(true);
      setCurrentPage(1);
      const response = await adminFetch(`/admin/users/search?q=${encodeURIComponent(searchQuery)}`);
      if (!ensureAuthorized(response)) return;
      if (!response.ok) throw new Error('search users failed');
      const data = await response.json();
      setUsers(data.data || []);
      setTotalPages(1);
    } catch (err) {
      setError('搜尋失敗');
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = async (id: number) => {
    if (!confirm('確定要刪除此會員嗎？')) return;

    try {
      const response = await adminFetch(`/admin/users/${id}`, {
        method: 'DELETE',
      });

      if (!ensureAuthorized(response)) return;

      if (response.ok) {
        fetchUsers(currentPage);
      } else {
        setError('刪除會員失敗');
      }
    } catch (err) {
      setError('刪除失敗');
    }
  };

  const updateOrderStatus = async (orderId: number, newStatus: string) => {
    try {
      const response = await adminFetch(`/admin/orders/${orderId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      });

      if (!ensureAuthorized(response)) return;

      if (response.ok) {
        fetchOrders();
      }
    } catch (err) {
      setError('更新失敗');
    }
  };

  const updateParcelStatus = async (parcelId: number, newStatus: string) => {
    try {
      const response = await adminFetch(`/admin/parcels/${parcelId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      });

      if (!ensureAuthorized(response)) return;

      if (response.ok) {
        fetchParcels(parcelPage, parcelPageSize);
      }
    } catch (err) {
      setError('更新包裹失敗');
    }
  };

  const createAdminUser = async () => {
    if (!newAdmin.username || !newAdmin.password || !newAdmin.email) {
      setError('請完整填寫管理員資訊');
      return;
    }

    try {
      const response = await adminFetch('/admin/admins', {
        method: 'POST',
        body: JSON.stringify(newAdmin)
      });

      if (!ensureAuthorized(response)) return;

      if (response.ok) {
        setNewAdmin({ username: '', password: '', email: '', role: 'admin' });
        fetchAdmins(1, adminPageSize);
      } else {
        const data = await response.json();
        setError(data.error || '新增管理員失敗');
      }
    } catch (err) {
      setError('新增管理員失敗');
    }
  };

  const updateAdminAccountStatus = async (adminId: number, status: string) => {
    try {
      const response = await adminFetch(`/admin/admins/${adminId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });

      if (!ensureAuthorized(response)) return;

      if (response.ok) {
        fetchAdmins(adminPage, adminPageSize);
      }
    } catch (err) {
      setError('更新管理員失敗');
    }
  };

  const deleteAdminUser = async (adminId: number) => {
    if (!confirm('確定要刪除此管理員嗎？')) return;

    try {
      const response = await adminFetch(`/admin/admins/${adminId}`, {
        method: 'DELETE',
      });

      if (!ensureAuthorized(response)) return;

      if (response.ok) {
        fetchAdmins(adminPage, adminPageSize);
      } else {
        setError('刪除管理員失敗');
      }
    } catch (err) {
      setError('刪除管理員失敗');
    }
  };

  const handleLogout = async () => {
    try {
      await adminFetch('/admin/logout', { method: 'POST' });
    } finally {
      forceRelogin();
    }
  };

  const statusColors: { [key: string]: string } = {
    'pending': 'bg-yellow-100 text-yellow-800',
    'processing': 'bg-blue-100 text-blue-800',
    'shipped': 'bg-purple-100 text-purple-800',
    'delivered': 'bg-green-100 text-green-800',
    'cancelled': 'bg-red-100 text-red-800',
    'arrived': 'bg-indigo-100 text-indigo-800',
    'shipping': 'bg-teal-100 text-teal-800',
    'completed': 'bg-green-100 text-green-800',
    'active': 'bg-green-100 text-green-800',
    'disabled': 'bg-gray-200 text-gray-700'
  };

  const toAmount = (value: number | string): number => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const filteredOrders = orderSearchQuery.trim()
    ? orders.filter(order => {
        const query = orderSearchQuery.trim().toLowerCase();
        return (
          order.id.toString().includes(query) ||
          order.user_id.toString().includes(query) ||
          order.status.toLowerCase().includes(query)
        );
      })
    : orders;

  return (
    <div className="min-h-screen bg-gray-100 text-sm">
      {/* 頂部導航欄 */}
      <header className="fixed top-0 left-0 right-0 z-50 overflow-hidden h-14 bg-gradient-to-b from-[#1e293b] via-[#0f172a] to-[#020617] text-white shadow-sm border-b border-white/10">
         <div className="absolute inset-0 opacity-40 bg-[size:40px_40px] bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)]"></div>
         <div className="absolute w-[150%] h-[150%] rounded-[40%] border border-white/5 top-[-25%] left-[-25%] animate-[spin_60s_linear_infinite] pointer-events-none"></div>

        <div className="relative max-w-full px-3 h-full flex justify-between items-center z-10">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-lg font-bold text-white tracking-wide drop-shadow-md">物流管理系統</h1>
              <p className="text-slate-400 text-xs tracking-wider">RongTai</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-slate-200 text-sm font-medium">{adminUser?.username}</p>
              <p className="text-slate-500 text-xs">管理員</p>
            </div>
            <button
              onClick={handleLogout}
              className="px-3 py-1 bg-red-600/80 hover:bg-red-500 text-white rounded text-xs font-medium transition-colors backdrop-blur-sm border border-red-500/30"
            >
              登出
            </button>
          </div>
        </div>
      </header>

      <div className="flex pt-14">
        {/* 側邊導航欄 */}
        <aside className="fixed top-14 left-0 bottom-0 w-28 bg-[#FCFCFC] border-r border-gray-200 overflow-y-auto">
          <nav className="py-3 space-y-0.5">
            <button
              onClick={() => { setActiveMenu('overview'); setActiveTab('overview'); }}
              className={`w-full text-left px-3 py-2 text-sm font-medium transition-colors ${
                activeMenu === 'overview'
                  ? 'bg-blue-50 text-blue-600 border-l-4 border-blue-600'
                  : 'text-gray-700 hover:bg-gray-50 border-l-4 border-transparent'
              }`}
            >
              <div className="flex items-center gap-2">
                <Home className={`w-4 h-4 ${activeMenu === 'overview' ? 'text-blue-600' : 'text-gray-500'}`} aria-hidden="true" />
                <span>首頁</span>
              </div>
            </button>
            <button
              onClick={() => { setActiveMenu('users'); setActiveTab('users'); }}
              className={`w-full text-left px-3 py-2 text-sm font-medium transition-colors ${
                activeMenu === 'users'
                  ? 'bg-blue-50 text-blue-600 border-l-4 border-blue-600'
                  : 'text-gray-700 hover:bg-gray-50 border-l-4 border-transparent'
              }`}
            >
              <div className="flex items-center gap-2">
                <Users className={`w-4 h-4 ${activeMenu === 'users' ? 'text-blue-600' : 'text-gray-500'}`} aria-hidden="true" />
                <span>會員管理</span>
              </div>
            </button>
            <button
              onClick={() => { setActiveMenu('orders'); setActiveTab('orders'); }}
              className={`w-full text-left px-3 py-2 text-sm font-medium transition-colors ${
                activeMenu === 'orders'
                  ? 'bg-blue-50 text-blue-600 border-l-4 border-blue-600'
                  : 'text-gray-700 hover:bg-gray-50 border-l-4 border-transparent'
              }`}
            >
              <div className="flex items-center gap-2">
                <ShoppingCart className={`w-4 h-4 ${activeMenu === 'orders' ? 'text-blue-600' : 'text-gray-500'}`} aria-hidden="true" />
                <span>訂單管理</span>
              </div>
            </button>
            <button
              onClick={() => { setActiveMenu('sms'); setActiveTab('sms'); }}
              className={`w-full text-left px-3 py-2 text-sm font-medium transition-colors ${
                activeMenu === 'sms'
                  ? 'bg-blue-50 text-blue-600 border-l-4 border-blue-600'
                  : 'text-gray-700 hover:bg-gray-50 border-l-4 border-transparent'
              }`}
            >
              <div className="flex items-center gap-2">
                <MessageCircle className={`w-4 h-4 ${activeMenu === 'sms' ? 'text-blue-600' : 'text-gray-500'}`} aria-hidden="true" />
                <span>簡訊資訊</span>
              </div>
            </button>
            <button
              onClick={() => { setActiveMenu('parcels'); setActiveTab('parcels'); }}
              className={`w-full text-left px-3 py-2 text-sm font-medium transition-colors ${
                activeMenu === 'parcels'
                  ? 'bg-blue-50 text-blue-600 border-l-4 border-blue-600'
                  : 'text-gray-700 hover:bg-gray-50 border-l-4 border-transparent'
              }`}
            >
              <div className="flex items-center gap-2">
                <Package className={`w-4 h-4 ${activeMenu === 'parcels' ? 'text-blue-600' : 'text-gray-500'}`} aria-hidden="true" />
                <span>包裹管理</span>
              </div>
            </button>
            <button
              onClick={() => { setActiveMenu('admins'); setActiveTab('admins'); }}
              className={`w-full text-left px-3 py-2 text-sm font-medium transition-colors ${
                activeMenu === 'admins'
                  ? 'bg-blue-50 text-blue-600 border-l-4 border-blue-600'
                  : 'text-gray-700 hover:bg-gray-50 border-l-4 border-transparent'
              }`}
            >
              <div className="flex items-center gap-2">
                <Shield className={`w-4 h-4 ${activeMenu === 'admins' ? 'text-blue-600' : 'text-gray-500'}`} aria-hidden="true" />
                <span>管理員</span>
              </div>
            </button>
          </nav>
        </aside>

        {/* 主要內容區域 */}
        <main className="flex-1 ml-28 min-h-[calc(100vh-56px)] overflow-y-auto bg-gray-100 p-1.5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded mb-4">
              {error}
            </div>
          )}

          {/* 概覽頁面 */}
          {activeTab === 'overview' && (
            <div className="space-y-3 px-1.5">
              {/* 統計卡片 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-white rounded p-3 shadow-sm border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-500 text-sm font-medium">會員總數</p>
                      <p className="text-2xl font-bold text-gray-800 mt-0.5">{stats.totalUsers}</p>
                      <p className="text-gray-400 text-xs mt-1.5">↑ 12% 較上週</p>
                    </div>
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <Users className="w-5 h-5 text-blue-600" aria-hidden="true" />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded p-3 shadow-sm border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-500 text-sm font-medium">訂單總數</p>
                      <p className="text-2xl font-bold text-gray-800 mt-0.5">{stats.totalOrders}</p>
                      <p className="text-gray-400 text-xs mt-1.5">↑ 8% 較上週</p>
                    </div>
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                      <ClipboardList className="w-5 h-5 text-green-600" aria-hidden="true" />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded p-3 shadow-sm border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-500 text-sm font-medium">包裹總數</p>
                      <p className="text-2xl font-bold text-gray-800 mt-0.5">{stats.totalParcels}</p>
                      <p className="text-gray-400 text-xs mt-1.5">↑ 5% 較上週</p>
                    </div>
                    <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                      <Package className="w-5 h-5 text-purple-600" aria-hidden="true" />
                    </div>
                  </div>
                </div>
              </div>

              {/* 系統資訊 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-white rounded p-3 shadow-sm border border-gray-200">
                  <h3 className="text-sm font-bold text-gray-800 mb-2">系統狀態</h3>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between p-1.5 bg-gray-50 rounded">
                      <span className="text-gray-700 font-medium">API 伺服器</span>
                      <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">正常運作</span>
                    </div>
                    <div className="flex items-center justify-between p-1.5 bg-gray-50 rounded">
                      <span className="text-gray-700 font-medium">資料庫連線</span>
                      <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">正常運作</span>
                    </div>
                    <div className="flex items-center justify-between p-1.5 bg-gray-50 rounded">
                      <span className="text-gray-700 font-medium">應用狀態</span>
                      <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">運作中</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded p-3 shadow-sm border border-gray-200">
                  <h3 className="text-sm font-bold text-gray-800 mb-2">快速概覽統計</h3>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-700">今日新增會員</span>
                      <span className="font-bold text-blue-600">+{Math.floor(stats.totalUsers * 0.15)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-blue-500 h-2 rounded-full" style={{ width: '45%' }}></div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-700">今日新增訂單</span>
                      <span className="font-bold text-green-600">+{Math.floor(stats.totalOrders * 0.2)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-green-500 h-2 rounded-full" style={{ width: '65%' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 會員管理頁面 */}
          {activeTab === 'users' && (
            <div>
              {/* 搜尋欄 */}
              <div className="fixed top-14 left-28 right-0 z-40 px-1.5 bg-gray-100/95 backdrop-blur-sm min-h-[60px] flex items-end pb-0.5">
                <div className="w-full bg-white p-2.5 border border-gray-200">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && searchUsers()}
                      placeholder="搜尋會員：帳號、手機或電子郵件..."
                      className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                    <button
                      onClick={searchUsers}
                      className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-xs font-medium transition-colors"
                    >
                      搜尋
                    </button>
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        fetchUsers();
                      }}
                      className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-xs font-medium transition-colors"
                    >
                      重設
                    </button>
                  </div>
                </div>
              </div>

              {/* 用戶表格 */}
              <div className="bg-white border border-gray-200 overflow-hidden pb-0" style={{marginTop: '54px'}}>
                <div className="max-h-[calc(100vh-183px)] overflow-y-auto">
                  <table className="w-full">
                  <thead className="sticky top-0 z-10 bg-gray-100 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">ID</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">帳號</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">手機</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">電子郵件</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">姓名</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">地址</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">註冊日期</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">更新日期</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {loading ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-2.5 text-center text-gray-500">
                          載入中...
                        </td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-2.5 text-center text-gray-500">
                          沒有會員紀錄
                        </td>
                      </tr>
                    ) : (
                      users.map(user => (
                        <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-2.5 text-gray-700 font-medium text-sm">{user.id}</td>
                          <td className="px-3 py-2.5 text-gray-700 text-sm">{user.username}</td>
                          <td className="px-3 py-2.5 text-gray-700 text-sm">{user.phone || '-'}</td>
                          <td className="px-3 py-2.5 text-gray-700 text-xs">{user.email || '-'}</td>
                          <td className="px-3 py-2.5 text-gray-700 text-sm">{user.real_name || '-'}</td>
                          <td className="px-3 py-2.5 text-gray-700 text-xs">{user.address || '-'}</td>
                          <td className="px-3 py-2.5 text-gray-500 text-xs">
                            {new Date(user.created_at).toLocaleDateString('zh-TW')}
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 text-xs">
                            {new Date(user.updated_at).toLocaleDateString('zh-TW')}
                          </td>
                          <td className="px-3 py-2.5">
                            <button
                              onClick={() => deleteUser(user.id)}
                              className="px-2.5 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded text-xs font-medium transition-colors"
                            >
                              刪除
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  </table>
                </div>
              </div>

              {/* 分頁控件 */}
              {users.length > 0 && (
                <div className="fixed bottom-0 left-28 right-0 z-40 px-1.5 bg-gray-100/95 backdrop-blur-sm min-h-[54px] flex items-start">
                  <div className="w-full">
                    <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      totalItems={stats.totalUsers}
                      pageSize={pageSize}
                      pageSizeOptions={[10, 20, 30, 50]}
                      onPageChange={fetchUsers}
                      onPageSizeChange={handlePageSizeChange}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 訂單管理頁面 */}
          {activeTab === 'orders' && (
            <div>
              <div className="fixed top-14 left-28 right-0 z-40 px-1.5 bg-gray-100/95 backdrop-blur-sm min-h-[60px] flex items-end pb-0.5">
                <div className="w-full bg-white p-2.5 border border-gray-200">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={orderSearchQuery}
                      onChange={(e) => setOrderSearchQuery(e.target.value)}
                      placeholder="搜尋訂單：訂單ID、會員ID或狀態..."
                      className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                    <button
                      onClick={() => setOrderSearchQuery('')}
                      className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-xs font-medium transition-colors"
                    >
                      清除
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 overflow-hidden pb-0" style={{marginTop: '54px'}}>
                <div className="max-h-[calc(100vh-183px)] overflow-y-auto">
                  <table className="w-full">
                  <thead className="sticky top-0 z-10 bg-gray-100 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">訂單ID</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">會員ID</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">金額</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">狀態</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">建立日期</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {ordersLoading ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-2.5 text-center text-gray-500">
                          載入中...
                        </td>
                      </tr>
                    ) : filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-2.5 text-center text-gray-500">
                          沒有訂單紀錄
                        </td>
                      </tr>
                    ) : (
                      filteredOrders.map(order => (
                        <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-2.5 text-gray-700 font-medium text-sm">{order.id}</td>
                          <td className="px-3 py-2.5 text-gray-700 text-sm">{order.user_id}</td>
                          <td className="px-3 py-2.5 text-gray-700 font-medium text-sm">
                            ${toAmount(order.total_amount).toFixed(2)} {order.currency}
                          </td>
                          <td className="px-3 py-2.5">
                            <select
                              value={order.status}
                              onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                              className={`px-2.5 py-1 rounded text-xs font-medium border-0 focus:ring-2 focus:ring-blue-400 outline-none cursor-pointer ${
                                statusColors[order.status] || 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              <option value="pending">待處理</option>
                              <option value="processing">處理中</option>
                              <option value="shipped">已出貨</option>
                              <option value="delivered">已送達</option>
                              <option value="cancelled">已取消</option>
                            </select>
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 text-xs">
                            {new Date(order.created_at).toLocaleDateString('zh-TW')}
                          </td>
                          <td className="px-3 py-2.5">
                            <button className="px-2.5 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded text-xs font-medium transition-colors">
                              詳細
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  </table>
                </div>
              </div>

              {orders.length > 0 && (
                <div className="fixed bottom-0 left-28 right-0 z-40 px-1.5 bg-gray-100/95 backdrop-blur-sm min-h-[54px] flex items-start">
                  <div className="w-full">
                    <Pagination
                      currentPage={orderPage}
                      totalPages={orderTotalPages}
                      totalItems={orderTotalItems}
                      pageSize={orderPageSize}
                      pageSizeOptions={[10, 20, 30, 50]}
                      onPageChange={fetchOrders}
                      onPageSizeChange={handleOrderPageSizeChange}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 簡訊資訊頁面 */}
          {activeTab === 'sms' && (
            <div>
              <div className="fixed top-14 left-28 right-0 z-40 px-1.5 bg-gray-100/95 backdrop-blur-sm min-h-[60px] flex items-end pb-0.5">
                <div className="w-full bg-white p-2.5 border border-gray-200 flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-700">簡訊資訊</p>
                  <button
                    onClick={() => fetchSms(smsPage, smsPageSize)}
                    className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-xs font-medium transition-colors"
                  >
                    重新整理
                  </button>
                </div>
              </div>

              <div className="bg-white border border-gray-200 overflow-hidden pb-0" style={{marginTop: '54px'}}>
                <div className="max-h-[calc(100vh-183px)] overflow-y-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 z-10 bg-gray-100 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">ID</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">手機</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">驗證碼</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">狀態</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">到期時間</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">建立時間</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {smsLoading ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-2.5 text-center text-gray-500">
                            載入中...
                          </td>
                        </tr>
                      ) : smsItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-2.5 text-center text-gray-500">
                            沒有簡訊紀錄
                          </td>
                        </tr>
                      ) : (
                        smsItems.map(item => (
                          <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-3 py-2.5 text-gray-700 font-medium text-sm">{item.id}</td>
                            <td className="px-3 py-2.5 text-gray-700 text-sm">{item.phone}</td>
                            <td className="px-3 py-2.5 text-gray-700 text-sm">{item.code}</td>
                            <td className="px-3 py-2.5">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${item.verified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                {item.verified ? '已驗證' : '未驗證'}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-gray-500 text-xs">
                              {new Date(item.expires_at).toLocaleString('zh-TW')}
                            </td>
                            <td className="px-3 py-2.5 text-gray-500 text-xs">
                              {new Date(item.created_at).toLocaleString('zh-TW')}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {smsItems.length > 0 && (
                <div className="fixed bottom-0 left-28 right-0 z-40 px-1.5 bg-gray-100/95 backdrop-blur-sm min-h-[54px] flex items-start">
                  <div className="w-full">
                    <Pagination
                      currentPage={smsPage}
                      totalPages={smsTotalPages}
                      totalItems={smsTotalItems}
                      pageSize={smsPageSize}
                      pageSizeOptions={[10, 20, 30, 50]}
                      onPageChange={fetchSms}
                      onPageSizeChange={handleSmsPageSizeChange}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 包裹管理頁面 */}
          {activeTab === 'parcels' && (
            <div>
              <div className="fixed top-14 left-28 right-0 z-40 px-1.5 bg-gray-100/95 backdrop-blur-sm min-h-[60px] flex items-end pb-0.5">
                <div className="w-full bg-white p-2.5 border border-gray-200 flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-700">包裹管理</p>
                  <button
                    onClick={() => fetchParcels(parcelPage, parcelPageSize)}
                    className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-xs font-medium transition-colors"
                  >
                    重新整理
                  </button>
                </div>
              </div>

              <div className="bg-white border border-gray-200 overflow-hidden pb-0" style={{marginTop: '54px'}}>
                <div className="max-h-[calc(100vh-183px)] overflow-y-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 z-10 bg-gray-100 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">包裹ID</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">會員ID</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">追蹤號</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">來源</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">目的地</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">重量</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">狀態</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">預計送達</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">建立時間</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {parcelsLoading ? (
                        <tr>
                          <td colSpan={9} className="px-3 py-2.5 text-center text-gray-500">
                            載入中...
                          </td>
                        </tr>
                      ) : parcels.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-3 py-2.5 text-center text-gray-500">
                            沒有包裹紀錄
                          </td>
                        </tr>
                      ) : (
                        parcels.map(parcel => (
                          <tr key={parcel.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-3 py-2.5 text-gray-700 font-medium text-sm">{parcel.id}</td>
                            <td className="px-3 py-2.5 text-gray-700 text-sm">{parcel.user_id}</td>
                            <td className="px-3 py-2.5 text-gray-700 text-xs">{parcel.tracking_number}</td>
                            <td className="px-3 py-2.5 text-gray-700 text-sm">{parcel.origin}</td>
                            <td className="px-3 py-2.5 text-gray-700 text-sm">{parcel.destination}</td>
                            <td className="px-3 py-2.5 text-gray-700 text-sm">{parcel.weight ? `${parcel.weight}kg` : '-'}</td>
                            <td className="px-3 py-2.5">
                              <select
                                value={parcel.status}
                                onChange={(e) => updateParcelStatus(parcel.id, e.target.value)}
                                className={`px-2.5 py-1 rounded text-xs font-medium border-0 focus:ring-2 focus:ring-blue-400 outline-none cursor-pointer ${
                                  statusColors[parcel.status] || 'bg-gray-100 text-gray-800'
                                }`}
                              >
                                <option value="pending">待入庫</option>
                                <option value="arrived">已入庫</option>
                                <option value="shipping">運輸中</option>
                                <option value="completed">已簽收</option>
                                <option value="cancelled">已取消</option>
                              </select>
                            </td>
                            <td className="px-3 py-2.5 text-gray-500 text-xs">
                              {parcel.estimated_delivery ? new Date(parcel.estimated_delivery).toLocaleDateString('zh-TW') : '-'}
                            </td>
                            <td className="px-3 py-2.5 text-gray-500 text-xs">
                              {new Date(parcel.created_at).toLocaleDateString('zh-TW')}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {parcels.length > 0 && (
                <div className="fixed bottom-0 left-28 right-0 z-40 px-1.5 bg-gray-100/95 backdrop-blur-sm min-h-[54px] flex items-start">
                  <div className="w-full">
                    <Pagination
                      currentPage={parcelPage}
                      totalPages={parcelTotalPages}
                      totalItems={parcelTotalItems}
                      pageSize={parcelPageSize}
                      pageSizeOptions={[10, 20, 30, 50]}
                      onPageChange={fetchParcels}
                      onPageSizeChange={handleParcelPageSizeChange}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 管理員頁面 */}
          {activeTab === 'admins' && (
            <div>
              <div className="fixed top-14 left-28 right-0 z-40 px-1.5 bg-gray-100/95 backdrop-blur-sm min-h-[60px] flex items-end pb-0.5">
                <div className="w-full bg-white p-2.5 border border-gray-200">
                  <div className="flex flex-wrap items-end gap-2">
                    <input
                      type="text"
                      value={newAdmin.username}
                      onChange={(e) => setNewAdmin(prev => ({ ...prev, username: e.target.value }))}
                      placeholder="管理員帳號"
                      className="flex-1 min-w-[140px] px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                    <input
                      type="password"
                      value={newAdmin.password}
                      onChange={(e) => setNewAdmin(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="密碼"
                      className="flex-1 min-w-[140px] px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                    <input
                      type="email"
                      value={newAdmin.email}
                      onChange={(e) => setNewAdmin(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="電子郵件"
                      className="flex-1 min-w-[180px] px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 overflow-hidden pb-0" style={{marginTop: '54px'}}>
                <div className="max-h-[calc(100vh-183px)] overflow-y-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 z-10 bg-gray-100 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">ID</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">帳號</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">電子郵件</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">角色</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">狀態</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">上次登入</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">建立時間</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {adminsLoading ? (
                        <tr>
                          <td colSpan={8} className="px-3 py-2.5 text-center text-gray-500">
                            載入中...
                          </td>
                        </tr>
                      ) : admins.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-3 py-2.5 text-center text-gray-500">
                            沒有管理員紀錄
                          </td>
                        </tr>
                      ) : (
                        admins.map(admin => {
                          const isSelf = adminUser?.id === admin.id;
                          return (
                            <tr key={admin.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-3 py-2.5 text-gray-700 font-medium text-sm">{admin.id}</td>
                              <td className="px-3 py-2.5 text-gray-700 text-sm">{admin.username}</td>
                              <td className="px-3 py-2.5 text-gray-700 text-xs">{admin.email}</td>
                              <td className="px-3 py-2.5 text-gray-700 text-sm">{admin.role}</td>
                              <td className="px-3 py-2.5">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[admin.status] || 'bg-gray-100 text-gray-800'}`}>
                                  {admin.status}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-gray-500 text-xs">
                                {admin.last_login ? new Date(admin.last_login).toLocaleString('zh-TW') : '-'}
                              </td>
                              <td className="px-3 py-2.5 text-gray-500 text-xs">
                                {new Date(admin.created_at).toLocaleDateString('zh-TW')}
                              </td>
                              <td className="px-3 py-2.5 space-x-2">
                                <button
                                  onClick={() => updateAdminAccountStatus(admin.id, admin.status === 'active' ? 'disabled' : 'active')}
                                  className="px-2.5 py-1 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 rounded text-xs font-medium transition-colors"
                                >
                                  {admin.status === 'active' ? '停用' : '啟用'}
                                </button>
                                <button
                                  onClick={() => deleteAdminUser(admin.id)}
                                  disabled={isSelf}
                                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${isSelf ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                                >
                                  刪除
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {admins.length > 0 && (
                <div className="fixed bottom-0 left-28 right-0 z-40 px-1.5 bg-gray-100/95 backdrop-blur-sm min-h-[54px] flex items-start">
                  <div className="w-full">
                    <Pagination
                      currentPage={adminPage}
                      totalPages={adminTotalPages}
                      totalItems={adminTotalItems}
                      pageSize={adminPageSize}
                      pageSizeOptions={[10, 20, 30, 50]}
                      onPageChange={fetchAdmins}
                      onPageSizeChange={handleAdminPageSizeChange}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
