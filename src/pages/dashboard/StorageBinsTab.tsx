import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Card, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Pagination as AntPagination, Popconfirm, Select, Space, Table, Tag, Tooltip, message } from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { adminFetch } from '../../lib/api';

export interface StorageBin {
  id: number;
  storage_bin: string;
  area_zone: string | null;
  area_aisle: string | null;
  area_section: string | null;
  area_tier: string | null;
  area_slot: string | null;
  size_length: number | string | null;
  size_width: number | string | null;
  size_height: number | string | null;
  volume: number | string | null;
  capacity: number | string | null;
  warehouse: string;
  description: string | null;
  is_enabled: number;
  logistics_provider_id: number | null;
  logistics_provider_name?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface StorageBinPayload {
  area_zone?: string;
  area_aisle?: string;
  area_section?: string;
  area_tier?: string;
  area_slot?: string;
  size_length?: number | null;
  size_width?: number | null;
  size_height?: number | null;
  volume?: number | null;
  capacity?: number | null;
  warehouse: string;
  description?: string;
  is_enabled?: boolean;
  logistics_provider_id?: number | null;
}

type StorageBinSortKey = 'id' | 'storage_bin' | 'warehouse' | 'is_enabled' | 'created_at';
type SortDirection = 'asc' | 'desc';

interface StorageBinsTabProps {
  bins: StorageBin[];
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
  sortKey: StorageBinSortKey;
  sortDirection: SortDirection;
  onSortChange: (key: StorageBinSortKey, direction: SortDirection) => void;
  onCreate: (payload: StorageBinPayload) => Promise<boolean>;
  onUpdate: (id: number, payload: StorageBinPayload) => Promise<boolean>;
  onDelete: (id: number) => void;
  onBatchDelete: (ids: number[]) => void;
  canManage?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  refreshKey?: number;
  onColumnFilterChange?: (columnFilters: Record<string, string>, dateFilters: Record<string, [string, string]>) => void;
}

type ModalMode = 'create' | 'edit' | 'view';

interface StorageBinFormValues {
  area_zone?: string;
  area_aisle?: string;
  area_section?: string;
  area_tier?: string;
  area_slot?: string;
  size_length?: number | null;
  size_width?: number | null;
  size_height?: number | null;
  volume?: number | null;
  capacity?: number | null;
  warehouse: string;
  description?: string;
  is_enabled?: boolean;
  logistics_provider_id?: number | null;
}

const buildStorageBinCode = (v: StorageBinFormValues): string =>
  [v.area_zone, v.area_aisle, v.area_section, v.area_tier, v.area_slot]
    .map((p) => String(p ?? '').trim())
    .filter((p) => p !== '')
    .join('-');

const formatNumber = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : '';
};

