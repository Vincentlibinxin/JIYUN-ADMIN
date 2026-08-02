import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Card, Checkbox, DatePicker, Form, Input, Modal, Pagination, Popconfirm, Select, Space, Switch, Table, Tag, Tooltip, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { adminFetch } from '../../lib/api';
import { constrainTableColumns, getConstrainedTableScrollX } from '../../lib/tableColumns';

interface WarehouseItem {
  id: number;
  recipient_name: string;
  contact_phone: string;
  address: string;
  logistics_provider_id: number;
  logistics_provider_name: string;
  is_enabled: number;
  created_at: string;
}

interface WarehousePayload {
  recipient_name: string;
  contact_phone: string;
  address: string;
  logistics_provider_id?: number;
  is_enabled: boolean;
}

interface WarehousesTabProps {
  actorScope: 'platform' | 'logistics';
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  refreshKey?: number;
}

type SortDirection = 'asc' | 'desc';
type SortKey = 'recipient_name' | 'contact_phone' | 'logistics_provider_id' | 'is_enabled' | 'created_at';

export default function WarehousesTab({ actorScope, canCreate, canUpdate, canDelete, refreshKey }: WarehousesTabProps) {
  const [items, setItems] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [localColumnFilters, setLocalColumnFilters] = useState<Record<string, string>>({});
  const [dateFilters, setDateFilters] = useState<Record<string, [string, string] | null>>({});
  const [dateResetKey, setDateResetKey] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WarehouseItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [providerOptions, setProviderOptions] = useState<Array<{ label: string; value: number }>>([]);
  const [form] = Form.useForm<WarehousePayload>();
  const [messageApi, messageContextHolder] = message.useMessage();
  const tableHostRef = useRef<HTMLDivElement>(null);
  const [tableScrollY, setTableScrollY] = useState(240);

  useLayoutEffect(() => {
    const updateTableHeight = () => {
      const nextHeight = tableHostRef.current?.clientHeight ?? 0;
      if (nextHeight > 0) setTableScrollY(nextHeight - 86);
    };
    updateTableHeight();
    const observer = new ResizeObserver(updateTableHeight);
    if (tableHostRef.current) observer.observe(tableHostRef.current);
    window.addEventListener('resize', updateTableHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateTableHeight);
    };
  }, []);

  const fetchItems = async (
    nextPage = page,
    nextPageSize = pageSize,
    query = searchQuery,
    nextSortKey: SortKey = sortKey,
    nextSortDirection = sortDirection,
    nextColumnFilters = columnFilters,
    nextDateFilters = dateFilters,
  ) => {
    setLoading(true);
    try {
      const keyword = query.trim();
      const cleanDateFilters = Object.fromEntries(Object.entries(nextDateFilters).filter((entry): entry is [string, [string, string]] => Boolean(entry[1])));
      const path = keyword
        ? `/admin/warehouses/search?q=${encodeURIComponent(keyword)}`
        : `/admin/warehouses?${new URLSearchParams({
          page: String(nextPage),
          limit: String(nextPageSize),
          sortKey: nextSortKey,
          sortOrder: nextSortDirection,
          ...(Object.keys(nextColumnFilters).length ? { columnFilters: JSON.stringify(nextColumnFilters) } : {}),
          ...(Object.keys(cleanDateFilters).length ? { dateFilters: JSON.stringify(cleanDateFilters) } : {}),
        })}`;
      const response = await adminFetch(path);
      if (response.status === 401) return;
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || '读取仓库失败');
      const rows = Array.isArray(data?.data) ? data.data : [];
      setItems(rows);
      setTotal(keyword ? rows.length : Number(data?.pagination?.total || 0));
      setPage(nextPage);
      setPageSize(nextPageSize);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '读取仓库失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (actorScope !== 'platform') return;
    void adminFetch('/admin/logistics/options').then(async (response) => {
      if (!response.ok) return;
      const data = await response.json();
      setProviderOptions((data?.data || []).map((provider: { id: number; name: string; code?: string | null }) => ({
        value: provider.id,
        label: provider.code ? `${provider.name}（${provider.code}）` : provider.name,
      })));
    }).catch(() => undefined);
  }, [actorScope]);

  useEffect(() => {
    setSelectedRowKeys([]);
    setSearchQuery('');
    setColumnFilters({});
    setLocalColumnFilters({});
    setPage(1);
    void fetchItems(1, pageSize, '', 'created_at', 'desc', {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const openCreate = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({ is_enabled: true });
    setModalOpen(true);
  };

  const openEdit = (record: WarehouseItem) => {
    setEditingItem(record);
    form.setFieldsValue({
      recipient_name: record.recipient_name,
      contact_phone: record.contact_phone,
      address: record.address,
      logistics_provider_id: record.logistics_provider_id,
      is_enabled: !!record.is_enabled,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    let values: WarehousePayload;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const payload: WarehousePayload = {
      recipient_name: values.recipient_name.trim(),
      contact_phone: values.contact_phone.trim(),
      address: values.address.trim(),
      is_enabled: values.is_enabled,
    };
    if (actorScope === 'platform') payload.logistics_provider_id = values.logistics_provider_id;
    setSubmitting(true);
    try {
      const response = await adminFetch(editingItem ? `/admin/warehouses/${editingItem.id}` : '/admin/warehouses', {
        method: editingItem ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || '保存失败');
      messageApi.success(editingItem ? '仓库已更新' : '仓库已创建');
      setModalOpen(false);
      void fetchItems();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteIds = async (ids: number[]) => {
    const isBatch = ids.length > 1;
    const response = await adminFetch(isBatch ? '/admin/warehouses/batch-delete' : `/admin/warehouses/${ids[0]}`, {
      method: isBatch ? 'POST' : 'DELETE',
      body: isBatch ? JSON.stringify({ ids }) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      messageApi.error(data?.error || '删除失败');
      return;
    }
    messageApi.success(data?.message || '仓库已删除');
    setSelectedRowKeys([]);
    void fetchItems();
  };

  const handleColumnSearch = (key: string, value: string) => {
    const next = { ...columnFilters };
    if (!value) delete next[key];
    else next[key] = value;
    setColumnFilters(next);
    setPage(1);
    void fetchItems(1, pageSize, searchQuery, sortKey, sortDirection, next);
  };

  const renderSearchInput = (key: string, placeholder: string) => (
    <Input
      size="small"
      placeholder={`搜索 ${placeholder}`}
      value={localColumnFilters[key] !== undefined ? localColumnFilters[key] : (columnFilters[key] || '')}
      onChange={(event) => {
        setLocalColumnFilters((previous) => ({ ...previous, [key]: event.target.value }));
        if (!event.target.value) handleColumnSearch(key, '');
      }}
      onPressEnter={(event) => handleColumnSearch(key, (event.target as HTMLInputElement).value)}
      onClick={(event) => event.stopPropagation()}
      allowClear
    />
  );

  const renderSelectFilter = (key: string, options: Array<{ label: string; value: string }>) => (
    <Select
      size="small"
      value={columnFilters[key] || ''}
      onChange={(value) => handleColumnSearch(key, value)}
      onClick={(event) => event.stopPropagation()}
      style={{ width: '100%' }}
      options={[{ label: '全部', value: '' }, ...options]}
    />
  );

  const renderDateRangeInput = (key: string) => (
    <DatePicker.RangePicker
      size="small"
      onChange={(_, dateStrings) => {
        const next = { ...dateFilters, [key]: dateStrings[0] && dateStrings[1] ? [dateStrings[0], dateStrings[1]] as [string, string] : null };
        setDateFilters(next);
        setPage(1);
        void fetchItems(1, pageSize, searchQuery, sortKey, sortDirection, columnFilters, next);
      }}
      onClick={(event) => event.stopPropagation()}
      style={{ width: '100%' }}
      key={`date-picker-${key}-${dateResetKey}`}
      allowClear
    />
  );

  const resetFilters = () => {
    setColumnFilters({});
    setLocalColumnFilters({});
    setDateFilters({});
    setDateResetKey((value) => value + 1);
    setSearchQuery('');
    setSortKey('created_at');
    setSortDirection('desc');
    setSelectedRowKeys([]);
    setPage(1);
    void fetchItems(1, pageSize, '', 'created_at', 'desc', {}, {});
  };

  const visibleKeys = items.map((item) => item.id);
  const selectedVisibleCount = visibleKeys.filter((key) => selectedRowKeys.includes(key)).length;
  const allSelected = visibleKeys.length > 0 && selectedVisibleCount === visibleKeys.length;
  const indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleKeys.length;
  const sortOrderFor = (key: SortKey) => sortKey === key ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null;

  const columns: ColumnsType<WarehouseItem> = [
    {
      title: '序号', key: 'index', width: 65, fixed: 'left',
      children: [{
        title: <Checkbox checked={allSelected} indeterminate={indeterminate} onChange={(event) => setSelectedRowKeys(event.target.checked ? visibleKeys : [])} />,
        key: 'index_child', width: 65, fixed: 'left',
        render: (_, record, index) => (
          <Space size={8}>
            <Checkbox checked={selectedRowKeys.includes(record.id)} onChange={(event) => setSelectedRowKeys((previous) => event.target.checked ? [...new Set([...previous, record.id])] : previous.filter((key) => key !== record.id))} />
            <span>{(page - 1) * pageSize + index + 1}</span>
          </Space>
        ),
      }],
    },
    {
      title: '收货人名称', key: 'recipient_name', width: 150, sorter: true, sortOrder: sortOrderFor('recipient_name'),
      children: [{ title: renderSearchInput('recipient_name', '收货人名称'), key: 'recipient_name_child', width: 150, ellipsis: { showTitle: false }, render: (_, record) => <Tooltip title={record.recipient_name}><span style={{ fontWeight: 600 }}>{record.recipient_name}</span></Tooltip> }],
    },
    {
      title: '联系电话', key: 'contact_phone', width: 140, sorter: true, sortOrder: sortOrderFor('contact_phone'),
      children: [{ title: renderSearchInput('contact_phone', '联系电话'), key: 'contact_phone_child', width: 140, render: (_, record) => record.contact_phone }],
    },
    {
      title: '地址', key: 'address', width: 240,
      children: [{ title: renderSearchInput('address', '地址'), key: 'address_child', width: 240, ellipsis: { showTitle: false }, render: (_, record) => <Tooltip title={record.address}>{record.address}</Tooltip> }],
    },
    ...(actorScope === 'platform' ? [{
      title: '物流商', key: 'logistics_provider_id', width: 160, sorter: true, sortOrder: sortOrderFor('logistics_provider_id'),
      children: [{ title: renderSearchInput('logistics_provider_id', '物流商ID'), key: 'logistics_provider_id_child', width: 160, ellipsis: { showTitle: false }, render: (_: unknown, record: WarehouseItem) => <Tooltip title={record.logistics_provider_name}><Tag color="blue">{record.logistics_provider_name}</Tag></Tooltip> }],
    }] as ColumnsType<WarehouseItem> : []),
    {
      title: '是否开启', key: 'is_enabled', width: 110, sorter: true, sortOrder: sortOrderFor('is_enabled'),
      children: [{ title: renderSelectFilter('is_enabled', [{ label: '开启', value: '1' }, { label: '关闭', value: '0' }]), key: 'is_enabled_child', width: 110, render: (_, record) => record.is_enabled ? <Tag color="green">开启</Tag> : <Tag>关闭</Tag> }],
    },
    {
      title: '创建时间', key: 'created_at', width: 180, sorter: true, sortOrder: sortOrderFor('created_at'),
      children: [{ title: renderDateRangeInput('created_at'), key: 'created_at_child', width: 180, render: (_, record) => new Date(record.created_at).toLocaleString() }],
    },
    { title: '', key: 'spacer', children: [{ title: '', key: 'spacer_child', render: () => null }] },
    {
      title: '操作', key: 'actions', width: 110, fixed: 'right', align: 'center',
      children: [{
        title: <Tooltip title="重置所有搜索"><Button size="small" icon={<ReloadOutlined />} onClick={resetFilters} /></Tooltip>,
        key: 'actions_child', width: 110, fixed: 'right', align: 'center',
        render: (_, record) => (
          <Space size={2}>
            {canUpdate && <Tooltip title="编辑"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} /></Tooltip>}
            {canDelete && <Popconfirm title="确定删除该仓库？" description="删除后不可恢复。" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => void deleteIds([record.id])}><Tooltip title="删除"><Button danger type="text" size="small" icon={<DeleteOutlined />} /></Tooltip></Popconfirm>}
          </Space>
        ),
      }],
    },
  ];
  const tableColumns = constrainTableColumns(columns);
  const tableScrollX = getConstrainedTableScrollX(tableColumns);

  return (
    <Card bordered={false} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }} bodyStyle={{ padding: 0, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {messageContextHolder}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 12 }}>
        {canDelete && (
          <Popconfirm title={`确定删除选中的 ${selectedRowKeys.length} 个仓库？`} okText="删除" cancelText="取消" okButtonProps={{ danger: true }} disabled={!selectedRowKeys.length} onConfirm={() => void deleteIds(selectedRowKeys)}>
            <Button danger disabled={!selectedRowKeys.length}>批量删除{selectedRowKeys.length ? ` (${selectedRowKeys.length})` : ''}</Button>
          </Popconfirm>
        )}
        <Input.Search
          allowClear
          value={searchQuery}
          placeholder="搜索收货人、电话、地址或物流商"
          style={{ width: 420, margin: '0 auto' }}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            if (!event.target.value.trim()) void fetchItems(1, pageSize, '');
          }}
          onSearch={(value) => { setSearchQuery(value); void fetchItems(1, pageSize, value); }}
          enterButton
        />
        <Tooltip title="刷新"><Button icon={<ReloadOutlined />} onClick={() => void fetchItems()} /></Tooltip>
        {canCreate && <Button type="primary" icon={<PlusOutlined />} style={{ background: '#f58220' }} onClick={openCreate}>新增仓库</Button>}
      </div>
      <div ref={tableHostRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Table<WarehouseItem>
          rowKey="id"
          rowClassName={(record) => selectedRowKeys.includes(record.id) ? 'row-selected' : ''}
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
          onChange={(_, __, sorter) => {
            if (Array.isArray(sorter)) return;
            const nextKey = (sorter.columnKey || sorter.field) as SortKey | undefined;
            if (!nextKey || !sorter.order) {
              setSortKey('created_at');
              setSortDirection('desc');
              void fetchItems(page, pageSize, searchQuery, 'created_at', 'desc', columnFilters);
              return;
            }
            const nextDirection: SortDirection = sorter.order === 'ascend' ? 'asc' : 'desc';
            setSortKey(nextKey);
            setSortDirection(nextDirection);
            void fetchItems(page, pageSize, searchQuery, nextKey, nextDirection, columnFilters);
          }}
          locale={{ emptyText: '没有仓库记录' }}
        />
      </div>
      <div style={{ padding: '6px 16px', borderTop: '1px solid #f0f0f0', display: 'flex', flexShrink: 0 }}>
        <Pagination
          size="small"
          current={page}
          pageSize={pageSize}
          total={total}
          showSizeChanger={!searchQuery.trim()}
          pageSizeOptions={[10, 20, 30, 50, 100]}
          showQuickJumper={!searchQuery.trim()}
          disabled={!!searchQuery.trim()}
          showTotal={(count, range) => `第 ${range[0]}-${range[1]} 条 / 共 ${count} 条`}
          onChange={(nextPage, nextPageSize) => void fetchItems(nextPage, nextPageSize, searchQuery, sortKey, sortDirection, columnFilters)}
          onShowSizeChange={(_, nextPageSize) => void fetchItems(1, nextPageSize, searchQuery, sortKey, sortDirection, columnFilters)}
        />
      </div>
      <Modal title={editingItem ? '编辑仓库' : '新增仓库'} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={handleSubmit} confirmLoading={submitting} okText="保存" cancelText="取消" destroyOnHidden>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="recipient_name" label="收货人名称" rules={[{ required: true, whitespace: true, message: '请输入收货人名称' }, { max: 128 }]}>
            <Input maxLength={128} />
          </Form.Item>
          <Form.Item name="contact_phone" label="联系电话" rules={[{ required: true, whitespace: true, message: '请输入联系电话' }, { max: 32 }]}>
            <Input maxLength={32} />
          </Form.Item>
          <Form.Item name="address" label="地址" rules={[{ required: true, whitespace: true, message: '请输入地址' }, { max: 255 }]}>
            <Input.TextArea rows={3} maxLength={255} showCount />
          </Form.Item>
          {actorScope === 'platform' && (
            <Form.Item name="logistics_provider_id" label="物流商" rules={[{ required: true, message: '请选择物流商' }]}>
              <Select showSearch optionFilterProp="label" options={providerOptions} placeholder="请选择物流商" />
            </Form.Item>
          )}
          <Form.Item name="is_enabled" label="是否开启" valuePropName="checked">
            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
