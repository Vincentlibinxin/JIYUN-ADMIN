import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AutoComplete, Button, Card, Checkbox, Form, Input, InputNumber, Modal, Pagination as AntPagination, Popconfirm, Select, Space, Switch, Table, Tag, Tooltip, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { adminFetch } from '../../lib/api';
import { constrainTableColumns, getConstrainedTableScrollX } from '../../lib/tableColumns';

interface ParcelStatusItem {
  id: number;
  status_id: number;
  status_code: string;
  status_name: string;
  status_type: '货物态' | '信息态';
  status_category: string | null;
  is_enabled: number;
  created_at: string;
  updated_at?: string;
}

interface ParcelStatusPayload {
  status_id: number;
  status_code: string;
  status_name: string;
  status_type: string;
  status_category: string;
  is_enabled: boolean;
}

interface ParcelStatusTabProps {
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  refreshKey?: number;
}

type SortKey = 'status_id' | 'status_code' | 'status_name' | 'status_type' | 'status_category' | 'is_enabled';
type SortDirection = 'asc' | 'desc';
type ModalMode = 'create' | 'edit';

const STATUS_TYPE_OPTIONS = [
  { label: '货物态', value: '货物态' },
  { label: '信息态', value: '信息态' },
];

export default function ParcelStatusTab({ canCreate, canUpdate, canDelete, refreshKey }: ParcelStatusTabProps) {
  const [items, setItems] = useState<ParcelStatusItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('status_id');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);

  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [localColumnFilters, setLocalColumnFilters] = useState<Record<string, string>>({});

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [editingItem, setEditingItem] = useState<ParcelStatusItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [messageApi, messageContextHolder] = message.useMessage();
  const [form] = Form.useForm();

  const tableHostRef = useRef<HTMLDivElement>(null);
  const [tableScrollY, setTableScrollY] = useState(240);

  useLayoutEffect(() => {
    const updateTableHeight = () => {
      const nextHeight = tableHostRef.current?.clientHeight ?? 0;
      if (nextHeight > 0) setTableScrollY(nextHeight - 86);
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

  const fetchStatuses = async (
    page: number = currentPage,
    size: number = pageSize,
    sortK: SortKey = sortKey,
    sortD: SortDirection = sortDirection,
    cf: Record<string, string> = columnFilters,
    q: string = searchQuery,
  ) => {
    try {
      setLoading(true);
      const keyword = q.trim();
      if (keyword) {
        const response = await adminFetch(`/admin/parcel-statuses/search?q=${encodeURIComponent(keyword)}`);
        if (response.status === 401) return;
        if (!response.ok) throw new Error('search failed');
        const data = await response.json();
        const list = Array.isArray(data?.data) ? data.data : [];
        setItems(list);
        setTotalItems(list.length);
      } else {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(size),
          sortKey: sortK,
          sortOrder: sortD,
        });
        if (Object.keys(cf).length > 0) params.set('columnFilters', JSON.stringify(cf));
        const response = await adminFetch(`/admin/parcel-statuses?${params.toString()}`);
        if (response.status === 401) return;
        if (!response.ok) throw new Error('fetch failed');
        const data = await response.json();
        setItems(Array.isArray(data?.data) ? data.data : []);
        setTotalItems(data?.pagination?.total || 0);
        setCurrentPage(page);
        setPageSize(size);
      }
    } catch {
      messageApi.error('读取包裹状态失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchStatuses(1, pageSize, sortKey, sortDirection, {}, '');
    setColumnFilters({});
    setLocalColumnFilters({});
    setSearchQuery('');
    setSelectedRowKeys([]);
    setCurrentPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => { if (it.status_category) set.add(it.status_category); });
    return Array.from(set).map((c) => ({ value: c }));
  }, [items]);

  const handleColumnSearch = (key: string, value: string) => {
    const next = { ...columnFilters };
    if (!value) delete next[key];
    else next[key] = value;
    setColumnFilters(next);
    setCurrentPage(1);
    void fetchStatuses(1, pageSize, sortKey, sortDirection, next, searchQuery);
  };

  const renderSearchInput = (key: string, placeholder: string) => (
    <Input
      size="small"
      placeholder={`搜索 ${placeholder}`}
      value={localColumnFilters[key] !== undefined ? localColumnFilters[key] : (columnFilters[key] || '')}
      onChange={(e) => {
        setLocalColumnFilters((prev) => ({ ...prev, [key]: e.target.value }));
        if (!e.target.value) handleColumnSearch(key, '');
      }}
      onPressEnter={(e) => handleColumnSearch(key, (e.target as HTMLInputElement).value)}
      onClick={(e) => e.stopPropagation()}
      allowClear
    />
  );

  const renderSelectFilter = (key: string, options: Array<{ label: string; value: string }>) => (
    <Select
      size="small"
      value={columnFilters[key] || ''}
      onChange={(v) => handleColumnSearch(key, v)}
      onClick={(e) => e.stopPropagation()}
      style={{ width: '100%' }}
      options={[{ label: '全部', value: '' }, ...options]}
    />
  );

  const resetFilters = () => {
    setColumnFilters({});
    setLocalColumnFilters({});
    setSearchQuery('');
    setSortKey('status_id');
    setSortDirection('asc');
    setSelectedRowKeys([]);
    setCurrentPage(1);
    void fetchStatuses(1, pageSize, 'status_id', 'asc', {}, '');
  };

  const visibleKeys = items.map((it) => it.id);
  const selectedVisibleCount = visibleKeys.filter((k) => selectedRowKeys.includes(k)).length;
  const allSelected = visibleKeys.length > 0 && selectedVisibleCount === visibleKeys.length;
  const indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleKeys.length;

  const handleSelectAll = (checked: boolean) => setSelectedRowKeys(checked ? visibleKeys : []);
  const handleSelectRow = (key: number, checked: boolean) => {
    setSelectedRowKeys((prev) => (checked ? (prev.includes(key) ? prev : [...prev, key]) : prev.filter((k) => k !== key)));
  };

  const openCreate = () => {
    setModalMode('create');
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({ status_type: '货物态', is_enabled: true });
    setModalOpen(true);
  };

  const openEdit = (record: ParcelStatusItem) => {
    setModalMode('edit');
    setEditingItem(record);
    form.setFieldsValue({
      status_id: record.status_id,
      status_code: record.status_code,
      status_name: record.status_name,
      status_type: record.status_type,
      status_category: record.status_category || '',
      is_enabled: !!record.is_enabled,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    let values: ParcelStatusPayload;
    try {
      values = (await form.validateFields()) as ParcelStatusPayload;
    } catch {
      return;
    }
    const payload = {
      status_id: Number(values.status_id),
      status_code: String(values.status_code || '').trim(),
      status_name: String(values.status_name || '').trim(),
      status_type: values.status_type,
      status_category: String(values.status_category || '').trim(),
      is_enabled: !!values.is_enabled,
    };
    try {
      setSubmitting(true);
      const path = modalMode === 'create'
        ? '/admin/parcel-statuses'
        : `/admin/parcel-statuses/${editingItem?.id}`;
      const response = await adminFetch(path, {
        method: modalMode === 'create' ? 'POST' : 'PUT',
        body: JSON.stringify(payload),
      });
      if (response.status === 401) return;
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        messageApi.error(data?.error || (modalMode === 'create' ? '创建失败' : '更新失败'));
        return;
      }
      messageApi.success(modalMode === 'create' ? '包裹状态已创建' : '包裹状态已更新');
      setModalOpen(false);
      void fetchStatuses();
    } catch {
      messageApi.error('请求失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (record: ParcelStatusItem) => {
    try {
      const response = await adminFetch(`/admin/parcel-statuses/${record.id}`, { method: 'DELETE' });
      if (response.status === 401) return;
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        messageApi.error(data?.error || '删除失败');
        return;
      }
      messageApi.success('包裹状态已删除');
      setSelectedRowKeys((prev) => prev.filter((k) => k !== record.id));
      void fetchStatuses();
    } catch {
      messageApi.error('请求失败');
    }
  };

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) return;
    try {
      const response = await adminFetch('/admin/parcel-statuses/batch-delete', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedRowKeys }),
      });
      if (response.status === 401) return;
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        messageApi.error(data?.error || '批量删除失败');
        return;
      }
      messageApi.success(data?.message || '删除成功');
      setSelectedRowKeys([]);
      void fetchStatuses();
    } catch {
      messageApi.error('请求失败');
    }
  };

  const sortOrderFor = (key: SortKey) => (sortKey === key ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null);

  const columns: ColumnsType<ParcelStatusItem> = [
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
              <span>{(currentPage - 1) * pageSize + index + 1}</span>
            </div>
          ),
        },
      ],
    },
    {
      title: '状态ID',
      key: 'status_id',
      width: 120,
      sorter: true,
      sortOrder: sortOrderFor('status_id'),
      children: [
        {
          title: renderSearchInput('status_id', '状态ID'),
          key: 'status_id_child',
          width: 120,
          render: (_, record) => <span style={{ fontWeight: 600 }}>{record.status_id}</span>,
        },
      ],
    },
    {
      title: '状态编码',
      key: 'status_code',
      width: 240,
      sorter: true,
      sortOrder: sortOrderFor('status_code'),
      children: [
        {
          title: renderSearchInput('status_code', '状态编码'),
          key: 'status_code_child',
          width: 240,
          render: (_, record) => <Tag>{record.status_code}</Tag>,
        },
      ],
    },
    {
      title: '状态名称',
      key: 'status_name',
      width: 160,
      sorter: true,
      sortOrder: sortOrderFor('status_name'),
      children: [
        {
          title: renderSearchInput('status_name', '状态名称'),
          key: 'status_name_child',
          width: 160,
          render: (_, record) => <span>{record.status_name}</span>,
        },
      ],
    },
    {
      title: '状态类型',
      key: 'status_type',
      width: 130,
      sorter: true,
      sortOrder: sortOrderFor('status_type'),
      children: [
        {
          title: renderSelectFilter('status_type', STATUS_TYPE_OPTIONS),
          key: 'status_type_child',
          width: 130,
          render: (_, record) => (
            <Tag color={record.status_type === '信息态' ? 'gold' : 'blue'}>{record.status_type}</Tag>
          ),
        },
      ],
    },
    {
      title: '状态归类',
      key: 'status_category',
      width: 160,
      sorter: true,
      sortOrder: sortOrderFor('status_category'),
      children: [
        {
          title: renderSearchInput('status_category', '状态归类'),
          key: 'status_category_child',
          width: 160,
          render: (_, record) => <span>{record.status_category || '-'}</span>,
        },
      ],
    },
    {
      title: '是否启用',
      key: 'is_enabled',
      width: 120,
      sorter: true,
      sortOrder: sortOrderFor('is_enabled'),
      children: [
        {
          title: renderSelectFilter('is_enabled', [{ label: '启用', value: '1' }, { label: '停用', value: '0' }]),
          key: 'is_enabled_child',
          width: 120,
          render: (_, record) => (
            record.is_enabled
              ? <Tag color="green">启用</Tag>
              : <Tag>停用</Tag>
          ),
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
              <Tooltip title="编辑">
                <Button size="small" type="text" icon={<EditOutlined />} disabled={!canUpdate} onClick={() => openEdit(record)} />
              </Tooltip>
              {canDelete && (
                <Popconfirm
                  title="确定删除该状态？"
                  description="删除后不可恢复。"
                  okText="删除"
                  okButtonProps={{ danger: true }}
                  cancelText="取消"
                  onConfirm={() => handleDelete(record)}
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

  const tableColumns = constrainTableColumns(columns);
  const tableScrollX = getConstrainedTableScrollX(tableColumns);

  const isSearching = searchQuery.trim().length > 0;

  return (
    <Card style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }} bodyStyle={{ padding: 0, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }} bordered={false}>
      {messageContextHolder}
      <div style={{ padding: '6px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: '0 0 auto' }}>
          <Space>
            {canDelete && (
              <Popconfirm
                title={`确定删除选中的 ${selectedRowKeys.length} 个状态？`}
                description="删除后不可恢复。"
                okText="删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
                onConfirm={handleBatchDelete}
                disabled={selectedRowKeys.length === 0}
              >
                <Button danger disabled={selectedRowKeys.length === 0}>
                  批量删除{selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length})` : ''}
                </Button>
              </Popconfirm>
            )}
          </Space>
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <Input.Search
            allowClear
            value={searchQuery}
            onChange={(event) => {
              const v = event.target.value;
              setSearchQuery(v);
              if (!v.trim()) {
                void fetchStatuses(1, pageSize, sortKey, sortDirection, columnFilters, '');
              }
            }}
            onSearch={(v) => {
              setSearchQuery(v);
              setCurrentPage(1);
              void fetchStatuses(1, pageSize, sortKey, sortDirection, columnFilters, v);
            }}
            placeholder="搜索包裹状态：ID / 编码 / 名称 / 类型 / 归类"
            style={{ width: 460 }}
            enterButton
          />
        </div>
        <div style={{ flex: '0 0 auto' }}>
          {canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} style={{ background: '#f58220' }}>
              新增状态
            </Button>
          )}
        </div>
      </div>

      <div ref={tableHostRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Table<ParcelStatusItem>
          rowKey={(record) => record.id}
          rowClassName={(record) => (selectedRowKeys.includes(record.id) ? 'row-selected' : '')}
          loading={loading}
          columns={tableColumns}
          dataSource={items}
          pagination={false}
          size="small"
          sticky
          tableLayout="auto"
          showSorterTooltip={false}
          sortDirections={['ascend', 'descend', 'ascend']}
          scroll={{ x: tableScrollX, y: tableScrollY }}
          locale={{ emptyText: '没有包裹状态记录' }}
          onChange={(_, __, sorter) => {
            if (Array.isArray(sorter)) return;
            const field = (sorter.columnKey || sorter.field) as SortKey | undefined;
            const order = sorter.order;
            if (!field || !order) {
              setSortKey('status_id');
              setSortDirection('asc');
              void fetchStatuses(currentPage, pageSize, 'status_id', 'asc', columnFilters, searchQuery);
              return;
            }
            const dir: SortDirection = order === 'ascend' ? 'asc' : 'desc';
            setSortKey(field);
            setSortDirection(dir);
            void fetchStatuses(currentPage, pageSize, field, dir, columnFilters, searchQuery);
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
          justifyContent: 'flex-start',
        }}
      >
        <AntPagination
          size="small"
          current={currentPage}
          pageSize={pageSize}
          total={totalItems}
          showSizeChanger={!isSearching}
          pageSizeOptions={[10, 20, 30, 50, 100]}
          showQuickJumper={!isSearching}
          disabled={isSearching}
          showTotal={(total, range) => `第 ${range[0]}-${range[1]} 条 / 共 ${total} 条`}
          onChange={(page, size) => {
            void fetchStatuses(page, size, sortKey, sortDirection, columnFilters, searchQuery);
          }}
          onShowSizeChange={(_, size) => {
            void fetchStatuses(1, size, sortKey, sortDirection, columnFilters, searchQuery);
          }}
        />
      </div>

      <Modal
        title={modalMode === 'create' ? '新增包裹状态' : '编辑包裹状态'}
        open={modalOpen}
        rootClassName="detail-modal"
        className="detail-modal"
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        centered
        confirmLoading={submitting}
        okButtonProps={{ style: { background: '#f58220' } }}
        okText={modalMode === 'create' ? '创建' : '保存'}
        cancelText="取消"
        width={560}
        destroyOnClose
        style={{ maxWidth: 'calc(100vw - 24px)' }}
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="status_id"
            label="状态ID"
            rules={[{ required: true, message: '请输入状态ID' }]}
          >
            <InputNumber min={1} precision={0} style={{ width: '100%' }} placeholder="唯一数字ID，如 1001" />
          </Form.Item>
          <Form.Item
            name="status_code"
            label="状态编码"
            rules={[
              { required: true, message: '请输入状态编码' },
              { pattern: /^[a-z][a-z0-9_]*$/, message: '以小写字母开头，仅含小写字母、数字或下划线' },
            ]}
          >
            <Input placeholder="唯一英文编码，如 order_created" />
          </Form.Item>
          <Form.Item
            name="status_name"
            label="状态名称"
            rules={[{ required: true, message: '请输入状态名称' }]}
          >
            <Input placeholder="如 已下单" />
          </Form.Item>
          <Form.Item
            name="status_type"
            label="状态类型"
            rules={[{ required: true, message: '请选择状态类型' }]}
          >
            <Select options={STATUS_TYPE_OPTIONS} placeholder="请选择" />
          </Form.Item>
          <Form.Item name="status_category" label="状态归类">
            <AutoComplete
              options={categoryOptions}
              placeholder="如 揽收 / 仓储处理 / 出口清关"
              filterOption={(inputValue, option) =>
                String(option?.value ?? '').toLowerCase().includes(inputValue.toLowerCase())
              }
            />
          </Form.Item>
          <Form.Item name="is_enabled" label="是否启用" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
