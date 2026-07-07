import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Card, Checkbox, DatePicker, Form, Input, Modal, Pagination as AntPagination, Popconfirm, Select, Space, Table, Tag, Tooltip, message } from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined, UnorderedListOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { adminFetch } from '../../lib/api';
import { constrainTableColumns, getConstrainedTableScrollX } from '../../lib/tableColumns';

export interface NumberCategory {
  id: number;
  number_category: string;
  description: string | null;
  is_enabled: number;
  logistics_provider_id: number | null;
  logistics_provider_name?: string | null;
  unused_count: number;
  estimated_depletion_days: number | null;
  created_at: string;
  updated_at?: string;
}

export interface NumberCategoryPayload {
  number_category: string;
  description?: string;
  is_enabled?: boolean;
  logistics_provider_id?: number | null;
}

type NumberCategorySortKey = 'id' | 'number_category' | 'is_enabled' | 'created_at';
type SortDirection = 'asc' | 'desc';

interface NumberLibraryTabProps {
  categories: NumberCategory[];
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
  sortKey: NumberCategorySortKey;
  sortDirection: SortDirection;
  onSortChange: (key: NumberCategorySortKey, direction: SortDirection) => void;
  onCreate: (payload: NumberCategoryPayload) => Promise<boolean>;
  onUpdate: (id: number, payload: NumberCategoryPayload) => Promise<boolean>;
  onDelete: (id: number) => void;
  onBatchDelete: (ids: number[]) => void;
  onNumbersChanged?: () => void;
  canManage?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  refreshKey?: number;
  onColumnFilterChange?: (columnFilters: Record<string, string>, dateFilters: Record<string, [string, string]>) => void;
}

type ModalMode = 'create' | 'edit' | 'view';

interface NumberCategoryFormValues {
  number_category: string;
  description?: string;
  is_enabled?: boolean;
  logistics_provider_id?: number | null;
}

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '';

// ==================== 单号管理弹窗 ====================
interface TrackingNumber {
  id: number;
  number: string;
  status: string;
  used_at: string | null;
  created_at: string;
}

