import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo, memo } from 'react';
import { Button, Card, Checkbox, DatePicker, Form, Image, Input, InputNumber, Modal, Pagination as AntPagination, Popconfirm, Row, Col, Select, Space, Table, Tooltip, Upload, Tag } from 'antd';
import { ReloadOutlined, EyeOutlined, EditOutlined, DeleteOutlined, InboxOutlined, PlusOutlined, MinusCircleOutlined, FileTextOutlined, PictureOutlined, SendOutlined, ExpandOutlined, AppstoreOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { UploadFile } from 'antd/es/upload/interface';
import { adminFetch } from '../../lib/api';
import { constrainTableColumns, getConstrainedTableScrollX } from '../../lib/tableColumns';
import dayjs from 'dayjs';

const IDENTITY_DOCUMENT_TYPE_MAP: Record<string, string> = {
  CN_RESIDENT_ID: '大陆居民身份证',
  TW_RESIDENT_ID: '台湾身份证',
  HK_PERMANENT_ID: '香港永久性居民身份证',
  MO_PERMANENT_ID: '澳门永久性居民身份证',
  HK_RESIDENCE_PERMIT: '港澳居民居住证（香港）',
  MO_RESIDENCE_PERMIT: '港澳居民居住证（澳门）',
};

interface Parcel {
  id: number;
  user_id: number;
  tracking_number: string;
  order_number: string | null;
  origin: string;
  destination: string;
  weight: number | null;
  cod_amount: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  volume: number | null;
  images: string | null;
  storage_bin: string | null;
  status: string;
  sub_status: string | null;
  remark: string | null;
  estimated_delivery: string | null;
  created_at: string;
  updated_at?: string | null;
  username: string | null;
  logistics_provider_id: number | null;
  logistics_provider_name: string | null;
  sender_address_id: number | null;
  sender_name: string | null;
  sender_phone: string | null;
  sender_region: string | null;
  sender_province: string | null;
  sender_city: string | null;
  sender_district: string | null;
  sender_street: string | null;
  sender_address: string | null;
  recipient_address_id: number | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  recipient_region: string | null;
  recipient_province: string | null;
  recipient_city: string | null;
  recipient_district: string | null;
  recipient_street: string | null;
  recipient_address: string | null;
  declaration_document_id: number | null;
  declaration_document_type: string | null;
  declaration_document_number: string | null;
  declaration_holder_name: string | null;
  declaration_holder_phone: string | null;
  first_item_name: string | null;
  item_count: number;
  deleted_at?: string | null;
}

type ParcelSortKey = 'id' | 'user_id' | 'tracking_number' | 'origin' | 'destination' | 'weight' | 'length_cm' | 'width_cm' | 'height_cm' | 'volume' | 'status' | 'estimated_delivery' | 'created_at' | 'username';
type SortDirection = 'asc' | 'desc';

interface ParcelsTabProps {
  parcels: Parcel[];
  loading: boolean;
  actorScope: 'platform' | 'logistics';
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSearch: () => void;
  onReset: () => void;
  currentPage: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number, size: number) => void;
  onPageSizeChange: (size: number) => void;
  sortKey: ParcelSortKey;
  sortDirection: SortDirection;
  onSortChange: (key: ParcelSortKey, direction: SortDirection) => void;
  onUpdateStatus: (parcelId: number, status: string) => void;
  onDelete: (id: number) => void;
  onRestore?: (id: number) => Promise<boolean>;
  onBatchDelete: (ids: number[]) => void;
  onBatchUpdateLogisticsProvider?: (ids: number[], logisticsProviderId: number) => Promise<boolean>;
  onBatchUpdateCargoStatus?: (ids: number[], status: string) => Promise<boolean>;
  onExport?: (selectedIds?: number[]) => void | Promise<void>;
  onInbound: (formData: FormData) => Promise<boolean>;
  onEdit: (id: number, formData: FormData) => Promise<boolean>;
  onFetchItems: (id: number) => Promise<{ name: string; value: number; quantity: number }[]>;
  canCreate?: boolean;
  canUpdate?: boolean;
  canUpdateStatus?: boolean;
  canDelete?: boolean;
  canExport?: boolean;
  refreshKey?: number;
  onColumnFilterChange?: (columnFilters: Record<string, string>, dateFilters: Record<string, [string, string]>) => void;
}

