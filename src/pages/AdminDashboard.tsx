import AdminLayout from '../app/layouts/AdminLayout';
import { useState, useEffect, useCallback } from 'react';
import { message, Tabs } from 'antd';
import { Home, Users, User, ShoppingCart, MessageCircle, Package, ClipboardList, Shield } from 'lucide-react';

import { adminFetch } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PERMISSIONS } from '../lib/permissions';
import OverviewTab from './dashboard/OverviewTab';
import UsersTab from './dashboard/UsersTab';
import OrdersTab from './dashboard/OrdersTab';
import SmsTab from './dashboard/SmsTab';
import ParcelsTab from './dashboard/ParcelsTab';
import AdminsTab from './dashboard/AdminsTab';
import LogisticsTab, { LogisticsProvider, LogisticsPayload } from './dashboard/LogisticsTab';
import StorageBinsTab, { StorageBin, StorageBinPayload } from './dashboard/StorageBinsTab';
import NumberLibraryTab, { NumberCategory, NumberCategoryPayload } from './dashboard/NumberLibraryTab';
import AddressBookTab, { AddressBookEntry, AddressBookPayload } from './dashboard/AddressBookTab';
import RouteTransportTab from './dashboard/RouteTransportTab';
import RolesTab from './dashboard/RolesTab';
import ParcelStatusTab from './dashboard/ParcelStatusTab';
import LabelsTab from './dashboard/LabelsTab';

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
  role_scope: 'platform' | 'logistics';
  role_logistics_provider_id: number | null;
  logistics_provider_id: number | null;
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
  const { user: adminUser, loading: authLoading, logout, hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [activeMenu, setActiveMenu] = useState('overview');
  const [users, setUsers] = useState<User[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [smsItems, setSmsItems] = useState<SmsInfo[]>([]);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [logisticsProviders, setLogisticsProviders] = useState<LogisticsProvider[]>([]);
  const [storageBins, setStorageBins] = useState<StorageBin[]>([]);
  const [numberCategories, setNumberCategories] = useState<NumberCategory[]>([]);
  const [addressEntries, setAddressEntries] = useState<AddressBookEntry[]>([]);
  const [stats, setStats] = useState<Stats>({ totalUsers: 0, totalOrders: 0, totalParcels: 0 });  const [searchQuery, setSearchQuery] = useState('');
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
  const [logisticsSearchQuery, setLogisticsSearchQuery] = useState('');
  const [storageBinSearchQuery, setStorageBinSearchQuery] = useState('');
  const [numberCategorySearchQuery, setNumberCategorySearchQuery] = useState('');
  const [addressSearchQuery, setAddressSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [smsLoading, setSmsLoading] = useState(false);
  const [parcelsLoading, setParcelsLoading] = useState(false);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [logisticsLoading, setLogisticsLoading] = useState(false);
  const [storageBinsLoading, setStorageBinsLoading] = useState(false);
  const [numberCategoriesLoading, setNumberCategoriesLoading] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);
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
  const [logisticsPage, setLogisticsPage] = useState(1);
  const [logisticsPageSize, setLogisticsPageSize] = useState(50);
  const [logisticsTotalItems, setLogisticsTotalItems] = useState(0);
  const [storageBinPage, setStorageBinPage] = useState(1);
  const [storageBinPageSize, setStorageBinPageSize] = useState(50);
  const [storageBinTotalItems, setStorageBinTotalItems] = useState(0);
  const [numberCategoryPage, setNumberCategoryPage] = useState(1);
  const [numberCategoryPageSize, setNumberCategoryPageSize] = useState(50);
  const [numberCategoryTotalItems, setNumberCategoryTotalItems] = useState(0);
  const [addressPage, setAddressPage] = useState(1);
  const [addressPageSize, setAddressPageSize] = useState(50);
  const [addressTotalItems, setAddressTotalItems] = useState(0);
  const [userSort, setUserSort] = useState<SortConfig<'id' | 'username' | 'phone' | 'email' | 'real_name' | 'address' | 'created_at' | 'updated_at'>>({ key: 'created_at', direction: 'desc' });
  const [orderSort, setOrderSort] = useState<SortConfig<'id' | 'user_id' | 'total_amount' | 'status' | 'created_at'>>({ key: 'created_at', direction: 'desc' });
  const [smsSort, setSmsSort] = useState<SortConfig<'id' | 'phone' | 'code' | 'verified' | 'expires_at' | 'created_at'>>({ key: 'created_at', direction: 'desc' });
  const [parcelSort, setParcelSort] = useState<SortConfig<'id' | 'user_id' | 'tracking_number' | 'origin' | 'destination' | 'weight' | 'length_cm' | 'width_cm' | 'height_cm' | 'volume' | 'status' | 'estimated_delivery' | 'created_at' | 'username'>>({ key: 'created_at', direction: 'desc' });
  const [adminSort, setAdminSort] = useState<SortConfig<'id' | 'username' | 'email' | 'role' | 'status' | 'last_login' | 'created_at'>>({ key: 'created_at', direction: 'desc' });
  const [logisticsSort, setLogisticsSort] = useState<SortConfig<'id' | 'name' | 'code' | 'contact_name' | 'contact_phone' | 'email' | 'website' | 'status' | 'created_at'>>({ key: 'created_at', direction: 'desc' });
  const [storageBinSort, setStorageBinSort] = useState<SortConfig<'id' | 'storage_bin' | 'warehouse' | 'is_enabled' | 'created_at'>>({ key: 'created_at', direction: 'desc' });
  const [numberCategorySort, setNumberCategorySort] = useState<SortConfig<'id' | 'number_category' | 'is_enabled' | 'created_at'>>({ key: 'created_at', direction: 'desc' });
  const [addressSort, setAddressSort] = useState<SortConfig<'id' | 'name' | 'region' | 'phone' | 'created_at'>>({ key: 'created_at', direction: 'desc' });
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set());

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
  const [logisticsColumnFilters, setLogisticsColumnFilters] = useState<Record<string, string>>({});
  const [logisticsDateFilters, setLogisticsDateFilters] = useState<Record<string, [string, string]>>({});
  const [storageBinColumnFilters, setStorageBinColumnFilters] = useState<Record<string, string>>({});
  const [storageBinDateFilters, setStorageBinDateFilters] = useState<Record<string, [string, string]>>({});
  const [numberCategoryColumnFilters, setNumberCategoryColumnFilters] = useState<Record<string, string>>({});
  const [numberCategoryDateFilters, setNumberCategoryDateFilters] = useState<Record<string, [string, string]>>({});
  const [addressColumnFilters, setAddressColumnFilters] = useState<Record<string, string>>({});
  const [addressDateFilters, setAddressDateFilters] = useState<Record<string, [string, string]>>({});

  const hasAdminView = hasPermission(PERMISSIONS.ADMIN_VIEW);
  const hasPlatformRoleView = hasPermission(PERMISSIONS.ROLE_PLATFORM_VIEW);
  const hasLogisticsRoleView = hasPermission(PERMISSIONS.ROLE_LOGISTICS_VIEW);
  // 当前登录账号的作用域与归属物流商（物流商账号用于锁定角色/管理员的归属范围）
  const actorScope: 'platform' | 'logistics' = adminUser?.role_scope === 'logistics' ? 'logistics' : 'platform';
  const actorProviderId = adminUser?.logistics_provider_id ?? null;
  const actorProviderName = adminUser?.logistics_provider_name ?? null;
  const actorProviderCode = adminUser?.logistics_provider_code ?? null;
  const systemAdminTabs = [
    hasAdminView && actorScope === 'platform' ? { key: 'platform-admins', label: '平台管理员' } : null,
    hasAdminView ? { key: 'logistics-admins', label: '物流商管理员' } : null,
    hasPlatformRoleView ? { key: 'platform-permissions', label: '平台权限' } : null,
    hasLogisticsRoleView ? { key: 'logistics-permissions', label: '物流商权限' } : null,
  ].filter(Boolean) as Array<{ key: string; label: string }>;

  const hasParcelStatusView = hasPermission(PERMISSIONS.PARCEL_STATUS_VIEW);
  const hasLabelView = hasPermission(PERMISSIONS.LABEL_VIEW);
  const systemSettingsTabs = [
    hasParcelStatusView ? { key: 'parcel-status', label: '包裹状态字典' } : null,
    hasLabelView ? { key: 'labels', label: '标签管理' } : null,
  ].filter(Boolean) as Array<{ key: string; label: string }>;

  const handleMenuClick = useCallback((key: string) => {
    if (key === 'admins') {
      const nextTab = systemAdminTabs[0]?.key ?? 'logistics-admins';
      setActiveMenu('admins');
      setActiveTab(nextTab);
      return;
    }
    if (key === 'system') {
      const nextTab = systemSettingsTabs[0]?.key ?? 'parcel-status';
      setActiveMenu('system');
      setActiveTab(nextTab);
      return;
    }
    setActiveMenu(key);
    setActiveTab(key);
  }, [hasAdminView, hasParcelStatusView, hasLabelView]);

  // 计算登录后默认落地页：物流商等无「概览」权限的账号不显示首页，跳转到第一个可访问页面
  const resolveLandingTab = (): { menu: string; tab: string } => {
    if (hasPermission(PERMISSIONS.OVERVIEW_VIEW)) return { menu: 'overview', tab: 'overview' };
    if (hasPermission(PERMISSIONS.PARCEL_VIEW)) return { menu: 'parcels', tab: 'parcels' };
    if (hasPermission(PERMISSIONS.ORDER_VIEW)) return { menu: 'orders', tab: 'orders' };
    if (hasPermission(PERMISSIONS.ROUTE_TRANSPORT_VIEW)) return { menu: 'route-transport', tab: 'route-transport' };
    if (hasPermission(PERMISSIONS.SMS_VIEW)) return { menu: 'sms', tab: 'sms' };
    if (hasPermission(PERMISSIONS.LOGISTICS_VIEW)) return { menu: 'logistics', tab: 'logistics' };
    if (hasPermission(PERMISSIONS.STORAGE_BIN_VIEW)) return { menu: 'storage-bins', tab: 'storage-bins' };
    if (hasPermission(PERMISSIONS.USER_VIEW)) return { menu: 'users', tab: 'users' };
    if (hasPermission(PERMISSIONS.ADDRESS_BOOK_VIEW)) return { menu: 'address-book', tab: 'address-book' };
    if (hasPermission(PERMISSIONS.NUMBER_LIB_VIEW)) return { menu: 'number-library', tab: 'number-library' };
    if (systemAdminTabs.length > 0) return { menu: 'admins', tab: systemAdminTabs[0].key };
    return { menu: 'overview', tab: 'overview' };
  };

  useEffect(() => {
    if (authLoading || !adminUser) return;
    // 当前停留在无权限的概览页时，自动切换到第一个可访问页面
    if (activeTab === 'overview' && !hasPermission(PERMISSIONS.OVERVIEW_VIEW)) {
      const landing = resolveLandingTab();
      setActiveMenu(landing.menu);
      setActiveTab(landing.tab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, adminUser]);

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
    // 按需加载数据，而不是初始化时全部加载
  }, [authLoading, adminUser]);

  useEffect(() => {
    if (activeTab === 'users' && !loadedTabs.has('users')) {
      fetchUsers();
      setLoadedTabs(prev => new Set([...prev, 'users']));
    }
    if (activeTab === 'orders' && !loadedTabs.has('orders')) {
      fetchOrders();
      setLoadedTabs(prev => new Set([...prev, 'orders']));
    }
    if (activeTab === 'parcels' && !loadedTabs.has('parcels')) {
      fetchParcels();
      setLoadedTabs(prev => new Set([...prev, 'parcels']));
    }
    if (activeTab === 'sms' && !loadedTabs.has('sms')) {
      fetchSms();
      setLoadedTabs(prev => new Set([...prev, 'sms']));
    }
    if (activeTab === 'platform-admins' || activeTab === 'logistics-admins') {
      fetchAdmins();
      if (!loadedTabs.has('admins')) {
        setLoadedTabs(prev => new Set([...prev, 'admins']));
      }
    }
    if (activeTab === 'logistics' && !loadedTabs.has('logistics')) {
      fetchLogistics();
      setLoadedTabs(prev => new Set([...prev, 'logistics']));
    }
    if (activeTab === 'storage-bins' && !loadedTabs.has('storage-bins')) {
      fetchStorageBins();
      setLoadedTabs(prev => new Set([...prev, 'storage-bins']));
    }
    if (activeTab === 'number-library' && !loadedTabs.has('number-library')) {
      fetchNumberCategories();
      setLoadedTabs(prev => new Set([...prev, 'number-library']));
    }
    if (activeTab === 'address-book' && !loadedTabs.has('address-book')) {
      fetchAddressEntries();
      setLoadedTabs(prev => new Set([...prev, 'address-book']));
    }
  }, [activeTab, loadedTabs]);

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
      const adminScope = activeTab === 'platform-admins' ? 'platform' : activeTab === 'logistics-admins' ? 'logistics' : '';
      if (adminScope) params.set('scope', adminScope);
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

  const fetchLogistics = async (
    page: number = 1,
    size: number = logisticsPageSize,
    sortKey?: string,
    sortDir?: string,
    colFilters?: Record<string, string>,
    dtFilters?: Record<string, [string, string]>
  ) => {
    const sk = sortKey || logisticsSort.key;
    const sd = sortDir || logisticsSort.direction;
    const cf = colFilters !== undefined ? colFilters : logisticsColumnFilters;
    const df = dtFilters !== undefined ? dtFilters : logisticsDateFilters;
    try {
      setLogisticsLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: String(size),
        sortKey: sk,
        sortOrder: sd,
      });
      if (Object.keys(cf).length > 0) params.set('columnFilters', JSON.stringify(cf));
      if (Object.keys(df).length > 0) params.set('dateFilters', JSON.stringify(df));
      const response = await adminFetch(`/admin/logistics?${params.toString()}`);
      if (!ensureAuthorized(response)) return;
      if (!response.ok) throw new Error('fetch logistics failed');
      const data = await response.json();
      setLogisticsProviders(data.data || []);
      setLogisticsPage(page);
      setLogisticsPageSize(size);
      setLogisticsTotalItems(data.pagination?.total || 0);
    } catch (err) {
      setError('读取物流商失败');
    } finally {
      setLogisticsLoading(false);
    }
  };

  const handleLogisticsPageSizeChange = (newSize: number) => {
    setLogisticsPageSize(newSize);
    setLogisticsPage(1);
    fetchLogistics(1, newSize);
  };

  const searchLogistics = async () => {
    if (!logisticsSearchQuery.trim()) {
      setLogisticsPage(1);
      fetchLogistics(1, logisticsPageSize);
      return;
    }
    try {
      setLogisticsLoading(true);
      setLogisticsPage(1);
      const response = await adminFetch(`/admin/logistics/search?q=${encodeURIComponent(logisticsSearchQuery)}`);
      if (!ensureAuthorized(response)) return;
      if (!response.ok) throw new Error('search logistics failed');
      const data = await response.json();
      setLogisticsProviders(data.data || []);
      setLogisticsTotalItems(data.count || (data.data || []).length || 0);
    } catch (err) {
      setError('搜索物流商失败');
    } finally {
      setLogisticsLoading(false);
    }
  };

  const resetLogisticsSearch = () => {
    setLogisticsSearchQuery('');
    setLogisticsPage(1);
    fetchLogistics(1, logisticsPageSize);
  };

  const createLogistics = async (payload: LogisticsPayload): Promise<boolean> => {
    try {
      const response = await adminFetch('/admin/logistics', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!ensureAuthorized(response)) return false;
      if (response.ok) {
        fetchLogistics(1, logisticsPageSize);
        return true;
      }
      const data = await response.json();
      setError(data.error || '创建物流商失败');
      return false;
    } catch {
      setError('创建物流商失败');
      return false;
    }
  };

  const updateLogistics = async (id: number, payload: LogisticsPayload): Promise<boolean> => {
    try {
      const response = await adminFetch(`/admin/logistics/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (!ensureAuthorized(response)) return false;
      if (response.ok) {
        fetchLogistics(logisticsPage, logisticsPageSize);
        return true;
      }
      const data = await response.json();
      setError(data.error || '更新物流商失败');
      return false;
    } catch {
      setError('更新物流商失败');
      return false;
    }
  };

  const deleteLogistics = async (id: number) => {
    try {
      const response = await adminFetch(`/admin/logistics/${id}`, { method: 'DELETE' });
      if (!ensureAuthorized(response)) return;
      if (response.ok) {
        fetchLogistics(logisticsPage, logisticsPageSize);
      } else {
        setError('删除物流商失败');
      }
    } catch { setError('删除失败'); }
  };

  const batchDeleteLogistics = async (ids: number[]) => {
    try {
      const response = await adminFetch('/admin/logistics/batch-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      if (!ensureAuthorized(response)) return;
      if (response.ok) { fetchLogistics(logisticsPage, logisticsPageSize); } else { setError('批量删除物流商失败'); }
    } catch { setError('批量删除失败'); }
  };

  const fetchStorageBins = async (
    page: number = 1,
    size: number = storageBinPageSize,
    sortKey?: string,
    sortDir?: string,
    colFilters?: Record<string, string>,
    dtFilters?: Record<string, [string, string]>
  ) => {
    const sk = sortKey || storageBinSort.key;
    const sd = sortDir || storageBinSort.direction;
    const cf = colFilters !== undefined ? colFilters : storageBinColumnFilters;
    const df = dtFilters !== undefined ? dtFilters : storageBinDateFilters;
    try {
      setStorageBinsLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: String(size),
        sortKey: sk,
        sortOrder: sd,
      });
      if (Object.keys(cf).length > 0) params.set('columnFilters', JSON.stringify(cf));
      if (Object.keys(df).length > 0) params.set('dateFilters', JSON.stringify(df));
      const response = await adminFetch(`/admin/storage-bins?${params.toString()}`);
      if (!ensureAuthorized(response)) return;
      if (!response.ok) throw new Error('fetch storage bins failed');
      const data = await response.json();
      setStorageBins(data.data || []);
      setStorageBinPage(page);
      setStorageBinPageSize(size);
      setStorageBinTotalItems(data.pagination?.total || 0);
    } catch (err) {
      setError('读取库位失败');
    } finally {
      setStorageBinsLoading(false);
    }
  };

  const handleStorageBinPageSizeChange = (newSize: number) => {
    setStorageBinPageSize(newSize);
    setStorageBinPage(1);
    fetchStorageBins(1, newSize);
  };

  const searchStorageBins = async () => {
    if (!storageBinSearchQuery.trim()) {
      setStorageBinPage(1);
      fetchStorageBins(1, storageBinPageSize);
      return;
    }
    try {
      setStorageBinsLoading(true);
      setStorageBinPage(1);
      const response = await adminFetch(`/admin/storage-bins/search?q=${encodeURIComponent(storageBinSearchQuery)}`);
      if (!ensureAuthorized(response)) return;
      if (!response.ok) throw new Error('search storage bins failed');
      const data = await response.json();
      setStorageBins(data.data || []);
      setStorageBinTotalItems(data.count || (data.data || []).length || 0);
    } catch (err) {
      setError('搜索库位失败');
    } finally {
      setStorageBinsLoading(false);
    }
  };

  const resetStorageBinSearch = () => {
    setStorageBinSearchQuery('');
    setStorageBinPage(1);
    fetchStorageBins(1, storageBinPageSize);
  };

  const createStorageBin = async (payload: StorageBinPayload): Promise<boolean> => {
    try {
      const response = await adminFetch('/admin/storage-bins', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!ensureAuthorized(response)) return false;
      if (response.ok) {
        fetchStorageBins(1, storageBinPageSize);
        return true;
      }
      const data = await response.json();
      setError(data.error || '创建库位失败');
      return false;
    } catch {
      setError('创建库位失败');
      return false;
    }
  };

  const updateStorageBin = async (id: number, payload: StorageBinPayload): Promise<boolean> => {
    try {
      const response = await adminFetch(`/admin/storage-bins/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (!ensureAuthorized(response)) return false;
      if (response.ok) {
        fetchStorageBins(storageBinPage, storageBinPageSize);
        return true;
      }
      const data = await response.json();
      setError(data.error || '更新库位失败');
      return false;
    } catch {
      setError('更新库位失败');
      return false;
    }
  };

  const deleteStorageBin = async (id: number) => {
    try {
      const response = await adminFetch(`/admin/storage-bins/${id}`, { method: 'DELETE' });
      if (!ensureAuthorized(response)) return;
      if (response.ok) {
        fetchStorageBins(storageBinPage, storageBinPageSize);
      } else {
        setError('删除库位失败');
      }
    } catch { setError('删除失败'); }
  };

  const batchDeleteStorageBins = async (ids: number[]) => {
    try {
      const response = await adminFetch('/admin/storage-bins/batch-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      if (!ensureAuthorized(response)) return;
      if (response.ok) { fetchStorageBins(storageBinPage, storageBinPageSize); } else { setError('批量删除库位失败'); }
    } catch { setError('批量删除失败'); }
  };

  const fetchNumberCategories = async (
    page: number = 1,
    size: number = numberCategoryPageSize,
    sortKey?: string,
    sortDir?: string,
    colFilters?: Record<string, string>,
    dtFilters?: Record<string, [string, string]>
  ) => {
    const sk = sortKey || numberCategorySort.key;
    const sd = sortDir || numberCategorySort.direction;
    const cf = colFilters !== undefined ? colFilters : numberCategoryColumnFilters;
    const df = dtFilters !== undefined ? dtFilters : numberCategoryDateFilters;
    try {
      setNumberCategoriesLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: String(size),
        sortKey: sk,
        sortOrder: sd,
      });
      if (Object.keys(cf).length > 0) params.set('columnFilters', JSON.stringify(cf));
      if (Object.keys(df).length > 0) params.set('dateFilters', JSON.stringify(df));
      const response = await adminFetch(`/admin/number-categories?${params.toString()}`);
      if (!ensureAuthorized(response)) return;
      if (!response.ok) throw new Error('fetch number categories failed');
      const data = await response.json();
      setNumberCategories(data.data || []);
      setNumberCategoryPage(page);
      setNumberCategoryPageSize(size);
      setNumberCategoryTotalItems(data.pagination?.total || 0);
    } catch (err) {
      setError('读取号段失败');
    } finally {
      setNumberCategoriesLoading(false);
    }
  };

  const handleNumberCategoryPageSizeChange = (newSize: number) => {
    setNumberCategoryPageSize(newSize);
    setNumberCategoryPage(1);
    fetchNumberCategories(1, newSize);
  };

  const searchNumberCategories = async () => {
    if (!numberCategorySearchQuery.trim()) {
      setNumberCategoryPage(1);
      fetchNumberCategories(1, numberCategoryPageSize);
      return;
    }
    try {
      setNumberCategoriesLoading(true);
      setNumberCategoryPage(1);
      const response = await adminFetch(`/admin/number-categories/search?q=${encodeURIComponent(numberCategorySearchQuery)}`);
      if (!ensureAuthorized(response)) return;
      if (!response.ok) throw new Error('search number categories failed');
      const data = await response.json();
      setNumberCategories(data.data || []);
      setNumberCategoryTotalItems(data.count || (data.data || []).length || 0);
    } catch (err) {
      setError('搜索号段失败');
    } finally {
      setNumberCategoriesLoading(false);
    }
  };

  const resetNumberCategorySearch = () => {
    setNumberCategorySearchQuery('');
    setNumberCategoryPage(1);
    fetchNumberCategories(1, numberCategoryPageSize);
  };

  const createNumberCategory = async (payload: NumberCategoryPayload): Promise<boolean> => {
    try {
      const response = await adminFetch('/admin/number-categories', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!ensureAuthorized(response)) return false;
      if (response.ok) {
        fetchNumberCategories(1, numberCategoryPageSize);
        return true;
      }
      const data = await response.json();
      setError(data.error || '创建号段失败');
      return false;
    } catch {
      setError('创建号段失败');
      return false;
    }
  };

  const updateNumberCategory = async (id: number, payload: NumberCategoryPayload): Promise<boolean> => {
    try {
      const response = await adminFetch(`/admin/number-categories/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (!ensureAuthorized(response)) return false;
      if (response.ok) {
        fetchNumberCategories(numberCategoryPage, numberCategoryPageSize);
        return true;
      }
      const data = await response.json();
      setError(data.error || '更新号段失败');
      return false;
    } catch {
      setError('更新号段失败');
      return false;
    }
  };

  const deleteNumberCategory = async (id: number) => {
    try {
      const response = await adminFetch(`/admin/number-categories/${id}`, { method: 'DELETE' });
      if (!ensureAuthorized(response)) return;
      if (response.ok) {
        fetchNumberCategories(numberCategoryPage, numberCategoryPageSize);
      } else {
        setError('删除号段失败');
      }
    } catch { setError('删除失败'); }
  };

  const batchDeleteNumberCategories = async (ids: number[]) => {
    try {
      const response = await adminFetch('/admin/number-categories/batch-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      if (!ensureAuthorized(response)) return;
      if (response.ok) { fetchNumberCategories(numberCategoryPage, numberCategoryPageSize); } else { setError('批量删除号段失败'); }
    } catch { setError('批量删除失败'); }
  };

  const fetchAddressEntries = async (
    page: number = 1,
    size: number = addressPageSize,
    sortKey?: string,
    sortDir?: string,
    colFilters?: Record<string, string>,
    dtFilters?: Record<string, [string, string]>
  ) => {
    const sk = sortKey || addressSort.key;
    const sd = sortDir || addressSort.direction;
    const cf = colFilters !== undefined ? colFilters : addressColumnFilters;
    const df = dtFilters !== undefined ? dtFilters : addressDateFilters;
    try {
      setAddressLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: String(size),
        sortKey: sk,
        sortOrder: sd,
      });
      if (Object.keys(cf).length > 0) params.set('columnFilters', JSON.stringify(cf));
      if (Object.keys(df).length > 0) params.set('dateFilters', JSON.stringify(df));
      const response = await adminFetch(`/admin/address-book?${params.toString()}`);
      if (!ensureAuthorized(response)) return;
      if (!response.ok) throw new Error('fetch address book failed');
      const data = await response.json();
      setAddressEntries(data.data || []);
      setAddressPage(page);
      setAddressPageSize(size);
      setAddressTotalItems(data.pagination?.total || 0);
    } catch (err) {
      setError('读取地址簿失败');
    } finally {
      setAddressLoading(false);
    }
  };

  const handleAddressPageSizeChange = (newSize: number) => {
    setAddressPageSize(newSize);
    setAddressPage(1);
    fetchAddressEntries(1, newSize);
  };

  const searchAddressEntries = async () => {
    if (!addressSearchQuery.trim()) {
      setAddressPage(1);
      fetchAddressEntries(1, addressPageSize);
      return;
    }
    try {
      setAddressLoading(true);
      setAddressPage(1);
      const response = await adminFetch(`/admin/address-book/search?q=${encodeURIComponent(addressSearchQuery)}`);
      if (!ensureAuthorized(response)) return;
      if (!response.ok) throw new Error('search address book failed');
      const data = await response.json();
      setAddressEntries(data.data || []);
      setAddressTotalItems(data.count || (data.data || []).length || 0);
    } catch (err) {
      setError('搜索地址簿失败');
    } finally {
      setAddressLoading(false);
    }
  };

  const resetAddressSearch = () => {
    setAddressSearchQuery('');
    setAddressPage(1);
    fetchAddressEntries(1, addressPageSize);
  };

  const createAddressEntry = async (payload: AddressBookPayload): Promise<boolean> => {
    try {
      const response = await adminFetch('/admin/address-book', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!ensureAuthorized(response)) return false;
      if (response.ok) {
        fetchAddressEntries(1, addressPageSize);
        return true;
      }
      const data = await response.json();
      setError(data.error || '创建地址失败');
      return false;
    } catch {
      setError('创建地址失败');
      return false;
    }
  };

  const updateAddressEntry = async (id: number, payload: AddressBookPayload): Promise<boolean> => {
    try {
      const response = await adminFetch(`/admin/address-book/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (!ensureAuthorized(response)) return false;
      if (response.ok) {
        fetchAddressEntries(addressPage, addressPageSize);
        return true;
      }
      const data = await response.json();
      setError(data.error || '更新地址失败');
      return false;
    } catch {
      setError('更新地址失败');
      return false;
    }
  };

  const deleteAddressEntry = async (id: number) => {
    try {
      const response = await adminFetch(`/admin/address-book/${id}`, { method: 'DELETE' });
      if (!ensureAuthorized(response)) return;
      if (response.ok) {
        fetchAddressEntries(addressPage, addressPageSize);
      } else {
        setError('删除地址失败');
      }
    } catch { setError('删除失败'); }
  };

  const batchDeleteAddressEntries = async (ids: number[]) => {
    try {
      const response = await adminFetch('/admin/address-book/batch-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      if (!ensureAuthorized(response)) return;
      if (response.ok) { fetchAddressEntries(addressPage, addressPageSize); } else { setError('批量删除地址失败'); }
    } catch { setError('批量删除失败'); }
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
      const adminScope = activeTab === 'platform-admins' ? 'platform' : activeTab === 'logistics-admins' ? 'logistics' : '';
      const scopeParam = adminScope ? `&scope=${adminScope}` : '';
      const response = await adminFetch(`/admin/admins/search?q=${encodeURIComponent(adminSearchQuery)}${scopeParam}`);
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

  const updateUser = async (id: number, payload: { logistics_provider_id: number | null }): Promise<boolean> => {
    try {
      const response = await adminFetch(`/admin/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (!ensureAuthorized(response)) return false;
      if (response.ok) {
        fetchUsers(currentPage);
        return true;
      }
      setError('修改会员失败');
      return false;
    } catch {
      setError('修改失败');
      return false;
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

  const batchUpdateParcelsLogisticsProvider = async (ids: number[], logisticsProviderId: number): Promise<boolean> => {
    try {
      const response = await adminFetch('/admin/parcels/batch-update-logistics', {
        method: 'POST',
        body: JSON.stringify({ ids, logistics_provider_id: logisticsProviderId }),
      });
      if (!ensureAuthorized(response)) return false;
      if (response.ok) {
        fetchParcels(parcelPage, parcelPageSize);
        return true;
      }
      const data = await response.json().catch(() => ({}));
      setError(data.error || '批量调整物流商失败');
      return false;
    } catch {
      setError('批量调整物流商失败');
      return false;
    }
  };

  const handleExportParcels = async (selectedIds: number[] = []) => {
    try {
      const exportRowsToTemplate = async (rows: any[]) => {
        const { exportParcelsToTemplate } = await import('../lib/parcelExport');
        await exportParcelsToTemplate(rows);
      };

      const validSelectedIds = Array.from(new Set(selectedIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)));
      const isLoadedAllFilteredRows = parcelTotalItems > 0 && parcels.length > 0 && parcelTotalItems === parcels.length;
      const loadedRows = isLoadedAllFilteredRows
        ? (validSelectedIds.length > 0
          ? parcels.filter((record) => validSelectedIds.includes(record.id))
          : parcels)
        : [];

      if (loadedRows.length > 0) {
        const exportRows = await buildExportRowsFromLoadedParcels(loadedRows as Array<Parcel & { status_remark?: string | null }>);
        if (exportRows.length > 0) {
          await exportRowsToTemplate(exportRows);
          message.success(`已导出 ${exportRows.length} 条数据`);
          return;
        }
      }

      const params = new URLSearchParams({
        sortKey: parcelSort.key,
        sortOrder: parcelSort.direction,
      });
      const keyword = parcelSearchQuery.trim();
      if (keyword) {
        params.set('q', keyword);
      }
      appendDateRangeParams(params, parcelStartDate, parcelEndDate);
      if (Object.keys(parcelColumnFilters).length > 0) {
        params.set('columnFilters', JSON.stringify(parcelColumnFilters));
      }
      if (Object.keys(parcelDateFilters).length > 0) {
        params.set('dateFilters', JSON.stringify(parcelDateFilters));
      }
      if (validSelectedIds.length > 0) {
        params.set('selectedIds', JSON.stringify(validSelectedIds));
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
      await exportRowsToTemplate(rows);
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

  const createAdminUser = async (payload: {
    username: string;
    email: string;
    role: string;
    role_scope: 'platform' | 'logistics';
    role_logistics_provider_id: number | null;
    logistics_provider_id: number | null;
    password: string;
  }): Promise<boolean> => {
    try {
      const response = await adminFetch('/admin/admins', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!ensureAuthorized(response)) return false;
      if (response.ok) {
        fetchAdmins(adminPage, adminPageSize);
        return true;
      }
      const data = await response.json().catch(() => ({}));
      setError(data.error || '新增管理员失败');
      return false;
    } catch {
      setError('新增管理员失败');
      return false;
    }
  };

  const updateAdminAccount = async (
    adminId: number,
    payload: {
      username: string;
      email: string;
      role: string;
      role_scope: 'platform' | 'logistics';
      role_logistics_provider_id: number | null;
      logistics_provider_id: number | null;
      password?: string;
    }
  ): Promise<boolean> => {
    try {
      const response = await adminFetch(`/admin/admins/${adminId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (!ensureAuthorized(response)) return false;
      if (response.ok) {
        fetchAdmins(adminPage, adminPageSize);
        return true;
      }
      const data = await response.json().catch(() => ({}));
      setError(data.error || '修改管理员失败');
      return false;
    } catch {
      setError('修改管理员失败');
      return false;
    }
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

  const buildExportRowsFromLoadedParcels = async (records: Array<Parcel & { status_remark?: string | null }>) => {
    const exportRows = await Promise.all(records.map(async (record) => {
      const items = await fetchParcelItems(record.id);
      return {
        id: record.id,
        tracking_number: record.tracking_number,
        status_remark: record.status_remark || '',
        username: record.username,
        weight: record.weight,
        length_cm: record.length_cm,
        width_cm: record.width_cm,
        height_cm: record.height_cm,
        item_names: items.map((item) => item.name).join(','),
        item_values: items.map((item) => String(item.value)).join(','),
        item_quantities: items.map((item) => String(item.quantity)).join(','),
      };
    }));
    return exportRows;
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
      case 'platform-admins':
      case 'logistics-admins':
        setAdminSearchQuery('');
        setAdminSort({ key: 'created_at', direction: 'desc' });
        setAdminPage(1);
        setAdminPageSize(50);
        setAdminColumnFilters({});
        setAdminDateFilters({});
        fetchAdmins(1, 50, 'created_at', 'desc', {}, {});
        break;
      case 'platform-permissions':
      case 'logistics-permissions':
        break;
      case 'logistics':
        setLogisticsSearchQuery('');
        setLogisticsSort({ key: 'created_at', direction: 'desc' });
        setLogisticsPage(1);
        setLogisticsPageSize(50);
        setLogisticsColumnFilters({});
        setLogisticsDateFilters({});
        fetchLogistics(1, 50, 'created_at', 'desc', {}, {});
        break;
      case 'storage-bins':
        setStorageBinSearchQuery('');
        setStorageBinSort({ key: 'created_at', direction: 'desc' });
        setStorageBinPage(1);
        setStorageBinPageSize(50);
        setStorageBinColumnFilters({});
        setStorageBinDateFilters({});
        fetchStorageBins(1, 50, 'created_at', 'desc', {}, {});
        break;
      case 'number-library':
        setNumberCategorySearchQuery('');
        setNumberCategorySort({ key: 'created_at', direction: 'desc' });
        setNumberCategoryPage(1);
        setNumberCategoryPageSize(50);
        setNumberCategoryColumnFilters({});
        setNumberCategoryDateFilters({});
        fetchNumberCategories(1, 50, 'created_at', 'desc', {}, {});
        break;
      case 'address-book':
        setAddressSearchQuery('');
        setAddressSort({ key: 'created_at', direction: 'desc' });
        setAddressPage(1);
        setAddressPageSize(50);
        setAddressColumnFilters({});
        setAddressDateFilters({});
        fetchAddressEntries(1, 50, 'created_at', 'desc', {}, {});
        break;
    }
  };

  return (
    <AdminLayout activeMenu={activeMenu} onMenuClick={handleMenuClick} onRefresh={handleRefresh}>
          {messageContextHolder}
          <div key={refreshKey} style={{ display: 'contents' }}>

          {(activeTab === 'parcel-status' || activeTab === 'labels') && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div
                style={{
                  padding: '0 12px',
                  borderBottom: '1px solid #eef2f6',
                  background: '#f8fafc',
                  flexShrink: 0,
                }}
              >
                <Tabs
                  activeKey={activeTab}
                  size="small"
                  items={systemSettingsTabs}
                  onChange={(key) => {
                    setActiveMenu('system');
                    setActiveTab(key);
                  }}
                  tabBarStyle={{ margin: 0, padding: '0 4px' }}
                />
              </div>

              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                {activeTab === 'parcel-status' && (
                  <ParcelStatusTab
                    canCreate={hasPermission(PERMISSIONS.PARCEL_STATUS_CREATE)}
                    canUpdate={hasPermission(PERMISSIONS.PARCEL_STATUS_UPDATE)}
                    canDelete={hasPermission(PERMISSIONS.PARCEL_STATUS_DELETE)}
                    refreshKey={refreshKey}
                  />
                )}
                {activeTab === 'labels' && (
                  <LabelsTab
                    canCreate={hasPermission(PERMISSIONS.LABEL_CREATE)}
                    canUpdate={hasPermission(PERMISSIONS.LABEL_UPDATE)}
                    canDelete={hasPermission(PERMISSIONS.LABEL_DELETE)}
                    refreshKey={refreshKey}
                  />
                )}
              </div>
            </div>
          )}

          {(activeTab === 'platform-admins' || activeTab === 'logistics-admins' || activeTab === 'platform-permissions' || activeTab === 'logistics-permissions') && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div
                style={{
                  padding: '0 12px',
                  borderBottom: '1px solid #eef2f6',
                  background: '#f8fafc',
                  flexShrink: 0,
                }}
              >
                <Tabs
                  activeKey={activeTab}
                  size="small"
                  items={systemAdminTabs}
                  onChange={(key) => {
                    setActiveMenu('admins');
                    // 切换到不同的管理员子标签时，清空搜索与筛选，避免跨作用域残留
                    if (key === 'platform-admins' || key === 'logistics-admins') {
                      setAdminSearchQuery('');
                      setAdminColumnFilters({});
                      setAdminDateFilters({});
                      setAdminPage(1);
                    }
                    setActiveTab(key);
                  }}
                  tabBarStyle={{ margin: 0, padding: '0 4px' }}
                />
              </div>

              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                {activeTab === 'platform-permissions' && (
                  <RolesTab
                    scope="platform"
                    canCreate={hasPermission(PERMISSIONS.ROLE_PLATFORM_CREATE)}
                    canUpdate={hasPermission(PERMISSIONS.ROLE_PLATFORM_UPDATE)}
                    canDelete={hasPermission(PERMISSIONS.ROLE_PLATFORM_DELETE)}
                    refreshKey={refreshKey}
                  />
                )}

                {activeTab === 'logistics-permissions' && (
                  <RolesTab
                    scope="logistics"
                    canCreate={hasPermission(PERMISSIONS.ROLE_LOGISTICS_CREATE)}
                    canUpdate={hasPermission(PERMISSIONS.ROLE_LOGISTICS_UPDATE)}
                    canDelete={hasPermission(PERMISSIONS.ROLE_LOGISTICS_DELETE)}
                    refreshKey={refreshKey}
                    actorScope={actorScope}
                    actorProviderId={actorProviderId}
                    actorProviderName={actorProviderName}
                  />
                )}

                {(activeTab === 'platform-admins' || activeTab === 'logistics-admins') && (
                  <AdminsTab
                    key={activeTab}
                    scope={activeTab === 'platform-admins' ? 'platform' : 'logistics'}
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
                    onCreate={createAdminUser}
                    onUpdate={updateAdminAccount}
                    onToggleStatus={updateAdminAccountStatus}
                    onDelete={deleteAdminUser}
                    onBatchDelete={batchDeleteAdminUsers}
                    canManage={hasPermission(PERMISSIONS.ADMIN_CREATE)}
                    canDelete={hasPermission(PERMISSIONS.ADMIN_DELETE)}
                    canUpdate={hasPermission(PERMISSIONS.ADMIN_UPDATE)}
                    canUpdateStatus={hasPermission(PERMISSIONS.ADMIN_UPDATE_STATUS)}
                    currentAdminId={adminUser?.id}
                    refreshKey={refreshKey}
                    onColumnFilterChange={(cf, df) => {
                      setAdminColumnFilters(cf);
                      setAdminDateFilters(df);
                      fetchAdmins(1, adminPageSize, adminSort.key, adminSort.direction, cf, df);
                    }}
                    actorScope={actorScope}
                    actorProviderId={actorProviderId}
                    actorProviderName={actorProviderName}
                    actorProviderCode={actorProviderCode}
                  />
                )}
              </div>
            </div>
          )}

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
              onUpdate={updateUser}
              canDelete={hasPermission(PERMISSIONS.USER_DELETE)}
              canUpdate={hasPermission(PERMISSIONS.USER_UPDATE)}
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
              canUpdateStatus={hasPermission(PERMISSIONS.ORDER_UPDATE_STATUS)}
              canDelete={hasPermission(PERMISSIONS.ORDER_DELETE)}
              refreshKey={refreshKey}
              onColumnFilterChange={(cf, df) => {
                setOrderColumnFilters(cf);
                setOrderDateFilters(df);
                fetchOrders(1, orderPageSize, orderStartDate, orderEndDate, orderSort.key, orderSort.direction, cf, df);
              }}
            />
          )}

          {/* 航线运输管理页面 */}
          {activeTab === 'route-transport' && (
            <RouteTransportTab
              actorScope={actorScope}
              actorProviderId={actorProviderId}
              canCreate={hasPermission(PERMISSIONS.ROUTE_TRANSPORT_CREATE)}
              canUpdate={hasPermission(PERMISSIONS.ROUTE_TRANSPORT_UPDATE)}
              canDelete={hasPermission(PERMISSIONS.ROUTE_TRANSPORT_DELETE)}
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
              canDelete={hasPermission(PERMISSIONS.SMS_DELETE)}
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
              onBatchUpdateLogisticsProvider={batchUpdateParcelsLogisticsProvider}
              onExport={handleExportParcels}
              onInbound={inboundParcel}
              onEdit={editParcel}
              onFetchItems={fetchParcelItems}
              canCreate={hasPermission(PERMISSIONS.PARCEL_CREATE)}
              canUpdate={hasPermission(PERMISSIONS.PARCEL_UPDATE)}
              canUpdateStatus={hasPermission(PERMISSIONS.PARCEL_UPDATE_STATUS)}
              canDelete={hasPermission(PERMISSIONS.PARCEL_DELETE)}
              canExport={hasPermission(PERMISSIONS.PARCEL_EXPORT)}
              refreshKey={refreshKey}
              onColumnFilterChange={(cf, df) => {
                setParcelColumnFilters(cf);
                setParcelDateFilters(df);
                fetchParcels(1, parcelPageSize, parcelStartDate, parcelEndDate, parcelSort.key, parcelSort.direction, cf, df);
              }}
            />
          )}

          {/* 物流商管理页面 */}
          {activeTab === 'logistics' && (
            <LogisticsTab
              providers={logisticsProviders}
              loading={logisticsLoading}
              searchQuery={logisticsSearchQuery}
              onSearchQueryChange={setLogisticsSearchQuery}
              onSearch={searchLogistics}
              onReset={resetLogisticsSearch}
              currentPage={logisticsPage}
              pageSize={logisticsPageSize}
              totalItems={logisticsTotalItems}
              onPageChange={fetchLogistics}
              onPageSizeChange={handleLogisticsPageSizeChange}
              sortKey={logisticsSort.key}
              sortDirection={logisticsSort.direction}
              onSortChange={(key, direction) => {
                setLogisticsSort({ key, direction });
                fetchLogistics(logisticsPage, logisticsPageSize, key, direction);
              }}
              onCreate={createLogistics}
              onUpdate={updateLogistics}
              onDelete={deleteLogistics}
              onBatchDelete={batchDeleteLogistics}
              canManage={hasPermission(PERMISSIONS.LOGISTICS_CREATE)}
              canUpdate={hasPermission(PERMISSIONS.LOGISTICS_UPDATE)}
              canDelete={hasPermission(PERMISSIONS.LOGISTICS_DELETE)}
              refreshKey={refreshKey}
              onColumnFilterChange={(cf, df) => {
                setLogisticsColumnFilters(cf);
                setLogisticsDateFilters(df);
                fetchLogistics(1, logisticsPageSize, logisticsSort.key, logisticsSort.direction, cf, df);
              }}
            />
          )}

          {/* 库位管理页面 */}
          {activeTab === 'storage-bins' && (
            <StorageBinsTab
              bins={storageBins}
              loading={storageBinsLoading}
              searchQuery={storageBinSearchQuery}
              onSearchQueryChange={setStorageBinSearchQuery}
              onSearch={searchStorageBins}
              onReset={resetStorageBinSearch}
              currentPage={storageBinPage}
              pageSize={storageBinPageSize}
              totalItems={storageBinTotalItems}
              onPageChange={fetchStorageBins}
              onPageSizeChange={handleStorageBinPageSizeChange}
              sortKey={storageBinSort.key}
              sortDirection={storageBinSort.direction}
              onSortChange={(key, direction) => {
                setStorageBinSort({ key, direction });
                fetchStorageBins(storageBinPage, storageBinPageSize, key, direction);
              }}
              onCreate={createStorageBin}
              onUpdate={updateStorageBin}
              onDelete={deleteStorageBin}
              onBatchDelete={batchDeleteStorageBins}
              canManage={hasPermission(PERMISSIONS.STORAGE_BIN_CREATE)}
              canUpdate={hasPermission(PERMISSIONS.STORAGE_BIN_UPDATE)}
              canDelete={hasPermission(PERMISSIONS.STORAGE_BIN_DELETE)}
              refreshKey={refreshKey}
              onColumnFilterChange={(cf, df) => {
                setStorageBinColumnFilters(cf);
                setStorageBinDateFilters(df);
                fetchStorageBins(1, storageBinPageSize, storageBinSort.key, storageBinSort.direction, cf, df);
              }}
            />
          )}

          {/* 单号库页面 */}
          {activeTab === 'number-library' && (
            <NumberLibraryTab
              categories={numberCategories}
              loading={numberCategoriesLoading}
              searchQuery={numberCategorySearchQuery}
              onSearchQueryChange={setNumberCategorySearchQuery}
              onSearch={searchNumberCategories}
              onReset={resetNumberCategorySearch}
              currentPage={numberCategoryPage}
              pageSize={numberCategoryPageSize}
              totalItems={numberCategoryTotalItems}
              onPageChange={fetchNumberCategories}
              onPageSizeChange={handleNumberCategoryPageSizeChange}
              sortKey={numberCategorySort.key}
              sortDirection={numberCategorySort.direction}
              onSortChange={(key, direction) => {
                setNumberCategorySort({ key, direction });
                fetchNumberCategories(numberCategoryPage, numberCategoryPageSize, key, direction);
              }}
              onCreate={createNumberCategory}
              onUpdate={updateNumberCategory}
              onDelete={deleteNumberCategory}
              onBatchDelete={batchDeleteNumberCategories}
              onNumbersChanged={() => fetchNumberCategories(numberCategoryPage, numberCategoryPageSize)}
              canManage={hasPermission(PERMISSIONS.NUMBER_LIB_CREATE)}
              canUpdate={hasPermission(PERMISSIONS.NUMBER_LIB_UPDATE)}
              canDelete={hasPermission(PERMISSIONS.NUMBER_LIB_DELETE)}
              refreshKey={refreshKey}
              onColumnFilterChange={(cf, df) => {
                setNumberCategoryColumnFilters(cf);
                setNumberCategoryDateFilters(df);
                fetchNumberCategories(1, numberCategoryPageSize, numberCategorySort.key, numberCategorySort.direction, cf, df);
              }}
            />
          )}

          {/* 地址簿页面 */}
          {activeTab === 'address-book' && (
            <AddressBookTab
              entries={addressEntries}
              loading={addressLoading}
              searchQuery={addressSearchQuery}
              onSearchQueryChange={setAddressSearchQuery}
              onSearch={searchAddressEntries}
              onReset={resetAddressSearch}
              currentPage={addressPage}
              pageSize={addressPageSize}
              totalItems={addressTotalItems}
              onPageChange={fetchAddressEntries}
              onPageSizeChange={handleAddressPageSizeChange}
              sortKey={addressSort.key}
              sortDirection={addressSort.direction}
              onSortChange={(key, direction) => {
                setAddressSort({ key, direction });
                fetchAddressEntries(addressPage, addressPageSize, key, direction);
              }}
              onCreate={createAddressEntry}
              onUpdate={updateAddressEntry}
              onDelete={deleteAddressEntry}
              onBatchDelete={batchDeleteAddressEntries}
              canManage={hasPermission(PERMISSIONS.ADDRESS_BOOK_CREATE)}
              canUpdate={hasPermission(PERMISSIONS.ADDRESS_BOOK_UPDATE)}
              canDelete={hasPermission(PERMISSIONS.ADDRESS_BOOK_DELETE)}
              refreshKey={refreshKey}
              onColumnFilterChange={(cf, df) => {
                setAddressColumnFilters(cf);
                setAddressDateFilters(df);
                fetchAddressEntries(1, addressPageSize, addressSort.key, addressSort.direction, cf, df);
              }}
            />
          )}
          </div>
    </AdminLayout>
  );
}




