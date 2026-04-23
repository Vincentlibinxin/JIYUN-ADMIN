import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { Button, Card, Checkbox, DatePicker, Form, Image, Input, InputNumber, Modal, Pagination as AntPagination, Popconfirm, Row, Col, Select, Space, Table, Tooltip, Upload, Tag } from 'antd';
import { ReloadOutlined, EyeOutlined, EditOutlined, DeleteOutlined, InboxOutlined, PlusOutlined, MinusCircleOutlined, FileTextOutlined, PictureOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { UploadFile } from 'antd/es/upload/interface';
import { adminFetch } from '../../lib/api';
import dayjs from 'dayjs';

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
  sub_status: string | null;
  status_remark: string | null;
  status_updated_at: string | null;
  estimated_delivery: string | null;
  created_at: string;
  username: string | null;
  first_item_name: string | null;
  item_count: number;
  deleted_at?: string | null;
}

type ParcelSortKey = 'id' | 'user_id' | 'tracking_number' | 'origin' | 'destination' | 'weight' | 'length_cm' | 'width_cm' | 'height_cm' | 'volume' | 'status' | 'estimated_delivery' | 'created_at' | 'username';
type SortDirection = 'asc' | 'desc';

interface ParcelsTabProps {
  parcels: Parcel[];
  loading: boolean;
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
  onBatchDelete: (ids: number[]) => void;
  onInbound: (formData: FormData) => Promise<boolean>;
  onEdit: (id: number, formData: FormData) => Promise<boolean>;
  onFetchItems: (id: number) => Promise<{ name: string; value: number; quantity: number }[]>;
  refreshKey?: number;
  onColumnFilterChange?: (columnFilters: Record<string, string>, dateFilters: Record<string, [string, string]>) => void;
}