export default memo(function ParcelsTab({
  parcels,
  loading,
  actorScope,
  searchQuery,
  onSearchQueryChange,
  onSearch,
  onReset,
  currentPage,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  sortKey,
  sortDirection,
  onSortChange,
  onUpdateStatus,
  onDelete,
  onRestore,
  onBatchDelete,
  onBatchUpdateLogisticsProvider,
  onBatchUpdateCargoStatus,
  onExport,
  onInbound,
  onEdit,
  onFetchItems,
  canCreate,
  canUpdate,
  canUpdateStatus,
  canDelete,
  canExport,
  refreshKey,
  onColumnFilterChange,
}: ParcelsTabProps) {
  const tableHostRef = useRef<HTMLDivElement>(null);
  const [tableScrollY, setTableScrollY] = useState(240);

  useLayoutEffect(() => {
    const updateTableHeight = () => {
      const nextHeight = tableHostRef.current?.clientHeight ?? 0;
      if (nextHeight > 0) {
        setTableScrollY(nextHeight - 86);
      }
    };

    updateTableHeight();

    const observer = new ResizeObserver(() => {
      updateTableHeight();
    });

    if (tableHostRef.current) {
      observer.observe(tableHostRef.current);
    }

    window.addEventListener('resize', updateTableHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateTableHeight);
    };
  }, []);

  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [localColumnFilters, setLocalColumnFilters] = useState<Record<string, string>>({});
  const [dateFilters, setDateFilters] = useState<Record<string, [string, string] | null>>({});
  const [resetKey, setResetKey] = useState(0);

  const [inboundOpen, setInboundOpen] = useState(false);
  const [inboundLoading, setInboundLoading] = useState(false);
  const [inboundForm] = Form.useForm();
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editMode, setEditMode] = useState<'view' | 'edit'>('edit');
  const [editLoading, setEditLoading] = useState(false);
  const [editForm] = Form.useForm();
  const [editFileList, setEditFileList] = useState<UploadFile[]>([]);
  const [editPreviewOpen, setEditPreviewOpen] = useState(false);
  const [editPreviewUrls, setEditPreviewUrls] = useState<string[]>([]);
  const [editPreviewIndex, setEditPreviewIndex] = useState(0);
  const fileToSrc = async (file: UploadFile): Promise<string> => {
    let src = file.url || (file as any).thumbUrl || '';
    if (!src && file.originFileObj) {
      src = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file.originFileObj as Blob);
      });
    }
    return src;
  };
  const handleEditPreview = async (file: UploadFile) => {
    const urls = await Promise.all(editFileList.map(fileToSrc));
    const validUrls = urls.filter(Boolean);
    if (validUrls.length === 0) return;
    const clicked = await fileToSrc(file);
    const idx = Math.max(0, validUrls.indexOf(clicked));
    setEditPreviewUrls(validUrls);
    setEditPreviewIndex(idx);
    setEditPreviewOpen(true);
  };
  const [editingParcel, setEditingParcel] = useState<Parcel | null>(null);

  const [logisticsOptions, setLogisticsOptions] = useState<{ id: number; name: string; code: string | null }[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const res = await adminFetch('/admin/logistics/options');
        if (res.ok) {
          const j = await res.json();
          setLogisticsOptions(j.data || []);
        }
      } catch { /* ignore */ }
    })();
  }, []);
  const logisticsSelectOptions = useMemo(
    () => logisticsOptions.map((o) => ({
      label: o.code ? `${o.name}（${o.code}）` : o.name,
      value: o.id,
    })),
    [logisticsOptions]
  );

  interface AddressOption {
    id: number;
    name: string;
    region: string;
    province: string | null;
    city: string | null;
    district: string | null;
    street: string | null;
    phone: string;
    address: string;
  }
  const [inboundAddressOptions, setInboundAddressOptions] = useState<AddressOption[]>([]);
  const [editAddressOptions, setEditAddressOptions] = useState<AddressOption[]>([]);
  const [addressOptionsLoading, setAddressOptionsLoading] = useState(false);
  const inboundProviderId = Form.useWatch('logistics_provider_id', inboundForm);
  const editProviderId = Form.useWatch('logistics_provider_id', editForm);
  const editRemark = Form.useWatch('remark', editForm);
  const formatAddressLabel = useCallback((entry: AddressOption) => {
    const regionPath = [entry.province, entry.city, entry.district, entry.street].filter(Boolean).join('');
    return `${entry.name} · ${entry.phone} · ${regionPath}${entry.address}`;
  }, []);
  const formatAddressPrimaryLine = useCallback((entry: AddressOption) => {
    const name = entry.name || '-';
    const phone = entry.phone || '-';
    return `${name}  ${phone}`;
  }, []);
  const formatAddressSecondaryLine = useCallback((entry: AddressOption) => {
    const regionPath = [entry.province, entry.city, entry.district, entry.street].filter(Boolean).join('');
    const addr = (entry.address || '').trim();
    if (regionPath && addr) return `${regionPath}${addr}`;
    return regionPath || addr || '-';
  }, []);
  const toAddressSelectOptions = useCallback((entries: AddressOption[]) => (
    entries.map((entry) => ({
      value: entry.id,
      label: formatAddressLabel(entry),
      primaryLine: formatAddressPrimaryLine(entry),
      secondaryLine: formatAddressSecondaryLine(entry),
    }))
  ), [formatAddressLabel, formatAddressPrimaryLine, formatAddressSecondaryLine]);

  interface IdentityDocOption {
    id: number;
    document_type: string;
    document_number: string;
    holder_name: string | null;
    holder_phone: string | null;
  }
  const [editIdentityOptions, setEditIdentityOptions] = useState<IdentityDocOption[]>([]);
  const [identityOptionsLoading, setIdentityOptionsLoading] = useState(false);
  const formatIdentityLabel = useCallback((entry: IdentityDocOption) => {
    const typeName = IDENTITY_DOCUMENT_TYPE_MAP[entry.document_type] || entry.document_type;
    const holder = entry.holder_name ? ` · ${entry.holder_name}` : '';
    return `${typeName} · ${entry.document_number}${holder}`;
  }, []);
  const formatIdentityPrimaryLine = useCallback((entry: IdentityDocOption) => {
    const typeName = IDENTITY_DOCUMENT_TYPE_MAP[entry.document_type] || entry.document_type || '-';
    const docNo = entry.document_number || '-';
    return `${typeName}  ${docNo}`;
  }, []);
  const formatIdentitySecondaryLine = useCallback((entry: IdentityDocOption) => {
    const holderName = entry.holder_name || '-';
    const holderPhone = entry.holder_phone || '-';
    return `${holderName}  ${holderPhone}`;
  }, []);
  const toIdentitySelectOptions = useCallback((entries: IdentityDocOption[]) => (
    entries.map((entry) => ({
      value: entry.id,
      label: formatIdentityLabel(entry),
      primaryLine: formatIdentityPrimaryLine(entry),
      secondaryLine: formatIdentitySecondaryLine(entry),
    }))
  ), [formatIdentityLabel, formatIdentityPrimaryLine, formatIdentitySecondaryLine]);

  useEffect(() => {
    const isInbound = inboundOpen;
    const isEdit = editOpen;
    if (!isInbound && !isEdit) return;
    const providerId = isInbound ? inboundProviderId : editProviderId;
    if (actorScope === 'platform' && !providerId) {
      if (isInbound) setInboundAddressOptions([]);
      if (isEdit) setEditAddressOptions([]);
      return;
    }
    let cancelled = false;
    setAddressOptionsLoading(true);
    const query = providerId ? `?logistics_provider_id=${providerId}` : '';
    adminFetch(`/admin/parcels/address-options${query}`)
      .then(async (response) => response.ok ? response.json() : { data: [] })
      .then((json) => {
        if (cancelled) return;
        const entries = Array.isArray(json.data) ? json.data : [];
        if (isInbound) setInboundAddressOptions(entries);
        if (isEdit) setEditAddressOptions(entries);
      })
      .catch(() => {
        if (isInbound) setInboundAddressOptions([]);
        if (isEdit) setEditAddressOptions([]);
      })
      .finally(() => { if (!cancelled) setAddressOptionsLoading(false); });
    return () => { cancelled = true; };
  }, [actorScope, editOpen, editProviderId, inboundOpen, inboundProviderId]);

  // 申报证件（关联证件）：仅在详情/编辑弹窗按物流商加载证件库选项
  useEffect(() => {
    if (!editOpen) return;
    if (actorScope === 'platform' && !editProviderId) {
      setEditIdentityOptions([]);
      return;
    }
    let cancelled = false;
    setIdentityOptionsLoading(true);
    const query = editProviderId ? `?logistics_provider_id=${editProviderId}` : '';
    adminFetch(`/admin/parcels/identity-document-options${query}`)
      .then(async (response) => response.ok ? response.json() : { data: [] })
      .then((json) => {
        if (cancelled) return;
        setEditIdentityOptions(Array.isArray(json.data) ? json.data : []);
      })
      .catch(() => { if (!cancelled) setEditIdentityOptions([]); })
      .finally(() => { if (!cancelled) setIdentityOptionsLoading(false); });
    return () => { cancelled = true; };
  }, [actorScope, editOpen, editProviderId]);

  // 《包裹状态字典》：货物态/信息态下拉与标签映射均来自字典（启用项）
  const [statusDict, setStatusDict] = useState<{ status_code: string; status_name: string; status_type: string; status_category: string | null }[]>([]);
  const [statusDictLoading, setStatusDictLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const res = await adminFetch('/admin/parcel-statuses/options');
        if (res.ok) {
          const j = await res.json();
          setStatusDict(Array.isArray(j.data) ? j.data : []);
        }
      } catch { /* ignore */ }
      finally { setStatusDictLoading(false); }
    })();
  }, []);
  const cargoStatusOptions = useMemo(
    () => statusDict
      .filter((s) => s.status_type === '货物态')
      .map((s) => ({ label: s.status_name, value: s.status_code })),
    [statusDict]
  );
  const infoStatusOptions = useMemo(
    () => statusDict
      .filter((s) => s.status_type === '信息态')
      .map((s) => ({ label: s.status_name, value: s.status_code })),
    [statusDict]
  );
  const statusNameMap: Record<string, string> = useMemo(
    () => Object.fromEntries(statusDict.map((s) => [s.status_code, s.status_name])),
    [statusDict]
  );
  const statusCategoryMap: Record<string, string> = useMemo(
    () => Object.fromEntries(statusDict.map((s) => [s.status_code, s.status_category || ''])),
    [statusDict]
  );
  const getStatusName = useCallback((code: string | null | undefined, emptyText = ''): string => {
    if (!code) return emptyText;
    if (statusDictLoading) return '加载中...';
    return statusNameMap[code] || '未知状态';
  }, [statusDictLoading, statusNameMap]);
  const statusColor = useCallback((code: string | null): string => {
    if (!code) return 'default';
    return (statusCategoryMap[code] || '').includes('异常') ? 'red' : 'blue';
  }, [statusCategoryMap]);

  // 《包裹状态快筛栏》：各货物态/信息态下的包裹数量（全量统计，仅未删除包裹）
  const [statusCounts, setStatusCounts] = useState<{ cargo: { code: string; count: number }[]; info: { code: string; count: number }[] }>({ cargo: [], info: [] });
  useEffect(() => {
    (async () => {
      try {
        const res = await adminFetch('/admin/parcels/status-counts');
        if (res.ok) {
          const j = await res.json();
          setStatusCounts({
            cargo: Array.isArray(j.cargo) ? j.cargo : [],
            info: Array.isArray(j.info) ? j.info : [],
          });
        }
      } catch { /* ignore */ }
    })();
  }, [refreshKey]);

  // 行内图片预览（列表图片列点击时使用）
  const [rowPreviewOpen, setRowPreviewOpen] = useState(false);
  const [rowPreviewUrls, setRowPreviewUrls] = useState<string[]>([]);
  const [rowPreviewIndex, setRowPreviewIndex] = useState(0);

  // ---- 状态流转日志弹窗 ----
  interface StatusLog {
    id: number;
    parcel_id: number;
    tracking_number: string | null;
    from_status: string | null;
    to_status: string;
    sub_status: string | null;
    remark: string | null;
    operator_name: string | null;
    created_at: string;
  }
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsData, setLogsData] = useState<StatusLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [logsPageSize, setLogsPageSize] = useState(20);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsKeyword, setLogsKeyword] = useState('');
  const [logsDateRange, setLogsDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  interface StorageBinLog {
    id: number;
    parcel_id: number;
    tracking_number: string | null;
    storage_bin: string;
    operator_name: string | null;
    created_at: string;
  }
  const [binLogsOpen, setBinLogsOpen] = useState(false);
  const [binLogsData, setBinLogsData] = useState<StorageBinLog[]>([]);
  const [binLogsTotal, setBinLogsTotal] = useState(0);
  const [binLogsPage, setBinLogsPage] = useState(1);
  const [binLogsPageSize, setBinLogsPageSize] = useState(20);
  const [binLogsLoading, setBinLogsLoading] = useState(false);
  const [binLogsKeyword, setBinLogsKeyword] = useState('');
  const [binLogsDateRange, setBinLogsDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [binLogsParcelId, setBinLogsParcelId] = useState<number | null>(null);

  interface MemberOption {
    username: string;
    real_name: string | null;
    phone: string | null;
  }
  const [editMemberOptions, setEditMemberOptions] = useState<MemberOption[]>([]);
  const [editMemberSearching, setEditMemberSearching] = useState(false);
  const editMemberSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const memberLabel = useCallback((m: MemberOption): string => {
    const namePart = m.real_name ? `${m.real_name}（${m.username}）` : m.username;
    return m.phone ? `${namePart} · ${m.phone}` : namePart;
  }, []);
  const editMemberSelectOptions = useMemo(
    () => editMemberOptions.map((m) => ({ label: memberLabel(m), value: m.username })),
    [editMemberOptions, memberLabel]
  );
  const searchEditMembers = useCallback((keyword: string) => {
    if (editMemberSearchTimer.current) clearTimeout(editMemberSearchTimer.current);
    const kw = keyword.trim();
    if (!kw) {
      setEditMemberOptions((prev) => {
        const currentUsername = String(editForm.getFieldValue('username') || '').trim();
        if (!currentUsername) return [];
        const existing = prev.find((item) => item.username === currentUsername);
        return existing ? [existing] : [{ username: currentUsername, real_name: null, phone: null }];
      });
      return;
    }
    editMemberSearchTimer.current = setTimeout(async () => {
      try {
        setEditMemberSearching(true);
        const res = await adminFetch(`/admin/users/search?q=${encodeURIComponent(kw)}&page=1&limit=20`);
        if (!res.ok) return;
        const json = await res.json();
        const list = (json.data || []).map((u: any) => ({
          username: String(u.username || ''),
          real_name: u.real_name ?? null,
          phone: u.phone ?? null,
        })).filter((u: MemberOption) => Boolean(u.username));
        setEditMemberOptions(list);
      } catch {
        // ignore member search error
      } finally {
        setEditMemberSearching(false);
      }
    }, 300);
  }, [editForm]);

  const fetchStatusLogs = useCallback(async (page = 1, size = 20, keyword = '', dateRange: [dayjs.Dayjs, dayjs.Dayjs] | null = null) => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(size) });
      if (keyword.trim()) params.set('keyword', keyword.trim());
      if (dateRange) {
        params.set('startDate', dateRange[0].format('YYYY-MM-DD'));
        params.set('endDate', dateRange[1].format('YYYY-MM-DD'));
      }
      const res = await adminFetch(`/admin/parcels/status-logs?${params}`);
      const json = await res.json();
      setLogsData(json.data || []);
      setLogsTotal(json.total || 0);
    } catch {
      setLogsData([]);
      setLogsTotal(0);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  const openLogsModal = () => {
    setLogsOpen(true);
    setLogsPage(1);
    setLogsKeyword('');
    setLogsDateRange(null);
    fetchStatusLogs(1, logsPageSize);
  };

  const fetchStorageBinLogs = useCallback(async (
    page = 1,
    size = 20,
    keyword = '',
    dateRange: [dayjs.Dayjs, dayjs.Dayjs] | null = null,
    parcelId: number | null = null,
  ) => {
    setBinLogsLoading(true);
    try {
      if (parcelId && parcelId > 0) {
        const res = await adminFetch(`/admin/parcels/${parcelId}/storage-bin-logs`);
        const json = await res.json();
        const list = Array.isArray(json.data) ? json.data : [];
        const kw = keyword.trim();
        const filtered = list.filter((row: StorageBinLog) => {
          if (kw) {
            const hay = `${row.parcel_id} ${row.tracking_number || ''} ${row.storage_bin || ''} ${row.operator_name || ''}`.toLowerCase();
            if (!hay.includes(kw.toLowerCase())) return false;
          }
          if (dateRange) {
            const t = dayjs(row.created_at);
            if (!t.isValid()) return false;
            const from = dateRange[0].startOf('day');
            const to = dateRange[1].endOf('day');
            if (t.isBefore(from) || t.isAfter(to)) return false;
          }
          return true;
        });
        setBinLogsTotal(filtered.length);
        const start = (page - 1) * size;
        setBinLogsData(filtered.slice(start, start + size));
      } else {
        const params = new URLSearchParams({ page: String(page), limit: String(size) });
        if (keyword.trim()) params.set('keyword', keyword.trim());
        if (dateRange) {
          params.set('startDate', dateRange[0].format('YYYY-MM-DD'));
          params.set('endDate', dateRange[1].format('YYYY-MM-DD'));
        }
        const res = await adminFetch(`/admin/parcels/storage-bin-logs?${params}`);
        const json = await res.json();
        setBinLogsData(json.data || []);
        setBinLogsTotal(json.total || 0);
      }
    } catch {
      setBinLogsData([]);
      setBinLogsTotal(0);
    } finally {
      setBinLogsLoading(false);
    }
  }, []);

  const openStorageBinLogsModal = () => {
    setBinLogsParcelId(null);
    setBinLogsOpen(true);
    setBinLogsPage(1);
    setBinLogsKeyword('');
    setBinLogsDateRange(null);
    fetchStorageBinLogs(1, binLogsPageSize, '', null, null);
  };

  const openParcelStorageBinLogsModal = (parcelId: number) => {
    if (!Number.isInteger(parcelId) || parcelId <= 0) return;
    setBinLogsParcelId(parcelId);
    setBinLogsOpen(true);
    setBinLogsPage(1);
    setBinLogsKeyword('');
    setBinLogsDateRange(null);
    fetchStorageBinLogs(1, binLogsPageSize, '', null, parcelId);
  };

  const logsColumns: ColumnsType<StatusLog> = useMemo(() => [
    { title: '时间', dataIndex: 'created_at', key: 'created_at', width: 170, render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '' },
    { title: '包裹ID', dataIndex: 'parcel_id', key: 'parcel_id', width: 80 },
    { title: '运单号', dataIndex: 'tracking_number', key: 'tracking_number', width: 160, render: (v: string | null) => v || '' },
    {
      title: '货物态变更', key: 'status_change', width: 200,
      render: (_: unknown, r: StatusLog) => (
        <span>
          <Tag color={statusColor(r.from_status)}>{getStatusName(r.from_status, '无')}</Tag>
          →
          <Tag color={statusColor(r.to_status)}>{getStatusName(r.to_status, '无')}</Tag>
        </span>
      ),
    },
    { title: '信息态', dataIndex: 'sub_status', key: 'sub_status', width: 120, render: (v: string | null) => getStatusName(v, '') },
    { title: '备注', dataIndex: 'remark', key: 'remark', width: 180, ellipsis: true, render: (v: string | null) => v || '' },
    { title: '操作人', dataIndex: 'operator_name', key: 'operator_name', width: 100, render: (v: string | null) => v || '系统' },
  ], [getStatusName, statusColor]);

  const statusLogsTableColumns = useMemo(() => constrainTableColumns(logsColumns), [logsColumns]);
  const statusLogsTableScrollX = useMemo(() => getConstrainedTableScrollX(statusLogsTableColumns), [statusLogsTableColumns]);

  const binLogsColumns: ColumnsType<StorageBinLog> = useMemo(() => [
    { title: '时间', dataIndex: 'created_at', key: 'created_at', width: 170, render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '' },
    { title: '包裹ID', dataIndex: 'parcel_id', key: 'parcel_id', width: 80 },
    { title: '运单号', dataIndex: 'tracking_number', key: 'tracking_number', width: 170, render: (v: string | null) => v || '' },
    { title: '绑定库位号', dataIndex: 'storage_bin', key: 'storage_bin', width: 160 },
    { title: '操作账号', dataIndex: 'operator_name', key: 'operator_name', width: 120, render: (v: string | null) => v || '系统' },
  ], []);
  const binLogsTableColumns = useMemo(() => constrainTableColumns(binLogsColumns), [binLogsColumns]);
  const binLogsTableScrollX = useMemo(() => getConstrainedTableScrollX(binLogsTableColumns), [binLogsTableColumns]);

  const handleInboundSubmit = async () => {
    try {
      const values = await inboundForm.validateFields();
      setInboundLoading(true);
      const fd = new FormData();
      fd.append('tracking_number', values.tracking_number);
      fd.append('order_number', values.order_number != null ? String(values.order_number) : '');
      fd.append('weight', String(values.weight));
      fd.append('cod_amount', values.cod_amount != null ? String(values.cod_amount) : '');
      fd.append('length_cm', String(values.length_cm));
      fd.append('width_cm', String(values.width_cm));
      fd.append('height_cm', String(values.height_cm));
      fd.append('remark', values.remark != null ? String(values.remark) : '');
      fd.append('storage_bin', values.storage_bin != null ? String(values.storage_bin) : '');
      fd.append('logistics_provider_id', values.logistics_provider_id != null ? String(values.logistics_provider_id) : '');
      fd.append('sender_address_id', values.sender_address_id != null ? String(values.sender_address_id) : '');
      fd.append('recipient_address_id', values.recipient_address_id != null ? String(values.recipient_address_id) : '');
      fd.append('items', JSON.stringify(values.items));
      fileList.forEach(f => {
        if (f.originFileObj) fd.append('files', f.originFileObj);
      });
      const ok = await onInbound(fd);
      if (ok) {
        setInboundOpen(false);
        inboundForm.resetFields();
        setFileList([]);
      }
    } catch {
      // validation failed
    } finally {
      setInboundLoading(false);
    }
  };

  const fillEditForm = async (record: Parcel) => {
    setEditingParcel(record);
    const existingUrls = record.images ? record.images.split(',').map(s => s.trim()).filter(Boolean) : [];
    setEditFileList(existingUrls.map((url, i) => ({ uid: `existing-${i}`, name: url.split('/').pop() || `img-${i}`, status: 'done' as const, url })));
    editForm.setFieldsValue({
      tracking_number: record.tracking_number,
      order_number: record.order_number || '',
      username: record.username || '',
      created_at: record.created_at ? dayjs(record.created_at).format('YYYY-MM-DD HH:mm:ss') : '',
      updated_at: record.updated_at ? dayjs(record.updated_at).format('YYYY-MM-DD HH:mm:ss') : '',
      deleted_at_display: record.deleted_at ? dayjs(record.deleted_at).format('YYYY-MM-DD HH:mm:ss') : '',
      estimated_delivery: record.estimated_delivery ? dayjs(record.estimated_delivery) : null,
      weight: record.weight,
      cod_amount: record.cod_amount,
      length_cm: record.length_cm,
      width_cm: record.width_cm,
      height_cm: record.height_cm,
      volume: record.volume,
      origin: record.origin || '',
      destination: record.destination || '',
      status: record.status,
      sub_status: record.sub_status || undefined,
      remark: record.remark || '',
      storage_bin: record.storage_bin || '',
      logistics_provider_id: record.logistics_provider_id ?? undefined,
      sender_address_id: record.sender_address_id ?? undefined,
      recipient_address_id: record.recipient_address_id ?? undefined,
      declaration_document_id: record.declaration_document_id ?? undefined,
      items: [{ name: '', value: 0, quantity: 1 }],
    });
    if (record.username) {
      setEditMemberOptions((prev) => {
        if (prev.some((item) => item.username === record.username)) return prev;
        return [{ username: record.username, real_name: null, phone: null }, ...prev];
      });
    }
    try {
      const items = await onFetchItems(record.id);
      if (items.length > 0) editForm.setFieldsValue({ items });
    } catch { /* keep default */ }
  };

  const closeEditModal = () => {
    setEditOpen(false);
  };

  const cleanupEditModalState = () => {
    editForm.resetFields();
    setEditFileList([]);
    setEditMemberOptions([]);
    setEditingParcel(null);
  };

  const openViewModal = async (record: Parcel) => {
    setEditMode('view');
    setEditOpen(true);
    void fillEditForm(record);
  };

  const openEditModal = async (record: Parcel) => {
    setEditMode('edit');
    setEditOpen(true);
    void fillEditForm(record);
  };

  const handleEditSubmit = async () => {
    if (!editingParcel) return;
    try {
      const values = await editForm.validateFields();
      setEditLoading(true);
      const fd = new FormData();
      fd.append('order_number', values.order_number != null ? String(values.order_number) : '');
      fd.append('weight', String(values.weight));
      fd.append('cod_amount', values.cod_amount != null ? String(values.cod_amount) : '');
      fd.append('length_cm', String(values.length_cm));
      fd.append('width_cm', String(values.width_cm));
      fd.append('height_cm', String(values.height_cm));
      fd.append('origin', values.origin || '');
      fd.append('destination', values.destination || '');
      fd.append('estimated_delivery', values.estimated_delivery ? dayjs(values.estimated_delivery).format('YYYY-MM-DD HH:mm:ss') : '');
      fd.append('username', values.username != null ? String(values.username).trim() : '');
      fd.append('status', values.status || editingParcel.status);
      fd.append('sub_status', values.sub_status || '');
      fd.append('remark', values.remark != null ? String(values.remark) : '');
      fd.append('storage_bin', values.storage_bin != null ? String(values.storage_bin) : '');
      fd.append('logistics_provider_id', values.logistics_provider_id != null ? String(values.logistics_provider_id) : '');
      fd.append('sender_address_id', values.sender_address_id != null ? String(values.sender_address_id) : '');
      fd.append('recipient_address_id', values.recipient_address_id != null ? String(values.recipient_address_id) : '');
      fd.append('declaration_document_id', values.declaration_document_id != null ? String(values.declaration_document_id) : '');
      fd.append('items', JSON.stringify(values.items));
      const existingUrls = editFileList.filter(f => f.url && !f.originFileObj).map(f => f.url!);
      fd.append('existing_images', existingUrls.join(','));
      editFileList.forEach(f => {
        if (f.originFileObj) fd.append('files', f.originFileObj);
      });
      const ok = await onEdit(editingParcel.id, fd);
      if (ok) {
        closeEditModal();
      }
    } catch {
      // validation failed
    } finally {
      setEditLoading(false);
    }
  };

  const cleanFiltersAndNotify = (newColFilters: Record<string, string>, newDateFilters: Record<string, [string, string] | null>) => {
    const cleanCf: Record<string, string> = {};
    for (const [k, v] of Object.entries(newColFilters)) {
      if (v && v.trim()) cleanCf[k] = v;
    }
    const cleanDf: Record<string, [string, string]> = {};
    for (const [k, v] of Object.entries(newDateFilters)) {
      if (v && v[0] && v[1]) cleanDf[k] = v;
    }
    onColumnFilterChange?.(cleanCf, cleanDf);
  };

  const handleColumnSearch = (key: string, value: string) => {
    const newFilters = { ...columnFilters, [key]: value };
    setColumnFilters(newFilters);
    cleanFiltersAndNotify(newFilters, dateFilters);
  };

  const handleDateSearch = (key: string, dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    const newDateFilters = { ...dateFilters };
    if (!dates || !dates[0] || !dates[1]) {
      newDateFilters[key] = null;
    } else {
      newDateFilters[key] = [dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD')];
    }
    setDateFilters(newDateFilters);
    cleanFiltersAndNotify(columnFilters, newDateFilters);
  };

  // 《包裹状态快筛栏》：切换某个货物态/信息态的多选选中态，并触发筛选
  const parseStatusIn = useCallback(
    (key: 'status__in' | 'sub_status__in'): string[] =>
      (columnFilters[key] || '').split(',').map((s) => s.trim()).filter(Boolean),
    [columnFilters]
  );
  const selectedCargoStatuses = parseStatusIn('status__in');
  const selectedInfoStatuses = parseStatusIn('sub_status__in');
  const toggleQuickStatus = (key: 'status__in' | 'sub_status__in', code: string) => {
    const current = new Set(parseStatusIn(key));
    if (current.has(code)) current.delete(code); else current.add(code);
    const next = { ...columnFilters };
    const arr = Array.from(current);
    if (arr.length) next[key] = arr.join(','); else delete next[key];
    setColumnFilters(next);
    cleanFiltersAndNotify(next, dateFilters);
  };

  const resetFilters = useCallback(() => {
    setColumnFilters({});
    setLocalColumnFilters({});
    setDateFilters({});
    setResetKey((prev) => prev + 1);
    setSelectedRowKeys([]);
    onColumnFilterChange?.({}, {});
  }, [onColumnFilterChange]);

  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) {
      resetFilters();
    }
  }, [refreshKey]);

  const renderSearchInput = useCallback((key: string, placeholder: string) => (
    <Input
      size="small"
      placeholder={`搜索 ${placeholder}`}
      value={localColumnFilters[key] !== undefined ? localColumnFilters[key] : (columnFilters[key] || '')}
      onChange={(e) => {
        setLocalColumnFilters((prev) => ({ ...prev, [key]: e.target.value }));
        if (!e.target.value) {
          handleColumnSearch(key, '');
        }
      }}
      onPressEnter={(e) => handleColumnSearch(key, (e.target as HTMLInputElement).value)}
      onClick={(e) => e.stopPropagation()}
      allowClear
    />
  ), [columnFilters, handleColumnSearch, localColumnFilters]);

  const renderDateRangeInput = useCallback((key: string) => (
    <div onClick={(e) => e.stopPropagation()}>
      <DatePicker.RangePicker
        size="small"
        style={{ width: '100%' }}
        format="MM-DD"
        placeholder={['开始', '结束']}
        onChange={(dates) => handleDateSearch(key, dates)}
        key={`date-picker-${key}-${resetKey}`}
        allowClear
      />
    </div>
  ), [handleDateSearch, resetKey]);

  const renderDeletedFilter = useCallback(() => (
    <Select
      size="small"
      value={columnFilters['__deleted__'] || 'not_deleted'}
      onChange={(v) => handleColumnSearch('__deleted__', v)}
      onClick={(e) => e.stopPropagation()}
      style={{ width: '100%' }}
      options={[
        { label: '未删除', value: 'not_deleted' },
        { label: '已删除', value: 'deleted' },
        { label: '全部', value: 'all' },
      ]}
    />
  ), [columnFilters, handleColumnSearch]);

  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [batchLogisticsModalOpen, setBatchLogisticsModalOpen] = useState(false);
  const [batchLogisticsProviderId, setBatchLogisticsProviderId] = useState<number | undefined>(undefined);
  const [batchCargoStatusModalOpen, setBatchCargoStatusModalOpen] = useState(false);
  const [batchCargoStatusCode, setBatchCargoStatusCode] = useState<string | undefined>(undefined);
  const [batchLogisticsAdjustLoading, setBatchLogisticsAdjustLoading] = useState(false);
  const [batchCargoAdjustLoading, setBatchCargoAdjustLoading] = useState(false);
  const selectedRowKeySet = useMemo(() => new Set(selectedRowKeys), [selectedRowKeys]);
  const visibleRowIds = useMemo(() => parcels.map((item) => item.id), [parcels]);
  const selectedVisibleCount = useMemo(() => visibleRowIds.filter((id) => selectedRowKeySet.has(id)).length, [selectedRowKeySet, visibleRowIds]);
  const allSelected = visibleRowIds.length > 0 && selectedVisibleCount === visibleRowIds.length;
  const indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleRowIds.length;

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedRowKeys(visibleRowIds);
      return;
    }
    setSelectedRowKeys([]);
  }, [visibleRowIds]);

  const handleSelectRow = useCallback((id: number, checked: boolean) => {
    if (checked) {
      setSelectedRowKeys((prev) => (prev.includes(id) ? prev : [...prev, id]));
      return;
    }
    setSelectedRowKeys((prev) => prev.filter((key) => key !== id));
  }, []);

  const handleBatchAdjustLogistics = async () => {
    if (!onBatchUpdateLogisticsProvider || selectedRowKeys.length === 0 || !batchLogisticsProviderId) return;
    setBatchLogisticsAdjustLoading(true);
    try {
      const ok = await onBatchUpdateLogisticsProvider(selectedRowKeys, batchLogisticsProviderId);
      if (ok) {
        setSelectedRowKeys([]);
        setBatchLogisticsProviderId(undefined);
        setBatchLogisticsModalOpen(false);
      }
    } finally {
      setBatchLogisticsAdjustLoading(false);
    }
  };

  const handleBatchAdjustCargoStatus = async () => {
    if (!onBatchUpdateCargoStatus || selectedRowKeys.length === 0 || !batchCargoStatusCode) return;
    setBatchCargoAdjustLoading(true);
    try {
      const ok = await onBatchUpdateCargoStatus(selectedRowKeys, batchCargoStatusCode);
      if (ok) {
        setSelectedRowKeys([]);
        setBatchCargoStatusCode(undefined);
        setBatchCargoStatusModalOpen(false);
      }
    } finally {
      setBatchCargoAdjustLoading(false);
    }
  };

  const columns: ColumnsType<Parcel> = useMemo(() => [
    {
      title: '序号',
      key: 'index',
      width: 65,
      fixed: 'left',
      align: 'left',
      children: [
        {
          title: (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingLeft: '8px' }}>
              <Checkbox
                checked={allSelected}
                indeterminate={indeterminate}
                onChange={(e) => handleSelectAll(e.target.checked)}
              />
            </div>
          ),
          key: 'index_child',
          width: 65,
          fixed: 'left',
          align: 'left',
          render: (_, record, index) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '8px' }}>
              <Checkbox
                checked={selectedRowKeySet.has(record.id)}
                onChange={(e) => handleSelectRow(record.id, e.target.checked)}
                onClick={(e) => e.stopPropagation()}
              />
              <span>{index + 1}</span>
            </div>
          ),
        },
      ],
    },
    {
      title: '包裹PID/订单号ORD',
      key: 'parcel_order_number',
      width: 260,
      sorter: true,
      sortOrder: sortKey === 'tracking_number' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('tracking_number', '包裹/订单号'),
          key: 'parcel_order_number_child',
          width: 260,
          ellipsis: true,
          render: (_, record) => {
            const trackingNo = record.tracking_number || '';
            const orderNo = record.order_number || '';
            const urls = (record.images || '').split(',').map(s => s.trim()).filter(Boolean);
            const hasImages = urls.length > 0;
            return (
              <div style={{ minWidth: 0, lineHeight: 1.4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>PID : {trackingNo}</span>
                  {hasImages && (
                    <Tooltip title="查看图片">
                      <PictureOutlined
                        style={{ fontSize: 16, color: '#1677ff', cursor: 'pointer', flexShrink: 0 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setRowPreviewUrls(urls);
                          setRowPreviewIndex(0);
                          setRowPreviewOpen(true);
                        }}
                      />
                    </Tooltip>
                  )}
                </div>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>ORD : {orderNo}</div>
              </div>
            );
          },
        },
      ],
    },
    {
      title: '重量',
      key: 'weight',
      width: 100,
      sorter: true,
      sortOrder: sortKey === 'weight' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('weight', '重量'),
          key: 'weight_child',
          width: 100,
          render: (_, record) => (record.weight != null ? `${record.weight.toFixed(2)}` : ''),
        },
      ],
    },
    {
      title: '代收款',
      key: 'cod_amount',
      width: 110,
      children: [
        {
          title: renderSearchInput('cod_amount', '代收款'),
          key: 'cod_amount_child',
          width: 110,
          render: (_, record) => (record.cod_amount != null ? Number(record.cod_amount).toFixed(2) : ''),
        },
      ],
    },
    {
      title: '尺寸/体积',
      key: 'dimension_volume',
      width: 180,
      children: [
        {
          title: renderSearchInput('dimension_volume', '尺寸/体积'),
          key: 'dimension_volume_child',
          width: 180,
          render: (_, record) => {
            const dimensions = (record.length_cm != null && record.width_cm != null && record.height_cm != null)
              ? `${record.length_cm}*${record.width_cm}*${record.height_cm}`
              : '';
            const volume = (() => {
              if (record.volume == null || record.volume === '') return '';
              const num = Number(record.volume);
              if (Number.isNaN(num)) return String(record.volume);
              return num.toLocaleString('en-US');
            })();

            return (
              <div style={{ lineHeight: 1.4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ExpandOutlined style={{ color: '#1677ff', flexShrink: 0 }} />
                  <span>{dimensions}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AppstoreOutlined style={{ color: '#52c41a', flexShrink: 0 }} />
                  <span>{volume}</span>
                </div>
              </div>
            );
          },
        },
      ],
    },
    {
      title: '库位号',
      key: 'storage_bin',
      width: 130,
      children: [
        {
          title: renderSearchInput('storage_bin', '库位号'),
          dataIndex: 'storage_bin',
          key: 'storage_bin_child',
          width: 130,
          ellipsis: true,
          render: (value: string | null, record) => {
            if (!value) return '';
            return (
              <Button
                type="link"
                size="small"
                style={{ padding: 0, height: 'auto' }}
                onClick={() => openParcelStorageBinLogsModal(record.id)}
              >
                {value}
              </Button>
            );
          },
        },
      ],
    },
    {
      title: '物品',
      key: 'items',
      width: 120,
      children: [
        {
          title: renderSearchInput('items', '物品名称'),
          key: 'items_child',
          width: 120,
          ellipsis: true,
          render: (_, record) => {
            if (!record.first_item_name) return '';
            const count = Number(record.item_count) || 0;
            return count > 1 ? `${record.first_item_name} 等${count}件` : record.first_item_name;
          },
        },
      ],
    },
    {
      title: '收发货人',
      key: 'sender_recipient',
      width: 280,
      children: [{
        title: renderSearchInput('sender', '发货人/收货人'),
        key: 'sender_recipient_child',
        width: 280,
        render: (_, record) => {
          const senderRegion = [record.sender_province, record.sender_city, record.sender_district, record.sender_street].filter(Boolean).join('');
          const senderAddress = record.sender_address || '-';
          const senderLine = `${record.sender_name || '-'} ${record.sender_phone || '-'} ${senderRegion || '-'} ${senderAddress}`;

          const recipientRegion = [record.recipient_province, record.recipient_city, record.recipient_district, record.recipient_street].filter(Boolean).join('');
          const recipientAddress = record.recipient_address || '-';
          const recipientLine = `${record.recipient_name || '-'} ${record.recipient_phone || '-'} ${recipientRegion || '-'} ${recipientAddress}`;
          return (
            <Tooltip
              title={(
                <div>
                  <div><SendOutlined style={{ marginRight: 6 }} />{senderLine}</div>
                  <div><InboxOutlined style={{ marginRight: 6 }} />{recipientLine}</div>
                </div>
              )}
            >
              <div style={{ minWidth: 0, lineHeight: 1.4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <SendOutlined style={{ color: '#1677ff', flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{senderLine}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <InboxOutlined style={{ color: '#52c41a', flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{recipientLine}</span>
                </div>
              </div>
            </Tooltip>
          );
        },
      }],
    },
    {
      title: '货物态',
      key: 'status',
      width: 160,
      sorter: true,
      sortOrder: sortKey === 'status' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('status', '货物态'),
          key: 'status_child',
          width: 160,
          render: (_, record) => {
            if (statusDictLoading) {
              return <span style={{ color: '#999' }}>加载中...</span>;
            }
            return (
              <Tag color={statusColor(record.status)}>
                {getStatusName(record.status, '未知状态')}
              </Tag>
            );
          },
        },
      ],
    },
    {
      title: '创建时间',
      key: 'created_at',
      width: 180,
      sorter: true,
      sortOrder: sortKey === 'created_at' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderDateRangeInput('created_at'),
          dataIndex: 'created_at',
          key: 'created_at_child',
          width: 180,
          render: (value: string) => new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
        },
      ],
    },
    {
      title: '会员用户名',
      key: 'username',
      width: 130,
      sorter: true,
      sortOrder: sortKey === 'username' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('username', '用户名'),
          key: 'username_child',
          width: 130,
          render: (_, record) => record.username || '',
        },
      ],
    },
    ...(actorScope === 'platform' ? [{
      title: '物流商',
      key: 'logistics_provider',
      width: 150,
      children: [
        {
          title: renderSearchInput('logistics_provider', '物流商'),
          key: 'logistics_provider_child',
          width: 150,
          ellipsis: true,
          render: (_: unknown, record: Parcel) => record.logistics_provider_name || '',
        },
      ],
    }] : []),
    {
      title: '删除',
      key: '__deleted__',
      width: 110,
      children: [
        {
          title: renderDeletedFilter(),
          key: '__deleted___child',
          width: 110,
          render: (_, record) => record.deleted_at ? <Tag color="red">已删除</Tag> : '',
        }
      ]
    },
    {
      title: '',
      key: 'spacer',
      children: [{ title: '', key: 'spacer_child', render: () => null }],
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      fixed: 'right',
      align: 'center',
      children: [
        {
          title: (
            <Tooltip title="重置所有搜索">
              <Button size="small" icon={<ReloadOutlined />} onClick={resetFilters} />
            </Tooltip>
          ),
          key: 'actions_child',
          width: 100,
          fixed: 'right',
          align: 'center',
          render: (_, record) => (
            <Space size={4}>
              <Tooltip title="查看">
                <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => openViewModal(record)} />
              </Tooltip>
              {canUpdate && (
                <Tooltip title="修改">
                  <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
                </Tooltip>
              )}
              {canDelete && (
                <Popconfirm
                  title="确定删除该包裹？"
                  okText="删除"
                  cancelText="取消"
                  onConfirm={() => onDelete(record.id)}
                >
                  <Tooltip title="删除">
                    <Button danger size="small" type="text" icon={<DeleteOutlined />} />
                  </Tooltip>
                </Popconfirm>
              )}
            </Space>
          ),
        },
      ],
    },
  ], [
    actorScope,
    allSelected,
    canDelete,
    canUpdate,
    getStatusName,
    handleSelectAll,
    handleSelectRow,
    indeterminate,
    onDelete,
    openEditModal,
    openViewModal,
    renderDateRangeInput,
    renderDeletedFilter,
    renderSearchInput,
    resetFilters,
    selectedRowKeySet,
    sortDirection,
    sortKey,
    statusColor,
    statusDictLoading,
  ]);

  const tableColumns = useMemo(() => constrainTableColumns(columns), [columns]);
  const tableScrollX = useMemo(() => getConstrainedTableScrollX(tableColumns), [tableColumns]);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // 《包裹状态快筛栏》：按状态字典顺序排列已有包裹的货物态/信息态
  const cargoOrderIndex = useMemo(
    () => new Map(statusDict.filter((s) => s.status_type === '货物态').map((s, i) => [s.status_code, i] as const)),
    [statusDict]
  );
  const infoOrderIndex = useMemo(
    () => new Map(statusDict.filter((s) => s.status_type === '信息态').map((s, i) => [s.status_code, i] as const)),
    [statusDict]
  );
  const sortedCargoCounts = useMemo(
    () => [...statusCounts.cargo].sort((a, b) => (cargoOrderIndex.get(a.code) ?? 999) - (cargoOrderIndex.get(b.code) ?? 999)),
    [cargoOrderIndex, statusCounts.cargo]
  );
  const sortedInfoCounts = useMemo(
    () => [...statusCounts.info].sort((a, b) => (infoOrderIndex.get(a.code) ?? 999) - (infoOrderIndex.get(b.code) ?? 999)),
    [infoOrderIndex, statusCounts.info]
  );
  const renderQuickStatusItem = (code: string, count: number, selected: boolean, onClick: () => void) => (
    <div
      key={code}
      onClick={onClick}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        minWidth: 60,
        padding: '3px 10px',
        borderRadius: 6,
        border: `1px solid ${selected ? '#1677ff' : '#d9d9d9'}`,
        background: selected ? '#e6f4ff' : '#fff',
        textAlign: 'center',
        lineHeight: 1.35,
        transition: 'all 0.15s',
      }}
    >
      <div style={{ fontSize: 13, color: selected ? '#1677ff' : 'rgba(0,0,0,0.85)', whiteSpace: 'nowrap' }}>{getStatusName(code, '未知状态')}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: selected ? '#1677ff' : '#8c8c8c' }}>{count}</div>
    </div>
  );

  const composeRegion = useCallback((province?: string | null, city?: string | null, district?: string | null, street?: string | null) => (
    [province, city, district, street].filter(Boolean).join('')
  ), []);
  const composeAddressLine = useCallback((region: string, address?: string | null) => {
    const addr = (address || '').trim();
    if (region && addr) return `${region}->${addr}`;
    return region || addr || '-';
  }, []);
  const senderAddressLine = useMemo(() => composeAddressLine(
    composeRegion(editingParcel?.sender_province, editingParcel?.sender_city, editingParcel?.sender_district, editingParcel?.sender_street),
    editingParcel?.sender_address,
  ), [composeAddressLine, composeRegion, editingParcel]);
  const recipientAddressLine = useMemo(() => composeAddressLine(
    composeRegion(editingParcel?.recipient_province, editingParcel?.recipient_city, editingParcel?.recipient_district, editingParcel?.recipient_street),
    editingParcel?.recipient_address,
  ), [composeAddressLine, composeRegion, editingParcel]);
  const declarationTypeName = useMemo(
    () => IDENTITY_DOCUMENT_TYPE_MAP[editingParcel?.declaration_document_type || ''] || editingParcel?.declaration_document_type || '-',
    [editingParcel]
  );
  const remarkCount = useMemo(() => String(editRemark || '').length, [editRemark]);
  const canRestoreCurrent = editMode === 'view' && Boolean(editingParcel?.id) && Boolean(editingParcel?.deleted_at) && Boolean(onRestore);

  return (
    <Card bodyStyle={{ padding: 0, height: 'calc(100vh - 61px)', display: 'flex', flexDirection: 'column' }} bordered={false}>
      <div style={{ padding: '6px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: '0 0 auto' }}>
          <Space>
            {canDelete && (
              <Popconfirm
                title={`确定删除选中的 ${selectedRowKeys.length} 条记录？`}
                okText="删除"
                cancelText="取消"
                onConfirm={() => { onBatchDelete(selectedRowKeys); setSelectedRowKeys([]); }}
                disabled={selectedRowKeys.length === 0}
              >
                <Button danger disabled={selectedRowKeys.length === 0}>
                  批量删除{selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length})` : ''}
                </Button>
              </Popconfirm>
            )}
            {canUpdate && onBatchUpdateLogisticsProvider && (
              <Button
                type="primary"
                onClick={() => {
                  setBatchLogisticsProviderId(undefined);
                  setBatchLogisticsModalOpen(true);
                }}
                disabled={selectedRowKeys.length === 0}
              >
                批量修改物流商{selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length})` : ''}
              </Button>
            )}
            {canUpdate && onBatchUpdateCargoStatus && (
              <Button
                type="primary"
                onClick={() => {
                  setBatchCargoStatusCode(undefined);
                  setBatchCargoStatusModalOpen(true);
                }}
                disabled={selectedRowKeys.length === 0}
              >
                批量修改货物态{selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length})` : ''}
              </Button>
            )}
            {onExport && canExport && (
              <Button type="primary" ghost onClick={() => { void onExport(selectedRowKeys); }}>
                下载
              </Button>
            )}
          </Space>
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <Input.Search
            allowClear
            value={searchQuery}
            onChange={(event) => {
              const val = event.target.value;
              onSearchQueryChange(val);
              if (!val) onReset();
            }}
            onSearch={onSearch}
            placeholder="综合搜索：覆盖当前表格全部列信息"
            style={{ width: 420 }}
            enterButton
          />
        </div>
        <div style={{ flex: '0 0 auto' }}>
          {canCreate && (
            <Button type="primary" icon={<InboxOutlined />} onClick={() => setInboundOpen(true)}>
              入库
            </Button>
          )}
        </div>
      </div>

      {/* 包裹状态快筛栏：固定显示；展示已有货物态/信息态（可多选），按钮下方为包裹数量 */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0, display: 'flex', flexWrap: 'nowrap', alignItems: 'center', columnGap: 20, height: 56, overflowX: 'auto', overflowY: 'hidden' }}>
        {sortedCargoCounts.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'nowrap', gap: 8 }}>
            {sortedCargoCounts.map((s) =>
              renderQuickStatusItem(s.code, s.count, selectedCargoStatuses.includes(s.code), () => toggleQuickStatus('status__in', s.code)),
            )}
          </div>
        )}
        {sortedCargoCounts.length > 0 && sortedInfoCounts.length > 0 && (
          <div style={{ alignSelf: 'stretch', width: 1, background: '#f0f0f0' }} />
        )}
        {sortedInfoCounts.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'nowrap', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#8c8c8c', fontWeight: 500, whiteSpace: 'nowrap' }}>信息态</span>
            {sortedInfoCounts.map((s) =>
              renderQuickStatusItem(s.code, s.count, selectedInfoStatuses.includes(s.code), () => toggleQuickStatus('sub_status__in', s.code)),
            )}
          </div>
        )}
        {sortedCargoCounts.length === 0 && sortedInfoCounts.length === 0 && (
          <span style={{ fontSize: 12, color: '#bfbfbf', lineHeight: '32px' }}>暂无可快筛状态</span>
        )}
      </div>

      <Modal
        title="批量修改物流商"
        open={batchLogisticsModalOpen}
        rootClassName="detail-modal"
        className="detail-modal"
        onCancel={() => {
          if (batchLogisticsAdjustLoading) return;
          setBatchLogisticsModalOpen(false);
        }}
        onOk={() => void handleBatchAdjustLogistics()}
        centered
        confirmLoading={batchLogisticsAdjustLoading}
        okText="确认修改"
        cancelText="取消"
        okButtonProps={{ disabled: !batchLogisticsProviderId }}
        style={{ maxWidth: 'calc(100vw - 24px)' }}
      >
        <Form layout="vertical">
          <Form.Item label="目标物流商" required>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="请选择目标物流商"
              value={batchLogisticsProviderId}
              options={logisticsSelectOptions}
              onChange={(value) => setBatchLogisticsProviderId(value)}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="批量修改货物态"
        open={batchCargoStatusModalOpen}
        rootClassName="detail-modal"
        className="detail-modal"
        onCancel={() => {
          if (batchCargoAdjustLoading) return;
          setBatchCargoStatusModalOpen(false);
        }}
        onOk={() => void handleBatchAdjustCargoStatus()}
        centered
        confirmLoading={batchCargoAdjustLoading}
        okText="确认修改"
        cancelText="取消"
        okButtonProps={{ disabled: !batchCargoStatusCode }}
        style={{ maxWidth: 'calc(100vw - 24px)' }}
      >
        <Form layout="vertical">
          <Form.Item label="目标货物态" required>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="请选择目标货物态"
              loading={statusDictLoading}
              value={batchCargoStatusCode}
              options={cargoStatusOptions}
              onChange={(value) => setBatchCargoStatusCode(value)}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="包裹入库"
        open={inboundOpen}
        rootClassName="detail-modal"
        className="detail-modal"
        onCancel={() => { setInboundOpen(false); inboundForm.resetFields(); setFileList([]); }}
        onOk={handleInboundSubmit}
        centered
        confirmLoading={inboundLoading}
        okText="确认入库"
        cancelText="取消"
        style={{ maxWidth: 'calc(100vw - 24px)' }}
      >
        <Form form={inboundForm} layout="vertical" autoComplete="off">
          <Form.Item name="tracking_number" label="包裹单号" rules={[{ required: true, message: '请输入包裹单号' }]}>
            <Input placeholder="请输入包裹单号" />
          </Form.Item>
          <Form.Item name="order_number" label="订单号">
            <Input maxLength={128} placeholder="请输入订单号（可选）" />
          </Form.Item>
          <Form.Item name="weight" label="重量 (kg)" rules={[{ required: true, message: '请输入重量' }]}>
            <InputNumber min={0.01} step={0.01} precision={2} style={{ width: '100%' }} placeholder="请输入重量" />
          </Form.Item>
          <Form.Item name="cod_amount" label="代收款 (元)">
            <InputNumber min={0} step={0.01} precision={2} style={{ width: '100%' }} placeholder="请输入代收款（可选）" />
          </Form.Item>
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item name="length_cm" label="长 (cm)" rules={[{ required: true, message: '请输入长' }]} style={{ flex: 1 }}>
              <InputNumber min={0.1} step={0.1} precision={1} style={{ width: '100%' }} placeholder="长" />
            </Form.Item>
            <Form.Item name="width_cm" label="宽 (cm)" rules={[{ required: true, message: '请输入宽' }]} style={{ flex: 1 }}>
              <InputNumber min={0.1} step={0.1} precision={1} style={{ width: '100%' }} placeholder="宽" />
            </Form.Item>
            <Form.Item name="height_cm" label="高 (cm)" rules={[{ required: true, message: '请输入高' }]} style={{ flex: 1 }}>
              <InputNumber min={0.1} step={0.1} precision={1} style={{ width: '100%' }} placeholder="高" />
            </Form.Item>
          </div>
          <Form.Item name="storage_bin" label="库位号">
            <Input maxLength={64} placeholder="请输入库位号（可选）" />
          </Form.Item>
          <Form.Item name="remark" label="备注（运单备注）">
            <Input.TextArea maxLength={255} rows={2} showCount placeholder="请输入运单备注（可选）" />
          </Form.Item>
          <Form.Item name="logistics_provider_id" label="物流商">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="请选择物流商（可选）"
              options={logisticsSelectOptions}
              onChange={() => inboundForm.setFieldsValue({ sender_address_id: undefined, recipient_address_id: undefined })}
            />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="sender_address_id" label="发货人（地址簿）">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  loading={addressOptionsLoading}
                  disabled={actorScope === 'platform' && !inboundProviderId}
                  placeholder={actorScope === 'platform' && !inboundProviderId ? '请先选择物流商' : '请选择发货人'}
                  options={toAddressSelectOptions(inboundAddressOptions)}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="recipient_address_id" label="收货人（地址簿）">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  loading={addressOptionsLoading}
                  disabled={actorScope === 'platform' && !inboundProviderId}
                  placeholder={actorScope === 'platform' && !inboundProviderId ? '请先选择物流商' : '请选择收货人'}
                  options={toAddressSelectOptions(inboundAddressOptions)}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="图片 (可选)">
            <Upload
              listType="picture-card"
              fileList={fileList}
              onChange={({ fileList: fl }) => setFileList(fl)}
              beforeUpload={() => false}
              accept="image/*"
              multiple
            >
              {fileList.length >= 10 ? null : (
                <div>
                  <PlusOutlined />
                  <div style={{ marginTop: 8 }}>上传</div>
                </div>
              )}
            </Upload>
          </Form.Item>
          <Form.List
            name="items"
            initialValue={[{ name: '', value: 0, quantity: 1 }]}
            rules={[{ validator: async (_, items) => { if (!items || items.length < 1) throw new Error('至少添加一个物品'); } }]}
          >
            {(fields, { add, remove }, { errors }) => (
              <>
                <div style={{ marginBottom: 8, fontWeight: 500 }}>物品清单</div>
                {fields.map(({ key, name, ...restField }) => (
                  <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                    <Form.Item {...restField} name={[name, 'name']} rules={[{ required: true, message: '名称' }]} style={{ flex: 2, marginBottom: 0 }}>
                      <Input placeholder="物品名称" />
                    </Form.Item>
                    <Form.Item {...restField} name={[name, 'value']} rules={[{ required: true, message: '价值' }]} style={{ flex: 1, marginBottom: 0 }}>
                      <InputNumber min={0} step={0.01} precision={2} style={{ width: '100%' }} placeholder="价值" />
                    </Form.Item>
                    <Form.Item {...restField} name={[name, 'quantity']} rules={[{ required: true, message: '数量' }]} style={{ flex: 1, marginBottom: 0 }}>
                      <InputNumber min={1} step={1} precision={0} style={{ width: '100%' }} placeholder="数量" />
                    </Form.Item>
                    {fields.length > 1 && (
                      <MinusCircleOutlined style={{ marginTop: 8, color: '#ff4d4f', fontSize: 18 }} onClick={() => remove(name)} />
                    )}
                  </div>
                ))}
                <Button type="dashed" onClick={() => add({ name: '', value: 0, quantity: 1 })} block icon={<PlusOutlined />}>
                  添加物品
                </Button>
                <Form.ErrorList errors={errors} />
              </>
            )}
          </Form.List>
        </Form>
      </Modal>

      <Modal
        title={editMode === 'view' ? '包裹详情' : '编辑包裹'}
        open={editOpen}
        rootClassName="detail-modal"
        className="detail-modal parcel-detail-modal"
        onCancel={closeEditModal}
        onOk={() => { if (editMode === 'view') closeEditModal(); else void handleEditSubmit(); }}
        afterOpenChange={(open) => {
          if (!open) {
            cleanupEditModalState();
          }
        }}
        centered
        confirmLoading={editMode === 'edit' ? editLoading : false}
        okText={editMode === 'view' ? '关闭' : '保存'}
        cancelText="取消"
        cancelButtonProps={editMode === 'view' ? { style: { display: 'none' } } : undefined}
        footer={editMode === 'view' ? [
          <Button key="close" onClick={closeEditModal}>关闭</Button>,
          <Popconfirm
            key="restore"
            title="确认恢复该包裹？"
            description="恢复后将清除删除状态。"
            okText="确认恢复"
            cancelText="取消"
            onConfirm={async () => {
              if (!editingParcel?.id || !onRestore) return;
              const ok = await onRestore(editingParcel.id);
              if (ok) {
                setEditingParcel((prev) => (prev ? { ...prev, deleted_at: null } : prev));
                editForm.setFieldsValue({ deleted_at_display: '' });
              }
            }}
            disabled={!canRestoreCurrent}
          >
            <Button key="restore-btn" type="primary" disabled={!canRestoreCurrent}>恢复</Button>
          </Popconfirm>,
        ] : undefined}
        width={840}
        styles={{ body: { paddingTop: 12, paddingBottom: 8 } }}
        style={{ maxWidth: 'calc(100vw - 24px)' }}
      >
        <Form form={editForm} layout="vertical" autoComplete="off" size="small" className="compact-form" disabled={editMode === 'view'}>
          <div className="parcel-detail-main-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gridAutoRows: 'auto', columnGap: 10, rowGap: 8, alignItems: 'stretch' }}>
              {/* 行1 左：基础信息 */}
              <div style={{ padding: '10px 12px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: '#141414' }}>基础信息</div>
                <div style={{ display: 'grid', gridTemplateColumns: '62px minmax(0, 1fr)', columnGap: 6, rowGap: 6, alignItems: 'start' }}>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap', lineHeight: '30px' }}>包裹单号</div>
                  <Form.Item name="tracking_number" style={{ marginBottom: 0 }}>
                    <Input disabled />
                  </Form.Item>

                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap', lineHeight: '30px' }}>订单号</div>
                  <Form.Item name="order_number" style={{ marginBottom: 0 }}>
                    <Input maxLength={128} placeholder="订单号" />
                  </Form.Item>

                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap', lineHeight: '30px' }}>尺寸</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Form.Item name="length_cm" rules={[{ required: true, message: '长' }]} style={{ flex: 1, marginBottom: 0 }}>
                      <InputNumber min={0.1} step={0.1} precision={1} style={{ width: '100%' }} placeholder="长" />
                    </Form.Item>
                    <Form.Item name="width_cm" rules={[{ required: true, message: '宽' }]} style={{ flex: 1, marginBottom: 0 }}>
                      <InputNumber min={0.1} step={0.1} precision={1} style={{ width: '100%' }} placeholder="宽" />
                    </Form.Item>
                    <Form.Item name="height_cm" rules={[{ required: true, message: '高' }]} style={{ flex: 1, marginBottom: 0 }}>
                      <InputNumber min={0.1} step={0.1} precision={1} style={{ width: '100%' }} placeholder="高" />
                    </Form.Item>
                  </div>

                  <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '62px minmax(0, 1fr) 62px minmax(0, 1fr)', columnGap: 6, rowGap: 6, alignItems: 'start' }}>
                    <div style={{ textAlign: 'right', whiteSpace: 'nowrap', lineHeight: '30px' }}>重量</div>
                    <Form.Item name="weight" rules={[{ required: true, message: '重量' }]} style={{ marginBottom: 0 }}>
                      <InputNumber min={0.01} step={0.01} precision={2} style={{ width: '100%' }} placeholder="重量(kg)" />
                    </Form.Item>
                    <div style={{ textAlign: 'right', whiteSpace: 'nowrap', lineHeight: '30px' }}>体积</div>
                    <Form.Item name="volume" style={{ marginBottom: 0 }}>
                      <InputNumber disabled style={{ width: '100%' }} placeholder="体积" />
                    </Form.Item>
                  </div>

                  <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '62px minmax(0, 1fr) 62px minmax(0, 1fr)', columnGap: 6, rowGap: 6, alignItems: 'start' }}>
                    <div style={{ textAlign: 'right', whiteSpace: 'nowrap', lineHeight: '30px' }}>库位号</div>
                    {editMode === 'view' ? (
                      <div style={{ display: 'flex', alignItems: 'center', minHeight: 30 }}>
                        {editingParcel?.storage_bin ? (
                          <Button
                            type="link"
                            size="small"
                            style={{ padding: 0, height: 'auto' }}
                            onClick={() => openParcelStorageBinLogsModal(editingParcel.id)}
                          >
                            {editingParcel.storage_bin}
                          </Button>
                        ) : (
                          <span style={{ color: '#bfbfbf' }}>-</span>
                        )}
                      </div>
                    ) : (
                      <Form.Item name="storage_bin" style={{ marginBottom: 0 }}>
                        <Input maxLength={64} placeholder="库位号" />
                      </Form.Item>
                    )}
                    <div style={{ textAlign: 'right', whiteSpace: 'nowrap', lineHeight: '30px' }}>代收款</div>
                    <Form.Item name="cod_amount" style={{ marginBottom: 0 }}>
                      <InputNumber min={0} step={0.01} precision={2} style={{ width: '100%' }} placeholder="代收款(元)" />
                    </Form.Item>
                  </div>

                  <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '62px minmax(0, 1fr) 62px minmax(0, 1fr)', columnGap: 6, rowGap: 6, alignItems: 'start' }}>
                    <div style={{ textAlign: 'right', whiteSpace: 'nowrap', lineHeight: '30px' }}>始发地</div>
                    <Form.Item name="origin" style={{ marginBottom: 0 }}>
                      <Input placeholder="始发地" />
                    </Form.Item>
                    <div style={{ textAlign: 'right', whiteSpace: 'nowrap', lineHeight: '30px' }}>目的地</div>
                    <Form.Item name="destination" style={{ marginBottom: 0 }}>
                      <Input placeholder="目的地" />
                    </Form.Item>
                  </div>

                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap', lineHeight: '30px' }}>预计到达</div>
                  <Form.Item name="estimated_delivery" style={{ marginBottom: 0 }}>
                    <DatePicker
                      showTime
                      format="YYYY-MM-DD HH:mm:ss"
                      style={{ width: '100%' }}
                      placeholder="请选择预计到达时间"
                    />
                  </Form.Item>

                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap', lineHeight: '30px' }}>会员</div>
                  <Form.Item name="username" style={{ marginBottom: 0 }}>
                    <Select
                      allowClear
                      showSearch
                      filterOption={false}
                      placeholder="搜索会员（用户名/姓名/电话）"
                      onSearch={searchEditMembers}
                      notFoundContent={editMemberSearching ? '搜索中…' : null}
                      options={editMemberSelectOptions}
                    />
                  </Form.Item>

                  {actorScope === 'platform' && (
                    <>
                      <div style={{ textAlign: 'right', whiteSpace: 'nowrap', lineHeight: '30px' }}>物流商</div>
                      <Form.Item name="logistics_provider_id" style={{ marginBottom: 0 }}>
                        <Select
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          placeholder="请选择物流商（可选）"
                          options={logisticsSelectOptions}
                          onChange={() => editForm.setFieldsValue({ sender_address_id: undefined, recipient_address_id: undefined, declaration_document_id: undefined })}
                        />
                      </Form.Item>
                    </>
                  )}
                </div>
              </div>

              {/* 行1 右：收发货人 */}
              <div style={{ padding: '10px 12px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: '#141414' }}>收发货人</div>
                <div style={{ minHeight: 0 }}>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ marginBottom: 4, fontSize: 12, fontWeight: 600, color: '#262626' }}>发货人</div>
                    {editMode === 'view' ? (
                      <div style={{ height: 72, border: '1px solid #d9d9d9', borderRadius: 4, padding: '6px 8px', fontSize: 12, lineHeight: 1.35, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
                          <span>{editingParcel?.sender_name || '-'}</span>
                          <span>{editingParcel?.sender_phone || '-'}</span>
                        </div>
                        <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{senderAddressLine}</div>
                      </div>
                    ) : (
                      <Form.Item name="sender_address_id" style={{ marginBottom: 0 }}>
                        <Select
                          className="receiver-block-select"
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          loading={addressOptionsLoading}
                          disabled={actorScope === 'platform' && !editProviderId}
                          placeholder={actorScope === 'platform' && !editProviderId ? '请先选择物流商' : '请选择发货人'}
                          options={toAddressSelectOptions(editAddressOptions)}
                          optionRender={({ data }) => (
                            <div className="receiver-block-option">
                              <div className="line1">{data.primaryLine}</div>
                              <div className="line2">{data.secondaryLine}</div>
                            </div>
                          )}
                          labelRender={({ value }) => {
                            const match = toAddressSelectOptions(editAddressOptions).find((option) => option.value === value);
                            if (!match) return null;
                            return (
                              <div className="receiver-block-option">
                                <div className="line1">{match.primaryLine}</div>
                                <div className="line2">{match.secondaryLine}</div>
                              </div>
                            );
                          }}
                        />
                      </Form.Item>
                    )}
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    <div style={{ marginBottom: 4, fontSize: 12, fontWeight: 600, color: '#262626' }}>收货人</div>
                  {editMode === 'view' ? (
                    <div style={{ height: 72, border: '1px solid #d9d9d9', borderRadius: 4, padding: '6px 8px', fontSize: 12, lineHeight: 1.35, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
                        <span>{editingParcel?.recipient_name || '-'}</span>
                        <span>{editingParcel?.recipient_phone || '-'}</span>
                      </div>
                      <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{recipientAddressLine}</div>
                    </div>
                  ) : (
                    <Form.Item name="recipient_address_id" style={{ marginBottom: 0 }}>
                      <Select
                        className="receiver-block-select"
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        loading={addressOptionsLoading}
                        disabled={actorScope === 'platform' && !editProviderId}
                        placeholder={actorScope === 'platform' && !editProviderId ? '请先选择物流商' : '请选择收货人'}
                        options={toAddressSelectOptions(editAddressOptions)}
                        optionRender={({ data }) => (
                          <div className="receiver-block-option">
                            <div className="line1">{data.primaryLine}</div>
                            <div className="line2">{data.secondaryLine}</div>
                          </div>
                        )}
                        labelRender={({ value }) => {
                          const match = toAddressSelectOptions(editAddressOptions).find((option) => option.value === value);
                          if (!match) return null;
                          return (
                            <div className="receiver-block-option">
                              <div className="line1">{match.primaryLine}</div>
                              <div className="line2">{match.secondaryLine}</div>
                            </div>
                          );
                        }}
                      />
                    </Form.Item>
                  )}
                  </div>

                  <div>
                    <div style={{ marginBottom: 4, fontSize: 12, fontWeight: 600, color: '#262626' }}>申报证件</div>
                    {editMode === 'view' ? (
                      <div style={{ minHeight: 72, border: '1px solid #d9d9d9', borderRadius: 4, padding: '6px 8px', fontSize: 12, lineHeight: 1.35 }}>
                        <div>{declarationTypeName}</div>
                        <div>{editingParcel?.declaration_document_number || '-'}</div>
                        <div>{editingParcel?.declaration_holder_name || '-'}</div>
                        <div>{editingParcel?.declaration_holder_phone || '-'}</div>
                      </div>
                    ) : (
                      <Form.Item name="declaration_document_id" style={{ marginBottom: 0 }}>
                        <Select
                          className="receiver-block-select"
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          loading={identityOptionsLoading}
                          disabled={actorScope === 'platform' && !editProviderId}
                          placeholder={actorScope === 'platform' && !editProviderId ? '请先选择物流商' : '请选择申报证件'}
                          options={toIdentitySelectOptions(editIdentityOptions)}
                          optionRender={({ data }) => (
                            <div className="receiver-block-option">
                              <div className="line1">{data.primaryLine}</div>
                              <div className="line2">{data.secondaryLine}</div>
                            </div>
                          )}
                          labelRender={({ value }) => {
                            const match = toIdentitySelectOptions(editIdentityOptions).find((option) => option.value === value);
                            if (!match) return null;
                            return (
                              <div className="receiver-block-option">
                                <div className="line1">{match.primaryLine}</div>
                                <div className="line2">{match.secondaryLine}</div>
                              </div>
                            );
                          }}
                        />
                      </Form.Item>
                    )}
                  </div>
                </div>
              </div>

              {/* 行2 左：物品信息 */}
              <div style={{ padding: '10px 12px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <Form.List
                  name="items"
                  rules={[{ validator: async (_, items) => { if (!items || items.length < 1) throw new Error('至少添加一个物品'); } }]}
                >
                  {(fields, { add, remove }, { errors }) => (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div style={{ fontWeight: 700, fontSize: 12, color: '#141414' }}>物品信息</div>
                        {editMode === 'edit' && (
                          <Button type="default" size="small" onClick={() => add({ name: '', value: 0, quantity: 1 })}>+添加物品</Button>
                        )}
                      </div>
                      <div style={{ minHeight: 0, flex: 1, maxHeight: 200, overflowY: 'auto', paddingRight: 2 }}>
                        {fields.map(({ key, name, ...restField }) => (
                          <div key={key} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 6 }}>
                            <Form.Item {...restField} name={[name, 'name']} rules={[{ required: true, message: '名称' }]} style={{ flex: 2, marginBottom: 0 }}>
                              <Input placeholder="物品名称" />
                            </Form.Item>
                            <Form.Item {...restField} name={[name, 'value']} rules={[{ required: true, message: '价值' }]} style={{ flex: 1, marginBottom: 0 }}>
                              <InputNumber min={0} step={0.01} precision={2} style={{ width: '100%' }} placeholder="价值" />
                            </Form.Item>
                            <Form.Item {...restField} name={[name, 'quantity']} rules={[{ required: true, message: '数量' }]} style={{ flex: 1, marginBottom: 0 }}>
                              <InputNumber min={1} step={1} precision={0} style={{ width: '100%' }} placeholder="数量" />
                            </Form.Item>
                            {editMode === 'edit' && fields.length > 1 && (
                              <MinusCircleOutlined style={{ marginTop: 6, color: '#ff4d4f', fontSize: 16 }} onClick={() => remove(name)} />
                            )}
                          </div>
                        ))}
                      </div>
                      <Form.ErrorList errors={errors} />
                    </>
                  )}
                </Form.List>
              </div>

              {/* 行2 右：状态与时间 */}
              <div style={{ padding: '10px 12px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', minHeight: 0 }}>
                <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: '#141414' }}>状态与时间</div>
                <div style={{ display: 'grid', gridTemplateColumns: '62px minmax(0, 1fr)', columnGap: 6, rowGap: 6, alignItems: 'start' }}>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap', lineHeight: '30px' }}>货物态</div>
                  <Form.Item name="status" style={{ marginBottom: 0 }}>
                    <Select showSearch optionFilterProp="label" options={cargoStatusOptions} />
                  </Form.Item>

                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap', lineHeight: '30px' }}>信息态</div>
                  <Form.Item name="sub_status" style={{ marginBottom: 0 }}>
                    <Select allowClear showSearch optionFilterProp="label" placeholder="可选" options={infoStatusOptions} />
                  </Form.Item>

                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap', lineHeight: '30px' }}>更新时间</div>
                  <Form.Item name="updated_at" style={{ marginBottom: 0 }}>
                    <Input disabled placeholder="-" />
                  </Form.Item>

                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap', lineHeight: '30px' }}>创建时间</div>
                  <Form.Item name="created_at" style={{ marginBottom: 0 }}>
                    <Input disabled placeholder="-" />
                  </Form.Item>

                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap', lineHeight: '30px' }}>删除时间</div>
                  <Form.Item name="deleted_at_display" style={{ marginBottom: 0 }}>
                    <Input disabled placeholder="-" />
                  </Form.Item>
                </div>
              </div>

              {/* 行3 左：图片 */}
              <div style={{ padding: '10px 12px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#141414' }}>图片</div>
                </div>
                {editMode === 'view' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 60px))', gap: 8, alignContent: 'start', flex: 1, minHeight: 0, maxHeight: 168, overflowY: 'auto' }}>
                    {editFileList.filter((f) => !!f.url).length === 0 && (
                      <div style={{ color: '#8c8c8c', fontSize: 12 }}>暂无图片</div>
                    )}
                    {editFileList.filter((f) => !!f.url).map((f) => (
                      <Image
                        key={f.uid}
                        src={f.url}
                        width={60}
                        height={60}
                        style={{ objectFit: 'cover', borderRadius: 6, border: '1px solid #f0f0f0' }}
                      />
                    ))}
                  </div>
                ) : (
                  <Form.Item label={null} className="compact-upload" style={{ marginBottom: 0, flex: 1, minHeight: 0, maxHeight: 168, overflowY: 'auto' }}>
                    <Upload
                      listType="picture-card"
                      fileList={editFileList}
                      onChange={({ fileList: fl }) => setEditFileList(fl)}
                      onPreview={handleEditPreview}
                      beforeUpload={() => false}
                      accept="image/*"
                      multiple
                    >
                      {editFileList.length >= 10 ? null : (
                        <div>
                          <PlusOutlined />
                          <div style={{ marginTop: 4, fontSize: 12 }}>上传</div>
                        </div>
                      )}
                    </Upload>
                  </Form.Item>
                )}
              </div>

              {/* 行3 右：备注 */}
              <div style={{ padding: '10px 12px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: '#141414' }}>备注 {remarkCount} / 255</div>
                <Form.Item name="remark" style={{ marginBottom: 0, minHeight: 0, flex: 1 }}>
                  <Input.TextArea maxLength={255} rows={5} placeholder="请输入运单备注（可选）" style={{ height: '100%', resize: 'none' }} />
                </Form.Item>
              </div>
          </div>
        </Form>
      </Modal>

      {editPreviewUrls.length > 0 && (
        <div style={{ display: 'none' }}>
          <Image.PreviewGroup
            items={editPreviewUrls}
            preview={{
              visible: editPreviewOpen,
              current: editPreviewIndex,
              onVisibleChange: (v) => { setEditPreviewOpen(v); if (!v) setEditPreviewUrls([]); },
              onChange: (idx) => setEditPreviewIndex(idx),
            }}
          >
            {editPreviewUrls.map((u) => <Image key={u} src={u} />)}
          </Image.PreviewGroup>
        </div>
      )}

      <div style={{ display: 'none' }}>
        <Image.PreviewGroup
          items={rowPreviewUrls}
          preview={{
            visible: rowPreviewOpen,
            current: rowPreviewIndex,
            onVisibleChange: (v) => setRowPreviewOpen(v),
            onChange: (idx) => setRowPreviewIndex(idx),
          }}
        >
          {rowPreviewUrls.map((u) => <Image key={u} src={u} />)}
        </Image.PreviewGroup>
      </div>

      <div ref={tableHostRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Table<Parcel>
          rowKey="id"
          rowClassName={(record) => selectedRowKeys.includes(record.id) ? 'row-selected' : ''}
          loading={loading}
          columns={tableColumns}
          dataSource={parcels}
          pagination={false}
          size="small"
          sticky
          tableLayout="auto"
          showSorterTooltip={false}
          sortDirections={['ascend', 'descend', 'ascend']}
          scroll={{ x: tableScrollX, y: tableScrollY }}
          locale={{ emptyText: '没有包裹记录' }}
          onChange={(_, __, sorter) => {
            if (Array.isArray(sorter)) {
              return;
            }
            const field = (sorter.field || sorter.columnKey) as ParcelSortKey | undefined;
            const order = sorter.order;
            if (!field || !order) {
              return;
            }
            onSortChange(field, order === 'ascend' ? 'asc' : 'desc');
          }}
        />
      </div>

      <div
        style={{
          flexShrink: 0,
          zIndex: 10,
          background: '#fff',
          borderTop: '1px solid #f0f0f0',
          padding: '6px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <AntPagination
          size="small"
          current={currentPage}
          pageSize={pageSize}
          total={totalItems}
          showSizeChanger
          pageSizeOptions={[10, 20, 30, 50]}
          showQuickJumper
          showTotal={(total, range) => `第 ${range[0]}-${range[1]} 条 / 共 ${total} 条 · ${totalPages} 页`}
          onChange={(page, size) => onPageChange(page, size)}
          onShowSizeChange={(_, size) => onPageSizeChange(size)}
        />
        <Space size={8}>
          <Button size="small" icon={<AppstoreOutlined />} onClick={openStorageBinLogsModal}>
            库位绑定日志
          </Button>
          <Button size="small" icon={<FileTextOutlined />} onClick={openLogsModal}>
            状态流转日志
          </Button>
        </Space>
      </div>

      {/* 库位绑定日志弹窗 */}
      <Modal
        title={binLogsParcelId ? `包裹库位绑定日志（包裹ID: ${binLogsParcelId}）` : '包裹库位绑定日志'}
        open={binLogsOpen}
        rootClassName="detail-modal"
        className="detail-modal"
        onCancel={() => { setBinLogsOpen(false); setBinLogsParcelId(null); }}
        centered
        footer={null}
        width={960}
        destroyOnClose
        style={{ maxWidth: 'calc(100vw - 24px)' }}
      >
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <Input.Search
            placeholder="搜索运单号/库位号/操作账号..."
            allowClear
            style={{ width: 320 }}
            value={binLogsKeyword}
            onChange={e => setBinLogsKeyword(e.target.value)}
            onSearch={(val) => { setBinLogsPage(1); fetchStorageBinLogs(1, binLogsPageSize, val, binLogsDateRange, binLogsParcelId); }}
          />
          <DatePicker.RangePicker
            size="middle"
            value={binLogsDateRange}
            onChange={(dates) => {
              const range = dates as [dayjs.Dayjs, dayjs.Dayjs] | null;
              setBinLogsDateRange(range);
              setBinLogsPage(1);
              fetchStorageBinLogs(1, binLogsPageSize, binLogsKeyword, range, binLogsParcelId);
            }}
          />
        </div>
        <Table
          rowKey="id"
          columns={binLogsTableColumns}
          dataSource={binLogsData}
          loading={binLogsLoading}
          size="small"
          pagination={{
            current: binLogsPage,
            pageSize: binLogsPageSize,
            total: binLogsTotal,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50],
            showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条 / 共 ${total} 条`,
            onChange: (p, s) => {
              setBinLogsPage(p);
              setBinLogsPageSize(s);
              fetchStorageBinLogs(p, s, binLogsKeyword, binLogsDateRange, binLogsParcelId);
            },
          }}
          scroll={{ x: binLogsTableScrollX, y: 400 }}
        />
      </Modal>

      {/* 状态流转日志弹窗 */}
      <Modal
        title="包裹状态流转日志"
        open={logsOpen}
        rootClassName="detail-modal"
        className="detail-modal"
        onCancel={() => setLogsOpen(false)}
        centered
        footer={null}
        width={1000}
        destroyOnClose
        style={{ maxWidth: 'calc(100vw - 24px)' }}
      >
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <Input.Search
            placeholder="搜索运单号/状态/备注/操作人..."
            allowClear
            style={{ width: 300 }}
            value={logsKeyword}
            onChange={e => setLogsKeyword(e.target.value)}
            onSearch={(val) => { setLogsPage(1); fetchStatusLogs(1, logsPageSize, val, logsDateRange); }}
          />
          <DatePicker.RangePicker
            size="middle"
            value={logsDateRange}
            onChange={(dates) => {
              const range = dates as [dayjs.Dayjs, dayjs.Dayjs] | null;
              setLogsDateRange(range);
              setLogsPage(1);
              fetchStatusLogs(1, logsPageSize, logsKeyword, range);
            }}
          />
        </div>
        <Table
          rowKey="id"
          columns={statusLogsTableColumns}
          dataSource={logsData}
          loading={logsLoading}
          size="small"
          pagination={{
            current: logsPage,
            pageSize: logsPageSize,
            total: logsTotal,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50],
            showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条 / 共 ${total} 条`,
            onChange: (p, s) => {
              setLogsPage(p);
              setLogsPageSize(s);
              fetchStatusLogs(p, s, logsKeyword, logsDateRange);
            },
          }}
          scroll={{ x: statusLogsTableScrollX, y: 400 }}
        />
      </Modal>
    </Card>
  );
});
