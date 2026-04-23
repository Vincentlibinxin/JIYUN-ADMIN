import AdminLayout from '../app/layouts/AdminLayout';
import { useState, useEffect } from 'react';
import { message } from 'antd';
import { Home, Users, User, ShoppingCart, MessageCircle, Package, ClipboardList, Shield } from 'lucide-react';

import { adminFetch } from '../lib/api';
import { useAuth } from '../lib/auth';
import OverviewTab from './dashboard/OverviewTab';
import UsersTab from './dashboard/UsersTab';
import OrdersTab from './dashboard/OrdersTab';
import SmsTab from './dashboard/SmsTab';
import ParcelsTab from './dashboard/ParcelsTab';
import AdminsTab from './dashboard/AdminsTab';
import { exportParcelsToTemplate } from '../lib/parcelExport';

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
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  volume: number | null;
  images: string | null;
  status: string;
  estimated_delivery: string | null;
  created_at: string;
  username: string | null;
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
  const [messageApi, messageContextHolder] = message.useMessage();
  useEffect(() => {
    if (error) {
      messageApi.error({ content: error, duration: 3 });
      setError('');
    }
  }, [error, messageApi]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [userTotalItems, setUserTotalItems] = useState(0);
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
  const [userSort, setUserSort] = useState<SortConfig<'id' | 'username' | 'phone' | 'email' | 'real_name' | 'address' | 'created_at' | 'updated_at'>>({ key: 'created_at', direction: 'desc' });
  const [orderSort, setOrderSort] = useState<SortConfig<'id' | 'user_id' | 'total_amount' | 'status' | 'created_at'>>({ key: 'created_at', direction: 'desc' });
  const [smsSort, setSmsSort] = useState<SortConfig<'id' | 'phone' | 'code' | 'verified' | 'expires_at' | 'created_at'>>({ key: 'created_at', direction: 'desc' });
  const [parcelSort, setParcelSort] = useState<SortConfig<'id' | 'user_id' | 'tracking_number' | 'origin' | 'destination' | 'weight' | 'length_cm' | 'width_cm' | 'height_cm' | 'volume' | 'status' | 'estimated_delivery' | 'created_at' | 'username'>>({ key: 'created_at', direction: 'desc' });
  const [adminSort, setAdminSort] = useState<SortConfig<'id' | 'username' | 'email' | 'role' | 'status' | 'last_login' | 'created_at'>>({ key: 'created_at', direction: 'desc' });
  const [refreshKey, setRefreshKey] = useState(0);

  const [userColumnFilters, setUserColumnFilters] = useState<Record<string, string>>({});
  const [userDateFilters, setUserDateFilters] = useState<Record<string, [string, string]>>({});
  const [orderColumnFilters, setOrderColumnFilters] = useState<Record<string, string>>({});
  const [orderDateFilters, setOrderDateFilters] = useState<Record<string, [string, string]>>({});
  const [smsColumnFilters, setSmsColumnFilters] = useState<Record<string, string>>({});
  const [smsDateFilters, setSmsDateFilters] = useState<Record<string, [string, string]>>({});
  const [parcelColumnFilters, setParcelColumnFilters] = useState<Record<string, string>>({});
  const [parcelDateFilters, setParcelDateFilters] = useState<Record<string, [string, string]>>({});
  const [adminColumnFilters, setAdminColumnFilters] = useState<Record<string, string>>({});
  const [adminDateFilters, setAdminDateFilters] = useState<Record<string, [string, string]>>({});

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

  const fetchUsers = async (
    page: number = 1,
    size: number = pageSize,
    sortKey?: string,
    sortDir?: string,
    colFilters?: Record<string, string>,
    dtFilters?: Record<string, [string, string]>
  ) => {
    const sk = sortKey || userSort.key;
    const sd = sortDir || userSort.direction;
    const cf = colFilters !== undefined ? colFilters : userColumnFilters;
    const df = dtFilters !== undefined ? dtFilters : userDateFilters;
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: String(size),
        sortKey: sk,
        sortOrder: sd,
      });
      if (Object.keys(cf).length > 0) params.set('columnFilters', JSON.stringify(cf));
      if (Object.keys(df).length > 0) params.set('dateFilters', JSON.stringify(df));
      const response = await adminFetch(`/admin/users?${params.toString()}`);
      if (!ensureAuthorized(response)) return;
      if (!response.ok) throw new Error('fetch users failed');
      const data = await response.json();
      setUsers(data.data || []);
      setCurrentPage(page);
      setPageSize(size);
      setTotalPages(data.pagination?.pages || 1);
      setUserTotalItems(data.pagination?.total || 0);
      setStats(prev => ({ ...prev, totalUsers: data.pagination?.total || 0 }));
    } catch (err) {
      setError('讀取會員失敗');
    } finally {
      setLoading(false);
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    if (searchQuery.trim()) {
      searchUsers(1, newSize, searchQuery, userSort.key, userSort.direction);
      return;
    }
    fetchUsers(1, newSize, userSort.key, userSort.direction);
  };

  const handleUsersPageChange = (page: number, size: number) => {
    if (searchQuery.trim()) {
      searchUsers(page, size, searchQuery, userSort.key, userSort.direction);
      return;
    }
    fetchUsers(page, size, userSort.key, userSort.direction);
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
    endDate: string = orderEndDate,
    sortKey?: string,
    sortDir?: string,
    colFilters?: Record<string, string>,
    dtFilters?: Record<string, [string, string]>
  ) => {
    const sk = sortKey || orderSort.key;
    const sd = sortDir || orderSort.direction;
    const cf = colFilters !== undefined ? colFilters : orderColumnFilters;
    const df = dtFilters !== undefined ? dtFilters : orderDateFilters;
    try {
      setOrdersLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: String(size),
        sortKey: sk,
        sortOrder: sd,
      });
      appendDateRangeParams(params, startDate, endDate);
      if (Object.keys(cf).length > 0) params.set('columnFilters', JSON.stringify(cf));
      if (Object.keys(df).length > 0) params.set('dateFilters', JSON.stringify(df));
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
    endDate: string = smsEndDate,
    sortKey?: string,
    sortDir?: string,
    colFilters?: Record<string, string>,
    dtFilters?: Record<string, [string, string]>
  ) => {
    const sk = sortKey || smsSort.key;
    const sd = sortDir || smsSort.direction;
    const cf = colFilters !== undefined ? colFilters : smsColumnFilters;
    const df = dtFilters !== undefined ? dtFilters : smsDateFilters;
    try {
      setSmsLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: String(size),
        sortKey: sk,
        sortOrder: sd,
      });
      appendDateRangeParams(params, startDate, endDate);
      if (Object.keys(cf).length > 0) params.set('columnFilters', JSON.stringify(cf));
      if (Object.keys(df).length > 0) params.set('dateFilters', JSON.stringify(df));
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
    endDate: string = parcelEndDate,
    sortKey?: string,
    sortDir?: string,
    colFilters?: Record<string, string>,
    dtFilters?: Record<string, [string, string]>
  ) => {
    const sk = sortKey || parcelSort.key;
    const sd = sortDir || parcelSort.direction;
    const cf = colFilters !== undefined ? colFilters : parcelColumnFilters;
    const df = dtFilters !== undefined ? dtFilters : parcelDateFilters;
    try {
      setParcelsLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: String(size),
        sortKey: sk,
        sortOrder: sd,
      });
      appendDateRangeParams(params, startDate, endDate);
      if (Object.keys(cf).length > 0) params.set('columnFilters', JSON.stringify(cf));
      if (Object.keys(df).length > 0) params.set('dateFilters', JSON.stringify(df));
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

  const fetchAdmins = async (
    page: number = 1,
    size: number = adminPageSize,
    sortKey?: string,
    sortDir?: string,
    colFilters?: Record<string, string>,
    dtFilters?: Record<string, [string, string]>
  ) => {
    const sk = sortKey || adminSort.key;
    const sd = sortDir || adminSort.direction;
    const cf = colFilters !== undefined ? colFilters : adminColumnFilters;
    const df = dtFilters !== undefined ? dtFilters : adminDateFilters;
    try {
      setAdminsLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: String(size),
        sortKey: sk,
        sortOrder: sd,
      });
      if (Object.keys(cf).length > 0) params.set('columnFilters', JSON.stringify(cf));
      if (Object.keys(df).length > 0) params.set('dateFilters', JSON.stringify(df));
      const response = await adminFetch(`/admin/admins?${params.toString()}`);
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

  const searchUsers = async (
    page: number = 1,
    size: number = pageSize,
    keyword: string = searchQuery,
    sortKey?: string,
    sortDir?: string
  ) => {
    const sk = sortKey || userSort.key;
    const sd = sortDir || userSort.direction;
    const trimmedKeyword = keyword.trim();
    if (!trimmedKeyword) {
      fetchUsers(page, size, sk, sd);
      return;
    }

    try {
      setLoading(true);
      const response = await adminFetch(
        `/admin/users/search?q=${encodeURIComponent(trimmedKeyword)}&page=${page}&limit=${size}&sortKey=${sk}&sortOrder=${sd}`
      );
      if (!ensureAuthorized(response)) return;
      if (!response.ok) throw new Error('search users failed');
      const data = await response.json();
      setUsers(data.data || []);
      setCurrentPage(page);
      setPageSize(size);
      setTotalPages(data.pagination?.pages || 1);
      setUserTotalItems(data.pagination?.total || data.count || 0);
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

  const deleteOrder = async (id: number) => {
    try {
      const response = await adminFetch(`/admin/orders/${id}`, { method: 'DELETE' });
      if (!ensureAuthorized(response)) return;
      if (response.ok) {
        fetchOrders(orderPage);
      } else {
        setError('删除订单失败');
      }
    } catch { setError('删除失败'); }
  };

  const deleteSmsRecord = async (id: number) => {
    try {
      const response = await adminFetch(`/admin/sms/${id}`, { method: 'DELETE' });
      if (!ensureAuthorized(response)) return;
      if (response.ok) {
        fetchSms(smsPage);
      } else {
        setError('删除记录失败');
      }
    } catch { setError('删除失败'); }
  };

  const deleteParcel = async (id: number) => {
    try {
      const response = await adminFetch(`/admin/parcels/${id}`, { method: 'DELETE' });
      if (!ensureAuthorized(response)) return;
      if (response.ok) {
        fetchParcels(parcelPage);
      } else {
        setError('删除包裹失败');
      }
    } catch { setError('删除失败'); }
  };

  const batchDeleteUsers = async (ids: number[]) => {
    try {
      const response = await adminFetch('/admin/users/batch-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      if (!ensureAuthorized(response)) return;
      if (response.ok) { fetchUsers(currentPage); } else { setError('批量删除会员失败'); }
    } catch { setError('批量删除失败'); }
  };

  const batchDeleteOrders = async (ids: number[]) => {
    try {
      const response = await adminFetch('/admin/orders/batch-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      if (!ensureAuthorized(response)) return;
      if (response.ok) { fetchOrders(orderPage); } else { setError('批量删除订单失败'); }
    } catch { setError('批量删除失败'); }
  };

  const batchDeleteSmsRecords = async (ids: number[]) => {
    try {
      const response = await adminFetch('/admin/sms/batch-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      if (!ensureAuthorized(response)) return;
      if (response.ok) { fetchSms(smsPage); } else { setError('批量删除记录失败'); }
    } catch { setError('批量删除失败'); }
  };

  const batchDeleteParcels = async (ids: number[]) => {
    try {
      const response = await adminFetch('/admin/parcels/batch-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      if (!ensureAuthorized(response)) return;
      if (response.ok) { fetchParcels(parcelPage); } else { setError('批量删除包裹失败'); }
    } catch { setError('批量删除失败'); }
  };

  const handleExportParcels = async () => {
    try {
      const params = new URLSearchParams({
        sortKey: parcelSort.key,
        sortOrder: parcelSort.direction,
      });
      appendDateRangeParams(params, parcelStartDate, parcelEndDate);
      if (Object.keys(parcelColumnFilters).length > 0) {
        params.set('columnFilters', JSON.stringify(parcelColumnFilters));
      }
      if (Object.keys(parcelDateFilters).length > 0) {
        params.set('dateFilters', JSON.stringify(parcelDateFilters));
      }
      const response = await adminFetch(`/admin/parcels/export?${params.toString()}`);
      if (!ensureAuthorized(response)) return;
      if (!response.ok) throw new Error('export failed');
      const result = await response.json();
      const rows = (result.data || []) as any[];
      if (rows.length === 0) {
        message.warning('当前筛选结果为空，无可导出数据');
        return;
      }
      await exportParcelsToTemplate(rows);
      message.success(`已导出 ${rows.length} 条数据`);
    } catch (err) {
      setError('导出失败');
      message.error('导出失败');
    }
  };

  const batchDeleteAdminUsers = async (ids: number[]) => {
    try {
      const response = await adminFetch('/admin/admins/batch-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      if (!ensureAuthorized(response)) return;
      if (response.ok) { fetchAdmins(adminPage, adminPageSize); } else { setError('批量删除管理员失败'); }
    } catch { setError('批量删除失败'); }
  };

  const inboundParcel = async (formData: FormData): Promise<boolean> => {
    try {
      const response = await adminFetch('/admin/parcels/inbound', {
        method: 'POST',
        headers: {},
        body: formData,
      });
      if (!ensureAuthorized(response)) return false;
      if (response.ok) {
        fetchParcels(1, parcelPageSize);
        return true;
      } else {
        const data = await response.json();
        setError(data.error || '入库失败');
        return false;
      }
    } catch {
      setError('入库失败');
      return false;
    }
  };

  const editParcel = async (id: number, formData: FormData): Promise<boolean> => {
    try {
      const response = await adminFetch(`/admin/parcels/${id}`, {
        method: 'PUT',
        headers: {},
        body: formData,
      });
      if (!ensureAuthorized(response)) return false;
      if (response.ok) {
        fetchParcels(parcelPage, parcelPageSize);
        return true;
      } else {
        const data = await response.json();
        setError(data.error || '修改失败');
        return false;
      }
    } catch {
      setError('修改失败');
      return false;
    }
  };

  const fetchParcelItems = async (id: number): Promise<{ name: string; value: number; quantity: number }[]> => {
    try {
      const response = await adminFetch(`/admin/parcels/${id}/items`);
      if (!ensureAuthorized(response)) return [];
      if (response.ok) {
        const data = await response.json();
        return data.data || [];
      }
    } catch { /* ignore */ }
    return [];
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

  const handleRefresh = () => {
    setRefreshKey(k => k + 1);
    switch (activeTab) {
      case 'overview':
        fetchUsers();
        fetchOrders();
        fetchParcels();
        break;
      case 'users':
        setSearchQuery('');
        setUserSort({ key: 'created_at', direction: 'desc' });
        setCurrentPage(1);
        setPageSize(50);
        setUserColumnFilters({});
        setUserDateFilters({});
        fetchUsers(1, 50, 'created_at', 'desc', {}, {});
        break;
      case 'orders':
        setOrderSearchQuery('');
        setOrderStartDate('');
        setOrderEndDate('');
        setOrderSort({ key: 'created_at', direction: 'desc' });
        setOrderPage(1);
        setOrderPageSize(50);
        setOrderColumnFilters({});
        setOrderDateFilters({});
        fetchOrders(1, 50, '', '', 'created_at', 'desc', {}, {});
        break;
      case 'sms':
        setSmsSearchQuery('');
        setSmsStartDate('');
        setSmsEndDate('');
        setSmsSort({ key: 'created_at', direction: 'desc' });
        setSmsPage(1);
        setSmsPageSize(50);
        setSmsColumnFilters({});
        setSmsDateFilters({});
        fetchSms(1, 50, '', '', 'created_at', 'desc', {}, {});
        break;
      case 'parcels':
        setParcelSearchQuery('');
        setParcelStartDate('');
        setParcelEndDate('');
        setParcelSort({ key: 'created_at', direction: 'desc' });
        setParcelPage(1);
        setParcelPageSize(50);
        setParcelColumnFilters({});
        setParcelDateFilters({});
        fetchParcels(1, 50, '', '', 'created_at', 'desc', {}, {});
        break;
      case 'admins':
        setAdminSearchQuery('');
        setAdminSort({ key: 'created_at', direction: 'desc' });
        setAdminPage(1);
        setAdminPageSize(50);
        setAdminColumnFilters({});
        setAdminDateFilters({});
        fetchAdmins(1, 50, 'created_at', 'desc', {}, {});
        break;
    }
  };

  return (
    <AdminLayout activeMenu={activeMenu} onMenuClick={(key) => { setActiveMenu(key); setActiveTab(key); }} onRefresh={handleRefresh}>
          {messageContextHolder}
          <div key={refreshKey} style={{ display: 'contents' }}>

          {/* 概覽頁面 */}
          {activeTab === 'overview' && (
            <OverviewTab stats={stats} />
          )}

          {/* 會員管理頁面 */}
          {activeTab === 'users' && (
            <UsersTab
              users={users}
              loading={loading}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              onSearch={() => searchUsers(1, pageSize, searchQuery)}
              onReset={() => {
                setSearchQuery('');
                setUserColumnFilters({});
                setUserDateFilters({});
                fetchUsers(1, pageSize, undefined, undefined, {}, {});
              }}
              onDelete={deleteUser}
              onBatchDelete={batchDeleteUsers}
              currentPage={currentPage}
              pageSize={pageSize}
              totalItems={userTotalItems}
              onPageChange={handleUsersPageChange}
              onPageSizeChange={handlePageSizeChange}
              sortKey={userSort.key}
              sortDirection={userSort.direction}
              onSortChange={(key, direction) => {
                setUserSort({ key, direction });
                if (searchQuery.trim()) {
                  searchUsers(currentPage, pageSize, searchQuery, key, direction);
                } else {
                  fetchUsers(currentPage, pageSize, key, direction);
                }
              }}
              refreshKey={refreshKey}
              onColumnFilterChange={(cf, df) => {
                setUserColumnFilters(cf);
                setUserDateFilters(df);
                fetchUsers(1, pageSize, userSort.key, userSort.direction, cf, df);
              }}
            />
          )}

          {/* 訂單管理頁面 */}
          {activeTab === 'orders' && (
            <OrdersTab
              orders={orders}
              loading={ordersLoading}
              searchQuery={orderSearchQuery}
              onSearchQueryChange={setOrderSearchQuery}
              onSearch={searchOrders}
              onReset={resetOrderSearch}
              currentPage={orderPage}
              pageSize={orderPageSize}
              totalItems={orderTotalItems}
              onPageChange={fetchOrders}
              onPageSizeChange={handleOrderPageSizeChange}
              sortKey={orderSort.key}
              sortDirection={orderSort.direction}
              onSortChange={(key, direction) => {
                setOrderSort({ key, direction });
                fetchOrders(orderPage, orderPageSize, orderStartDate, orderEndDate, key, direction);
              }}
              onUpdateStatus={updateOrderStatus}
              onDelete={deleteOrder}
              onBatchDelete={batchDeleteOrders}
              refreshKey={refreshKey}
              onColumnFilterChange={(cf, df) => {
                setOrderColumnFilters(cf);
                setOrderDateFilters(df);
                fetchOrders(1, orderPageSize, orderStartDate, orderEndDate, orderSort.key, orderSort.direction, cf, df);
              }}
            />
          )}

          {/* 簡訊資訊頁面 */}
          {activeTab === 'sms' && (
            <SmsTab
              smsItems={smsItems}
              loading={smsLoading}
              searchQuery={smsSearchQuery}
              onSearchQueryChange={setSmsSearchQuery}
              onSearch={searchSms}
              onReset={resetSmsSearch}
              currentPage={smsPage}
              pageSize={smsPageSize}
              totalItems={smsTotalItems}
              onPageChange={fetchSms}
              onPageSizeChange={handleSmsPageSizeChange}
              sortKey={smsSort.key}
              sortDirection={smsSort.direction}
              onSortChange={(key, direction) => {
                setSmsSort({ key, direction });
                fetchSms(smsPage, smsPageSize, smsStartDate, smsEndDate, key, direction);
              }}
              onDelete={deleteSmsRecord}
              onBatchDelete={batchDeleteSmsRecords}
              refreshKey={refreshKey}
              onColumnFilterChange={(cf, df) => {
                setSmsColumnFilters(cf);
                setSmsDateFilters(df);
                fetchSms(1, smsPageSize, smsStartDate, smsEndDate, smsSort.key, smsSort.direction, cf, df);
              }}
            />
          )}

          {/* 包裹管理頁面 */}
          {activeTab === 'parcels' && (
            <ParcelsTab
              parcels={parcels}
              loading={parcelsLoading}
              searchQuery={parcelSearchQuery}
              onSearchQueryChange={setParcelSearchQuery}
              onSearch={searchParcels}
              onReset={resetParcelSearch}
              currentPage={parcelPage}
              pageSize={parcelPageSize}
              totalItems={parcelTotalItems}
              onPageChange={fetchParcels}
              onPageSizeChange={handleParcelPageSizeChange}
              sortKey={parcelSort.key}
              sortDirection={parcelSort.direction}
              onSortChange={(key, direction) => {
                setParcelSort({ key, direction });
                fetchParcels(parcelPage, parcelPageSize, parcelStartDate, parcelEndDate, key, direction);
              }}
              onUpdateStatus={updateParcelStatus}
              onDelete={deleteParcel}
              onBatchDelete={batchDeleteParcels}
              onExport={handleExportParcels}
              onInbound={inboundParcel}
              onEdit={editParcel}
              onFetchItems={fetchParcelItems}
              refreshKey={refreshKey}
              onColumnFilterChange={(cf, df) => {
                setParcelColumnFilters(cf);
                setParcelDateFilters(df);
                fetchParcels(1, parcelPageSize, parcelStartDate, parcelEndDate, parcelSort.key, parcelSort.direction, cf, df);
              }}
            />
          )}

          {/* 管理員頁面 */}
          {activeTab === 'admins' && (
            <AdminsTab
              admins={admins}
              loading={adminsLoading}
              searchQuery={adminSearchQuery}
              onSearchQueryChange={setAdminSearchQuery}
              onSearch={searchAdmins}
              onReset={resetAdminSearch}
              currentPage={adminPage}
              pageSize={adminPageSize}
              totalItems={adminTotalItems}
              onPageChange={fetchAdmins}
              onPageSizeChange={handleAdminPageSizeChange}
              sortKey={adminSort.key}
              sortDirection={adminSort.direction}
              onSortChange={(key, direction) => {
                setAdminSort({ key, direction });
                fetchAdmins(adminPage, adminPageSize, key, direction);
              }}
              onToggleStatus={updateAdminAccountStatus}
              onDelete={deleteAdminUser}
              onBatchDelete={batchDeleteAdminUsers}
              currentAdminId={adminUser?.id}
              refreshKey={refreshKey}
              onColumnFilterChange={(cf, df) => {
                setAdminColumnFilters(cf);
                setAdminDateFilters(df);
                fetchAdmins(1, adminPageSize, adminSort.key, adminSort.direction, cf, df);
              }}
            />
          )}
          </div>
    </AdminLayout>
  );
}