interface NumbersModalProps {
  open: boolean;
  categoryId: number | null;
  categoryName: string;
  canManage?: boolean;
  canDelete?: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

function NumbersModal({ open, categoryId, categoryName, canManage, canDelete, onClose, onChanged }: NumbersModalProps) {
  const [numbers, setNumbers] = useState<TrackingNumber[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [numberFilter, setNumberFilter] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [dirty, setDirty] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addText, setAddText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchNumbers = async (
    nextPage: number = page,
    size: number = pageSize,
    status: string = statusFilter,
    number: string = numberFilter,
  ) => {
    if (!categoryId) return;
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(nextPage), limit: String(size) });
      const cf: Record<string, string> = {};
      if (status) cf.status = status;
      if (number.trim()) cf.number = number.trim();
      if (Object.keys(cf).length > 0) params.set('columnFilters', JSON.stringify(cf));
      const res = await adminFetch(`/admin/number-categories/${categoryId}/numbers?${params.toString()}`);
      if (!res.ok) throw new Error('fetch numbers failed');
      const data = await res.json();
      setNumbers(data.data || []);
      setTotal(data.pagination?.total || 0);
      setPage(nextPage);
      setPageSize(size);
    } catch {
      message.error('读取单号失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && categoryId) {
      setStatusFilter('');
      setNumberFilter('');
      setSelectedRowKeys([]);
      setDirty(false);
      fetchNumbers(1, pageSize, '', '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, categoryId]);

  const handleClose = () => {
    if (dirty) onChanged?.();
    onClose();
  };

  const handleAdd = async () => {
    if (!categoryId) return;
    const text = addText.trim();
    if (!text) {
      message.error('请输入要导入的单号');
      return;
    }
    try {
      setSubmitting(true);
      const res = await adminFetch(`/admin/number-categories/${categoryId}/numbers`, {
        method: 'POST',
        body: JSON.stringify({ numbers: text }),
      });
      const data = await res.json();
      if (res.ok) {
        message.success(data.message || '导入成功');
        setAddOpen(false);
        setAddText('');
        setDirty(true);
        fetchNumbers(1, pageSize, statusFilter, numberFilter);
      } else {
        message.error(data.error || '导入单号失败');
      }
    } catch {
      message.error('导入单号失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!categoryId) return;
    try {
      const res = await adminFetch(`/admin/number-categories/${categoryId}/numbers/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDirty(true);
        fetchNumbers(page, pageSize, statusFilter, numberFilter);
      } else {
        message.error('删除单号失败');
      }
    } catch {
      message.error('删除单号失败');
    }
  };

  const handleBatchDelete = async () => {
    if (!categoryId || selectedRowKeys.length === 0) return;
    try {
      const res = await adminFetch(`/admin/number-categories/${categoryId}/numbers/batch-delete`, {
        method: 'POST',
        body: JSON.stringify({ ids: selectedRowKeys }),
      });
      if (res.ok) {
        setSelectedRowKeys([]);
        setDirty(true);
        fetchNumbers(1, pageSize, statusFilter, numberFilter);
      } else {
        message.error('批量删除失败');
      }
    } catch {
      message.error('批量删除失败');
    }
  };

  const visibleRowIds = numbers.map((n) => n.id);
  const selectedVisibleCount = visibleRowIds.filter((id) => selectedRowKeys.includes(id)).length;
  const allSelected = visibleRowIds.length > 0 && selectedVisibleCount === visibleRowIds.length;
  const indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleRowIds.length;

  const columns: ColumnsType<TrackingNumber> = [
    {
      title: canDelete ? (
        <Checkbox
          checked={allSelected}
          indeterminate={indeterminate}
          onChange={(e) => setSelectedRowKeys(e.target.checked ? visibleRowIds : [])}
        />
      ) : '#',
      key: 'sel',
      width: 48,
      render: (_, record, index) =>
        canDelete ? (
          <Checkbox
            checked={selectedRowKeys.includes(record.id)}
            onChange={(e) =>
              setSelectedRowKeys((prev) => (e.target.checked ? [...prev, record.id] : prev.filter((k) => k !== record.id)))
            }
          />
        ) : (
          (page - 1) * pageSize + index + 1
        ),
    },
    { title: '单号', dataIndex: 'number', key: 'number', ellipsis: true },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (v: string) => <Tag color={v === 'used' ? 'default' : 'success'}>{v === 'used' ? '已用' : '未使用'}</Tag>,
    },
    { title: '使用时间', dataIndex: 'used_at', key: 'used_at', width: 170, render: (v: string | null) => formatDate(v) },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 170, render: (v: string) => formatDate(v) },
    ...(canDelete
      ? [
          {
            title: '操作',
            key: 'actions',
            width: 70,
            align: 'center' as const,
            render: (_: unknown, record: TrackingNumber) => (
              <Popconfirm title="确定删除该单号？" okText="删除" cancelText="取消" onConfirm={() => handleDelete(record.id)}>
                <Button danger size="small" type="text" icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          },
        ]
      : []),
  ];

  const tableColumns = constrainTableColumns(columns);
  const tableScrollX = getConstrainedTableScrollX(tableColumns);

  return (
    <>
      <Modal
        title={`单号管理 - ${categoryName}`}
        open={open}
        onCancel={handleClose}
        footer={<Button onClick={handleClose}>关闭</Button>}
        width={760}
        destroyOnClose
      >
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {canManage && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setAddText(''); setAddOpen(true); }}>
              导入单号
            </Button>
          )}
          {canDelete && (
            <Popconfirm
              title={`确定删除选中的 ${selectedRowKeys.length} 个单号？`}
              okText="删除"
              cancelText="取消"
              onConfirm={handleBatchDelete}
              disabled={selectedRowKeys.length === 0}
            >
              <Button danger disabled={selectedRowKeys.length === 0}>
                批量删除{selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length})` : ''}
              </Button>
            </Popconfirm>
          )}
          <Select
            size="small"
            value={statusFilter}
            style={{ width: 110 }}
            onChange={(v) => { setStatusFilter(v); fetchNumbers(1, pageSize, v, numberFilter); }}
            options={[
              { label: '全部状态', value: '' },
              { label: '未使用', value: 'unused' },
              { label: '已用', value: 'used' },
            ]}
          />
          <Input.Search
            size="small"
            allowClear
            placeholder="搜索单号"
            style={{ width: 200 }}
            value={numberFilter}
            onChange={(e) => { const v = e.target.value; setNumberFilter(v); if (!v) fetchNumbers(1, pageSize, statusFilter, ''); }}
            onSearch={(v) => fetchNumbers(1, pageSize, statusFilter, v)}
          />
        </div>

        <Table<TrackingNumber>
          rowKey="id"
          loading={loading}
          columns={tableColumns}
          dataSource={numbers}
          pagination={false}
          size="small"
          scroll={{ x: tableScrollX, y: 360 }}
          locale={{ emptyText: '暂无单号' }}
        />

        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <AntPagination
            size="small"
            current={page}
            pageSize={pageSize}
            total={total}
            showSizeChanger
            pageSizeOptions={[20, 50, 100, 200]}
            showTotal={(t) => `共 ${t} 个单号`}
            onChange={(p, s) => fetchNumbers(p, s, statusFilter, numberFilter)}
          />
        </div>
      </Modal>

      <Modal
        title="导入单号"
        open={addOpen}
        onOk={handleAdd}
        onCancel={() => setAddOpen(false)}
        confirmLoading={submitting}
        okText="导入"
        cancelText="取消"
        destroyOnClose
      >
        <p style={{ marginTop: 0, color: '#888' }}>每行一个单号（也支持逗号分隔），重复单号将自动跳过。</p>
        <Input.TextArea
          rows={10}
          value={addText}
          onChange={(e) => setAddText(e.target.value)}
          placeholder={'例如：\nSF1234567890\nSF1234567891\nSF1234567892'}
          maxLength={200000}
        />
      </Modal>
    </>
  );
}

// ==================== 号段库主表 ====================
export default function NumberLibraryTab({
  categories,
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
  onNumbersChanged,
  canManage,
  canUpdate,
  canDelete,
  refreshKey,
  onColumnFilterChange,
}: NumberLibraryTabProps) {
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
    const observer = new ResizeObserver(() => updateTableHeight());
    if (tableHostRef.current) observer.observe(tableHostRef.current);
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
  const visibleRowIds = categories.map((item) => item.id);
  const selectedVisibleCount = visibleRowIds.filter((id) => selectedRowKeys.includes(id)).length;
  const allSelected = visibleRowIds.length > 0 && selectedVisibleCount === visibleRowIds.length;
  const indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleRowIds.length;

  const handleSelectAll = (checked: boolean) => setSelectedRowKeys(checked ? visibleRowIds : []);
  const handleSelectRow = (id: number, checked: boolean) => {
    setSelectedRowKeys((prev) => (checked ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((key) => key !== id)));
  };

  // ---------- 新增/编辑/查看 弹窗 ----------
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<NumberCategoryFormValues>();

  // ---------- 单号管理 弹窗 ----------
  const [numbersOpen, setNumbersOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<NumberCategory | null>(null);

  const openNumbers = (record: NumberCategory) => {
    setActiveCategory(record);
    setNumbersOpen(true);
  };

  const openCreate = () => {
    setModalMode('create');
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ is_enabled: true });
    setModalOpen(true);
  };

  const fillForm = (record: NumberCategory) => {
    form.setFieldsValue({
      number_category: record.number_category,
      description: record.description || '',
      is_enabled: record.is_enabled === 1,
      logistics_provider_id: record.logistics_provider_id ?? null,
    });
  };

  const openView = (record: NumberCategory) => {
    setModalMode('view');
    setEditingId(record.id);
    fillForm(record);
    setModalOpen(true);
  };

  const openEdit = (record: NumberCategory) => {
    setModalMode('edit');
    setEditingId(record.id);
    fillForm(record);
    setModalOpen(true);
  };

  const handleModalOk = async () => {
    if (modalMode === 'view') {
      setModalOpen(false);
      return;
    }
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const payload: NumberCategoryPayload = {
        number_category: values.number_category.trim(),
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
        message.success(modalMode === 'create' ? '号段已创建' : '号段已更新');
        setModalOpen(false);
      }
    } catch {
      // 校验失败，忽略
    } finally {
      setSubmitting(false);
    }
  };

  const isView = modalMode === 'view';
  const modalTitle = modalMode === 'create' ? '新增号段' : modalMode === 'edit' ? '修改号段' : '查看号段';

  const columns: ColumnsType<NumberCategory> = [
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
              <Checkbox checked={allSelected} indeterminate={indeterminate} onChange={(e) => handleSelectAll(e.target.checked)} />
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
      title: '号段名称',
      key: 'number_category',
      width: 180,
      sorter: true,
      sortOrder: sortKey === 'number_category' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('number_category', '号段名称'),
          dataIndex: 'number_category',
          key: 'number_category_child',
          width: 180,
          ellipsis: true,
          render: (value: string) => <Tag color="blue">{value}</Tag>,
        },
      ],
    },
    {
      title: '库存数量',
      key: 'unused_count',
      width: 110,
      children: [
        {
          title: '',
          dataIndex: 'unused_count',
          key: 'unused_count_child',
          width: 110,
          render: (v: number) => <span style={{ color: v > 0 ? '#1677ff' : '#cf1322' }}>{v}</span>,
        },
      ],
    },
    {
      title: '预计用尽天数',
      key: 'estimated_depletion_days',
      width: 130,
      children: [
        {
          title: '',
          dataIndex: 'estimated_depletion_days',
          key: 'estimated_depletion_days_child',
          width: 130,
          render: (v: number | null) => (v === null || v === undefined ? '—' : `${v} 天`),
        },
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
      width: 180,
      children: [
        {
          title: renderSearchInput('description', '备注'),
          dataIndex: 'description',
          key: 'description_child',
          width: 180,
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
      width: 160,
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
          width: 160,
          fixed: 'right',
          align: 'center',
          render: (_, record) => (
            <Space size={4}>
              <Tooltip title="单号管理">
                <Button size="small" type="text" icon={<UnorderedListOutlined />} onClick={() => openNumbers(record)} />
              </Tooltip>
              <Tooltip title="查看">
                <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => openView(record)} />
              </Tooltip>
              {canUpdate && (
                <Tooltip title="修改">
                  <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(record)} />
                </Tooltip>
              )}
              {canDelete && (
                <Popconfirm title="确定删除该号段？其下所有单号将一并删除" okText="删除" cancelText="取消" onConfirm={() => onDelete(record.id)}>
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

  const categoryTableColumns = constrainTableColumns(columns);
  const categoryTableScrollX = getConstrainedTableScrollX(categoryTableColumns);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  return (
    <Card bodyStyle={{ padding: 0, height: 'calc(100vh - 61px)', display: 'flex', flexDirection: 'column' }} bordered={false}>
      <div style={{ padding: '6px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: '0 0 auto', display: 'flex', gap: 8 }}>
          {canManage && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新增号段
            </Button>
          )}
          {canDelete && (
            <Popconfirm
              title={`确定删除选中的 ${selectedRowKeys.length} 条记录？其下所有单号将一并删除`}
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
            placeholder="搜索号段：ID、号段名称或备注"
            style={{ width: 400 }}
            enterButton
          />
        </div>
        <div style={{ flex: '0 0 auto', visibility: 'hidden' }}>
          <Button>占位</Button>
        </div>
      </div>

      <div ref={tableHostRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Table<NumberCategory>
          rowKey="id"
          rowClassName={(record) => (selectedRowKeys.includes(record.id) ? 'row-selected' : '')}
          loading={loading}
          columns={categoryTableColumns}
          dataSource={categories}
          pagination={false}
          size="small"
          sticky
          tableLayout="fixed"
          showSorterTooltip={false}
          sortDirections={['ascend', 'descend', 'ascend']}
          scroll={{ x: categoryTableScrollX, y: tableScrollY }}
          locale={{ emptyText: '没有号段记录' }}
          onChange={(_, __, sorter) => {
            if (Array.isArray(sorter)) return;
            const field = (sorter.field || sorter.columnKey) as NumberCategorySortKey | undefined;
            const order = sorter.order;
            if (!field || !order) return;
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
        width={520}
      >
        <Form form={form} layout="vertical" disabled={isView}>
          <Form.Item
            name="number_category"
            label="号段名称"
            rules={[{ required: true, message: '请输入号段名称' }]}
          >
            <Input placeholder="请输入号段名称" maxLength={128} />
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

          <Form.Item name="is_enabled" label="是否启用" valuePropName="checked" initialValue={true}>
            <Checkbox>启用</Checkbox>
          </Form.Item>

          <Form.Item name="description" label="备注">
            <Input.TextArea placeholder="请输入备注" maxLength={255} rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <NumbersModal
        open={numbersOpen}
        categoryId={activeCategory?.id ?? null}
        categoryName={activeCategory?.number_category ?? ''}
        canManage={canManage}
        canDelete={canDelete}
        onClose={() => setNumbersOpen(false)}
        onChanged={onNumbersChanged}
      />
    </Card>
  );
}