export default function ParcelsTab({
  parcels,
  loading,
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
  onBatchDelete,
  onInbound,
  onEdit,
  onFetchItems,
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

  const STATUS_LABEL: Record<string, string> = {
    pending: '待处理',
    received: '已入库',
    in_transit: '运输中',
    arrived: '已到达',
    pickup_pending: '待自提',
    delivered: '已签收',
    exception: '异常',
  };
  const STATUS_COLOR: Record<string, string> = {
    pending: 'default',
    received: 'processing',
    in_transit: 'cyan',
    arrived: 'blue',
    pickup_pending: 'purple',
    delivered: 'green',
    exception: 'red',
  };

  const logsColumns: ColumnsType<StatusLog> = [
    { title: '时间', dataIndex: 'created_at', key: 'created_at', width: 170, render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '' },
    { title: '包裹ID', dataIndex: 'parcel_id', key: 'parcel_id', width: 80 },
    { title: '运单号', dataIndex: 'tracking_number', key: 'tracking_number', width: 160, render: (v: string | null) => v || '' },
    {
      title: '状态变更', key: 'status_change', width: 200,
      render: (_: unknown, r: StatusLog) => (
        <span>
          <Tag color={STATUS_COLOR[r.from_status || ''] || 'default'}>{STATUS_LABEL[r.from_status || ''] || r.from_status || '无'}</Tag>
          →
          <Tag color={STATUS_COLOR[r.to_status] || 'default'}>{STATUS_LABEL[r.to_status] || r.to_status}</Tag>
        </span>
      ),
    },
    { title: '子状态', dataIndex: 'sub_status', key: 'sub_status', width: 120, render: (v: string | null) => v || '' },
    { title: '备注', dataIndex: 'remark', key: 'remark', width: 180, ellipsis: true, render: (v: string | null) => v || '' },
    { title: '操作人', dataIndex: 'operator_name', key: 'operator_name', width: 100, render: (v: string | null) => v || '系统' },
  ];

  const handleInboundSubmit = async () => {
    try {
      const values = await inboundForm.validateFields();
      setInboundLoading(true);
      const fd = new FormData();
      fd.append('tracking_number', values.tracking_number);
      fd.append('weight', String(values.weight));
      fd.append('length_cm', String(values.length_cm));
      fd.append('width_cm', String(values.width_cm));
      fd.append('height_cm', String(values.height_cm));
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

  const openEditModal = async (record: Parcel) => {
    setEditingParcel(record);
    const existingUrls = record.images ? record.images.split(',').map(s => s.trim()).filter(Boolean) : [];
    setEditFileList(existingUrls.map((url, i) => ({ uid: `existing-${i}`, name: url.split('/').pop() || `img-${i}`, status: 'done' as const, url })));
    editForm.setFieldsValue({
      tracking_number: record.tracking_number,
      weight: record.weight,
      length_cm: record.length_cm,
      width_cm: record.width_cm,
      height_cm: record.height_cm,
      origin: record.origin || '',
      destination: record.destination || '',
      status: record.status,
      sub_status: record.sub_status || undefined,
      status_remark: record.status_remark || '',
      items: [{ name: '', value: 0, quantity: 1 }],
    });
    setEditOpen(true);
    try {
      const items = await onFetchItems(record.id);
      if (items.length > 0) editForm.setFieldsValue({ items });
    } catch { /* keep default */ }
  };

  const handleEditSubmit = async () => {
    if (!editingParcel) return;
    try {
      const values = await editForm.validateFields();
      setEditLoading(true);
      const fd = new FormData();
      fd.append('weight', String(values.weight));
      fd.append('length_cm', String(values.length_cm));
      fd.append('width_cm', String(values.width_cm));
      fd.append('height_cm', String(values.height_cm));
      fd.append('origin', values.origin || '');
      fd.append('destination', values.destination || '');
      fd.append('status', values.status || editingParcel.status);
      fd.append('sub_status', values.sub_status || '');
      fd.append('status_remark', values.status_remark || '');
      fd.append('items', JSON.stringify(values.items));
      const existingUrls = editFileList.filter(f => f.url && !f.originFileObj).map(f => f.url!);
      fd.append('existing_images', existingUrls.join(','));
      editFileList.forEach(f => {
        if (f.originFileObj) fd.append('files', f.originFileObj);
      });
      const ok = await onEdit(editingParcel.id, fd);
      if (ok) {
        setEditOpen(false);
        editForm.resetFields();
        setEditFileList([]);
        setEditingParcel(null);
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

  const handleDateSearch = (key: string, dateStrings: [string, string]) => {
    const newDateFilters = { ...dateFilters };
    if (!dateStrings || !dateStrings[0]) {
      newDateFilters[key] = null;
    } else {
      newDateFilters[key] = dateStrings;
    }
    setDateFilters(newDateFilters);
    cleanFiltersAndNotify(columnFilters, newDateFilters);
  };

  const resetFilters = () => {
    setColumnFilters({});
    setLocalColumnFilters({});
    setDateFilters({});
    setResetKey((prev) => prev + 1);
    setSelectedRowKeys([]);
    onColumnFilterChange?.({}, {});
  };

  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) {
      resetFilters();
    }
  }, [refreshKey]);

  const renderSearchInput = (key: string, placeholder: string) => (
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
  );

  const renderDateRangeInput = (key: string) => (
    <div onClick={(e) => e.stopPropagation()}>
      <DatePicker.RangePicker
        size="small"
        style={{ width: '100%' }}
        onChange={(_, dateStrings) => handleDateSearch(key, dateStrings)}
        key={`date-picker-${key}-${resetKey}`}
        allowClear
      />
    </div>
  );

  const renderDeletedFilter = () => (
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
  );

  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const visibleRowIds = parcels.map((item) => item.id);
  const selectedVisibleCount = visibleRowIds.filter((id) => selectedRowKeys.includes(id)).length;
  const allSelected = visibleRowIds.length > 0 && selectedVisibleCount === visibleRowIds.length;
  const indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleRowIds.length;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRowKeys(visibleRowIds);
      return;
    }
    setSelectedRowKeys([]);
  };

  const handleSelectRow = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedRowKeys((prev) => (prev.includes(id) ? prev : [...prev, id]));
      return;
    }
    setSelectedRowKeys((prev) => prev.filter((key) => key !== id));
  };

  const columns: ColumnsType<Parcel> = [
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
                checked={selectedRowKeys.includes(record.id)}
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
      title: '包裹单号',
      key: 'tracking_number',
      width: 180,
      sorter: true,
      sortOrder: sortKey === 'tracking_number' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('tracking_number', '包裹单号'),
          dataIndex: 'tracking_number',
          key: 'tracking_number_child',
          width: 180,
          ellipsis: true,
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
          render: (_, record) => (record.weight != null ? `${record.weight.toFixed(2)}kg` : ''),
        },
      ],
    },
    {
      title: '尺寸',
      key: 'dimensions',
      width: 140,
      children: [
        {
          title: renderSearchInput('dimensions', '尺寸 例:30*20'),
          key: 'dimensions_child',
          width: 140,
          render: (_, record) => {
            if (record.length_cm != null && record.width_cm != null && record.height_cm != null) {
              return `${record.length_cm}*${record.width_cm}*${record.height_cm}`;
            }
            return '';
          },
        },
      ],
    },
    {
      title: '体积',
      key: 'volume',
      width: 100,
      sorter: true,
      sortOrder: sortKey === 'volume' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('volume', '体积'),
          key: 'volume_child',
          width: 100,
          render: (_, record) => (record.volume != null ? record.volume : ''),
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
      title: '图片',
      key: 'images',
      width: 60,
      children: [
        {
          title: <span style={{ fontSize: 12, color: '#999' }}>图片</span>,
          key: 'images_child',
          width: 60,
          align: 'center' as const,
          render: (_, record) => {
            if (!record.images) return '';
            const urls = record.images.split(',').map(s => s.trim()).filter(Boolean);
            if (urls.length === 0) return '';
            return (
              <PictureOutlined
                style={{ fontSize: 18, color: '#1677ff', cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  setRowPreviewUrls(urls);
                  setRowPreviewIndex(0);
                  setRowPreviewOpen(true);
                }}
              />
            );
          },
        },
      ],
    },
    {
      title: '来源',
      key: 'origin',
      width: 140,
      sorter: true,
      sortOrder: sortKey === 'origin' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('origin', '来源'),
          dataIndex: 'origin',
          key: 'origin_child',
          width: 140,
          ellipsis: true,
        },
      ],
    },
    {
      title: '目的地',
      key: 'destination',
      width: 140,
      sorter: true,
      sortOrder: sortKey === 'destination' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('destination', '目的地'),
          dataIndex: 'destination',
          key: 'destination_child',
          width: 140,
          ellipsis: true,
        },
      ],
    },
    {
      title: '预计送达',
      key: 'estimated_delivery',
      width: 180,
      sorter: true,
      sortOrder: sortKey === 'estimated_delivery' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderDateRangeInput('estimated_delivery'),
          key: 'estimated_delivery_child',
          width: 180,
          render: (_, record) => (record.estimated_delivery ? new Date(record.estimated_delivery).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : ''),
        },
      ],
    },
    {
      title: '状态',
      key: 'status',
      width: 160,
      sorter: true,
      sortOrder: sortKey === 'status' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('status', '状态'),
          key: 'status_child',
          width: 160,
          render: (_, record) => (
            <Select
              size="small"
              value={record.status}
              style={{ width: '100%' }}
              onChange={(value) => onUpdateStatus(record.id, value)}
              onClick={(e) => e.stopPropagation()}
              options={[
                { label: '待处理', value: 'pending' },
                { label: '已收货', value: 'received' },
                { label: '运输中', value: 'in_transit' },
                { label: '已到达', value: 'arrived' },
                { label: '待自提', value: 'pickup_pending' },
                { label: '已签收', value: 'delivered' },
                { label: '异常件', value: 'exception' },
              ]}
            />
          ),
        },
      ],
    },
    {
      title: '子状态',
      key: 'sub_status',
      width: 130,
      children: [
        {
          title: renderSearchInput('sub_status', '子状态'),
          key: 'sub_status_child',
          width: 130,
          render: (_: any, record: Parcel) => {
            const subStatusLabels: Record<string, string> = {
              awaiting_shelving: '待上架',
              packing: '打包中',
              awaiting_dispatch: '待出库',
              export_declaring: '出口申报中',
              export_clearing: '出口清关中',
              import_clearing: '进口清关中',
              customs_released: '海关放行',
              linehaul_in_transit: '干线运输中',
              arrived_destination: '到达目的地',
              out_for_delivery: '派送中',
              delivery_failed: '派送失败',
              address_issue: '地址异常',
              customs_issue: '清关异常',
              lost: '包裹丢失',
              damaged: '包裹破损',
              return_processing: '退回中',
            };
            return record.sub_status ? (subStatusLabels[record.sub_status] || record.sub_status) : '';
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
                <Button size="small" type="text" icon={<EyeOutlined />} />
              </Tooltip>
              <Tooltip title="修改">
                <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
              </Tooltip>
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
            </Space>
          ),
        },
      ],
    },
  ];

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  return (
    <Card bodyStyle={{ padding: 0, height: 'calc(100vh - 61px)', display: 'flex', flexDirection: 'column' }} bordered={false}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: '0 0 auto' }}>
          <Space>
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
            placeholder="搜索包裹：包裹单号、来源、目的地、用户名或状态"
            style={{ width: 420 }}
            enterButton
          />
        </div>
        <div style={{ flex: '0 0 auto' }}>
          <Button type="primary" icon={<InboxOutlined />} onClick={() => setInboundOpen(true)}>
            入库
          </Button>
        </div>
      </div>

      <Modal
        title="包裹入库"
        open={inboundOpen}
        onCancel={() => { setInboundOpen(false); inboundForm.resetFields(); setFileList([]); }}
        onOk={handleInboundSubmit}
        confirmLoading={inboundLoading}
        okText="确认入库"
        cancelText="取消"
      >
        <Form form={inboundForm} layout="vertical" autoComplete="off">
          <Form.Item name="tracking_number" label="包裹单号" rules={[{ required: true, message: '请输入包裹单号' }]}>
            <Input placeholder="请输入包裹单号" />
          </Form.Item>
          <Form.Item name="weight" label="重量 (kg)" rules={[{ required: true, message: '请输入重量' }]}>
            <InputNumber min={0.01} step={0.01} precision={2} style={{ width: '100%' }} placeholder="请输入重量" />
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
        title="编辑包裹"
        open={editOpen}
        onCancel={() => { setEditOpen(false); editForm.resetFields(); setEditFileList([]); setEditingParcel(null); }}
        onOk={handleEditSubmit}
        confirmLoading={editLoading}
        okText="保存"
        cancelText="取消"
        width={720}
        styles={{ body: { paddingTop: 12, paddingBottom: 8 } }}
        className="parcel-edit-modal"
      >
        <Form form={editForm} layout="vertical" autoComplete="off" size="small" className="compact-form">
          <Row gutter={8}>
            <Col span={12}>
              <Form.Item name="tracking_number" label="包裹单号">
                <Input disabled />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="weight" label="重量 (kg)" rules={[{ required: true, message: '请输入重量' }]}>
                <InputNumber min={0.01} step={0.01} precision={2} style={{ width: '100%' }} placeholder="请输入重量" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={8}>
            <Col span={8}>
              <Form.Item name="length_cm" label="长 (cm)" rules={[{ required: true, message: '请输入长' }]}>
                <InputNumber min={0.1} step={0.1} precision={1} style={{ width: '100%' }} placeholder="长" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="width_cm" label="宽 (cm)" rules={[{ required: true, message: '请输入宽' }]}>
                <InputNumber min={0.1} step={0.1} precision={1} style={{ width: '100%' }} placeholder="宽" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="height_cm" label="高 (cm)" rules={[{ required: true, message: '请输入高' }]}>
                <InputNumber min={0.1} step={0.1} precision={1} style={{ width: '100%' }} placeholder="高" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={8}>
            <Col span={12}>
              <Form.Item name="origin" label="来源">
                <Input placeholder="来源" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="destination" label="目的地">
                <Input placeholder="目的地" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={8}>
            <Col span={12}>
              <Form.Item name="status" label="状态">
                <Select
                  options={[
                    { label: '待处理', value: 'pending' },
                    { label: '已收货', value: 'received' },
                    { label: '运输中', value: 'in_transit' },
                    { label: '已到达', value: 'arrived' },
                    { label: '待自提', value: 'pickup_pending' },
                    { label: '已签收', value: 'delivered' },
                    { label: '异常件', value: 'exception' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sub_status" label="子状态">
                <Select
                  allowClear
                  placeholder="可选"
                  options={[
                    { label: '待上架', value: 'awaiting_shelving' },
                    { label: '打包中', value: 'packing' },
                    { label: '待出库', value: 'awaiting_dispatch' },
                    { label: '出口申报中', value: 'export_declaring' },
                    { label: '出口清关中', value: 'export_clearing' },
                    { label: '进口清关中', value: 'import_clearing' },
                    { label: '海关放行', value: 'customs_released' },
                    { label: '干线运输中', value: 'linehaul_in_transit' },
                    { label: '到达目的地', value: 'arrived_destination' },
                    { label: '已入柜', value: 'locker_stored' },
                    { label: '已通知取件', value: 'pickup_notified' },
                    { label: '超时未取', value: 'pickup_overtime' },
                    { label: '退柜处理', value: 'locker_returned' },
                    { label: '派送中', value: 'out_for_delivery' },
                    { label: '派送失败', value: 'delivery_failed' },
                    { label: '地址异常', value: 'address_issue' },
                    { label: '清关异常', value: 'customs_issue' },
                    { label: '包裹丢失', value: 'lost' },
                    { label: '包裹破损', value: 'damaged' },
                    { label: '退回中', value: 'return_processing' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="status_remark" label="状态备注">
            <Input.TextArea rows={2} maxLength={255} placeholder="可选，填写异常原因或备注信息" />
          </Form.Item>
          <Form.Item label="图片" className="compact-upload">
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
          <Form.List
            name="items"
            rules={[{ validator: async (_, items) => { if (!items || items.length < 1) throw new Error('至少添加一个物品'); } }]}
          >
            {(fields, { add, remove }, { errors }) => (
              <>
                <div style={{ marginBottom: 6, fontWeight: 500, fontSize: 13 }}>物品清单</div>
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
                    {fields.length > 1 && (
                      <MinusCircleOutlined style={{ marginTop: 6, color: '#ff4d4f', fontSize: 16 }} onClick={() => remove(name)} />
                    )}
                  </div>
                ))}
                <Button type="dashed" size="small" onClick={() => add({ name: '', value: 0, quantity: 1 })} block icon={<PlusOutlined />}>
                  添加物品
                </Button>
                <Form.ErrorList errors={errors} />
              </>
            )}
          </Form.List>
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
          columns={columns}
          dataSource={parcels}
          pagination={false}
          size="small"
          sticky
          showSorterTooltip={false}
          sortDirections={['ascend', 'descend', 'ascend']}
          scroll={{ x: 1800, y: tableScrollY }}
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
        <Button size="small" icon={<FileTextOutlined />} onClick={openLogsModal}>
          状态流转日志
        </Button>
      </div>

      {/* 状态流转日志弹窗 */}
      <Modal
        title="包裹状态流转日志"
        open={logsOpen}
        onCancel={() => setLogsOpen(false)}
        footer={null}
        width={1000}
        destroyOnClose
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
          columns={logsColumns}
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
          scroll={{ y: 400 }}
        />
      </Modal>
    </Card>
  );
}
