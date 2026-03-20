import { useState, useEffect, useMemo } from 'react';
import { Home, Users, User, ShoppingCart, MessageCircle, Package, ClipboardList, Shield } from 'lucide-react';
import FixedTableToolbar from '../components/FixedTableToolbar';
import Pagination from '../components/Pagination';
import TableSearchBar from '../components/TableSearchBar';
import { adminFetch } from '../lib/api';
import { useAuth } from '../lib/auth';

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

type SortDirection = 'asc' | 'desc';
type SortConfig<T extends string> = {
  key: T;
  direction: SortDirection;
};

export default function AdminDashboard() {
  const { user: adminUser, loading: authLoading, logout } = useAuth();
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
  const [orderStartDate, setOrderStartDate] = useState('');
  const [orderEndDate, setOrderEndDate] = useState('');
  const [smsSearchQuery, setSmsSearchQuery] = useState('');
  const [smsStartDate, setSmsStartDate] = useState('');
  const [smsEndDate, setSmsEndDate] = useState('');
  const [parcelSearchQuery, setParcelSearchQuery] = useState('');
  const [parcelStartDate, setParcelStartDate] = useState('');
  const [parcelEndDate, setParcelEndDate] = useState('');
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
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
  const [userSort, setUserSort] = useState<SortConfig<'id' | 'created_at' | 'updated_at'>>({ key: 'created_at', direction: 'desc' });
  const [orderSort, setOrderSort] = useState<SortConfig<'id' | 'status' | 'created_at'>>({ key: 'created_at', direction: 'desc' });
  const [smsSort, setSmsSort] = useState<SortConfig<'id' | 'verified' | 'created_at'>>({ key: 'created_at', direction: 'desc' });
  const [parcelSort, setParcelSort] = useState<SortConfig<'id' | 'status' | 'created_at'>>({ key: 'created_at', direction: 'desc' });
  const [adminSort, setAdminSort] = useState<SortConfig<'id' | 'status' | 'created_at'>>({ key: 'created_at', direction: 'desc' });

  const ensureAuthorized = (response: Response): boolean => {
    if (response.status === 401) {
      return false;
    }
    return true;
  };

  useEffect(() => {
    if (authLoading || !adminUser) {
      return;
    }

    fetchUsers();
    fetchOrders();
    fetchParcels();
  }, [authLoading, adminUser]);

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

  const appendDateRangeParams = (params: URLSearchParams, startDate: string, endDate: string) => {
    if (startDate) {
      params.set('startDate', startDate);
    }
    if (endDate) {
      params.set('endDate', endDate);
    }
  };

  const fetchOrders = async (
    page: number = 1,
    size: number = orderPageSize,
    startDate: string = orderStartDate,
    endDate: string = orderEndDate
  ) => {
    try {
      setOrdersLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: String(size),
      });
      appendDateRangeParams(params, startDate, endDate);
      const response = await adminFetch(`/admin/orders?${params.toString()}`);
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
    fetchOrders(1, newSize, orderStartDate, orderEndDate);
  };

  const fetchSms = async (
    page: number = 1,
    size: number = smsPageSize,
    startDate: string = smsStartDate,
    endDate: string = smsEndDate
  ) => {
    try {
      setSmsLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: String(size),
      });
      appendDateRangeParams(params, startDate, endDate);
      const response = await adminFetch(`/admin/sms?${params.toString()}`);
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
    fetchSms(1, newSize, smsStartDate, smsEndDate);
  };

  const fetchParcels = async (
    page: number = 1,
    size: number = parcelPageSize,
    startDate: string = parcelStartDate,
    endDate: string = parcelEndDate
  ) => {
    try {
      setParcelsLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: String(size),
      });
      appendDateRangeParams(params, startDate, endDate);
      const response = await adminFetch(`/admin/parcels?${params.toString()}`);
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
    fetchParcels(1, newSize, parcelStartDate, parcelEndDate);
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

  const searchOrders = async () => {
    if (!orderSearchQuery.trim()) {
      setOrderPage(1);
      fetchOrders(1, orderPageSize, orderStartDate, orderEndDate);
      return;
    }

    try {
      setOrdersLoading(true);
      setOrderPage(1);
      const params = new URLSearchParams({
        q: orderSearchQuery,
      });
      appendDateRangeParams(params, orderStartDate, orderEndDate);
      const response = await adminFetch(`/admin/orders/search?${params.toString()}`);
      if (!ensureAuthorized(response)) return;
      if (!response.ok) throw new Error('search orders failed');
      const data = await response.json();
      setOrders(data.data || []);
      setOrderTotalPages(1);
      setOrderTotalItems(data.count || (data.data || []).length || 0);
    } catch (err) {
      setError('搜尋訂單失敗');
    } finally {
      setOrdersLoading(false);
    }
  };

  const resetOrderSearch = () => {
    setOrderSearchQuery('');
    setOrderStartDate('');
    setOrderEndDate('');
    setOrderPage(1);
    fetchOrders(1, orderPageSize, '', '');
  };

  const searchSms = async () => {
    if (!smsSearchQuery.trim()) {
      setSmsPage(1);
      fetchSms(1, smsPageSize, smsStartDate, smsEndDate);
      return;
    }

    try {
      setSmsLoading(true);
      setSmsPage(1);
      const params = new URLSearchParams({
        q: smsSearchQuery,
      });
      appendDateRangeParams(params, smsStartDate, smsEndDate);
      const response = await adminFetch(`/admin/sms/search?${params.toString()}`);
      if (!ensureAuthorized(response)) return;
      if (!response.ok) throw new Error('search sms failed');
      const data = await response.json();
      setSmsItems(data.data || []);
      setSmsTotalPages(1);
      setSmsTotalItems(data.count || (data.data || []).length || 0);
    } catch (err) {
      setError('搜尋簡訊紀錄失敗');
    } finally {
      setSmsLoading(false);
    }
  };

  const resetSmsSearch = () => {
    setSmsSearchQuery('');
    setSmsStartDate('');
    setSmsEndDate('');
    setSmsPage(1);
    fetchSms(1, smsPageSize, '', '');
  };

  const searchParcels = async () => {
    if (!parcelSearchQuery.trim()) {
      setParcelPage(1);
      fetchParcels(1, parcelPageSize, parcelStartDate, parcelEndDate);
      return;
    }

    try {
      setParcelsLoading(true);
      setParcelPage(1);
      const params = new URLSearchParams({
        q: parcelSearchQuery,
      });
      appendDateRangeParams(params, parcelStartDate, parcelEndDate);
      const response = await adminFetch(`/admin/parcels/search?${params.toString()}`);
      if (!ensureAuthorized(response)) return;
      if (!response.ok) throw new Error('search parcels failed');
      const data = await response.json();
      setParcels(data.data || []);
      setParcelTotalPages(1);
      setParcelTotalItems(data.count || (data.data || []).length || 0);
    } catch (err) {
      setError('搜尋包裹失敗');
    } finally {
      setParcelsLoading(false);
    }
  };

  const resetParcelSearch = () => {
    setParcelSearchQuery('');
    setParcelStartDate('');
    setParcelEndDate('');
    setParcelPage(1);
    fetchParcels(1, parcelPageSize, '', '');
  };

  const searchAdmins = async () => {
    if (!adminSearchQuery.trim()) {
      setAdminPage(1);
      fetchAdmins(1, adminPageSize);
      return;
    }

    try {
      setAdminsLoading(true);
      setAdminPage(1);
      const response = await adminFetch(`/admin/admins/search?q=${encodeURIComponent(adminSearchQuery)}`);
      if (!ensureAuthorized(response)) return;
      if (!response.ok) throw new Error('search admins failed');
      const data = await response.json();
      setAdmins(data.data || []);
      setAdminTotalPages(1);
      setAdminTotalItems(data.count || (data.data || []).length || 0);
    } catch (err) {
      setError('搜尋管理員失敗');
    } finally {
      setAdminsLoading(false);
    }
  };

  const resetAdminSearch = () => {
    setAdminSearchQuery('');
    setAdminPage(1);
    fetchAdmins(1, adminPageSize);
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
    await logout();
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

  const getNextSort = <T extends string>(current: SortConfig<T>, key: T): SortConfig<T> => ({
    key,
    direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc',
  });

  const sortMark = (isActive: boolean, direction: SortDirection): string => {
    if (!isActive) return '';
    return direction === 'asc' ? ' ↑' : ' ↓';
  };

  const comparePrimitive = (a: string | number, b: string | number, direction: SortDirection): number => {
    if (typeof a === 'number' && typeof b === 'number') {
      return direction === 'asc' ? a - b : b - a;
    }
    const left = String(a).toLowerCase();
    const right = String(b).toLowerCase();
    if (left === right) return 0;
    if (direction === 'asc') {
      return left > right ? 1 : -1;
    }
    return left < right ? 1 : -1;
  };

  const sortBy = <T,>(items: T[], selector: (item: T) => string | number, direction: SortDirection): T[] => {
    return [...items].sort((a, b) => comparePrimitive(selector(a), selector(b), direction));
  };

  const sortedUsers = useMemo(() => {
    return sortBy(users, (item) => {
      if (userSort.key === 'id') return item.id;
      if (userSort.key === 'updated_at') return new Date(item.updated_at).getTime();
      return new Date(item.created_at).getTime();
    }, userSort.direction);
  }, [users, userSort]);

  const sortedOrders = useMemo(() => {
    return sortBy(orders, (item) => {
      if (orderSort.key === 'id') return item.id;
      if (orderSort.key === 'status') return item.status;
      return new Date(item.created_at).getTime();
    }, orderSort.direction);
  }, [orders, orderSort]);

  const sortedSmsItems = useMemo(() => {
    return sortBy(smsItems, (item) => {
      if (smsSort.key === 'id') return item.id;
      if (smsSort.key === 'verified') return item.verified;
      return new Date(item.created_at).getTime();
    }, smsSort.direction);
  }, [smsItems, smsSort]);

  const sortedParcels = useMemo(() => {
    return sortBy(parcels, (item) => {
      if (parcelSort.key === 'id') return item.id;
      if (parcelSort.key === 'status') return item.status;
      return new Date(item.created_at).getTime();
    }, parcelSort.direction);
  }, [parcels, parcelSort]);

  const sortedAdmins = useMemo(() => {
    return sortBy(admins, (item) => {
      if (adminSort.key === 'id') return item.id;
      if (adminSort.key === 'status') return item.status;
      return new Date(item.created_at).getTime();
    }, adminSort.direction);
  }, [admins, adminSort]);

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
            <div className="flex flex-col h-[calc(100vh-68px)]">
              {/* 搜尋欄 */}
              <FixedTableToolbar>
                <TableSearchBar
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onSearch={searchUsers}
                  onReset={() => {
                    setSearchQuery('');
                    fetchUsers();
                  }}
                  placeholder="搜尋會員：帳號、手機或電子郵件..."
                />
              </FixedTableToolbar>

              {/* 用戶表格 */}
              <div className="flex-1 min-h-0 bg-gray-50 border border-gray-200 border-t-0 overflow-y-auto shadow-sm">                <table className="w-full whitespace-nowrap border-b border-gray-200">
                  <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">
                        <button type="button" onClick={() => setUserSort(prev => getNextSort(prev, 'id'))}>
                          ID{sortMark(userSort.key === 'id', userSort.direction)}
                        </button>
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">帳號</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">手機</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">電子郵件</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">姓名</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">地址</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">
                        <button type="button" onClick={() => setUserSort(prev => getNextSort(prev, 'created_at'))}>
                          註冊日期{sortMark(userSort.key === 'created_at', userSort.direction)}
                        </button>
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">
                        <button type="button" onClick={() => setUserSort(prev => getNextSort(prev, 'updated_at'))}>
                          更新日期{sortMark(userSort.key === 'updated_at', userSort.direction)}
                        </button>
                      </th>
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
                      sortedUsers.map(user => (
                        <tr key={user.id} className="hover:bg-gray-100 transition-colors">
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
                  </table>              </div>

              {/* 分頁控件 */}
              {users.length > 0 && (
                <div className="shrink-0 pt-1.5 flex items-start">
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
            <div className="flex flex-col h-[calc(100vh-68px)]">
              <FixedTableToolbar>
                <TableSearchBar
                  value={orderSearchQuery}
                  onChange={setOrderSearchQuery}
                  onSearch={searchOrders}
                  onReset={resetOrderSearch}
                  placeholder="搜尋訂單：訂單ID、會員ID或狀態..."
                  extraControls={
                    <>
                      <input
                        type="date"
                        value={orderStartDate}
                        onChange={(e) => setOrderStartDate(e.target.value)}
                        className="px-2.5 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        aria-label="訂單起始日期"
                      />
                      <span className="text-gray-500 text-xs">至</span>
                      <input
                        type="date"
                        value={orderEndDate}
                        onChange={(e) => setOrderEndDate(e.target.value)}
                        className="px-2.5 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        aria-label="訂單結束日期"
                      />
                    </>
                  }
                />
              </FixedTableToolbar>

              <div className="flex-1 min-h-0 bg-gray-50 border border-gray-200 border-t-0 overflow-y-auto shadow-sm">                <table className="w-full whitespace-nowrap border-b border-gray-200">
                  <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">
                        <button type="button" onClick={() => setOrderSort(prev => getNextSort(prev, 'id'))}>
                          訂單ID{sortMark(orderSort.key === 'id', orderSort.direction)}
                        </button>
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">會員ID</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">金額</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">
                        <button type="button" onClick={() => setOrderSort(prev => getNextSort(prev, 'status'))}>
                          狀態{sortMark(orderSort.key === 'status', orderSort.direction)}
                        </button>
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">
                        <button type="button" onClick={() => setOrderSort(prev => getNextSort(prev, 'created_at'))}>
                          建立日期{sortMark(orderSort.key === 'created_at', orderSort.direction)}
                        </button>
                      </th>
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
                    ) : orders.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-2.5 text-center text-gray-500">
                          沒有訂單紀錄
                        </td>
                      </tr>
                    ) : (
                      sortedOrders.map(order => (
                        <tr key={order.id} className="hover:bg-gray-100 transition-colors">
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
                  </table>              </div>

              {orders.length > 0 && (
                <div className="shrink-0 pt-1.5 flex items-start">
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
            <div className="flex flex-col h-[calc(100vh-68px)]">
              <FixedTableToolbar>
                <TableSearchBar
                  value={smsSearchQuery}
                  onChange={setSmsSearchQuery}
                  onSearch={searchSms}
                  onReset={resetSmsSearch}
                  placeholder="搜尋簡訊：ID、手機、驗證碼或驗證狀態..."
                  extraControls={
                    <>
                      <input
                        type="date"
                        value={smsStartDate}
                        onChange={(e) => setSmsStartDate(e.target.value)}
                        className="px-2.5 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        aria-label="簡訊起始日期"
                      />
                      <span className="text-gray-500 text-xs">至</span>
                      <input
                        type="date"
                        value={smsEndDate}
                        onChange={(e) => setSmsEndDate(e.target.value)}
                        className="px-2.5 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        aria-label="簡訊結束日期"
                      />
                    </>
                  }
                />
              </FixedTableToolbar>

              <div className="flex-1 min-h-0 bg-gray-50 border border-gray-200 border-t-0 overflow-y-auto shadow-sm">                <table className="w-full whitespace-nowrap border-b border-gray-200">
                    <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">
                          <button type="button" onClick={() => setSmsSort(prev => getNextSort(prev, 'id'))}>
                            ID{sortMark(smsSort.key === 'id', smsSort.direction)}
                          </button>
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">手機</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">驗證碼</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">
                          <button type="button" onClick={() => setSmsSort(prev => getNextSort(prev, 'verified'))}>
                            狀態{sortMark(smsSort.key === 'verified', smsSort.direction)}
                          </button>
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">到期時間</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">
                          <button type="button" onClick={() => setSmsSort(prev => getNextSort(prev, 'created_at'))}>
                            建立時間{sortMark(smsSort.key === 'created_at', smsSort.direction)}
                          </button>
                        </th>
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
                        sortedSmsItems.map(item => (
                          <tr key={item.id} className="hover:bg-gray-100 transition-colors">
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
                  </table>              </div>

              {smsItems.length > 0 && (
                <div className="shrink-0 pt-1.5 flex items-start">
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
            <div className="flex flex-col h-[calc(100vh-68px)]">
              <FixedTableToolbar>
                <TableSearchBar
                  value={parcelSearchQuery}
                  onChange={setParcelSearchQuery}
                  onSearch={searchParcels}
                  onReset={resetParcelSearch}
                  placeholder="搜尋包裹：包裹ID、會員ID、追蹤號、來源、目的地或狀態..."
                  extraControls={
                    <>
                      <input
                        type="date"
                        value={parcelStartDate}
                        onChange={(e) => setParcelStartDate(e.target.value)}
                        className="px-2.5 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        aria-label="包裹起始日期"
                      />
                      <span className="text-gray-500 text-xs">至</span>
                      <input
                        type="date"
                        value={parcelEndDate}
                        onChange={(e) => setParcelEndDate(e.target.value)}
                        className="px-2.5 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        aria-label="包裹結束日期"
                      />
                    </>
                  }
                />
              </FixedTableToolbar>

              <div className="flex-1 min-h-0 bg-gray-50 border border-gray-200 border-t-0 overflow-y-auto shadow-sm">                <table className="w-full whitespace-nowrap border-b border-gray-200">
                    <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">
                          <button type="button" onClick={() => setParcelSort(prev => getNextSort(prev, 'id'))}>
                            包裹ID{sortMark(parcelSort.key === 'id', parcelSort.direction)}
                          </button>
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">會員ID</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">追蹤號</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">來源</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">目的地</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">重量</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">
                          <button type="button" onClick={() => setParcelSort(prev => getNextSort(prev, 'status'))}>
                            狀態{sortMark(parcelSort.key === 'status', parcelSort.direction)}
                          </button>
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">預計送達</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">
                          <button type="button" onClick={() => setParcelSort(prev => getNextSort(prev, 'created_at'))}>
                            建立時間{sortMark(parcelSort.key === 'created_at', parcelSort.direction)}
                          </button>
                        </th>
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
                        sortedParcels.map(parcel => (
                          <tr key={parcel.id} className="hover:bg-gray-100 transition-colors">
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
                  </table>              </div>

              {parcels.length > 0 && (
                <div className="shrink-0 pt-1.5 flex items-start">
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
            <div className="flex flex-col h-[calc(100vh-68px)]">
              <FixedTableToolbar>
                <TableSearchBar
                  value={adminSearchQuery}
                  onChange={setAdminSearchQuery}
                  onSearch={searchAdmins}
                  onReset={resetAdminSearch}
                  placeholder="搜尋管理員：ID、帳號、電子郵件、角色或狀態..."
                />
              </FixedTableToolbar>

              <div className="flex-1 min-h-0 bg-gray-50 border border-gray-200 border-t-0 overflow-y-auto shadow-sm">                <table className="w-full whitespace-nowrap border-b border-gray-200">
                    <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">
                          <button type="button" onClick={() => setAdminSort(prev => getNextSort(prev, 'id'))}>
                            ID{sortMark(adminSort.key === 'id', adminSort.direction)}
                          </button>
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">帳號</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">電子郵件</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">角色</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">
                          <button type="button" onClick={() => setAdminSort(prev => getNextSort(prev, 'status'))}>
                            狀態{sortMark(adminSort.key === 'status', adminSort.direction)}
                          </button>
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">上次登入</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">
                          <button type="button" onClick={() => setAdminSort(prev => getNextSort(prev, 'created_at'))}>
                            建立時間{sortMark(adminSort.key === 'created_at', adminSort.direction)}
                          </button>
                        </th>
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
                        sortedAdmins.map(admin => {
                          const isSelf = adminUser?.id === admin.id;
                          return (
                            <tr key={admin.id} className="hover:bg-gray-100 transition-colors">
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
                  </table>              </div>

              {admins.length > 0 && (
                <div className="shrink-0 pt-1.5 flex items-start">
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