export default function StorageBinsTab({
  bins,
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
  onCreate,
  onUpdate,
  onDelete,
  onBatchDelete,
  canManage,
  canUpdate,
  canDelete,
  refreshKey,
  onColumnFilterChange,
}: StorageBinsTabProps) {
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

  // 物流商下拉（平台账号可选；物流商账号无该权限，接口返回空则不显示选择器）
  const [providerOptions, setProviderOptions] = useState<{ id: number; name: string; code: string | null }[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const res = await adminFetch('/admin/logistics/options');
        if (res.ok) {
          const j = await res.json();
          setProviderOptions(j.data || []);
        }
      } catch { /* ignore */ }
    })();
  }, []);
  const providerSelectOptions = providerOptions.map((o) => ({
    label: o.code ? `${o.name}（${o.code}）` : o.name,
    value: o.id,
  }));
  const showProviderSelect = providerOptions.length > 0;

  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [localColumnFilters, setLocalColumnFilters] = useState<Record<string, string>>({});
  const [dateFilters, setDateFilters] = useState<Record<string, [string, string] | null>>({});
  const [resetKey, setResetKey] = useState(0);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const renderEnabledFilter = () => (
    <Select
      size="small"
      value={columnFilters['is_enabled'] || ''}
      onChange={(v) => handleColumnSearch('is_enabled', v)}
      onClick={(e) => e.stopPropagation()}
      style={{ width: '100%' }}
      options={[
        { label: '全部', value: '' },
        { label: '启用', value: '1' },
        { label: '停用', value: '0' },
      ]}
    />
  );

  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const visibleRowIds = bins.map((item) => item.id);
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

  // ---------- 新增/编辑/查看 弹窗 ----------
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<StorageBinFormValues>();
  // 库位号实时预览（由区/排/架/层/位组合）
  const [binPreview, setBinPreview] = useState('');

  const openCreate = () => {
    setModalMode('create');
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ is_enabled: true });
    setBinPreview('');
    setModalOpen(true);
  };

  const fillForm = (record: StorageBin) => {
    form.setFieldsValue({
      area_zone: record.area_zone || '',
      area_aisle: record.area_aisle || '',
      area_section: record.area_section || '',
      area_tier: record.area_tier || '',
      area_slot: record.area_slot || '',
      size_length: record.size_length !== null && record.size_length !== '' ? Number(record.size_length) : null,
      size_width: record.size_width !== null && record.size_width !== '' ? Number(record.size_width) : null,
      size_height: record.size_height !== null && record.size_height !== '' ? Number(record.size_height) : null,
      volume: record.volume !== null && record.volume !== '' ? Number(record.volume) : null,
      capacity: record.capacity !== null && record.capacity !== '' ? Number(record.capacity) : null,
      warehouse: record.warehouse,
      description: record.description || '',
      is_enabled: record.is_enabled === 1,
      logistics_provider_id: record.logistics_provider_id ?? null,
    });
    setBinPreview(record.storage_bin);
  };

  const openView = (record: StorageBin) => {
    setModalMode('view');
    setEditingId(record.id);
    fillForm(record);
    setModalOpen(true);
  };

  const openEdit = (record: StorageBin) => {
    setModalMode('edit');
    setEditingId(record.id);
    fillForm(record);
    setModalOpen(true);
  };

  const refreshBinPreview = () => {
    setBinPreview(buildStorageBinCode(form.getFieldsValue()));
  };

  const handleModalOk = async () => {
    if (modalMode === 'view') {
      setModalOpen(false);
      return;
    }
    try {
      const values = await form.validateFields();
      const storageBin = buildStorageBinCode(values);
      if (!storageBin) {
        message.error('区/排/架/层/位 至少填写其中一项');
        return;
      }
      setSubmitting(true);
      const payload: StorageBinPayload = {
        area_zone: values.area_zone?.trim() || '',
        area_aisle: values.area_aisle?.trim() || '',
        area_section: values.area_section?.trim() || '',
        area_tier: values.area_tier?.trim() || '',
        area_slot: values.area_slot?.trim() || '',
        size_length: values.size_length ?? null,
        size_width: values.size_width ?? null,
        size_height: values.size_height ?? null,
        volume: values.volume ?? null,
        capacity: values.capacity ?? null,
        warehouse: values.warehouse.trim(),
        description: values.description?.trim() || '',
        is_enabled: values.is_enabled !== false,
        logistics_provider_id: showProviderSelect ? (values.logistics_provider_id ?? null) : undefined,
      };
      let ok = false;
      if (modalMode === 'create') {
        ok = await onCreate(payload);
      } else if (editingId != null) {
        ok = await onUpdate(editingId, payload);
      }
      if (ok) {
        message.success(modalMode === 'create' ? '库位已创建' : '库位已更新');
        setModalOpen(false);
      }
    } catch (err) {
      // 校验失败，忽略
    } finally {
      setSubmitting(false);
    }
  };

  const isView = modalMode === 'view';
  const modalTitle = modalMode === 'create' ? '新增库位' : modalMode === 'edit' ? '修改库位' : '查看库位';

  const formatDate = (value?: string | null) =>
    value ? new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '';

  const columns: ColumnsType<StorageBin> = [
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
      title: '物流商',
      key: 'logistics_provider_id',
      width: 150,
      children: [
        {
          title: renderSearchInput('logistics_provider_id', '物流商ID'),
          key: 'logistics_provider_id_child',
          width: 150,
          ellipsis: true,
          render: (_, record) => record.logistics_provider_name || (record.logistics_provider_id ? `#${record.logistics_provider_id}` : '—'),
        },
      ],
    },
    {
      title: '仓库',
      key: 'warehouse',
      width: 150,
      sorter: true,
      sortOrder: sortKey === 'warehouse' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('warehouse', '仓库'),
          dataIndex: 'warehouse',
          key: 'warehouse_child',
          width: 150,
          ellipsis: true,
        },
      ],
    },
    {
      title: '库位号',
      key: 'storage_bin',
      width: 150,
      sorter: true,
      sortOrder: sortKey === 'storage_bin' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('storage_bin', '库位号'),
          dataIndex: 'storage_bin',
          key: 'storage_bin_child',
          width: 150,
          ellipsis: true,
          render: (value: string) => <Tag color="blue">{value}</Tag>,
        },
      ],
    },
    {
      title: '区',
      key: 'area_zone',
      width: 90,
      children: [
        { title: renderSearchInput('area_zone', '区'), dataIndex: 'area_zone', key: 'area_zone_child', width: 90, ellipsis: true, render: (v: string | null) => v || '' },
      ],
    },
    {
      title: '排',
      key: 'area_aisle',
      width: 90,
      children: [
        { title: renderSearchInput('area_aisle', '排'), dataIndex: 'area_aisle', key: 'area_aisle_child', width: 90, ellipsis: true, render: (v: string | null) => v || '' },
      ],
    },
    {
      title: '架',
      key: 'area_section',
      width: 90,
      children: [
        { title: renderSearchInput('area_section', '架'), dataIndex: 'area_section', key: 'area_section_child', width: 90, ellipsis: true, render: (v: string | null) => v || '' },
      ],
    },
    {
      title: '层',
      key: 'area_tier',
      width: 90,
      children: [
        { title: renderSearchInput('area_tier', '层'), dataIndex: 'area_tier', key: 'area_tier_child', width: 90, ellipsis: true, render: (v: string | null) => v || '' },
      ],
    },
    {
      title: '位',
      key: 'area_slot',
      width: 90,
      children: [
        { title: renderSearchInput('area_slot', '位'), dataIndex: 'area_slot', key: 'area_slot_child', width: 90, ellipsis: true, render: (v: string | null) => v || '' },
      ],
    },
    {
      title: '长',
      key: 'size_length',
      width: 80,
      children: [
        { title: '', dataIndex: 'size_length', key: 'size_length_child', width: 80, render: (v) => formatNumber(v) },
      ],
    },
    {
      title: '宽',
      key: 'size_width',
      width: 80,
      children: [
        { title: '', dataIndex: 'size_width', key: 'size_width_child', width: 80, render: (v) => formatNumber(v) },
      ],
    },
    {
      title: '高',
      key: 'size_height',
      width: 80,
      children: [
        { title: '', dataIndex: 'size_height', key: 'size_height_child', width: 80, render: (v) => formatNumber(v) },
      ],
    },
    {
      title: '容积',
      key: 'volume',
      width: 90,
      children: [
        { title: '', dataIndex: 'volume', key: 'volume_child', width: 90, render: (v) => formatNumber(v) },
      ],
    },
    {
      title: '载重',
      key: 'capacity',
      width: 90,
      children: [
        { title: '', dataIndex: 'capacity', key: 'capacity_child', width: 90, render: (v) => formatNumber(v) },
      ],
    },
    {
      title: '是否启用',
      key: 'is_enabled',
      width: 110,
      sorter: true,
      sortOrder: sortKey === 'is_enabled' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderEnabledFilter(),
          key: 'is_enabled_child',
          width: 110,
          render: (_, record) => <Tag color={record.is_enabled === 1 ? 'success' : 'default'}>{record.is_enabled === 1 ? '启用' : '停用'}</Tag>,
        },
      ],
    },
    {
      title: '备注',
      key: 'description',
      width: 160,
      children: [
        {
          title: renderSearchInput('description', '备注'),
          dataIndex: 'description',
          key: 'description_child',
          width: 160,
          ellipsis: true,
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
          render: (value: string) => formatDate(value),
        },
      ],
    },
    {
      title: '',
      key: 'spacer',
      children: [{ title: '', key: 'spacer_child', render: () => null }],
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
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
          width: 120,
          fixed: 'right',
          align: 'center',
          render: (_, record) => (
            <Space size={4}>
              <Tooltip title="查看">
                <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => openView(record)} />
              </Tooltip>
              {canUpdate && (
                <Tooltip title="修改">
                  <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(record)} />
                </Tooltip>
              )}
              {canDelete && (
                <Popconfirm
                  title="确定删除该库位？"
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
  ];

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  return (
    <Card bodyStyle={{ padding: 0, height: 'calc(100vh - 61px)', display: 'flex', flexDirection: 'column' }} bordered={false}>
      <div style={{ padding: '6px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: '0 0 auto', display: 'flex', gap: 8 }}>
          {canManage && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新增库位
            </Button>
          )}
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
            placeholder="搜索库位：ID、库位号、仓库、区/排/架或备注"
            style={{ width: 400 }}
            enterButton
          />
        </div>
        <div style={{ flex: '0 0 auto', visibility: 'hidden' }}>
          <Button>占位</Button>
        </div>
      </div>

      <div ref={tableHostRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Table<StorageBin>
          rowKey="id"
          rowClassName={(record) => selectedRowKeys.includes(record.id) ? 'row-selected' : ''}
          loading={loading}
          columns={columns}
          dataSource={bins}
          pagination={false}
          size="small"
          sticky
          tableLayout="fixed"
          showSorterTooltip={false}
          sortDirections={['ascend', 'descend', 'ascend']}
          scroll={{ x: 'max-content', y: tableScrollY }}
          locale={{ emptyText: '没有库位记录' }}
          onChange={(_, __, sorter) => {
            if (Array.isArray(sorter)) {
              return;
            }
            const field = (sorter.field || sorter.columnKey) as StorageBinSortKey | undefined;
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
      </div>

      <Modal
        title={modalTitle}
        open={modalOpen}
        onOk={handleModalOk}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        okText={isView ? '关闭' : '保存'}
        cancelText="取消"
        okButtonProps={isView ? { style: { display: 'none' } } : undefined}
        cancelButtonProps={isView ? { children: '关闭' } : undefined}
        destroyOnClose
        width={640}
      >
        <Form form={form} layout="vertical" disabled={isView} onValuesChange={refreshBinPreview}>
          <Form.Item
            name="warehouse"
            label="仓库名称"
            rules={[{ required: true, message: '请输入仓库名称' }]}
          >
            <Input placeholder="请输入仓库名称" maxLength={128} />
          </Form.Item>

          {showProviderSelect && (
            <Form.Item name="logistics_provider_id" label="物流商">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="请选择物流商（可空）"
                options={providerSelectOptions}
              />
            </Form.Item>
          )}

          <Form.Item label="库位区位（区/排/架/层/位，至少填一项）" style={{ marginBottom: 8 }} required>
            <Space.Compact block>
              <Form.Item name="area_zone" noStyle>
                <Input placeholder="区" maxLength={32} />
              </Form.Item>
              <Form.Item name="area_aisle" noStyle>
                <Input placeholder="排" maxLength={32} />
              </Form.Item>
              <Form.Item name="area_section" noStyle>
                <Input placeholder="架" maxLength={32} />
              </Form.Item>
              <Form.Item name="area_tier" noStyle>
                <Input placeholder="层" maxLength={32} />
              </Form.Item>
              <Form.Item name="area_slot" noStyle>
                <Input placeholder="位" maxLength={32} />
              </Form.Item>
            </Space.Compact>
          </Form.Item>

          <Form.Item label="库位号（自动生成）" style={{ marginBottom: 12 }}>
            <Input value={binPreview} readOnly disabled placeholder="由区/排/架/层/位组合生成" />
          </Form.Item>

          <Space size={12} style={{ display: 'flex' }} wrap>
            <Form.Item name="size_length" label="长">
              <InputNumber min={0} style={{ width: 120 }} placeholder="长" />
            </Form.Item>
            <Form.Item name="size_width" label="宽">
              <InputNumber min={0} style={{ width: 120 }} placeholder="宽" />
            </Form.Item>
            <Form.Item name="size_height" label="高">
              <InputNumber min={0} style={{ width: 120 }} placeholder="高" />
            </Form.Item>
            <Form.Item name="volume" label="容积">
              <InputNumber min={0} style={{ width: 120 }} placeholder="容积" />
            </Form.Item>
            <Form.Item name="capacity" label="载重">
              <InputNumber min={0} style={{ width: 120 }} placeholder="载重" />
            </Form.Item>
          </Space>

          <Form.Item name="is_enabled" label="是否启用" valuePropName="checked" initialValue={true}>
            <Checkbox>启用</Checkbox>
          </Form.Item>

          <Form.Item name="description" label="备注">
            <Input.TextArea placeholder="请输入备注" maxLength={255} rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
